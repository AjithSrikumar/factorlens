export const dynamic = 'force-dynamic'

/**
 * GET /api/news
 *
 * Paginated, filtered news endpoint using direct Postgres connection.
 *
 * Query params:
 *   category   — 'Markets' | 'Companies' | 'Economy' | 'Policy'
 *   top        — 'true' to return only importance_score >= 7
 *   limit      — page size (default 20, max 50)
 *   cursor     — ISO timestamp for cursor-based pagination (published_at <)
 *   q          — text search in headline
 */

import { NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'

export async function GET(req: NextRequest) {
  const params   = req.nextUrl.searchParams
  const category = params.get('category')
  const topOnly  = params.get('top') === 'true'
  const limit    = Math.min(50, Math.max(1, Number(params.get('limit') ?? 20)))
  const cursor   = params.get('cursor')
  const q        = params.get('q')?.trim()

  const sql = postgres(process.env.SUPABASE_DB_URL!, { ssl: 'require', max: 3 })

  try {
    const articles = await sql`
      SELECT
        id, headline, summary, source, source_url, image_url, category,
        published_at, importance_score, key_points, why_it_matters, is_market_moving
      FROM news
      WHERE TRUE
        ${category ? sql`AND category = ${category}` : sql``}
        ${topOnly  ? sql`AND importance_score >= 7`  : sql``}
        ${cursor   ? sql`AND published_at < ${new Date(cursor)}` : sql``}
        ${q        ? sql`AND headline ILIKE ${'%' + q + '%'}`    : sql``}
      ORDER BY published_at DESC NULLS LAST, scraped_at DESC
      LIMIT ${limit}
    `

    const nextCursor = articles.length === limit
      ? (articles[articles.length - 1]?.published_at ?? null)
      : null

    return NextResponse.json(
      { articles, nextCursor, count: articles.length },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    await sql.end()
  }
}
