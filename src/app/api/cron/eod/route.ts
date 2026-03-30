export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  computeCAGR,
  computeVolatility,
  computeMaxDrawdown,
  computeRolling3YCAGR,
  computeSortino,
  NavPoint,
} from '@/lib/calculations'
import { NSE_INDEX_LIST } from '@/lib/index-fund-map'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
)

// ── Index definitions ────────────────────────────────────────────────────────
// Use the canonical NSE_INDEX_LIST (all equity + fixed-income indices) so the
// EOD cron fetches data for every index shown on the rankings page.

const NSE_INDICES: { code: string; indexName: string }[] =
  NSE_INDEX_LIST.map(idx => ({ code: idx.code, indexName: idx.name }))

const YAHOO_FUNDS: { code: string; symbol: string }[] = [
  { code: 'SPX',  symbol: '^GSPC' },
  { code: 'GOLD', symbol: 'GOLDBEES.NS' },
]

// ── Date helpers ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04',
  May: '05', Jun: '06', Jul: '07', Aug: '08',
  Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

function niftyDateToISO(dateStr: string): string {
  const parts = dateStr.trim().split(/\s+/)
  if (parts.length !== 3) return ''
  const [day, mon, year] = parts
  const month = MONTHS[mon]
  if (!month) return ''
  return `${year}-${month}-${day.padStart(2, '0')}`
}

function isoToNiftyReqDate(iso: string): string {
  const d = new Date(iso)
  const day  = String(d.getUTCDate()).padStart(2, '0')
  const mon  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]
  const year = d.getUTCFullYear()
  return `${day}-${mon}-${year}`
}

function todayIST(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function parseNum(s: string): number {
  return parseFloat(s.replace(/,/g, ''))
}

// ── Scrapers ─────────────────────────────────────────────────────────────────

async function fetchNiftyIndex(
  indexName: string,
  fromISO: string,
  toISO: string
): Promise<{ date: string; value: number }[]> {
  const cinfo = JSON.stringify({
    name: indexName,
    startDate: isoToNiftyReqDate(fromISO),
    endDate:   isoToNiftyReqDate(toISO),
    indexName: indexName,
  })

  const res = await fetch(
    'https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString',
    {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json; charset=utf-8',
        'Accept':           'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer':          'https://www.niftyindices.com/reports/historical-data',
        'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ cinfo }),
      signal: AbortSignal.timeout(20_000),
    }
  )

  if (!res.ok) throw new Error(`niftyindices HTTP ${res.status}`)

  const outer = await res.json() as { d: string }
  if (!outer.d) return []

  let rows: Record<string, string>[]
  try {
    rows = JSON.parse(outer.d)
  } catch {
    return []
  }

  const parsed = rows
    .map((row) => {
      const dateStr  = row['HistoricalDate'] ?? row['Date'] ?? row['date'] ?? ''
      const closeStr =
        row['CLOSE'] ?? row['Close'] ?? row['close'] ??
        row['TotalReturnsIndex'] ?? row['IndexValue'] ?? row['Value'] ??
        row['CloseValue'] ?? row['NET_ASSET_VALUE'] ?? ''
      const date  = niftyDateToISO(dateStr)
      const value = parseNum(closeStr)
      return { date, value }
    })
    .filter((r) => r.date.length === 10 && !isNaN(r.value) && r.value > 0)

  // Deduplicate by date — keep the last value for each date
  const deduped = new Map<string, number>()
  for (const r of parsed) deduped.set(r.date, r.value)
  return Array.from(deduped.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

async function fetchYahoo(
  symbol: string,
  fromISO: string,
  toISO: string
): Promise<{ date: string; value: number }[]> {
  const period1 = Math.floor(new Date(fromISO).getTime() / 1000)
  const period2 = Math.floor(new Date(addDays(toISO, 1)).getTime() / 1000)
  const encodedSymbol = encodeURIComponent(symbol)

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}` +
    `?interval=1d&period1=${period1}&period2=${period2}&events=history`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) throw new Error(`Yahoo Finance HTTP ${res.status}`)

  const json = await res.json() as {
    chart: {
      result?: Array<{
        timestamp?: number[]
        indicators?: { adjclose?: Array<{ adjclose?: number[] }>; quote?: Array<{ close?: number[] }> }
      }>
    }
  }

  const result = json?.chart?.result?.[0]
  if (!result) return []

  const timestamps = result.timestamp ?? []
  const closes =
    result.indicators?.adjclose?.[0]?.adjclose ??
    result.indicators?.quote?.[0]?.close ??
    []

  const raw = timestamps
    .map((ts, i) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      value: closes[i] ?? NaN,
    }))
    .filter((r) => !isNaN(r.value) && r.value > 0)
    .sort((a, b) => a.date.localeCompare(b.date))

  // Deduplicate by date — keep the last value for each date
  const deduped = new Map<string, number>()
  for (const r of raw) deduped.set(r.date, r.value)
  return Array.from(deduped.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

// ── Scale computation ─────────────────────────────────────────────────────────
//
// The original data.json stored normalized/rebased NAV values that are on a
// DIFFERENT scale from raw market values (niftyindices / Yahoo Finance).
// To maintain continuity, we compute a per-fund scale factor:
//
//   scale = last_db_value / raw_scraped_value_at_last_db_date
//
// We fetch an overlap window (≥14 days before last DB date) so the anchor
// date (last_db_date) is included in the scraped batch.
//
function computeScale(
  rows: { date: string; value: number }[],
  lastDbDate: string,
  lastDbValue: number
): number {
  // Find the best anchor: the most-recent scraped row whose date ≤ lastDbDate
  const candidates = rows.filter((r) => r.date <= lastDbDate)
  if (candidates.length === 0) return 1
  const anchor = candidates[candidates.length - 1] // last in sorted-ascending list
  if (!anchor || anchor.value <= 0) return 1
  return lastDbValue / anchor.value
}

// ── Metric computation ────────────────────────────────────────────────────────

/** CAGR over the last `years` years from the most-recent nav point.
 *  Returns null if history is less than 90 % of the requested window. */
function computePeriodCAGR(nav: NavPoint[], years: number): number | null {
  if (nav.length < 2) return null
  const end      = nav[nav.length - 1]
  const endMs    = new Date(end.date).getTime()
  const msWindow = years * 365.25 * 24 * 60 * 60 * 1000
  const cutoffMs = endMs - msWindow * 0.90   // need data at least 90% of window ago
  let best: { ms: number; value: number } | null = null
  for (const { date, value } of nav) {
    const dt = new Date(date).getTime()
    if (dt > cutoffMs) break
    best = { ms: dt, value }
  }
  if (!best) return null
  const actualYears = (endMs - best.ms) / (365.25 * 24 * 60 * 60 * 1000)
  if (actualYears <= 0) return null
  return Math.pow(end.value / best.value, 1 / actualYears) - 1
}

function computeMetricsFromNav(nav: NavPoint[]) {
  const cagr    = computeCAGR(nav)
  const vol     = computeVolatility(nav)
  const maxDD   = computeMaxDrawdown(nav)
  // Sharpe = (CAGR - Rf) / Volatility  (Rf = 6%, matching calculations.ts)
  const sharpe  = vol > 0 ? (cagr - 0.06) / vol : 0
  const calmar  = maxDD !== 0 ? cagr / Math.abs(maxDD) : 0
  const sortino = computeSortino(nav)
  const rolling = computeRolling3YCAGR(nav)
  const avg3y   = rolling.length > 0
    ? rolling.reduce((s, r) => s + r.value, 0) / rolling.length / 100
    : 0
  return {
    cagr, vol, maxDD, sharpe, calmar, sortino, avg3y,
    cagr_1y:  computePeriodCAGR(nav, 1),
    cagr_3y:  computePeriodCAGR(nav, 3),
    cagr_5y:  computePeriodCAGR(nav, 5),
    cagr_10y: computePeriodCAGR(nav, 10),
    cagr_20y: computePeriodCAGR(nav, 20),
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export const maxDuration = 300

export async function POST(req: NextRequest) {
  return GET(req)
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const cleanupMode   = url.searchParams.get('cleanup') === 'true'
  const cleanupAfter  = url.searchParams.get('after') ?? '2026-02-28' // delete > this date
  const recomputeAll  = url.searchParams.get('recompute_all') === 'true'

  // recompute_all is safe (read nav → write metrics, no data exposed or deleted)
  // so it is allowed without auth. All other operations require CRON_SECRET.
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (!recomputeAll && cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ?cleanup=true      →  delete all records after the cleanup date and re-scrape
  // ?recompute_all=true →  skip scraping; recompute & store metrics for every fund from its full nav history

  const today = todayIST()
  const startTime = Date.now()
  // Reserve the last 45 s for metrics + ranking; abort NSE fetching after 250 s
  const NSE_DEADLINE_MS = 250_000

  const log: string[] = [
    `[EOD scraper] started at ${new Date().toISOString()} — today IST: ${today}`,
    cleanupMode ? `[cleanup mode] deleting records after ${cleanupAfter}` : '[normal mode]',
  ]

  try {
    // ── 0. Ensure every index in NSE_INDEX_LIST exists in the DB ─────────────
    // ignoreDuplicates: true → ON CONFLICT DO NOTHING so metrics aren't reset.
    await supabase.from('funds').upsert(
      NSE_INDEX_LIST.map(idx => ({
        code:           idx.code,
        name:           idx.name,
        category:       idx.category,
        inception_date: idx.inception,
      })),
      { onConflict: 'code', ignoreDuplicates: true }
    )

    // Also ensure Yahoo-sourced funds (GOLD, SPX) exist in the DB.
    // These are NOT in NSE_INDEX_LIST but are fetched via Yahoo Finance below.
    // Without this upsert, fetchAndInsert() silently skips them.
    await supabase.from('funds').upsert([
      { code: 'GOLD', name: 'Gold ETF (GOLDBEES)',   category: 'Commodity', inception_date: '2007-03-22' },
      { code: 'SPX',  name: 'S&P 500 (^GSPC)',       category: 'Global',    inception_date: '2000-01-03' },
    ], { onConflict: 'code', ignoreDuplicates: true })

    // ── 1. Load funds ────────────────────────────────────────────────────────
    const { data: funds, error: fundsErr } = await supabase
      .from('funds')
      .select('id, code, inception_date')

    if (fundsErr || !funds) {
      return NextResponse.json({ error: 'Failed to load funds: ' + fundsErr?.message }, { status: 500 })
    }

    const codeToId        = new Map<string, number>(funds.map((f) => [f.code, f.id]))
    const codeToInception = new Map<string, string>(funds.map((f) => [f.code, (f.inception_date as string | null) ?? '2005-01-03']))
    const fundIds         = funds.map((f) => f.id)

    // ── 2. In cleanup mode: delete incorrectly-scaled records ────────────────
    if (cleanupMode) {
      const { error: delErr } = await supabase
        .from('nav_data')
        .delete()
        .in('fund_id', fundIds)
        .gt('date', cleanupAfter)

      if (delErr) {
        return NextResponse.json({ error: 'Cleanup delete failed: ' + delErr.message }, { status: 500 })
      }
      log.push(`[cleanup] deleted all nav_data records with date > ${cleanupAfter}`)
    }

    // ── 3. Get latest date AND value per fund ────────────────────────────────
    // Fetch the single latest row per fund using order + limit trick
    const { data: latestRows, error: latestErr } = await supabase
      .from('nav_data')
      .select('fund_id, date, nav_value')
      .in('fund_id', fundIds)
      .order('date', { ascending: false })

    if (latestErr) {
      return NextResponse.json({ error: 'Failed to load latest nav: ' + latestErr.message }, { status: 500 })
    }

    const latestByFund = new Map<number, { date: string; value: number }>()
    for (const row of latestRows ?? []) {
      if (!latestByFund.has(row.fund_id)) {
        latestByFund.set(row.fund_id, { date: row.date, value: Number(row.nav_value) })
      }
    }

    // Overlap window: fetch 20 calendar days before lastDbDate so it is
    // included in the scraped batch for anchor computation
    const OVERLAP_DAYS = 20

    // ── 4. Fetch + insert NSE indices (ranked funds first, inline saves) ────────
    // Ranked funds are prioritised so that even if the cron times out mid-loop,
    // the visible rankings page already has up-to-date data.
    // Data is inserted immediately after each successful fetch so partial
    // progress survives a Vercel function timeout.

    if (recomputeAll) {
      log.push('[recompute_all] skipping NAV scraping — will recompute metrics for all funds')
    }

    // Build the ordered index list: ranked funds (by final_rank ASC) first, then the rest
    const { data: rankedFunds } = await supabase
      .from('funds')
      .select('code, final_rank')
      .not('final_rank', 'is', null)
      .order('final_rank', { ascending: true })

    const rankedCodes = new Set((rankedFunds ?? []).map((f: { code: string }) => f.code))
    const rankedOrder = new Map((rankedFunds ?? []).map((f: { code: string; final_rank: number }) => [f.code, f.final_rank]))

    const orderedNSE = [...NSE_INDICES].sort((a, b) => {
      const ra = rankedOrder.get(a.code) ?? 9999
      const rb = rankedOrder.get(b.code) ?? 9999
      return ra - rb
    })

    let totalInserted = 0
    const fundsWithNewData = new Set<number>()

    // Helper: fetch data for one fund and immediately upsert into nav_data
    async function fetchAndInsert(
      code: string,
      indexName: string,
      fetcher: (from: string, to: string) => Promise<{ date: string; value: number }[]>
    ): Promise<void> {
      const fundId = codeToId.get(code)
      if (!fundId) { log.push(`[${code}] not found in DB`); return }

      const last      = latestByFund.get(fundId)
      const inception = codeToInception.get(code) ?? '2005-01-03'
      const isNew     = !last
      const fromISO   = isNew ? inception : addDays(last.date, -OVERLAP_DAYS)
      const newAfter  = isNew ? ''        : last.date

      if (!isNew && addDays(last.date, 1) > today) {
        log.push(`[${code}] up to date`)
        return
      }

      try {
        const rawRows = await fetcher(fromISO, today)
        if (rawRows.length === 0) {
          log.push(`[${code}] WARNING: API returned 0 rows for ${fromISO}→${today} (name="${indexName}")`)
          return
        }
        const scale   = isNew ? 1 : computeScale(rawRows, last!.date, last!.value)
        const rows    = rawRows
          .filter((r) => r.date > newAfter)
          .map((r)   => ({ date: r.date, value: r.value * scale }))

        if (rows.length === 0) { log.push(`[${code}] no new rows after filter`); return }

        const records = rows.map((r) => ({ fund_id: fundId, date: r.date, nav_value: r.value }))
        const minDate = records[0].date
        const maxDate = records[records.length - 1].date

        // Delete any overlapping rows then insert fresh
        await supabase.from('nav_data').delete()
          .eq('fund_id', fundId).gte('date', minDate).lte('date', maxDate)

        const { error: insertErr } = await supabase.from('nav_data').insert(records)
        if (insertErr) {
          log.push(`[${code}] insert error: ${insertErr.message}`)
        } else {
          if (isNew) log.push(`[${code}] BACKFILL ${inception}→${maxDate}: ${rows.length} rows`)
          else       log.push(`[${code}] +${rows.length} rows → ${maxDate}`)
          totalInserted += rows.length
          fundsWithNewData.add(fundId)
          // Update latestByFund so Yahoo/subsequent calls see fresh value
          latestByFund.set(fundId, { date: maxDate, value: rows[rows.length - 1].value })
        }
      } catch (e) {
        log.push(`[${code}] ERROR: ${String(e)}`)
      }
    }

    for (const { code, indexName } of recomputeAll ? [] : orderedNSE) {
      // Time-budget guard: stop fetching if we're approaching the deadline
      if (Date.now() - startTime > NSE_DEADLINE_MS) {
        log.push(`[EOD] time budget reached after ${Math.round((Date.now() - startTime) / 1000)}s — stopping NSE fetch loop`)
        break
      }
      await fetchAndInsert(code, indexName, (from, to) => fetchNiftyIndex(indexName, from, to))
      await new Promise((r) => setTimeout(r, 150))
    }

    // ── 5. Fetch + insert Yahoo Finance (SPX, GOLD) ──────────────────────────
    for (const { code, symbol } of recomputeAll ? [] : YAHOO_FUNDS) {
      await fetchAndInsert(code, symbol, (from, to) => fetchYahoo(symbol, from, to))
    }

    // ── 7. Recompute metrics for ALL funds every run ──────────────────────────
    // Always recompute all funds (not just those with new data) so that:
    //   - Metrics always reflect the latest available NAV data
    //   - Any fund that missed a data fetch has its metrics kept current
    //   - Formula changes propagate immediately across the board
    let metricsUpdated = 0

    if (recomputeAll) {
      log.push('[recompute_all] recomputing metrics for all funds from nav history…')
    }

    // Skip metrics + ranking if we've already used most of our time budget
    const timeUsedMs = Date.now() - startTime
    if (timeUsedMs > 270_000) {
      log.push(`[EOD] skipping metrics/ranking — only ${Math.round((300_000 - timeUsedMs) / 1000)}s left`)
      log.push(`\nDone — ${totalInserted} new rows, metrics skipped (time budget)`)
      return NextResponse.json({ ok: true, log })
    }

    if (true) {  // always recompute all funds on every run
      const updatedFundIds = fundIds  // always use all fund IDs
      const PAGE = 1000
      let navRows: { fund_id: number; date: string; nav_value: number }[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('nav_data')
          .select('fund_id, date, nav_value')
          .in('fund_id', updatedFundIds)
          .order('date', { ascending: true })
          .range(from, from + PAGE - 1)
        if (error || !data || data.length === 0) break
        navRows = navRows.concat(data)
        if (data.length < PAGE) break
        from += PAGE
      }

      const navByFund = new Map<number, NavPoint[]>()
      for (const row of navRows) {
        if (!navByFund.has(row.fund_id)) navByFund.set(row.fund_id, [])
        navByFund.get(row.fund_id)!.push({ date: row.date, value: Number(row.nav_value) })
      }

      for (const fundId of updatedFundIds) {
        const nav = navByFund.get(fundId)
        if (!nav || nav.length < 2) continue

        const { cagr, vol, maxDD, sharpe, calmar, avg3y, cagr_1y, cagr_3y, cagr_5y, cagr_10y, cagr_20y } = computeMetricsFromNav(nav)

        const { error: updateErr } = await supabase
          .from('funds')
          .update({
            cagr,
            volatility: vol,
            max_drawdown: maxDD,
            sharpe_ratio: sharpe,
            calmar_ratio: calmar,
            avg_3y_rolling_return: avg3y,
            cagr_1y,
            cagr_3y,
            cagr_5y,
            cagr_10y,
            cagr_20y,
          })
          .eq('id', fundId)

        if (updateErr) {
          log.push(`[metrics] fund ${fundId}: ${updateErr.message}`)
        } else {
          metricsUpdated++
        }
      }
    }

    // ── 8. Recompute final_rank for all funds with ≥10Y history ──────────────
    // Weighted composite: 30% long CAGR, 25% avg 3Y rolling, 30% Sharpe, 15% max-DD.
    // NOTE: do NOT clear all ranks first — if the function is killed mid-step
    // that would leave the rankings table empty. Instead compute new ranks and
    // overwrite only the updated rows; unranked funds keep their old rank until
    // they have enough history.
    const { data: rankableFunds } = await supabase
      .from('funds')
      .select('id, cagr_10y, cagr_20y, avg_3y_rolling_return, sharpe_ratio, max_drawdown')
      .not('cagr_10y', 'is', null)
      .not('avg_3y_rolling_return', 'is', null)
      .not('sharpe_ratio', 'is', null)
      .not('max_drawdown', 'is', null)

    if (rankableFunds && rankableFunds.length >= 2) {
      type RankRow = {
        id: number
        cagr_10y: number; cagr_20y: number | null
        avg_3y_rolling_return: number; sharpe_ratio: number; max_drawdown: number
      }
      const rf = rankableFunds as RankRow[]
      const n  = rf.length

      // Percentile rank within the group: 0 = best (higher raw value = better)
      const pctRank = (arr: number[]) => {
        const sorted = arr.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v)
        const ranks  = new Array(n).fill(0)
        sorted.forEach(({ i }, pos) => { ranks[i] = (pos / (n - 1)) * 100 })
        return ranks
      }

      const longCagrs   = rf.map(f => f.cagr_20y ?? f.cagr_10y)
      const cagrRanks   = pctRank(longCagrs)
      const avg3yRanks  = pctRank(rf.map(f => f.avg_3y_rolling_return))
      const sharpeRanks = pctRank(rf.map(f => f.sharpe_ratio))
      // max_drawdown is negative; less negative = better = higher pctRank
      const ddRanks     = pctRank(rf.map(f => f.max_drawdown))

      const scored = rf.map((f, i) => ({
        id:    f.id,
        score: cagrRanks[i] * 0.30 + avg3yRanks[i] * 0.25 + sharpeRanks[i] * 0.30 + ddRanks[i] * 0.15,
      }))
      scored.sort((a, b) => a.score - b.score)  // lower score = better rank

      for (let i = 0; i < scored.length; i++) {
        await supabase
          .from('funds')
          .update({ score: scored[i].score, final_rank: i + 1 })
          .eq('id', scored[i].id)
      }
      log.push(`[ranking] assigned final_rank to ${scored.length} funds`)
    } else {
      log.push(`[ranking] not enough rankable funds (${rankableFunds?.length ?? 0}) — skipped`)
    }

    log.push(`\nDone — ${totalInserted} new rows, ${metricsUpdated} fund metrics updated`)
    return NextResponse.json({ ok: true, log })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`FATAL: ${msg}`)
    return NextResponse.json({ ok: false, error: msg, log }, { status: 500 })
  }
}
