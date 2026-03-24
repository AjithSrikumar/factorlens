/**
 * Standalone script: scrape news from configured sources and insert into Supabase.
 * Uses the Supabase REST API so no direct Postgres connection is required.
 *
 * Usage: tsx scripts/run-scrape.ts
 */

import { scrapeNewsFeeds } from '../src/lib/news-scraper'
import { summarizeBatch }  from '../src/lib/news-summarizer'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? 'https://lerpchldswooqrfscuig.supabase.co'
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY
  ?? 'sb_secret_wTk8hh2NLRgd_SDK_2dWCg_TTgsdnuM'

async function main() {
  console.log('[scrape] Starting news scrape…')

  // 1. Scrape
  const scraped = await scrapeNewsFeeds({ maxPerSource: 25, fetchFullContent: true, minScore: 1 })
  console.log(`[scrape] Got ${scraped.length} finance-relevant articles`)

  if (scraped.length === 0) {
    console.log('[scrape] Nothing to insert.')
    return
  }

  // 2. Summarize
  const summarized = await summarizeBatch(scraped.slice(0, 30), 5)
  console.log(`[scrape] Summarized ${summarized.length} articles`)

  if (summarized.length === 0) {
    console.log('[scrape] Nothing passed summarization.')
    return
  }

  // 3. Insert via Supabase REST API
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

  const res = await fetch(`${SUPABASE_URL}/rest/v1/news`, {
    method:  'POST',
    headers: {
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify(rows),
  })

  if (res.ok) {
    console.log(`[scrape] Inserted ${rows.length} articles. Sources: ${[...new Set(rows.map(r => r.source))].join(', ')}`)
  } else {
    const err = await res.text()
    console.error(`[scrape] Insert failed (HTTP ${res.status}):`, err)
  }
}

main().catch(console.error)
