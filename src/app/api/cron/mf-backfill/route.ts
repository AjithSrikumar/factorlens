/**
 * GET /api/cron/mf-backfill?window=1y|3y|5y
 *
 * Fetches historical NAV data from AMFI for a ±30-day window around
 * 1 / 3 / 5 years ago, then inserts into mf_nav_data.
 *
 * Run once per window:
 *   curl -H "Authorization: Bearer <CRON_SECRET>" \
 *        "https://factorlens.vercel.app/api/cron/mf-backfill?window=1y"
 *   ... repeat with window=3y and window=5y
 *
 * After all three, trigger mf-eod to recompute returns.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoToAmfi(iso: string): string {
  // '2025-03-21' → '21-Mar-2025'
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const [yyyy, mm, dd] = iso.split('-')
  return `${dd}-${MONTHS[parseInt(mm, 10) - 1]}-${yyyy}`
}

function amfiToISO(s: string): string {
  // '21-Mar-2025' → '2025-03-21'
  const MONTHS: Record<string, string> = {
    Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
    Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
  }
  const parts = s.trim().split('-')
  if (parts.length !== 3) return ''
  const mm = MONTHS[parts[1]]
  if (!mm) return ''
  return `${parts[2]}-${mm}-${parts[0].padStart(2, '0')}`
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Fetch AMFI historical NAV for a date range (all fund houses, mf=0).
 * Response format per line:
 *   SchemeCode;ISIN;ISIN2;SchemeName;NAV;RepurchasePrice;SalePrice;Date
 * Returns a map of schemeCode → list of { date, nav } rows.
 */
async function fetchAmfiHistory(
  fromISO: string,
  toISO: string,
  log: string[],
): Promise<Map<number, Array<{ date: string; nav: number }>>> {
  const from = isoToAmfi(fromISO)
  const to   = isoToAmfi(toISO)
  const url  = `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?mf=0&frmdt=${from}&todt=${to}`

  log.push(`Fetching AMFI history: ${from} → ${to}`)
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`AMFI history HTTP ${res.status} for ${from}→${to}`)

  const text = await res.text()
  const lines = text.split('\n')
  log.push(`  raw lines: ${lines.length}`)

  const byScheme = new Map<number, Array<{ date: string; nav: number }>>()
  let parsed = 0

  for (const line of lines) {
    const parts = line.trim().split(';')
    // Expect at least 8 fields: Code;ISIN;ISIN2;Name;NAV;Repurchase;Sale;Date
    if (parts.length < 8) continue
    const code = parseInt(parts[0], 10)
    if (isNaN(code)) continue
    const nav  = parseFloat(parts[4])
    const date = amfiToISO(parts[7])
    if (!date || isNaN(nav) || nav <= 0) continue
    if (!byScheme.has(code)) byScheme.set(code, [])
    byScheme.get(code)!.push({ date, nav })
    parsed++
  }

  log.push(`  parsed ${parsed} rows for ${byScheme.size} schemes`)
  return byScheme
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth
  const authHeader  = req.headers.get('authorization') ?? ''
  const cronSecret  = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const windowParam = req.nextUrl.searchParams.get('window') ?? '1y'
  if (!['1y', '3y', '5y'].includes(windowParam)) {
    return NextResponse.json(
      { error: 'window must be 1y, 3y, or 5y' },
      { status: 400 },
    )
  }

  const log: string[] = [`mf-backfill started — window=${windowParam}`]
  const today  = todayIST()
  const years  = windowParam === '1y' ? 1 : windowParam === '3y' ? 3 : 5
  const target = addDays(today, -365 * years)
  // ±30-day window around the target to capture the nearest trading day
  const from   = addDays(target, -30)
  const to     = addDays(target, +30)

  log.push(`Today: ${today} | Target: ${target} | Range: ${from} → ${to}`)

  try {
    // 1. Get scheme codes we care about
    const { data: funds, error: fundsErr } = await supabase
      .from('mf_funds')
      .select('scheme_code')
    if (fundsErr || !funds) {
      return NextResponse.json({ error: `load mf_funds: ${fundsErr?.message}`, log }, { status: 500 })
    }
    const ourCodes = new Set(funds.map(f => f.scheme_code as number))
    log.push(`Our scheme codes: ${ourCodes.size}`)

    // 2. Fetch AMFI history for the window
    let amfiData: Map<number, Array<{ date: string; nav: number }>>
    try {
      amfiData = await fetchAmfiHistory(from, to, log)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.push(`AMFI fetch failed: ${msg}`)
      return NextResponse.json({ ok: false, error: msg, log }, { status: 500 })
    }

    // 3. Filter to our funds only and build insert rows
    const rows: Array<{ scheme_code: number; date: string; nav: number }> = []
    for (const [code, entries] of amfiData.entries()) {
      if (!ourCodes.has(code)) continue
      for (const e of entries) {
        rows.push({ scheme_code: code, date: e.date, nav: e.nav })
      }
    }
    log.push(`Rows to upsert for our funds: ${rows.length}`)

    // 4. Upsert in chunks
    const CHUNK = 500
    let inserted = 0
    let upsertErrors = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase
        .from('mf_nav_data')
        .upsert(rows.slice(i, i + CHUNK), { onConflict: 'scheme_code,date' })
      if (error) {
        log.push(`upsert error (chunk ${Math.floor(i / CHUNK) + 1}): ${error.message}`)
        upsertErrors++
      } else {
        inserted += Math.min(CHUNK, rows.length - i)
      }
    }

    log.push(`Done — inserted ${inserted} rows, ${upsertErrors} chunk errors`)
    return NextResponse.json({ ok: true, window: windowParam, inserted, log })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`FATAL: ${msg}`)
    return NextResponse.json({ ok: false, error: msg, log }, { status: 500 })
  }
}
