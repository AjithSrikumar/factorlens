import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

export async function GET() {
  try {
    // 1. Load all funds from mf_funds
    const { data: funds, error: fundsErr } = await supabase
      .from('mf_funds')
      .select('scheme_code, scheme_name, fund_house, scheme_category')
      .order('scheme_name')

    if (fundsErr || !funds) {
      return NextResponse.json({ error: fundsErr?.message ?? 'Failed to load funds' }, { status: 500 })
    }

    const schemeCodes = funds.map(f => f.scheme_code)

    // 2. Get latest NAV per fund
    const { data: latestRows, error: latestErr } = await supabase
      .from('mf_nav_data')
      .select('scheme_code, date, nav')
      .in('scheme_code', schemeCodes)
      .order('date', { ascending: false })

    if (latestErr) {
      return NextResponse.json({ error: latestErr.message }, { status: 500 })
    }

    // Pick latest per scheme_code
    const latestByScheme = new Map<number, { date: string; nav: number }>()
    for (const row of latestRows ?? []) {
      if (!latestByScheme.has(row.scheme_code)) {
        latestByScheme.set(row.scheme_code, { date: row.date, nav: Number(row.nav) })
      }
    }

    // Determine the common latest date
    const latestDates = Array.from(latestByScheme.values()).map(v => v.date)
    if (latestDates.length === 0) {
      return NextResponse.json([])
    }
    const maxDate = latestDates.reduce((a, b) => (a > b ? a : b))

    // 3. Query NAV ~1y, ~3y, ~5y ago with ±7 day windows
    const target1y = dateMinusYears(maxDate, 1)
    const target3y = dateMinusYears(maxDate, 3)
    const target5y = dateMinusYears(maxDate, 5)

    const windowDays = 7
    function windowRange(target: string): [string, string] {
      const d = new Date(target)
      const lo = new Date(d); lo.setDate(lo.getDate() - windowDays)
      const hi = new Date(d); hi.setDate(hi.getDate() + windowDays)
      return [lo.toISOString().slice(0, 10), hi.toISOString().slice(0, 10)]
    }

    const [lo1, hi1] = windowRange(target1y)
    const [lo3, hi3] = windowRange(target3y)
    const [lo5, hi5] = windowRange(target5y)

    const [r1, r3, r5] = await Promise.all([
      supabase.from('mf_nav_data').select('scheme_code, date, nav')
        .in('scheme_code', schemeCodes).gte('date', lo1).lte('date', hi1).order('date', { ascending: false }),
      supabase.from('mf_nav_data').select('scheme_code, date, nav')
        .in('scheme_code', schemeCodes).gte('date', lo3).lte('date', hi3).order('date', { ascending: false }),
      supabase.from('mf_nav_data').select('scheme_code, date, nav')
        .in('scheme_code', schemeCodes).gte('date', lo5).lte('date', hi5).order('date', { ascending: false }),
    ])

    function pickClosest(rows: Array<{ scheme_code: number; date: string; nav: number }> | null, target: string) {
      const map = new Map<number, { date: string; nav: number }>()
      if (!rows) return map
      for (const row of rows) {
        const existing = map.get(row.scheme_code)
        if (!existing) {
          map.set(row.scheme_code, { date: row.date, nav: Number(row.nav) })
        } else {
          const prevDiff = Math.abs(new Date(existing.date).getTime() - new Date(target).getTime())
          const thisDiff = Math.abs(new Date(row.date).getTime() - new Date(target).getTime())
          if (thisDiff < prevDiff) {
            map.set(row.scheme_code, { date: row.date, nav: Number(row.nav) })
          }
        }
      }
      return map
    }

    const nav1yMap = pickClosest(r1.data as Array<{ scheme_code: number; date: string; nav: number }> | null, target1y)
    const nav3yMap = pickClosest(r3.data as Array<{ scheme_code: number; date: string; nav: number }> | null, target3y)
    const nav5yMap = pickClosest(r5.data as Array<{ scheme_code: number; date: string; nav: number }> | null, target5y)

    // 4. Assemble result
    const result = funds.map(f => {
      const latest = latestByScheme.get(f.scheme_code)
      const nav1y = nav1yMap.get(f.scheme_code)
      const nav3y = nav3yMap.get(f.scheme_code)
      const nav5y = nav5yMap.get(f.scheme_code)

      const currentNav = latest?.nav ?? null
      const navDate = latest?.date ?? null

      return {
        scheme_code: f.scheme_code,
        scheme_name: f.scheme_name,
        fund_house: f.fund_house,
        scheme_category: f.scheme_category,
        nav: currentNav,
        nav_date: navDate,
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
