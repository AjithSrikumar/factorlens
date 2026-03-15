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
  cagr: number
  avg_3y_rolling_return: number
  max_drawdown: number
  volatility: number
  sharpe_ratio: number
  calmar_ratio: number
  score: number
  final_rank: number
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
  "Broad Market": { bg: "#EBF0FF", color: "#1A56DB" },
  "Momentum": { bg: "#FFF3E6", color: "#B45309" },
  "Multi-Factor": { bg: "#F3F0FF", color: "#6D28D9" },
  "Quality": { bg: "#E6F4EE", color: "#0A7C4E" },
  "Low Vol": { bg: "#E6F4EE", color: "#0A7C4E" },
  "Alpha": { bg: "#FDE8F4", color: "#9D1769" },
  "Value": { bg: "#FEF5E6", color: "#92400E" },
  "Global/Other": { bg: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.5)" },
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

function RankBadge({ rank }: { rank: number }) {
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
      {rank}
    </span>
  )
}

export default function RankingsPage() {
  const [funds, setFunds] = useState<Fund[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [catFilter, setCatFilter] = useState("All")
  const [sortKey, setSortKey] = useState<SortKey>("final_rank")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [chartCache, setChartCache] = useState<Record<number, ChartData>>({})
  const [chartLoading, setChartLoading] = useState(false)

  useEffect(() => {
    fetch("/api/funds")
      .then((r) => r.json())
      .then((d) => { setFunds(d); setLoading(false) })
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

  const nifty50 = useMemo(() => funds.find(f => f.code === 'Nifty50' || f.id === 1), [funds])
  const categories = useMemo(() => ["All", ...Array.from(new Set(funds.map((f) => f.category)))], [funds])

  const sorted = useMemo(() => {
    let filtered = funds.filter((f) => {
      const matchCat = catFilter === "All" || f.category === catFilter
      const matchSearch = f.name.toLowerCase().includes(search.toLowerCase())
      return matchCat && matchSearch
    })
    filtered = [...filtered].sort((a, b) => {
      const av = a[sortKey] as number
      const bv = b[sortKey] as number
      if (av == null) return 1
      if (bv == null) return -1
      return sortDir === "asc" ? av - bv : bv - av
    })
    return filtered
  }, [funds, search, catFilter, sortKey, sortDir])

  // Top 3 funds for leader grid
  const top3 = useMemo(() => [...funds].sort((a, b) => a.final_rank - b.final_rank).slice(0, 3), [funds])

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

  const tableColumns: { key: SortKey; label: string }[] = [
    { key: "final_rank", label: "Rank" },
    { key: "name", label: "Fund" },
    { key: "category", label: "Category" },
    { key: "cagr", label: "CAGR" },
    { key: "avg_3y_rolling_return", label: "Avg 3Y" },
    { key: "sharpe_ratio", label: "Sharpe" },
    { key: "max_drawdown", label: "Max DD" },
  ]

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F3" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "32px 32px 64px" }} className="rank-wrap-resp">

        {/* Desktop page header */}
        <div style={{ marginBottom: 28 }} className="hidden md:block">
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{
                fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                fontSize: 30, fontWeight: 400, letterSpacing: "-.5px", marginBottom: 4,
              }}>
                Fund Rankings
              </h1>
              <p style={{ fontSize: 13.5, color: "rgba(12,14,19,.5)" }}>
                28 NSE factor & broad-market funds ranked by composite score.
              </p>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 28 }}
            className="leader-grid-resp">
            {top3.map(f => {
              const cs = catStyle(f.category)
              return (
                <div
                  key={f.id}
                  style={{
                    background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
                    borderRadius: 16, padding: 20, cursor: "pointer",
                    transition: "all .18s",
                  }}
                  className="hover:shadow-[0_4px_16px_rgba(0,0,0,.08)] hover:border-[rgba(12,14,19,.3)] hover:-translate-y-0.5"
                  onClick={() => handleToggleExpand(f.id)}
                >
                  <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)", marginBottom: 10 }}>
                    #{f.final_rank} · {f.category}
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: "-.1px", marginBottom: 10, lineHeight: 1.35 }}>
                    {f.name}
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const }}>
                    <div>
                      <div style={{
                        fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                        fontSize: 20, fontWeight: 400, color: "#0A7C4E", letterSpacing: "-.3px",
                      }}>
                        {pct(f.cagr)}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(12,14,19,.3)", fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase" as const, marginTop: 1 }}>
                        CAGR
                      </div>
                    </div>
                    <div>
                      <div style={{
                        fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                        fontSize: 20, fontWeight: 400, color: "#0C0E13", letterSpacing: "-.3px",
                      }}>
                        {fixed(f.sharpe_ratio)}
                      </div>
                      <div style={{ fontSize: 10, color: "rgba(12,14,19,.3)", fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase" as const, marginTop: 1 }}>
                        Sharpe
                      </div>
                    </div>
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
            <strong style={{ color: "#0C0E13" }}>Ranking Strength Bar</strong> visualises composite score — CAGR, 3Y rolling, Sharpe, and drawdown protection.{" "}
            <strong style={{ color: "#0C0E13" }}>Tap any row</strong> to expand.{" "}
            <strong style={{ color: "#0C0E13" }}>Fund name →</strong> opens full detail page.
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" as const, marginBottom: 20 }}
          className="rfilt-resp">
          {/* Search */}
          <div style={{ position: "relative", flex: 1, minWidth: 180, maxWidth: 290 }}>
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
          <div style={{ display: "flex", gap: 6, overflow: "hidden" }} className="rcats-scroll">
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
                    {sorted.map((fund) => (
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
                          <td style={{ padding: "13px 16px", maxWidth: 220, fontSize: 13.5, verticalAlign: "middle" }}>
                            <Link
                              href={`/rankings/${fund.id}`}
                              style={{ fontWeight: 600, letterSpacing: "-.1px", color: "#0C0E13", textDecoration: "none" }}
                              className="hover:!text-[#1A56DB]"
                              onClick={e => e.stopPropagation()}
                            >
                              <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }}>
                                {fund.name}
                              </span>
                            </Link>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(12,14,19,.3)", marginTop: 1 }}>
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
                          <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                            <span style={{
                              fontFamily: "var(--font-mono)", fontSize: 13.5, fontWeight: 700,
                              color: fund.cagr > 0.18 ? "#0A7C4E" : "#0C0E13",
                            }}>
                              {pct(fund.cagr)}
                            </span>
                            {nifty50 && fund.id !== nifty50.id && (
                              <div style={{
                                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                                color: fund.cagr > nifty50.cagr ? "#0A7C4E" : "#C5271E",
                                marginTop: 1,
                              }}>
                                {fund.cagr > nifty50.cagr ? "+" : ""}{((fund.cagr - nifty50.cagr) * 100).toFixed(1)}% vs N50
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "13px 16px", fontFamily: "var(--font-mono)", fontSize: 13.5, color: "rgba(12,14,19,.5)", verticalAlign: "middle" }}>
                            {pct(fund.avg_3y_rolling_return)}
                          </td>
                          <td style={{ padding: "13px 16px", fontFamily: "var(--font-mono)", fontSize: 13.5, verticalAlign: "middle" }}>
                            <span style={{ color: fund.sharpe_ratio > 0.6 ? "#1A56DB" : "#0C0E13", fontWeight: fund.sharpe_ratio > 0.6 ? 700 : 400 }}>
                              {fixed(fund.sharpe_ratio)}
                            </span>
                          </td>
                          <td style={{ padding: "13px 16px", fontFamily: "var(--font-mono)", fontSize: 13.5, color: "#C5271E", verticalAlign: "middle" }}>
                            {pct(fund.max_drawdown)}
                          </td>
                          {/* Score bar */}
                          <td style={{ padding: "13px 16px", verticalAlign: "middle" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 80 }}>
                              <div style={{ flex: 1, height: 5, background: "rgba(12,14,19,.08)", borderRadius: 3, overflow: "hidden" }}>
                                <div style={{
                                  height: "100%",
                                  background: "linear-gradient(90deg, #1A56DB, #22c55e)",
                                  borderRadius: 3,
                                  width: `${Math.min((fund.score / 50) * 100, 100)}%`,
                                }} />
                              </div>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "#0C0E13", width: 30 }}>
                                {fund.score?.toFixed(1)}
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
                              <div style={{
                                background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
                                borderRadius: 16, overflow: "hidden",
                              }}>
                                <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid rgba(12,14,19,.08)", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: 700, fontSize: 14 }}>{fund.name}</span>
                                  <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600, ...catStyle(fund.category) }}>
                                    {fund.category}
                                  </span>
                                  <span style={{ display: "inline-flex", padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600, background: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.5)" }}>
                                    vs Nifty 50
                                  </span>
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

        {/* Mobile Cards */}
        <div className="md:hidden" style={{ border: "1px solid rgba(12,14,19,.12)", borderRadius: 20, overflow: "hidden", background: "#ffffff" }}>
          {loading ? (
            <div style={{ padding: "48px 0", display: "flex", justifyContent: "center" }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(12,14,19,.12)", borderTopColor: "#0C0E13", animation: "spin .75s linear infinite" }} />
            </div>
          ) : (
            sorted.map((fund) => (
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
                      style={{ fontSize: 14, fontWeight: 700, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-.1px", color: "#0C0E13", textDecoration: "none" }}
                      onClick={e => e.stopPropagation()}
                    >
                      {fund.name}
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
                    {nifty50 && fund.id !== nifty50.id && (
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
                    {/* 2×2 metrics grid */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid rgba(12,14,19,.12)", borderRadius: 10, overflow: "hidden", margin: "14px 20px", background: "#ffffff" }}>
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
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#1A56DB" }}>{fund.score?.toFixed(1)}</span>
                      </div>
                      <div style={{ height: 6, background: "rgba(12,14,19,.08)", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", background: "linear-gradient(90deg, #1A56DB, #22c55e)",
                          borderRadius: 3, width: `${Math.min((fund.score / 50) * 100, 100)}%`,
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

        {/* Footer note */}
        <p style={{ fontSize: 11.5, color: "rgba(12,14,19,.3)", textAlign: "center", marginTop: 18, lineHeight: 1.6 }}>
          {sorted.length} of {funds.length} funds shown · NSE India data (Apr 2005 – Feb 2026) · Past performance is not a guarantee of future returns.
        </p>

      </div>
    </div>
  )
}
