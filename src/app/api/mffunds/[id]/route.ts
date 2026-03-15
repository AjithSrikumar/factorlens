import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Service role needed to bypass RLS on mf_funds / mf_nav_data
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function dateMinusYears(isoDate: string, years: number): string {
  const d = new Date(isoDate)
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function cagrPct(navStart: number, navEnd: number, years: number): number | null {
  if (!navStart || !navEnd || navStart <= 0) return null
  return (Math.pow(navEnd / navStart, 1 / years) - 1) * 100
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const schemeCode = parseInt(id, 10)

  if (isNaN(schemeCode)) {
    return NextResponse.json({ error: 'Invalid scheme code' }, { status: 400 })
  }

  // 1. Fund metadata
  const { data: fund, error: fundErr } = await supabase
    .from('mf_funds')
    .select('scheme_code, scheme_name, fund_house, scheme_type, scheme_category')
    .eq('scheme_code', schemeCode)
    .single()

  if (fundErr || !fund) {
    return NextResponse.json({ error: 'Fund not found' }, { status: 404 })
  }

  // 2. Full NAV history ordered ascending for chart (paginated — Supabase caps at 1000/page)
  const history: Array<{ date: string; nav: number }> = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data: batch, error: navErr } = await supabase
      .from('mf_nav_data')
      .select('date, nav')
      .eq('scheme_code', schemeCode)
      .order('date', { ascending: true })
      .range(from, from + PAGE - 1)

    if (navErr) return NextResponse.json({ error: navErr.message }, { status: 500 })
    if (!batch?.length) break
    for (const r of batch) history.push({ date: r.date, nav: Number(r.nav) })
    if (batch.length < PAGE) break
    from += PAGE
  }

  if (history.length === 0) {
    return NextResponse.json({ fund, nav_history: [], metrics: null })
  }

  const latestNav = history[history.length - 1].nav
  const latestDate = history[history.length - 1].date
  const inceptionDate = history[0].date
  const inceptionNav = history[0].nav

  // 3. Compute metrics
  // Returns at 1y, 3y, 5y
  function findNavAround(targetDate: string) {
    let closest: { date: string; nav: number } | null = null
    let minDiff = Infinity
    for (const row of history) {
      const diff = Math.abs(new Date(row.date).getTime() - new Date(targetDate).getTime())
      if (diff < minDiff) { minDiff = diff; closest = row }
    }
    return closest
  }

  const target1y = dateMinusYears(latestDate, 1)
  const target3y = dateMinusYears(latestDate, 3)
  const target5y = dateMinusYears(latestDate, 5)

  const nav1y = findNavAround(target1y)
  const nav3y = findNavAround(target3y)
  const nav5y = findNavAround(target5y)

  const return_1y = nav1y ? cagrPct(nav1y.nav, latestNav, 1) : null
  const return_3y = nav3y ? cagrPct(nav3y.nav, latestNav, 3) : null
  const return_5y = nav5y ? cagrPct(nav5y.nav, latestNav, 5) : null

  // Years since inception
  const yearsTotal = (new Date(latestDate).getTime() - new Date(inceptionDate).getTime()) / (365.25 * 24 * 3600 * 1000)
  const cagr_inception = yearsTotal >= 0.5 ? cagrPct(inceptionNav, latestNav, yearsTotal) : null
  const total_return = ((latestNav - inceptionNav) / inceptionNav) * 100

  // Volatility & max drawdown from daily returns
  const dailyReturns: number[] = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].nav
    const curr = history[i].nav
    if (prev > 0) dailyReturns.push((curr - prev) / prev)
  }

  let volatility: number | null = null
  if (dailyReturns.length > 30) {
    const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
    const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyReturns.length
    volatility = Math.sqrt(variance) * Math.sqrt(252) * 100 // annualised %
  }

  let maxDrawdown: number | null = null
  let peak = history[0].nav
  let maxDD = 0
  for (const row of history) {
    if (row.nav > peak) peak = row.nav
    const dd = (row.nav - peak) / peak
    if (dd < maxDD) maxDD = dd
  }
  if (history.length > 30) maxDrawdown = maxDD * 100

  // Sharpe (assumes 6% risk-free)
  let sharpe: number | null = null
  if (volatility !== null && cagr_inception !== null) {
    sharpe = (cagr_inception - 6) / volatility
  }

  return NextResponse.json({
    fund: {
      ...fund,
      nav: latestNav,
      nav_date: latestDate,
      inception_date: inceptionDate,
    },
    metrics: {
      cagr_inception,
      total_return,
      return_1y,
      return_3y,
      return_5y,
      volatility,
      max_drawdown: maxDrawdown,
      sharpe,
    },
    nav_history: history,
  })
}
