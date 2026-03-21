/**
 * GET /api/cron/mf-backfill?year=2021
 *
 * Fetches every trading day's NAV for all 286 funds from AMFI for the given
 * year, and upserts into mf_nav_data.  Run once per year going back to the
 * earliest fund inception (~2000).
 *
 * Usage — call once per year (can run in parallel in separate tabs):
 *   for year in 2000 2001 ... 2025 2026; do
 *     curl -H "Authorization: Bearer <CRON_SECRET>" \
 *          "https://factorlens.vercel.app/api/cron/mf-backfill?year=$year"
 *   done
 *
 * Then trigger mf-eod once to recompute 1y/3y/5y returns.
 *
 * Strategy: for each month in the year, one AMFI history fetch (≈ 14 000
 * funds × 22 days ≈ 25 MB).  Filters to our 286 scheme codes before
 * upserting, so DB writes are small.  12 months × ~10 s each ≈ 120 s well
 * within Vercel's 300 s limit.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY !== 'your-service-role-key-here')
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

// ── Date helpers ──────────────────────────────────────────────────────────────

const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MON_MAP: Record<string, string> = {
  Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
  Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
}

/** '2025-03-21' → '21-Mar-2025' */
function isoToAmfi(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-')
  return `${dd}-${MON_NAMES[parseInt(mm, 10) - 1]}-${yyyy}`
}

/** '21-Mar-2025' → '2025-03-21', '' on failure */
function amfiToISO(s: string): string {
  const p = s.trim().split('-')
  if (p.length !== 3) return ''
  const mm = MON_MAP[p[1]]
  if (!mm) return ''
  return `${p[2]}-${mm}-${p[0].padStart(2, '0')}`
}

/** Last day of month, e.g. (2020, 2) → '2020-02-29' */
function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
}

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// ── AMFI fetcher ──────────────────────────────────────────────────────────────

/**
 * Fetch AMFI historical NAV for [fromISO, toISO] (inclusive).
 * Returns rows only for the scheme codes in `filter`.
 *
 * AMFI historical format (semicolon-delimited, 8 fields):
 *   SchemeCode ; ISIN1 ; ISIN2 ; SchemeName ; NAV ; Repurchase ; Sale ; Date
 *
 * Falls back to 6-field format (same as NAVAll.txt):
 *   SchemeCode ; ISIN1 ; ISIN2 ; SchemeName ; NAV ; Date
 */
async function fetchAmfiMonth(
  fromISO: string,
  toISO: string,
  filter: Set<number>,
): Promise<{ rows: Array<{ scheme_code: number; date: string; nav: number }>; rawLines: number; firstLine: string }> {
  const url =
    `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx` +
    `?mf=0&frmdt=${isoToAmfi(fromISO)}&todt=${isoToAmfi(toISO)}`

  const res = await fetch(url, {
    signal: AbortSignal.timeout(60_000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  })
  if (!res.ok) throw new Error(`AMFI HTTP ${res.status} for ${fromISO}→${toISO}`)

  const text = await res.text()
  const lines = text.split('\n')
  const firstLine = lines[0]?.trim().slice(0, 200) ?? ''

  // Detect HTML error page — AMFI returns HTML when blocking automated requests
  if (text.trimStart().startsWith('<') || text.includes('<!DOCTYPE') || text.includes('<html')) {
    throw new Error(`AMFI returned HTML (likely blocked/error page) for ${fromISO}→${toISO}. First line: ${firstLine}`)
  }

  const rows: Array<{ scheme_code: number; date: string; nav: number }> = []

  for (const line of lines) {
    const p = line.trim().split(';')
    // Support both 8-field (historical) and 6-field (NAVAll.txt) formats
    if (p.length < 6) continue
    const code = parseInt(p[0], 10)
    if (isNaN(code) || !filter.has(code)) continue
    const nav  = parseFloat(p[4])
    // 8-field: date is p[7]; 6-field: date is p[5]
    const date = p.length >= 8 ? amfiToISO(p[7]) : amfiToISO(p[5])
    if (!date || isNaN(nav) || nav <= 0) continue
    rows.push({ scheme_code: code, date, nav })
  }

  return { rows, rawLines: lines.length, firstLine }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse ?year=
  const yearParam = req.nextUrl.searchParams.get('year')
  const year = yearParam ? parseInt(yearParam, 10) : new Date().getUTCFullYear()
  if (isNaN(year) || year < 1990 || year > 2100) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
  }

  const currentYear  = parseInt(todayIST().slice(0, 4), 10)
  const currentMonth = parseInt(todayIST().slice(5, 7), 10)
  const lastMonth    = year < currentYear ? 12 : currentMonth  // don't exceed today

  const log: string[] = [`mf-backfill year=${year} | processing months 1–${lastMonth}`]

  // 1. Load our 286 scheme codes
  const { data: funds, error: fundsErr } = await supabase
    .from('mf_funds')
    .select('scheme_code')
  if (fundsErr || !funds) {
    return NextResponse.json({ error: `load mf_funds: ${fundsErr?.message}`, log }, { status: 500 })
  }
  const ourCodes = new Set(funds.map(f => f.scheme_code as number))
  log.push(`Filtering to ${ourCodes.size} scheme codes`)

  // 2. Month-by-month fetch + upsert
  let totalInserted = 0
  let totalRows     = 0
  const monthErrors: string[] = []

  for (let month = 1; month <= lastMonth; month++) {
    const fromISO = `${year}-${String(month).padStart(2, '0')}-01`
    const toISO   = lastDayOfMonth(year, month)

    let fetched: Awaited<ReturnType<typeof fetchAmfiMonth>>
    try {
      fetched = await fetchAmfiMonth(fromISO, toISO, ourCodes)
    } catch (e) {
      const msg = `month ${month}: ${e instanceof Error ? e.message : String(e)}`
      monthErrors.push(msg)
      log.push(`  ERROR ${msg}`)
      continue
    }

    const { rows, rawLines, firstLine } = fetched
    log.push(`  ${fromISO}→${toISO}: ${rawLines} raw lines → ${rows.length} rows for our funds${rawLines < 500 ? ` [first: ${firstLine}]` : ''}`)

    if (rows.length === 0) continue

    // Upsert in chunks of 500
    const CHUNK = 500
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase
        .from('mf_nav_data')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'scheme_code,date' })
      if (error) {
        monthErrors.push(`upsert chunk @ month ${month}+${i}: ${error.message}`)
        log.push(`  upsert error: ${error.message}`)
      } else {
        totalInserted += Math.min(CHUNK, rows.length - i)
      }
    }
    totalRows += rows.length
  }

  log.push(
    `Done — year=${year} | ${totalRows} rows fetched | ${totalInserted} upserted | ${monthErrors.length} errors`,
  )

  return NextResponse.json({
    ok:            monthErrors.length === 0,
    year,
    totalFetched:  totalRows,
    totalInserted,
    errors:        monthErrors,
    log,
  })
}
