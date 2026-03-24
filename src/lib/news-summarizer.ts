/**
 * news-summarizer.ts
 *
 * Claude-powered summarization pipeline for financial news articles.
 * Produces structured, analyst-quality summaries in the style of
 * equity research notes — not shallow 60-word blurbs.
 *
 * Requires: ANTHROPIC_API_KEY environment variable
 */

import type { RawArticle } from './news-scraper'

// ─── Types ────────────────────────────────────────────────────────────────────

export type NewsCategory = 'Markets' | 'Companies' | 'Economy' | 'Policy'

export interface SummarizedArticle {
  headline:        string          // Cleaned, professional headline
  summary:         string          // 120-250 word structured summary
  category:        NewsCategory
  key_points:      string[]        // 3-5 bullet points
  why_it_matters:  string          // Single-sentence key implication
  importance_score: number         // 0–10
  is_market_moving: boolean
  is_finance_relevant: boolean
}

// ─── Anthropic API ────────────────────────────────────────────────────────────

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const MODEL         = 'claude-haiku-4-5-20251001'  // Fast + cost-efficient for bulk summarization

interface AnthropicMessage {
  role:    'user' | 'assistant'
  content: string
}

async function callClaude(
  system:   string,
  messages: AnthropicMessage[],
  maxTokens = 1024,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[news-summarizer] ANTHROPIC_API_KEY not set')
    return null
  }

  try {
    const res = await fetch(ANTHROPIC_API, {
      method:  'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: maxTokens,
        system,
        messages,
      }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[news-summarizer] Claude API ${res.status}: ${body.slice(0, 200)}`)
      return null
    }

    const data = await res.json() as {
      content?: Array<{ type: string; text: string }>
    }
    return data.content?.[0]?.text ?? null
  } catch (err) {
    console.error('[news-summarizer] Claude API error:', err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Prompt engineering ───────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a senior equity research analyst at a top-tier Indian investment bank. Your job is to produce structured, high-quality financial news summaries for institutional investors.

Your summaries must:
- Replace the need to click through to the source
- Provide full context (what happened, why it matters, implications)
- Be written like an equity research note: crisp, structured, insightful
- Avoid fluff, hype, and unnecessary adjectives
- Use precise financial terminology

RESPONSE FORMAT — return ONLY valid JSON, no markdown fences:
{
  "headline": "Clean, professional headline without clickbait (max 100 chars)",
  "summary": "120-250 word structured summary using these exact section headers:\\n\\n**WHAT HAPPENED**\\n[2-3 sentences of pure facts]\\n\\n**CONTEXT**\\n[2-3 sentences of background: why now, what preceded this]\\n\\n**WHY IT MATTERS**\\n[2-3 sentences: market implications, sector impact, investor angle]\\n\\n**KEY NUMBERS**\\n[Bullet list of specific figures, percentages, valuations. Use em-dashes. Omit if no numbers in article.]",
  "category": "Markets|Companies|Economy|Policy",
  "key_points": ["Point 1 (one specific fact or implication)", "Point 2", "Point 3"],
  "why_it_matters": "Single sentence: the #1 most important takeaway for an equity investor",
  "importance_score": 0.0,
  "is_market_moving": false,
  "is_finance_relevant": true
}

SCORING RULES:
- importance_score 8–10: Major market-moving events (RBI rate change, Nifty circuit breaker, large-cap earnings miss/beat >10%, systemic risk, major policy shift)
- importance_score 5–7: Significant but expected corporate news, sector-wide trends, mid-cap developments
- importance_score 1–4: Routine filings, minor updates, small company news
- is_market_moving: true ONLY if this could move the Nifty 50 by 0.5%+ OR a stock by 2%+
- is_finance_relevant: false if article is about entertainment, sport, lifestyle, or unrelated to finance/markets
- category: "Markets" for index/equity/forex/commodity price movements; "Companies" for corporate events; "Economy" for macro data (GDP, CPI, trade); "Policy" for RBI/SEBI/government regulations`

// ─── Main summarizer ──────────────────────────────────────────────────────────

/**
 * Summarize a single raw article using Claude.
 * Returns null if the article is not finance-relevant or on API failure.
 */
export async function summarizeArticle(article: RawArticle): Promise<SummarizedArticle | null> {
  const userContent = `Article Headline: ${article.headline}

Article Content:
${article.content.slice(0, 4000)}

Source: ${article.source}
URL: ${article.sourceUrl}`

  const raw = await callClaude(
    SYSTEM_PROMPT,
    [{ role: 'user', content: userContent }],
    1200,
  )

  if (!raw) return null

  try {
    // Strip any accidental markdown code fences Claude might add
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    const parsed = JSON.parse(cleaned) as SummarizedArticle

    // Validate required fields
    if (!parsed.headline || !parsed.summary || !parsed.category) {
      console.warn('[news-summarizer] Incomplete response for:', article.headline)
      return null
    }

    // Reject non-finance articles
    if (parsed.is_finance_relevant === false) return null

    // Clamp score to valid range
    parsed.importance_score = Math.min(10, Math.max(0, Number(parsed.importance_score) || 5))

    // Ensure arrays
    if (!Array.isArray(parsed.key_points)) parsed.key_points = []

    return parsed
  } catch (err) {
    console.error('[news-summarizer] JSON parse error for:', article.headline, '\nRaw:', raw?.slice(0, 300))
    console.error(err instanceof Error ? err.message : err)
    return null
  }
}

// ─── Batch processor with concurrency control ─────────────────────────────────

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
    const chunk  = articles.slice(i, i + concurrency)
    const settled = await Promise.allSettled(
      chunk.map(a => summarizeArticle(a))
    )
    for (let j = 0; j < chunk.length; j++) {
      const r = settled[j]
      if (r.status === 'fulfilled' && r.value) {
        results.push({ raw: chunk[j], summary: r.value })
      }
    }
    // Small pause between batches to respect rate limits
    if (i + concurrency < articles.length) {
      await new Promise(r => setTimeout(r, 500))
    }
  }

  return results
}
