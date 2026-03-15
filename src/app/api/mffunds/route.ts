import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const MFAPI_BASE = 'https://api.mfapi.in/mf'

// Anon key is sufficient — RLS is disabled on mf_funds / mf_nav_data.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── Date helpers ──────────────────────────────────────────────────────────────

/** '13-Mar-2026' → '2026-03-13'. Returns '' on failure. */
function mfapiDateToISO(s: string): string {
  const MONTHS: Record<string, string> = {
    Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
  }
  const [dd, mon, yyyy] = s.trim().split('-')
  const mm = MONTHS[mon] ?? ''
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

/**
 * Batch-fetch /latest from mfapi.in for multiple scheme codes.
 * Runs in parallel batches of BATCH_SIZE to avoid overwhelming the API.
 */
async function fetchLiveNavBatch(codes: number[]): Promise<Map<number, LiveNav>> {
  const results = new Map<number, LiveNav>()
  const BATCH_SIZE = 40

  for (let i = 0; i < codes.length; i += BATCH_SIZE) {
    const batch = codes.slice(i, i + BATCH_SIZE)

    const settled = await Promise.allSettled(
      batch.map(async (code) => {
        const res = await fetch(`${MFAPI_BASE}/${code}/latest`, {
          signal: AbortSignal.timeout(10_000),
          // Next.js server-side caching — 1 hour (NAV is published once daily)
          next: { revalidate: 3600 },
        })
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
          nav,
          navDate,
        } satisfies LiveNav
      })
    )

    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        results.set(r.value.schemeCode, r.value)
      }
    }
  }

  return results
}

// ── Historical NAV from Supabase ──────────────────────────────────────────────

async function fetchNavInRange(
  lo: string,
  hi: string
): Promise<Array<{ scheme_code: number; date: string; nav: number }>> {
  const PAGE = 1000
  const all: Array<{ scheme_code: number; date: string; nav: number }> = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('mf_nav_data')
      .select('scheme_code, date, nav')
      .gte('date', lo)
      .lte('date', hi)
      .order('date', { ascending: false })
      .range(from, from + PAGE - 1)

    if (error || !data?.length) break
    for (const r of data) {
      all.push({ scheme_code: Number(r.scheme_code), date: r.date, nav: Number(r.nav) })
    }
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

function pickClosest(
  rows: Array<{ scheme_code: number; date: string; nav: number }>,
  target: string
): Map<number, { date: string; nav: number }> {
  const map = new Map<number, { date: string; nav: number }>()
  const targetMs = new Date(target).getTime()
  for (const row of rows) {
    const existing = map.get(row.scheme_code)
    const thisDiff = Math.abs(new Date(row.date).getTime() - targetMs)
    if (!existing) {
      map.set(row.scheme_code, { date: row.date, nav: row.nav })
    } else {
      const prevDiff = Math.abs(new Date(existing.date).getTime() - targetMs)
      if (thisDiff < prevDiff) map.set(row.scheme_code, { date: row.date, nav: row.nav })
    }
  }
  return map
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // 1. Load all fund metadata from Supabase (scheme codes + names)
    const { data: funds, error: fundsErr } = await supabase
      .from('mf_funds')
      .select('scheme_code, scheme_name, fund_house, scheme_category')
      .order('scheme_name')

    if (fundsErr) {
      return NextResponse.json({ error: `Supabase error: ${fundsErr.message}` }, { status: 500 })
    }

    // If no funds loaded yet, return a descriptive error so the UI can guide the user
    if (!funds || funds.length === 0) {
      return NextResponse.json({
        error: 'no_data',
        message: 'Fund database is empty. Visit /api/admin/mf-load to seed data.',
        funds: [],
      }, { status: 200 })
    }

    const schemeCodes = funds.map(f => Number(f.scheme_code))

    // 2. Fetch LIVE NAV from mfapi.in for ALL funds in parallel batches
    //    This gives true real-time data (updated 6×/day by mfapi.in from AMFI)
    const liveNavMap = await fetchLiveNavBatch(schemeCodes)

    // Determine the most recent nav date across all live data
    let maxDate = ''
    for (const v of liveNavMap.values()) {
      if (v.navDate > maxDate) maxDate = v.navDate
    }

    // If live data is available, use that date for historical return targets.
    // Fall back to Supabase's latest date if mfapi.in couldn't be reached.
    if (!maxDate) {
      const { data: latestRow } = await supabase
        .from('mf_nav_data')
        .select('date')
        .order('date', { ascending: false })
        .limit(1)
        .single()
      maxDate = latestRow?.date ?? ''
    }

    // 3. Fetch historical NAV windows from Supabase for 1Y / 3Y / 5Y return calcs
    let map1y = new Map<number, { date: string; nav: number }>()
    let map3y = new Map<number, { date: string; nav: number }>()
    let map5y = new Map<number, { date: string; nav: number }>()

    if (maxDate) {
      const [rows1y, rows3y, rows5y] = await Promise.all([
        fetchNavInRange(...windowRange(dateMinusYears(maxDate, 1))),
        fetchNavInRange(...windowRange(dateMinusYears(maxDate, 3))),
        fetchNavInRange(...windowRange(dateMinusYears(maxDate, 5))),
      ])
      map1y = pickClosest(rows1y, dateMinusYears(maxDate, 1))
      map3y = pickClosest(rows3y, dateMinusYears(maxDate, 3))
      map5y = pickClosest(rows5y, dateMinusYears(maxDate, 5))
    }

    // 4. Assemble result — live NAV overrides stale Supabase NAV
    const result = funds.map(f => {
      const code  = Number(f.scheme_code)
      const live  = liveNavMap.get(code)
      const nav   = live?.nav ?? null
      const nav1y = map1y.get(code)
      const nav3y = map3y.get(code)
      const nav5y = map5y.get(code)

      return {
        scheme_code:     code,
        scheme_name:     live?.schemeName     || String(f.scheme_name     ?? ''),
        fund_house:      live?.fundHouse      || String(f.fund_house      ?? ''),
        scheme_category: live?.schemeCategory || String(f.scheme_category ?? ''),
        nav,
        nav_date: live?.navDate ?? null,
        return_1y: nav && nav1y ? cagrPct(nav1y.nav, nav, 1) : null,
        return_3y: nav && nav3y ? cagrPct(nav3y.nav, nav, 3) : null,
        return_5y: nav && nav5y ? cagrPct(nav5y.nav, nav, 5) : null,
        aum_cr: null,
      }
    })

    // Sort: funds with live NAV first (active), then alphabetical
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
