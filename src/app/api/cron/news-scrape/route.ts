/**
 * /api/cron/news-scrape
 *
 * Cron endpoint: scrape RSS feeds → summarize → store in Supabase.
 * Uses direct Postgres connection (bypasses PostgREST schema cache).
 * Auth: Bearer token or ?secret= query param via CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'
import { scrapeNewsFeeds } from '@/lib/news-scraper'
import { summarizeBatch }  from '@/lib/news-summarizer'

// ─── Auth helper ─────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('secret') === secret
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log: string[] = []
  const t0  = Date.now()
  const sql = postgres(process.env.SUPABASE_DB_URL!, { ssl: 'require', max: 3 })

  try {
    // ── 1. Load existing URLs (last 24 h) ────────────────────────────────
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const existing = await sql<{ source_url: string }[]>`
      SELECT source_url FROM news WHERE scraped_at >= ${since}
    `
    const existingUrls = new Set(existing.map(r => r.source_url))
    log.push(`[init] ${existingUrls.size} existing URLs in last 24 h`)

    // ── 2. Scrape RSS feeds ───────────────────────────────────────────────
    const scraped = await scrapeNewsFeeds({ maxPerSource: 20, fetchFullContent: true, minScore: 1 })
    log.push(`[scrape] ${scraped.length} articles after finance filter`)

    // ── 3. Deduplicate ────────────────────────────────────────────────────
    const newArticles = scraped.filter(a => !existingUrls.has(a.sourceUrl))
    log.push(`[dedup] ${newArticles.length} new articles to summarize`)

    if (newArticles.length === 0) {
      return NextResponse.json({ ok: true, log, duration_ms: Date.now() - t0 })
    }

    // ── 4. Summarize ──────────────────────────────────────────────────────
    const toProcess  = newArticles.slice(0, 20)
    const summarized = await summarizeBatch(toProcess, 5)
    log.push(`[summarize] ${summarized.length}/${toProcess.length} articles summarized`)

    // ── 5. Upsert directly via Postgres ───────────────────────────────────
    if (summarized.length > 0) {
      const rows = summarized.map(({ raw, summary }) => ({
        headline:         summary.headline.slice(0, 500),
        summary:          summary.summary,
        source:           raw.source,
        source_url:       raw.sourceUrl,
        image_url:        raw.imageUrl ?? null,
        category:         summary.category,
        published_at:     raw.publishedAt ?? new Date(),
        importance_score: summary.importance_score,
        key_points:       JSON.stringify(summary.key_points),
        why_it_matters:   summary.why_it_matters,
        is_market_moving: summary.is_market_moving,
      }))

      let inserted = 0
      for (const row of rows) {
        try {
          await sql`
            INSERT INTO news
              (headline, summary, source, source_url, image_url, category,
               published_at, importance_score, key_points, why_it_matters, is_market_moving)
            VALUES
              (${row.headline}, ${row.summary}, ${row.source}, ${row.source_url},
               ${row.image_url}, ${row.category}, ${row.published_at},
               ${row.importance_score}, ${row.key_points}::jsonb,
               ${row.why_it_matters}, ${row.is_market_moving})
            ON CONFLICT (source_url) DO NOTHING
          `
          inserted++
        } catch {
          // skip individual row errors (e.g. constraint violations)
        }
      }
      log.push(`[db] inserted ${inserted} rows`)
    }

    return NextResponse.json({
      ok:          true,
      scraped:     scraped.length,
      new:         newArticles.length,
      summarized:  summarized.length,
      log,
      duration_ms: Date.now() - t0,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.push(`[error] ${msg}`)
    console.error('[news-scrape] unhandled error:', msg)
    return NextResponse.json({ ok: false, error: msg, log, duration_ms: Date.now() - t0 }, { status: 500 })
  } finally {
    await sql.end()
  }
}
