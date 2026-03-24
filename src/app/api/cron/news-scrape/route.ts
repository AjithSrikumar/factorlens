/**
 * /api/cron/news-scrape
 *
 * Cron endpoint: scrape RSS feeds → AI summarize → store in Supabase.
 * Runs every 5 minutes via Vercel Cron.
 * Auth: Bearer token via CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scrapeNewsFeeds }   from '@/lib/news-scraper'
import { summarizeBatch }    from '@/lib/news-summarizer'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── Auth helper ─────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true   // no secret configured — allow all (dev mode)
  const auth   = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('secret') === secret
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log: string[] = []
  const t0 = Date.now()

  try {
    // ── 1. Load existing URLs to avoid re-processing ──────────────────────
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()  // last 24 h
    const { data: existing } = await supabase
      .from('news')
      .select('source_url')
      .gte('scraped_at', since)

    const existingUrls = new Set<string>(
      (existing ?? []).map((r: { source_url: string }) => r.source_url)
    )
    log.push(`[init] ${existingUrls.size} existing URLs in last 24 h`)

    // ── 2. Scrape RSS feeds ───────────────────────────────────────────────
    const scraped = await scrapeNewsFeeds({
      maxPerSource:    20,
      fetchFullContent: true,
      minScore:        1,
    })
    log.push(`[scrape] ${scraped.length} articles after finance filter`)

    // ── 3. Filter out already-stored articles ─────────────────────────────
    const newArticles = scraped.filter(a => !existingUrls.has(a.sourceUrl))
    log.push(`[dedup] ${newArticles.length} new articles to summarize`)

    if (newArticles.length === 0) {
      return NextResponse.json({ ok: true, log, duration_ms: Date.now() - t0 })
    }

    // ── 4. Summarize via Claude (batch, max 20 per cron run) ──────────────
    const toProcess = newArticles.slice(0, 20)
    const summarized = await summarizeBatch(toProcess, 5)
    log.push(`[summarize] ${summarized.length}/${toProcess.length} articles summarized`)

    // ── 5. Insert into Supabase ───────────────────────────────────────────
    if (summarized.length > 0) {
      const rows = summarized.map(({ raw, summary }) => ({
        headline:         summary.headline,
        summary:          summary.summary,
        source:           raw.source,
        source_url:       raw.sourceUrl,
        image_url:        raw.imageUrl,
        category:         summary.category,
        published_at:     raw.publishedAt?.toISOString() ?? new Date().toISOString(),
        importance_score: summary.importance_score,
        key_points:       summary.key_points,
        why_it_matters:   summary.why_it_matters,
        is_market_moving: summary.is_market_moving,
      }))

      const { error, data: inserted } = await supabase
        .from('news')
        .upsert(rows, { onConflict: 'source_url', ignoreDuplicates: true })
        .select('id')

      if (error) {
        log.push(`[db] ERROR: ${error.message}`)
      } else {
        log.push(`[db] inserted ${inserted?.length ?? rows.length} rows`)
      }
    }

    // ── 6. Return summary ─────────────────────────────────────────────────
    return NextResponse.json({
      ok:           true,
      scraped:      scraped.length,
      new:          newArticles.length,
      summarized:   summarized.length,
      log,
      duration_ms:  Date.now() - t0,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.push(`[error] ${msg}`)
    console.error('[news-scrape] unhandled error:', msg)
    return NextResponse.json({ ok: false, error: msg, log, duration_ms: Date.now() - t0 }, { status: 500 })
  }
}
