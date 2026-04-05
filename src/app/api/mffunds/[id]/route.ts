export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'
import { fetchViaProxy } from '@/lib/fetch-proxy'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'
import {
  detectSplits,
  normalizeHistory,
  computeMetrics,
  computeFiscalYears,
  cagrPct,
  type NavRow,
} from '@/lib/nav-normalize'

const MFAPI_BASE = 'https://api.mfapi.in/mf'

// ── Date helpers (used in mfapi.in fallback only) ─────────────────────────────

function mfapiDateToISO(s: string): string {
  const MONTHS: Record<string, string> = {
    Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
  }
  const parts = s.trim().split('-')
  if (parts.length !== 3) return ''
  const [dd, mon, yyyy] = parts
  if (/^\d+$/.test(mon)) return `${yyyy}-${mon.padStart(2, '0')}-${dd.padStart(2, '0')}`
  const mm = MONTHS[mon]
  if (!mm) return ''
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
}

function dateMinusYears(isoDate: string, years: number): string {
  const d = new Date(isoDate)
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function findNavAround(history: NavRow[], targetDate: string): NavRow | null {
  const targetMs = new Date(targetDate).getTime()
  let closest: NavRow | null = null
  let minDiff = Infinity
  for (const row of history) {
    const diff = Math.abs(new Date(row.date).getTime() - targetMs)
    if (diff < minDiff) { minDiff = diff; closest = row }
  }
  return minDiff <= 25 * 86_400_000 ? closest : null
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const schemeCode = parseInt(id, 10)

  if (isNaN(schemeCode)) {
    return NextResponse.json({ error: 'Invalid scheme code' }, { status: 400 })
  }

  try {
    // ── Path A: Supabase — normalized NAV, pre-computed metrics ───────────────
    if (isSupabaseConfigured()) {
      // Fetch NAV history via PostgREST (mf_nav_data columns are in cache)
      // and fund metadata via direct SQL (bypasses stale PostgREST schema cache
      // which can't see fund_house, scheme_category etc after ALTER TABLE).
      const dbUrl = process.env.SUPABASE_DB_URL

      const [metaResult, { data: rawHistory, error: histErr }] = await Promise.all([
        dbUrl
          ? (async () => {
              const sql = postgres(dbUrl, { ssl: 'require', max: 1, idle_timeout: 20, connect_timeout: 10 })
              try {
                const rows = await sql`
                  SELECT scheme_name, fund_house, scheme_type, scheme_category
                  FROM mf_funds WHERE scheme_code = ${schemeCode} LIMIT 1
                `
                return { data: rows[0] ?? null }
              } finally { await sql.end() }
            })()
          : supabaseAdmin.from('mf_funds').select('*').eq('scheme_code', schemeCode).single()
            .then(r => ({ data: r.data })),
        supabaseAdmin
          .from('mf_nav_data')
          .select('date, nav')
          .eq('scheme_code', schemeCode)
          .order('date', { ascending: true })
          .limit(10_000),
      ])

      if (!histErr && rawHistory?.length) {
        const latestHistDate = rawHistory[rawHistory.length - 1].date as string
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 7)   // 7 days: tolerates weekends + public holidays
        const isStale = latestHistDate < cutoff.toISOString().slice(0, 10)

        if (!isStale) {
          const rawNavs: NavRow[] = rawHistory.map(r => ({
            date: r.date as string,
            nav:  Number(r.nav),
          }))

          // Apply split normalization so returns across NAV splits are correct.
          // e.g. SBI Gold ETF had a split in FY22 (₹4008 → ₹46); without this
          // the 5Y CAGR computes as -50% instead of the correct ~+12%.
          const splits  = detectSplits(rawNavs, schemeCode)
          const adjNavs = normalizeHistory(rawNavs, splits)
          const history: NavRow[] = rawNavs.map((h, i) => ({ date: h.date, nav: adjNavs[i] }))

          const metrics = computeMetrics(history)
          const fy_data = computeFiscalYears(history)
          const meta = (metaResult.data ?? {}) as Record<string, unknown>

          return NextResponse.json({
            fund: {
              scheme_code:     schemeCode,
              scheme_name:     (meta.scheme_name     as string) ?? '',
              fund_house:      (meta.fund_house      as string) ?? '',
              scheme_type:     (meta.scheme_type     as string) ?? '',
              scheme_category: (meta.scheme_category as string) ?? '',
              nav:             history[history.length - 1].nav,
              nav_date:        latestHistDate,
              inception_date:  history[0].date,
            },
            metrics,
            fy_data,
            nav_history: history,
          }, {
            headers: { 'Cache-Control': 'no-store' },
          })
        }
        // History is stale — fall through to live mfapi.in fetch
      }
    }

    // ── Path B: mfapi.in fallback (Supabase stale or not configured) ─────────
    // cache: 'no-store' disables Next.js Data Cache so every request is live.
    const res = await fetchViaProxy(`${MFAPI_BASE}/${schemeCode}`, {
      signal: AbortSignal.timeout(30_000),
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: `mfapi.in returned ${res.status}` }, { status: 404 })
    }

    const json = await res.json() as {
      status: string
      data:   Array<{ date: string; nav: string }>
      meta:   Record<string, string | number>
    }

    if (json.status !== 'SUCCESS' || !json.data?.length) {
      return NextResponse.json({ error: 'No NAV data available for this fund' }, { status: 404 })
    }

    const meta = json.meta

    // mfapi.in returns newest-first → reverse to chronological
    const rawHistory: NavRow[] = json.data
      .map(r => ({ date: mfapiDateToISO(r.date), nav: parseFloat(r.nav) }))
      .filter(r => r.date.length === 10 && !isNaN(r.nav) && r.nav > 0)
      .reverse()

    if (!rawHistory.length) {
      return NextResponse.json({ error: 'No valid NAV data found' }, { status: 404 })
    }

    // ── Apply split normalization to raw mfapi.in data ────────────────────────
    // mfapi.in returns raw (un-adjusted) NAVs. ETFs like SBI Gold ETF had
    // splits (e.g. ₹4008 → ₹46 in FY22) that cause false spikes in charts and
    // completely wrong return metrics. Detect splits and adjust on-the-fly so
    // charts and all metrics are always on a consistent scale.
    const splits  = detectSplits(rawHistory, schemeCode)
    const adjNavs = normalizeHistory(rawHistory, splits)
    const history: NavRow[] = rawHistory.map((r, i) => ({ date: r.date, nav: adjNavs[i] }))

    const latestNav     = history[history.length - 1].nav
    const latestDate    = history[history.length - 1].date
    const inceptionDate = history[0].date
    const inceptionNav  = history[0].nav
    const yearsTotal    = (new Date(latestDate).getTime() - new Date(inceptionDate).getTime()) / (365.25 * 86_400_000)

    const nav1y = findNavAround(history, dateMinusYears(latestDate, 1))
    const nav3y = findNavAround(history, dateMinusYears(latestDate, 3))
    const nav5y = findNavAround(history, dateMinusYears(latestDate, 5))

    // Volatility
    const dailyReturns: number[] = []
    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1].nav
      const curr = history[i].nav
      if (prev > 0) dailyReturns.push((curr - prev) / prev)
    }
    let volatility: number | null = null
    if (dailyReturns.length > 30) {
      const mean     = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
      const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length
      volatility = Math.sqrt(variance) * Math.sqrt(252) * 100
    }

    // Max drawdown
    let maxDrawdown: number | null = null
    if (history.length > 30) {
      let peak = history[0].nav
      let maxDD = 0
      for (const row of history) {
        if (row.nav > peak) peak = row.nav
        const dd = (row.nav - peak) / peak
        if (dd < maxDD) maxDD = dd
      }
      maxDrawdown = maxDD * 100
    }

    const cagr_inception = yearsTotal >= 0.5 ? cagrPct(inceptionNav, latestNav, yearsTotal) : null
    const sharpe = (volatility !== null && cagr_inception !== null)
      ? (cagr_inception - 6) / volatility : null

    const fy_data = computeFiscalYears(history)

    return NextResponse.json({
      fund: {
        scheme_code:     schemeCode,
        scheme_name:     String(meta['scheme_name']     ?? ''),
        fund_house:      String(meta['fund_house']      ?? ''),
        scheme_type:     String(meta['scheme_type']     ?? ''),
        scheme_category: String(meta['scheme_category'] ?? ''),
        nav:             latestNav,
        nav_date:        latestDate,
        inception_date:  inceptionDate,
      },
      metrics: {
        cagr_inception,
        total_return:  ((latestNav - inceptionNav) / inceptionNav) * 100,
        return_1y:     nav1y ? cagrPct(nav1y.nav, latestNav, 1) : null,
        return_3y:     nav3y ? cagrPct(nav3y.nav, latestNav, 3) : null,
        return_5y:     nav5y ? cagrPct(nav5y.nav, latestNav, 5) : null,
        volatility,
        max_drawdown:  maxDrawdown,
        sharpe,
      },
      fy_data,
      nav_history: history,
    }, {
      headers: { 'Cache-Control': 'no-store' },
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Failed to fetch fund data: ${msg}` }, { status: 500 })
  }
}
