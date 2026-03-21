import { NextResponse } from 'next/server'
import { discoverSchemeEntries } from '@/lib/mf-funds'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'

// ── Main handler ──────────────────────────────────────────────────────────────
//
// Always reads from the `mf_funds` Supabase table (populated + refreshed daily
// by the /api/cron/mf-eod job).  The old live-fetch fallback that hit
// mfapi.in for all 259 funds on every page load (60-130 s cold start) has been
// removed — the DB is the single source of truth for the funds page.

export async function GET() {
  try {
    if (isSupabaseConfigured()) {
      // ── Ensure every known scheme exists in mf_funds ──────────────────────
      // This is a no-op after the first request (ignoreDuplicates = true).
      // It means the page can render fund names even before the first cron run.
      const entries = await discoverSchemeEntries()
      if (entries.length > 0) {
        await supabaseAdmin.from('mf_funds').upsert(
          entries.map(e => ({
            scheme_code: e.schemeCode,
            scheme_name: e.schemeName,
          })),
          { onConflict: 'scheme_code', ignoreDuplicates: true },
        )
      }

      // ── Read pre-computed data from mf_funds ──────────────────────────────
      const { data, error } = await supabaseAdmin
        .from('mf_funds')
        .select('scheme_code, scheme_name, fund_house, scheme_category, nav, nav_date, return_1y, return_3y, return_5y')
        .limit(1000)

      if (!error && data) {
        // Sort: funds with live NAV first, then by 1Y return descending
        const sorted = [...data].sort((a, b) => {
          if (a.nav !== null && b.nav === null) return -1
          if (a.nav === null && b.nav !== null) return  1
          const ar = (a.return_1y as number | null) ?? -Infinity
          const br = (b.return_1y as number | null) ?? -Infinity
          return br - ar
        })
        return NextResponse.json(sorted, {
          headers: { 'Cache-Control': 'no-store' },
        })
      }
    }

    // ── Fallback: skeleton rows (Supabase not configured) ────────────────────
    // Returns fund names with null NAV/returns so the page renders immediately
    // without any spinner. The mf-eod cron will populate real data.
    const entries = await discoverSchemeEntries()
    return NextResponse.json(
      entries.map(e => ({
        scheme_code:     e.schemeCode,
        scheme_name:     e.schemeName,
        fund_house:      null,
        scheme_category: null,
        nav:             null,
        nav_date:        null,
        return_1y:       null,
        return_3y:       null,
        return_5y:       null,
        aum_cr:          null,
      })),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
