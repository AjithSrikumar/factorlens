export const dynamic = 'force-dynamic'

/**
 * /api/cron/news-scrape
 *
 * Cron endpoint: scrape RSS/HTML feeds → summarize → store in Supabase.
 * Uses the Supabase JS client (no direct Postgres connection required).
 * Auth: Bearer token or ?secret= query param via CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }      from '@supabase/supabase-js'
import { scrapeNewsFeeds }   from '@/lib/news-scraper'
import { summarizeBatch }    from '@/lib/news-summarizer'

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    { auth: { persistSession: false } },
  )

  try {
    // ── 1. Load existing URLs (last 24 h) ────────────────────────────────
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existing, error: fetchErr } = await supabase
      .from('news')
      .select('source_url')
      .gte('scraped_at', since)

    if (fetchErr) throw new Error(`DB read failed: ${fetchErr.message}`)

    const existingUrls = new Set((existing ?? []).map(r => r.source_url as string))
    log.push(`[init] ${existingUrls.size} existing URLs in last 24 h`)

    // ── 2. Scrape feeds ───────────────────────────────────────────────────
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

    // ── 5. Upsert via Supabase JS ─────────────────────────────────────────
    if (summarized.length > 0) {
      const rows = summarized.map(({ raw, summary }) => ({
        headline:         summary.headline.slice(0, 500),
        summary:          summary.summary,
        source:           raw.source,
        source_url:       raw.sourceUrl,
        image_url:        raw.imageUrl ?? null,
        category:         summary.category,
        published_at:     (raw.publishedAt ?? new Date()).toISOString(),
        importance_score: summary.importance_score,
        key_points:       summary.key_points,
        why_it_matters:   summary.why_it_matters,
        is_market_moving: summary.is_market_moving,
      }))

      const { error: insertErr } = await supabase
        .from('news')
        .upsert(rows, { onConflict: 'source_url', ignoreDuplicates: true })

      if (insertErr) {
        log.push(`[db] insert error: ${insertErr.message}`)
      } else {
        log.push(`[db] upserted ${rows.length} rows`)
      }
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
  }
}
