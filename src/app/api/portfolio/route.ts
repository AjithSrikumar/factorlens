export const dynamic = 'force-dynamic'

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
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const allocations: { fundId: number; weight: number }[] = body.allocations

    if (!allocations || allocations.length === 0) {
      return NextResponse.json({ error: 'No allocations provided' }, { status: 400 })
    }

    // Normalise weights in case of small floating-point drift (e.g. 99.97 → 100)
    const rawTotal = allocations.reduce((sum, a) => sum + a.weight, 0)
    if (rawTotal <= 0 || Math.abs(rawTotal - 100) > 2) {
      return NextResponse.json({ error: 'Weights must sum to approximately 100' }, { status: 400 })
    }
    if (Math.abs(rawTotal - 100) > 0.01) {
      allocations.forEach(a => { a.weight = (a.weight / rawTotal) * 100 })
    }

    // Look up Nifty 50 (N50) — use limit(1) instead of .single() so it never throws
    // when there are 0 or 2+ rows (both cases make .single() return an error).
    const { data: n50Rows } = await supabase.from('funds').select('id').eq('code', 'N50').limit(1)
    const niftyId: number | null = n50Rows?.[0]?.id ?? null

      // Fetch NAV data for each fund independently in parallel.
    // A single combined .in() query with large offsets is fragile for 30k+ rows —
    // per-fund parallel fetches are faster and guarantee all rows for every fund.
    const fundIds = Array.from(new Set([
      ...allocations.map((a) => a.fundId),
      ...(niftyId !== null ? [niftyId] : []),
    ]))

    const fetchFundNav = async (id: number): Promise<{ id: number; rows: { date: string; value: number }[] }> => {
      const rows: { date: string; value: number }[] = []
      const PAGE = 2000
      for (let page = 0; ; page++) {
        const { data, error } = await supabase
          .from('nav_data')
          .select('date, nav_value')
          .eq('fund_id', id)
          .order('date', { ascending: true })
          .range(page * PAGE, (page + 1) * PAGE - 1)
        if (error || !data?.length) break
        rows.push(...data.map(r => ({ date: r.date as string, value: Number(r.nav_value) })))
        if (data.length < PAGE) break
      }
      return { id, rows }
    }

    const navResults = await Promise.all(fundIds.map(fetchFundNav))

    // Group by fund
    const navByFund = new Map<number, { date: string; value: number }[]>()
    for (const { id, rows } of navResults) {
      navByFund.set(id, rows)
    }

      // Build input for portfolio computation
      const fundNavs = allocations.map((a) => ({
        fundId: a.fundId,
        weight: a.weight,
        navSeries: navByFund.get(a.fundId) ?? [],
      }))

      // Separate funds with and without NAV data
      const missingFunds = fundNavs.filter((f) => f.navSeries.length === 0)
      let validFundNavs = fundNavs.filter((f) => f.navSeries.length > 0)

      if (validFundNavs.length === 0) {
        return NextResponse.json({ error: 'No NAV data found for any selected funds' }, { status: 400 })
      }

      // If some funds have no NAV data, redistribute their weights proportionally among valid funds
      if (missingFunds.length > 0) {
        const validTotalWeight = validFundNavs.reduce((s, f) => s + f.weight, 0)
        validFundNavs.forEach(f => { f.weight = (f.weight / validTotalWeight) * 100 })
        console.warn(`Backtest: skipping fund IDs [${missingFunds.map(f => f.fundId).join(', ')}] — no NAV data`)
      }

      // Detect stale funds: data ending more than 180 days before today.
      // This happens when a fund (e.g. GOLD) was imported only for a historical period
      // and not kept current — its NAV series cuts off years ago, which would shrink the
      // entire portfolio's common-date range to that stale window.
      const today = new Date().toISOString().slice(0, 10)
      const staleThreshold = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString().slice(0, 10)
      const staleFunds = validFundNavs.filter(f => {
        const lastDate = f.navSeries[f.navSeries.length - 1]?.date ?? ''
        return lastDate < staleThreshold
      })
      if (staleFunds.length > 0 && staleFunds.length < validFundNavs.length) {
        // Only exclude stale funds if at least one fresh fund remains
        console.warn(`Backtest: excluding stale fund IDs [${staleFunds.map(f => f.fundId).join(', ')}] — data ends before ${staleThreshold}`)
        validFundNavs = validFundNavs.filter(f => {
          const lastDate = f.navSeries[f.navSeries.length - 1]?.date ?? ''
          return lastDate >= staleThreshold
        })
        const freshTotal = validFundNavs.reduce((s, f) => s + f.weight, 0)
        validFundNavs.forEach(f => { f.weight = (f.weight / freshTotal) * 100 })
        missingFunds.push(...staleFunds)
      }

    const portfolioNav = computePortfolioNav(validFundNavs)
    const metrics = computeAllMetrics(portfolioNav)
    const drawdownSeries = computeDrawdownSeries(portfolioNav)
    const rollingReturns = computeRolling3YCAGR(portfolioNav)

    // Compute Nifty 50 metrics and NAV for comparison
    const nifty50NavRaw = niftyId !== null ? (navByFund.get(niftyId) ?? []) : []
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

    // Compute FY raw data for the detail table — use validFundNavs so missing funds are excluded
    const fyTableFunds: Record<number, FYRawRow[]> = {}
    for (const alloc of validFundNavs) {
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
      // Funds excluded from backtest due to no NAV data (e.g. not yet scraped)
      skippedFundIds: missingFunds.map(f => f.fundId),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
