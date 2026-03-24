/**
 * news-scraper.ts
 *
 * RSS-based news scraper for finance-focused Indian business news sources.
 * Parses RSS/Atom feeds, filters for finance relevance, and optionally
 * fetches richer article content for summarization.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawArticle {
  headline:    string
  content:     string      // RSS description + any scraped body
  sourceUrl:   string
  source:      string
  imageUrl:    string | null
  publishedAt: Date | null
}

// ─── Feed definitions ─────────────────────────────────────────────────────────

export interface FeedConfig {
  source: string
  urls:   string[]
}

export const NEWS_FEEDS: FeedConfig[] = [
  {
    source: 'Livemint',
    urls: [
      'https://www.livemint.com/rss/markets',
      'https://www.livemint.com/rss/companies',
      'https://www.livemint.com/rss/economy',
    ],
  },
  {
    source: 'NDTV Profit',
    urls: [
      'https://feeds.feedburner.com/ndtvprofit-latest',
    ],
  },
  {
    source: 'Hindu Business Line',
    urls: [
      'https://www.thehindubusinessline.com/markets/?service=rss',
      'https://www.thehindubusinessline.com/economy/?service=rss',
      'https://www.thehindubusinessline.com/companies/?service=rss',
    ],
  },
]

// ─── Finance relevance filter ─────────────────────────────────────────────────

/** Keywords that strongly signal finance-relevant content */
const FINANCE_KEYWORDS = new Set([
  'stock', 'shares', 'equity', 'market', 'sensex', 'nifty', 'bse', 'nse',
  'rupee', 'forex', 'currency', 'dollar', 'yen', 'euro', 'pound',
  'rbi', 'sebi', 'irdai', 'nsdl', 'cdsl', 'irda', 'nabard',
  'ipo', 'listing', 'buyback', 'dividend', 'bonus', 'split', 'demerger',
  'results', 'earnings', 'profit', 'revenue', 'ebitda', 'pbt', 'pat',
  'acquisition', 'merger', 'takeover', 'stake', 'investment', 'divestment',
  'bank', 'nbfc', 'insurance', 'mutual fund', 'amc', 'etf', 'nav',
  'inflation', 'gdp', 'cpi', 'wpi', 'iip', 'pmi', 'trade deficit',
  'budget', 'fiscal', 'monetary', 'policy', 'regulation', 'compliance',
  'crude', 'oil', 'gold', 'silver', 'commodity', 'bullion',
  'fii', 'fpi', 'dii', 'fdi', 'foreign investment',
  'interest rate', 'repo rate', 'crr', 'slr', 'liquidity', 'credit',
  'debt', 'bond', 'yield', 'gilt', 'treasury', 'fixed income',
  'vc', 'pe', 'private equity', 'startup', 'unicorn', 'funding round',
  'q1', 'q2', 'q3', 'q4', 'quarterly', 'annual', 'fy', 'turnover',
  'capex', 'order book', 'revenue guidance', 'margin', 'npa', 'gnpa',
  'promoter', 'institutional', 'bulk deal', 'block deal',
])

/** Terms that indicate non-finance content — always exclude if in headline */
const EXCLUDE_TERMS = new Set([
  'cricket', 'football', 'tennis', 'hockey', 'kabaddi', 'chess',
  'bollywood', 'film', 'movie', 'actor', 'actress', 'celebrity', 'entertainment',
  'recipe', 'restaurant', 'cuisine', 'food festival',
  'fashion', 'beauty', 'lifestyle', 'travel', 'tourism',
  'horoscope', 'astrology', 'numerology',
  'viral', 'trending', 'social media', 'instagram', 'twitter meme',
])

/**
 * Score a headline/content for finance relevance.
 * Returns a score: ≥2 is finance-relevant, <2 is filtered out.
 */
export function financeScore(headline: string, content: string): number {
  const text = `${headline} ${content}`.toLowerCase()

  // Instant reject
  for (const term of EXCLUDE_TERMS) {
    if (text.includes(term)) return 0
  }

  // Count finance keyword hits
  let score = 0
  for (const kw of FINANCE_KEYWORDS) {
    if (text.includes(kw)) score++
  }

  // Boost for headline hits (headline keywords count double)
  const hl = headline.toLowerCase()
  for (const kw of FINANCE_KEYWORDS) {
    if (hl.includes(kw)) score++
  }

  return score
}

export function isFinanceRelevant(headline: string, content: string): boolean {
  return financeScore(headline, content) >= 2
}

// ─── XML / RSS helpers ────────────────────────────────────────────────────────

/** Extract raw text from a single XML tag (handles CDATA) */
function extractTag(xml: string, tag: string): string {
  // Try namespace-prefixed variant first (e.g. content:encoded)
  const patterns = [
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>`, 'i'),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  ]
  for (const re of patterns) {
    const m = xml.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return ''
}

/** Try several tag variants for the link element */
function extractLink(itemXml: string): string {
  // <link> can appear as text node between tags OR as href attribute
  const plain = itemXml.match(/<link>([^<]+)<\/link>/i)
  if (plain?.[1]) return plain[1].trim()

  const href = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i)
  if (href?.[1]) return href[1].trim()

  // Atom <id> often contains the URL
  const id = itemXml.match(/<id>([^<]+)<\/id>/i)
  if (id?.[1]?.startsWith('http')) return id[1].trim()

  return ''
}

/** Extract image URL from RSS item (enclosure, media:content, media:thumbnail, og tags) */
function extractImageUrl(itemXml: string): string | null {
  // <enclosure url="..." type="image/..."/>
  const enc = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image[^"']*["']/i)
    || itemXml.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i)
  if (enc?.[1]) return enc[1]

  // <media:content url="..."/>  or  <media:thumbnail url="..."/>
  const media = itemXml.match(/<media:[^>]+url=["']([^"']+\.(jpg|jpeg|png|webp))[^"']*["']/i)
  if (media?.[1]) return media[1]

  // <image> block
  const img = itemXml.match(/<image[^>]*>[\s\S]*?<url>([^<]+)<\/url>/i)
  if (img?.[1]) return img[1].trim()

  // Inline <img> inside description / content
  const inlineImg = itemXml.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (inlineImg?.[1] && !inlineImg[1].includes('spacer') && !inlineImg[1].includes('pixel')) {
    return inlineImg[1]
  }

  return null
}

/** Strip HTML tags and decode basic HTML entities */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Parse a pubDate / dc:date string to a Date object */
function parseDate(raw: string): Date | null {
  if (!raw) return null
  try {
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

// ─── RSS feed parser ──────────────────────────────────────────────────────────

interface RSSItem {
  title:       string
  link:        string
  description: string
  content:     string
  pubDate:     string
  imageUrl:    string | null
}

function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = []

  // Support both RSS <item> and Atom <entry>
  const tagRe = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/gi
  let match: RegExpExecArray | null

  while ((match = tagRe.exec(xml)) !== null) {
    const raw = match[1] || match[2]
    if (!raw) continue

    const title       = stripHtml(extractTag(raw, 'title'))
    const link        = extractLink(raw)
    const description = stripHtml(extractTag(raw, 'description') || extractTag(raw, 'summary'))
    const content     = stripHtml(extractTag(raw, 'content:encoded') || extractTag(raw, 'content'))
    const pubDate     = extractTag(raw, 'pubDate') || extractTag(raw, 'published') || extractTag(raw, 'dc:date') || extractTag(raw, 'updated')
    const imageUrl    = extractImageUrl(raw)

    if (title && link) {
      items.push({ title, link, description, content, pubDate, imageUrl })
    }
  }

  return items
}

// ─── Article content fetcher ─────────────────────────────────────────────────

/**
 * Attempt to scrape a richer article body from the source URL.
 * Falls back gracefully — never throws.
 */
async function fetchArticleContent(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(8_000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FactorLensBot/1.0; +https://factorlens.vercel.app)',
        'Accept':     'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) return ''

    const html = await res.text()

    // Extract content from common article containers
    const contentPatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]+class="[^"]*(?:article-body|story-body|entry-content|article-content|post-content|articleBody|article_body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+id="[^"]*(?:article-body|story-content|content-body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ]

    for (const re of contentPatterns) {
      const m = html.match(re)
      if (m?.[1]) {
        const text = stripHtml(m[1])
        if (text.length > 200) return text.slice(0, 3000)
      }
    }

    // Fallback: grab all paragraph text
    const paragraphs: string[] = []
    const pRe = /<p[^>]*>([\s\S]*?)<\/p>/gi
    let pm: RegExpExecArray | null
    while ((pm = pRe.exec(html)) !== null) {
      const t = stripHtml(pm[1])
      if (t.length > 40) paragraphs.push(t)
      if (paragraphs.join(' ').length > 2500) break
    }
    return paragraphs.join(' ').slice(0, 3000)
  } catch {
    return ''
  }
}

// ─── Main feed fetcher ────────────────────────────────────────────────────────

/**
 * Fetch one RSS feed URL and return parsed raw articles.
 * Tries up to 2 redirects and handles common error cases.
 */
async function fetchFeed(
  url:    string,
  source: string,
): Promise<RawArticle[]> {
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(12_000),
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; FactorLensBot/1.0)',
        'Accept':          'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control':   'no-cache',
      },
    })

    if (!res.ok) {
      console.warn(`[news-scraper] ${source}: HTTP ${res.status} for ${url}`)
      return []
    }

    const xml   = await res.text()
    const items = parseRSSItems(xml)

    if (items.length === 0) {
      console.warn(`[news-scraper] ${source}: no items parsed from ${url}`)
      return []
    }

    const articles: RawArticle[] = []
    for (const item of items) {
      // Use RSS content if it's rich enough; otherwise schedule a page fetch later
      const bodyText = item.content.length > 200
        ? item.content
        : item.description

      articles.push({
        headline:    item.title,
        content:     bodyText || item.description,
        sourceUrl:   item.link,
        source,
        imageUrl:    item.imageUrl,
        publishedAt: parseDate(item.pubDate),
      })
    }

    return articles
  } catch (err) {
    console.warn(`[news-scraper] ${source}: fetch failed for ${url}:`, err instanceof Error ? err.message : err)
    return []
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ScrapeOptions {
  /** Max articles to return per source (default 25) */
  maxPerSource?: number
  /** Fetch full article body from URL if RSS content is thin (default true) */
  fetchFullContent?: boolean
  /** Minimum finance relevance score to pass pre-filter (default 2) */
  minScore?: number
}

/**
 * Scrape all configured news feeds, apply finance filtering, and optionally
 * enrich content by fetching full article pages.
 *
 * Returns de-duplicated RawArticle[] sorted by publishedAt DESC.
 */
export async function scrapeNewsFeeds(opts: ScrapeOptions = {}): Promise<RawArticle[]> {
  const {
    maxPerSource   = 25,
    fetchFullContent = true,
    minScore       = 2,
  } = opts

  const results = await Promise.allSettled(
    NEWS_FEEDS.flatMap(feed =>
      // Try each feed URL; first successful one wins (via concurrency)
      feed.urls.map(url => fetchFeed(url, feed.source))
    )
  )

  // Collect all articles, keeping the best (non-empty) result per source
  const bySource = new Map<string, RawArticle[]>()
  for (const r of results) {
    if (r.status !== 'fulfilled' || r.value.length === 0) continue
    const src = r.value[0].source
    const existing = bySource.get(src)
    // Keep whichever feed gave us more articles
    if (!existing || r.value.length > existing.length) {
      bySource.set(src, r.value)
    }
  }

  // Merge, deduplicate by URL, apply pre-filter
  const seen  = new Set<string>()
  let all: RawArticle[] = []

  for (const [, articles] of bySource) {
    let count = 0
    for (const a of articles) {
      if (seen.has(a.sourceUrl)) continue
      seen.add(a.sourceUrl)

      if (!isFinanceRelevant(a.headline, a.content)) continue
      if (financeScore(a.headline, a.content) < minScore) continue

      all.push(a)
      if (++count >= maxPerSource) break
    }
  }

  // Optionally enrich with full article content (parallelised, max 10 at once)
  if (fetchFullContent) {
    const thin = all.filter(a => a.content.length < 300)
    const CHUNK = 10
    for (let i = 0; i < thin.length; i += CHUNK) {
      const chunk = thin.slice(i, i + CHUNK)
      const enriched = await Promise.allSettled(
        chunk.map(a => fetchArticleContent(a.sourceUrl))
      )
      for (let j = 0; j < chunk.length; j++) {
        const r = enriched[j]
        if (r.status === 'fulfilled' && r.value.length > chunk[j].content.length) {
          chunk[j].content = r.value
        }
      }
    }
  }

  // Sort by published date (newest first), fall back to scrape order
  all.sort((a, b) => {
    if (!a.publishedAt && !b.publishedAt) return 0
    if (!a.publishedAt) return 1
    if (!b.publishedAt) return -1
    return b.publishedAt.getTime() - a.publishedAt.getTime()
  })

  return all
}
