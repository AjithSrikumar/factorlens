import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use anon key — mf_funds / mf_nav_data have RLS disabled so anon key reads work.
// Service role key is only needed for writes (mf-load / mf-eod cron).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function dateMinusYears(isoDate: string, years: number): string {
  const d = new Date(isoDate)
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function cagrPct(navStart: number, navEnd: number, years: number): number | null {
  if (!navStart || !navEnd || navStart <= 0) return null
  return (Math.pow(navEnd / navStart, 1 / years) - 1) * 100
}

function windowRange(target: string, days = 10): [string, string] {
  const lo = new Date(target); lo.setDate(lo.getDate() - days)
  const hi = new Date(target); hi.setDate(hi.getDate() + days)
  return [lo.toISOString().slice(0, 10), hi.toISOString().slice(0, 10)]
}

/**
 * Fetch all mf_nav_data rows within [lo, hi] date range.
 * Does NOT filter by scheme_code to avoid URL-length issues with 257 codes.
 * Paginates to bypass the 1000-row default cap.
 */
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

/** For rows in a date window, pick the row closest to `target` per scheme_code. */
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
      if (thisDiff < prevDiff) {
        map.set(row.scheme_code, { date: row.date, nav: row.nav })
      }
    }
  }
  return map
}

export async function GET() {
  try {
    // 1. Load all funds from mf_funds
    const { data: funds, error: fundsErr } = await supabase
      .from('mf_funds')
      .select('scheme_code, scheme_name, fund_house, scheme_category')
      .order('scheme_name')

    if (fundsErr) {
      return NextResponse.json({ error: fundsErr.message }, { status: 500 })
    }

    if (!funds || funds.length === 0) {
      return NextResponse.json([])
    }

    // 2. Find the single latest date across all NAV data
    const { data: latestRow, error: latestErr } = await supabase
      .from('mf_nav_data')
      .select('date')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (latestErr || !latestRow) {
      // No NAV data at all — return funds with all nulls
      return NextResponse.json(funds.map(f => ({
        scheme_code: f.scheme_code,
        scheme_name: f.scheme_name,
        fund_house: f.fund_house,
        scheme_category: f.scheme_category,
        nav: null, nav_date: null,
        return_1y: null, return_3y: null, return_5y: null, aum_cr: null,
      })))
    }

    const maxDate = latestRow.date

    // 3. Target dates for historical returns
    const target1y = dateMinusYears(maxDate, 1)
    const target3y = dateMinusYears(maxDate, 3)
    const target5y = dateMinusYears(maxDate, 5)

    // 4. Fetch NAV data for each date window in parallel
    // No scheme_code filter — avoids URL-length issues with 257 codes
    const [currentRows, rows1y, rows3y, rows5y] = await Promise.all([
      fetchNavInRange(...windowRange(maxDate, 5)),      // current NAV ±5 days
      fetchNavInRange(...windowRange(target1y, 14)),    // 1yr ago ±14 days
      fetchNavInRange(...windowRange(target3y, 14)),    // 3yr ago ±14 days
      fetchNavInRange(...windowRange(target5y, 14)),    // 5yr ago ±14 days
    ])

    const latestByScheme = pickClosest(currentRows, maxDate)
    const nav1yMap = pickClosest(rows1y, target1y)
    const nav3yMap = pickClosest(rows3y, target3y)
    const nav5yMap = pickClosest(rows5y, target5y)

    // 5. Assemble result
    const result = funds.map(f => {
      const code = Number(f.scheme_code)
      const latest = latestByScheme.get(code)
      const nav1y = nav1yMap.get(code)
      const nav3y = nav3yMap.get(code)
      const nav5y = nav5yMap.get(code)
      const currentNav = latest?.nav ?? null

      return {
        scheme_code: code,
        scheme_name: f.scheme_name,
        fund_house: f.fund_house,
        scheme_category: f.scheme_category,
        nav: currentNav,
        nav_date: latest?.date ?? null,
        return_1y: currentNav && nav1y ? cagrPct(nav1y.nav, currentNav, 1) : null,
        return_3y: currentNav && nav3y ? cagrPct(nav3y.nav, currentNav, 3) : null,
        return_5y: currentNav && nav5y ? cagrPct(nav5y.nav, currentNav, 5) : null,
        aum_cr: null,
      }
    })

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' }
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
