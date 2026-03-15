"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts"

interface FundMeta {
  scheme_code:     number
  scheme_name:     string
  fund_house:      string
  scheme_type:     string
  scheme_category: string
  nav:             number
  nav_date:        string
  inception_date:  string
}

interface FundMetrics {
  cagr_inception: number | null
  total_return:   number | null
  return_1y:      number | null
  return_3y:      number | null
  return_5y:      number | null
  volatility:     number | null
  max_drawdown:   number | null
  sharpe:         number | null
}

interface FYRow {
  fy:         string
  startDate:  string
  startNav:   number
  endDate:    string
  endNav:     number
  returnPct:  number
  isLive:     boolean
}

interface NavPoint { date: string; nav: number }

interface FundDetail {
  fund:        FundMeta
  metrics:     FundMetrics | null
  nav_history: NavPoint[]
  fy_data:     FYRow[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Derive a readable category from the fund name */
function deriveCategory(name: string, rawCat?: string | null): string {
  const n = name.toLowerCase()
  if (n.includes("gold")) return "Gold"
  if (n.includes("silver")) return "Silver"
  if (n.includes("nasdaq") || n.includes("s&p 500") || n.includes("global") ||
      n.includes("international") || n.includes("world") || n.includes("us equity"))
    return "Global"
  if ((n.includes("alpha") && n.includes("low vol")) ||
      (n.includes("quality") && n.includes("low vol")) ||
      n.includes("multi-factor") || n.includes("multifactor"))
    return "Multi-Factor"
  if (n.includes("momentum")) return "Momentum"
  if (n.includes("alpha")) return "Alpha"
  if (n.includes("low vol") || n.includes("low volatility")) return "Low Vol"
  if (n.includes("quality")) return "Quality"
  if (n.includes("value")) return "Value"
  if (n.includes("dividend")) return "Dividend"
  if (n.includes("defence") || n.includes("infra") || n.includes("energy") ||
      n.includes("pharma") || n.includes("health") || n.includes("bank") ||
      n.includes("financial") || n.includes("technology") || n.includes("psu") ||
      n.includes("consumption") || n.includes("auto") || n.includes("realty"))
    return "Thematic"
  if (n.includes("nifty 50") || n.includes("nifty50") || n.includes("sensex") ||
      n.includes("midcap") || n.includes("smallcap") || n.includes("next 50") ||
      n.includes("nifty 100") || n.includes("nifty 200") || n.includes("nifty 500") ||
      n.includes("equal weight") || n.includes("large") || n.includes("micro"))
    return "Broad Market"
  if (!rawCat) return "Index Fund"
  if (rawCat.includes("ETF")) return "ETF"
  if (rawCat.includes("Index")) return "Index Fund"
  return rawCat
}

function fmt(v: number | null, decimals = 1, prefix = "", suffix = "%"): string | null {
  if (v === null) return null
  return `${prefix}${v >= 0 ? "+" : ""}${v.toFixed(decimals)}${suffix}`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
  } catch { return iso }
}

function thinHistory(history: NavPoint[], maxPoints = 500): NavPoint[] {
  if (history.length <= maxPoints) return history
  const step = Math.ceil(history.length / maxPoints)
  return history.filter((_, i) => i % step === 0 || i === history.length - 1)
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NavTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: "rgba(12,14,19,.95)", border: "1px solid rgba(255,255,255,.1)",
      borderRadius: 10, padding: "8px 12px", fontSize: 12,
    }}>
      <p style={{ color: "rgba(255,255,255,.5)", margin: "0 0 4px" }}>{label}</p>
      <p style={{ color: "#ffffff", fontFamily: "var(--font-mono)", margin: 0, fontWeight: 600 }}>
        ₹{Number(payload[0]?.value).toFixed(2)}
      </p>
    </div>
  )
}

// ── Metric Tile ───────────────────────────────────────────────────────────────
function MetricTile({ label, value, sub, color }: {
  label: string; value: string | null; sub?: string; color?: string
}) {
  return (
    <div style={{
      background: "#ffffff", border: "1px solid rgba(12,14,19,.1)",
      borderRadius: 14, padding: "16px 18px",
    }}>
      <p style={{ margin: "0 0 6px", fontSize: 10.5, fontWeight: 700, color: "rgba(12,14,19,.4)", textTransform: "uppercase", letterSpacing: ".7px" }}>
        {label}
      </p>
      {value !== null ? (
        <p style={{
          margin: 0, fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
          fontSize: 28, fontWeight: 400, letterSpacing: "-.02em", lineHeight: 1,
          color: color ?? "#0C0E13",
        }}>
          {value}
        </p>
      ) : (
        <p style={{ margin: 0, fontSize: 24, color: "rgba(12,14,19,.15)" }}>—</p>
      )}
      {sub && <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "rgba(12,14,19,.4)" }}>{sub}</p>}
    </div>
  )
}

// ── FY Detail Section ─────────────────────────────────────────────────────────
function FYDetailSection({ rows }: { rows: FYRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (!rows.length) return null

  return (
    <div style={{
      background: "#ffffff", border: "1px solid rgba(12,14,19,.1)",
      borderRadius: 16, overflow: "hidden", marginBottom: 16,
    }}>
      {/* Header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid rgba(12,14,19,.08)" }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0C0E13" }}>Fiscal Year Returns</p>
        <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "rgba(12,14,19,.4)" }}>
          NAV at start &amp; end of each fiscal year (Apr – Mar)
        </p>
      </div>

      {/* Column headers */}
      <div style={{
        display: "grid", gridTemplateColumns: "64px 1fr 1fr 80px 28px",
        padding: "8px 16px", background: "#F5F5F3",
        borderBottom: "1px solid rgba(12,14,19,.08)",
        gap: 8,
      }}>
        {["FY", "Start (Apr 1)", "End (Mar 31)", "Return", ""].map(h => (
          <div key={h} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: ".8px", textTransform: "uppercase", color: "rgba(12,14,19,.35)" }}>
            {h}
          </div>
        ))}
      </div>

      {/* Rows */}
      {rows.map(row => {
        const isOpen = expanded === row.fy
        const pos = row.returnPct >= 0
        return (
          <div key={row.fy} style={{ borderBottom: "1px solid rgba(12,14,19,.06)" }}>
            {/* Summary row */}
            <div
              style={{
                display: "grid", gridTemplateColumns: "64px 1fr 1fr 80px 28px",
                padding: "13px 16px", cursor: "pointer", gap: 8,
                background: isOpen ? "rgba(26,86,219,.03)" : undefined,
                transition: "background .12s",
                alignItems: "center",
              }}
              onClick={() => setExpanded(isOpen ? null : row.fy)}
            >
              {/* FY label */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#0C0E13",
                }}>
                  {row.fy}
                </span>
                {row.isLive && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                    background: "#EBF0FF", color: "#1A56DB", letterSpacing: ".4px",
                  }}>
                    LIVE
                  </span>
                )}
              </div>

              {/* Start date */}
              <div>
                <div style={{ fontSize: 11.5, color: "rgba(12,14,19,.4)", marginBottom: 1 }}>
                  {formatDate(row.startDate)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600, color: "#0C0E13" }}>
                  ₹{row.startNav.toFixed(1)}
                </div>
              </div>

              {/* End date */}
              <div>
                <div style={{ fontSize: 11.5, color: "rgba(12,14,19,.4)", marginBottom: 1 }}>
                  {formatDate(row.endDate)}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600, color: "#0C0E13" }}>
                  ₹{row.endNav.toFixed(1)}
                </div>
              </div>

              {/* Return */}
              <div style={{
                fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                fontSize: 18, fontWeight: 400,
                color: pos ? "#0A7C4E" : "#C5271E",
                letterSpacing: "-.02em",
              }}>
                {pos ? "+" : ""}{row.returnPct.toFixed(1)}%
              </div>

              {/* Chevron */}
              <svg
                style={{ width: 16, height: 16, color: "rgba(12,14,19,.25)", transition: "transform .2s", transform: isOpen ? "rotate(180deg)" : "none" }}
                viewBox="0 0 16 16" fill="none"
              >
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Expanded: return bar */}
            {isOpen && (
              <div style={{
                padding: "10px 16px 14px",
                borderTop: "1px solid rgba(12,14,19,.06)",
                background: "rgba(26,86,219,.02)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 5, background: "rgba(12,14,19,.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 3,
                      background: pos ? "#0A7C4E" : "#C5271E",
                      width: `${Math.min(Math.abs(row.returnPct) / 60 * 100, 100)}%`,
                      transition: "width .4s ease",
                    }} />
                  </div>
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                    color: pos ? "#0A7C4E" : "#C5271E",
                    minWidth: 58, textAlign: "right",
                  }}>
                    {pos ? "+" : ""}{row.returnPct.toFixed(2)}%
                  </span>
                </div>
                <div style={{ marginTop: 8, fontSize: 11, color: "rgba(12,14,19,.4)", lineHeight: 1.5 }}>
                  NAV grew from <strong style={{ color: "#0C0E13" }}>₹{row.startNav.toFixed(2)}</strong> to{" "}
                  <strong style={{ color: "#0C0E13" }}>₹{row.endNav.toFixed(2)}</strong> over this fiscal year
                  {row.isLive ? " (year in progress)" : ""}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function FundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data,    setData]    = useState<FundDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetch(`/api/mffunds/${id}`)
      .then(r => {
        if (!r.ok) throw new Error(`Server returned ${r.status}`)
        return r.json()
      })
      .then((d: unknown) => {
        if (cancelled) return
        if (d && typeof d === "object" && "fund" in d) {
          setData(d as FundDetail)
        } else if (d && typeof d === "object" && "error" in d) {
          setError(String((d as { error: string }).error))
        } else {
          setError("Unexpected response from server")
        }
        setLoading(false)
      })
      .catch(e => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : "Failed to load fund data")
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F5F3" }}>
        <style>{`@keyframes mf-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
          <div style={{ height: 20, width: 80, borderRadius: 8, background: "rgba(12,14,19,.08)", marginBottom: 20, animation: "mf-pulse 1.4s ease infinite" }} />
          <div style={{ height: 110, borderRadius: 16, background: "rgba(12,14,19,.06)", marginBottom: 16, animation: "mf-pulse 1.4s ease infinite" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}>
            {[1,2,3,4].map(i => <div key={i} style={{ height: 88, borderRadius: 14, background: "rgba(12,14,19,.06)", animation: "mf-pulse 1.4s ease infinite" }} />)}
          </div>
          <div style={{ height: 300, borderRadius: 16, background: "rgba(12,14,19,.06)", animation: "mf-pulse 1.4s ease infinite" }} />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F5F3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 32, maxWidth: 360 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: "#FCE8E7",
            display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px",
          }}>
            <svg viewBox="0 0 20 20" fill="none" style={{ width: 22, height: 22 }}>
              <path d="M10 6v4M10 14h.01M3.515 16.485C6.095 19.065 9.05 20 10 20s3.905-.935 6.485-3.515C18.065 13.905 19 10.95 19 10s-.935-3.905-3.515-6.485C12.905 1.935 9.95 1 9 1s-3.905.935-6.485 3.515C-.065 6.095 1 9.05 1 10s.935 3.905 2.515 5.485z"
                stroke="#C5271E" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <p style={{ color: "#C5271E", fontSize: 14, marginBottom: 8, fontWeight: 600 }}>
            {error ?? "Fund not found"}
          </p>
          <p style={{ color: "rgba(12,14,19,.4)", fontSize: 12.5, marginBottom: 16, lineHeight: 1.5 }}>
            This could be a temporary issue with the data provider. Please try again.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 16px", borderRadius: 9, border: "1.5px solid rgba(12,14,19,.15)",
                background: "#ffffff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Retry
            </button>
            <Link href="/funds" style={{
              padding: "8px 16px", borderRadius: 9, background: "#0C0E13", color: "#ffffff",
              fontSize: 13, fontWeight: 600, textDecoration: "none",
            }}>
              ← All Funds
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const { fund, metrics, nav_history, fy_data } = data
  const chartData = thinHistory(nav_history)
  const category  = deriveCategory(fund.scheme_name, fund.scheme_category)

  const r1y   = fmt(metrics?.return_1y      ?? null)
  const r3y   = fmt(metrics?.return_3y      ?? null)
  const r5y   = fmt(metrics?.return_5y      ?? null)
  const rInc  = fmt(metrics?.cagr_inception ?? null)

  const r1yColor  = metrics?.return_1y      != null ? (metrics.return_1y  >= 0 ? "#0A7C4E" : "#C5271E") : undefined
  const r3yColor  = metrics?.return_3y      != null ? (metrics.return_3y  >= 0 ? "#0A7C4E" : "#C5271E") : undefined
  const r5yColor  = metrics?.return_5y      != null ? (metrics.return_5y  >= 0 ? "#0A7C4E" : "#C5271E") : undefined
  const rIncColor = metrics?.cagr_inception != null ? (metrics.cagr_inception >= 0 ? "#0A7C4E" : "#C5271E") : undefined

  const navMin  = chartData.length ? Math.min(...chartData.map(d => d.nav)) : 0
  const navMax  = chartData.length ? Math.max(...chartData.map(d => d.nav)) : 0
  const yDomain = [navMin * 0.97, navMax * 1.01]

  const isTrending = (metrics?.return_1y ?? 0) > 0

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F3" }}>
      <style>{`@keyframes mf-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 80px" }}>

        {/* Back */}
        <Link href="/funds" style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontSize: 13, color: "rgba(12,14,19,.5)", textDecoration: "none",
          marginBottom: 20, transition: "color .15s",
        }}>
          <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }}>
            <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          All Funds
        </Link>

        {/* Hero card */}
        <div style={{
          background: "#ffffff", border: "1px solid rgba(12,14,19,.1)",
          borderRadius: 18, padding: "22px 24px", marginBottom: 16,
        }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              {/* Category badge */}
              <span style={{
                display: "inline-flex", alignItems: "center",
                padding: "3px 10px", borderRadius: 100, fontSize: 10.5, fontWeight: 700,
                background: "#EBF0FF", color: "#1A56DB", letterSpacing: ".3px",
                marginBottom: 8,
              }}>
                {category}
              </span>
              <h1 style={{ margin: "0 0 6px", fontSize: 20, fontWeight: 700, color: "#0C0E13", lineHeight: 1.3, letterSpacing: "-.02em" }}>
                {fund.scheme_name}
              </h1>
              <p style={{ margin: 0, fontSize: 13, color: "rgba(12,14,19,.45)", display: "flex", alignItems: "center", gap: 5 }}>
                <svg viewBox="0 0 14 14" fill="none" style={{ width: 12, height: 12, flexShrink: 0 }}>
                  <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M4 7h6M4 5h4M4 9h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                </svg>
                {fund.fund_house}
              </p>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <p style={{ margin: "0 0 2px", fontSize: 10.5, fontWeight: 700, color: "rgba(12,14,19,.35)", textTransform: "uppercase", letterSpacing: ".7px" }}>
                Current NAV
              </p>
              <p style={{
                margin: 0, fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                fontSize: 40, fontWeight: 400, color: isTrending ? "#0A7C4E" : "#0C0E13",
                letterSpacing: "-.02em", lineHeight: 1,
              }}>
                ₹{fund.nav?.toFixed(1) ?? "—"}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "rgba(12,14,19,.4)" }}>
                as of {formatDate(fund.nav_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Return metrics — 4 cols */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 12 }}
             className="sm:grid-cols-4">
          <MetricTile label="Since Inception CAGR" value={rInc}  sub={`From ${formatDate(fund.inception_date)}`} color={rIncColor} />
          <MetricTile label="1 Year Return"         value={r1y}  color={r1yColor} />
          <MetricTile label="3 Year CAGR"           value={r3y}  color={r3yColor} />
          <MetricTile label="5 Year CAGR"           value={r5y}  color={r5yColor} />
        </div>

        {/* Risk metrics — 3 cols */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 12 }}
             className="sm:grid-cols-3">
          <MetricTile
            label="Total Return"
            value={metrics?.total_return != null ? `${metrics.total_return >= 0 ? "+" : ""}${metrics.total_return.toFixed(0)}%` : null}
            sub="Since inception"
            color={metrics?.total_return != null ? (metrics.total_return >= 0 ? "#0A7C4E" : "#C5271E") : undefined}
          />
          <MetricTile
            label="Volatility"
            value={metrics?.volatility != null ? `${metrics.volatility.toFixed(1)}%` : null}
            sub="Ann. std deviation"
          />
          <MetricTile
            label="Max Drawdown"
            value={metrics?.max_drawdown != null ? `${metrics.max_drawdown.toFixed(1)}%` : null}
            sub="Peak-to-trough"
            color={metrics?.max_drawdown != null ? "#C5271E" : undefined}
          />
        </div>

        {/* Sharpe ratio */}
        {metrics?.sharpe != null && (
          <div style={{
            background: "#ffffff", border: "1px solid rgba(12,14,19,.1)",
            borderRadius: 14, padding: "14px 20px", marginBottom: 12,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            flexWrap: "wrap",
          }}>
            <div>
              <p style={{ margin: "0 0 2px", fontSize: 10.5, fontWeight: 700, color: "rgba(12,14,19,.35)", textTransform: "uppercase", letterSpacing: ".7px" }}>
                Sharpe Ratio
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: "rgba(12,14,19,.45)" }}>
                Risk-adjusted return (rf = 6%) · {metrics.sharpe >= 1 ? "Excellent" : metrics.sharpe >= 0.5 ? "Good" : "Below average"}
              </p>
            </div>
            <p style={{
              margin: 0, fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
              fontSize: 36, fontWeight: 400, letterSpacing: "-.02em",
              color: metrics.sharpe >= 1 ? "#0A7C4E" : metrics.sharpe >= 0.5 ? "#a16207" : "#C5271E",
            }}>
              {metrics.sharpe.toFixed(2)}
            </p>
          </div>
        )}

        {/* NAV Chart */}
        {chartData.length > 0 && (
          <div style={{
            background: "#ffffff", border: "1px solid rgba(12,14,19,.1)",
            borderRadius: 16, overflow: "hidden", marginBottom: 16,
          }}>
            <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid rgba(12,14,19,.08)", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: "rgba(26,86,219,.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <svg viewBox="0 0 20 20" fill="none" stroke="#1A56DB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                  <polyline points="3 17 7 11 11 14 17 4" />
                </svg>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0C0E13" }}>NAV Growth Since Inception</p>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "rgba(12,14,19,.4)" }}>
                  {chartData[0]?.date} → {chartData[chartData.length - 1]?.date}
                  &nbsp;·&nbsp;{nav_history.length.toLocaleString()} data points
                </p>
              </div>
            </div>
            <div style={{ padding: "8px 8px 16px" }}>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#1A56DB" stopOpacity={0.18} />
                      <stop offset="100%" stopColor="#1A56DB" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(12,14,19,.06)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "rgba(12,14,19,.4)" }}
                    tickLine={false} axisLine={false}
                    tickFormatter={d => d.slice(0, 4)}
                    interval="preserveStartEnd" minTickGap={48}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fontSize: 10, fill: "rgba(12,14,19,.4)" }}
                    tickLine={false} axisLine={false}
                    tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}`}
                    width={52}
                  />
                  <Tooltip content={<NavTooltip />} />
                  <Area
                    type="monotone" dataKey="nav"
                    stroke="#1A56DB" strokeWidth={2}
                    fill="url(#navGrad)" dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: "#1A56DB" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Fiscal Year Detail */}
        {fy_data && fy_data.length > 0 && <FYDetailSection rows={fy_data} />}

        {/* Fund info */}
        <div style={{
          background: "#ffffff", border: "1px solid rgba(12,14,19,.1)",
          borderRadius: 16, padding: "18px 20px", marginBottom: 20,
        }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#0C0E13" }}>Fund Details</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {[
              { label: "Fund House",  value: fund.fund_house },
              { label: "Category",    value: category },
              { label: "Type",        value: fund.scheme_type },
              { label: "Inception",   value: formatDate(fund.inception_date) },
              { label: "Scheme Code", value: String(fund.scheme_code) },
              { label: "AMFI Category", value: fund.scheme_category },
            ].map(({ label, value }, i) => (
              <div key={label} style={{
                padding: "10px 0",
                borderBottom: i < 4 ? "1px solid rgba(12,14,19,.07)" : "none",
              }}>
                <p style={{ margin: "0 0 2px", fontSize: 10.5, fontWeight: 700, color: "rgba(12,14,19,.35)", textTransform: "uppercase", letterSpacing: ".6px" }}>
                  {label}
                </p>
                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: "#0C0E13" }}>{value || "—"}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Disclosure */}
        <div style={{
          borderRadius: 12, border: "1px dashed rgba(12,14,19,.15)",
          padding: "12px 16px", background: "rgba(12,14,19,.02)",
        }}>
          <p style={{ margin: "0 0 3px", fontSize: 10, fontWeight: 700, color: "rgba(12,14,19,.35)", textTransform: "uppercase", letterSpacing: ".7px" }}>Disclosure</p>
          <p style={{ margin: 0, fontSize: 11.5, color: "rgba(12,14,19,.45)", lineHeight: 1.65 }}>
            NAV data sourced from AMFI via mfapi.in. Returns are calculated from historical NAV data.
            Fiscal year returns cover Apr 1 → Mar 31 using the nearest available NAV.
            Past performance is not indicative of future results. Not investment advice.
          </p>
        </div>

      </div>
    </div>
  )
}
