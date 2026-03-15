import { NextRequest, NextResponse } from 'next/server'
import { fetchViaProxy } from '@/lib/fetch-proxy'

const MFAPI_BASE = 'https://api.mfapi.in/mf'

// ── Date helpers ──────────────────────────────────────────────────────────────

/** '13-Mar-2026' → '2026-03-13'. Returns '' on failure. */
function mfapiDateToISO(s: string): string {
  const MONTHS: Record<string, string> = {
    Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
  }
  const parts = s.trim().split('-')
  if (parts.length !== 3) return ''
  const [dd, mon, yyyy] = parts
  const mm = MONTHS[mon]
  if (!mm) return ''
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
}

function dateMinusYears(isoDate: string, years: number): string {
  const d = new Date(isoDate)
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function cagrPct(navStart: number, navEnd: number, years: number): number | null {
  if (!navStart || !navEnd || navStart <= 0) return null
  return (Math.pow(navEnd / navStart, 1 / years) - 1) * 100
}

interface NavPoint { date: string; nav: number }

interface FYRow {
  fy: string
  startDate: string
  startNav: number
  endDate: string
  endNav: number
  returnPct: number
  isLive: boolean
}

/** Find closest NAV to targetDate within ±25 days */
function findNavAround(history: NavPoint[], targetDate: string): NavPoint | null {
  const targetMs = new Date(targetDate).getTime()
  let closest: NavPoint | null = null
  let minDiff = Infinity
  for (const row of history) {
    const diff = Math.abs(new Date(row.date).getTime() - targetMs)
    if (diff < minDiff) { minDiff = diff; closest = row }
  }
  return minDiff <= 25 * 86400000 ? closest : null
}

/** Compute Indian fiscal year (Apr→Mar) returns for all available years */
function computeFiscalYears(history: NavPoint[]): FYRow[] {
  if (history.length < 5) return []
  try {
    const oldest = new Date(history[0].date)
    const latest = new Date(history[history.length - 1].date)
    // FY year X = April 1 (X-1) to March 31 (X)
    const startFY = oldest.getMonth() >= 3 ? oldest.getFullYear() + 1 : oldest.getFullYear()
    const endFY   = latest.getMonth() >= 3 ? latest.getFullYear() + 1 : latest.getFullYear()
    const rows: FYRow[] = []
    for (let fy = startFY; fy <= endFY; fy++) {
      const fyStartStr = `${fy - 1}-04-01`
      const fyEndStr   = `${fy}-03-31`
      const isLive = new Date(fyEndStr) > latest
      const startPt = findNavAround(history, fyStartStr)
      if (!startPt) continue
      const endPt = isLive ? history[history.length - 1] : findNavAround(history, fyEndStr)
      if (!endPt) continue
      rows.push({
        fy: `FY${String(fy).slice(2)}`,
        startDate: startPt.date,
        startNav:  startPt.nav,
        endDate:   endPt.date,
        endNav:    endPt.nav,
        returnPct: ((endPt.nav - startPt.nav) / startPt.nav) * 100,
        isLive,
      })
    }
    return rows.reverse() // most recent first
  } catch {
    return []
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const schemeCode = parseInt(id, 10)

  if (isNaN(schemeCode)) {
    return NextResponse.json({ error: 'Invalid scheme code' }, { status: 400 })
  }

  try {
    // Fetch full NAV history from mfapi.in — proxy-aware for dev environments
    const res = await fetchViaProxy(`${MFAPI_BASE}/${schemeCode}`, {
      signal: AbortSignal.timeout(30_000),
      next: { revalidate: 3600 }, // Next.js server-side cache (used in prod without proxy)
    })

    if (!res.ok) {
      return NextResponse.json({ error: `mfapi.in returned ${res.status}` }, { status: 404 })
    }

    const json = await res.json() as {
      status: string
      data: Array<{ date: string; nav: string }>
      meta: Record<string, string | number>
    }

    if (json.status !== 'SUCCESS' || !json.data?.length) {
      return NextResponse.json({ error: 'No NAV data available for this fund' }, { status: 404 })
    }

    const meta = json.meta

    // Parse history — mfapi returns newest-first, reverse to chronological order
    const history: NavPoint[] = json.data
      .map(r => ({ date: mfapiDateToISO(r.date), nav: parseFloat(r.nav) }))
      .filter(r => r.date.length === 10 && !isNaN(r.nav) && r.nav > 0)
      .reverse() // oldest first

    if (history.length === 0) {
      return NextResponse.json({ error: 'No valid NAV data found' }, { status: 404 })
    }

    const latestNav  = history[history.length - 1].nav
    const latestDate = history[history.length - 1].date
    const inceptionDate = history[0].date
    const inceptionNav  = history[0].nav

    // Return calculations
    const nav1y = findNavAround(history, dateMinusYears(latestDate, 1))
    const nav3y = findNavAround(history, dateMinusYears(latestDate, 3))
    const nav5y = findNavAround(history, dateMinusYears(latestDate, 5))

    const yearsTotal = (new Date(latestDate).getTime() - new Date(inceptionDate).getTime()) / (365.25 * 86400000)
    const cagr_inception = yearsTotal >= 0.5 ? cagrPct(inceptionNav, latestNav, yearsTotal) : null
    const total_return   = ((latestNav - inceptionNav) / inceptionNav) * 100

    // Annualised volatility from daily returns
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

    // Sharpe ratio (risk-free = 6%)
    const sharpe = (volatility !== null && cagr_inception !== null)
      ? (cagr_inception - 6) / volatility
      : null

    // Fiscal year returns
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
        total_return,
        return_1y: nav1y ? cagrPct(nav1y.nav, latestNav, 1) : null,
        return_3y: nav3y ? cagrPct(nav3y.nav, latestNav, 3) : null,
        return_5y: nav5y ? cagrPct(nav5y.nav, latestNav, 5) : null,
        volatility,
        max_drawdown: maxDrawdown,
        sharpe,
      },
      fy_data,
      nav_history: history,
    }, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=7200' },
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Failed to fetch fund data: ${msg}` }, { status: 500 })
  }
}
