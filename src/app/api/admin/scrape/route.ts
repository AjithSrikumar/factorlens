export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/scrape
 *
 * Fetches historical NAV data from niftyindices.com for all NSE indices
 * that have no data yet (or are behind) and upserts to Supabase.
 * Also computes and updates metrics (CAGR, Sharpe, etc.) for each fund.
 *
 * Protected by a simple bearer token: ADMIN_SCRAPE_SECRET env var.
 *
 * Query params:
 *   ?code=N50          — scrape a single index by code (optional)
 *   ?force=1           — re-fetch from inception even if data exists
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'
import { NSE_INDEX_LIST } from '@/lib/index-fund-map'

const NIFTY_URL = 'https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString'
const NIFTY_HEADERS = {
  'Content-Type':     'application/json; charset=utf-8',
  'Accept':           'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer':          'https://www.niftyindices.com/reports/historical-data',
  'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function isoToNiftyReq(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCDate()).padStart(2,'0')}-${MONTHS_SHORT[d.getUTCMonth()]}-${d.getUTCFullYear()}`
}

function niftyRespToIso(s: string): string {
  // '28 Feb 2026' → '2026-02-28'
  const parts = s.trim().split(' ')
  if (parts.length !== 3) return ''
  const dd = parts[0].padStart(2,'0')
  const mm = String(MONTHS_SHORT.indexOf(parts[1]) + 1).padStart(2,'0')
  return `${parts[2]}-${mm}-${dd}`
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0,10)
}

function todayISO(): string {
  return new Date().toISOString().slice(0,10)
}

async function fetchNiftyIndex(
  indexName: string, fromIso: string, toIso: string
): Promise<Array<{ date: string; value: number }>> {
  const cinfo = JSON.stringify({
    name: indexName, startDate: isoToNiftyReq(fromIso),
    endDate: isoToNiftyReq(toIso), indexName,
  })
  const body = JSON.stringify({ cinfo })

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(NIFTY_URL, {
        method: 'POST', body, headers: NIFTY_HEADERS,
        signal: AbortSignal.timeout(20_000),
      })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const outer = await resp.json() as { d?: string }
      const rows = JSON.parse(outer.d ?? '[]') as Record<string,string>[]
      const result: Array<{ date: string; value: number }> = []
      for (const row of rows) {
        const dateStr  = row['HistoricalDate'] ?? row['Date'] ?? row['date'] ?? ''
        const closeStr = row['CLOSE'] ?? row['Close'] ?? row['close'] ?? ''
        const date = niftyRespToIso(dateStr)
        const value = parseFloat(closeStr.replace(/,/g,''))
        if (date && value > 0) result.push({ date, value })
      }
      return result
    } catch (e) {
      if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * 2 ** attempt))
    }
  }
  return []
}

// ── Metric helpers ────────────────────────────────────────────────────────────

function computeCAGR(nav: Array<{ date: string; value: number }>): number {
  if (nav.length < 2) return 0
  const years = (new Date(nav.at(-1)!.date).getTime() - new Date(nav[0].date).getTime()) / (365.25 * 86400000)
  if (years <= 0) return 0
  return (nav.at(-1)!.value / nav[0].value) ** (1 / years) - 1
}

function computeVolatility(nav: Array<{ date: string; value: number }>): number {
  if (nav.length < 2) return 0
  const returns = nav.slice(1).map((r, i) => r.value / nav[i].value - 1)
  const mean = returns.reduce((s,r) => s+r, 0) / returns.length
  const variance = returns.reduce((s,r) => s + (r-mean)**2, 0) / returns.length
  return Math.sqrt(variance) * Math.sqrt(252)
}

function computeMaxDrawdown(nav: Array<{ date: string; value: number }>): number {
  let peak = nav[0].value, maxDD = 0
  for (const { value } of nav) {
    if (value > peak) peak = value
    const dd = (value - peak) / peak
    if (dd < maxDD) maxDD = dd
  }
  return maxDD
}

function computeAvg3yRolling(nav: Array<{ date: string; value: number }>): number {
  const WINDOW = 756
  if (nav.length < WINDOW) return 0
  const rolls: number[] = []
  for (let i = WINDOW; i < nav.length; i++) {
    rolls.push(((nav[i].value / nav[i - WINDOW].value) ** (1/3) - 1) * 100)
  }
  return rolls.length ? rolls.reduce((s,r) => s+r, 0) / rolls.length / 100 : 0
}

/** Compute CAGR over the last `years` years from the most recent NAV.
 *  Returns null if there is insufficient history (< 90% of the window). */
function computePeriodCAGR(nav: Array<{ date: string; value: number }>, years: number): number | null {
  if (nav.length < 2) return null
  const endDate  = new Date(nav[nav.length - 1].date)
  const endVal   = nav[nav.length - 1].value
  const msWindow = years * 365.25 * 24 * 60 * 60 * 1000
  const targetMs = endDate.getTime() - msWindow
  const cutoffMs = endDate.getTime() - msWindow * 0.90  // must reach at least 90% of window
  let best: { date: Date; value: number } | null = null
  for (const { date, value } of nav) {
    const dt = new Date(date)
    if (dt.getTime() > cutoffMs) break
    best = { date: dt, value }
  }
  if (!best) return null
  const actualYears = (endDate.getTime() - best.date.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  if (actualYears <= 0) return null
  return (endVal / best.value) ** (1 / actualYears) - 1
}

function computeMetrics(nav: Array<{ date: string; value: number }>) {
  const cagr  = computeCAGR(nav)
  const vol   = computeVolatility(nav)
  const maxDD = computeMaxDrawdown(nav)
  return {
    cagr,
    volatility:            vol,
    max_drawdown:          maxDD,
    sharpe_ratio:          vol > 0 ? cagr / vol : 0,
    calmar_ratio:          maxDD !== 0 ? cagr / Math.abs(maxDD) : 0,
    avg_3y_rolling_return: computeAvg3yRolling(nav),
    cagr_1y:               computePeriodCAGR(nav, 1),
    cagr_3y:               computePeriodCAGR(nav, 3),
    cagr_5y:               computePeriodCAGR(nav, 5),
    cagr_10y:              computePeriodCAGR(nav, 10),
    cagr_20y:              computePeriodCAGR(nav, 20),
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export const maxDuration = 300  // 5 min (Vercel Pro; hobby = 60s)

export async function POST(req: NextRequest) {
  // Auth check
  const secret = process.env.ADMIN_SCRAPE_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') ?? ''
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const filterCode = req.nextUrl.searchParams.get('code')
  const force      = req.nextUrl.searchParams.get('force') === '1'
  const today      = todayISO()

  // Step 1: ensure all indices are in the funds table
  const toUpsert = NSE_INDEX_LIST.map(idx => ({
    code: idx.code, name: idx.name,
    category: idx.category, inception_date: idx.inception,
  }))
  await supabaseAdmin.from('funds').upsert(toUpsert, { onConflict: 'code', ignoreDuplicates: true })

  // Step 2: fetch fund id map
  const { data: allFunds } = await supabaseAdmin
    .from('funds').select('id, code, inception_date')
  const codeToFund = new Map((allFunds ?? []).map(f => [f.code as string, f as { id: number; inception_date: string }]))

  // Step 3: fetch latest nav date per fund
  const { data: latestRows } = await supabaseAdmin
    .from('nav_data')
    .select('fund_id, date')
    .order('date', { ascending: false })
  const latestByFund = new Map<number, string>()
  for (const row of latestRows ?? []) {
    if (!latestByFund.has(row.fund_id as number)) {
      latestByFund.set(row.fund_id as number, (row.date as string).slice(0,10))
    }
  }

  const indices = filterCode
    ? NSE_INDEX_LIST.filter(idx => idx.code === filterCode)
    : NSE_INDEX_LIST

  const results: Array<{ code: string; status: string; rows?: number; error?: string }> = []

  for (const idx of indices) {
    const fund = codeToFund.get(idx.code)
    if (!fund) { results.push({ code: idx.code, status: 'no_db_entry' }); continue }

    const lastDate = force ? undefined : latestByFund.get(fund.id)
    const fromIso  = lastDate ? addDays(lastDate, 1) : (fund.inception_date ?? idx.inception)

    if (!force && fromIso > today) {
      results.push({ code: idx.code, status: 'up_to_date' }); continue
    }

    try {
      const rows = await fetchNiftyIndex(idx.name, fromIso, today)
      if (rows.length === 0) {
        results.push({ code: idx.code, status: 'no_data' }); continue
      }

      // Filter to only new dates
      const newRows = lastDate ? rows.filter(r => r.date > lastDate) : rows
      if (newRows.length === 0) {
        results.push({ code: idx.code, status: 'up_to_date' }); continue
      }

      // Upsert nav_data rows in batches of 500
      const navToInsert = newRows.map(r => ({ fund_id: fund.id, date: r.date, nav_value: r.value }))
      for (let i = 0; i < navToInsert.length; i += 500) {
        await supabaseAdmin.from('nav_data')
          .upsert(navToInsert.slice(i, i + 500), { onConflict: 'fund_id,date' })
      }

      // Recompute metrics using full history
      const { data: allNav } = await supabaseAdmin
        .from('nav_data')
        .select('date, nav_value')
        .eq('fund_id', fund.id)
        .order('date', { ascending: true })

      if (allNav && allNav.length >= 2) {
        const navSeries = allNav.map(r => ({ date: r.date as string, value: r.nav_value as number }))
        const metrics = computeMetrics(navSeries)
        await supabaseAdmin.from('funds').update(metrics).eq('id', fund.id)
      }

      results.push({ code: idx.code, status: 'updated', rows: newRows.length })
    } catch (e) {
      results.push({ code: idx.code, status: 'error', error: String(e) })
    }

    // Small delay to be polite to niftyindices.com
    await new Promise(r => setTimeout(r, 300))
  }

  // Step 4: recompute final_rank — only for funds with at least 10y history
  // First clear all existing ranks
  await supabaseAdmin.from('funds').update({ score: null, final_rank: null }).not('id', 'is', null)

  const { data: rankedFunds } = await supabaseAdmin
    .from('funds')
    .select('id, cagr_10y, cagr_20y, avg_3y_rolling_return, sharpe_ratio, max_drawdown')
    .not('cagr_10y', 'is', null)
    .not('avg_3y_rolling_return', 'is', null)
    .not('sharpe_ratio', 'is', null)
    .not('max_drawdown', 'is', null)

  if (rankedFunds && rankedFunds.length >= 2) {
    type Metric = {
      id: number
      cagr_10y: number; cagr_20y: number | null
      avg_3y_rolling_return: number; sharpe_ratio: number; max_drawdown: number
    }
    const funds = rankedFunds as Metric[]
    const n = funds.length

    // Percentile rank: 0 = best (higher raw value = better, sort descending)
    const rank = (arr: number[]) => {
      const sorted = [...arr].map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v)
      const ranks = new Array(n).fill(0)
      sorted.forEach(({ i }, pos) => { ranks[i] = (pos / (n - 1)) * 100 })
      return ranks
    }

    // Use 20Y CAGR if available, fall back to 10Y CAGR
    const longCagrs   = funds.map(f => f.cagr_20y ?? f.cagr_10y)
    const cagrRanks   = rank(longCagrs)
    const avg3yRanks  = rank(funds.map(f => f.avg_3y_rolling_return))
    const sharpeRanks = rank(funds.map(f => f.sharpe_ratio))
    const ddRanks     = rank(funds.map(f => f.max_drawdown))  // negative; less negative (higher) = better

    const scored = funds.map((f, i) => ({
      id:    f.id,
      score: cagrRanks[i] * 0.30 + avg3yRanks[i] * 0.25 + sharpeRanks[i] * 0.30 + ddRanks[i] * 0.15,
    }))
    scored.sort((a, b) => a.score - b.score)  // lower score = better rank
    for (let i = 0; i < scored.length; i++) {
      await supabaseAdmin.from('funds').update({ score: scored[i].score, final_rank: i + 1 }).eq('id', scored[i].id)
    }
  }

  const summary = {
    updated:    results.filter(r => r.status === 'updated').length,
    up_to_date: results.filter(r => r.status === 'up_to_date').length,
    no_data:    results.filter(r => r.status === 'no_data').length,
    errors:     results.filter(r => r.status === 'error').length,
    total:      results.length,
  }

  return NextResponse.json({ ok: true, summary, details: results })
}

// GET handler — same as POST, lets you trigger from a browser tab.
// ?code=N50 to scrape a single index; no params to run all.
export async function GET(req: NextRequest) {
  return POST(req)
}
