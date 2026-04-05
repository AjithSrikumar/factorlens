export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * GET /api/admin/mf-load?batch=N&secret=<CRON_SECRET>
 *
 * Loads full NAV history (since inception) for all tracked index MFs from AMFI.
 * Uses SCHEME_ENTRIES as the definitive fund list — no mfapi.in dependency.
 *
 * AMFI NAV History endpoint:
 *   https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx
 *   ?NavDate=01-Apr-2006&ToNav=<today>&SCode=<schemeCode>
 *   Response: semicolon-delimited  SchemeCode;ISIN1;ISIN2;SchemeName;NAV;Date
 *
 * Usage (run each batch in sequence until done):
 *   GET /api/admin/mf-load?batch=1&secret=<secret>
 *   GET /api/admin/mf-load?batch=2&secret=<secret>
 *   ...
 *   Then run /api/cron/mf-eod to recompute 1Y/3Y/5Y returns.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { SCHEME_ENTRIES } from '@/lib/mf-funds'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'your-service-role-key-here')
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key',
)

const AMFI_HISTORY_BASE = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx'
const AMFI_INCEPTION    = '01-Apr-2006'
const BATCH_SIZE        = 25   // funds per Vercel invocation (AMFI history can be slow)
const CONCURRENCY       = 3    // parallel AMFI requests

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns today in AMFI format: 'DD-Mon-YYYY' (e.g. '05-Apr-2026'), using IST */
function todayAMFI(): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const ist = new Date(Date.now() + 5.5 * 3600_000)
  return `${String(ist.getUTCDate()).padStart(2,'0')}-${MONTHS[ist.getUTCMonth()]}-${ist.getUTCFullYear()}`
}

/**
 * AMFI date 'DD-Mon-YYYY' → ISO 'YYYY-MM-DD'.
 * Returns '' on failure.
 */
function amfiDateToISO(s: string): string {
  const MONTHS: Record<string, string> = {
    Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
  }
  const parts = s.trim().split('-')
  if (parts.length !== 3) return ''
  const [dd, mon, yyyy] = parts
  const mm = MONTHS[mon]
  if (!mm || !/^\d{4}$/.test(yyyy) || !/^\d{1,2}$/.test(dd)) return ''
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
}

// ── AMFI NAV History fetcher ──────────────────────────────────────────────────

async function fetchAmfiHistory(
  schemeCode: number,
  toDate: string,
): Promise<{ date: string; nav: number }[]> {
  const url =
    `${AMFI_HISTORY_BASE}?NavDate=${AMFI_INCEPTION}&ToNav=${toDate}&SCode=${schemeCode}`

  const res = await fetch(url, {
    signal: AbortSignal.timeout(40_000),
    headers: {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Referer':         'https://www.amfiindia.com/net-asset-value/nav-history',
      'Origin':          'https://www.amfiindia.com',
    },
  })

  if (!res.ok) throw new Error(`AMFI HTTP ${res.status}`)

  const text = await res.text()

  // AMFI returns an HTML error page when it blocks the request
  if (text.trimStart().startsWith('<') || text.toLowerCase().includes('<html')) {
    throw new Error('AMFI portal blocked — HTML response received')
  }

  const rows: { date: string; nav: number }[] = []
  for (const line of text.split('\n')) {
    const parts = line.trim().split(';')
    if (parts.length < 6) continue
    const nav  = parseFloat(parts[4])
    const date = amfiDateToISO(parts[5])
    if (!date || isNaN(nav) || nav <= 0) continue
    rows.push({ date, nav })
  }

  if (rows.length === 0) {
    throw new Error('AMFI returned 0 valid rows (may be blocked or no data)')
  }

  return rows
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<{ item: T; result?: R; error?: string }>> {
  const results: Array<{ item: T; result?: R; error?: string }> = []
  let idx = 0
  async function worker() {
    while (idx < items.length) {
      const i = idx++
      try { results[i] = { item: items[i], result: await fn(items[i]) } }
      catch (e) { results[i] = { item: items[i], error: e instanceof Error ? e.message : String(e) } }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth
  const secret   = process.env.CRON_SECRET
  const provided = req.nextUrl.searchParams.get('secret') ??
    (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Deduplicate scheme codes — SCHEME_ENTRIES has one entry per fund×index
  // mapping, so the same schemeCode can appear multiple times.
  const seenCodes = new Set<number>()
  const allEntries = SCHEME_ENTRIES.filter(e => {
    if (seenCodes.has(e.schemeCode)) return false
    seenCodes.add(e.schemeCode)
    return true
  })

  const batchParam  = parseInt(req.nextUrl.searchParams.get('batch') ?? '1', 10)
  const batch       = isNaN(batchParam) || batchParam < 1 ? 1 : batchParam
  const totalBatches = Math.ceil(allEntries.length / BATCH_SIZE)
  const start        = (batch - 1) * BATCH_SIZE
  const batchEntries = allEntries.slice(start, start + BATCH_SIZE)

  const toDate = todayAMFI()
  const log: string[] = [
    `mf-load [AMFI] batch=${batch}/${totalBatches} | ${batchEntries.length} funds | up to ${toDate}`,
    `Source: ${AMFI_HISTORY_BASE} (since ${AMFI_INCEPTION})`,
  ]

  if (batchEntries.length === 0) {
    log.push('All batches complete.')
    return NextResponse.json({ ok: true, batch, totalBatches, totalFetched: 0, totalInserted: 0, errors: [], log })
  }

  // Seed mf_funds with scheme metadata (idempotent — won't overwrite existing rows)
  const seedErr = (await supabase.from('mf_funds').upsert(
    allEntries.map(e => ({ scheme_code: e.schemeCode, scheme_name: e.schemeName })),
    { onConflict: 'scheme_code', ignoreDuplicates: true },
  )).error
  if (seedErr) log.push(`seed warning: ${seedErr.message}`)

  // Fetch history from AMFI for each fund in the batch
  const fetchResults = await runWithConcurrency(
    batchEntries,
    CONCURRENCY,
    (entry) => fetchAmfiHistory(entry.schemeCode, toDate),
  )

  let totalRows     = 0
  let totalInserted = 0
  const errors: string[] = []
  const allRows: Array<{ scheme_code: number; date: string; nav: number }> = []

  for (const r of fetchResults) {
    const entry = r.item
    if (r.error) {
      errors.push(`[${entry.schemeCode}] ${entry.schemeName}: ${r.error}`)
      log.push(`  FAIL  [${entry.schemeCode}] ${entry.schemeName}: ${r.error}`)
    } else {
      const rows = r.result!
      log.push(`  OK    [${entry.schemeCode}] ${entry.schemeName} → ${rows.length} rows`)
      allRows.push(...rows.map(r => ({ scheme_code: entry.schemeCode, date: r.date, nav: r.nav })))
      totalRows += rows.length
    }
  }

  // Upsert in 500-row chunks
  const CHUNK = 500
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const { error } = await supabase
      .from('mf_nav_data')
      .upsert(allRows.slice(i, i + CHUNK), { onConflict: 'scheme_code,date' })
    if (error) {
      errors.push(`upsert @${i}: ${error.message}`)
      log.push(`  UPSERT ERROR @${i}: ${error.message}`)
    } else {
      totalInserted += Math.min(CHUNK, allRows.length - i)
    }
  }

  log.push(`Done — ${totalRows} rows fetched | ${totalInserted} upserted | ${errors.length} errors`)
  if (batch < totalBatches) {
    log.push(`Next: ?batch=${batch + 1}&secret=<secret>`)
  } else {
    log.push('All batches complete! Run /api/cron/mf-eod to recompute 1Y/3Y/5Y returns.')
  }

  return NextResponse.json({
    ok:           errors.length === 0,
    batch,
    totalBatches,
    totalFetched:  totalRows,
    totalInserted,
    errors,
    log,
  })
}
