/**
 * GET /api/cron/mf-backfill?batch=N
 *
 * Fetches the COMPLETE NAV history for a batch of funds from mfapi.in and
 * upserts into mf_nav_data.
 *
 * Why mfapi.in instead of portal.amfiindia.com?
 *   portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx blocks requests from
 *   Vercel's server IPs (returns an empty HTML page).  mfapi.in is a public
 *   AMFI mirror that works fine from server environments.
 *
 * Batching — each call processes BATCH_SIZE funds to stay within Vercel's 300 s limit.
 *
 *   batch=1  → funds  1–30
 *   batch=2  → funds 31–60
 *   …
 *   (ceil(286/30) = 10 batches total)
 *
 * Usage (PowerShell):
 *   $secret = "<CRON_SECRET>"
 *   1..10 | ForEach-Object {
 *     Write-Host "Batch $_..."
 *     curl.exe -s -H "Authorization: Bearer $secret" `
 *       "https://factorlens.vercel.app/api/cron/mf-backfill?batch=$_"
 *     Write-Host ""
 *     Start-Sleep -Seconds 3
 *   }
 *
 * After all batches complete, trigger mf-eod once to recompute 1y/3y/5y returns.
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
const CONCURRENCY = 5    // parallel mfapi.in requests at a time

// ── Date helper ───────────────────────────────────────────────────────────────

/**
 * mfapi.in returns dates as "DD-MM-YYYY" (e.g. "21-03-2025").
 * Converts to ISO "YYYY-MM-DD". Returns '' on failure.
 */
function mfapiDateToISO(s: string): string {
  const p = s.trim().split('-')
  if (p.length !== 3) return ''
  const [dd, mm, yyyy] = p
  if (!/^\d{2}$/.test(dd) || !/^\d{2}$/.test(mm) || !/^\d{4}$/.test(yyyy)) return ''
  return `${yyyy}-${mm}-${dd}`
}

// ── mfapi.in fetcher ──────────────────────────────────────────────────────────

interface MfapiResponse {
  data: Array<{ date: string; nav: string }>
}

async function fetchFundHistory(
  schemeCode: number,
): Promise<Array<{ scheme_code: number; date: string; nav: number }>> {
  const url = `https://api.mfapi.in/mf/${schemeCode}`
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`mfapi HTTP ${res.status} for scheme ${schemeCode}`)

  const json = await res.json() as MfapiResponse
  if (!Array.isArray(json.data)) throw new Error(`unexpected response for scheme ${schemeCode}`)

  const rows: Array<{ scheme_code: number; date: string; nav: number }> = []
  for (const entry of json.data) {
    const date = mfapiDateToISO(entry.date)
    const nav  = parseFloat(entry.nav)
    if (!date || isNaN(nav) || nav <= 0) continue
    rows.push({ scheme_code: schemeCode, date, nav })
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

  const log: string[] = [`mf-backfill batch=${batch} | fetching from mfapi.in`]

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

  // 2. Fetch NAV history from mfapi.in (CONCURRENCY at a time)
  const schemeCodes = batchFunds.map(f => f.scheme_code as number)
  log.push(`Fetching ${schemeCodes.length} funds (concurrency=${CONCURRENCY})…`)

  const fetchResults = await runWithConcurrency(schemeCodes, CONCURRENCY, fetchFundHistory)

  let totalRows      = 0
  let totalInserted  = 0
  const fetchErrors: string[] = []
  const allRows: Array<{ scheme_code: number; date: string; nav: number }> = []

  for (const r of fetchResults) {
    if (r.error) {
      fetchErrors.push(`scheme ${r.item}: ${r.error}`)
      log.push(`  SKIP scheme ${r.item}: ${r.error}`)
    } else {
      const rows = r.result!
      log.push(`  scheme ${r.item}: ${rows.length} nav entries`)
      allRows.push(...rows)
      totalRows += rows.length
    }
  }

  log.push(`Fetched ${totalRows} rows across ${schemeCodes.length - fetchErrors.length} funds`)

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

  log.push(`Done — batch ${batch}/${totalBatches} | ${totalRows} rows fetched | ${totalInserted} upserted | ${fetchErrors.length} errors`)
  if (batch < totalBatches) {
    log.push(`Next: call ?batch=${batch + 1} to continue`)
  } else {
    log.push('All batches complete! Run mf-eod to recompute 1y/3y/5y returns.')
  }

  return NextResponse.json({
    ok:            fetchErrors.length === 0,
    batch,
    totalBatches,
    totalFetched:  totalRows,
    totalInserted,
    errors:        fetchErrors,
    log,
  })
}
