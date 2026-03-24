"use client"

import { useState, useEffect, useMemo } from "react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { NavChart, DrawdownChart, FiscalYearDetailCards } from "@/components/portfolio-charts"

interface Fund {
  id: number
  code: string
  name: string
  category: string
  inception_date: string
  cagr: number | null
  cagr_1y: number | null
  cagr_3y: number | null
  cagr_5y: number | null
  cagr_10y: number | null
  cagr_20y: number | null
  avg_3y_rolling_return: number | null
  max_drawdown: number | null
  volatility: number | null
  sharpe_ratio: number | null
  calmar_ratio: number | null
  score: number | null
  final_rank: number | null
}

interface FYRawRow {
  fy: string
  startDate: string
  startValue: number
  endDate: string
  endValue: number
  returnPct: number
  isLive: boolean
}

interface ChartData {
  portfolioNav: { date: string; value: number }[]
  drawdownSeries: { date: string; value: number }[]
  benchmarkNav?: { date: string; value: number }[]
  benchmarkDrawdown?: { date: string; value: number }[]
  fyTableData?: {
    portfolio: FYRawRow[]
    funds: Record<number, FYRawRow[]>
    benchmark: FYRawRow[]
  }
}

type SortKey = keyof Fund
type SortDir = "asc" | "desc"

const CAT_STYLE: Record<string, { bg: string; color: string }> = {
  "Broad Market":  { bg: "#EBF0FF", color: "#1A56DB" },
  "Momentum":      { bg: "#FFF3E6", color: "#B45309" },
  "Multi-Factor":  { bg: "#F3F0FF", color: "#6D28D9" },
  "Quality":       { bg: "#E6F4EE", color: "#0A7C4E" },
  "Low Vol":       { bg: "#E6F4EE", color: "#0A7C4E" },
  "Alpha":         { bg: "#FDE8F4", color: "#9D1769" },
  "Value":         { bg: "#FEF5E6", color: "#92400E" },
  "Thematic":      { bg: "#FEF2F2", color: "#B91C1C" },
  "Equal Weight":  { bg: "#F0FDF4", color: "#166534" },
  "High Beta":     { bg: "#FFF1F2", color: "#BE123C" },
  "Dividend":      { bg: "#FFFBEB", color: "#78350F" },
  "Volatility":    { bg: "#F0F9FF", color: "#0369A1" },
  "Fixed Income":  { bg: "#F5F3FF", color: "#5B21B6" },
  "Leverage":      { bg: "#FFF7ED", color: "#C2410C" },
  "Global/Other":  { bg: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.5)" },
}

function catStyle(cat: string) {
  return CAT_STYLE[cat] ?? { bg: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.5)" }
}

function pct(v: number | null) {
  if (v == null) return "—"
  return `${(v * 100).toFixed(2)}%`
}

function fixed(v: number | null, d = 2) {
  if (v == null) return "—"
  return v.toFixed(d)
}

/** Convert raw score (0–100, lower = better rank) to display score (0–10, higher = better) */
function displayScore(raw: number | null | undefined): string {
  if (raw == null) return "—"
  return ((100 - raw) / 10).toFixed(1)
}

function scoreBarWidth(raw: number | null | undefined): string {
  if (raw == null) return "0%"
  return `${Math.min(Math.max((100 - raw) / 10, 0), 10) * 10}%`
}

function toTitleCase(str: string) {
  return str.replace(/\b\w+\b/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

function RankBadge({ rank }: { rank: number | null }) {
  const style = rank === 1
    ? { background: "#FEF3C7", color: "#92400E" }
    : rank === 2
    ? { background: "#F1F5F9", color: "#475569" }
    : rank === 3
    ? { background: "#FFF7ED", color: "#C2410C" }
    : { background: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.5)" }

  return (
    <span style={{
      width: 28, height: 28, borderRadius: 8, display: "inline-flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
      ...style, flexShrink: 0,
    }}>
      {rank ?? "—"}
    </span>
  )
}

export default function RankingsPage() {
  const [funds, setFunds] = useState<Fund[]>([])
  const [lastNavDate, setLastNavDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [catFilter, setCatFilter] = useState("All")
  const [sortKey, setSortKey] = useState<SortKey>("final_rank")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [chartCache, setChartCache] = useState<Record<number, ChartData>>({})
  const [chartLoading, setChartLoading] = useState(false)
  const [unrankedExpanded, setUnrankedExpanded] = useState(false)
  const [fixedIncomeExpanded, setFixedIncomeExpanded] = useState(false)

  useEffect(() => {
    fetch("/api/funds")
      .then((r) => r.json())
      .then((d) => {
        // API returns { data: Fund[], lastNavDate: string | null }
        if (d && typeof d === "object" && "data" in d) {
          setFunds(Array.isArray(d.data) ? d.data : [])
          setLastNavDate(d.lastNavDate ?? null)
        } else if (Array.isArray(d)) {
          // Backwards-compat: old API returned bare array
          setFunds(d)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (expandedId === null) return
    if (chartCache[expandedId]) return
    setChartLoading(true)
    fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allocations: [{ fundId: expandedId, weight: 100 }] }),
    })
      .then((r) => r.json())
      .then((data) => {
        setChartCache((prev) => ({ ...prev, [expandedId]: data }))
        setChartLoading(false)
      })
      .catch(() => setChartLoading(false))
  }, [expandedId, chartCache])

  const nifty50 = useMemo(() => funds.find(f => f.code === 'N50'), [funds])

  // Separate fixed income from equity/other indices
  const fixedIncomeFunds = useMemo(() => funds.filter(f => f.category === "Fixed Income"), [funds])

  const categories = useMemo(() => {
    const nonFI = funds.filter(f => f.category !== "Fixed Income")
    return ["All", ...Array.from(new Set(nonFI.map((f) => f.category)))]
  }, [funds])

  const filterFund = (f: Fund) => {
    if (f.category === "Fixed Income") return false   // FI has its own section
    const matchCat = catFilter === "All" || f.category === catFilter
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  }

  const applySort = (arr: Fund[]) => [...arr].sort((a, b) => {
    const av = a[sortKey] as number | null
    const bv = b[sortKey] as number | null
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    return sortDir === "asc" ? av - bv : bv - av
  })

  // Ranked = has final_rank (10y+ equity history). Unranked = insufficient history.
  // Fixed income excluded from both — they appear in their own section.
  const rankedSorted   = useMemo(() => applySort(funds.filter(f => f.final_rank != null && filterFund(f))), [funds, search, catFilter, sortKey, sortDir])
  const unrankedSorted = useMemo(() => funds.filter(f => f.final_rank == null && filterFund(f)).sort((a,b) => a.name.localeCompare(b.name)), [funds, search, catFilter])

  // Fixed income sorted by CAGR descending, filtered by search term
  const fixedIncomeSorted = useMemo(
    () => [...fixedIncomeFunds]
      .filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => (b.cagr ?? 0) - (a.cagr ?? 0)),
    [fixedIncomeFunds, search]
  )

  // Top 3 ranked funds for leader grid (equity only)
  const top3 = useMemo(
    () => [...funds].filter(f => f.final_rank != null && f.category !== "Fixed Income").sort((a, b) => (a.final_rank ?? 0) - (b.final_rank ?? 0)).slice(0, 3),
    [funds]
  )

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  const handleToggleExpand = (id: number) => setExpandedId(expandedId === id ? null : id)

  function SortArrow({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span style={{ color: "rgba(12,14,19,.25)", fontSize: 9 }}>↕</span>
    return <span style={{ color: "#1A56DB", fontSize: 9 }}>{sortDir === "asc" ? "↑" : "↓"}</span>
  }

  function FundCharts({ fund }: { fund: Fund }) {
    const data = chartCache[fund.id]
    if (chartLoading && expandedId === fund.id && !data) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 12 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", border: "2.5px solid rgba(12,14,19,.12)", borderTopColor: "#0C0E13", animation: "spin .75s linear infinite" }} />
          <span style={{ fontSize: 14, color: "rgba(12,14,19,.5)" }}>Loading charts…</span>
        </div>
      )
    }
    if (!data) return null
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingTop: 8 }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Performance vs Nifty 50</p>
          <p style={{ fontSize: 11, color: "rgba(12,14,19,.5)", marginBottom: 12 }}>₹100 invested at inception</p>
          <NavChart data={data.portfolioNav} benchmarkData={data.benchmarkNav} name={fund.code} benchmarkName="Nifty 50" />
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Drawdown Risk</p>
          <p style={{ fontSize: 11, color: "rgba(12,14,19,.5)", marginBottom: 12 }}>% decline from previous peak</p>
          <DrawdownChart data={data.drawdownSeries} benchmarkData={data.benchmarkDrawdown} name={fund.code} benchmarkName="Nifty 50" />
        </div>
        {data.fyTableData && (
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Fiscal Year Detail</p>
            <p style={{ fontSize: 11, color: "rgba(12,14,19,.5)", marginBottom: 8 }}>Annual returns vs NIFTY 50</p>
            <FiscalYearDetailCards fyTableData={data.fyTableData} funds={[]} benchmarkName="NIFTY 50" primaryLabel={fund.code} />
          </div>
        )}
      </div>
    )
  }

  const tableColumns: { key: SortKey; label: string; title?: string }[] = [
    { key: "final_rank",            label: "Rank" },
    { key: "name",                  label: "Fund" },
    { key: "category",              label: "Category" },
    { key: "cagr_10y",              label: "10Y CAGR",   title: "10-year CAGR" },
    { key: "avg_3y_rolling_return", label: "Avg 3Y Roll", title: "Average 3-year rolling return" },
    { key: "sharpe_ratio",          label: "Sharpe" },
    { key: "max_drawdown",          label: "Max DD" },
  ]

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F3" }}>
      <style>{`
        .rcats-scroll { -webkit-overflow-scrolling: touch; scrollbar-width: none; -ms-overflow-style: none; }
        .rcats-scroll::-webkit-scrollbar { display: none; }
      `}</style>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "32px 32px 64px" }} className="rank-wrap-resp">

        {/* Page header */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{
                fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                fontSize: 30, fontWeight: 400, letterSpacing: "-.5px", marginBottom: 4,
              }}>
                Fund Rankings
              </h1>
              <p style={{ fontSize: 13.5, color: "rgba(12,14,19,.5)" }}>
                {loading ? "Loading…" : `${funds.filter(f => f.final_rank != null && f.category !== "Fixed Income").length} ranked · ${unrankedSorted.length} unranked · ${fixedIncomeFunds.length} fixed income · ${funds.length} total NSE indices`}
              </p>
              {!loading && lastNavDate && (() => {
                const daysDiff = Math.floor((Date.now() - new Date(lastNavDate).getTime()) / 86_400_000)
                const isStale = daysDiff > 4
                return (
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 6, padding: "3px 10px", borderRadius: 99, fontSize: 11.5, fontWeight: 600, background: isStale ? "rgba(197,39,30,.08)" : "rgba(10,124,78,.08)", color: isStale ? "#C5271E" : "#0A7C4E" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: isStale ? "#C5271E" : "#0A7C4E", display: "inline-block", flexShrink: 0 }} />
                    {isStale ? `Data stale · last updated ${lastNavDate}` : `Data as of ${lastNavDate}`}
                  </div>
                )
              })()}
            </div>
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "8px 16px", borderRadius: 9,
                background: "#0C0E13", color: "#ffffff",
                fontSize: 13, fontWeight: 600,
                textDecoration: "none", transition: "all .18s",
              }}
              className="hover:opacity-85 hover:-translate-y-px"
            >
              Build Portfolio
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Leader grid — top 3 funds */}
        {!loading && top3.length > 0 && (
          <div style={{ marginBottom: 28 }} className="leader-grid-resp">
            {top3.map((f, idx) => {
              const medals = [
                { label: "GOLD", bg: "#FFFBEB", border: "#FCD34D", badgeBg: "linear-gradient(135deg,#F59E0B,#D97706)", labelColor: "#92400E", starFill: "#F59E0B" },
                { label: "SILVER", bg: "#F8FAFC", border: "#CBD5E1", badgeBg: "linear-gradient(135deg,#94A3B8,#64748B)", labelColor: "#475569", starFill: "#94A3B8" },
                { label: "BRONZE", bg: "#FFF7ED", border: "#FDBA74", badgeBg: "linear-gradient(135deg,#CD9264,#B45309)", labelColor: "#C2410C", starFill: "#CD7C36" },
              ]
              const m = medals[idx]
              return (
                <div
                  key={f.id}
                  style={{
                    background: m.bg,
                    border: `1.5px solid ${m.border}`,
                    borderRadius: 16, padding: 20, cursor: "pointer",
                    transition: "all .18s",
                  }}
                  className="hover:shadow-[0_6px_20px_rgba(0,0,0,.1)] hover:-translate-y-0.5"
                  onClick={() => handleToggleExpand(f.id)}
                >
                  {/* Medal badge + rank */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%",
                      background: m.badgeBg,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, boxShadow: "0 2px 8px rgba(0,0,0,.12)",
                    }}>
                      {/* Medal icon */}
                      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="12" r="6" fill="rgba(255,255,255,.25)" />
                        <circle cx="10" cy="12" r="4.5" fill="rgba(255,255,255,.35)" />
                        <text x="10" y="16" textAnchor="middle" fontSize="7" fontWeight="800" fill="white" fontFamily="monospace">{f.final_rank}</text>
                        <path d="M7 6.5L8.5 2h3L13 6.5" stroke="rgba(255,255,255,.7)" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </div>
                    <div>
                      <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: "1.2px", color: m.labelColor, textTransform: "uppercase" as const }}>
                        {m.label}
                      </div>
                      <div style={{ fontSize: 10.5, color: "rgba(12,14,19,.4)", fontWeight: 600, marginTop: 1 }}>
                        {f.category}
                      </div>
                    </div>
                  </div>

                  <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-.1px", marginBottom: 12, lineHeight: 1.35, color: "#0C0E13" }}>
                    {f.name}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div style={{ background: "rgba(255,255,255,.6)", borderRadius: 10, padding: "9px 11px" }}>
                      <div style={{
                        fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                        fontSize: 19, fontWeight: 400, color: "#0A7C4E", letterSpacing: "-.3px",
                      }}>
                        {pct(f.cagr)}
                      </div>
                      <div style={{ fontSize: 9.5, color: "rgba(12,14,19,.35)", fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase" as const, marginTop: 1 }}>
                        CAGR
                      </div>
                    </div>
                    <div style={{ background: "rgba(255,255,255,.6)", borderRadius: 10, padding: "9px 11px" }}>
                      <div style={{
                        fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                        fontSize: 19, fontWeight: 400, color: "#0C0E13", letterSpacing: "-.3px",
                      }}>
                        {fixed(f.sharpe_ratio)}
                      </div>
                      <div style={{ fontSize: 9.5, color: "rgba(12,14,19,.35)", fontWeight: 700, letterSpacing: ".6px", textTransform: "uppercase" as const, marginTop: 1 }}>
                        Sharpe
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ flex: 1, height: 4, background: "rgba(12,14,19,.08)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{
                        height: "100%",
                        background: `linear-gradient(90deg, ${m.starFill}, ${idx === 0 ? "#22c55e" : idx === 1 ? "#94a3b8" : "#f97316"})`,
                        borderRadius: 2,
                        width: scoreBarWidth(f.score),
                      }} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: m.labelColor }}>
                      {displayScore(f.score)} / 10
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Info banner */}
        <div style={{
          background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
          borderRadius: 10, padding: "13px 17px",
          display: "flex", gap: 11, alignItems: "flex-start", marginBottom: 20,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: "#EBF0FF",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1A56DB" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="7" cy="7" r="6" /><line x1="7" y1="5" x2="7" y2="7" /><line x1="7" y1="9" x2="7.01" y2="9" />
            </svg>
          </div>
          <p style={{ fontSize: 13, color: "rgba(12,14,19,.5)", lineHeight: 1.6 }}>
            <strong style={{ color: "#0C0E13" }}>Score out of 10</strong> — composite of 20Y CAGR (30%), 3Y rolling return (25%), Sharpe ratio (30%), and drawdown protection (15%). Higher is better.{" "}
            Only indices with <strong style={{ color: "#0C0E13" }}>at least 10 years of history</strong> are ranked.{" "}
            <strong style={{ color: "#0C0E13" }}>Tap any row</strong> to expand.{" "}
            <strong style={{ color: "#0C0E13" }}>Fund name →</strong> opens full detail page.
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" as const, marginBottom: 20 }}
          className="rfilt-resp">
          {/* Search */}
          <div style={{ position: "relative", flex: "0 0 auto", width: "100%", maxWidth: 290, minWidth: 0 }} className="rfilt-search">
            <svg viewBox="0 0 20 20" fill="none" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "rgba(12,14,19,.3)", pointerEvents: "none" }}>
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14 14l-3-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              placeholder="Search funds…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "10px 13px 10px 36px",
                border: "1.5px solid rgba(12,14,19,.12)", borderRadius: 9,
                background: "#ffffff", fontFamily: "inherit",
                fontSize: 13.5, color: "#0C0E13", outline: "none",
                transition: "border-color .15s",
              }}
              onFocus={e => (e.target.style.borderColor = "#1A56DB")}
              onBlur={e => (e.target.style.borderColor = "rgba(12,14,19,.12)")}
            />
          </div>
          {/* Category pills */}
          <div style={{ display: "flex", gap: 6, overflowX: "auto" as const, flex: 1, minWidth: 0, paddingBottom: 2 }} className="rcats-scroll">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                style={{
                  padding: "6px 13px", borderRadius: 100, fontSize: 12, fontWeight: 600,
                  border: "1.5px solid",
                  borderColor: catFilter === cat ? "#0C0E13" : "rgba(12,14,19,.12)",
                  background: catFilter === cat ? "#0C0E13" : "#ffffff",
                  color: catFilter === cat ? "#ffffff" : "rgba(12,14,19,.5)",
                  cursor: "pointer", transition: "all .14s", whiteSpace: "nowrap" as const,
                  flexShrink: 0, fontFamily: "inherit",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <div style={{
            background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
            borderRadius: 20, overflow: "hidden",
            boxShadow: "0 1px 2px rgba(0,0,0,.05)",
          }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "96px 0" }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(12,14,19,.12)", borderTopColor: "#0C0E13", animation: "spin .75s linear infinite" }} />
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F5F5F3" }}>
                      {tableColumns.map(col => (
                        <th
                          key={col.key}
                          onClick={() => handleSort(col.key)}
                          style={{
                            padding: "10px 16px", textAlign: "left",
                            fontSize: 10, fontWeight: 700, letterSpacing: ".9px",
                            textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)",
                            borderBottom: "1px solid rgba(12,14,19,.12)",
                            whiteSpace: "nowrap" as const, cursor: "pointer",
                            userSelect: "none" as const, transition: "color .14s",
                          }}
                          className="hover:!text-[#0C0E13]"
                        >
                          {col.label} <SortArrow col={col.key} />
                        </th>
                      ))}
                      {/* Strength col */}
                      <th style={{
                        padding: "10px 16px", textAlign: "left",
                        fontSize: 10, fontWeight: 700, letterSpacing: ".9px",
                        textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)",
                        borderBottom: "1px solid rgba(12,14,19,.12)",
                      }}>
                        Score
                      </th>
                      <th style={{ padding: "10px 16px", borderBottom: "1px solid rgba(12,14,19,.12)", width: 32 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {rankedSorted.map((fund) => (
                      <>
                        <tr
                          key={fund.id}
                          style={{
                            borderBottom: "1px solid rgba(12,14,19,.06)",
                            cursor: "pointer",
                            background: expandedId === fund.id ? "#EBF0FF" : undefined,
                            transition: "background .12s",
                          }}
                          className={expandedId !== fund.id ? "hover:bg-[#F5F5F3]" : ""}
                          onClick={() => handleToggleExpand(fund.id)}
                        >
                          <td style={{ padding: "13px 16px" }}>
                            <RankBadge rank={fund.final_rank} />
                          </td>
                          <td style={{ padding: "13px 16px", maxWidth: 260, fontSize: 13.5, verticalAlign: "middle" }}>
                            <Link
                              href={`/rankings/${fund.id}`}
                              style={{ fontWeight: 600, letterSpacing: "-.1px", color: "#0C0E13", textDecoration: "none", lineHeight: 1.35 }}
                              className="hover:!text-[#1A56DB]"
                              onClick={e => e.stopPropagation()}
                            >
                              {toTitleCase(fund.name)}
                            </Link>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(12,14,19,.3)", marginTop: 2 }}>
                              {fund.code}
                            </div>
                          </td>
                          <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center",
                              padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600,
                              ...catStyle(fund.category),
                            }}>
                              {fund.category}
                            </span>
                          </td>
                          {/* 10Y CAGR */}
                          <td style={{ padding: "13px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: (fund.cagr_10y ?? 0) > 0.15 ? "#0A7C4E" : "#0C0E13", verticalAlign: "middle" }}>
                            {pct(fund.cagr_10y)}
                          </td>
                          <td style={{ padding: "13px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "rgba(12,14,19,.5)", verticalAlign: "middle" }}>
                            {pct(fund.avg_3y_rolling_return)}
                          </td>
                          <td style={{ padding: "13px 16px", fontFamily: "var(--font-mono)", fontSize: 13, verticalAlign: "middle" }}>
                            <span style={{ color: (fund.sharpe_ratio ?? 0) > 0.6 ? "#1A56DB" : "#0C0E13", fontWeight: (fund.sharpe_ratio ?? 0) > 0.6 ? 700 : 400 }}>
                              {fixed(fund.sharpe_ratio)}
                            </span>
                          </td>
                          <td style={{ padding: "13px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "#C5271E", verticalAlign: "middle" }}>
                            {pct(fund.max_drawdown)}
                          </td>
                          {/* Score bar */}
                          <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 90 }}>
                              <div style={{ flex: 1, height: 5, background: "rgba(12,14,19,.08)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{ height: "100%", background: "linear-gradient(90deg, #1A56DB, #22c55e)", borderRadius: 3, width: scoreBarWidth(fund.score) }} />
                              </div>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "#0C0E13", whiteSpace: "nowrap" as const }}>
                                {displayScore(fund.score)} / 10
                              </span>
                            </div>
                          </td>
                          <td style={{ padding: "13px 16px", color: "rgba(12,14,19,.3)", verticalAlign: "middle" }}>
                            <svg style={{ width: 18, height: 18, transition: "transform .22s ease", transform: expandedId === fund.id ? "rotate(180deg)" : "none" }} viewBox="0 0 18 18" fill="none">
                              <path d="M4.5 7l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </td>
                        </tr>

                        {expandedId === fund.id && (
                          <tr key={`${fund.id}-charts`} style={{ borderBottom: "1px solid rgba(26,86,219,.15)", background: "rgba(235,240,255,.4)" }}>
                            <td colSpan={9} style={{ padding: "22px 24px" }}>
                              <div style={{ background: "#ffffff", border: "1px solid rgba(12,14,19,.12)", borderRadius: 16, overflow: "hidden" }}>
                                <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(12,14,19,.08)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: 700, fontSize: 14 }}>{fund.name}</span>
                                  <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600, ...catStyle(fund.category) }}>{fund.category}</span>
                                  <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600, background: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.5)" }}>vs Nifty 50</span>
                                </div>
                                <div style={{ padding: "20px" }}>
                                  <FundCharts fund={fund} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Unranked section — insufficient history (desktop only; mobile rendered below ranked cards) */}
        {!loading && unrankedSorted.length > 0 && (
          <div className="hidden md:block" style={{ marginTop: 32 }}>
            {/* Collapsible header */}
            <button
              onClick={() => setUnrankedExpanded(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 18px", borderRadius: unrankedExpanded ? "12px 12px 0 0" : 12,
                background: "#ffffff", border: "1px solid rgba(12,14,19,.10)",
                cursor: "pointer", fontFamily: "inherit", transition: "border-radius .2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0C0E13" }}>
                  Not Ranked — Insufficient History
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 100,
                  background: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.45)",
                }}>
                  {unrankedSorted.length} indices
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11.5, color: "rgba(12,14,19,.35)", fontWeight: 500 }}>
                  {unrankedExpanded ? "Collapse" : "Expand to view"}
                </span>
                <svg style={{ width: 18, height: 18, color: "rgba(12,14,19,.35)", transition: "transform .22s ease", transform: unrankedExpanded ? "rotate(180deg)" : "none" }} viewBox="0 0 18 18" fill="none">
                  <path d="M4.5 7l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {unrankedExpanded && (
              <div style={{ background: "#ffffff", border: "1px solid rgba(12,14,19,.10)", borderTop: "none", borderRadius: "0 0 16px 16px", overflow: "hidden" }}>
                <p style={{ fontSize: 12, color: "rgba(12,14,19,.4)", padding: "8px 18px 10px", borderBottom: "1px solid rgba(12,14,19,.06)" }}>
                  These indices have less than 10 years of data and are excluded from the ranking.
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F5F5F3" }}>
                        {[
                          { label: "Fund" }, { label: "Category" },
                          { label: "10Y CAGR" }, { label: "Avg 3Y Roll" },
                          { label: "Sharpe" }, { label: "Max DD" },
                        ].map(col => (
                          <th key={col.label} style={{
                            padding: "9px 16px", textAlign: "left",
                            fontSize: 10, fontWeight: 700, letterSpacing: ".9px",
                            textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)",
                            borderBottom: "1px solid rgba(12,14,19,.10)", whiteSpace: "nowrap" as const,
                          }}>
                            {col.label}
                          </th>
                        ))}
                        <th style={{ width: 32, borderBottom: "1px solid rgba(12,14,19,.10)" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {unrankedSorted.map((fund) => (
                        <>
                          <tr
                            key={fund.id}
                            style={{ borderBottom: "1px solid rgba(12,14,19,.06)", cursor: "pointer", background: expandedId === fund.id ? "#EBF0FF" : undefined }}
                            className={expandedId !== fund.id ? "hover:bg-[#F5F5F3]" : ""}
                            onClick={() => handleToggleExpand(fund.id)}
                          >
                            <td style={{ padding: "12px 16px", maxWidth: 260, fontSize: 13.5, verticalAlign: "middle" }}>
                              <Link href={`/rankings/${fund.id}`} style={{ fontWeight: 600, color: "#0C0E13", textDecoration: "none", lineHeight: 1.35 }} className="hover:!text-[#1A56DB]" onClick={e => e.stopPropagation()}>
                                {toTitleCase(fund.name)}
                              </Link>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(12,14,19,.3)", marginTop: 2 }}>{fund.code}</div>
                            </td>
                            <td style={{ padding: "12px 16px", verticalAlign: "middle" }}>
                              <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600, ...catStyle(fund.category) }}>{fund.category}</span>
                            </td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, verticalAlign: "middle", fontWeight: 700, color: (fund.cagr_10y ?? 0) > 0.15 ? "#0A7C4E" : "#0C0E13" }}>{pct(fund.cagr_10y)}</td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "rgba(12,14,19,.5)", verticalAlign: "middle" }}>{pct(fund.avg_3y_rolling_return)}</td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, verticalAlign: "middle" }}>
                              <span style={{ color: (fund.sharpe_ratio ?? 0) > 0.6 ? "#1A56DB" : "#0C0E13" }}>{fixed(fund.sharpe_ratio)}</span>
                            </td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "#C5271E", verticalAlign: "middle" }}>{pct(fund.max_drawdown)}</td>
                            <td style={{ padding: "12px 16px", color: "rgba(12,14,19,.3)", verticalAlign: "middle" }}>
                              <svg style={{ width: 18, height: 18, transition: "transform .22s ease", transform: expandedId === fund.id ? "rotate(180deg)" : "none" }} viewBox="0 0 18 18" fill="none">
                                <path d="M4.5 7l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </td>
                          </tr>
                          {expandedId === fund.id && (
                            <tr key={`${fund.id}-charts`} style={{ borderBottom: "1px solid rgba(26,86,219,.15)", background: "rgba(235,240,255,.4)" }}>
                              <td colSpan={7} style={{ padding: "22px 24px" }}>
                                <div style={{ background: "#ffffff", border: "1px solid rgba(12,14,19,.12)", borderRadius: 16, overflow: "hidden" }}>
                                  <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(12,14,19,.08)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                    <span style={{ fontWeight: 700, fontSize: 14 }}>{toTitleCase(fund.name)}</span>
                                    <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600, ...catStyle(fund.category) }}>{fund.category}</span>
                                  </div>
                                  <div style={{ padding: "20px" }}><FundCharts fund={fund} /></div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mobile Cards */}
        <div className="md:hidden" style={{ border: "1px solid rgba(12,14,19,.12)", borderRadius: 20, overflow: "hidden", background: "#ffffff" }}>
          {loading ? (
            <div style={{ padding: "48px 0", display: "flex", justifyContent: "center" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(12,14,19,.12)", borderTopColor: "#0C0E13", animation: "spin .75s linear infinite" }} />
            </div>
          ) : (
            rankedSorted.map((fund) => (
              <div
                key={fund.id}
                style={{
                  borderBottom: "1px solid rgba(12,14,19,.12)",
                  overflow: "hidden", transition: "all .18s",
                }}
              >
                {/* Card header */}
                <div
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "16px 20px", cursor: "pointer", minHeight: 72,
                    background: expandedId === fund.id ? "#F5F5F3" : undefined,
                  }}
                  onClick={() => handleToggleExpand(fund.id)}
                >
                  <RankBadge rank={fund.final_rank} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Link
                      href={`/rankings/${fund.id}`}
                      style={{ fontSize: 14, fontWeight: 700, display: "block", letterSpacing: "-.1px", color: "#0C0E13", textDecoration: "none", lineHeight: 1.35 }}
                      onClick={e => e.stopPropagation()}
                    >
                      {toTitleCase(fund.name)}
                    </Link>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                      <span style={{ display: "inline-flex", padding: "2px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 600, ...catStyle(fund.category) }}>
                        {fund.category}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(12,14,19,.3)", background: "rgba(12,14,19,.06)", padding: "1px 6px", borderRadius: 4 }}>
                        {fund.code}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{
                      fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                      fontSize: 22, fontWeight: 400, color: "#0A7C4E", letterSpacing: "-.3px",
                    }}>
                      {pct(fund.cagr)}
                    </div>
                    {nifty50 && fund.id !== nifty50.id && fund.cagr != null && nifty50.cagr != null && (
                      <div style={{
                        fontSize: 10.5, fontWeight: 700, marginTop: 1,
                        color: fund.cagr > nifty50.cagr ? "#0A7C4E" : "#C5271E",
                      }}>
                        {fund.cagr > nifty50.cagr ? "+" : ""}{((fund.cagr - nifty50.cagr) * 100).toFixed(0)}% vs N50
                      </div>
                    )}
                  </div>

                  <svg
                    style={{ width: 18, height: 18, color: "rgba(12,14,19,.3)", transition: "transform .22s ease", transform: expandedId === fund.id ? "rotate(180deg)" : "none", flexShrink: 0 }}
                    viewBox="0 0 18 18" fill="none"
                  >
                    <path d="M4.5 7l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                {/* Expanded content */}
                {expandedId === fund.id && (
                  <div style={{ borderTop: "1px solid rgba(12,14,19,.12)", background: "#F5F5F3" }}>
                    {/* 10Y CAGR highlight */}
                    <div style={{ margin: "14px 20px 0", border: "1px solid rgba(12,14,19,.12)", borderRadius: 10, overflow: "hidden", background: "#ffffff", padding: "12px 15px" }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".7px", textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)", marginBottom: 4 }}>10-Year CAGR</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: (fund.cagr_10y ?? 0) > 0.15 ? "#0A7C4E" : "#0C0E13" }}>{pct(fund.cagr_10y)}</div>
                    </div>
                    {/* 2×2 metrics grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid rgba(12,14,19,.12)", borderRadius: 10, overflow: "hidden", margin: "10px 20px", background: "#ffffff" }}>
                      {[
                        { label: "3Y Avg Rolling", value: pct(fund.avg_3y_rolling_return) },
                        { label: "Sharpe Ratio", value: fixed(fund.sharpe_ratio) },
                        { label: "Max Drawdown", value: pct(fund.max_drawdown), red: true },
                        { label: "Volatility", value: pct(fund.volatility) },
                      ].map((m, i) => (
                        <div key={m.label} style={{
                          padding: "13px 15px",
                          borderRight: i % 2 === 0 ? "1px solid rgba(12,14,19,.12)" : undefined,
                          borderBottom: i < 2 ? "1px solid rgba(12,14,19,.12)" : undefined,
                        }}>
                          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)", marginBottom: 5 }}>
                            {m.label}
                          </div>
                          <div style={{
                            fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                            fontSize: 20, fontWeight: 400, letterSpacing: "-.2px",
                            color: m.red ? "#C5271E" : "#0C0E13",
                          }}>
                            {m.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Score bar */}
                    <div style={{ padding: "0 20px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)" }}>Composite Score</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#1A56DB" }}>{displayScore(fund.score)} / 10</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(12,14,19,.08)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", background: "linear-gradient(90deg, #1A56DB, #22c55e)",
                          borderRadius: 3, width: scoreBarWidth(fund.score),
                        }} />
                      </div>
                    </div>

                    {/* Charts */}
                    <div style={{ borderTop: "1px dashed rgba(12,14,19,.12)", padding: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)" }}>Performance vs Nifty 50</p>
                        <Link
                          href={`/rankings/${fund.id}`}
                          onClick={e => e.stopPropagation()}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            padding: "6px 12px", borderRadius: 8,
                            background: "#0C0E13", color: "#ffffff",
                            fontSize: 12, fontWeight: 600, textDecoration: "none",
                          }}
                        >
                          Details
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M6 2h4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </Link>
                      </div>
                      <FundCharts fund={fund} />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* ── Fixed Income Section (desktop) ───────────────────────────────── */}
        {!loading && fixedIncomeSorted.length > 0 && (
          <div className="hidden md:block" style={{ marginTop: 32 }}>
            <button
              onClick={() => setFixedIncomeExpanded(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 18px", borderRadius: fixedIncomeExpanded ? "12px 12px 0 0" : 12,
                background: "#F5F3FF", border: "1.5px solid #DDD6FE",
                cursor: "pointer", fontFamily: "inherit", transition: "border-radius .2s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#5B21B6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="12" height="9" rx="1.5" /><path d="M1 6h12" /><path d="M5 6v6" />
                  </svg>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#3B0764" }}>
                  Fixed Income — G-Sec & Bond Indices
                </span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 100, background: "#EDE9FE", color: "#5B21B6" }}>
                  {fixedIncomeSorted.length} indices
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 11.5, color: "#5B21B6", fontWeight: 500 }}>
                  {fixedIncomeExpanded ? "Collapse" : "Expand to view"}
                </span>
                <svg style={{ width: 18, height: 18, color: "#5B21B6", transition: "transform .22s ease", transform: fixedIncomeExpanded ? "rotate(180deg)" : "none" }} viewBox="0 0 18 18" fill="none">
                  <path d="M4.5 7l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            {fixedIncomeExpanded && (
              <div style={{ background: "#ffffff", border: "1.5px solid #DDD6FE", borderTop: "none", borderRadius: "0 0 16px 16px", overflow: "hidden" }}>
                {/* Info note */}
                <div style={{ padding: "10px 18px 10px", borderBottom: "1px solid rgba(91,33,182,.1)", background: "#FAFAFF" }}>
                  <p style={{ fontSize: 12, color: "#5B21B6", lineHeight: 1.6 }}>
                    Government securities and Bharat Bond indices. Not ranked alongside equity — lower returns reflect
                    capital preservation and interest income. <strong>CAGR shown from inception.</strong> Charts compare
                    each bond index against Nifty 50 to illustrate equity vs fixed income trade-offs.
                  </p>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F5F3FF" }}>
                        {[
                          { label: "Index" }, { label: "CAGR" }, { label: "1Y" },
                          { label: "3Y" }, { label: "5Y" }, { label: "Sharpe" },
                          { label: "Volatility" }, { label: "Max DD" },
                        ].map(col => (
                          <th key={col.label} style={{
                            padding: "9px 16px", textAlign: "left",
                            fontSize: 10, fontWeight: 700, letterSpacing: ".9px",
                            textTransform: "uppercase" as const, color: "rgba(91,33,182,.5)",
                            borderBottom: "1px solid rgba(91,33,182,.12)", whiteSpace: "nowrap" as const,
                          }}>
                            {col.label}
                          </th>
                        ))}
                        <th style={{ width: 32, borderBottom: "1px solid rgba(91,33,182,.12)" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {fixedIncomeSorted.map((fund) => (
                        <>
                          <tr
                            key={fund.id}
                            style={{
                              borderBottom: "1px solid rgba(91,33,182,.06)",
                              cursor: "pointer",
                              background: expandedId === fund.id ? "#EDE9FE" : undefined,
                              transition: "background .12s",
                            }}
                            className={expandedId !== fund.id ? "hover:bg-[#F5F3FF]" : ""}
                            onClick={() => handleToggleExpand(fund.id)}
                          >
                            <td style={{ padding: "12px 16px", maxWidth: 280, verticalAlign: "middle" }}>
                              <Link
                                href={`/rankings/${fund.id}`}
                                style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-.1px", color: "#3B0764", textDecoration: "none", lineHeight: 1.35 }}
                                className="hover:!text-[#5B21B6]"
                                onClick={e => e.stopPropagation()}
                              >
                                {toTitleCase(fund.name)}
                              </Link>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(91,33,182,.4)", marginTop: 2 }}>
                                {fund.code}
                              </div>
                            </td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#0A7C4E", verticalAlign: "middle" }}>{pct(fund.cagr)}</td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "rgba(12,14,19,.6)", verticalAlign: "middle" }}>{pct(fund.cagr_1y)}</td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "rgba(12,14,19,.6)", verticalAlign: "middle" }}>{pct(fund.cagr_3y)}</td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "rgba(12,14,19,.6)", verticalAlign: "middle" }}>{pct(fund.cagr_5y)}</td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, verticalAlign: "middle" }}>
                              <span style={{ color: (fund.sharpe_ratio ?? 0) > 0.4 ? "#1A56DB" : "#0C0E13" }}>{fixed(fund.sharpe_ratio)}</span>
                            </td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "rgba(12,14,19,.6)", verticalAlign: "middle" }}>{pct(fund.volatility)}</td>
                            <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "#C5271E", verticalAlign: "middle" }}>{pct(fund.max_drawdown)}</td>
                            <td style={{ padding: "12px 16px", color: "rgba(91,33,182,.4)", verticalAlign: "middle" }}>
                              <svg style={{ width: 18, height: 18, transition: "transform .22s ease", transform: expandedId === fund.id ? "rotate(180deg)" : "none" }} viewBox="0 0 18 18" fill="none">
                                <path d="M4.5 7l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </td>
                          </tr>

                          {expandedId === fund.id && (
                            <tr key={`${fund.id}-fi-charts`} style={{ borderBottom: "1px solid rgba(91,33,182,.15)", background: "rgba(237,233,254,.25)" }}>
                              <td colSpan={9} style={{ padding: "22px 24px" }}>
                                <div style={{ background: "#ffffff", border: "1px solid rgba(91,33,182,.15)", borderRadius: 16, overflow: "hidden" }}>
                                  <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(91,33,182,.08)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                    <span style={{ fontWeight: 700, fontSize: 14, color: "#3B0764" }}>{fund.name}</span>
                                    <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600, ...catStyle(fund.category) }}>{fund.category}</span>
                                    <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600, background: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.5)" }}>vs Nifty 50</span>
                                  </div>
                                  <div style={{ padding: "20px" }}>
                                    <FundCharts fund={fund} />
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer note */}
        <p style={{ fontSize: 11.5, color: "rgba(12,14,19,.3)", textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
          {rankedSorted.length} ranked · {unrankedSorted.length} unranked · {fixedIncomeFunds.length} fixed income · {funds.length} total NSE indices · NSE India data · Past performance is not a guarantee of future returns.
        </p>

        {/* Mobile — unranked section pushed to bottom */}
        {!loading && unrankedSorted.length > 0 && (
          <div className="md:hidden" style={{ marginTop: 28 }}>
            <button
              onClick={() => setUnrankedExpanded(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "13px 18px", borderRadius: unrankedExpanded ? "12px 12px 0 0" : 12,
                background: "#ffffff", border: "1px solid rgba(12,14,19,.10)",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0C0E13" }}>Not Ranked — Insufficient History</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 100, background: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.45)" }}>
                  {unrankedSorted.length}
                </span>
              </div>
              <svg style={{ width: 18, height: 18, color: "rgba(12,14,19,.35)", transition: "transform .22s ease", transform: unrankedExpanded ? "rotate(180deg)" : "none", flexShrink: 0 }} viewBox="0 0 18 18" fill="none">
                <path d="M4.5 7l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {unrankedExpanded && (
              <div style={{ border: "1px solid rgba(12,14,19,.10)", borderTop: "none", borderRadius: "0 0 16px 16px", overflow: "hidden", background: "#ffffff" }}>
                {unrankedSorted.map(fund => (
                  <div key={fund.id} style={{ borderBottom: "1px solid rgba(12,14,19,.08)", padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Link href={`/rankings/${fund.id}`} style={{ fontSize: 13.5, fontWeight: 700, color: "#0C0E13", textDecoration: "none", lineHeight: 1.35 }}>{toTitleCase(fund.name)}</Link>
                      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                        <span style={{ display: "inline-flex", padding: "2px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 600, ...catStyle(fund.category) }}>{fund.category}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(12,14,19,.3)", background: "rgba(12,14,19,.06)", padding: "1px 6px", borderRadius: 4 }}>{fund.code}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: (fund.cagr_10y ?? 0) > 0.15 ? "#0A7C4E" : "#0C0E13" }}>{pct(fund.cagr_10y)}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(12,14,19,.4)", marginTop: 2 }}>10Y CAGR</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Mobile — Fixed Income section */}
        {!loading && fixedIncomeSorted.length > 0 && (
          <div className="md:hidden" style={{ marginTop: 28 }}>
            <button
              onClick={() => setFixedIncomeExpanded(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "13px 18px", borderRadius: fixedIncomeExpanded ? "12px 12px 0 0" : 12,
                background: "#F5F3FF", border: "1.5px solid #DDD6FE",
                cursor: "pointer", fontFamily: "inherit",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#3B0764" }}>Fixed Income — G-Sec & Bonds</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 100, background: "#EDE9FE", color: "#5B21B6" }}>
                  {fixedIncomeSorted.length}
                </span>
              </div>
              <svg style={{ width: 18, height: 18, color: "#5B21B6", transition: "transform .22s ease", transform: fixedIncomeExpanded ? "rotate(180deg)" : "none", flexShrink: 0 }} viewBox="0 0 18 18" fill="none">
                <path d="M4.5 7l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {fixedIncomeExpanded && (
              <div style={{ border: "1.5px solid #DDD6FE", borderTop: "none", borderRadius: "0 0 16px 16px", overflow: "hidden", background: "#ffffff" }}>
                <div style={{ padding: "10px 16px", background: "#FAFAFF", borderBottom: "1px solid rgba(91,33,182,.1)" }}>
                  <p style={{ fontSize: 11.5, color: "#5B21B6", lineHeight: 1.6 }}>G-Sec and Bharat Bond indices. CAGR shown from inception.</p>
                </div>
                {fixedIncomeSorted.map(fund => (
                  <div
                    key={fund.id}
                    style={{ borderBottom: "1px solid rgba(91,33,182,.08)", overflow: "hidden" }}
                  >
                    <div
                      style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", background: expandedId === fund.id ? "#F5F3FF" : undefined }}
                      onClick={() => handleToggleExpand(fund.id)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Link href={`/rankings/${fund.id}`} style={{ fontSize: 13.5, fontWeight: 700, color: "#3B0764", textDecoration: "none", lineHeight: 1.35 }} onClick={e => e.stopPropagation()}>
                          {toTitleCase(fund.name)}
                        </Link>
                        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                          <span style={{ display: "inline-flex", padding: "2px 7px", borderRadius: 100, fontSize: 10.5, fontWeight: 600, ...catStyle(fund.category) }}>{fund.category}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(91,33,182,.4)", background: "#EDE9FE", padding: "1px 6px", borderRadius: 4 }}>{fund.code}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#0A7C4E" }}>{pct(fund.cagr)}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(91,33,182,.4)", marginTop: 2 }}>CAGR</div>
                      </div>
                      <svg style={{ width: 16, height: 16, color: "rgba(91,33,182,.4)", transition: "transform .22s ease", transform: expandedId === fund.id ? "rotate(180deg)" : "none", flexShrink: 0 }} viewBox="0 0 18 18" fill="none">
                        <path d="M4.5 7l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    {expandedId === fund.id && (
                      <div style={{ borderTop: "1px solid rgba(91,33,182,.1)", background: "#F5F3FF", padding: 16 }}>
                        {/* Metrics grid */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16, background: "#ffffff", border: "1px solid rgba(91,33,182,.1)", borderRadius: 10, overflow: "hidden" }}>
                          {[
                            { label: "1Y CAGR", value: pct(fund.cagr_1y) },
                            { label: "3Y CAGR", value: pct(fund.cagr_3y) },
                            { label: "5Y CAGR", value: pct(fund.cagr_5y) },
                            { label: "Sharpe", value: fixed(fund.sharpe_ratio) },
                            { label: "Volatility", value: pct(fund.volatility) },
                            { label: "Max Drawdown", value: pct(fund.max_drawdown), red: true },
                          ].map((m, i) => (
                            <div key={m.label} style={{
                              padding: "11px 13px",
                              borderRight: i % 2 === 0 ? "1px solid rgba(91,33,182,.08)" : undefined,
                              borderBottom: i < 4 ? "1px solid rgba(91,33,182,.08)" : undefined,
                            }}>
                              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase" as const, color: "rgba(91,33,182,.4)", marginBottom: 4 }}>{m.label}</div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: m.red ? "#C5271E" : "#3B0764" }}>{m.value}</div>
                            </div>
                          ))}
                        </div>
                        <FundCharts fund={fund} />
                        <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
                          <Link href={`/rankings/${fund.id}`} onClick={e => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 8, background: "#5B21B6", color: "#ffffff", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>
                            Full Detail
                            <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 10L10 2M6 2h4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
