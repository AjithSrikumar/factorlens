"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { NewsCard, NewsArticle } from "./news-card"
import { RefreshCw, Zap, TrendingUp, Building2, Globe, Landmark } from "lucide-react"

// ─── Category filter config ───────────────────────────────────────────────────

const CATEGORIES: Array<{
  key:   string
  label: string
  Icon:  React.FC<{ style?: React.CSSProperties }>
  color: string
}> = [
  { key: 'all',       label: 'All',       Icon: TrendingUp, color: '#1A56DB' },
  { key: 'Markets',   label: 'Markets',   Icon: TrendingUp, color: '#1A56DB' },
  { key: 'Companies', label: 'Companies', Icon: Building2,  color: '#7C3AED' },
  { key: 'Economy',   label: 'Economy',   Icon: Globe,      color: '#059669' },
  { key: 'Policy',    label: 'Policy',    Icon: Landmark,   color: '#EA580C' },
]

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div style={{
      height: '100%', background: 'var(--card)',
      display: 'flex', flexDirection: 'column' as const,
    }}>
      <div style={{ height: 200, background: 'rgba(255,255,255,.05)' }} />
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
        <div style={{ height: 12, width: '30%', background: 'rgba(255,255,255,.06)', borderRadius: 6 }} />
        <div style={{ height: 26, width: '90%', background: 'rgba(255,255,255,.08)', borderRadius: 6 }} />
        <div style={{ height: 22, width: '75%', background: 'rgba(255,255,255,.07)', borderRadius: 6 }} />
        <div style={{ height: 12, background: 'rgba(255,255,255,.05)', borderRadius: 6 }} />
        <div style={{ height: 12, background: 'rgba(255,255,255,.05)', borderRadius: 6 }} />
        <div style={{ height: 12, width: '60%', background: 'rgba(255,255,255,.05)', borderRadius: 6 }} />
        <div style={{ marginTop: 8, height: 70, background: 'rgba(255,255,255,.04)', borderRadius: 8 }} />
      </div>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column' as const, gap: 12, padding: '0 32px',
      textAlign: 'center' as const,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: 'rgba(79,128,255,.12)', border: '1px solid rgba(79,128,255,.20)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
      }}>
        <TrendingUp style={{ width: 24, height: 24, color: '#6B9FFF' }} />
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--foreground)' }}>No stories yet</div>
      <div style={{ fontSize: 13.5, color: 'var(--muted-foreground)', lineHeight: 1.5 }}>
        The news feed will populate once the scraper runs. Check back in a few minutes.
      </div>
      <button
        onClick={onRefresh}
        disabled={loading}
        style={{
          marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '10px 20px', borderRadius: 10,
          background: '#4F80FF', color: '#fff',
          fontSize: 13, fontWeight: 600, cursor: 'pointer',
          border: 'none', fontFamily: 'inherit',
          opacity: loading ? 0.5 : 1,
        }}
      >
        <RefreshCw style={{ width: 14, height: 14, animation: loading ? 'spin .8s linear infinite' : 'none' }} />
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  )
}

// ─── Last updated indicator ───────────────────────────────────────────────────

function LastUpdated({ ts }: { ts: Date | null }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!ts) return null

  const diff = Math.floor((Date.now() - ts.getTime()) / 60_000)
  const label = diff < 1 ? 'just now' : diff === 1 ? '1 min ago' : `${diff} min ago`

  return (
    <span style={{ fontSize: 11, color: 'var(--muted-foreground)', opacity: 0.6 }}>
      Updated {label}
    </span>
  )
}

// ─── Main feed ────────────────────────────────────────────────────────────────

interface NewsFeedProps {
  initialArticles: NewsArticle[]
}

export function NewsFeed({ initialArticles }: NewsFeedProps) {
  const [articles, setArticles]   = useState<NewsArticle[]>(initialArticles)
  const [category, setCategory]   = useState('all')
  const [loading, setLoading]     = useState(false)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(initialArticles.length > 0 ? new Date() : null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)

  // Active card index for keyboard nav
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef  = useRef<HTMLDivElement>(null)
  const autoRefreshId = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch news ────────────────────────────────────────────────────────────

  const fetchNews = useCallback(async (cat: string, cursor?: string) => {
    const params = new URLSearchParams({ limit: '15' })
    if (cat !== 'all') params.set('category', cat)
    if (cursor)         params.set('cursor', cursor)

    const res  = await fetch(`/api/news?${params}`)
    const data = await res.json() as { articles: NewsArticle[]; nextCursor: string | null }
    return data
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchNews(category)
      setArticles(data.articles)
      setNextCursor(data.nextCursor)
      setUpdatedAt(new Date())
      setActiveIdx(0)
      containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      console.error('[NewsFeed] refresh failed:', e)
    } finally {
      setLoading(false)
    }
  }, [category, fetchNews])

  // ── Load more (infinite scroll) ───────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const data = await fetchNews(category, nextCursor)
      setArticles(prev => [...prev, ...data.articles])
      setNextCursor(data.nextCursor)
    } catch (e) {
      console.error('[NewsFeed] loadMore failed:', e)
    } finally {
      setLoadingMore(false)
    }
  }, [nextCursor, loadingMore, category, fetchNews])

  // ── Category change ───────────────────────────────────────────────────────

  const changeCategory = useCallback(async (cat: string) => {
    setCategory(cat)
    setLoading(true)
    try {
      const data = await fetchNews(cat)
      setArticles(data.articles)
      setNextCursor(data.nextCursor)
      setActiveIdx(0)
      containerRef.current?.scrollTo({ top: 0, behavior: 'instant' })
    } catch (e) {
      console.error('[NewsFeed] category change failed:', e)
    } finally {
      setLoading(false)
    }
  }, [fetchNews])

  // ── Auto-refresh every 5 minutes ──────────────────────────────────────────

  useEffect(() => {
    autoRefreshId.current = setInterval(() => {
      refresh()
    }, 5 * 60 * 1000)
    return () => { if (autoRefreshId.current) clearInterval(autoRefreshId.current) }
  }, [refresh])

  // ── Keyboard navigation (desktop) ────────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (!containerRef.current) return
      const cardH = containerRef.current.clientHeight
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const next = Math.min(activeIdx + 1, articles.length - 1)
        setActiveIdx(next)
        containerRef.current.scrollTo({ top: next * cardH, behavior: 'smooth' })
        if (next >= articles.length - 3) loadMore()
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prev = Math.max(activeIdx - 1, 0)
        setActiveIdx(prev)
        containerRef.current.scrollTo({ top: prev * cardH, behavior: 'smooth' })
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeIdx, articles.length, loadMore])

  // ── Intersection observer for infinite scroll ─────────────────────────────

  const lastCardRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadMore() },
      { threshold: 0.3 }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadMore])

  // ── Update activeIdx on scroll ────────────────────────────────────────────

  function handleScroll() {
    if (!containerRef.current) return
    const { scrollTop, clientHeight } = containerRef.current
    const idx = Math.round(scrollTop / clientHeight)
    if (idx !== activeIdx) setActiveIdx(idx)
  }

  // ── Compute visible articles ──────────────────────────────────────────────

  const hasMarketMoving = articles.some(a => a.is_market_moving)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, height: '100%', background: 'var(--background)' }}>

      {/* ── Top bar: category filters + status ── */}
      <div style={{
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(8,11,20,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        padding: '10px 16px',
        display: 'flex', flexDirection: 'column' as const, gap: 10,
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              fontSize: 15, fontWeight: 800, letterSpacing: '-.3px', color: 'var(--foreground)',
            }}>
              Market Intelligence
            </div>
            {hasMarketMoving && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '2px 8px', borderRadius: 100,
                background: 'rgba(239,68,68,0.15)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#F87171',
                fontSize: 9, fontWeight: 800, letterSpacing: '.8px',
                textTransform: 'uppercase' as const,
                animation: 'pulse-badge 2s ease infinite',
              }}>
                <Zap style={{ width: 8, height: 8 }} />
                Breaking
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LastUpdated ts={updatedAt} />
            <button
              onClick={refresh}
              disabled={loading}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 8,
                background: 'rgba(255,255,255,.07)',
                border: '1px solid rgba(255,255,255,.10)',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
                transition: 'background .15s',
              }}
              title="Refresh news"
            >
              <RefreshCw style={{
                width: 13, height: 13,
                animation: loading ? 'spin .8s linear infinite' : 'none',
              }} />
            </button>
          </div>
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: 7, overflowX: 'auto' }} className="no-scrollbar">
          {CATEGORIES.map(cat => {
            const active = category === cat.key
            return (
              <button
                key={cat.key}
                onClick={() => changeCategory(cat.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 100,
                  background: active ? cat.color : 'rgba(255,255,255,.07)',
                  color:      active ? '#fff'    : 'rgba(148,163,184,0.7)',
                  border: active ? 'none' : '1px solid rgba(255,255,255,.10)',
                  fontSize: 11.5, fontWeight: 700, letterSpacing: '.2px',
                  cursor: 'pointer', whiteSpace: 'nowrap' as const,
                  transition: 'all .15s', flexShrink: 0,
                  fontFamily: 'inherit',
                  boxShadow: active ? `0 2px 10px ${cat.color}45` : 'none',
                }}
              >
                <cat.Icon style={{ width: 11, height: 11 }} />
                {cat.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Main scrollable feed ── */}
      {loading && articles.length === 0 ? (
        // Full-screen skeleton
        <div style={{ flex: 1 }}>
          <SkeletonCard />
        </div>
      ) : articles.length === 0 ? (
        <div style={{ flex: 1 }}>
          <EmptyState onRefresh={refresh} loading={loading} />
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          style={{
            flex: 1,
            overflowY: 'scroll',
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch' as unknown as undefined,
          }}
        >
          {articles.map((article, i) => (
            <div
              key={article.id}
              ref={i === articles.length - 1 ? lastCardRef : undefined}
              style={{
                // Use svh for accurate mobile viewport height
                height: 'calc(100svh - 52px - 72px - 105px)',  // viewport - mobile-top - mobile-bottom - filter-bar
                scrollSnapAlign: 'start',
                scrollSnapStop: 'always',
                position: 'relative' as const,
              }}
              className="news-card-snap md:news-card-snap-desktop"
            >
              <NewsCard article={article} index={i} total={articles.length} />
              {/* Bottom fade for scroll hint */}
              {i < articles.length - 1 && (
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0, height: 32,
                  background: 'linear-gradient(to bottom, transparent, rgba(245,245,243,.9))',
                  pointerEvents: 'none',
                }} />
              )}
            </div>
          ))}

          {/* Load more trigger / spinner */}
          {nextCursor && (
            <div style={{
              height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
              scrollSnapAlign: 'start',
            }}>
              {loadingMore && (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%',
                  border: '2.5px solid rgba(12,14,19,.1)',
                  borderTopColor: '#1A56DB',
                  animation: 'spin .75s linear infinite',
                }} />
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Article counter ── */}
      {articles.length > 0 && (
        <div style={{
          flexShrink: 0, padding: '6px 16px',
          borderTop: '1px solid rgba(12,14,19,.06)',
          background: 'rgba(245,245,243,.95)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ display: 'flex', gap: 4, flex: 1, alignItems: 'center' }}>
            {articles.slice(0, Math.min(articles.length, 20)).map((_, i) => (
              <div
                key={i}
                onClick={() => {
                  if (!containerRef.current) return
                  const h = containerRef.current.clientHeight
                  containerRef.current.scrollTo({ top: i * h, behavior: 'smooth' })
                  setActiveIdx(i)
                }}
                style={{
                  height: 3, borderRadius: 2,
                  flex: i === activeIdx ? '2' : '1',
                  background: i === activeIdx ? '#1A56DB' : 'rgba(12,14,19,.12)',
                  transition: 'all .25s',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
          <span style={{ fontSize: 10, color: 'rgba(12,14,19,.35)', flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
            {activeIdx + 1} / {articles.length}
          </span>
        </div>
      )}
    </div>
  )
}
