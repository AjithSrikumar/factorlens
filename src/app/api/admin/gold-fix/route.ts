/**
 * GET /api/admin/gold-fix
 *
 * Fixes Gold ETF (GOLDBEES.NS) historical data in two steps:
 *
 * Step 1 — Split normalization (Dec 2019):
 *   GOLDBEES had a 1:10 face-value split in Dec 2019.
 *   Values before the split are ~260; after ~26. This causes a false dip
 *   in charts. We detect the split point and divide all pre-split values
 *   by 10 so the full history is on the post-split scale.
 *
 * Step 2 — Proxy backfill (Apr 2005 → GOLDBEES inception Mar 2007):
 *   Fetches COMEX Gold (GC=F) from Yahoo Finance for 2005-04-01 to
 *   2007-03-21 and scales it to match the first GOLDBEES value, then
 *   inserts the scaled proxy rows into nav_data.
 *
 * Requires SUPABASE_DB_URL (server-side Postgres connection).
 */
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'

interface NavRow { fund_id: number; date: string; nav_value: number }

async function fetchYahoo(symbol: string, fromISO: string, toISO: string): Promise<{ date: string; value: number }[]> {
  const period1 = Math.floor(new Date(fromISO).getTime() / 1000)
  const period2 = Math.floor(new Date(toISO).getTime() / 1000) + 86400
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${period1}&period2=${period2}&events=history`
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`)
  const json = await res.json() as {
    chart: { result?: Array<{ timestamp?: number[]; indicators?: { adjclose?: Array<{ adjclose?: number[] }>; quote?: Array<{ close?: number[] }> } }> }
  }
  const result = json?.chart?.result?.[0]
  if (!result) return []
  const timestamps = result.timestamp ?? []
  const closes = result.indicators?.adjclose?.[0]?.adjclose ?? result.indicators?.quote?.[0]?.close ?? []
  const deduped = new Map<string, number>()
  timestamps.forEach((ts, i) => {
    const date = new Date(ts * 1000).toISOString().slice(0, 10)
    const v = closes[i]
    if (v != null && !isNaN(v) && v > 0) deduped.set(date, v)
  })
  return Array.from(deduped.entries()).map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date))
}

export async function GET(req: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 })

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry') === 'true'
  const log: string[] = []

  // ── 1. Get GOLD fund id ────────────────────────────────────────────────────
  const { data: fund } = await supabaseAdmin.from('funds').select('id').eq('code', 'GOLD').single()
  if (!fund) return NextResponse.json({ error: 'GOLD fund not found in DB' }, { status: 404 })
  const fundId: number = fund.id
  log.push(`GOLD fund id: ${fundId}`)

  // ── 2. Load all existing GOLD nav_data ────────────────────────────────────
  const { data: existing, error: loadErr } = await supabaseAdmin
    .from('nav_data')
    .select('date, nav_value')
    .eq('fund_id', fundId)
    .order('date', { ascending: true })
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  const rows = (existing ?? []).map(r => ({ date: r.date as string, value: Number(r.nav_value) }))
  log.push(`Loaded ${rows.length} existing rows`)

  if (rows.length < 2) return NextResponse.json({ error: 'Not enough data to process', log }, { status: 400 })

  // ── 3. Detect and fix the Dec 2019 split ──────────────────────────────────
  // Find the first consecutive-day drop of > 60% (split signature)
  let splitIdx = -1
  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1].value
    const curr = rows[i].value
    if (prev > 0 && curr / prev < 0.4 && prev > 50) {
      splitIdx = i
      log.push(`Split detected between ${rows[i-1].date} (${prev.toFixed(2)}) → ${rows[i].date} (${curr.toFixed(2)})`)
      break
    }
  }

  let fixedRows = rows
  if (splitIdx > 0) {
    // Divide all pre-split values by 10 to normalise to post-split scale
    const splitRatio = rows[splitIdx].value / rows[splitIdx - 1].value
    const normFactor = splitRatio  // ≈ 0.1
    fixedRows = rows.map((r, i) => ({
      date: r.date,
      value: i < splitIdx ? r.value * normFactor : r.value,
    }))
    log.push(`Normalised ${splitIdx} pre-split rows by factor ${normFactor.toFixed(4)}`)
  } else {
    log.push('No split detected — values already on consistent scale')
  }

  // ── 4. Backfill proxy data from Apr 2005 to day before first GOLDBEES row ──
  const firstDate = fixedRows[0].date  // first GOLDBEES data point (2007-03-22 ish)
  const proxyEnd  = firstDate          // fetch proxy up to (not including) first GOLDBEES date
  const proxyStart = '2005-04-01'

  let proxyRows: { date: string; value: number }[] = []
  if (proxyStart < proxyEnd) {
    log.push(`Fetching GC=F proxy from ${proxyStart} to ${proxyEnd}…`)
    try {
      const raw = await fetchYahoo('GC=F', proxyStart, proxyEnd)
      // Only keep rows strictly before firstDate
      const preFirst = raw.filter(r => r.date < firstDate)
      if (preFirst.length > 0) {
        // Find the proxy value closest to firstDate (last in sorted list)
        const anchor = raw.filter(r => r.date <= firstDate)
        if (anchor.length > 0) {
          const anchorProxy = anchor[anchor.length - 1].value
          const anchorGold  = fixedRows[0].value
          const scale = anchorGold / anchorProxy
          proxyRows = preFirst.map(r => ({ date: r.date, value: r.value * scale }))
          log.push(`Proxy: ${preFirst.length} rows, scale factor ${scale.toFixed(4)} (anchor proxy=${anchorProxy.toFixed(2)}, goldbees=${anchorGold.toFixed(2)})`)
        }
      } else {
        log.push('No proxy rows found before first GOLDBEES date')
      }
    } catch (e) {
      log.push(`Proxy fetch error: ${String(e)}`)
    }
  } else {
    log.push('Data already starts before Apr 2005, no proxy needed')
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true, dryRun: true,
      splitIdx, splitFixed: splitIdx > 0,
      proxyRows: proxyRows.length,
      sample: { first: proxyRows[0], last: proxyRows.at(-1) },
      log,
    })
  }

  // ── 5. Write fixed rows back to DB ────────────────────────────────────────
  let updated = 0
  if (splitIdx > 0) {
    // Update pre-split rows in batches of 500
    const preRows = fixedRows.slice(0, splitIdx)
    for (let i = 0; i < preRows.length; i += 500) {
      const batch = preRows.slice(i, i + 500)
      const records: NavRow[] = batch.map(r => ({ fund_id: fundId, date: r.date, nav_value: r.value }))
      const { error } = await supabaseAdmin
        .from('nav_data')
        .upsert(records, { onConflict: 'fund_id,date' })
      if (error) { log.push(`Update error: ${error.message}`); break }
      updated += batch.length
    }
    log.push(`Updated ${updated} pre-split rows`)
  }

  // ── 6. Insert proxy rows ──────────────────────────────────────────────────
  let inserted = 0
  if (proxyRows.length > 0) {
    for (let i = 0; i < proxyRows.length; i += 500) {
      const batch = proxyRows.slice(i, i + 500)
      const records: NavRow[] = batch.map(r => ({ fund_id: fundId, date: r.date, nav_value: r.value }))
      const { error } = await supabaseAdmin
        .from('nav_data')
        .upsert(records, { onConflict: 'fund_id,date' })
      if (error) { log.push(`Insert proxy error: ${error.message}`); break }
      inserted += batch.length
    }
    log.push(`Inserted ${inserted} proxy rows`)
  }

  // ── 7. Trigger metrics recompute for GOLD ────────────────────────────────
  const origin = url.origin
  fetch(`${origin}/api/cron/eod?recompute_all=true`).catch(() => {})
  log.push('Triggered metrics recompute')

  return NextResponse.json({ ok: true, splitFixed: splitIdx > 0, updated, proxyInserted: inserted, log })
}
