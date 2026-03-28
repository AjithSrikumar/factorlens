export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/mf-backfill?batch=N
 *
 * Fetches the COMPLETE NAV history (since inception) for a batch of funds from
 * AMFI's NAV History download API and upserts into mf_nav_data.
 *
 * Primary source: AMFI NAV History
 *   https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx
 *   ?NavDate=01-Apr-2006&ToNav={today}&SCode={schemeCode}
 *
 * Fallback: mfapi.in (public AMFI mirror)
 *   https://api.mfapi.in/mf/{schemeCode}
 *   Used automatically when AMFI returns an HTML error page (Vercel IP block).
 *
 * Batching — each call processes BATCH_SIZE funds to stay within Vercel's 300s limit.
 *   batch=1  → funds  1–30
 *   batch=2  → funds 31–60
 *   …  (ceil(286/30) = ~10 batches total)
 *
 * Usage (PowerShell):
 *   $secret = "<CRON_SECRET>"
 *   1..10 | ForEach-Object {
 *     Write-Host "Batch $_..."
 *     Invoke-WebRequest -Uri "https://factorlens.vercel.app/api/cron/mf-backfill?batch=$_" `
 *       -Headers @{ Authorization = "Bearer $secret" } | Select-Object -ExpandProperty Content
 *     Start-Sleep -Seconds 5
 *   }
 *
 * After all batches complete, trigger mf-eod to recompute 1y/3y/5y returns.
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

const BATCH_SIZE  = 30   // funds per Vercel invocation
const CONCURRENCY = 3    // parallel requests at a time (conservative for AMFI)

// AMFI NAV History download endpoint
const AMFI_HISTORY_BASE = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx'
const AMFI_INCEPTION    = '01-Apr-2006'  // earliest date AMFI provides data for

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns today in AMFI format: 'DD-Mon-YYYY' (e.g. '22-Mar-2026') */
function todayAMFI(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dd  = String(ist.getDate()).padStart(2, '0')
  const mon = MONTHS[ist.getMonth()]
  const yyyy = ist.getFullYear()
  return `${dd}-${mon}-${yyyy}`
}

/**
 * 'DD-Mon-YYYY' (AMFI format) → 'YYYY-MM-DD' (ISO).
 * Returns '' on parse failure.
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

/**
 * 'DD-MM-YYYY' (mfapi.in format) → 'YYYY-MM-DD' (ISO).
 * Returns '' on parse failure.
 */
function mfapiDateToISO(s: string): string {
  const p = s.trim().split('-')
  if (p.length !== 3) return ''
  const [dd, mm, yyyy] = p
  if (!/^\d{2}$/.test(dd) || !/^\d{2}$/.test(mm) || !/^\d{4}$/.test(yyyy)) return ''
  return `${yyyy}-${mm}-${dd}`
}

// ── AMFI NAV History fetcher ──────────────────────────────────────────────────
//
// Downloads full NAV history for a single scheme from AMFI's portal.
// Response is semicolon-delimited text identical to NAVAll.txt but for a date range:
//   SchemeCode;ISIN1;ISIN2;SchemeName;NAV;Date
//   100822;INF...;INF...;UTI Nifty 50 Index Fund;10.1234;22-Mar-2026
//
// Browser-like headers are sent to avoid the Vercel IP block that portal.amfiindia.com
// applies to server/bot requests. Falls back to mfapi.in if an HTML page is returned.

async function fetchAmfiHistory(
  schemeCode: number,
  toDate: string,
): Promise<{ rows: Array<{ scheme_code: number; date: string; nav: number }>; source: 'amfi' | 'mfapi' }> {
  const url = `${AMFI_HISTORY_BASE}?NavDate=${AMFI_INCEPTION}&ToNav=${toDate}&SCode=${schemeCode}`

  let amfiBlocked = false
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer':         'https://www.amfiindia.com/net-asset-value/nav-history',
        'Origin':          'https://www.amfiindia.com',
      },
    })

    if (!res.ok) {
      amfiBlocked = true
    } else {
      const text = await res.text()

      // Detect HTML error page (portal returns HTML when blocking server IPs)
      if (text.trimStart().startsWith('<') || text.toLowerCase().includes('<html')) {
        amfiBlocked = true
      } else {
        // Parse semicolon-delimited NAV data
        const rows: Array<{ scheme_code: number; date: string; nav: number }> = []
        for (const line of text.split('\n')) {
          const parts = line.trim().split(';')
          if (parts.length < 6) continue
          const code = parseInt(parts[0], 10)
          if (isNaN(code)) continue
          const nav  = parseFloat(parts[4])
          const date = amfiDateToISO(parts[5])
          if (!date || isNaN(nav) || nav <= 0) continue
          rows.push({ scheme_code: code, date, nav })
        }

        if (rows.length > 0) {
          return { rows, source: 'amfi' }
        }
        // Empty response = blocked or no data; fall through to mfapi.in
        amfiBlocked = true
      }
    }
  } catch {
    amfiBlocked = true
  }

  if (amfiBlocked) {
    // ── Fallback: mfapi.in ─────────────────────────────────────────────────
    const mfUrl = `https://api.mfapi.in/mf/${schemeCode}`
    const mfRes = await fetch(mfUrl, { signal: AbortSignal.timeout(30_000) })
    if (!mfRes.ok) throw new Error(`mfapi HTTP ${mfRes.status} for scheme ${schemeCode}`)

    const json = await mfRes.json() as { data: Array<{ date: string; nav: string }> }
    if (!Array.isArray(json.data)) throw new Error(`unexpected mfapi response for scheme ${schemeCode}`)

    const rows: Array<{ scheme_code: number; date: string; nav: number }> = []
    for (const entry of json.data) {
      const date = mfapiDateToISO(entry.date)
      const nav  = parseFloat(entry.nav)
      if (!date || isNaN(nav) || nav <= 0) continue
      rows.push({ scheme_code: schemeCode, date, nav })
    }

    return { rows, source: 'mfapi' }
  }

  throw new Error(`No data for scheme ${schemeCode}`)
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
      try {
        results[i] = { item: items[i], result: await fn(items[i]) }
      } catch (e) {
        results[i] = { item: items[i], error: e instanceof Error ? e.message : String(e) }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && req.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse ?batch=
  const batchParam = req.nextUrl.searchParams.get('batch')
  const batch = batchParam ? parseInt(batchParam, 10) : 1
  if (isNaN(batch) || batch < 1) {
    return NextResponse.json({ error: 'Invalid batch (must be >= 1)' }, { status: 400 })
  }

  const toDate = todayAMFI()
  const log: string[] = [
    `mf-backfill batch=${batch} | fetching historical NAV since ${AMFI_INCEPTION} up to ${toDate}`,
    `Primary source: AMFI NAV History (portal.amfiindia.com) | Fallback: mfapi.in`,
  ]

  // 1. Load scheme codes from mf_funds
  const { data: funds, error: fundsErr } = await supabase
    .from('mf_funds')
    .select('scheme_code')
    .order('scheme_code')
  if (fundsErr || !funds) {
    return NextResponse.json({ error: `load mf_funds: ${fundsErr?.message}`, log }, { status: 500 })
  }

  const totalFunds   = funds.length
  const totalBatches = Math.ceil(totalFunds / BATCH_SIZE)
  const start        = (batch - 1) * BATCH_SIZE
  const end          = Math.min(start + BATCH_SIZE, totalFunds)
  const batchFunds   = funds.slice(start, end)

  log.push(`${totalFunds} funds total | batch ${batch}/${totalBatches} → funds ${start + 1}–${end} (${batchFunds.length} funds)`)

  if (batchFunds.length === 0) {
    log.push('No funds in this batch — all done.')
    return NextResponse.json({ ok: true, batch, totalBatches, totalFetched: 0, totalInserted: 0, errors: [], log })
  }

  // 2. Fetch NAV history (CONCURRENCY at a time)
  const schemeCodes = batchFunds.map(f => f.scheme_code as number)
  log.push(`Fetching ${schemeCodes.length} funds (concurrency=${CONCURRENCY})…`)

  const fetchResults = await runWithConcurrency(
    schemeCodes,
    CONCURRENCY,
    (code) => fetchAmfiHistory(code, toDate),
  )

  let totalRows     = 0
  let totalInserted = 0
  let amfiCount     = 0
  let mfapiCount    = 0
  const fetchErrors: string[] = []
  const allRows: Array<{ scheme_code: number; date: string; nav: number }> = []

  for (const r of fetchResults) {
    if (r.error) {
      fetchErrors.push(`scheme ${r.item}: ${r.error}`)
      log.push(`  SKIP scheme ${r.item}: ${r.error}`)
    } else {
      const { rows, source } = r.result!
      if (source === 'amfi') amfiCount++; else mfapiCount++
      log.push(`  scheme ${r.item}: ${rows.length} nav entries [${source}]`)
      allRows.push(...rows)
      totalRows += rows.length
    }
  }

  log.push(
    `Fetched ${totalRows} rows across ${schemeCodes.length - fetchErrors.length} funds ` +
    `(AMFI: ${amfiCount}, mfapi.in: ${mfapiCount})`
  )

  // 3. Upsert in chunks of 500
  if (allRows.length > 0) {
    const CHUNK = 500
    for (let i = 0; i < allRows.length; i += CHUNK) {
      const { error } = await supabase
        .from('mf_nav_data')
        .upsert(allRows.slice(i, i + CHUNK), { onConflict: 'scheme_code,date' })
      if (error) {
        fetchErrors.push(`upsert chunk @${i}: ${error.message}`)
        log.push(`  upsert ERROR @${i}: ${error.message}`)
      } else {
        totalInserted += Math.min(CHUNK, allRows.length - i)
      }
    }
  }

  log.push(
    `Done — batch ${batch}/${totalBatches} | ${totalRows} rows fetched | ${totalInserted} upserted | ${fetchErrors.length} errors`
  )
  if (batch < totalBatches) {
    log.push(`Next: call ?batch=${batch + 1} to continue`)
  } else {
    log.push('All batches complete! Run mf-eod once to recompute 1y/3y/5y returns.')
  }

  return NextResponse.json({
    ok:           fetchErrors.length === 0,
    batch,
    totalBatches,
    totalFetched:  totalRows,
    totalInserted,
    amfiCount,
    mfapiCount,
    errors:        fetchErrors,
    log,
  })
}
