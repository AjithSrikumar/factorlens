export const revalidate = 3600 // Re-compute at most once per hour

import { NextResponse } from 'next/server'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'

/* ─────────────────────────────────────────────────────────
   HEATMAP INDEX DEFINITIONS
   These are the 8 indices shown in the heatmap.
   S&P 500 is fetched live from Yahoo Finance; the rest
   come from the nav_data table in Supabase.
───────────────────────────────────────────────────────── */
export interface HeatmapIndex {
  code:      string
  label:     string   // short display label inside the cell
  fullName:  string   // tooltip / legend full name
  external?: boolean  // true = fetch from Yahoo Finance
}

export const HEATMAP_INDICES: HeatmapIndex[] = [
  { code: 'MC150Q50', label: 'Quality',   fullName: 'Nifty Midcap150 Quality 50'   },
  { code: 'N500V50',  label: 'Value',     fullName: 'Nifty500 Value 50'             },
  { code: 'MC150M50', label: 'Momentum',  fullName: 'Nifty Midcap150 Momentum 50'  },
  { code: 'N200A30',  label: 'Alpha',     fullName: 'Nifty200 Alpha 30'             },
  { code: 'NSC250',   label: 'Size',      fullName: 'Nifty Smallcap 250'            },
  { code: 'SP500',    label: 'Global',    fullName: 'S&P 500 (USD)', external: true },
  { code: 'GOLD',     label: 'Gold',      fullName: 'Gold BeES (ETF)'               },
  { code: 'N50',      label: 'Nifty 50',  fullName: 'Nifty 50'                      },
]

/* ─────────────────────────────────────────────────────────
   FISCAL YEAR HELPERS  (India FY: 1 Apr → 31 Mar)
───────────────────────────────────────────────────────── */

/** Return the FY label ("FY10", "FY27 ▸ Live", …) for the year that ends March YYYY */
function fyLabel(endYear: number, isLive: boolean): string {
  const yy = String(endYear).slice(-2)
  return isLive ? `FY${yy} ▸ Live` : `FY${yy}`
}

/** ISO string "YYYY-03-31" for the March 31 boundary of a given year */
function marchEnd(year: number) { return `${year}-03-31` }

/**
 * Given a sorted (asc) array of { date, nav } pairs and a boundary date string,
 * return the last NAV value on or before that date.
 */
function navAtOrBefore(
  rows: { date: string; nav: number }[],
  boundary: string,
): number | null {
  let result: number | null = null
  for (const r of rows) {
    if (r.date <= boundary) result = r.nav
    else break
  }
  return result
}

/* ─────────────────────────────────────────────────────────
   S&P 500 FROM YAHOO FINANCE
───────────────────────────────────────────────────────── */
async function fetchSP500(fromISO: string, toISO: string): Promise<{ date: string; nav: number }[]> {
  // period1 / period2 are Unix timestamps (seconds)
  const p1 = Math.floor(new Date(fromISO).getTime() / 1000)
  const p2 = Math.floor(new Date(toISO).getTime()   / 1000) + 86400

  const hosts = ['query1', 'query2']
  for (const host of hosts) {
    try {
      const url =
        `https://${host}.finance.yahoo.com/v8/finance/chart/%5EGSPC` +
        `?interval=1d&period1=${p1}&period2=${p2}&events=history`

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) continue

      const json = await res.json()
      const chart = json?.chart?.result?.[0]
      if (!chart) continue

      const timestamps: number[]  = chart.timestamp ?? []
      const closes: number[]      = chart.indicators?.quote?.[0]?.close ?? []

      const rows: { date: string; nav: number }[] = []
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] == null) continue
        const d = new Date(timestamps[i] * 1000)
        const iso = d.toISOString().slice(0, 10)
        rows.push({ date: iso, nav: closes[i] })
      }
      rows.sort((a, b) => a.date.localeCompare(b.date))
      return rows
    } catch {
      // try next host
    }
  }
  return []
}

/* ─────────────────────────────────────────────────────────
   MAIN HANDLER
───────────────────────────────────────────────────────── */
export async function GET() {
  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)

  /* ── Determine FY range ── */
  // FY10 = Apr 2009–Mar 2010.  We need the Mar 2009 boundary as "start of FY10".
  // Boundaries we need: March 31 of 2009 through the most recent March 31,
  // plus today for the live (current) FY.
  const currentCalYear  = today.getFullYear()
  // If today is in Jan–Mar, the latest "full FY end" is Mar of the previous cal year.
  const latestFullFYEnd = today.getMonth() < 3          // 0=Jan … 2=Mar
    ? currentCalYear - 1
    : currentCalYear
  // The live FY ends March of the year after latestFullFYEnd (may be in the future).
  const liveFYEndYear = latestFullFYEnd + 1

  // Build all boundary objects: year = the calendar year that March 31 falls in
  const boundaries: { year: number; iso: string }[] = []
  for (let y = 2009; y <= latestFullFYEnd; y++) {
    boundaries.push({ year: y, iso: marchEnd(y) })
  }

  // The fiscal years we actually show: FY10 … FY(latestFullFYEnd) + live FY
  // FY label = endYear of the fiscal year (i.e. boundary[i+1].year)
  // FY10: starts at boundary 2009, ends at boundary 2010
  const fyYears: { label: string; startIso: string; endIso: string; live: boolean }[] = []
  for (let i = 0; i < boundaries.length - 1; i++) {
    const endYear = boundaries[i + 1].year
    fyYears.push({
      label:    fyLabel(endYear, false),
      startIso: boundaries[i].iso,
      endIso:   boundaries[i + 1].iso,
      live:     false,
    })
  }
  // Live FY: from last March 31 to today
  fyYears.push({
    label:    fyLabel(liveFYEndYear, true),
    startIso: marchEnd(latestFullFYEnd),
    endIso:   todayISO,
    live:     true,
  })

  /* ── Fetch NAV data for internal indices ── */
  const internalCodes = HEATMAP_INDICES.filter(i => !i.external).map(i => i.code)

  let navByCode: Record<string, { date: string; nav: number }[]> = {}

  if (isSupabaseConfigured()) {
    // Look up fund IDs for our codes
    const { data: fundRows } = await supabaseAdmin
      .from('funds')
      .select('id, code')
      .in('code', internalCodes)

    if (fundRows && fundRows.length > 0) {
      const idToCode = Object.fromEntries(fundRows.map(f => [f.id as number, f.code as string]))
      const fundIds  = fundRows.map(f => f.id as number)

      // Fetch all nav_data rows for these funds in the date range
      const fromISO = '2009-01-01' // a bit before first boundary
      const { data: navRows } = await supabaseAdmin
        .from('nav_data')
        .select('fund_id, date, nav_value')
        .in('fund_id', fundIds)
        .gte('date', fromISO)
        .lte('date', todayISO)
        .order('date', { ascending: true })

      if (navRows) {
        for (const r of navRows) {
          const code = idToCode[r.fund_id as number]
          if (!code) continue
          if (!navByCode[code]) navByCode[code] = []
          navByCode[code].push({ date: r.date as string, nav: Number(r.nav_value) })
        }
      }
    }
  }

  /* ── Fetch S&P 500 ── */
  const sp500Rows = await fetchSP500('2009-01-01', todayISO)
  if (sp500Rows.length > 0) {
    navByCode['SP500'] = sp500Rows
  }

  /* ── Compute FY returns per index per year ── */
  type CellData = { code: string; label: string; fullName: string; ret: number | null }

  const result: {
    label: string
    live: boolean
    endDate: string
    cells: CellData[]  // sorted best→worst
  }[] = []

  for (const fy of fyYears) {
    const cells: CellData[] = []

    for (const idx of HEATMAP_INDICES) {
      const rows = navByCode[idx.code] ?? []
      const startNav = navAtOrBefore(rows, fy.startIso)
      const endNav   = navAtOrBefore(rows, fy.endIso)

      let ret: number | null = null
      if (startNav && endNav && startNav > 0) {
        ret = ((endNav / startNav) - 1) * 100
      }
      cells.push({ code: idx.code, label: idx.label, fullName: idx.fullName, ret })
    }

    // Sort: non-null returns descending, nulls at end
    cells.sort((a, b) => {
      if (a.ret === null && b.ret === null) return 0
      if (a.ret === null) return 1
      if (b.ret === null) return -1
      return b.ret - a.ret
    })

    result.push({
      label:   fy.label,
      live:    fy.live,
      endDate: fy.endIso,
      cells,
    })
  }

  return NextResponse.json(
    { years: result, indices: HEATMAP_INDICES, lastUpdated: todayISO },
    { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
  )
}
