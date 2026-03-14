import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  computePortfolioNav,
  computeAllMetrics,
  computeDrawdownSeries,
  computeRolling3YCAGR,
  computeFYRawRows,
  type FYRawRow,
} from '@/lib/calculations'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const allocations: { fundId: number; weight: number }[] = body.allocations

    if (!allocations || allocations.length === 0) {
      return NextResponse.json({ error: 'No allocations provided' }, { status: 400 })
    }

    const totalWeight = allocations.reduce((sum, a) => sum + a.weight, 0)
    if (Math.abs(totalWeight - 100) > 0.5) {
      return NextResponse.json({ error: 'Weights must sum to 100' }, { status: 400 })
    }

    // Look up Nifty 50 (N50) by code to avoid hardcoding ID
    const { data: n50Fund } = await supabase.from('funds').select('id').eq('code', 'N50').single()
    const niftyId = n50Fund?.id ?? 1

      // Fetch NAV data for all selected funds (paginate to get all rows)
      // Supabase returns max 1000 rows per request by default
      const fundIds = Array.from(new Set([...allocations.map((a) => a.fundId), niftyId])) // Always include Nifty 50
      const PAGE = 1000
      let navRows: { fund_id: number; date: string; nav_value: number }[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('nav_data')
          .select('fund_id, date, nav_value')
          .in('fund_id', fundIds)
          .order('fund_id', { ascending: true })
          .order('date', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        if (!data || data.length === 0) break
        navRows = navRows.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }

    // Group by fund
    const navByFund = new Map<number, { date: string; value: number }[]>()
    for (const row of navRows) {
      if (!navByFund.has(row.fund_id)) navByFund.set(row.fund_id, [])
      navByFund.get(row.fund_id)!.push({ date: row.date, value: Number(row.nav_value) })
    }

      // Build input for portfolio computation
      const fundNavs = allocations.map((a) => ({
        fundId: a.fundId,
        weight: a.weight,
        navSeries: navByFund.get(a.fundId) ?? [],
      }))

      // Validate all funds have NAV data
      const missingFunds = fundNavs.filter((f) => f.navSeries.length === 0)
      if (missingFunds.length > 0) {
        return NextResponse.json({ error: `No NAV data found for fund ID(s): ${missingFunds.map(f => f.fundId).join(', ')}` }, { status: 400 })
      }

    const portfolioNav = computePortfolioNav(fundNavs)
    const metrics = computeAllMetrics(portfolioNav)
    const drawdownSeries = computeDrawdownSeries(portfolioNav)
    const rollingReturns = computeRolling3YCAGR(portfolioNav)

    // Compute Nifty 50 metrics and NAV for comparison
    const nifty50NavRaw = navByFund.get(niftyId) ?? []
    let benchmarkNav: { date: string; value: number }[] = []
    let benchmarkMetrics = null
    let benchmarkDrawdown: { date: string; value: number }[] = []
    let benchmarkRolling: { date: string; value: number }[] = []

    if (nifty50NavRaw.length > 0 && portfolioNav.length > 0) {
      const startDate = portfolioNav[0].date
      const filteredNifty = nifty50NavRaw.filter(n => n.date >= startDate)
      if (filteredNifty.length > 0) {
        const base = filteredNifty[0].value
        benchmarkNav = filteredNifty.map(n => ({ date: n.date, value: (n.value / base) * 100 }))
        benchmarkMetrics = computeAllMetrics(benchmarkNav)
        benchmarkDrawdown = computeDrawdownSeries(benchmarkNav)
        benchmarkRolling = computeRolling3YCAGR(benchmarkNav)
      }
    }

    // Compute FY raw data for the detail table (done server-side to keep response small)
    const today = new Date().toISOString().slice(0, 10)
    const fyTableFunds: Record<number, FYRawRow[]> = {}
    for (const alloc of allocations) {
      const raw = navByFund.get(alloc.fundId) ?? []
      fyTableFunds[alloc.fundId] = computeFYRawRows(raw, today)
    }
    const fyTableBenchmark = computeFYRawRows(nifty50NavRaw, today)
    // Portfolio FY rows (computed from rebased portfolio NAV)
    const fyTablePortfolio = computeFYRawRows(portfolioNav, today)

    return NextResponse.json({
      portfolioNav,
      metrics,
      drawdownSeries,
      rollingReturns,
      benchmarkNav,
      benchmarkMetrics,
      benchmarkDrawdown,
      benchmarkRolling,
      fyTableData: {
        portfolio:  fyTablePortfolio,
        funds:      fyTableFunds,
        benchmark:  fyTableBenchmark,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
