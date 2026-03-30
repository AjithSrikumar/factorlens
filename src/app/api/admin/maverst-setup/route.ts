export const dynamic = 'force-dynamic'

/**
 * /api/admin/maverst-setup
 *
 * One-shot admin endpoint to fully set up all MAVERST data:
 *   1. Ensure all MAVERST NAV funds exist in the `funds` table
 *   2. Backfill NAV history for NMC150, N100EW, N100, NHBETA50, NLV50, MC150M50, GOLD
 *   3. Fetch + store external data (India VIX, USD/INR, FII flows)
 *   4. Run the full MAVERST regime score backfill
 *
 * Call this once to bootstrap the system, then let the daily crons take over.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MAVERST_NAV_CODES } from '@/lib/maverst-engine'
import { NSE_INDEX_LIST } from '@/lib/index-fund-map'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
)

const MONTHS: Record<string, string> = {
  Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
  Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
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
  return `${String(d.getUTCDate()).padStart(2, '0')}-${MON_NAMES[d.getUTCMonth()]}-${d.getUTCFullYear()}`
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function todayIST(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

async function fetchNiftyIndexNav(indexName: string, fromISO: string, toISO: string): Promise<{ date: string; value: number }[]> {
  const cinfo = JSON.stringify({ name: indexName, startDate: isoToNiftyDate(fromISO), endDate: isoToNiftyDate(toISO), indexName })
  try {
    const res = await fetch('https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString', {
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
    })
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
    } catch { /* try next */ }
  }
  return []
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = todayIST()
  const log: string[] = [`[maverst-setup] started ${new Date().toISOString()} — today IST: ${today}`]
  const startTime = Date.now()

  // Build code → entry map from NSE_INDEX_LIST
  const NSE_CODE_MAP: Record<string, { name: string; inception: string }> = {}
  for (const entry of NSE_INDEX_LIST) {
    if ((MAVERST_NAV_CODES as readonly string[]).includes(entry.code)) {
      NSE_CODE_MAP[entry.code] = { name: entry.name, inception: entry.inception }
    }
  }

  try {
    // ── Step 1: Ensure all MAVERST funds exist in DB ────────────────────────
    log.push('[step 1] upserting MAVERST funds…')
    const fundsToUpsert = [
      ...Object.entries(NSE_CODE_MAP).map(([code, info]) => ({
        code, name: info.name, category: 'Index', inception_date: info.inception,
      })),
      { code: 'GOLD', name: 'Gold ETF (GOLDBEES)', category: 'Commodity', inception_date: '2007-03-22' },
      { code: 'SPX',  name: 'S&P 500 (^GSPC)',     category: 'Global',    inception_date: '2000-01-03' },
    ]
    const { error: upsertErr } = await supabase.from('funds').upsert(fundsToUpsert, { onConflict: 'code', ignoreDuplicates: true })
    if (upsertErr) log.push(`  WARNING: ${upsertErr.message}`)
    else           log.push(`  OK: ${fundsToUpsert.length} funds`)

    // Load fund IDs
    const { data: funds } = await supabase.from('funds').select('id, code, inception_date').in('code', [...MAVERST_NAV_CODES])
    const codeToId        = new Map<string, number>((funds ?? []).map((f: { id: number; code: string }) => [f.code, f.id]))
    const codeToInception = new Map<string, string>((funds ?? []).map((f: { id: number; code: string; inception_date: string | null }) => [f.code, f.inception_date ?? '2010-01-01']))

    // ── Step 2: Backfill NAV data for each MAVERST code ─────────────────────
    log.push('[step 2] backfilling NAV data for MAVERST codes…')
    const DEADLINE_MS = 240_000
    const results: Record<string, { rows: number; error?: string }> = {}

    for (const code of MAVERST_NAV_CODES) {
      if (Date.now() - startTime > DEADLINE_MS) {
        log.push(`  time budget reached — stopping NAV backfill early`)
        break
      }

      const fundId = codeToId.get(code)
      if (!fundId) { log.push(`  [${code}] not in DB — skipped`); continue }

      // Check latest date in DB
      const { data: latestRow } = await supabase
        .from('nav_data').select('date, nav_value').eq('fund_id', fundId)
        .order('date', { ascending: false }).limit(1)
      const last = latestRow?.[0]
      const isNew = !last

      if (!isNew && addDays(last!.date, 2) >= today) {
        log.push(`  [${code}] already up to date (${last!.date})`)
        results[code] = { rows: 0 }
        continue
      }

      const inception = codeToInception.get(code) ?? NSE_CODE_MAP[code]?.inception ?? '2010-01-01'
      const fromISO   = isNew ? inception : addDays(last!.date, -20)
      const newAfter  = isNew ? '' : (last!.date as string)

      let rawRows: { date: string; value: number }[] = []
      try {
        if (code === 'GOLD') {
          rawRows = await fetchGoldNav(fromISO, today)
        } else {
          const indexName = NSE_CODE_MAP[code]?.name
          if (!indexName) { log.push(`  [${code}] no NSE name found`); continue }
          rawRows = await fetchNiftyIndexNav(indexName, fromISO, today)
        }
      } catch (e) {
        log.push(`  [${code}] fetch ERROR: ${e}`)
        results[code] = { rows: 0, error: String(e) }
        continue
      }

      if (rawRows.length === 0) {
        log.push(`  [${code}] 0 rows returned`)
        results[code] = { rows: 0, error: 'no data from API' }
        await new Promise(r => setTimeout(r, 400))
        continue
      }

      let scale = 1
      if (!isNew && last) {
        const anchor = rawRows.filter(r => r.date <= (last!.date as string)).at(-1)
        if (anchor && anchor.value > 0) scale = Number(last!.nav_value) / anchor.value
      }

      const toInsert = rawRows
        .filter(r => r.date > newAfter)
        .map(r => ({ fund_id: fundId, date: r.date, nav_value: r.value * scale }))

      let inserted = 0
      for (let i = 0; i < toInsert.length; i += 500) {
        const chunk = toInsert.slice(i, i + 500)
        const { error } = await supabase.from('nav_data').upsert(chunk, { onConflict: 'fund_id,date' })
        if (!error) inserted += chunk.length
      }
      results[code] = { rows: inserted }
      log.push(`  [${code}] ${inserted} rows (${toInsert[0]?.date ?? 'n/a'} → ${toInsert.at(-1)?.date ?? 'n/a'})`)

      await new Promise(r => setTimeout(r, 400))
    }

    log.push(`[step 2] NAV backfill complete. Results: ${JSON.stringify(results)}`)

    // ── Step 3: Trigger maverst-eod backfill ─────────────────────────────────
    log.push('[step 3] triggering maverst-eod backfill computation…')
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3000'
    try {
      const cronRes = await fetch(`${baseUrl}/api/cron/maverst-eod?backfill=true`, {
        headers: { 'Authorization': `Bearer ${cronSecret ?? ''}` },
        signal: AbortSignal.timeout(290_000 - (Date.now() - startTime)),
      })
      const cronData = await cronRes.json() as { ok?: boolean; inserted?: number; log?: string[] }
      log.push(`  maverst-eod response: ok=${cronData.ok}, inserted=${cronData.inserted}`)
      if (cronData.log) log.push(...cronData.log.slice(-10).map(l => `  > ${l}`))
    } catch (e) {
      log.push(`  WARNING: could not call maverst-eod — trigger it separately. Error: ${e}`)
    }

    log.push(`[maverst-setup] done in ${Math.round((Date.now() - startTime) / 1000)}s`)
    return NextResponse.json({ ok: true, results, log })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.push(`[ERROR] ${msg}`)
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}
