/**
 * /api/nav-sync — NAV sync endpoint
 *
 * POST /api/nav-sync?action=full&batch=N     — Sync batch N (20 funds, N=0,1,…)
 * POST /api/nav-sync?action=daily            — Fetch today's latest NAV for all funds
 * POST /api/nav-sync?action=normalize        — Re-run split detection & normalization
 * GET  /api/nav-sync                         — Sync status (how many funds synced)
 *
 * Auth: Vercel cron → Authorization: Bearer CRON_SECRET header
 *       Manual call → ?secret=SYNC_SECRET query param
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin }             from '@/lib/supabase-server'
import { fetchViaProxy }             from '@/lib/fetch-proxy'
import { SCHEME_ENTRIES }            from '@/lib/mf-funds'
import {
  detectSplits,
  normalizeHistory,
  computeMetrics,
  type NavRow,
} from '@/lib/nav-normalize'

// Vercel: allow up to 5 minutes for full batch syncs
export const maxDuration = 300

const MFAPI_BASE   = 'https://api.mfapi.in/mf'
const BATCH_SIZE   = 10   // funds per full-sync batch (keep under timeout)
const FETCH_CONCUR = 10   // parallel mfapi.in requests

// ── Auth ──────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  // Vercel cron sends: Authorization: Bearer <CRON_SECRET>
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true

  // Manual call: ?secret=<SYNC_SECRET>
  const secret     = new URL(req.url).searchParams.get('secret')
  const syncSecret = process.env.SYNC_SECRET
  if (syncSecret && secret === syncSecret) return true

  // Dev mode: allow if no secrets configured
  if (!cronSecret && !syncSecret) return true

  return false
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function mfapiDateToISO(s: string): string {
  const MONTHS: Record<string, string> = {
    Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
  }
  const parts = s.trim().split('-')
  if (parts.length !== 3) return ''
  const [dd, mon, yyyy] = parts
  if (/^\d+$/.test(mon)) return `${yyyy}-${mon.padStart(2,'0')}-${dd.padStart(2,'0')}`
  const mm = MONTHS[mon]
  if (!mm) return ''
  return `${yyyy}-${mm}-${dd.padStart(2,'0')}`
}

// ── mfapi.in fetch ────────────────────────────────────────────────────────────

interface MfapiResponse {
  status: string
  meta:   Record<string, string | number>
  data:   Array<{ date: string; nav: string }>
}

async function fetchFullHistory(schemeCode: number): Promise<{ meta: MfapiResponse['meta']; history: NavRow[] } | null> {
  try {
    const res = await fetchViaProxy(`${MFAPI_BASE}/${schemeCode}`, {
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return null

    const json = await res.json() as MfapiResponse
    if (json.status !== 'SUCCESS' || !json.data?.length) return null

    // mfapi.in returns newest-first → reverse to chronological
    const history: NavRow[] = json.data
      .map(r => ({ date: mfapiDateToISO(r.date), nav: parseFloat(r.nav) }))
      .filter(r => r.date.length === 10 && !isNaN(r.nav) && r.nav > 0)
      .reverse()

    if (!history.length) return null
    return { meta: json.meta, history }
  } catch {
    return null
  }
}

// ── Normalize a single fund ───────────────────────────────────────────────────

async function normalizeFund(schemeCode: number): Promise<{ splits: number; rows: number }> {
  // Fetch all nav_history for this fund from Supabase
  const { data: rows, error } = await supabaseAdmin
    .from('nav_history')
    .select('date, nav')
    .eq('scheme_code', schemeCode)
    .order('date', { ascending: true })
    .limit(10_000)

  if (error || !rows?.length) return { splits: 0, rows: 0 }

  const history: NavRow[] = rows.map(r => ({ date: r.date as string, nav: Number(r.nav) }))

  // Detect splits
  const splits = detectSplits(history, schemeCode)

  // Upsert split_events (ignore duplicates)
  if (splits.length) {
    await supabaseAdmin.from('split_events').upsert(
      splits.map(s => ({
        scheme_code:   s.scheme_code,
        split_date:    s.split_date,
        ratio:         s.ratio,
        auto_detected: s.auto_detected,
        notes:         s.notes ?? null,
      })),
      { onConflict: 'scheme_code,split_date', ignoreDuplicates: true }
    )
  }

  // Fetch stored splits (include any manually-added ones)
  const { data: storedSplits } = await supabaseAdmin
    .from('split_events')
    .select('split_date, ratio')
    .eq('scheme_code', schemeCode)
    .order('split_date', { ascending: true })

  const allSplits = (storedSplits ?? []).map(s => ({
    scheme_code:   schemeCode,
    split_date:    s.split_date as string,
    ratio:         Number(s.ratio),
    auto_detected: true,
  }))

  // Compute adjusted NAVs
  const adjNavs = normalizeHistory(history, allSplits)

  // Build normalized history for metric computation
  const normalizedHistory: NavRow[] = history.map((h, i) => ({
    date: h.date,
    nav:  adjNavs[i],
  }))

  // Upsert nav_adj back to Supabase in chunks (avoid payload size limits)
  const CHUNK = 1000
  for (let i = 0; i < history.length; i += CHUNK) {
    const chunk = history.slice(i, i + CHUNK)
    await supabaseAdmin.from('nav_history').upsert(
      chunk.map((h, j) => ({
        scheme_code: schemeCode,
        date:        h.date,
        nav:         h.nav,
        nav_adj:     adjNavs[i + j],
      })),
      { onConflict: 'scheme_code,date' }
    )
  }

  // Recompute metrics from normalized history and update funds table
  const metrics = computeMetrics(normalizedHistory)
  const latest  = normalizedHistory[normalizedHistory.length - 1]

  await supabaseAdmin.from('funds').update({
    nav:            latest.nav,
    nav_date:       latest.date,
    return_1y:      metrics.return_1y,
    return_3y:      metrics.return_3y,
    return_5y:      metrics.return_5y,
    cagr_inception: metrics.cagr_inception,
    total_return:   metrics.total_return,
    volatility:     metrics.volatility,
    max_drawdown:   metrics.max_drawdown,
    sharpe:         metrics.sharpe,
    updated_at:     new Date().toISOString(),
  }).eq('scheme_code', schemeCode)

  return { splits: splits.length, rows: history.length }
}

// ── Full sync: one batch of BATCH_SIZE funds ──────────────────────────────────

async function runFullBatch(batchNum: number): Promise<NextResponse> {
  const allEntries  = SCHEME_ENTRIES
  const totalFunds  = allEntries.length
  const totalBatches = Math.ceil(totalFunds / BATCH_SIZE)

  if (batchNum >= totalBatches) {
    return NextResponse.json({ done: true, message: 'All batches complete' })
  }

  const batch   = allEntries.slice(batchNum * BATCH_SIZE, (batchNum + 1) * BATCH_SIZE)
  const synced: number[] = []
  const failed: number[] = []

  // Fetch all funds in this batch concurrently (respects FETCH_CONCUR)
  for (let i = 0; i < batch.length; i += FETCH_CONCUR) {
    const chunk = batch.slice(i, i + FETCH_CONCUR)
    await Promise.all(
      chunk.map(async entry => {
        const result = await fetchFullHistory(entry.schemeCode)
        if (!result) { failed.push(entry.schemeCode); return }

        const { meta, history } = result
        const latest    = history[history.length - 1]
        const inception = history[0]

        // Upsert fund metadata
        await supabaseAdmin.from('funds').upsert({
          scheme_code:     entry.schemeCode,
          scheme_name:     String(meta['scheme_name']     ?? entry.schemeName),
          fund_house:      String(meta['fund_house']      ?? ''),
          scheme_category: String(meta['scheme_category'] ?? ''),
          scheme_type:     String(meta['scheme_type']     ?? ''),
          inception_date:  inception.date,
          nav:             latest.nav,
          nav_date:        latest.date,
          last_nav_sync:   new Date().toISOString(),
        }, { onConflict: 'scheme_code' })

        // Upsert raw NAV history in chunks (no nav_adj yet — normalization runs next)
        const CHUNK = 1000
        for (let j = 0; j < history.length; j += CHUNK) {
          const rows = history.slice(j, j + CHUNK)
          await supabaseAdmin.from('nav_history').upsert(
            rows.map(h => ({
              scheme_code: entry.schemeCode,
              date:        h.date,
              nav:         h.nav,
              nav_adj:     h.nav,  // default = raw (will be corrected by normalize step)
            })),
            { onConflict: 'scheme_code,date', ignoreDuplicates: true }
          )
        }

        // Run normalization immediately for this fund
        await normalizeFund(entry.schemeCode)
        synced.push(entry.schemeCode)
      })
    )
  }

  const done = batchNum + 1 >= totalBatches
  return NextResponse.json({
    batch:        batchNum,
    synced:       synced.length,
    failed:       failed.length,
    totalBatches,
    nextBatch:    done ? null : batchNum + 1,
    done,
  })
}

// ── Daily sync: fetch latest NAV for all funds ────────────────────────────────

async function runDailySync(): Promise<NextResponse> {
  const allEntries = SCHEME_ENTRIES
  const updated: number[] = []
  const failed:  number[] = []

  // Process in parallel batches of FETCH_CONCUR
  for (let i = 0; i < allEntries.length; i += FETCH_CONCUR) {
    const chunk = allEntries.slice(i, i + FETCH_CONCUR)
    await Promise.all(
      chunk.map(async entry => {
        try {
          const res = await fetchViaProxy(`${MFAPI_BASE}/${entry.schemeCode}`, {
            signal: AbortSignal.timeout(15_000),
          })
          if (!res.ok) { failed.push(entry.schemeCode); return }

          const json = await res.json() as MfapiResponse
          if (json.status !== 'SUCCESS' || !json.data?.length) {
            failed.push(entry.schemeCode); return
          }

          // Only process the latest NAV record (first item, newest-first)
          const latest = json.data[0]
          const date   = mfapiDateToISO(latest.date)
          const nav    = parseFloat(latest.nav)
          if (!date || isNaN(nav) || nav <= 0) { failed.push(entry.schemeCode); return }

          // Insert new NAV record (skip if already exists)
          const { error: insertErr } = await supabaseAdmin.from('nav_history').upsert(
            { scheme_code: entry.schemeCode, date, nav, nav_adj: nav },
            { onConflict: 'scheme_code,date', ignoreDuplicates: true }
          )
          if (insertErr) { failed.push(entry.schemeCode); return }

          // Update latest NAV in funds table and re-run normalization
          await supabaseAdmin.from('funds').update({
            nav,
            nav_date:      date,
            last_nav_sync: new Date().toISOString(),
          }).eq('scheme_code', entry.schemeCode)

          // Recompute metrics with updated + normalized history
          await normalizeFund(entry.schemeCode)
          updated.push(entry.schemeCode)
        } catch {
          failed.push(entry.schemeCode)
        }
      })
    )
  }

  return NextResponse.json({
    action:  'daily',
    updated: updated.length,
    failed:  failed.length,
    at:      new Date().toISOString(),
  })
}

// ── Normalize all funds ───────────────────────────────────────────────────────

async function runNormalizeAll(): Promise<NextResponse> {
  const codes   = [...new Set(SCHEME_ENTRIES.map(e => e.schemeCode))]
  const results: Array<{ code: number; splits: number; rows: number }> = []
  const failed:  number[] = []

  for (let i = 0; i < codes.length; i += FETCH_CONCUR) {
    const chunk = codes.slice(i, i + FETCH_CONCUR)
    await Promise.all(
      chunk.map(async code => {
        try {
          const r = await normalizeFund(code)
          results.push({ code, ...r })
        } catch {
          failed.push(code)
        }
      })
    )
  }

  const totalSplitsDetected = results.reduce((s, r) => s + r.splits, 0)
  return NextResponse.json({
    action:  'normalize',
    funds:   results.length,
    splits:  totalSplitsDetected,
    failed:  failed.length,
    at:      new Date().toISOString(),
  })
}

// ── Handlers ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Status check — public endpoint
  const { data: fundsData } = await supabaseAdmin
    .from('funds')
    .select('scheme_code, last_nav_sync')
    .not('last_nav_sync', 'is', null)
    .limit(1)

  const totalEntries  = SCHEME_ENTRIES.length
  const totalBatches  = Math.ceil(totalEntries / BATCH_SIZE)

  const { count } = await supabaseAdmin
    .from('funds')
    .select('*', { count: 'exact', head: true })
    .not('last_nav_sync', 'is', null)

  const { count: navCount } = await supabaseAdmin
    .from('nav_history')
    .select('*', { count: 'exact', head: true })

  return NextResponse.json({
    synced_funds:   count ?? 0,
    total_funds:    totalEntries,
    total_batches:  totalBatches,
    batch_size:     BATCH_SIZE,
    nav_rows:       navCount ?? 0,
    has_data:       Boolean(fundsData?.length),
    instructions: {
      full_sync:  `POST /api/nav-sync?action=full&batch=0  (then batch=1,2,… up to ${totalBatches - 1})`,
      daily_sync: 'POST /api/nav-sync?action=daily',
      normalize:  'POST /api/nav-sync?action=normalize',
    },
  })
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') ?? 'daily'

  if (action === 'full') {
    const batch = parseInt(searchParams.get('batch') ?? '0', 10)
    if (isNaN(batch) || batch < 0) {
      return NextResponse.json({ error: 'Invalid batch number' }, { status: 400 })
    }
    return runFullBatch(batch)
  }

  if (action === 'daily')     return runDailySync()
  if (action === 'normalize') return runNormalizeAll()

  return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
}
