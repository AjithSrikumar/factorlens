/**
 * news-summarizer.ts
 *
 * Rule-based extractive summarization pipeline for financial news articles.
 * Produces structured summaries without requiring any external AI API.
 *
 * Strategy:
 *  1. Sentence scoring via TF-IDF-like keyword frequency + position weighting
 *  2. Category detection via keyword sets
 *  3. Importance scoring via high-signal financial keyword presence
 *  4. Key number extraction via regex
 *  5. Finance relevance filtering
 */

import type { RawArticle } from './news-scraper'

// ─── Types ────────────────────────────────────────────────────────────────────

export type NewsCategory = 'Markets' | 'Companies' | 'Economy' | 'Policy'

export interface SummarizedArticle {
  headline:         string
  summary:          string
  category:         NewsCategory
  key_points:       string[]
  why_it_matters:   string
  importance_score: number
  is_market_moving: boolean
  is_finance_relevant: boolean
}

// ─── Keyword Dictionaries ─────────────────────────────────────────────────────

const FINANCE_KEYWORDS = new Set([
  'nifty', 'sensex', 'bse', 'nse', 'sebi', 'rbi', 'market', 'stock', 'share',
  'equity', 'fund', 'mutual', 'etf', 'ipo', 'fii', 'dii', 'profit', 'revenue',
  'earnings', 'quarter', 'result', 'dividend', 'buyback', 'merger', 'acquisition',
  'gdp', 'inflation', 'repo', 'rate', 'fiscal', 'budget', 'tax', 'bond', 'yield',
  'rupee', 'inr', 'dollar', 'crude', 'oil', 'gold', 'silver', 'commodity',
  'interest', 'banking', 'nbfc', 'insurance', 'fintech', 'economy', 'export',
  'import', 'trade', 'deficit', 'surplus', 'debt', 'credit', 'loan', 'npa',
  'capital', 'investment', 'investor', 'portfolio', 'rally', 'selloff', 'bull',
  'bear', 'volatility', 'index', 'indices', 'benchmark', 'listing', 'valuation',
  'pe ratio', 'eps', 'ebitda', 'cagr', 'return', 'yield', 'mcap', 'cap',
  'smallcap', 'midcap', 'largecap', 'sector', 'pharma', 'it sector', 'bank',
])

const NON_FINANCE_KEYWORDS = new Set([
  'cricket', 'football', 'bollywood', 'movie', 'actor', 'actress', 'celebrity',
  'recipe', 'fashion', 'beauty', 'travel', 'fitness', 'yoga', 'astrology',
  'horoscope',
  // Removed 'ipl', 'match', 'tournament', 'game' — IPL franchise valuations/sales
  // are genuine financial news and these words appear in finance contexts too
])

const CATEGORY_KEYWORDS: Record<NewsCategory, string[]> = {
  Markets: [
    'nifty', 'sensex', 'bse', 'nse', 'index', 'rally', 'selloff', 'bull', 'bear',
    'equity', 'stock price', 'share price', 'fii', 'dii', 'futures', 'options',
    'derivative', 'commodity', 'crude', 'gold', 'silver', 'rupee', 'forex',
  ],
  Companies: [
    'profit', 'revenue', 'earnings', 'quarterly', 'result', 'dividend', 'buyback',
    'merger', 'acquisition', 'ipo', 'listing', 'company', 'firm', 'ltd', 'limited',
    'corporate', 'ceo', 'md', 'board', 'management', 'eps', 'ebitda', 'guidance',
  ],
  Economy: [
    'gdp', 'inflation', 'cpi', 'wpi', 'iip', 'trade deficit', 'current account',
    'fiscal deficit', 'export', 'import', 'growth', 'recession', 'unemployment',
    'manufacturing', 'pmi', 'core sector', 'output', 'consumption',
  ],
  Policy: [
    'rbi', 'sebi', 'repo rate', 'reverse repo', 'monetary policy', 'budget',
    'government', 'finance ministry', 'regulation', 'circular', 'guideline',
    'tax', 'gst', 'amendment', 'parliament', 'nirmala', 'shaktikanta',
  ],
}

// High-signal words that indicate market-moving importance
const HIGH_IMPORTANCE_SIGNALS = [
  'rate cut', 'rate hike', 'repo rate', 'rbi', 'sebi ban', 'circuit breaker',
  'quarterly result', 'earnings beat', 'earnings miss', 'profit slump', 'profit surge',
  'insolvency', 'fraud', 'default', 'npa', 'merger', 'acquisition', 'ipo',
  'fdi', 'budget', 'gst', 'policy change', 'market crash', 'market rally',
  'all-time high', 'all time high', '52-week high', '52-week low', 'record high',
  'record low', 'billion', 'trillion', 'lakh crore', '% jump', '% fall',
  '% surge', '% plunge', '% rise', '% drop',
]

// ─── Utility Helpers ──────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}

function sentences(text: string): string[] {
  // Split on sentence-ending punctuation, keeping at least 20 chars
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20)
}

/**
 * Compute word frequency map (normalized).
 */
function wordFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>()
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  const max = Math.max(...freq.values(), 1)
  for (const [k, v] of freq) freq.set(k, v / max)
  return freq
}

/**
 * Score a sentence based on word frequency + position + finance keyword presence.
 */
function scoreSentence(
  sent: string,
  freq: Map<string, number>,
  index: number,
  total: number,
): number {
  const tokens = tokenize(sent)
  if (tokens.length < 4) return 0

  let score = 0

  // Frequency score
  for (const t of tokens) score += freq.get(t) ?? 0

  // Normalize by length to prefer concise sentences
  score /= Math.sqrt(tokens.length)

  // Finance keyword bonus
  for (const t of tokens) {
    if (FINANCE_KEYWORDS.has(t)) score += 0.3
  }

  // Position bonus: first 20% of sentences are most important
  const positionRatio = index / Math.max(total - 1, 1)
  if (positionRatio <= 0.2) score *= 1.5
  else if (positionRatio <= 0.4) score *= 1.2

  return score
}

/**
 * Extract top N sentences by score.
 */
function extractTopSentences(text: string, n: number): string[] {
  const sents = sentences(text)
  if (sents.length === 0) return []
  const tokens = tokenize(text)
  const freq = wordFrequency(tokens)

  const scored = sents.map((s, i) => ({
    text: s,
    score: scoreSentence(s, freq, i, sents.length),
    originalIndex: i,
  }))

  // Sort by score descending, pick top N, then re-sort by original position
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .sort((a, b) => a.originalIndex - b.originalIndex)
    .map(s => s.text)
}

/**
 * Extract numbers and percentages from text.
 */
function extractNumbers(text: string): string[] {
  const patterns = [
    /(?:Rs\.?|INR|₹)\s*[\d,]+(?:\.\d+)?(?:\s*(?:crore|lakh|billion|million|thousand))?/gi,
    /[\d,]+(?:\.\d+)?%/g,
    /\d+(?:\.\d+)?(?:\s*(?:crore|lakh|billion|million))/gi,
    /(?:up|down|rose|fell|gained|lost|surged|plunged)\s+[\d.]+%?/gi,
    /\$[\d,]+(?:\.\d+)?(?:\s*(?:billion|million))?/gi,
  ]
  const found: string[] = []
  for (const pat of patterns) {
    const matches = text.match(pat) ?? []
    found.push(...matches.map(m => m.trim()))
  }
  // Deduplicate
  return [...new Set(found)].slice(0, 6)
}

// ─── Categorizer ──────────────────────────────────────────────────────────────

function detectCategory(text: string): NewsCategory {
  const lower = text.toLowerCase()
  const scores: Record<NewsCategory, number> = {
    Markets: 0, Companies: 0, Economy: 0, Policy: 0,
  }
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as [NewsCategory, string[]][]) {
    for (const kw of keywords) {
      if (lower.includes(kw)) scores[cat]++
    }
  }
  const best = (Object.entries(scores) as [NewsCategory, number][])
    .sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 ? best[0] : 'Markets'
}

// ─── Importance Scorer ────────────────────────────────────────────────────────

function scoreImportance(text: string, headline: string): number {
  const combined = (headline + ' ' + text).toLowerCase()
  let score = 3  // baseline

  let signalCount = 0
  for (const signal of HIGH_IMPORTANCE_SIGNALS) {
    if (combined.includes(signal)) signalCount++
  }
  score += Math.min(signalCount * 1.5, 5)

  // Numbers / figures add credibility
  const numbers = extractNumbers(combined)
  if (numbers.length >= 3) score += 0.5
  if (numbers.length >= 5) score += 0.5

  // RBI/SEBI/Government news tends to be high-importance
  if (/\brbi\b|\bsebi\b|\bfinance minister\b|\bbudget\b/.test(combined)) score += 1

  return Math.min(10, Math.max(1, Math.round(score * 10) / 10))
}

function isMarketMoving(text: string, headline: string, importanceScore: number): boolean {
  if (importanceScore >= 7.5) return true
  const combined = (headline + ' ' + text).toLowerCase()
  const strongSignals = [
    'repo rate', 'rate cut', 'rate hike', 'circuit breaker', 'rbi policy',
    'all-time high', 'record high', 'record low', 'market crash', 'market halt',
    'quarterly result', 'earnings miss', 'earnings beat',
  ]
  return strongSignals.some(s => combined.includes(s))
}

function isFinanceRelevant(text: string, headline: string): boolean {
  const combined = (headline + ' ' + text).toLowerCase()
  const tokens = tokenize(combined)

  // Check for non-finance keywords first
  const nonFinanceCount = tokens.filter(t => NON_FINANCE_KEYWORDS.has(t)).length
  if (nonFinanceCount > 3) return false

  // Must have at least 2 finance keywords
  const financeCount = tokens.filter(t => FINANCE_KEYWORDS.has(t)).length
  return financeCount >= 2
}

// ─── Key Points Generator ─────────────────────────────────────────────────────

function buildKeyPoints(
  article: RawArticle,
  topSentences: string[],
  numbers: string[],
): string[] {
  const points: string[] = []

  // First top sentence as first point
  if (topSentences[0]) points.push(topSentences[0].replace(/\s+/g, ' ').trim())

  // Add a numbers bullet if found
  if (numbers.length > 0) {
    points.push(`Key figures: ${numbers.slice(0, 3).join('; ')}`)
  }

  // Second top sentence
  if (topSentences[1] && topSentences[1] !== topSentences[0]) {
    points.push(topSentences[1].replace(/\s+/g, ' ').trim())
  }

  // Source attribution
  points.push(`Source: ${article.source}`)

  return points.slice(0, 5).filter(p => p.length > 10)
}

// ─── Summary Builder ──────────────────────────────────────────────────────────

function buildSummary(
  headline: string,
  topSentences: string[],
  numbers: string[],
  category: NewsCategory,
): string {
  const what = topSentences.slice(0, 2).join(' ')
  const context = topSentences.slice(2, 4).join(' ')
  const implications = topSentences.slice(4, 6).join(' ')

  let summary = `**WHAT HAPPENED**\n${what || headline}`

  if (context) {
    summary += `\n\n**CONTEXT**\n${context}`
  }

  if (implications) {
    summary += `\n\n**WHY IT MATTERS**\n${implications}`
  }

  if (numbers.length > 0) {
    summary += `\n\n**KEY NUMBERS**\n${numbers.map(n => `— ${n}`).join('\n')}`
  }

  return summary.trim()
}

// ─── Main Summarizer ──────────────────────────────────────────────────────────

/**
 * Summarize a single raw article using rule-based extraction.
 * Returns null if the article is not finance-relevant.
 */
export async function summarizeArticle(article: RawArticle): Promise<SummarizedArticle | null> {
  const text = article.content.slice(0, 4000)
  const headline = article.headline

  // Finance relevance gate
  if (!isFinanceRelevant(text, headline)) return null

  const topSentences = extractTopSentences(text, 8)
  const numbers = extractNumbers(text)
  const category = detectCategory(text + ' ' + headline)
  const importanceScore = scoreImportance(text, headline)
  const marketMoving = isMarketMoving(text, headline, importanceScore)

  const summary = buildSummary(headline, topSentences, numbers, category)
  const keyPoints = buildKeyPoints(article, topSentences.slice(0, 3), numbers)
  const whyItMatters = topSentences[0]
    ?? headline

  // Validate minimum usable output
  if (!summary || keyPoints.length === 0) return null

  return {
    headline:         headline.slice(0, 200),
    summary,
    category,
    key_points:       keyPoints,
    why_it_matters:   whyItMatters.slice(0, 300),
    importance_score: importanceScore,
    is_market_moving: marketMoving,
    is_finance_relevant: true,
  }
}

// ─── Batch Processor ──────────────────────────────────────────────────────────

/**
 * Summarize a batch of articles with bounded concurrency.
 * Returns only successfully summarized articles.
 */
export async function summarizeBatch(
  articles:    RawArticle[],
  concurrency = 5,
): Promise<Array<{ raw: RawArticle; summary: SummarizedArticle }>> {
  const results: Array<{ raw: RawArticle; summary: SummarizedArticle }> = []

  for (let i = 0; i < articles.length; i += concurrency) {
    const chunk   = articles.slice(i, i + concurrency)
    const settled = await Promise.allSettled(chunk.map(a => summarizeArticle(a)))

    for (let j = 0; j < chunk.length; j++) {
      const r = settled[j]
      if (r.status === 'fulfilled' && r.value) {
        results.push({ raw: chunk[j], summary: r.value })
      }
    }
  }

  return results
}
