"use client"

import { useState } from "react"
import { ExternalLink, Bookmark, BookmarkCheck, Clock, Zap } from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NewsArticle {
  id:               string
  headline:         string
  summary:          string | null
  source:           string
  source_url:       string
  image_url:        string | null
  category:         'Markets' | 'Companies' | 'Economy' | 'Policy'
  published_at:     string | null
  importance_score: number
  key_points:       string[]
  why_it_matters:   string | null
  is_market_moving: boolean
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORY_CONFIG = {
  Markets:   { bg: '#1A56DB', label: 'Markets',   gradientA: '#1A56DB', gradientB: '#0EA5E9' },
  Companies: { bg: '#7C3AED', label: 'Companies', gradientA: '#7C3AED', gradientB: '#4F46E5' },
  Economy:   { bg: '#059669', label: 'Economy',   gradientA: '#059669', gradientB: '#0D9488' },
  Policy:    { bg: '#EA580C', label: 'Policy',    gradientA: '#EA580C', gradientB: '#DC2626' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    const d    = new Date(iso)
    const now  = new Date()
    const diff = Math.floor((now.getTime() - d.getTime()) / 60_000)  // minutes
    if (diff < 1)   return 'Just now'
    if (diff < 60)  return `${diff}m ago`
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`
    return `${Math.floor(diff / 1440)}d ago`
  } catch { return '' }
}

/**
 * Parse the AI-generated summary into named sections.
 * Summary format uses bold **SECTION HEADER** markers.
 */
function parseSummary(raw: string): { what: string; context: string; why: string; numbers: string[] } {
  const result = { what: '', context: '', why: '', numbers: [] as string[] }
  if (!raw) return result

  const sections: Record<string, string> = {}
  const parts = raw.split(/\*\*([A-Z ]+)\*\*/g)
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i].trim()
    const val = (parts[i + 1] ?? '').trim()
    sections[key] = val
  }

  result.what    = sections['WHAT HAPPENED'] ?? ''
  result.context = sections['CONTEXT'] ?? ''
  result.why     = sections['WHY IT MATTERS'] ?? ''

  const numbersRaw = sections['KEY NUMBERS'] ?? ''
  if (numbersRaw) {
    result.numbers = numbersRaw
      .split(/[\n•\-–—]/)
      .map(s => s.trim())
      .filter(s => s.length > 5)
      .slice(0, 5)
  }

  // If no section markers found, use the raw text as "what"
  if (!result.what && !result.context && !result.why) {
    result.what = raw
  }

  return result
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, letterSpacing: '1.2px',
      textTransform: 'uppercase' as const, color: 'rgba(12,14,19,.3)',
      marginBottom: 5, marginTop: 16,
    }}>
      {children}
    </div>
  )
}

// ─── Main card ────────────────────────────────────────────────────────────────

interface NewsCardProps {
  article:   NewsArticle
  index:     number    // card position (for reading progress)
  total:     number
}

export function NewsCard({ article, index, total }: NewsCardProps) {
  const [bookmarked, setBookmarked] = useState(false)

  const cfg      = CATEGORY_CONFIG[article.category] ?? CATEGORY_CONFIG.Markets
  const timeAgo  = formatTime(article.published_at)
  const sections = parseSummary(article.summary ?? '')
  const score    = article.importance_score ?? 5

  // Category gradient background for hero when no image
  const heroGradient = `linear-gradient(135deg, ${cfg.gradientA}18 0%, ${cfg.gradientB}28 100%)`

  // Importance ring color
  const importanceColor = score >= 8 ? '#DC2626' : score >= 6 ? '#EA580C' : score >= 4 ? '#1A56DB' : 'rgba(12,14,19,.2)'

  return (
    <article style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column' as const,
      background: '#FAFAFA',
      position: 'relative' as const,
      overflowY: 'auto' as const,
      WebkitOverflowScrolling: 'touch' as unknown as undefined,
    }}>
      {/* ── Hero: image or gradient ── */}
      <div style={{
        position: 'relative' as const,
        height: 200,
        flexShrink: 0,
        background: article.image_url ? '#0C0E13' : heroGradient,
        overflow: 'hidden',
      }}>
        {article.image_url ? (
          <img
            src={article.image_url}
            alt=""
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover',
              opacity: 0.88,
            }}
            loading="lazy"
            onError={(e) => {
              const target = e.currentTarget
              target.style.display = 'none'
              target.parentElement!.style.background = heroGradient
            }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              fontSize: 48, opacity: 0.15,
              fontFamily: 'var(--font-serif, Georgia, serif)',
              color: cfg.bg, fontWeight: 700,
            }}>
              {cfg.label[0]}
            </div>
          </div>
        )}

        {/* Category badge overlay */}
        <div style={{
          position: 'absolute', top: 14, left: 14,
          display: 'flex', gap: 7, alignItems: 'center',
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '4px 10px', borderRadius: 100,
            background: cfg.bg, color: '#fff',
            fontSize: 10, fontWeight: 800, letterSpacing: '.8px',
            textTransform: 'uppercase' as const,
            boxShadow: `0 2px 8px ${cfg.bg}60`,
          }}>
            {article.category}
          </span>
          {article.is_market_moving && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 100,
              background: '#DC2626', color: '#fff',
              fontSize: 10, fontWeight: 800, letterSpacing: '.8px',
              textTransform: 'uppercase' as const,
              boxShadow: '0 2px 8px rgba(220,38,38,.5)',
              animation: 'pulse 2s infinite',
            }}>
              <Zap style={{ width: 9, height: 9 }} />
              Market Moving
            </span>
          )}
        </div>

        {/* Progress indicator */}
        <div style={{
          position: 'absolute', top: 14, right: 14,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          {/* Importance ring */}
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(0,0,0,.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${importanceColor}`,
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800,
              color: importanceColor,
            }}>
              {score.toFixed(0)}
            </span>
          </div>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11, fontWeight: 600,
            color: 'rgba(255,255,255,.7)',
            background: 'rgba(0,0,0,.4)',
            padding: '3px 8px', borderRadius: 20,
          }}>
            {index + 1}/{total}
          </span>
        </div>

        {/* Fade to card bg */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 80,
          background: 'linear-gradient(to bottom, transparent, #FAFAFA)',
        }} />
      </div>

      {/* ── Card body ── */}
      <div style={{ padding: '4px 20px 24px', flex: 1 }}>

        {/* Source + time */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          marginBottom: 10,
        }}>
          <span style={{
            fontSize: 11, fontWeight: 700, color: cfg.bg,
            textTransform: 'uppercase' as const, letterSpacing: '.6px',
          }}>
            {article.source}
          </span>
          {timeAgo && (
            <>
              <span style={{ color: 'rgba(12,14,19,.2)', fontSize: 10 }}>·</span>
              <span style={{
                display: 'flex', alignItems: 'center', gap: 3,
                fontSize: 11, color: 'rgba(12,14,19,.4)',
              }}>
                <Clock style={{ width: 10, height: 10 }} />
                {timeAgo}
              </span>
            </>
          )}
        </div>

        {/* Headline */}
        <h2 style={{
          fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
          fontSize: 'clamp(20px, 4vw, 24px)',
          fontWeight: 400,
          lineHeight: 1.3,
          letterSpacing: '-.3px',
          color: '#0C0E13',
          margin: '0 0 14px',
        }}>
          {article.headline}
        </h2>

        {/* ── Summary sections ── */}
        {sections.what && (
          <>
            <SectionLabel>What Happened</SectionLabel>
            <p style={{ fontSize: 14.5, lineHeight: 1.65, color: 'rgba(12,14,19,.85)', margin: 0 }}>
              {sections.what}
            </p>
          </>
        )}

        {sections.context && (
          <>
            <SectionLabel>Context</SectionLabel>
            <p style={{ fontSize: 14, lineHeight: 1.65, color: 'rgba(12,14,19,.7)', margin: 0 }}>
              {sections.context}
            </p>
          </>
        )}

        {/* Why it matters — highlight box */}
        {(sections.why || article.why_it_matters) && (
          <div style={{
            margin: '16px 0 0',
            padding: '14px 16px',
            background: `${cfg.bg}0D`,
            borderLeft: `3px solid ${cfg.bg}`,
            borderRadius: '0 8px 8px 0',
          }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '1.2px',
              textTransform: 'uppercase' as const, color: cfg.bg,
              marginBottom: 5, opacity: 0.7,
            }}>
              Why it matters
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(12,14,19,.8)', margin: 0, fontWeight: 500 }}>
              {sections.why || article.why_it_matters}
            </p>
          </div>
        )}

        {/* Key numbers */}
        {sections.numbers.length > 0 && (
          <>
            <SectionLabel>Key Numbers</SectionLabel>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
              {sections.numbers.map((n, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontSize: 13.5, color: 'rgba(12,14,19,.75)',
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: cfg.bg, marginTop: 6, flexShrink: 0,
                  }} />
                  {n}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Key points */}
        {article.key_points?.length > 0 && sections.numbers.length === 0 && (
          <>
            <SectionLabel>Key Points</SectionLabel>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 5 }}>
              {article.key_points.slice(0, 4).map((pt, i) => (
                <li key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  fontSize: 13.5, color: 'rgba(12,14,19,.75)',
                }}>
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: cfg.bg, marginTop: 6, flexShrink: 0,
                  }} />
                  {pt}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* ── Footer actions ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginTop: 24, paddingTop: 16,
          borderTop: '1px solid rgba(12,14,19,.08)',
        }}>
          <a
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 9,
              background: '#0C0E13', color: '#fff',
              fontSize: 12, fontWeight: 600,
              textDecoration: 'none',
              transition: 'opacity .15s',
            }}
          >
            <ExternalLink style={{ width: 12, height: 12 }} />
            Full Story
          </a>

          <button
            onClick={() => setBookmarked(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 9,
              background: bookmarked ? `${cfg.bg}15` : 'transparent',
              border: `1.5px solid ${bookmarked ? cfg.bg : 'rgba(12,14,19,.12)'}`,
              color: bookmarked ? cfg.bg : 'rgba(12,14,19,.4)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'all .15s',
              fontFamily: 'inherit',
            }}
          >
            {bookmarked
              ? <BookmarkCheck style={{ width: 13, height: 13 }} />
              : <Bookmark style={{ width: 13, height: 13 }} />}
            {bookmarked ? 'Saved' : 'Save'}
          </button>
        </div>

        {/* Swipe hint (only on first card) */}
        {index === 0 && (
          <div style={{
            marginTop: 20, textAlign: 'center' as const,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            opacity: 0.35,
          }}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 16, height: 16 }}>
              <path d="M10 4v12M6 12l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 11, color: 'rgba(12,14,19,.6)' }}>Swipe or scroll for next story</span>
          </div>
        )}
      </div>
    </article>
  )
}
