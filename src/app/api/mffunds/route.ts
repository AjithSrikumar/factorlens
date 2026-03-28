export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import postgres from 'postgres'
import { discoverSchemeEntries } from '@/lib/mf-funds'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'

export async function GET() {
  try {
    // ── Path A: direct SQL (bypasses PostgREST schema cache) ─────────────────
    // PostgREST's schema cache may be stale and unable to see nav/return columns.
    // Direct postgres connection has no such limitation.
    const dbUrl = process.env.SUPABASE_DB_URL
    if (dbUrl) {
      const sql = postgres(dbUrl, { ssl: 'require', max: 1, idle_timeout: 20, connect_timeout: 10 })
      try {
        const rows = await sql`
          SELECT
            scheme_code,
            scheme_name,
            fund_house,
            scheme_category,
            nav::float8          AS nav,
            nav_date::text       AS nav_date,
            return_1y::float8    AS return_1y,
            return_3y::float8    AS return_3y,
            return_5y::float8    AS return_5y
          FROM mf_funds
          ORDER BY scheme_code
          LIMIT 1000
        `
        const data = rows as Record<string, unknown>[]
        const sorted = [...data].sort((a, b) => {
          if (a.nav != null && b.nav == null) return -1
          if (a.nav == null && b.nav != null) return  1
          const ar = (a.return_1y as number | null) ?? -Infinity
          const br = (b.return_1y as number | null) ?? -Infinity
          return br - ar
        })
        return NextResponse.json(sorted, { headers: { 'Cache-Control': 'no-store' } })
      } finally {
        await sql.end()
      }
    }

    // ── Path B: PostgREST (fallback when SUPABASE_DB_URL not set) ────────────
    if (isSupabaseConfigured()) {
      // Seed missing funds so names show even before first cron run
      const entries = await discoverSchemeEntries()
      if (entries.length > 0) {
        await supabaseAdmin.from('mf_funds').upsert(
          entries.map(e => ({ scheme_code: e.schemeCode, scheme_name: e.schemeName })),
          { onConflict: 'scheme_code', ignoreDuplicates: true },
        )
      }

      // Try full select; fall back to names-only if schema cache is stale
      let data: Record<string, unknown>[] | null = null
      const { data: fullData, error: fullError } = await supabaseAdmin
        .from('mf_funds')
        .select('scheme_code, scheme_name, fund_house, scheme_category, nav, nav_date, return_1y, return_3y, return_5y')
        .limit(1000)

      if (!fullError && fullData) {
        data = fullData as Record<string, unknown>[]
      } else {
        const { data: namesData } = await supabaseAdmin
          .from('mf_funds').select('scheme_code, scheme_name').limit(1000)
        if (namesData) data = namesData.map(r => ({
          ...r,
          fund_house: null, scheme_category: null,
          nav: null, nav_date: null,
          return_1y: null, return_3y: null, return_5y: null,
        })) as Record<string, unknown>[]
      }

      if (data) {
        const sorted = [...data].sort((a, b) => {
          if (a.nav != null && b.nav == null) return -1
          if (a.nav == null && b.nav != null) return  1
          const ar = (a.return_1y as number | null) ?? -Infinity
          const br = (b.return_1y as number | null) ?? -Infinity
          return br - ar
        })
        return NextResponse.json(sorted, { headers: { 'Cache-Control': 'no-store' } })
      }
    }

    // ── Path C: static skeleton (nothing configured) ─────────────────────────
    const entries = await discoverSchemeEntries()
    return NextResponse.json(
      entries.map(e => ({
        scheme_code: e.schemeCode, scheme_name: e.schemeName,
        fund_house: null, scheme_category: null,
        nav: null, nav_date: null,
        return_1y: null, return_3y: null, return_5y: null,
      })),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
