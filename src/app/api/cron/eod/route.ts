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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Index definitions ────────────────────────────────────────────────────────

const NSE_INDICES: { code: string; indexName: string }[] = [
  { code: 'N50',          indexName: 'NIFTY 50' },
  { code: 'NN50',         indexName: 'NIFTY NEXT 50' },
  { code: 'N500',         indexName: 'NIFTY 500' },
  { code: 'NMC150',       indexName: 'NIFTY MIDCAP 150' },
  { code: 'NSC250',       indexName: 'NIFTY SMALLCAP 250' },
  { code: 'NSC500',       indexName: 'NIFTY SMALLCAP 500' },
  { code: 'NμC250',       indexName: 'NIFTY MICROCAP 250' },
  { code: 'NTM',          indexName: 'NIFTY TOTAL MARKET' },
  { code: 'MC150M50',     indexName: 'NIFTY MIDCAP150 MOMENTUM 50' },
  { code: 'N500M50',      indexName: 'NIFTY500 MOMENTUM 50' },
  { code: 'N200M30',      indexName: 'NIFTY200 MOMENTUM 30' },
  { code: 'NTMMQ50',      indexName: 'NIFTY TOTAL MARKET MOMENTUM QUALITY 50' },
  { code: 'MC150Q50',     indexName: 'NIFTY MIDCAP150 QUALITY 50' },
  { code: 'N500Q50',      indexName: 'NIFTY500 QUALITY 50' },
  { code: 'N200Q30',      indexName: 'NIFTY200 QUALITY 30' },
  { code: 'N100Q30',      indexName: 'NIFTY100 QUALITY 30' },
  { code: 'SC250Q50',     indexName: 'NIFTY SMALLCAP250 QUALITY 50' },
  { code: 'N100LV30',     indexName: 'NIFTY100 LOW VOLATILITY 30' },
  { code: 'N500LV50',     indexName: 'NIFTY500 LOW VOLATILITY 50' },
  { code: 'N100A30',      indexName: 'NIFTY100 ALPHA 30' },
  { code: 'N200A30',      indexName: 'NIFTY200 ALPHA 30' },
  { code: 'N500V50',      indexName: 'NIFTY500 VALUE 50' },
  { code: 'MMS400MQ100',  indexName: 'NIFTY MIDSMALLCAP400 MOMENTUM QUALITY 100' },
  { code: 'SC250MQ100',   indexName: 'NIFTY SMALLCAP250 MOMENTUM QUALITY 100' },
  { code: 'N500MCQ50',    indexName: 'NIFTY500 MULTICAP MOMENTUM QUALITY 50' },
  { code: 'N500MF50',     indexName: 'NIFTY500 MULTIFACTOR MQVLV 50' },
]

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
      const closeStr = row['CLOSE'] ?? row['Close'] ?? row['close'] ?? ''
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
  return { cagr, vol, maxDD, sharpe, calmar, sortino, avg3y }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export const maxDuration = 300

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
  const log: string[] = [
    `[EOD scraper] started at ${new Date().toISOString()} — today IST: ${today}`,
    cleanupMode ? `[cleanup mode] deleting records after ${cleanupAfter}` : '[normal mode]',
  ]

  try {
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

    // ── 3b. Detect funds bootstrapped with stale DEFAULT_LAST date ────────────
    // Previously the code used a hardcoded DEFAULT_LAST = { date: '2026-02-27' }
    // for funds with no DB data, causing them to only get ~3 weeks of history.
    // Detect such funds: have data but their latest date is suspiciously close to
    // the old DEFAULT_LAST date AND their inception was years before that.
    // These need a full re-scrape from inception.
    const BOOTSTRAP_SENTINEL = '2026-02-27'           // the old DEFAULT_LAST date
    const BOOTSTRAP_WINDOW_DAYS = 45                  // ±45d around sentinel date
    const bootstrapCutoffLow  = addDays(BOOTSTRAP_SENTINEL, -BOOTSTRAP_WINDOW_DAYS)
    const bootstrapCutoffHigh = addDays(BOOTSTRAP_SENTINEL, +BOOTSTRAP_WINDOW_DAYS)

    const fundsNeedingBackfill = new Set<number>()
    for (const { code, indexName: _idx } of NSE_INDICES) {
      const fundId    = codeToId.get(code)
      const inception = codeToInception.get(code) ?? '2005-01-03'
      if (!fundId) continue
      const last = latestByFund.get(fundId)
      if (!last) continue   // no data → handled below by inception logic
      // Bootstrap pattern: latest date is within the sentinel window BUT inception was much earlier
      const inceptionYearsAgo = (new Date(today).getTime() - new Date(inception).getTime()) / (365.25 * 86400e3)
      if (
        last.date >= bootstrapCutoffLow &&
        last.date <= bootstrapCutoffHigh &&
        inceptionYearsAgo > 2   // inception was >2 years ago — shouldn't have just 3 weeks of data
      ) {
        fundsNeedingBackfill.add(fundId)
        log.push(`[${code}] BACKFILL: detected DEFAULT_LAST bootstrap (latest=${last.date}, inception=${inception}) — clearing and re-scraping from inception`)
      }
    }

    // Clear corrupted data for funds needing backfill
    if (fundsNeedingBackfill.size > 0) {
      for (const fundId of fundsNeedingBackfill) {
        await supabase.from('nav_data').delete().eq('fund_id', fundId)
      }
      // Re-build latestByFund: remove cleared funds so they're treated as brand-new
      for (const fundId of fundsNeedingBackfill) {
        latestByFund.delete(fundId)
      }
    }

    // ── 4. Fetch NSE indices sequentially (avoid rate limiting) ──────────────
    // Skipped in recompute_all mode (no new data needed, only metrics refresh).
    const nseResults: Array<{
      code: string; fundId?: number
      rows: { date: string; value: number }[]
      error: string | null; skipped?: boolean
    }> = []

    if (recomputeAll) {
      log.push('[recompute_all] skipping NAV scraping — will recompute metrics for all funds')
    }

    for (const { code, indexName } of recomputeAll ? [] : NSE_INDICES) {
      const fundId = codeToId.get(code)
      if (!fundId) { nseResults.push({ code, rows: [], error: 'Fund not found in DB' }); continue }

      const last      = latestByFund.get(fundId)   // undefined if new or just-cleared
      const inception = codeToInception.get(code) ?? '2005-01-03'

      // New fund (no data): fetch full history from inception date, scale = 1
      // Existing fund: fetch with overlap window for anchor, scale for continuity
      const isNew    = !last
      const fromISO  = isNew ? inception : addDays(last.date, -OVERLAP_DAYS)
      const newAfter = isNew ? ''         : last.date  // '' means accept all dates

      if (!isNew && addDays(last.date, 1) > today) {
        nseResults.push({ code, rows: [], error: null, skipped: true })
        continue
      }

      try {
        const rawRows = await fetchNiftyIndex(indexName, fromISO, today)
        // For new funds, scale = 1 (store raw index values); otherwise normalise for continuity
        const scale = isNew ? 1 : computeScale(rawRows, last!.date, last!.value)
        const rows  = rawRows
          .filter((r) => r.date > newAfter)
          .map((r)   => ({ date: r.date, value: r.value * scale }))
        // Debug: log raw count to help diagnose empty results
        if (rawRows.length === 0) {
          log.push(`[${code}] WARNING: API returned 0 rows for range ${fromISO}→${today} (indexName="${indexName}")`)
        } else if (isNew) {
          log.push(`[${code}] BACKFILL from ${inception}: ${rawRows.length} raw rows, inserting ${rows.length}`)
        }
        nseResults.push({ code, fundId, rows, error: null })
      } catch (e) {
        nseResults.push({ code, fundId, rows: [], error: String(e) })
      }

      await new Promise((r) => setTimeout(r, 350))
    }

    // ── 5. Fetch Yahoo Finance (SPX, GOLD) ───────────────────────────────────
    const yahooResults = await Promise.all(
      (recomputeAll ? [] : YAHOO_FUNDS).map(async ({ code, symbol }) => {
        const fundId = codeToId.get(code)
        if (!fundId) return { code, rows: [] as { date: string; value: number }[], error: 'Fund not found in DB' }

        const last      = latestByFund.get(fundId)
        const inception = codeToInception.get(code) ?? '2007-01-01'  // sensible Yahoo fallback
        const isNew     = !last
        const fromISO   = isNew ? inception : addDays(last.date, -OVERLAP_DAYS)
        const newAfter  = isNew ? ''        : last.date

        if (!isNew && addDays(last.date, 1) > today) {
          return { code, rows: [] as { date: string; value: number }[], error: null, skipped: true }
        }

        try {
          const rawRows = await fetchYahoo(symbol, fromISO, today)
          const scale   = isNew ? 1 : computeScale(rawRows, last!.date, last!.value)
          const rows    = rawRows
            .filter((r) => r.date > newAfter)
            .map((r)   => ({ date: r.date, value: r.value * scale }))
          return { code, fundId, rows, error: null }
        } catch (e) {
          return { code, fundId, rows: [] as { date: string; value: number }[], error: String(e) }
        }
      })
    )

    const allResults = [...nseResults, ...yahooResults]

    // ── 6. Insert new rows ───────────────────────────────────────────────────
    let totalInserted = 0
    const fundsWithNewData = new Set<number>()

    for (const result of allResults) {
      if ('skipped' in result && result.skipped) {
        log.push(`[${result.code}] up to date`)
        continue
      }
      if (result.error) {
        log.push(`[${result.code}] ERROR: ${result.error}`)
        continue
      }
      if (!result.rows.length) {
        log.push(`[${result.code}] no new data`)
        continue
      }

      const fundId  = (result as { fundId: number }).fundId
      const records = result.rows.map((r) => ({
        fund_id:   fundId,
        date:      r.date,
        nav_value: r.value,
      }))

      // Delete any existing rows for this date range before inserting
      const minDate = records[0].date
      const maxDate = records[records.length - 1].date
      await supabase
        .from('nav_data')
        .delete()
        .eq('fund_id', fundId)
        .gte('date', minDate)
        .lte('date', maxDate)

      const { error: insertErr } = await supabase
        .from('nav_data')
        .insert(records)

      if (insertErr) {
        log.push(`[${result.code}] insert error: ${insertErr.message}`)
      } else {
        const latestInserted = records[records.length - 1].date
        log.push(`[${result.code}] inserted ${records.length} rows → ${latestInserted} (scale=${(result.rows[0].value / ((allResults.find(r => r.code === result.code) as any)?.rows?.[0]?.value || 1)).toFixed(4)})`)
        totalInserted += records.length
        fundsWithNewData.add(fundId)
      }
    }

    // ── 7. Recompute metrics for updated funds (or all funds if recompute_all) ─
    let metricsUpdated = 0

    // recompute_all=true: re-derive every fund's metrics from nav_data so that
    // formula changes (e.g. Sharpe RF correction) take effect across the board.
    if (recomputeAll) {
      log.push('[recompute_all] recomputing metrics for all funds from nav history…')
    }

    if (recomputeAll || fundsWithNewData.size > 0) {
      const updatedFundIds = recomputeAll ? fundIds : Array.from(fundsWithNewData)
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

        const { cagr, vol, maxDD, sharpe, calmar, avg3y } = computeMetricsFromNav(nav)

        const { error: updateErr } = await supabase
          .from('funds')
          .update({
            cagr,
            volatility: vol,
            max_drawdown: maxDD,
            sharpe_ratio: sharpe,
            calmar_ratio: calmar,
            avg_3y_rolling_return: avg3y,
          })
          .eq('id', fundId)

        if (updateErr) {
          log.push(`[metrics] fund ${fundId}: ${updateErr.message}`)
        } else {
          metricsUpdated++
        }
      }
    }

    log.push(`\nDone — ${totalInserted} new rows, ${metricsUpdated} fund metrics updated`)
    return NextResponse.json({ ok: true, log })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`FATAL: ${msg}`)
    return NextResponse.json({ ok: false, error: msg, log }, { status: 500 })
  }
}
