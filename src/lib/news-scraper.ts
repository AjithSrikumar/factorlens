/**
 * news-scraper.ts
 *
 * Multi-source news scraper for finance-focused Indian business news.
 * Supports both RSS feeds and HTML listing-page scraping.
 *
 * Sources:
 *  - NDTV Profit       → RSS via FeedBurner
 *  - Hindu Business Line → RSS (native feed)
 *  - Business Standard  → HTML scraping (best-effort; CDN may block)
 *  - MoneyControl       → HTML scraping (best-effort; CDN may block)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RawArticle {
  headline:    string
  content:     string      // description + any scraped body text
  sourceUrl:   string
  source:      string
  imageUrl:    string | null
  publishedAt: Date | null
}

interface FeedSource {
  source: string
  type:   'rss' | 'html'
  url:    string
}

// ─── Feed definitions ─────────────────────────────────────────────────────────

const FEED_SOURCES: FeedSource[] = [
  // NDTV Profit — general latest feed (finance + some non-finance; filtered below)
  {
    source: 'NDTV Profit',
    type:   'rss',
    url:    'https://feeds.feedburner.com/ndtvprofit-latest',
  },
  // The Hindu Business Line — section-specific feeds for high-quality finance signal
  {
    source: 'The Hindu Business Line',
    type:   'rss',
    url:    'https://www.thehindubusinessline.com/markets/feeder/default.rss',
  },
  {
    source: 'The Hindu Business Line',
    type:   'rss',
    url:    'https://www.thehindubusinessline.com/economy/feeder/default.rss',
  },
  {
    source: 'The Hindu Business Line',
    type:   'rss',
    url:    'https://www.thehindubusinessline.com/companies/feeder/default.rss',
  },
  {
    source: 'The Hindu Business Line',
    type:   'rss',
    url:    'https://www.thehindubusinessline.com/money-and-banking/feeder/default.rss',
  },
  // Business Standard & MoneyControl — HTML scraping (best-effort; CDN may block)
  {
    source: 'Business Standard',
    type:   'html',
    url:    'https://www.business-standard.com/latest-news',
  },
  {
    source: 'MoneyControl',
    type:   'html',
    url:    'https://www.moneycontrol.com/news/business/',
  },
]

// ─── Finance relevance filter ─────────────────────────────────────────────────

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

const EXCLUDE_TERMS = new Set([
  'cricket', 'football', 'tennis', 'hockey', 'kabaddi', 'chess',
  'bollywood', 'film', 'movie', 'actor', 'actress', 'celebrity', 'entertainment',
  'recipe', 'restaurant', 'cuisine', 'food festival',
  'fashion', 'beauty', 'lifestyle', 'travel', 'tourism',
  'horoscope', 'astrology', 'numerology',
  'viral', 'trending', 'social media', 'instagram', 'twitter meme',
])

export function financeScore(headline: string, content: string): number {
  const text = `${headline} ${content}`.toLowerCase()
  for (const term of EXCLUDE_TERMS) {
    if (text.includes(term)) return 0
  }
  let score = 0
  for (const kw of FINANCE_KEYWORDS) {
    if (text.includes(kw)) score++
  }
  const hl = headline.toLowerCase()
  for (const kw of FINANCE_KEYWORDS) {
    if (hl.includes(kw)) score++
  }
  return score
}

export function isFinanceRelevant(headline: string, content: string): boolean {
  return financeScore(headline, content) >= 2
}

// ─── Shared HTML helpers ───────────────────────────────────────────────────────

/** Decode HTML entities FIRST, then strip tags */
function stripHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function parseDate(raw: string): Date | null {
  if (!raw) return null
  try {
    const d = new Date(raw)
    return isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}

// ─── RSS helpers ──────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const patterns = [
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
  ]
  for (const re of patterns) {
    const m = xml.match(re)
    if (m?.[1]) return m[1].trim()
  }
  return ''
}

function extractLink(itemXml: string): string {
  // <link>url</link> (plain text, e.g. NDTV Profit)
  const plain = itemXml.match(/<link>([^<]+)<\/link>/i)
  if (plain?.[1]) return plain[1].trim()

  // <link><![CDATA[url]]></link> (CDATA-wrapped, e.g. Hindu Business Line)
  const cdata = itemXml.match(/<link><!\[CDATA\[([^\]]+)\]\]><\/link>/i)
  if (cdata?.[1]) return cdata[1].trim()

  // <link href="url"/> or <link rel="..." href="url"/> (Atom feeds)
  const href = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i)
  if (href?.[1]) return href[1].trim()

  // <id>url</id> (Atom)
  const id = itemXml.match(/<id>([^<]+)<\/id>/i)
  if (id?.[1]?.startsWith('http')) return id[1].trim()

  // <guid> when it contains the canonical URL
  const guidCdata = itemXml.match(/<guid[^>]*><!\[CDATA\[([^\]]+)\]\]><\/guid>/i)
    || itemXml.match(/<guid[^>]*>([^<]+)<\/guid>/i)
  if (guidCdata?.[1]?.startsWith('http')) return guidCdata[1].trim()

  return ''
}

function extractImageUrl(itemXml: string): string | null {
  const enc = itemXml.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image[^"']*["']/i)
    || itemXml.match(/<enclosure[^>]+type=["']image[^"']*["'][^>]+url=["']([^"']+)["']/i)
  if (enc?.[1]) return enc[1]

  const media = itemXml.match(/<media:[^>]+url=["']([^"']+\.(jpg|jpeg|png|webp))[^"']*["']/i)
  if (media?.[1]) return media[1]

  const img = itemXml.match(/<image[^>]*>[\s\S]*?<url>([^<]+)<\/url>/i)
  if (img?.[1]) return img[1].trim()

  const inlineImg = itemXml.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (inlineImg?.[1] && !inlineImg[1].includes('spacer') && !inlineImg[1].includes('pixel')) {
    return inlineImg[1]
  }

  return null
}

/** Strip the #publisher=newsstand and similar tracking fragments from URLs */
function cleanUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.toString()
  } catch {
    return url.split('#')[0]
  }
}

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
  const tagRe = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/gi
  let match: RegExpExecArray | null

  while ((match = tagRe.exec(xml)) !== null) {
    const raw = match[1] || match[2]
    if (!raw) continue

    const title       = stripHtml(extractTag(raw, 'title'))
    const link        = cleanUrl(extractLink(raw))
    const description = stripHtml(extractTag(raw, 'description') || extractTag(raw, 'summary'))
    const content     = stripHtml(extractTag(raw, 'content:encoded') || extractTag(raw, 'content'))
    const pubDate     = extractTag(raw, 'pubDate')
      || extractTag(raw, 'published')
      || extractTag(raw, 'dc:date')
      || extractTag(raw, 'updated')
    const imageUrl    = extractImageUrl(raw)

    if (title && link) {
      items.push({ title, link, description, content, pubDate, imageUrl })
    }
  }

  return items
}

// ─── RSS feed fetcher ─────────────────────────────────────────────────────────

async function fetchRssFeed(url: string, source: string): Promise<RawArticle[]> {
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

    return items.map(item => ({
      headline:    item.title,
      content:     item.content.length > 200 ? item.content : item.description,
      sourceUrl:   item.link,
      source,
      imageUrl:    item.imageUrl,
      publishedAt: parseDate(item.pubDate),
    }))
  } catch (err) {
    console.warn(`[news-scraper] ${source}: RSS fetch failed:`, err instanceof Error ? err.message : err)
    return []
  }
}

// ─── HTML listing-page scraper ────────────────────────────────────────────────

/** Resolve a href against a base URL; returns null for non-http/fragment links */
function resolveUrl(href: string, base: URL): string | null {
  if (!href) return null
  const trimmed = href.trim()
  if (trimmed.startsWith('#') || trimmed.startsWith('javascript:') || trimmed.startsWith('mailto:')) return null
  try {
    return new URL(trimmed, base).toString()
  } catch {
    return null
  }
}

/**
 * Returns true if the URL looks like a news article on the same host:
 * - Same hostname
 * - Path has ≥ 2 segments (not a root category page)
 * - Doesn't look like a nav/tag/author/utility page
 */
function isArticleUrl(url: string, base: URL): boolean {
  try {
    const u = new URL(url)
    if (u.hostname !== base.hostname) return false
    const segments = u.pathname.split('/').filter(Boolean)
    if (segments.length < 2) return false
    const blocked = ['/tag/', '/tags/', '/category/', '/author/', '/search/',
      '/rss/', '/feed/', '/about', '/contact', '/privacy', '/terms',
      '/login', '/register', '/subscribe', '/profile', '/user/',
      '/page/', '/amp/', '/sitemap']
    if (blocked.some(b => u.pathname.includes(b))) return false
    return true
  } catch {
    return false
  }
}

/**
 * Extract a date from text near an article link.
 * Handles ISO 8601 datetime attributes and IST-formatted strings.
 */
function parseDateFromContext(ctx: string): Date | null {
  // <time datetime="...">
  const dtAttr = ctx.match(/datetime=["']([^"']+)["']/i)
  if (dtAttr?.[1]) {
    const d = parseDate(dtAttr[1])
    if (d) return d
  }
  // ISO-ish strings: 2024-03-22T10:30:00
  const iso = ctx.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)
  if (iso) {
    const d = parseDate(iso[0])
    if (d) return d
  }
  return null
}

/**
 * Scrape a news listing page (HTML) and return RawArticle[].
 * Uses three fallback strategies:
 *  1. <article> block extraction
 *  2. Heading+link (<h2>/<h3> with <a href>)
 *  3. Any <a> whose text is headline-length and href is an article URL
 */
async function scrapeHtmlListPage(url: string, source: string): Promise<RawArticle[]> {
  let html: string
  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(15_000),
      headers: {
        'User-Agent':          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept':              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language':     'en-US,en;q=0.9',
        'Accept-Encoding':     'identity',
        'Cache-Control':       'no-cache',
        'Upgrade-Insecure-Requests': '1',
      },
    })

    if (!res.ok) {
      console.warn(`[news-scraper] ${source}: HTTP ${res.status} for ${url} (HTML scraping)`)
      return []
    }

    const text = await res.text()
    // Bail out on known block pages (Akamai, Cloudflare)
    if (text.length < 2000 || /<title>Access Denied/i.test(text) || /<title>.*?Error/i.test(text)) {
      console.warn(`[news-scraper] ${source}: blocked or empty page at ${url}`)
      return []
    }
    html = text
  } catch (err) {
    console.warn(`[news-scraper] ${source}: HTML fetch failed:`, err instanceof Error ? err.message : err)
    return []
  }

  const base    = new URL(url)
  const articles: RawArticle[] = []
  const seen    = new Set<string>()

  function addArticle(href: string, title: string, context: string, imageUrl: string | null = null) {
    const resolved = resolveUrl(href, base)
    if (!resolved || !isArticleUrl(resolved, base)) return
    const cleanedUrl = cleanUrl(resolved)
    if (seen.has(cleanedUrl)) return
    const headline = stripHtml(title).trim()
    if (headline.length < 20 || headline.length > 400) return
    seen.add(cleanedUrl)
    articles.push({
      headline,
      content:     headline,   // enriched later via fetchArticleContent
      sourceUrl:   cleanedUrl,
      source,
      imageUrl,
      publishedAt: parseDateFromContext(context),
    })
  }

  // ── Strategy 1: <article> blocks ────────────────────────────────────────────
  const articleRe = /<article[^>]*>([\s\S]*?)<\/article>/gi
  let m: RegExpExecArray | null
  while ((m = articleRe.exec(html)) !== null) {
    const block = m[1]
    // Find first link with heading-like text inside the block
    const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    let lm: RegExpExecArray | null
    while ((lm = linkRe.exec(block)) !== null) {
      const text = stripHtml(lm[2]).trim()
      if (text.length >= 20 && text.length <= 400) {
        // Check for image
        const imgM = block.match(/<img[^>]+src=["']([^"']+)["']/i)
        addArticle(lm[1], text, block, imgM?.[1] ?? null)
        break  // one article per <article> block
      }
    }
  }

  // ── Strategy 2: <h2>/<h3>/<h4> containing <a href> ──────────────────────────
  if (articles.length < 5) {
    const headRe = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi
    while ((m = headRe.exec(html)) !== null) {
      const inner = m[1]
      const linkM = inner.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
      if (!linkM) continue
      // Grab ~200 chars of surrounding HTML for date context
      const ctx = html.slice(Math.max(0, m.index - 200), m.index + m[0].length + 200)
      addArticle(linkM[1], linkM[2], ctx)
    }
  }

  // ── Strategy 3: any <a> with headline-length text + article-like href ────────
  if (articles.length < 5) {
    const allLinkRe = /<a[^>]+href=["']([^"'#][^"']*?)["'][^>]*>([\s\S]*?)<\/a>/gi
    while ((m = allLinkRe.exec(html)) !== null) {
      const text = stripHtml(m[2]).trim()
      if (text.length >= 25 && text.length <= 300) {
        const ctx = html.slice(Math.max(0, m.index - 100), m.index + m[0].length + 100)
        addArticle(m[1], text, ctx)
      }
    }
  }

  console.log(`[news-scraper] ${source}: scraped ${articles.length} articles from HTML`)
  return articles
}

// ─── Article content enricher ─────────────────────────────────────────────────

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

    const contentPatterns = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]+class="[^"]*(?:article-body|story-body|entry-content|article-content|post-content|articleBody|article_body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]+id="[^"]*(?:article-body|story-content|content-body)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
    ]

    for (const re of contentPatterns) {
      const match = html.match(re)
      if (match?.[1]) {
        const text = stripHtml(match[1])
        if (text.length > 200) return text.slice(0, 3000)
      }
    }

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

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ScrapeOptions {
  maxPerSource?:    number   // default 25
  fetchFullContent?: boolean // default true
  minScore?:        number   // default 2
}

export async function scrapeNewsFeeds(opts: ScrapeOptions = {}): Promise<RawArticle[]> {
  const {
    maxPerSource    = 25,
    fetchFullContent = true,
    minScore        = 2,
  } = opts

  // Fetch all sources concurrently
  const settled = await Promise.allSettled(
    FEED_SOURCES.map(src =>
      src.type === 'rss'
        ? fetchRssFeed(src.url, src.source)
        : scrapeHtmlListPage(src.url, src.source)
    )
  )

  // Merge results, capped per source, deduped by URL, finance-filtered
  const seen = new Set<string>()
  const all:  RawArticle[] = []

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i]
    if (r.status !== 'fulfilled' || r.value.length === 0) continue

    let count = 0
    for (const a of r.value) {
      if (!a.sourceUrl || seen.has(a.sourceUrl)) continue
      seen.add(a.sourceUrl)
      if (!isFinanceRelevant(a.headline, a.content)) continue
      if (financeScore(a.headline, a.content) < minScore) continue
      all.push(a)
      if (++count >= maxPerSource) break
    }
  }

  // Optionally enrich thin articles with full body text (max 10 at once)
  if (fetchFullContent) {
    const thin  = all.filter(a => a.content.length < 300)
    const CHUNK = 10
    for (let i = 0; i < thin.length; i += CHUNK) {
      const chunk   = thin.slice(i, i + CHUNK)
      const enriched = await Promise.allSettled(chunk.map(a => fetchArticleContent(a.sourceUrl)))
      for (let j = 0; j < chunk.length; j++) {
        const r = enriched[j]
        if (r.status === 'fulfilled' && r.value.length > chunk[j].content.length) {
          chunk[j].content = r.value
        }
      }
    }
  }

  // Sort newest first
  all.sort((a, b) => {
    if (!a.publishedAt && !b.publishedAt) return 0
    if (!a.publishedAt) return 1
    if (!b.publishedAt) return -1
    return b.publishedAt.getTime() - a.publishedAt.getTime()
  })

  return all
}
