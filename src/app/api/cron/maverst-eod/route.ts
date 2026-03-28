export const dynamic = 'force-dynamic'

/**
 * /api/cron/maverst-eod
 *
 * Daily regime computation for MAVERST.
 * Called at 18:30 IST (13:00 UTC) after market close.
 *
 * ?backfill=true   — computes all historical dates from 2012 (one-time setup)
 * ?date=YYYY-MM-DD — override the target date (for testing)
 *
 * Steps:
 *  1. Fetch external data (India VIX, USD/INR) and store in maverst_external_data
 *  2. Load nav_data for all MAVERST indicator codes
 *  3. Compute z-score history for all dates (backfill) or just today (daily)
 *  4. Upsert results into maverst_regime_scores
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
} from '@/lib/maverst-engine'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── External data fetchers ────────────────────────────────────────────────────

/** Fetch USD/INR historical data from Yahoo Finance (USDINR=X). */
async function fetchUSDINR(fromISO: string, toISO: string): Promise<{ date: string; value: number }[]> {
  const period1 = Math.floor(new Date(fromISO).getTime() / 1000)
  const period2 = Math.floor(new Date(toISO).getTime() / 1000) + 86400
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/USDINR%3DX?interval=1d&period1=${period1}&period2=${period2}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return []

    const json = await res.json() as {
      chart: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ close?: number[] }> } }> }
    }
    const result = json?.chart?.result?.[0]
    if (!result) return []

    const timestamps = result.timestamp ?? []
    const closes     = result.indicators?.quote?.[0]?.close ?? []
    return timestamps
      .map((ts, i) => ({ date: new Date(ts * 1000).toISOString().slice(0, 10), value: closes[i] ?? NaN }))
      .filter(r => !isNaN(r.value) && r.value > 0)
  } catch {
    return []
  }
}

/** Fetch India VIX from niftyindices.com using the same API as the EOD cron. */
async function fetchIndiaVIX(fromISO: string, toISO: string): Promise<{ date: string; value: number }[]> {
  const MONTHS: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  }
  function toNiftyDate(iso: string) {
    const d = new Date(iso)
    const day = String(d.getUTCDate()).padStart(2, '0')
    const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]
    return `${day}-${mon}-${d.getUTCFullYear()}`
  }
  function fromNiftyDate(s: string): string {
    const parts = s.trim().split(/\s+/)
    if (parts.length !== 3) return ''
    const [day, mon, year] = parts
    const month = MONTHS[mon]
    if (!month) return ''
    return `${year}-${month}-${day.padStart(2, '0')}`
  }

  const cinfo = JSON.stringify({
    name: 'INDIA VIX', startDate: toNiftyDate(fromISO), endDate: toNiftyDate(toISO), indexName: 'INDIA VIX',
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
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify({ cinfo }),
        signal: AbortSignal.timeout(20_000),
      }
    )
    if (!res.ok) return []
    const outer = await res.json() as { d: string }
    if (!outer.d) return []
    const rows = JSON.parse(outer.d) as Record<string, string>[]
    return rows.map(row => {
      const dateStr  = row['HistoricalDate'] ?? row['Date'] ?? ''
      const closeStr = row['CLOSE'] ?? row['Close'] ?? row['IndexValue'] ?? row['Value'] ?? ''
      const date     = fromNiftyDate(dateStr)
      const value    = parseFloat(closeStr.replace(/,/g, ''))
      return { date, value }
    }).filter(r => r.date.length === 10 && !isNaN(r.value) && r.value > 0)
  } catch {
    return []
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayIST(): string {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const url      = new URL(req.url)
  const backfill = url.searchParams.get('backfill') === 'true'
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

  const log: string[] = [`[maverst-eod] start — today: ${today} | backfill: ${backfill} | from: ${fromDate}`]

  try {
    // ── 1. Fetch + upsert external data ──────────────────────────────────────
    log.push('[step 1] fetching external data…')

    const [vixRows, usdinrRows] = await Promise.all([
      fetchIndiaVIX(fromDate, today),
      fetchUSDINR(fromDate, today),
    ])

    log.push(`  VIX rows: ${vixRows.length}, USD/INR rows: ${usdinrRows.length}`)

    // Merge into a combined map by date
    const extByDate = new Map<string, { india_vix?: number; usdinr?: number }>()
    for (const r of vixRows)   { const e = extByDate.get(r.date) ?? {}; e.india_vix = r.value; extByDate.set(r.date, e) }
    for (const r of usdinrRows){ const e = extByDate.get(r.date) ?? {}; e.usdinr    = r.value; extByDate.set(r.date, e) }

    if (extByDate.size > 0) {
      const extRows = Array.from(extByDate.entries()).map(([date, v]) => ({
        date,
        india_vix: v.india_vix ?? null,
        usdinr:    v.usdinr    ?? null,
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
    log.push(`  N50 rows: ${n50.length}, external rows: ${externalData.length}`)

    // ── 3. Compute raw indicator series + z-scores ────────────────────────────
    log.push('[step 3] computing indicators + z-scores…')

    const extMap = new Map(externalData.map(r => [r.date, r]))

    // Filter to dates we need to (re)compute
    const existingDates = new Set<string>()
    if (!backfill) {
      const { data: existing } = await supabase
        .from('maverst_regime_scores')
        .select('date')
        .gte('date', fromDate)
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

    // Build full raw series (z-score needs the full lookback window)
    const rawSeries = n50.map((_, idx) => ({
      date: n50[idx].date,
      raw:  computeRawIndicatorsAtIdx(navData, extMap, idx),
    }))
    const zRows = computeRollingZScores(rawSeries)
    log.push(`  z-score rows computed: ${zRows.length}`)

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

    // Batch upsert in chunks of 500
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
