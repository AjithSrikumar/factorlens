import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'
import { getIndexSearchTerms } from '@/lib/index-fund-map'

const MFAPI_SEARCH = 'https://api.mfapi.in/mf/search'

export async function GET(req: NextRequest) {
  const indexName = req.nextUrl.searchParams.get('indexName') ?? ''
  if (!indexName) {
    return NextResponse.json({ error: 'indexName query param is required' }, { status: 400 })
  }

  const terms = getIndexSearchTerms(indexName)

  try {
    // ── Path A: Supabase mf_funds table ──────────────────────────────────────
    if (isSupabaseConfigured()) {
      const seen = new Set<number>()
      const results: Record<string, unknown>[] = []

      for (const term of terms) {
        const { data, error } = await supabaseAdmin
          .from('mf_funds')
          .select('scheme_code, scheme_name, fund_house, scheme_category, nav, nav_date, return_1y, return_3y, return_5y')
          .ilike('scheme_name', `%${term}%`)
          .order('return_3y', { ascending: false, nullsFirst: false })
          .limit(50)

        if (!error && data?.length) {
          for (const row of data) {
            if (!seen.has(row.scheme_code as number)) {
              seen.add(row.scheme_code as number)
              results.push(row)
            }
          }
        }
      }

      if (results.length > 0) {
        return NextResponse.json(results, {
          headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=900' },
        })
      }
    }

    // ── Path B: mfapi.in search fallback ─────────────────────────────────────
    // Use the first (most specific) search term.
    const query = terms[0]
    const res = await fetch(`${MFAPI_SEARCH}?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`mfapi.in search returned HTTP ${res.status}`)

    const raw = await res.json() as Array<{ schemeCode: number; schemeName: string }>

    // Filter to only funds whose name contains a meaningful portion of the index name.
    // We take the key words (skip "nifty", "index", "fund") and require at least 2 to match.
    const keyWords = terms[0]
      .split(/\s+/)
      .filter(w => !["nifty", "index", "fund", "the", "of", "and"].includes(w) && w.length > 2)

    const filtered = raw.filter(d => {
      const dn = d.schemeName.toLowerCase()
      const hits = keyWords.filter(w => dn.includes(w))
      return hits.length >= Math.min(2, keyWords.length)
    })

    return NextResponse.json(
      filtered.map(d => ({
        scheme_code:     d.schemeCode,
        scheme_name:     d.schemeName,
        fund_house:      '',
        scheme_category: '',
        nav:             null as null,
        nav_date:        null as null,
        return_1y:       null as null,
        return_3y:       null as null,
        return_5y:       null as null,
      })),
      { headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=900' } }
    )

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
