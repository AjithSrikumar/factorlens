export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'
import { getIndexSearchTerms } from '@/lib/index-fund-map'

const MFAPI_SEARCH = 'https://api.mfapi.in/mf/search'
const MFAPI_FUND   = 'https://api.mfapi.in/mf'
const STOP_WORDS   = new Set(['nifty', 'index', 'fund', 'the', 'of', 'and', 'etf', 'direct', 'growth', 'regular'])

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Extract all meaningful keywords from a search term, normalising hyphens */
function keywords(term: string): string[] {
  return term
    .replace(/-/g, ' ')            // treat hyphens as spaces
    .split(/\s+/)
    .filter(w => !STOP_WORDS.has(w) && w.length > 2)
}

/** True when the fund name contains enough of the query keywords */
function isMeaningfulMatch(
  fundName: string,
  kwds: string[],
  minHits = 2,
): boolean {
  const norm = fundName.toLowerCase().replace(/-/g, ' ')
  const hits = kwds.filter(w => norm.includes(w))
  return hits.length >= Math.min(minHits, kwds.length)
}

interface MFRow {
  scheme_code:     number
  scheme_name:     string
  fund_house:      string
  scheme_category: string
  nav:             number | null
  nav_date:        string | null
  return_1y:       number | null
  return_3y:       number | null
  return_5y:       number | null
}

/** Fetch a single fund's latest NAV + approximate period returns from mfapi.in */
async function fetchFundDetail(
  schemeCode: number,
  schemeName: string,
): Promise<MFRow> {
  const fallback: MFRow = {
    scheme_code: schemeCode, scheme_name: schemeName,
    fund_house: '', scheme_category: '',
    nav: null, nav_date: null,
    return_1y: null, return_3y: null, return_5y: null,
  }
  try {
    const res = await fetch(`${MFAPI_FUND}/${schemeCode}`, {
      signal: AbortSignal.timeout(6_000),
      headers: { 'Accept': 'application/json' },
    })
    if (!res.ok) return fallback

    const body = await res.json() as {
      meta?: { fund_house?: string; scheme_category?: string; scheme_name?: string }
      data?: Array<{ date: string; nav: string }>
    }

    const navData = body.data ?? []
    if (!navData.length) return fallback

    const toFloat = (s?: string) => (s ? parseFloat(s) : null)
    const cagr    = (start: number, end: number, yr: number) => (Math.pow(end / start, 1 / yr) - 1) * 100

    const latest  = toFloat(navData[0]?.nav)
    const at252   = toFloat(navData[Math.min(251,  navData.length - 1)]?.nav)
    const at756   = toFloat(navData[Math.min(755,  navData.length - 1)]?.nav)
    const at1260  = toFloat(navData[Math.min(1259, navData.length - 1)]?.nav)

    return {
      scheme_code:     schemeCode,
      scheme_name:     body.meta?.scheme_name ?? schemeName,
      fund_house:      body.meta?.fund_house      ?? '',
      scheme_category: body.meta?.scheme_category ?? '',
      nav:             latest,
      nav_date:        navData[0]?.date ?? null,
      return_1y:  latest && at252  && navData.length > 252  ? parseFloat((latest / at252  - 1).toFixed(4)) * 100 : null,
      return_3y:  latest && at756  && navData.length > 756  ? parseFloat(cagr(at756,  latest, 3).toFixed(4)) : null,
      return_5y:  latest && at1260 && navData.length > 1260 ? parseFloat(cagr(at1260, latest, 5).toFixed(4)) : null,
    }
  } catch {
    return fallback
  }
}

// ─── route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const indexName = req.nextUrl.searchParams.get('indexName') ?? ''
  if (!indexName) {
    return NextResponse.json({ error: 'indexName query param is required' }, { status: 400 })
  }

  // Build a rich set of search terms: original + de-hyphenated + compact + spaced
  const baseTerms = getIndexSearchTerms(indexName)
  const allTerms  = [...new Set([
    ...baseTerms,
    // de-hyphenate every term (handles "low-volatility" → "low volatility")
    ...baseTerms.map(t => t.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()),
  ])].filter(Boolean)

  const allKwds = [...new Set(allTerms.flatMap(t => keywords(t)))]

  try {
    // ── Path A: Supabase mf_funds table ────────────────────────────────────
    if (isSupabaseConfigured()) {
      const seen    = new Set<number>()
      const results: MFRow[] = []

      for (const term of allTerms) {
        const { data, error } = await supabaseAdmin
          .from('mf_funds')
          .select('scheme_code, scheme_name, fund_house, scheme_category, nav, nav_date, return_1y, return_3y, return_5y')
          .ilike('scheme_name', `%${term}%`)
          .order('return_3y', { ascending: false, nullsFirst: false })
          .limit(30)

        if (!error && data?.length) {
          for (const row of data) {
            const code = row.scheme_code as number
            if (!seen.has(code) && isMeaningfulMatch(row.scheme_name as string, allKwds)) {
              seen.add(code)
              results.push(row as unknown as MFRow)
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

    // ── Path B: mfapi.in search + live NAV fetch ──────────────────────────
    // Try every search term and collect unique scheme codes
    const seenCodes = new Set<number>()
    const rawHits: Array<{ schemeCode: number; schemeName: string }> = []

    for (const term of allTerms.slice(0, 4)) {   // cap at 4 queries
      try {
        const res = await fetch(`${MFAPI_SEARCH}?q=${encodeURIComponent(term)}`, {
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) continue

        const data = await res.json() as Array<{ schemeCode: number; schemeName: string }>
        for (const item of data) {
          if (!seenCodes.has(item.schemeCode)) {
            seenCodes.add(item.schemeCode)
            rawHits.push(item)
          }
        }
        if (rawHits.length >= 20) break          // enough candidates
      } catch { continue }
    }

    // Keep only funds whose name meaningfully matches the index
    const filtered = rawHits.filter(d => isMeaningfulMatch(d.schemeName, allKwds))

    if (!filtered.length) {
      return NextResponse.json([], {
        headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=300' },
      })
    }

    // Fetch live NAV + returns in parallel (top 8 results)
    const settled = await Promise.allSettled(
      filtered.slice(0, 8).map(d => fetchFundDetail(d.schemeCode, d.schemeName))
    )

    const withNav: MFRow[] = settled
      .filter((r): r is PromiseFulfilledResult<MFRow> => r.status === 'fulfilled')
      .map(r => r.value)

    return NextResponse.json(withNav, {
      headers: { 'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=900' },
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
