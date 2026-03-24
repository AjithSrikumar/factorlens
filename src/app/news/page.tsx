/**
 * /news — Finance News Feed
 *
 * Server component: fetches initial articles from Supabase for SSR,
 * then hydrates the client-side NewsFeed component for live updates.
 */

import postgres          from 'postgres'
import { NewsFeed }     from '@/components/news-feed'
import type { NewsArticle } from '@/components/news-card'
import type { Metadata }    from 'next'

export const metadata: Metadata = {
  title:       'Market Intelligence — FactorLens News',
  description: 'Bloomberg-quality financial news summaries. Markets, companies, economy, and policy — curated for serious investors.',
}

// Revalidate every 60 seconds for fresh SSR content
export const revalidate = 60

async function getInitialArticles(): Promise<NewsArticle[]> {
  try {
    const sql = postgres(process.env.SUPABASE_DB_URL!, { ssl: 'require', max: 1 })
    try {
      const rows = await sql`
        SELECT id, headline, summary, source, source_url, image_url, category,
               published_at, importance_score, key_points, why_it_matters, is_market_moving
        FROM news
        ORDER BY published_at DESC NULLS LAST, scraped_at DESC
        LIMIT 30
      `
      return rows as unknown as NewsArticle[]
    } finally {
      await sql.end()
    }
  } catch (err) {
    console.error('[news/page] Failed to fetch initial articles:', err)
    return []
  }
}

export default async function NewsPage() {
  const articles = await getInitialArticles()

  return (
    <>
      {/* Inline styles for news-specific layout overrides */}
      <style>{`
        /* Override main layout padding for the news feed full-screen experience */
        main { padding: 0 !important; }

        /* Spin keyframe (shared with other components) */
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Pulse for market-moving badge */
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: .7; }
        }

        /* Hide scrollbar on category chips and progress bar */
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        /* Desktop card height: no bottom nav, just subtract top nav */
        @media (min-width: 768px) {
          .news-card-snap {
            height: calc(100svh - 60px - 105px) !important;
          }
        }

        /* On desktop the overall feed container height is different */
        @media (min-width: 768px) {
          .news-feed-container {
            height: calc(100svh - 60px);
          }
        }
      `}</style>

      {/* Full-viewport container: mobile accounts for both top + bottom navbars */}
      <div
        className="news-feed-container"
        style={{
          height: 'calc(100svh - 52px - 72px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <NewsFeed initialArticles={articles} />
      </div>
    </>
  )
}
