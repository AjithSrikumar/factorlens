export const dynamic = 'force-dynamic'

/**
 * /api/cron/maverst-eod
 *
 * Daily regime computation for MAVERST.
 * Called at 18:30 IST (13:00 UTC) after market close, 30 min after the main
 * EOD cron that refreshes Nifty 50 / Midcap 150 / Gold nav_data (rankings DB).
 *
 * ?backfill=true      — full historical backfill from 2010 + NAV data for MAVERST codes
 * ?nav-backfill=true  — only backfill NAV data (NMC150, N100EW, N100, NHBETA50, NLV50, MC150M50, GOLD)
 * ?vix-backfill=true  — backfill full India VIX history from inception (2009-03-02) via investing.com
 * ?date=YYYY-MM-DD    — override the target date (for testing)
 *
 * Data sources:
 *  - Nifty 50 (Trend, Momentum), Midcap 150 (Midcap Ratio), Gold/GOLDBEES (Gold Signal):
 *    Read directly from nav_data table — same database as the Index Fund Rankings page.
 *    Populated by /api/cron/eod which runs at 12:30 UTC (18:00 IST).
 *  - India VIX (Volatility): scraped from in.investing.com (primary) with
 *    niftyindices.com as fallback; stored in maverst_external_data.
 *  - USD/INR: Yahoo Finance.  FII flows: NSE India.
 *
 * Steps:
 *  1. [If backfill] Ensure MAVERST NAV funds exist in DB and backfill their NAV data
 *  2. Fetch external data (India VIX, USD/INR, FII) and store in maverst_external_data
 *  3. Load nav_data for all MAVERST indicator codes (from rankings-page DB)
 *  4. Compute z-score history for all dates (backfill) or just today (daily)
 *  5. Upsert results into maverst_regime_scores
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
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

// ── Auto-migration ────────────────────────────────────────────────────────────

/**
 * Creates the maverst tables via direct PostgreSQL if they are missing.
 * Uses SUPABASE_DB_URL for a direct connection that bypasses PostgREST schema cache.
 * Also sends NOTIFY pgrst, 'reload schema' so new tables are immediately visible.
 */
async function ensureMavestTables(log: string[]): Promise<boolean> {
  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    log.push('  ensureMavestTables: SUPABASE_DB_URL not set — cannot auto-create tables')
    return false
  }
  const sql = postgres(dbUrl.trim(), { max: 1, ssl: 'require' })
  try {
    await sql`
      create table if not exists maverst_external_data (
        date          date         primary key,
        india_vix     numeric(8,4),
        usdinr        numeric(10,4),
        fii_net_crore numeric(16,2),
        created_at    timestamptz  default now(),
        updated_at    timestamptz  default now()
      )`
    await sql`
      create table if not exists maverst_regime_scores (
        date             date         primary key,
        score            numeric(8,4) not null,
        regime           text         not null check (regime in ('Growth','Neutral','Defensive')),
        confidence       text         not null check (confidence in ('High','Medium','Low')),
        alloc_momentum   numeric(5,2) not null,
        alloc_gold       numeric(5,2) not null,
        z_trend          numeric(8,4), z_momentum       numeric(8,4), z_midcap_ratio   numeric(8,4),
        z_ew_ratio       numeric(8,4), z_vix            numeric(8,4), z_gold_ratio     numeric(8,4),
        z_usdinr         numeric(8,4), z_fii_flows      numeric(8,4), z_sector_ratio   numeric(8,4),
        raw_trend        numeric(10,6), raw_momentum     numeric(10,6), raw_midcap_ratio numeric(10,6),
        raw_ew_ratio     numeric(10,6), raw_vix          numeric(8,4),  raw_gold_ratio   numeric(10,6),
        raw_usdinr       numeric(10,4), raw_fii_flows    numeric(16,2), raw_sector_ratio numeric(10,6),
        created_at       timestamptz  default now()
      )`
    await sql`create index if not exists idx_maverst_regime_date on maverst_regime_scores (date desc)`
    await sql`alter table maverst_external_data enable row level security`
    await sql`alter table maverst_regime_scores  enable row level security`
    await sql`
      do $$ begin
        if not exists (select 1 from pg_policies where tablename='maverst_external_data' and policyname='Public read')
        then execute 'create policy "Public read" on maverst_external_data for select using (true)'; end if;
      end $$`
    await sql`
      do $$ begin
        if not exists (select 1 from pg_policies where tablename='maverst_regime_scores' and policyname='Public read')
        then execute 'create policy "Public read" on maverst_regime_scores for select using (true)'; end if;
      end $$`
    await sql`select pg_notify('pgrst', 'reload schema')`
    log.push('  Auto-migration: maverst tables created/verified + PostgREST schema reloaded')
    return true
  } catch (e) {
    log.push(`  Auto-migration ERROR: ${e instanceof Error ? e.message : String(e)}`)
    return false
  } finally {
    await sql.end()
  }
}

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

/**
 * Fetch India VIX historical data from in.investing.com.
 * Primary source for full history from inception (2009-03-02).
 * Tries two strategies:
 *   1. investing.com chart JSON API (no auth required)
 *   2. HistoricalDataAjax with session cookies + CSRF token
 */
async function fetchIndiaVIXInvesting(fromISO: string, toISO: string): Promise<{ date: string; value: number }[]> {
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

  function fmtInvestingDate(iso: string): string {
    const [y, m, d] = iso.split('-')
    return `${m}/${d}/${y}`
  }

  function parseInvestingDate(raw: string): string {
    const IMON: Record<string, string> = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
      Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
    }
    // "Mar 28, 2024"
    const m1 = raw.trim().match(/^(\w{3})\s+(\d{1,2}),\s+(\d{4})$/)
    if (m1) return `${m1[3]}-${IMON[m1[1]] ?? '01'}-${m1[2].padStart(2, '0')}`
    // "28/03/2024"
    const m2 = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (m2) return `${m2[3]}-${m2[2]}-${m2[1]}`
    // ISO-ish "2024-03-28"
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return raw.trim()
    return ''
  }

  // Strategy 1: investing.com chart JSON API
  try {
    const url = `https://api.investing.com/api/financialdata/44336/historical/chart/?period=custom&start-date=${fromISO}&end-date=${toISO}&interval=P1D&pointscount=max`
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'application/json',
        'Referer': 'https://in.investing.com/',
        'domain-id': 'in',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) {
      const json = await res.json() as {
        data?: Array<{ rowDateTimestamp?: number; last_close?: number; last_open?: number }>
      }
      const rows = (json.data ?? [])
        .map(row => ({
          date:  new Date((row.rowDateTimestamp ?? 0) * 1000).toISOString().slice(0, 10),
          value: row.last_close ?? row.last_open ?? NaN,
        }))
        .filter(r => r.date.length === 10 && !isNaN(r.value) && r.value > 0)
        .sort((a, b) => a.date.localeCompare(b.date))
      if (rows.length > 5) return rows
    }
  } catch { /* fall through to strategy 2 */ }

  // Strategy 2: HistoricalDataAjax with session cookies + CSRF
  try {
    // Step 1: Fetch page for cookies + CSRF token
    const pageRes = await fetch('https://in.investing.com/indices/india-vix-historical-data', {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      signal: AbortSignal.timeout(20_000),
    })
    if (!pageRes.ok) return []

    const rawCookies = (pageRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ??
      pageRes.headers.get('set-cookie')?.split(/,(?=[^;]+=[^;]+)/) ?? []
    const cookieMap = new Map<string, string>()
    for (const c of rawCookies) {
      const kv = c.split(';')[0].trim()
      const eq = kv.indexOf('=')
      if (eq > 0) cookieMap.set(kv.slice(0, eq), kv.slice(eq + 1))
    }

    const pageHtml = await pageRes.text()
    const csrfMatch = pageHtml.match(/data-ci-csrf-token="([^"]+)"/) ||
                      pageHtml.match(/name="csrf-token"\s+content="([^"]+)"/) ||
                      pageHtml.match(/"csrf_token"\s*:\s*"([^"]+)"/)
    const csrf   = csrfMatch?.[1] ?? ''
    const pairM  = pageHtml.match(/data-pair-id="(\d+)"/)
    const pairId = pairM?.[1] ?? '44336'
    const cookieStr = [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ')

    await new Promise(r => setTimeout(r, 600))

    // Step 2: POST historical data request
    const formBody = new URLSearchParams({
      curr_id:      pairId,
      header:       'India VIX Historical Data',
      st_date:      fmtInvestingDate(fromISO),
      end_date:     fmtInvestingDate(toISO),
      interval_sec: 'Daily',
      sort_col:     'date',
      sort_ord:     'ASC',
      action:       'historical_data',
    })

    const dataRes = await fetch('https://in.investing.com/instruments/HistoricalDataAjax', {
      method: 'POST',
      headers: {
        'Content-Type':     'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Csrf-Token':     csrf,
        'Cookie':           cookieStr,
        'Referer':          'https://in.investing.com/indices/india-vix-historical-data',
        'User-Agent':       UA,
        'Accept':           '*/*',
        'Origin':           'https://in.investing.com',
        'Accept-Language':  'en-US,en;q=0.9',
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(25_000),
    })
    if (!dataRes.ok) return []

    const html = await dataRes.text()

    // Parse HTML table returned by investing.com
    const rows: { date: string; value: number }[] = []
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    let trM
    while ((trM = trRe.exec(html)) !== null) {
      const tdArr: string[] = []
      const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi
      let tdM
      while ((tdM = tdRe.exec(trM[1])) !== null) {
        tdArr.push(tdM[1].replace(/<[^>]+>/g, '').trim())
      }
      if (tdArr.length >= 2) {
        const date  = parseInvestingDate(tdArr[0])
        const value = parseFloat(tdArr[1].replace(/,/g, ''))
        if (date.length === 10 && !isNaN(value) && value > 0) rows.push({ date, value })
      }
    }
    return rows.sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}

/**
 * Backfill India VIX from inception (2009-03-02) to today.
 * Chunks into 6-month windows and tries investing.com first, niftyindices.com second.
 * Returns total rows upserted.
 */
async function backfillIndiaVIX(log: string[], today: string): Promise<number> {
  const INCEPTION = '2009-03-02'
  const CHUNK_MONTHS = 6

  function addMonths(iso: string, n: number): string {
    const d = new Date(iso)
    d.setUTCMonth(d.getUTCMonth() + n)
    return d.toISOString().slice(0, 10)
  }

  // Check what we already have in DB
  const { data: existing } = await supabase
    .from('maverst_external_data')
    .select('date')
    .not('india_vix', 'is', null)
    .order('date', { ascending: true })
    .limit(10_000)

  const existingDates = new Set((existing ?? []).map((r: { date: string }) => r.date))
  log.push(`  VIX backfill: ${existingDates.size} dates already in DB`)

  // Build list of chunks to fetch
  const chunks: Array<{ from: string; to: string }> = []
  let cursor = INCEPTION
  while (cursor < today) {
    const end = addMonths(cursor, CHUNK_MONTHS)
    chunks.push({ from: cursor, to: end > today ? today : end })
    cursor = addDays(end, 1)
  }
  log.push(`  VIX backfill: ${chunks.length} chunks to process`)

  let totalUpserted = 0

  for (const chunk of chunks) {
    // Skip chunk if we have data for every day in the range (approximate check)
    const chunkDays = Math.round((new Date(chunk.to).getTime() - new Date(chunk.from).getTime()) / (86400 * 1000))
    const sampleDate = addDays(chunk.from, Math.floor(chunkDays / 2))
    if (existingDates.has(sampleDate)) {
      // Likely already have data for this chunk
      continue
    }

    log.push(`  Fetching VIX ${chunk.from} → ${chunk.to}…`)
    let rows: { date: string; value: number }[] = []

    // Try investing.com first
    rows = await fetchIndiaVIXInvesting(chunk.from, chunk.to)
    if (rows.length === 0) {
      // Fallback to niftyindices.com
      rows = await fetchIndiaVIX(chunk.from, chunk.to)
    }

    if (rows.length === 0) {
      log.push(`    WARNING: 0 rows from both sources for ${chunk.from} → ${chunk.to}`)
      await new Promise(r => setTimeout(r, 500))
      continue
    }

    // Only upsert rows not already in DB
    const newRows = rows
      .filter(r => !existingDates.has(r.date))
      .map(r => ({ date: r.date, india_vix: r.value, updated_at: new Date().toISOString() }))

    if (newRows.length > 0) {
      const { error } = await supabase
        .from('maverst_external_data')
        .upsert(newRows, { onConflict: 'date' })
      if (!error) {
        totalUpserted += newRows.length
        for (const r of newRows) existingDates.add(r.date)
      } else {
        log.push(`    ERROR upserting VIX chunk: ${error.message}`)
      }
    }

    log.push(`    ${rows.length} fetched, ${newRows.length} new rows upserted`)
    await new Promise(r => setTimeout(r, 400))
  }

  return totalUpserted
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

  const NSE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

  try {
    // NSE India requires a session cookie — fetch the homepage first, then the data page
    const homeRes = await fetch('https://www.nseindia.com/', {
      headers: {
        'User-Agent': NSE_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      },
      signal: AbortSignal.timeout(15_000),
    })
    // Collect cookies from homepage
    const homeCookies = (homeRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? homeRes.headers.get('set-cookie')?.split(/,(?=[^;]+=[^;]+)/) ?? []

    // Small delay to mimic browser navigation
    await new Promise(r => setTimeout(r, 1000))

    // Fetch the market-data page to pick up any additional session cookies
    const cookieRes = await fetch('https://www.nseindia.com/market-data/fii-dii-activity', {
      headers: {
        'User-Agent': NSE_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.nseindia.com/',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
      },
      signal: AbortSignal.timeout(15_000),
    })

    // Merge all cookies
    const pageCookies = (cookieRes.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.()
      ?? cookieRes.headers.get('set-cookie')?.split(/,(?=[^;]+=[^;]+)/) ?? []
    const allRaw = [...homeCookies, ...pageCookies]
    const cookieMap = new Map<string, string>()
    for (const c of allRaw) {
      const kv = c.split(';')[0].trim()
      const eq = kv.indexOf('=')
      if (eq > 0) cookieMap.set(kv.slice(0, eq), kv.slice(eq + 1))
    }
    const cookies = [...cookieMap.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
    if (!cookies) return []

    // Small delay before the API call
    await new Promise(r => setTimeout(r, 800))

    // Fetch FII historical data
    const url = `https://www.nseindia.com/api/historicalFiiDii?instrumentType=EQ&category=FII&startDate=${toNSEDate(fromISO)}&endDate=${toNSEDate(toISO)}`
    const dataRes = await fetch(url, {
      headers: {
        'User-Agent': NSE_UA,
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Referer': 'https://www.nseindia.com/market-data/fii-dii-activity',
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
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
    const fundId = codeToId.get(code)
    if (!fundId) { log.push(`  [${code}] not found in DB — skipping`); continue }

    if (code === 'N50') {
      // MAVERST needs N50 continuous history from at least 2012 for:
      //   • 200-day SMA (trend signal)
      //   • 12-month price return (momentum signal)
      // The daily eod cron only adds recent rows. Check if we have early history.
      const [{ data: oldestRow }, { data: latestRowN50 }] = await Promise.all([
        supabase.from('nav_data').select('date').eq('fund_id', fundId)
          .order('date', { ascending: true }).limit(1),
        supabase.from('nav_data').select('date').eq('fund_id', fundId)
          .order('date', { ascending: false }).limit(1),
      ])
      const oldestDate  = oldestRow?.[0]?.date  as string | undefined
      const latestDate0 = latestRowN50?.[0]?.date as string | undefined

      if (oldestDate && oldestDate <= '2012-01-01' && latestDate0 && addDays(latestDate0, 5) >= today) {
        // Has early history AND is current → skip N50
        log.push(`  [N50] history OK (${oldestDate} → ${latestDate0}) — skipping backfill`)
        continue
      }

      if (!oldestDate || oldestDate > '2012-01-01') {
        // Missing early history — perform a targeted full backfill from 2010-01-01
        log.push(`  [N50] missing early history (oldest: ${oldestDate ?? 'none'}) — fetching from 2010-01-01…`)
        const n50Names = ['NIFTY 50', 'NIFTY50', 'Nifty 50', 'Nifty50']
        let n50Raw: { date: string; value: number }[] = []
        for (const n of n50Names) {
          n50Raw = await fetchNiftyIndexNav(n, '2010-01-01', today)
          if (n50Raw.length > 0) break
          await new Promise(r => setTimeout(r, 300))
        }
        if (n50Raw.length > 0) {
          // Upsert all rows (including overlap with any existing recent data)
          let inserted = 0
          const BATCH = 500
          for (let i = 0; i < n50Raw.length; i += BATCH) {
            const chunk = n50Raw.slice(i, i + BATCH).map(r => ({ fund_id: fundId, date: r.date, nav_value: r.value }))
            const { error } = await supabase.from('nav_data').upsert(chunk, { onConflict: 'fund_id,date' })
            if (!error) inserted += chunk.length
          }
          log.push(`  [N50] full backfill: ${inserted} rows (${n50Raw[0].date} → ${n50Raw.at(-1)?.date})`)
        } else {
          log.push(`  [N50] WARNING: full backfill returned 0 rows`)
        }
        continue
      }
      // oldestDate is early enough but latestDate is stale → fall through to standard update
      log.push(`  [N50] early history OK (${oldestDate}) but latest (${latestDate0 ?? 'none'}) is stale — will update`)
    }

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
      const toTitleCase = (s: string) =>
        s.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      const nameVariants = [
        indexName,
        // Toggle space between "NIFTY" and the number (e.g. "NIFTY100" ↔ "NIFTY 100")
        indexName.replace(/^NIFTY(\d)/, 'NIFTY $1'),
        indexName.replace(/^NIFTY (\d)/, 'NIFTY$1'),
        // Title-case variant (e.g. "NIFTY100 EQUAL WEIGHT" → "Nifty100 Equal Weight")
        toTitleCase(indexName),
        toTitleCase(indexName.replace(/^NIFTY(\d)/, 'NIFTY $1')),
        // Additional variants for equal-weight indices (niftyindices.com uses "Wt" in some APIs)
        indexName.replace(/EQUAL WEIGHT$/i, 'Equal Wt'),
        indexName.replace(/EQUAL WEIGHT$/i, 'Equal Weight').replace(/^NIFTY(\d)/, 'NIFTY $1'),
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
  const vixBackfill = url.searchParams.get('vix-backfill') === 'true'
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

  const log: string[] = [`[maverst-eod] start — today: ${today} | backfill: ${backfill} | nav-backfill: ${navBackfill} | vix-backfill: ${vixBackfill} | from: ${fromDate}`]

  try {
    // ── 0a. [vix-backfill only] Load full India VIX history from inception ────
    if (vixBackfill) {
      log.push('[step 0a] backfilling India VIX from inception via investing.com…')
      const upserted = await backfillIndiaVIX(log, today)
      log.push(`[maverst-eod] VIX backfill complete — ${upserted} total rows upserted`)
      if (!backfill) {
        return NextResponse.json({ ok: true, vixBackfillOnly: true, upserted, log })
      }
    }

    // ── 0b. [backfill only] Backfill NAV data for MAVERST-specific codes ──────
    // NOTE: Nifty 50, Midcap 150, and Gold are populated by the main EOD cron
    // (/api/cron/eod) and stored in nav_data — the same database used by the
    // Index Fund Rankings page. The maverst reads from that shared table, so
    // these signals (Momentum, Trend, Midcap Ratio, Gold Signal) stay in sync
    // with the rankings page automatically. Only auxiliary indices (N100EW,
    // N100, NHBETA50, NLV50, MC150M50) need a separate backfill here.
    if (backfill || navBackfill) {
      log.push('[step 0b] backfilling MAVERST NAV data (auxiliary indices)…')
      await backfillMavestNavData(log, today)
      if (navBackfill && !backfill) {
        log.push('[maverst-eod] nav-backfill complete')
        return NextResponse.json({ ok: true, navBackfillOnly: true, log })
      }
    }

    // ── 1. Fetch + upsert external data ──────────────────────────────────────
    // India VIX: try investing.com (primary, has data from 2009-03-02 inception)
    //            then niftyindices.com as fallback.
    // USD/INR and FII flows are fetched in parallel.
    log.push('[step 1] fetching external data…')

    const [investingVixRows, usdinrRows, fiiRows] = await Promise.all([
      fetchIndiaVIXInvesting(fromDate, today),
      fetchUSDINR(fromDate, today),
      fetchFIIFlows(fromDate, today),
    ])

    // Fall back to niftyindices.com if investing.com returned nothing
    let vixRows = investingVixRows
    if (vixRows.length === 0) {
      log.push('  investing.com VIX returned 0 rows — falling back to niftyindices.com')
      vixRows = await fetchIndiaVIX(fromDate, today)
    } else {
      log.push(`  investing.com VIX: ${vixRows.length} rows`)
    }

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
      let { error: extErr } = await supabase
        .from('maverst_external_data')
        .upsert(extRows, { onConflict: 'date' })
      if (extErr && (extErr.message.includes('schema cache') || extErr.message.includes('not found'))) {
        log.push('  maverst tables missing — running auto-migration…')
        await ensureMavestTables(log)
        // Small pause for PostgREST schema cache to reload
        await new Promise(r => setTimeout(r, 2000));
        ({ error: extErr } = await supabase.from('maverst_external_data').upsert(extRows, { onConflict: 'date' }))
      }
      if (extErr) log.push(`  WARNING: external upsert error: ${extErr.message}`)
      else        log.push(`  upserted ${extRows.length} external rows`)
    }

    // ── 2. Load nav data + external data from DB ──────────────────────────────
    // nav_data is the same table used by the Index Fund Rankings page.
    // Nifty 50, Midcap 150, and Gold (GOLDBEES) are refreshed by /api/cron/eod
    // (runs at 12:30 UTC, 30 min before this cron). This ensures that
    // Momentum (N50 12M return), Trend (N50 vs 200-SMA), Midcap Ratio
    // (NMC150/N50), and Gold Signal are always computed from real-time data.
    log.push('[step 2] loading nav data from rankings DB + external data…')

    // For backfill, always load from 2010-01-01 to get full history.
    // For daily, fromDate is already 2 years back which is sufficient.
    const navFromDate = backfill ? '2010-01-01' : fromDate
    const [navData, externalData] = await Promise.all([
      fetchNavData(supabase, navFromDate),
      fetchExternalData(supabase, fromDate),
    ])

    const n50 = navData.get('N50') ?? []
    if (n50.length === 0) {
      return NextResponse.json({ error: 'No N50 data — ensure EOD cron has run', log }, { status: 503 })
    }

    // Log which MAVERST codes are available and their latest date
    const availableCodes = [...MAVERST_NAV_CODES].filter(c => (navData.get(c)?.length ?? 0) > 0)
    const missingCodes   = [...MAVERST_NAV_CODES].filter(c => (navData.get(c)?.length ?? 0) === 0)
    const latestNavDate  = n50.at(-1)?.date ?? 'unknown'
    log.push(`  N50 rows: ${n50.length} (latest: ${latestNavDate}), external rows: ${externalData.length}`)
    log.push(`  NAV codes available: ${availableCodes.join(', ')}`)
    if (missingCodes.length > 0) log.push(`  NAV codes MISSING: ${missingCodes.join(', ')} — run with ?backfill=true`)

    // Warn if nav_data is stale (eod cron may not have run today)
    if (latestNavDate < today) {
      log.push(`  NOTE: latest nav_data date (${latestNavDate}) is before today (${today}) — signals use last available data`)
    }

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
    let schemaFixed = false
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK)
      let { error } = await supabase
        .from('maverst_regime_scores')
        .upsert(chunk, { onConflict: 'date' })
      if (error && (error.message.includes('schema cache') || error.message.includes('not found')) && !schemaFixed) {
        log.push('  maverst_regime_scores missing — running auto-migration…')
        await ensureMavestTables(log)
        await new Promise(r => setTimeout(r, 2000))
        schemaFixed = true;
        ({ error } = await supabase.from('maverst_regime_scores').upsert(chunk, { onConflict: 'date' }))
        // Reset loop to retry from the beginning
        if (!error) { inserted += chunk.length; i = -CHUNK; continue }
      }
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
