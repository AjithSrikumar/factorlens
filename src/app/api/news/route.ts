/**
 * GET /api/news
 *
 * Paginated, filtered news endpoint.
 *
 * Query params:
 *   category   — 'Markets' | 'Companies' | 'Economy' | 'Policy'
 *   top        — 'true' to return only importance_score >= 7
 *   limit      — page size (default 20, max 50)
 *   cursor     — ISO timestamp for cursor-based pagination (published_at <)
 *   q          — text search in headline
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const params   = req.nextUrl.searchParams
  const category = params.get('category')
  const topOnly  = params.get('top') === 'true'
  const limit    = Math.min(50, Math.max(1, Number(params.get('limit') ?? 20)))
  const cursor   = params.get('cursor')    // ISO date string
  const q        = params.get('q')?.trim()

  try {
    let query = supabase
      .from('news')
      .select('id, headline, summary, source, source_url, image_url, category, published_at, importance_score, key_points, why_it_matters, is_market_moving')
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('scraped_at',   { ascending: false })
      .limit(limit)

    if (category) query = query.eq('category', category)
    if (topOnly)  query = query.gte('importance_score', 7)
    if (cursor)   query = query.lt('published_at', cursor)
    if (q)        query = query.ilike('headline', `%${q}%`)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const articles = data ?? []
    const nextCursor = articles.length === limit
      ? articles[articles.length - 1]?.published_at ?? null
      : null

    return NextResponse.json(
      { articles, nextCursor, count: articles.length },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
