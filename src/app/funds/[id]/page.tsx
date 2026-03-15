"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip
} from "recharts"
import { ArrowLeft, TrendingUp, TrendingDown, Activity, Shield, Building2, Tag, Calendar, Hash } from "lucide-react"
import { cn } from "@/lib/utils"

interface FundMeta {
  scheme_code: number
  scheme_name: string
  fund_house: string
  scheme_type: string
  scheme_category: string
  nav: number
  nav_date: string
  inception_date: string
}

interface FundMetrics {
  cagr_inception: number | null
  total_return: number | null
  return_1y: number | null
  return_3y: number | null
  return_5y: number | null
  volatility: number | null
  max_drawdown: number | null
  sharpe: number | null
}

interface NavPoint {
  date: string
  nav: number
}

interface FundDetail {
  fund: FundMeta
  metrics: FundMetrics | null
  nav_history: NavPoint[]
}

function MetricTile({ label, value, sub, positive }: {
  label: string
  value: string | null
  sub?: string
  positive?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card p-4 sm:p-5">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">{label}</p>
      {value !== null ? (
        <p className={cn(
          "text-2xl sm:text-3xl font-bold metric-value leading-none tabular-nums",
          positive === true ? "text-emerald-600 dark:text-emerald-400"
          : positive === false ? "text-red-500 dark:text-red-400"
          : "text-foreground"
        )}>
          {value}
        </p>
      ) : (
        <p className="text-2xl font-bold text-muted-foreground/30">—</p>
      )}
      {sub && <p className="text-[11px] text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  )
}

function formatReturn(v: number | null, suffix = "%"): { str: string | null; pos: boolean | undefined } {
  if (v === null) return { str: null, pos: undefined }
  return { str: `${v >= 0 ? "+" : ""}${v.toFixed(1)}${suffix}`, pos: v >= 0 }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
}

// Thin the history to at most ~500 points for chart performance
function thinHistory(history: NavPoint[], maxPoints = 500): NavPoint[] {
  if (history.length <= maxPoints) return history
  const step = Math.ceil(history.length / maxPoints)
  const result: NavPoint[] = []
  for (let i = 0; i < history.length; i++) {
    if (i % step === 0 || i === history.length - 1) result.push(history[i])
  }
  return result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function NavTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-popover/95 border border-border/60 rounded-xl shadow-xl px-3.5 py-2.5 text-xs backdrop-blur-sm">
      <p className="text-muted-foreground mb-1">{label}</p>
      <p className="font-bold font-mono text-primary">₹{Number(payload[0]?.value).toFixed(4)}</p>
    </div>
  )
}

export default function FundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [data, setData] = useState<FundDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
      <div className="min-h-screen bg-muted/20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-4">
          <div className="h-8 w-32 rounded-xl bg-muted/30 animate-pulse" />
          <div className="h-24 rounded-2xl bg-muted/30 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-muted/30 animate-pulse" />)}
          </div>
          <div className="h-64 rounded-2xl bg-muted/30 animate-pulse" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-muted/20 flex items-center justify-center">
        <div className="text-center p-8">
          <p className="text-muted-foreground">{error ?? "Fund not found"}</p>
          <Link href="/funds" className="text-primary text-sm mt-2 inline-block hover:underline">← Back to Funds</Link>
        </div>
      </div>
    )
  }

  const { fund, metrics, nav_history } = data
  const chartData = thinHistory(nav_history)

  const r1y = formatReturn(metrics?.return_1y ?? null)
  const r3y = formatReturn(metrics?.return_3y ?? null)
  const r5y = formatReturn(metrics?.return_5y ?? null)
  const rSinceInception = formatReturn(metrics?.cagr_inception ?? null)

  const navMin = chartData.length ? Math.min(...chartData.map(d => d.nav)) : 0
  const navMax = chartData.length ? Math.max(...chartData.map(d => d.nav)) : 0
  const yDomain = [navMin * 0.97, navMax * 1.01]

  const overallPositive = (metrics?.cagr_inception ?? 0) >= 0

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">

        {/* Back + breadcrumb */}
        <div className="flex items-center gap-2">
          <Link
            href="/funds"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Funds
          </Link>
        </div>

        {/* Hero header */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
                  {fund.scheme_category}
                </p>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-snug">{fund.scheme_name}</h1>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5" />
                  {fund.fund_house}
                </p>
              </div>
              <div className="sm:text-right flex-shrink-0">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Current NAV</p>
                <p className="text-3xl sm:text-4xl font-bold metric-value tabular-nums">
                  ₹{fund.nav?.toFixed(4) ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">as of {formatDate(fund.nav_date)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Returns strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricTile
            label="Since Inception CAGR"
            value={rSinceInception.str}
            sub={`From ${formatDate(fund.inception_date)}`}
            positive={rSinceInception.pos}
          />
          <MetricTile label="1 Year Return" value={r1y.str} positive={r1y.pos} />
          <MetricTile label="3 Year CAGR" value={r3y.str} positive={r3y.pos} />
          <MetricTile label="5 Year CAGR" value={r5y.str} positive={r5y.pos} />
        </div>

        {/* Risk metrics — always rendered; shows — when data unavailable */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <MetricTile
            label="Total Return"
            value={metrics?.total_return != null ? `${metrics.total_return.toFixed(0)}%` : null}
            sub="Since inception"
            positive={overallPositive}
          />
          <MetricTile
            label="Volatility"
            value={metrics?.volatility != null ? `${metrics.volatility.toFixed(1)}%` : null}
            sub="Annualised std dev"
          />
          <MetricTile
            label="Max Drawdown"
            value={metrics?.max_drawdown != null ? `${metrics.max_drawdown.toFixed(1)}%` : null}
            sub="Worst peak-to-trough"
            positive={metrics?.max_drawdown != null ? false : undefined}
          />
        </div>

        {/* NAV Chart */}
        {chartData.length > 0 && (
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-center gap-3">
              <div className="p-2 rounded-xl bg-muted/60">
                <TrendingUp className="h-4 w-4 text-indigo-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold">NAV Price History</h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {chartData[0].date} – {chartData[chartData.length - 1].date}
                </p>
              </div>
            </div>
            <div className="px-2 pb-5">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.62 0.20 264)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="oklch(0.62 0.20 264)" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.4} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={d => d.slice(0, 4)}
                    interval="preserveStartEnd"
                    minTickGap={48}
                  />
                  <YAxis
                    domain={yDomain}
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={v => `₹${v >= 1000 ? `${(v/1000).toFixed(0)}k` : v.toFixed(0)}`}
                    width={52}
                  />
                  <Tooltip content={<NavTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="nav"
                    stroke="oklch(0.62 0.20 264)"
                    strokeWidth={2}
                    fill="url(#navGrad)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Fund details info card */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <div className="px-5 pt-5 pb-3 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-muted/60">
              <Activity className="h-4 w-4 text-teal-500" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Fund Details</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">Scheme information</p>
            </div>
          </div>
          <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { icon: Building2, label: "Fund House", value: fund.fund_house },
              { icon: Tag, label: "Category", value: fund.scheme_category },
              { icon: Shield, label: "Type", value: fund.scheme_type },
              { icon: Calendar, label: "Inception Date", value: formatDate(fund.inception_date) },
              { icon: Hash, label: "Scheme Code", value: String(fund.scheme_code) },
              { icon: TrendingDown, label: "Max Drawdown", value: metrics?.max_drawdown !== null ? `${metrics?.max_drawdown?.toFixed(2)}%` : "—" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-3 py-2.5 border-b border-border/30 last:border-0 sm:[&:nth-last-child(2)]:border-0">
                <div className="p-1.5 rounded-lg bg-muted/50 mt-0.5 flex-shrink-0">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</p>
                  <p className="text-sm font-medium mt-0.5">{value || "—"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <div className="rounded-xl border border-dashed border-border/50 p-4 bg-muted/10">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Disclosure</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            NAV data sourced from AMFI via mfapi.in. Returns are calculated from historical NAV data.
            Past performance is not indicative of future results. This is for informational purposes only and not investment advice.
          </p>
        </div>

      </div>
    </div>
  )
}
