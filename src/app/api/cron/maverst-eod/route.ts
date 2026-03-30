export const dynamic = 'force-dynamic'

/**
 * /api/cron/maverst-eod
 *
 * Daily regime computation for MAVERST.
 * Called at 18:30 IST (13:00 UTC) after market close.
 *
 * ?backfill=true      — full historical backfill from 2010 + NAV data for MAVERST codes
 * ?nav-backfill=true  — only backfill NAV data (NMC150, N100EW, N100, NHBETA50, NLV50, MC150M50, GOLD)
 * ?date=YYYY-MM-DD    — override the target date (for testing)
 *
 * Steps:
 *  1. [If backfill] Ensure MAVERST NAV funds exist in DB and backfill their NAV data
 *  2. Fetch external data (India VIX, USD/INR, FII) and store in maverst_external_data
 *  3. Load nav_data for all MAVERST indicator codes
 *  4. Compute z-score history for all dates (backfill) or just today (daily)
 *  5. Upsert results into maverst_regime_scores
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  fetchNavData,
  fetchExternalData,
  computeRawIndicatorsAtIdx,
  computeRollingZScores,
  computeScore,
  classifyRegime,
  computeConfidence,
  getAllocation,
  MAVERST_NAV_CODES,
} from '@/lib/maverst-engine'
import { NSE_INDEX_LIST } from '@/lib/index-fund-map'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
)

// ── Date helpers ──────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}
const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function niftyDateToISO(s: string): string {
  const parts = s.trim().split(/\s+/)
  if (parts.length !== 3) return ''
  const [day, mon, year] = parts
  const month = MONTHS[mon]
  if (!month) return ''
  return `${year}-${month}-${day.padStart(2, '0')}`
}

function isoToNiftyDate(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getUTCDate()).padStart(2, '0')
  const mon = MON_NAMES[d.getUTCMonth()]
  return `${day}-${mon}-${d.getUTCFullYear()}`
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ── External data fetchers ────────────────────────────────────────────────────

/** Fetch USD/INR historical data from Yahoo Finance (USDINR=X). */
async function fetchUSDINR(fromISO: string, toISO: string): Promise<{ date: string; value: number }[]> {
  const period1 = Math.floor(new Date(fromISO).getTime() / 1000)
  const period2 = Math.floor(new Date(toISO).getTime() / 1000) + 86400

  // Try both Yahoo Finance hostnames (query1 and query2 alternate as mirrors)
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/USDINR%3DX?interval=1d&period1=${period1}&period2=${period2}`,
    `https://query2.finance.yahoo.com/v8/finance/chart/USDINR%3DX?interval=1d&period1=${period1}&period2=${period2}`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json,text/plain,*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://finance.yahoo.com/',
          'Origin': 'https://finance.yahoo.com',
        },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) continue

      const json = await res.json() as {
        chart: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: number[] }> } }> }
      }
      const result = json?.chart?.result?.[0]
      if (!result) continue

      const timestamps = result.timestamp ?? []
      const closes     = result.indicators?.quote?.[0]?.close ?? []
      const rows = timestamps
        .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), value: closes[i] ?? NaN }))
        .filter(r => !isNaN(r.value) && r.value > 0)

      if (rows.length > 0) return rows
    } catch {
      // try next URL
    }
  }
  return []
}

/** Fetch India VIX from niftyindices.com. */
async function fetchIndiaVIX(fromISO: string, toISO: string): Promise<{ date: string; value: number }[]> {
  // niftyindices.com uses "INDIA VIX" as the index name for the VIX series
  const indexNames = ['INDIA VIX', 'India VIX']

  for (const indexName of indexNames) {
    const cinfo = JSON.stringify({
      name: indexName, startDate: isoToNiftyDate(fromISO), endDate: isoToNiftyDate(toISO), indexName,
    })
    try {
      const res = await fetch(
        'https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://www.niftyindices.com/reports/historical-data',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          body: JSON.stringify({ cinfo }),
          signal: AbortSignal.timeout(25_000),
        }
      )
      if (!res.ok) continue
      const outer = await res.json() as { d: string }
      if (!outer.d) continue

      let rows: Record<string, string>[]
      try { rows = JSON.parse(outer.d) } catch { continue }
      if (!Array.isArray(rows) || rows.length === 0) continue

      const parsed = rows.map(row => {
        const dateStr  = row['HistoricalDate'] ?? row['Date'] ?? row['date'] ?? ''
        // VIX uses 'CLOSE' or 'Close' or 'IndexValue'
        const closeStr = row['CLOSE'] ?? row['Close'] ?? row['close'] ?? row['IndexValue'] ?? row['Value'] ?? ''
        const date  = niftyDateToISO(dateStr)
        const value = parseFloat(closeStr.replace(/,/g, ''))
        return { date, value }
      }).filter(r => r.date.length === 10 && !isNaN(r.value) && r.value > 0)

      if (parsed.length > 0) return parsed
    } catch {
      // try next name
    }
  }
  return []
}

/** Fetch FII net equity flows from NSE India (in ₹ crore). */
async function fetchFIIFlows(fromISO: string, toISO: string): Promise<{ date: string; value: number }[]> {
  function toNSEDate(iso: string): string {
    const d = new Date(iso)
    const day = String(d.getUTCDate()).padStart(2, '0')
    const mon = MON_NAMES[d.getUTCMonth()]
    return `${day}-${mon}-${d.getUTCFullYear()}`
  }
  function fromNSEDate(s: string): string {
    const parts = s.trim().split('-')
    if (parts.length !== 3) return ''
    const [day, mon, year] = parts
    const month = MONTHS[mon]
    if (!month) return ''
    return `${year}-${month}-${day.padStart(2, '0')}`
  }
  function parseNum(s: string): number {
    return parseFloat(String(s).replace(/,/g, ''))
  }

  try {
    // NSE India requires a session cookie — fetch the market-data page first
    const cookieRes = await fetch('https://www.nseindia.com/market-data/fii-dii-activity', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!cookieRes.ok) return []

    // Extract Set-Cookie headers
    const rawCookies = (cookieRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? cookieRes.headers.get('set-cookie')?.split(/,(?=[^;]+=[^;]+)/) ?? []
    const cookies = rawCookies.map((c: string) => c.split(';')[0].trim()).filter(Boolean).join('; ')
    if (!cookies) return []

    // Fetch FII historical data
    const url = `https://www.nseindia.com/api/historicalFiiDii?instrumentType=EQ&category=FII&startDate=${toNSEDate(fromISO)}&endDate=${toNSEDate(toISO)}`
    const dataRes = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.nseindia.com/market-data/fii-dii-activity',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!dataRes.ok) return []

    const json = await dataRes.json() as unknown
    const rows: Record<string, string>[] = Array.isArray(json)
      ? json as Record<string, string>[]
      : ((json as { data?: Record<string, string>[] })?.data ?? [])

    return rows
      .map(row => {
        const dateStr = row['Date'] ?? row['date'] ?? ''
        const netStr  = row['Net Purchase/ Sales'] ?? row['Net Purchase/Sales'] ?? row['netValue'] ?? row['Net'] ?? ''
        const date    = fromNSEDate(dateStr)
        const value   = parseNum(netStr)
        return { date, value }
      })
      .filter(r => r.date.length === 10 && !isNaN(r.value))
  } catch {
    return []
  }
}

// ── NAV scraper for MAVERST indices ──────────────────────────────────────────

/** Fetch NSE index NAV from niftyindices.com. */
async function fetchNiftyIndexNav(
  indexName: string,
  fromISO: string,
  toISO: string
): Promise<{ date: string; value: number }[]> {
  const cinfo = JSON.stringify({
    name: indexName, startDate: isoToNiftyDate(fromISO), endDate: isoToNiftyDate(toISO), indexName,
  })
  try {
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
        signal: AbortSignal.timeout(25_000),
      }
    )
    if (!res.ok) return []
    const outer = await res.json() as { d: string }
    if (!outer.d) return []
    let rows: Record<string, string>[]
    try { rows = JSON.parse(outer.d) } catch { return [] }
    const parsed = rows.map(row => {
      const dateStr  = row['HistoricalDate'] ?? row['Date'] ?? row['date'] ?? ''
      const closeStr = row['CLOSE'] ?? row['Close'] ?? row['close'] ??
        row['TotalReturnsIndex'] ?? row['IndexValue'] ?? row['Value'] ?? row['CloseValue'] ?? ''
      const date  = niftyDateToISO(dateStr)
      const value = parseFloat(closeStr.replace(/,/g, ''))
      return { date, value }
    }).filter(r => r.date.length === 10 && !isNaN(r.value) && r.value > 0)
    const deduped = new Map<string, number>()
    for (const r of parsed) deduped.set(r.date, r.value)
    return Array.from(deduped.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

/** Fetch Gold ETF (GOLDBEES) NAV from Yahoo Finance. */
async function fetchGoldNav(fromISO: string, toISO: string): Promise<{ date: string; value: number }[]> {
  const period1 = Math.floor(new Date(fromISO).getTime() / 1000)
  const period2 = Math.floor(new Date(addDays(toISO, 1)).getTime() / 1000)

  for (const host of ['query1', 'query2']) {
    try {
      const url = `https://${host}.finance.yahoo.com/v8/finance/chart/GOLDBEES.NS?interval=1d&period1=${period1}&period2=${period2}&events=history`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://finance.yahoo.com/',
        },
        signal: AbortSignal.timeout(20_000),
      })
      if (!res.ok) continue
      const json = await res.json() as {
        chart: { result?: Array<{ timestamp?: number[]; indicators?: { adjclose?: Array<{ adjclose?: number[] }>; quote?: Array<{ close?: number[] }> } }> }
      }
      const result = json?.chart?.result?.[0]
      if (!result) continue
      const timestamps = result.timestamp ?? []
      const closes = result.indicators?.adjclose?.[0]?.adjclose ?? result.indicators?.quote?.[0]?.close ?? []
      const rows = timestamps
        .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), value: closes[i] ?? NaN }))
        .filter(r => !isNaN(r.value) && r.value > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
      if (rows.length > 0) return rows
    } catch {
      // try next host
    }
  }
  return []
}

// ── MAVERST NAV backfill ──────────────────────────────────────────────────────

/**
 * Ensures all MAVERST NAV codes exist in the funds table and have historical
 * NAV data in nav_data. Called when ?backfill=true.
 */
async function backfillMavestNavData(log: string[], today: string): Promise<void> {
  // Map MAVERST codes → NSE index names (from NSE_INDEX_LIST) or Yahoo source
  const NSE_CODE_MAP: Record<string, { name: string; inception: string }> = {}
  for (const entry of NSE_INDEX_LIST) {
    if ((MAVERST_NAV_CODES as readonly string[]).includes(entry.code)) {
      NSE_CODE_MAP[entry.code] = { name: entry.name, inception: entry.inception }
    }
  }

  // Ensure all MAVERST funds exist in DB
  const fundsToUpsert = [
    ...Object.entries(NSE_CODE_MAP).map(([code, info]) => ({
      code, name: info.name, category: 'Index', inception_date: info.inception,
    })),
    { code: 'GOLD', name: 'Gold ETF (GOLDBEES)', category: 'Commodity', inception_date: '2007-03-22' },
  ]
  const { error: upsertErr } = await supabase.from('funds').upsert(fundsToUpsert, { onConflict: 'code', ignoreDuplicates: true })
  if (upsertErr) log.push(`  WARNING: fund upsert error: ${upsertErr.message}`)
  else            log.push(`  Ensured ${fundsToUpsert.length} MAVERST funds exist in DB`)

  // Load fund IDs
  const { data: funds } = await supabase.from('funds').select('id, code').in('code', [...MAVERST_NAV_CODES])
  const codeToId = new Map<string, number>((funds ?? []).map((f: { id: number; code: string }) => [f.code, f.id]))

  // For each MAVERST NAV code, check latest data and backfill if needed
  for (const code of MAVERST_NAV_CODES) {
    if (code === 'N50') continue // N50 is handled by the main EOD cron

    const fundId = codeToId.get(code)
    if (!fundId) { log.push(`  [${code}] not found in DB — skipping`); continue }

    const { data: latestRow } = await supabase
      .from('nav_data').select('date, nav_value').eq('fund_id', fundId)
      .order('date', { ascending: false }).limit(1)

    const last = latestRow?.[0]
    const isNew = !last

    // Skip if already up to date (within 2 days)
    if (!isNew && addDays(last!.date, 2) >= today) {
      log.push(`  [${code}] NAV up to date (${last!.date})`)
      continue
    }

    const inceptionDefault = NSE_CODE_MAP[code]?.inception ?? '2010-01-01'
    const fromISO = isNew ? inceptionDefault : addDays(last!.date, -20)
    const newAfter = isNew ? '' : (last!.date as string)

    log.push(`  [${code}] fetching NAV from ${fromISO}…`)
    let rawRows: { date: string; value: number }[] = []

    if (code === 'GOLD') {
      rawRows = await fetchGoldNav(fromISO, today)
    } else {
      const indexName = NSE_CODE_MAP[code]?.name
      if (!indexName) { log.push(`  [${code}] no index name in NSE_INDEX_LIST`); continue }

      // Build name variants to try (niftyindices.com API names can differ slightly)
      const nameVariants = [
        indexName,
        // Toggle space between "NIFTY" and the number (e.g. "NIFTY100" ↔ "NIFTY 100")
        indexName.replace(/^NIFTY(\d)/, 'NIFTY $1'),
        indexName.replace(/^NIFTY (\d)/, 'NIFTY$1'),
      ].filter((v, i, arr) => arr.indexOf(v) === i)   // dedupe

      for (const variant of nameVariants) {
        rawRows = await fetchNiftyIndexNav(variant, fromISO, today)
        if (rawRows.length > 0) break
        await new Promise(r => setTimeout(r, 300))
      }

      // If still empty and doing a full backfill from a very early date, retry
      // from a safer floor date — niftyindices.com may not have pre-2010 data for
      // all indices even if the fund inception predates it.
      if (rawRows.length === 0 && isNew && fromISO < '2010-01-01') {
        log.push(`  [${code}] retrying from 2010-01-01 (inception ${fromISO} may predate index data)`)
        for (const variant of nameVariants) {
          rawRows = await fetchNiftyIndexNav(variant, '2010-01-01', today)
          if (rawRows.length > 0) break
          await new Promise(r => setTimeout(r, 300))
        }
      }
    }

    if (rawRows.length === 0) {
      log.push(`  [${code}] WARNING: 0 NAV rows returned`)
      await new Promise(r => setTimeout(r, 300))
      continue
    }

    // Compute scale factor for continuity with existing data
    let scale = 1
    if (!isNew && last) {
      const anchor = rawRows.filter(r => r.date <= (last!.date as string)).at(-1)
      if (anchor && anchor.value > 0) scale = Number(last!.nav_value) / anchor.value
    }

    const toInsert = rawRows
      .filter(r => r.date > newAfter)
      .map(r => ({ fund_id: fundId, date: r.date, nav_value: r.value * scale }))

    if (toInsert.length === 0) {
      log.push(`  [${code}] no new rows after ${newAfter}`)
      continue
    }

    // Upsert in batches of 500
    let inserted = 0
    const BATCH = 500
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const chunk = toInsert.slice(i, i + BATCH)
      const { error } = await supabase.from('nav_data').upsert(chunk, { onConflict: 'fund_id,date' })
      if (!error) inserted += chunk.length
    }
    log.push(`  [${code}] inserted ${inserted} NAV rows (${toInsert[0]?.date} → ${toInsert.at(-1)?.date})`)

    // Small delay between requests to avoid rate limiting
    await new Promise(r => setTimeout(r, 400))
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function todayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url         = new URL(req.url)
  const backfill    = url.searchParams.get('backfill') === 'true'
  const navBackfill = url.searchParams.get('nav-backfill') === 'true'
  const dateOverride = url.searchParams.get('date')

  // Auth check
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today    = dateOverride ?? todayIST()
  const fromDate = backfill ? '2010-01-01' : (() => {
    const d = new Date(today)
    d.setFullYear(d.getFullYear() - 2)  // 2 years back for rolling z-scores
    return d.toISOString().slice(0, 10)
  })()

  const log: string[] = [`[maverst-eod] start — today: ${today} | backfill: ${backfill} | nav-backfill: ${navBackfill} | from: ${fromDate}`]

  try {
    // ── 0. [backfill only] Backfill NAV data for MAVERST-specific codes ────────
    if (backfill || navBackfill) {
      log.push('[step 0] backfilling MAVERST NAV data…')
      await backfillMavestNavData(log, today)
      if (navBackfill && !backfill) {
        // If only nav-backfill requested, stop here
        log.push('[maverst-eod] nav-backfill complete')
        return NextResponse.json({ ok: true, navBackfillOnly: true, log })
      }
    }

    // ── 1. Fetch + upsert external data ──────────────────────────────────────
    log.push('[step 1] fetching external data…')

    const [vixRows, usdinrRows, fiiRows] = await Promise.all([
      fetchIndiaVIX(fromDate, today),
      fetchUSDINR(fromDate, today),
      fetchFIIFlows(fromDate, today),
    ])

    log.push(`  VIX rows: ${vixRows.length}, USD/INR rows: ${usdinrRows.length}, FII rows: ${fiiRows.length}`)
    if (vixRows.length === 0)    log.push('  WARNING: VIX scraper returned 0 rows — using existing DB data')
    if (usdinrRows.length === 0) log.push('  WARNING: USD/INR scraper returned 0 rows — using existing DB data')
    if (fiiRows.length === 0)    log.push('  WARNING: FII scraper returned 0 rows — using existing DB data')

    // Merge into a combined map by date
    const extByDate = new Map<string, { india_vix?: number; usdinr?: number; fii_net_crore?: number }>()
    for (const r of vixRows)    { const e = extByDate.get(r.date) ?? {}; e.india_vix     = r.value; extByDate.set(r.date, e) }
    for (const r of usdinrRows) { const e = extByDate.get(r.date) ?? {}; e.usdinr        = r.value; extByDate.set(r.date, e) }
    for (const r of fiiRows)    { const e = extByDate.get(r.date) ?? {}; e.fii_net_crore = r.value; extByDate.set(r.date, e) }

    if (extByDate.size > 0) {
      const extRows = Array.from(extByDate.entries()).map(([date, v]) => ({
        date,
        india_vix:     v.india_vix     ?? null,
        usdinr:        v.usdinr        ?? null,
        fii_net_crore: v.fii_net_crore ?? null,
        updated_at: new Date().toISOString(),
      }))
      const { error: extErr } = await supabase
        .from('maverst_external_data')
        .upsert(extRows, { onConflict: 'date' })
      if (extErr) log.push(`  WARNING: external upsert error: ${extErr.message}`)
      else        log.push(`  upserted ${extRows.length} external rows`)
    }

    // ── 2. Load nav data + external data from DB ──────────────────────────────
    log.push('[step 2] loading nav + external data…')

    const [navData, externalData] = await Promise.all([
      fetchNavData(supabase, fromDate),
      fetchExternalData(supabase, fromDate),
    ])

    const n50 = navData.get('N50') ?? []
    if (n50.length === 0) {
      return NextResponse.json({ error: 'No N50 data — ensure EOD cron has run', log }, { status: 503 })
    }

    // Log which MAVERST codes are available
    const availableCodes = [...MAVERST_NAV_CODES].filter(c => (navData.get(c)?.length ?? 0) > 0)
    const missingCodes   = [...MAVERST_NAV_CODES].filter(c => (navData.get(c)?.length ?? 0) === 0)
    log.push(`  N50 rows: ${n50.length}, external rows: ${externalData.length}`)
    log.push(`  NAV codes available: ${availableCodes.join(', ')}`)
    if (missingCodes.length > 0) log.push(`  NAV codes MISSING: ${missingCodes.join(', ')} — run with ?backfill=true`)

    // ── 3. Compute raw indicator series + z-scores ────────────────────────────
    log.push('[step 3] computing indicators + z-scores…')

    const extMap = new Map(externalData.map(r => [r.date, r]))

    const recomputeAfter = (() => {
      const d = new Date(today)
      d.setUTCDate(d.getUTCDate() - 30)
      return d.toISOString().slice(0, 10)
    })()

    const existingDates = new Set<string>()
    if (!backfill) {
      const { data: existing } = await supabase
        .from('maverst_regime_scores')
        .select('date')
        .gte('date', fromDate)
        .lt('date', recomputeAfter)
        .limit(10_000)
      for (const r of existing ?? []) existingDates.add(r.date)
    }

    const targetDates = new Set(
      backfill
        ? n50.map(p => p.date)
        : n50.filter(p => p.date >= fromDate && !existingDates.has(p.date)).map(p => p.date)
    )

    if (targetDates.size === 0) {
      log.push('  all dates up to date — nothing to compute')
      return NextResponse.json({ ok: true, inserted: 0, log })
    }

    const rawSeries = n50.map((_, idx) => ({
      date: n50[idx].date,
      raw:  computeRawIndicatorsAtIdx(navData, extMap, idx),
    }))
    const zRows = computeRollingZScores(rawSeries)
    log.push(`  z-score rows computed: ${zRows.length}`)

    // Log indicator availability from the latest row
    const latestZ = zRows.at(-1)
    if (latestZ) {
      const zKeys   = Object.keys(latestZ.z)
      const nullKeys = ['trend','momentum','midcapRatio','ewRatio','vix','goldRatio','usdinr','fiiFlows','sectorRatio']
        .filter(k => latestZ.z[k as keyof typeof latestZ.z] == null)
      log.push(`  Latest z-scores active: ${zKeys.length}/9 | Missing: ${nullKeys.join(', ') || 'none'}`)
    }

    // ── 4. Upsert regime scores ───────────────────────────────────────────────
    log.push('[step 4] upserting regime scores…')

    const toInsert = zRows
      .filter(r => targetDates.has(r.date))
      .map(r => {
        const score      = computeScore(r.z)
        const regime     = classifyRegime(score)
        const confidence = computeConfidence(score)
        const alloc      = getAllocation(regime)
        return {
          date:             r.date,
          score:            parseFloat(score.toFixed(4)),
          regime,
          confidence,
          alloc_momentum:   alloc.midcapMomentum,
          alloc_gold:       alloc.gold,
          z_trend:          r.z.trend           ?? null,
          z_momentum:       r.z.momentum        ?? null,
          z_midcap_ratio:   r.z.midcapRatio     ?? null,
          z_ew_ratio:       r.z.ewRatio         ?? null,
          z_vix:            r.z.vix             ?? null,
          z_gold_ratio:     r.z.goldRatio       ?? null,
          z_usdinr:         r.z.usdinr          ?? null,
          z_fii_flows:      r.z.fiiFlows        ?? null,
          z_sector_ratio:   r.z.sectorRatio     ?? null,
          raw_trend:        r.raw.trend         ?? null,
          raw_momentum:     r.raw.momentum      ?? null,
          raw_midcap_ratio: r.raw.midcapRatio   ?? null,
          raw_ew_ratio:     r.raw.ewRatio       ?? null,
          raw_vix:          r.raw.vix           ?? null,
          raw_gold_ratio:   r.raw.goldRatio     ?? null,
          raw_usdinr:       r.raw.usdinr        ?? null,
          raw_fii_flows:    r.raw.fiiFlows      ?? null,
          raw_sector_ratio: r.raw.sectorRatio   ?? null,
        }
      })

    const CHUNK = 500
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('maverst_regime_scores')
        .upsert(chunk, { onConflict: 'date' })
      if (error) {
        log.push(`  ERROR upserting chunk ${i}–${i + chunk.length}: ${error.message}`)
      } else {
        inserted += chunk.length
      }
    }

    log.push(`  inserted/updated: ${inserted} rows`)
    log.push('[maverst-eod] done')

    return NextResponse.json({ ok: true, inserted, log })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.push(`[ERROR] ${msg}`)
    console.error('[maverst-eod]', err)
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}
