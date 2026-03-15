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

interface NavPoint { date: string; nav: number }

interface FundDetail {
  fund:        FundMeta
  metrics:     FundMetrics | null
  nav_history: NavPoint[]
}

// Helpers
function fmt(v: number | null, decimals = 1, prefix = "", suffix = "%"): string | null {
  if (v === null) return null
  return `${prefix}${v >= 0 ? "+" : ""}${v.toFixed(decimals)}${suffix}`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

function thinHistory(history: NavPoint[], maxPoints = 500): NavPoint[] {
  if (history.length <= maxPoints) return history
  const step = Math.ceil(history.length / maxPoints)
  return history.filter((_, i) => i % step === 0 || i === history.length - 1)
}

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
        ₹{Number(payload[0]?.value).toFixed(4)}
      </p>
    </div>
  )
}

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

export default function FundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data,    setData]    = useState<FundDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/mffunds/${id}`)
      .then(r => r.json())
      .then((d: unknown) => {
        if (d && typeof d === "object" && "fund" in d) {
          setData(d as FundDetail)
        } else if (d && typeof d === "object" && "error" in d) {
          setError(String((d as { error: string }).error))
        } else {
          setError("Unexpected response from server")
        }
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [id])

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F5F3" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px" }}>
          <div style={{ height: 28, width: 80, borderRadius: 8, background: "rgba(12,14,19,.08)", marginBottom: 20, animation: "mf-pulse 1.4s ease infinite" }} />
          <div style={{ height: 100, borderRadius: 16, background: "rgba(12,14,19,.06)", marginBottom: 16, animation: "mf-pulse 1.4s ease infinite" }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
            {[1,2,3,4].map(i => <div key={i} style={{ height: 90, borderRadius: 14, background: "rgba(12,14,19,.06)", animation: "mf-pulse 1.4s ease infinite" }} />)}
          </div>
          <div style={{ height: 280, borderRadius: 16, background: "rgba(12,14,19,.06)", animation: "mf-pulse 1.4s ease infinite" }} />
        </div>
        <style>{`@keyframes mf-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F5F3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", padding: 32 }}>
          <p style={{ color: "rgba(12,14,19,.5)", fontSize: 14, marginBottom: 12 }}>{error ?? "Fund not found"}</p>
          <Link href="/funds" style={{ color: "#1A56DB", fontSize: 13, textDecoration: "none" }}>← Back to Funds</Link>
        </div>
      </div>
    )
  }

  const { fund, metrics, nav_history } = data
  const chartData = thinHistory(nav_history)

  const r1y   = fmt(metrics?.return_1y      ?? null)
  const r3y   = fmt(metrics?.return_3y      ?? null)
  const r5y   = fmt(metrics?.return_5y      ?? null)
  const rInc  = fmt(metrics?.cagr_inception ?? null)

  const r1yColor  = metrics?.return_1y      != null ? (metrics.return_1y  >= 0 ? "#0A7C4E" : "#C5271E") : undefined
  const r3yColor  = metrics?.return_3y      != null ? (metrics.return_3y  >= 0 ? "#0A7C4E" : "#C5271E") : undefined
  const r5yColor  = metrics?.return_5y      != null ? (metrics.return_5y  >= 0 ? "#0A7C4E" : "#C5271E") : undefined
  const rIncColor = metrics?.cagr_inception != null ? (metrics.cagr_inception >= 0 ? "#0A7C4E" : "#C5271E") : undefined

  const navMin   = chartData.length ? Math.min(...chartData.map(d => d.nav)) : 0
  const navMax   = chartData.length ? Math.max(...chartData.map(d => d.nav)) : 0
  const yDomain  = [navMin * 0.97, navMax * 1.01]

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
              <p style={{ margin: "0 0 4px", fontSize: 10.5, fontWeight: 700, color: "rgba(12,14,19,.35)", textTransform: "uppercase", letterSpacing: ".7px" }}>
                {fund.scheme_category}
              </p>
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
                fontSize: 40, fontWeight: 400, color: "#0C0E13",
                letterSpacing: "-.02em", lineHeight: 1,
              }}>
                ₹{fund.nav?.toFixed(4) ?? "—"}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "rgba(12,14,19,.4)" }}>
                as of {formatDate(fund.nav_date)}
              </p>
            </div>
          </div>
        </div>

        {/* Return metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}
             className="sm:grid-cols-4">
          <MetricTile label="Since Inception CAGR" value={rInc}  sub={`From ${formatDate(fund.inception_date)}`} color={rIncColor} />
          <MetricTile label="1 Year Return"         value={r1y}  color={r1yColor} />
          <MetricTile label="3 Year CAGR"           value={r3y}  color={r3yColor} />
          <MetricTile label="5 Year CAGR"           value={r5y}  color={r5yColor} />
        </div>

        {/* Risk metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 16 }}
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

        {/* Sharpe ratio banner */}
        {metrics?.sharpe != null && (
          <div style={{
            background: "#ffffff", border: "1px solid rgba(12,14,19,.1)",
            borderRadius: 14, padding: "14px 20px", marginBottom: 16,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
          }}>
            <div>
              <p style={{ margin: "0 0 2px", fontSize: 10.5, fontWeight: 700, color: "rgba(12,14,19,.35)", textTransform: "uppercase", letterSpacing: ".7px" }}>
                Sharpe Ratio
              </p>
              <p style={{ margin: 0, fontSize: 11.5, color: "rgba(12,14,19,.45)" }}>
                Risk-adjusted return (rf = 6%)
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
            <div style={{ padding: "18px 20px 12px", display: "flex", alignItems: "center", gap: 12 }}>
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
                <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0C0E13" }}>NAV Price History</p>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "rgba(12,14,19,.4)" }}>
                  {chartData[0].date} → {chartData[chartData.length - 1].date}
                  &nbsp;·&nbsp;{nav_history.length.toLocaleString()} data points
                </p>
              </div>
            </div>
            <div style={{ padding: "0 8px 16px" }}>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor="#1A56DB" stopOpacity={0.2} />
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

        {/* Fund info */}
        <div style={{
          background: "#ffffff", border: "1px solid rgba(12,14,19,.1)",
          borderRadius: 16, padding: "18px 20px", marginBottom: 20,
        }}>
          <p style={{ margin: "0 0 12px", fontSize: 13, fontWeight: 700, color: "#0C0E13" }}>Fund Details</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
            {[
              { label: "Fund House",    value: fund.fund_house },
              { label: "Category",      value: fund.scheme_category },
              { label: "Type",          value: fund.scheme_type },
              { label: "Inception",     value: formatDate(fund.inception_date) },
              { label: "Scheme Code",   value: String(fund.scheme_code) },
              { label: "Max Drawdown",  value: metrics?.max_drawdown != null ? `${metrics.max_drawdown.toFixed(2)}%` : "—" },
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
            Past performance is not indicative of future results. Not investment advice.
          </p>
        </div>

      </div>
    </div>
  )
}
