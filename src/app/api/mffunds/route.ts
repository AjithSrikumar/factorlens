import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { discoverSchemeEntries } from '@/lib/mf-funds'
import { fetchViaProxy } from '@/lib/fetch-proxy'

const MFAPI_BASE = 'https://api.mfapi.in/mf'

// Module-level NAV cache keyed by scheme code — refreshes after 1 hour
const _navCache = new Map<number, { data: LiveNav; ts: number }>()
const NAV_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

// Supabase — used ONLY for optional historical return calculations.
// If tables don't exist or returns an error, we still show live NAV.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function mfapiDateToISO(s: string): string {
  // mfapi.in returns either "13-03-2026" (numeric) or "13-Mar-2026" (abbreviated)
  const M: Record<string, string> = {
    Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
  }
  const [dd, mon, yyyy] = s.trim().split('-')
  // Numeric month (e.g. "03")
  if (/^\d+$/.test(mon)) return `${yyyy}-${mon.padStart(2, '0')}-${dd.padStart(2, '0')}`
  // Abbreviated month name (e.g. "Mar")
  const mm = M[mon] ?? ''
  if (!mm) return ''
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
}

function dateMinusYears(iso: string, years: number): string {
  const d = new Date(iso)
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function cagrPct(start: number, end: number, years: number): number | null {
  if (!start || !end || start <= 0) return null
  return (Math.pow(end / start, 1 / years) - 1) * 100
}

function windowRange(target: string, days = 14): [string, string] {
  const lo = new Date(target); lo.setDate(lo.getDate() - days)
  const hi = new Date(target); hi.setDate(hi.getDate() + days)
  return [lo.toISOString().slice(0, 10), hi.toISOString().slice(0, 10)]
}

// ── Live NAV from mfapi.in ────────────────────────────────────────────────────

interface LiveNav {
  schemeCode:     number
  schemeName:     string
  fundHouse:      string
  schemeCategory: string
  nav:            number
  navDate:        string
}

async function fetchLiveNavBatch(codes: number[]): Promise<Map<number, LiveNav>> {
  const map = new Map<number, LiveNav>()
  const BATCH = 20   // 20 parallel max to avoid proxy saturation
  const now = Date.now()

  for (let i = 0; i < codes.length; i += BATCH) {
    const batch = codes.slice(i, i + BATCH)
    const settled = await Promise.allSettled(
      batch.map(async (code) => {
        // Return from in-memory cache if still fresh
        const cached = _navCache.get(code)
        if (cached && now - cached.ts < NAV_CACHE_TTL_MS) return cached.data

        let res: Response
        try {
          res = await fetchViaProxy(`${MFAPI_BASE}/${code}/latest`, {
            signal: AbortSignal.timeout(20_000),
          })
        } catch {
          return null
        }
        if (!res.ok) return null
        const json = await res.json() as {
          status: string
          data:   Array<{ date: string; nav: string }>
          meta:   Record<string, string | number>
        }
        if (json.status !== 'SUCCESS' || !json.data?.length) return null
        const row     = json.data[0]
        const navDate = mfapiDateToISO(row.date)
        const nav     = parseFloat(row.nav)
        if (!navDate || isNaN(nav) || nav <= 0) return null
        return {
          schemeCode:     code,
          schemeName:     String(json.meta['scheme_name']     ?? ''),
          fundHouse:      String(json.meta['fund_house']      ?? ''),
          schemeCategory: String(json.meta['scheme_category'] ?? ''),
          nav, navDate,
        } satisfies LiveNav
      })
    )
    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        map.set(r.value.schemeCode, r.value)
        _navCache.set(r.value.schemeCode, { data: r.value, ts: now })
      }
    }
  }
  return map
}

// ── Historical NAV from Supabase (optional) ───────────────────────────────────

async function tryFetchHistoricalWindow(
  lo: string, hi: string
): Promise<Array<{ scheme_code: number; date: string; nav: number }>> {
  try {
    const PAGE = 1000
    const all: Array<{ scheme_code: number; date: string; nav: number }> = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('mf_nav_data')
        .select('scheme_code, date, nav')
        .gte('date', lo).lte('date', hi)
        .order('date', { ascending: false })
        .range(from, from + PAGE - 1)
      if (error || !data?.length) break
      for (const r of data) all.push({ scheme_code: Number(r.scheme_code), date: r.date, nav: Number(r.nav) })
      if (data.length < PAGE) break
      from += PAGE
    }
    return all
  } catch {
    return []
  }
}

function pickClosest(
  rows: Array<{ scheme_code: number; date: string; nav: number }>,
  target: string
): Map<number, { date: string; nav: number }> {
  const map = new Map<number, { date: string; nav: number }>()
  const tMs = new Date(target).getTime()
  for (const row of rows) {
    const ex    = map.get(row.scheme_code)
    const diff  = Math.abs(new Date(row.date).getTime() - tMs)
    const exDiff = ex ? Math.abs(new Date(ex.date).getTime() - tMs) : Infinity
    if (diff < exDiff) map.set(row.scheme_code, { date: row.date, nav: row.nav })
  }
  return map
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Discover scheme codes from mfapi.in (cached 24h via Next.js fetch cache)
    //    This works with NO database setup required.
    const entries = await discoverSchemeEntries()

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'Could not reach mfapi.in to discover fund list. Try again shortly.' },
        { status: 503 }
      )
    }

    const codes = entries.map(e => e.schemeCode)

    // 2. Batch-fetch LIVE NAV from mfapi.in for all discovered scheme codes
    const liveMap = await fetchLiveNavBatch(codes)

    // 3. Determine max date from live data (for historical return windows)
    let maxDate = ''
    for (const v of liveMap.values()) {
      if (v.navDate > maxDate) maxDate = v.navDate
    }

    // 4. Try historical windows from Supabase (optional — null returns if unavailable)
    let map1y = new Map<number, { date: string; nav: number }>()
    let map3y = new Map<number, { date: string; nav: number }>()
    let map5y = new Map<number, { date: string; nav: number }>()

    if (maxDate) {
      const [rows1y, rows3y, rows5y] = await Promise.all([
        tryFetchHistoricalWindow(...windowRange(dateMinusYears(maxDate, 1))),
        tryFetchHistoricalWindow(...windowRange(dateMinusYears(maxDate, 3))),
        tryFetchHistoricalWindow(...windowRange(dateMinusYears(maxDate, 5))),
      ])
      map1y = pickClosest(rows1y, dateMinusYears(maxDate, 1))
      map3y = pickClosest(rows3y, dateMinusYears(maxDate, 3))
      map5y = pickClosest(rows5y, dateMinusYears(maxDate, 5))
    }

    // 5. Assemble result — live NAV from mfapi.in, returns from Supabase if available
    const result = entries.map(e => {
      const live = liveMap.get(e.schemeCode)
      const nav  = live?.nav ?? null
      const n1y  = map1y.get(e.schemeCode)
      const n3y  = map3y.get(e.schemeCode)
      const n5y  = map5y.get(e.schemeCode)

      return {
        scheme_code:     e.schemeCode,
        scheme_name:     live?.schemeName     || e.schemeName,
        fund_house:      live?.fundHouse      || '',
        scheme_category: live?.schemeCategory || '',
        nav,
        nav_date:    live?.navDate ?? null,
        return_1y:   nav && n1y ? cagrPct(n1y.nav, nav, 1) : null,
        return_3y:   nav && n3y ? cagrPct(n3y.nav, nav, 3) : null,
        return_5y:   nav && n5y ? cagrPct(n5y.nav, nav, 5) : null,
        aum_cr:      null,
      }
    })

    // Sort: funds with live NAV first, then alphabetical
    result.sort((a, b) => {
      if (a.nav !== null && b.nav === null) return -1
      if (a.nav === null && b.nav !== null) return 1
      return a.scheme_name.localeCompare(b.scheme_name)
    })

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=3600' },
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
