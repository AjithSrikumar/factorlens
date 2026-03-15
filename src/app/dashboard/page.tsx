"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { PortfolioBuilder, Fund } from "@/components/portfolio-builder"
import { NavChart, DrawdownChart, RollingReturnChart, AllocationPieChart, FiscalYearChart, FiscalYearDetailCards } from "@/components/portfolio-charts"
import { Badge } from "@/components/ui/badge"
import { Info, TrendingUp } from "lucide-react"

const DEFAULT_FUND_IDS = [26, 9, 19, 28, 27]

const LOADING_FACTS = [
  "The Nifty 50 TRI has compounded at ~15% CAGR since 2006 — ₹100 became ₹1,100+.",
  "Factor investing strategies have historically added 2–4% alpha vs broad market over long cycles.",
  "Momentum funds tend to shine in trending markets; Quality funds protect capital in downturns.",
  "A diversified multi-factor portfolio can reduce peak drawdown while preserving strong CAGR.",
  "The COVID crash of 2020 saw Nifty 50 fall 38% in just 40 days — factor portfolios varied widely.",
  "Rolling 3-year CAGR is a more reliable performance gauge than point-to-point returns.",
  "Low-volatility funds have historically outperformed in high-inflation, high-rate environments.",
  "Calmar Ratio = CAGR ÷ Max Drawdown. Higher Calmar = better risk-adjusted compounding.",
  "Sortino Ratio penalises only downside volatility — a sharper lens than Sharpe for equity.",
]

interface FundAllocation {
  fund: Fund
  weight: number
}

interface PortfolioMetrics {
  cagr: number
  volatility: number
  sharpe: number
  maxDrawdown: number
  calmar: number
  sortino: number
  totalReturn: number
  startDate: string
  endDate: string
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

interface PortfolioResult {
  portfolioNav: { date: string; value: number }[]
  metrics: PortfolioMetrics
  drawdownSeries: { date: string; value: number }[]
  rollingReturns: { date: string; value: number }[]
  benchmarkNav?: { date: string; value: number }[]
  benchmarkMetrics?: PortfolioMetrics
  benchmarkDrawdown?: { date: string; value: number }[]
  benchmarkRolling?: { date: string; value: number }[]
  fyTableData?: {
    portfolio: FYRawRow[]
    funds: Record<number, FYRawRow[]>
    benchmark: FYRawRow[]
  }
}

/* ── v4-style Portfolio Snapshot ──────────────────────────────────────────── */
function InfoTip({ text }: { text: string }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }} className="info-wrap-dash">
      <span style={{
        width: 16, height: 16, borderRadius: "50%", background: "rgba(12,14,19,.12)",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", fontSize: 9, fontWeight: 800, color: "rgba(12,14,19,.5)",
        lineHeight: 1,
      }}>i</span>
      <span style={{
        position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
        transform: "translateX(-50%)",
        background: "#0C0E13", color: "rgba(255,255,255,.85)",
        fontSize: 12, lineHeight: 1.55, padding: "10px 13px", borderRadius: 9,
        width: 200, zIndex: 400, pointerEvents: "none" as const,
        boxShadow: "0 16px 48px rgba(0,0,0,.12),0 4px 12px rgba(0,0,0,.05)",
        textAlign: "left" as const, fontWeight: 400,
        opacity: 0, transition: "opacity .18s",
      }} className="info-tip-dash">
        {text}
        <span style={{
          content: "", position: "absolute", top: "100%", left: "50%",
          transform: "translateX(-50%)", border: "5px solid transparent",
          borderTopColor: "#0C0E13",
          display: "block", width: 0, height: 0,
        }} />
      </span>
    </span>
  )
}

function PortfolioSnapshot({
  metrics, benchmark, allocations, rollingReturns,
}: {
  metrics: PortfolioMetrics
  benchmark?: PortfolioMetrics
  allocations: FundAllocation[]
  rollingReturns?: { date: string; value: number }[]
}) {
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  const fixed = (v: number, d = 2) => v.toFixed(d)
  const r100 = (100 * (1 + metrics.totalReturn / 100)).toFixed(0)
  const outperf = benchmark ? (metrics.cagr - benchmark.cagr) * 100 : null
  const avgRolling = rollingReturns?.length
    ? rollingReturns.reduce((s, r) => s + r.value, 0) / rollingReturns.length
    : null

  const startYear = metrics.startDate.slice(0, 4)
  const endYear = metrics.endDate.slice(0, 4)

  return (
    <div style={{
      background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
      borderRadius: 20, overflow: "hidden", marginBottom: 20,
    }}>
      {/* Header */}
      <div style={{
        padding: "22px 28px 16px", borderBottom: "1px solid rgba(12,14,19,.12)",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap" as const, gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.1px" }}>Portfolio Snapshot</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const, marginTop: 6 }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600,
              background: "#EBF0FF", color: "#1A56DB",
            }}>
              {allocations.length} asset{allocations.length !== 1 ? "s" : ""}
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600,
              background: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.5)",
            }}>
              {startYear} – {endYear}
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600,
              background: "rgba(12,14,19,.06)", color: "rgba(12,14,19,.5)",
            }}>
              vs NIFTY 50
            </span>
          </div>
        </div>
      </div>

      {/* Big 3 tiles */}
      <div style={{ borderBottom: "1px solid rgba(12,14,19,.12)" }}
        className="snap-3-grid">
        {[
          {
            label: "CAGR", info: "Compound Annual Growth Rate — the annualised return of your portfolio since inception.",
            value: pct(metrics.cagr), cls: "pos",
            benchV: benchmark ? pct(benchmark.cagr) : null,
            delta: benchmark ? ((metrics.cagr - benchmark.cagr) * 100) : null,
          },
          {
            label: "Sharpe Ratio", info: "Risk-adjusted return. Higher = better. Measures excess return per unit of volatility.",
            value: fixed(metrics.sharpe), cls: "",
            benchV: benchmark ? fixed(benchmark.sharpe) : null,
            delta: benchmark ? (metrics.sharpe - benchmark.sharpe) : null,
            deltaRaw: true,
          },
          {
            label: "Max Drawdown", info: "Largest peak-to-trough decline. Lower absolute value = better protection.",
            value: pct(metrics.maxDrawdown), cls: "neg",
            benchV: benchmark ? pct(benchmark.maxDrawdown) : null,
            delta: benchmark ? ((metrics.maxDrawdown - benchmark.maxDrawdown) * 100) : null,
            invertDelta: true,
          },
        ].map((tile, i) => {
          const isPos = tile.delta != null
            ? (tile.invertDelta ? tile.delta < 0 : tile.delta > 0)
            : false
          return (
            <div
              key={tile.label}
              style={{
                padding: "24px 28px",
                borderRight: i < 2 ? "1px solid rgba(12,14,19,.12)" : "none",
                position: "relative",
              }}
              className="snap-tile-resp"
            >
              <div style={{
                display: "flex", alignItems: "center", gap: 6,
                fontSize: 10.5, fontWeight: 700, letterSpacing: ".9px",
                textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)", marginBottom: 10,
              }}>
                {tile.label} <InfoTip text={tile.info} />
              </div>
              <div style={{
                fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                fontSize: "clamp(28px, 3.5vw, 36px)", fontWeight: 400, lineHeight: 1.0,
                letterSpacing: "-1px",
                color: tile.cls === "pos" ? "#0A7C4E" : tile.cls === "neg" ? "#C5271E" : "#0C0E13",
              }}>
                {tile.value}
              </div>
              {tile.benchV && (
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 9, flexWrap: "wrap" as const }}>
                  <span style={{ fontSize: 12, color: "rgba(12,14,19,.3)" }}>vs Nifty 50</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "rgba(12,14,19,.7)" }}>
                    {tile.benchV}
                  </span>
                  {tile.delta != null && (
                    <span style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "2px 8px", borderRadius: 100,
                      fontSize: 11, fontWeight: 700,
                      fontFamily: "var(--font-mono)",
                      background: isPos ? "#E6F4EE" : "#FCE8E7",
                      color: isPos ? "#0A7C4E" : "#C5271E",
                    }}>
                      {tile.deltaRaw
                        ? `${tile.delta > 0 ? "+" : ""}${tile.delta.toFixed(2)}`
                        : `${tile.delta > 0 ? "+" : ""}${tile.delta.toFixed(1)}%`}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 6 mini metrics */}
      <div style={{ borderBottom: "1px solid rgba(12,14,19,.12)" }}
        className="snap-6-grid">
        {[
          { label: "Volatility", info: "Annualised standard deviation of daily returns.", value: pct(metrics.volatility), benchV: benchmark ? pct(benchmark.volatility) : null },
          { label: "Sortino", info: "Like Sharpe, but only penalises downside volatility. More relevant for equity portfolios.", value: fixed(metrics.sortino), benchV: benchmark ? fixed(benchmark.sortino) : null },
          { label: "Calmar", info: "CAGR ÷ Max Drawdown. Higher means better risk-adjusted compounding.", value: fixed(metrics.calmar), benchV: benchmark ? fixed(benchmark.calmar) : null },
          { label: "Avg 3Y CAGR", info: "Average of all rolling 3-year CAGR windows.", value: avgRolling != null ? `${avgRolling.toFixed(1)}%` : "—", benchV: null },
          { label: "Total Return", info: "Total return since inception.", value: `${metrics.totalReturn.toFixed(0)}%`, benchV: benchmark ? `${benchmark.totalReturn.toFixed(0)}%` : null, pos: true },
          { label: "₹100 Became", info: "What ₹100 invested at inception grew to.", value: `₹${r100}`, benchV: null, pos: true },
        ].map((m, i) => (
          <div
            key={m.label}
            style={{
              padding: "16px 20px",
              borderRight: i < 5 ? "1px solid rgba(12,14,19,.12)" : "none",
              textAlign: "center",
            }}
            className="snap-mini-resp"
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              fontSize: 10, fontWeight: 700, letterSpacing: ".8px",
              textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)", marginBottom: 7,
            }}>
              {m.label} {m.info && <InfoTip text={m.info} />}
            </div>
            <div style={{
              fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
              fontSize: 20, fontWeight: 400, letterSpacing: "-.3px", lineHeight: 1.1,
              color: m.pos ? "#0A7C4E" : "#0C0E13",
            }}>
              {m.value}
            </div>
            {m.benchV && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(12,14,19,.3)", marginTop: 3 }}>
                N50 {m.benchV}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Outperformance bar */}
      {outperf != null && (
        <div style={{
          padding: "13px 28px", display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const,
        }}>
          <span style={{ fontSize: 12.5, color: "rgba(12,14,19,.5)" }}>
            Annualised outperformance vs Nifty 50
          </span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
            padding: "4px 12px", borderRadius: 100,
            background: outperf >= 0 ? "#E6F4EE" : "#FCE8E7",
            color: outperf >= 0 ? "#0A7C4E" : "#C5271E",
          }}>
            {outperf >= 0 ? "+" : ""}{outperf.toFixed(2)}%
          </span>
        </div>
      )}
    </div>
  )
}

/* ── Loading state ── */
function LoadingFacts({ isDefault }: { isDefault: boolean }) {
  const [factIdx, setFactIdx] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setFactIdx(i => (i + 1) % LOADING_FACTS.length)
        setVisible(true)
      }, 400)
    }, 3500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
      borderRadius: 20, padding: "68px 36px", textAlign: "center",
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: "50%",
        border: "3px solid rgba(12,14,19,.12)", borderTopColor: "#0C0E13",
        animation: "spin .75s linear infinite", margin: "0 auto 18px",
      }} />
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
        {isDefault ? "Loading model portfolio…" : "Running 20 years of historical backtest…"}
      </div>
      <div style={{ fontSize: 13.5, color: "rgba(12,14,19,.5)", marginBottom: 24 }}>
        Computing portfolio risk metrics
      </div>
      <div
        style={{
          opacity: visible ? 1 : 0, transition: "opacity 0.4s ease",
          maxWidth: 400, margin: "0 auto",
        }}
      >
        <div style={{
          background: "#F5F5F3", border: "1px solid rgba(12,14,19,.12)",
          borderRadius: 9, padding: "17px 19px", textAlign: "left",
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)", marginBottom: 7 }}>
            Did you know?
          </div>
          <div style={{ fontSize: 13.5, color: "#0C0E13", lineHeight: 1.62 }}>
            {LOADING_FACTS[factIdx]}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Chart card wrapper matching v4 .ccard style ── */
function CCard({ title, sub, children, legend }: {
  title: React.ReactNode
  sub?: string
  children: React.ReactNode
  legend?: React.ReactNode
}) {
  return (
    <div style={{
      background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
      borderRadius: 20, overflow: "hidden", marginBottom: 20,
    }}>
      <div style={{
        padding: "20px 28px 16px", borderBottom: "1px solid rgba(12,14,19,.12)",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
      }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.2px" }}>{title}</div>
          {sub && <div style={{ fontSize: 12.5, color: "rgba(12,14,19,.5)", marginTop: 3 }}>{sub}</div>}
        </div>
        {legend}
      </div>
      <div style={{ padding: "24px 28px" }} className="ccard-body-resp">
        {children}
      </div>
    </div>
  )
}

function ChartLegend({ items }: { items: { color: string; label: string; dashed?: boolean }[] }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" as const, flexShrink: 0 }}>
      {items.map(item => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "rgba(12,14,19,.5)" }}>
          {item.dashed
            ? <div style={{ width: 18, height: 0, borderTop: `2.5px dashed ${item.color}` }} />
            : <div style={{ width: 18, height: 2.5, borderRadius: 2, background: item.color }} />}
          {item.label}
        </div>
      ))}
    </div>
  )
}

export default function DashboardPage() {
  const [funds, setFunds] = useState<Fund[]>([])
  const [allocations, setAllocations] = useState<FundAllocation[]>([])
  const [result, setResult] = useState<PortfolioResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [fundsLoading, setFundsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDefault, setIsDefault] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)  // closed by default
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/funds")
      .then((r) => r.json())
      .then((data: Fund[]) => {
        setFunds(data)
        setFundsLoading(false)
        const defaultFunds = DEFAULT_FUND_IDS
          .map((id) => data.find((f) => f.id === id))
          .filter(Boolean) as Fund[]
        if (defaultFunds.length === DEFAULT_FUND_IDS.length) {
          setAllocations(defaultFunds.map((f) => ({ fund: f, weight: 100 / DEFAULT_FUND_IDS.length })))
          setIsDefault(true)
        }
      })
      .catch(() => setFundsLoading(false))
  }, [])

  const handleGenerate = useCallback(async () => {
    if (allocations.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const body = { allocations: allocations.map((a) => ({ fundId: a.fund.id, weight: a.weight })) }
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to compute")
      setResult(data)
      setBuilderOpen(false)
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [allocations])

  useEffect(() => {
    if (isDefault && allocations.length === DEFAULT_FUND_IDS.length && !result) {
      handleGenerate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDefault, allocations.length])

  const handleAllocationsChange = useCallback((next: FundAllocation[]) => {
    setAllocations(next)
    setIsDefault(false)
  }, [])

  const scrollToBuilder = () => {
    setBuilderOpen(true)
    setTimeout(() => {
      document.getElementById("builder-section")?.scrollIntoView({ behavior: "smooth", block: "start" })
    }, 100)
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F3" }}>
      {/* Desktop page header */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 32px 0" }} className="hidden md:block">
        <h1 style={{
          fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
          fontSize: 30, fontWeight: 400, letterSpacing: "-.5px", marginBottom: 4,
        }}>
          Portfolio Builder
        </h1>
        <p style={{ fontSize: 13.5, color: "rgba(12,14,19,.5)" }}>
          Institutional-grade backtesting with 20+ years of NSE data.
        </p>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 32px 64px" }} className="dash-wrap-resp">

        {/* Builder section — collapsed by default, at top */}
        <div style={{ marginBottom: 20 }} id="builder-section">
          <div style={{
            background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
            borderRadius: 20, overflow: "hidden",
          }}>
            {/* Builder header — collapsible */}
            <div
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "18px 26px", cursor: "pointer", transition: "background .14s",
                minHeight: 56,
              }}
              className="hover:bg-[rgba(12,14,19,.03)]"
              onClick={() => setBuilderOpen(o => !o)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 9, background: "#0C0E13",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <svg viewBox="0 0 17 17" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                    <rect x="2" y="2" width="5.5" height="5.5" rx=".8" />
                    <rect x="9.5" y="2" width="5.5" height="5.5" rx=".8" />
                    <rect x="2" y="9.5" width="5.5" height="5.5" rx=".8" />
                    <rect x="9.5" y="9.5" width="5.5" height="5.5" rx=".8" />
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-.2px" }}>Build Your Portfolio</div>
                  <div style={{ fontSize: 12.5, color: "rgba(12,14,19,.5)", marginTop: 2 }}>
                    {!builderOpen && allocations.length > 0
                      ? allocations.map(a => `${a.fund.code} ${a.weight.toFixed(0)}%`).join(" · ")
                      : "Select funds · Set weights · Generate"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {allocations.length > 0 && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "3px 9px", borderRadius: 100, fontSize: 11, fontWeight: 600,
                    background: "#EBF0FF", color: "#1A56DB",
                  }}>
                    {allocations.length} selected
                  </span>
                )}
                <svg
                  style={{
                    width: 18, height: 18, color: "rgba(12,14,19,.3)",
                    transition: "transform .25s ease",
                    transform: builderOpen ? "rotate(180deg)" : "none",
                  }}
                  viewBox="0 0 18 18" fill="none"
                >
                  <path d="M4.5 7l4.5 4.5 4.5-4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>

            {/* Builder body */}
            {builderOpen && (
              <div style={{ borderTop: "1px solid rgba(12,14,19,.12)", padding: "22px 26px" }} className="bld-body-resp">
                {fundsLoading ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0" }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2.5px solid rgba(12,14,19,.12)", borderTopColor: "#0C0E13", animation: "spin .75s linear infinite" }} />
                  </div>
                ) : (
                  <PortfolioBuilder
                    funds={funds}
                    allocations={allocations}
                    onChange={handleAllocationsChange}
                    onGenerate={handleGenerate}
                    loading={loading}
                  />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Results section */}
        <div>

          {/* Empty state */}
          {!result && !loading && (
            <div style={{
              background: "#ffffff", border: "1.5px dashed rgba(12,14,19,.12)",
              borderRadius: 20, padding: "68px 36px", textAlign: "center",
            }}>
              <div style={{
                width: 50, height: 50, borderRadius: 15, background: "#F5F5F3",
                display: "flex", alignItems: "center", justifyContent: "center",
                margin: "0 auto 16px",
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 25, height: 25, color: "rgba(12,14,19,.3)" }}>
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>No Portfolio Yet</div>
              <div style={{ fontSize: 14, color: "rgba(12,14,19,.5)", maxWidth: 280, margin: "0 auto", lineHeight: 1.6 }}>
                Select funds below, adjust weights, then run the backtest to see 20 years of data.
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && <LoadingFacts isDefault={isDefault} />}

          {/* Results */}
          {result && !loading && (
            <div ref={resultsRef}>

              {/* Portfolio Snapshot */}
              <PortfolioSnapshot
                metrics={result.metrics}
                benchmark={result.benchmarkMetrics}
                allocations={allocations}
                rollingReturns={result.rollingReturns}
              />

              {/* Performance vs NIFTY */}
              <CCard
                title="Performance vs NIFTY 50"
                sub="Normalised to ₹100 at common start date"
                legend={<ChartLegend items={[
                  { color: "#1A56DB", label: "Portfolio" },
                  { color: "#94a3b8", label: "Nifty 50", dashed: true },
                ]} />}
              >
                <NavChart data={result.portfolioNav} benchmarkData={result.benchmarkNav} />
              </CCard>

              {/* Fiscal Year Returns chart */}
              {result.benchmarkNav && result.benchmarkNav.length > 0 && (
                <CCard title="Fiscal Year Returns" sub="Annual returns (Apr–Mar) vs NIFTY 50">
                  <FiscalYearChart
                    fundNav={result.portfolioNav}
                    benchmarkNav={result.benchmarkNav}
                    fundName="Portfolio"
                    benchmarkName="NIFTY 50"
                  />
                </CCard>
              )}

              {/* FY Detail — expandable cards */}
              {result.fyTableData && (
                <div style={{
                  background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
                  borderRadius: 20, overflow: "hidden", marginBottom: 20,
                }}>
                  <div style={{
                    padding: "20px 28px 16px", borderBottom: "1px solid rgba(12,14,19,.12)",
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.2px" }}>Fiscal Year Detail</div>
                    <div style={{ fontSize: 12.5, color: "rgba(12,14,19,.5)", marginTop: 3 }}>
                      Portfolio NAV at FY start/end vs NIFTY 50 · Tap row to expand fund breakdown
                    </div>
                  </div>
                  <FiscalYearDetailCards
                    fyTableData={result.fyTableData}
                    funds={allocations.map(a => ({
                      id: a.fund.id,
                      name: a.fund.name,
                      code: a.fund.code,
                      weight: a.weight,
                    }))}
                  />
                </div>
              )}

              {/* Side-by-side: Drawdown + Composition */}
              <div style={{ marginBottom: 20 }}
                className="side2-resp">
                {/* Drawdown */}
                <div style={{
                  background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
                  borderRadius: 20, overflow: "hidden",
                }}>
                  <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid rgba(12,14,19,.12)" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.2px" }}>Drawdown Risk</div>
                    <div style={{ fontSize: 12.5, color: "rgba(12,14,19,.5)", marginTop: 3 }}>% decline from previous peak</div>
                  </div>
                  <div style={{ padding: "24px 28px" }} className="ccard-body-resp">
                    <DrawdownChart data={result.drawdownSeries} benchmarkData={result.benchmarkDrawdown} />
                  </div>
                </div>

                {/* Portfolio Composition */}
                <div style={{
                  background: "#ffffff", border: "1px solid rgba(12,14,19,.12)",
                  borderRadius: 20, overflow: "hidden",
                }}>
                  <div style={{ padding: "20px 28px 16px", borderBottom: "1px solid rgba(12,14,19,.12)" }}>
                    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.2px" }}>Portfolio Composition</div>
                    <div style={{ fontSize: 12.5, color: "rgba(12,14,19,.5)", marginTop: 3 }}>Weight distribution</div>
                  </div>
                  <div style={{ padding: "24px 28px 0" }} className="ccard-body-resp">
                    <AllocationPieChart
                      data={allocations.map((a) => ({ name: a.fund.name, code: a.fund.code, weight: a.weight }))}
                    />
                  </div>
                </div>
              </div>

              {/* Rolling Returns */}
              {result.rollingReturns.length > 0 && (
                <CCard
                  title="3-Year Rolling CAGR"
                  sub="Annualised returns over any 756-day window"
                  legend={<ChartLegend items={[
                    { color: "#0d9488", label: "Portfolio" },
                    { color: "#94a3b8", label: "Nifty 50", dashed: true },
                  ]} />}
                >
                  <RollingReturnChart data={result.rollingReturns} benchmarkData={result.benchmarkRolling} />
                </CCard>
              )}

              {/* Disclosure */}
              <div style={{
                border: "1px dashed rgba(12,14,19,.3)", borderRadius: 16,
                padding: "22px 24px", marginTop: 8,
              }}>
                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.5px", textTransform: "uppercase" as const, color: "rgba(12,14,19,.3)", marginBottom: 9 }}>
                  Disclosure
                </div>
                <p style={{ fontSize: 12, color: "rgba(12,14,19,.5)", lineHeight: 1.72 }}>
                  Past performance is not indicative of future results. All computations use adjusted NSE index NAV data (2005–present). CAGR is annualised compounded growth. Volatility is annualised standard deviation of daily returns. Max Drawdown represents the deepest peak-to-trough decline. Comparison vs Nifty 50 is for benchmarking only. <strong style={{ color: "#0C0E13" }}>Data Source: NSE India | FactorLens Calculations.</strong> Not financial advice.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{
            borderRadius: 12, border: "1px solid rgba(197,39,30,.4)",
            background: "rgba(197,39,30,.05)", padding: "12px 16px", marginTop: 12,
          }}>
            <p style={{ fontSize: 14, color: "#C5271E" }}>{error}</p>
          </div>
        )}


      </div>

      {/* Sticky FAB — mobile only, shows when results visible */}
      {result && (
        <div style={{
          position: "fixed", bottom: "calc(68px + 16px)", right: 20,
          zIndex: 250, display: "none",
        }} className="md:!hidden !flex">
          <button
            onClick={scrollToBuilder}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "12px 18px", borderRadius: 100,
              background: "#0C0E13", color: "#ffffff",
              fontSize: 13.5, fontWeight: 700,
              boxShadow: "0 4px 20px rgba(12,14,19,.28)",
              transition: "all .2s", border: "none",
              fontFamily: "inherit", cursor: "pointer", whiteSpace: "nowrap" as const,
            }}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, flexShrink: 0 }}>
              <rect x="2" y="2" width="5" height="5" rx=".8" />
              <rect x="9" y="2" width="5" height="5" rx=".8" />
              <rect x="2" y="9" width="5" height="5" rx=".8" />
              <rect x="9" y="9" width="5" height="5" rx=".8" />
            </svg>
            Build Portfolio
          </button>
        </div>
      )}
    </div>
  )
}
