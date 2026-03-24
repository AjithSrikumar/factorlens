"use client"

import { useState, useEffect, use } from "react"
import { ArrowLeft, TrendingUp, TrendingDown, Activity, Shield, BarChart3, Info, CalendarDays, ExternalLink, BookOpen } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MetricsGrid } from "@/components/metrics-grid"
import { NavChart, DrawdownChart, RollingReturnChart, FiscalYearChart, FiscalYearDetailCards } from "@/components/portfolio-charts"
import { computeAllMetrics, computeDrawdownSeries, computeRolling3YCAGR, computeFYRawRows } from "@/lib/calculations"
import type { FYRawRow } from "@/lib/calculations"
import Link from "next/link"
import { cn } from "@/lib/utils"

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

const CATEGORY_COLORS: Record<string, string> = {
  "Broad Market": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Momentum": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "Multi-Factor": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "Quality": "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  "Low Vol": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "Alpha": "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "Value": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "Global/Other": "bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300",
}

interface NavPoint { date: string; value: number }

interface TrackingFund {
  scheme_code:     number
  scheme_name:     string
  fund_house:      string
  scheme_category: string
  nav:             number | null
  nav_date:        string | null
  return_1y:       number | null
  return_3y:       number | null
  return_5y:       number | null
}

export default function FundDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [fund, setFund] = useState<Fund | null>(null)
  const [lastNavDate, setLastNavDate] = useState<string | null>(null)
  const [nav, setNav] = useState<NavPoint[]>([])
  const [benchmarkNav, setBenchmarkNav] = useState<NavPoint[]>([])
  const [rawFundNav, setRawFundNav] = useState<NavPoint[]>([])
  const [rawBenchmarkNav, setRawBenchmarkNav] = useState<NavPoint[]>([])
  const [metrics, setMetrics] = useState<any>(null)
  const [benchmarkMetrics, setBenchmarkMetrics] = useState<any>(null)
  const [drawdownSeries, setDrawdownSeries] = useState<any[]>([])
  const [benchmarkDrawdown, setBenchmarkDrawdown] = useState<any[]>([])
  const [rollingReturns, setRollingReturns] = useState<any[]>([])
  const [benchmarkRolling, setBenchmarkRolling] = useState<any[]>([])
  const [fyRows, setFyRows] = useState<FYRawRow[]>([])
  const [benchFyRows, setBenchFyRows] = useState<FYRawRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [trackingFunds, setTrackingFunds] = useState<TrackingFund[]>([])
  const [trackingLoading, setTrackingLoading] = useState(false)

  useEffect(() => {
    async function fetchData() {
      try {
        const [fundRes, benchmarkRes] = await Promise.all([
          fetch(`/api/funds/${id}`),
          fetch(`/api/funds/N50`),
        ])
        const fundData = await fundRes.json()
        const benchmarkData = await benchmarkRes.json()
        if (fundData.error) throw new Error(fundData.error)
        setFund(fundData.fund)

        // Fetch tracking mutual funds for this index
        if (fundData.fund?.name) {
          setTrackingLoading(true)
          fetch(`/api/mffunds/byindex?indexName=${encodeURIComponent(fundData.fund.name)}`)
            .then(r => r.json())
            .then((data: unknown) => {
              if (Array.isArray(data)) setTrackingFunds(data as TrackingFund[])
            })
            .finally(() => setTrackingLoading(false))
        }

        const fundNavRaw: NavPoint[] = fundData.nav
        const benchNavRaw: NavPoint[] = benchmarkData.nav ?? []
        setRawFundNav(fundNavRaw)
        setRawBenchmarkNav(benchNavRaw)

        // Track the latest NAV date so we can display "Data as of [date]"
        if (fundNavRaw.length > 0) {
          setLastNavDate(fundNavRaw[fundNavRaw.length - 1].date)
        }

        const today = new Date().toISOString().slice(0, 10)
        setFyRows(computeFYRawRows(fundNavRaw, today))
        setBenchFyRows(computeFYRawRows(benchNavRaw, today))

        if (fundNavRaw.length > 0 && benchNavRaw.length > 0) {
          const startDate = fundNavRaw[0].date
          const filteredBench = benchNavRaw.filter((n: NavPoint) => n.date >= startDate)
          if (filteredBench.length > 0) {
            const fundBase = fundNavRaw[0].value
            const benchBase = filteredBench[0].value
            const rebasedFund = fundNavRaw.map((n: NavPoint) => ({ date: n.date, value: (n.value / fundBase) * 100 }))
            const rebasedBench = filteredBench.map((n: NavPoint) => ({ date: n.date, value: (n.value / benchBase) * 100 }))
            setNav(rebasedFund)
            setBenchmarkNav(rebasedBench)
            const fundMetrics = computeAllMetrics(rebasedFund)
            const benchMetrics = computeAllMetrics(rebasedBench)
            setMetrics(fundMetrics)
            setBenchmarkMetrics(benchMetrics)
            setDrawdownSeries(computeDrawdownSeries(rebasedFund))
            setBenchmarkDrawdown(computeDrawdownSeries(rebasedBench))
            setRollingReturns(computeRolling3YCAGR(rebasedFund))
            setBenchmarkRolling(computeRolling3YCAGR(rebasedBench))
          }
        }
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
      </div>
    )
  }

  if (error || !fund) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <h2 className="text-xl font-bold mb-2">Fund Not Found</h2>
        <p className="text-muted-foreground mb-6 text-sm">{error || "The requested fund could not be located."}</p>
        <Link href="/rankings">
          <Button variant="outline" className="rounded-xl">← Back to Rankings</Button>
        </Link>
      </div>
    )
  }

  const excess = (((metrics?.cagr ?? fund.cagr) - (benchmarkMetrics?.cagr || 0)) * 100)

  return (
    <div className="min-h-screen bg-muted/20 pb-12">

      {/* ── Hero Header ── */}
      <div className="bg-card border-b border-border/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
          <Link
            href="/rankings"
            className="inline-flex items-center text-xs font-medium text-muted-foreground hover:text-primary mb-4 transition-colors gap-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Rankings
          </Link>

          <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
            {/* Left: fund identity */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge className="bg-primary/10 text-primary border-0 text-[11px] font-bold px-2.5">
                  Rank #{fund.final_rank}
                </Badge>
                <Badge variant="secondary" className={cn("text-[10px] font-bold", CATEGORY_COLORS[fund.category])}>
                  {fund.category}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">{fund.code}</Badge>
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight leading-tight">
                {fund.name}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mt-1.5">
                <p className="text-sm text-muted-foreground">
                  Inception: <span className="font-mono">{fund.inception_date}</span>
                </p>
                {lastNavDate && (() => {
                  const daysDiff = Math.floor((Date.now() - new Date(lastNavDate).getTime()) / 86_400_000)
                  const isStale = daysDiff > 4
                  return (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: isStale ? "rgba(197,39,30,.08)" : "rgba(10,124,78,.08)", color: isStale ? "#C5271E" : "#0A7C4E" }}>
                      <span style={{ width: 5, height: 5, borderRadius: "50%", background: isStale ? "#C5271E" : "#0A7C4E", display: "inline-block" }} />
                      {isStale ? `Stale · last updated ${lastNavDate}` : `Updated ${lastNavDate}`}
                    </span>
                  )
                })()}
              </div>
            </div>

            {/* Right: score + outperformance callout */}
            <div className="flex gap-3 flex-shrink-0">
              <div className="rounded-2xl border border-border/60 bg-background px-5 py-3.5 text-center min-w-[100px]">
                <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Score</p>
                <p className="text-2xl font-bold metric-value text-primary tabular-nums">{fund.score?.toFixed(1)}</p>
              </div>
              <div className={cn(
                "rounded-2xl border px-5 py-3.5 text-center min-w-[110px]",
                excess >= 0
                  ? "border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-950/20"
                  : "border-red-200/60 dark:border-red-800/40 bg-red-50/60 dark:bg-red-950/20"
              )}>
                <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest mb-1">vs Nifty 50</p>
                <p className={cn(
                  "text-2xl font-bold metric-value tabular-nums",
                  excess >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
                )}>
                  {excess >= 0 ? "+" : ""}{excess.toFixed(1)}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6">
        <div className="grid lg:grid-cols-3 gap-5 lg:gap-6">

          {/* Main column */}
          <div className="lg:col-span-2 space-y-5">

            {/* Metrics */}
            <MetricsGrid metrics={metrics} benchmark={benchmarkMetrics} />

            {/* Growth chart */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-sm">Growth Comparison</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Rebased to ₹100 from inception date</p>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 bg-indigo-500 rounded" />
                    {fund.code}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block w-3 h-0.5 bg-slate-400 rounded" style={{ borderTop: "2px dashed" }} />
                    NIFTY 50
                  </span>
                </div>
              </div>
              <div className="px-2 sm:px-4 pb-5">
                <NavChart data={nav} benchmarkData={benchmarkNav} name={fund.code} benchmarkName="NIFTY 50" />
              </div>
            </div>

            {/* Risk charts side by side */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <div className="px-5 pt-5 pb-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <TrendingDown className="h-4 w-4 text-red-500" />
                    <h3 className="font-bold text-sm">Drawdown Risk</h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Peak-to-trough decline %</p>
                </div>
                <div className="px-2 sm:px-4 pb-4">
                  <DrawdownChart data={drawdownSeries} benchmarkData={benchmarkDrawdown} name={fund.code} />
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <div className="px-5 pt-5 pb-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Activity className="h-4 w-4 text-teal-500" />
                    <h3 className="font-bold text-sm">Rolling 3Y CAGR</h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Any 756-day window vs N50</p>
                </div>
                <div className="px-2 sm:px-4 pb-4">
                  <RollingReturnChart data={rollingReturns} benchmarkData={benchmarkRolling} name={fund.code} />
                </div>
              </div>
            </div>

            {/* FY Returns Chart */}
            {rawBenchmarkNav.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <div className="px-5 pt-5 pb-2">
                  <div className="flex items-center gap-2 mb-0.5">
                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                    <h3 className="font-bold text-sm">Fiscal Year Returns vs NIFTY 50</h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Annual returns (Apr–Mar). NIFTY 50 shown for all years; {fund.code} from inception.
                  </p>
                </div>
                <div className="px-2 sm:px-5 pb-5">
                  <FiscalYearChart fundNav={rawFundNav} benchmarkNav={rawBenchmarkNav} fundName={fund.code} benchmarkName="NIFTY 50" />
                </div>
              </div>
            )}

            {/* FY Detail */}
            {fyRows.length > 0 && (
              <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <div className="px-5 pt-5 pb-3">
                  <div className="flex items-center gap-2 mb-0.5">
                    <CalendarDays className="h-4 w-4 text-teal-500" />
                    <h3 className="font-bold text-sm">Fiscal Year Detail</h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">NAV at FY start/end · {fund.code} return vs NIFTY 50</p>
                </div>
                <div className="px-3 sm:px-5 pb-5">
                  <FiscalYearDetailCards
                    fyTableData={{ portfolio: fyRows, funds: {}, benchmark: benchFyRows }}
                    funds={[]}
                    primaryLabel={fund.code}
                    benchmarkName="NIFTY 50"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">

            {/* Fund Characteristics */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-indigo-500" />
                  <h3 className="font-bold text-sm">Fund Characteristics</h3>
                </div>
              </div>
              <div className="px-5 py-5 space-y-5">
                <div>
                  <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest mb-2">Investment Strategy</p>
                  <p className="text-sm leading-relaxed text-foreground/80">
                    This is a <strong>{fund.category}</strong> index fund. {
                      fund.category === "Momentum" ? "Selects stocks with the highest recent price strength over 6–12 months, riding market trends." :
                      fund.category === "Quality" ? "Focuses on companies with high ROE, low debt, and consistent profit growth." :
                      fund.category === "Low Vol" ? "Selects the least volatile stocks to provide smoother returns during market turbulence." :
                      fund.category === "Value" ? "Targets undervalued companies with low price-to-book or price-to-earnings ratios." :
                      fund.category === "Alpha" ? "Seeks stocks with the highest abnormal returns relative to their beta exposure." :
                      fund.category === "Multi-Factor" ? "Combines Momentum, Quality, and Low Volatility for a balanced risk-adjusted profile." :
                      "Tracks a broad-market index to provide diversified exposure to the overall economy."
                    }
                  </p>
                </div>

                <div>
                  <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest mb-2">Nifty 50 Comparison</p>
                  <p className="text-sm leading-relaxed text-foreground/80">
                    Delivered annualised excess return of <strong className={excess >= 0 ? "text-emerald-600" : "text-red-500"}>
                      {excess >= 0 ? "+" : ""}{excess.toFixed(1)}%
                    </strong> vs Nifty 50.
                    Volatility is{" "}
                    <strong>{(metrics?.volatility ?? fund.volatility) > (benchmarkMetrics?.volatility || 0) ? "higher" : "lower"}</strong>{" "}
                    than benchmark. Sharpe ratio:{" "}
                    <strong className="font-mono">{(metrics?.sharpe ?? fund.sharpe_ratio).toFixed(2)}</strong>{" "}
                    vs <span className="font-mono">{benchmarkMetrics?.sharpe?.toFixed(2) || "—"}</span> for Nifty 50.
                  </p>
                </div>

                <div className="pt-4 border-t border-border/40 space-y-3">
                  {[
                    {
                      label: "Volatility Profile",
                      value: fund.volatility > 0.18 ? "High" : fund.volatility > 0.14 ? "Moderate" : "Low",
                      color: fund.volatility > 0.18 ? "text-red-500" : fund.volatility > 0.14 ? "text-amber-500" : "text-emerald-600"
                    },
                    {
                      label: "Return Efficiency",
                      value: (metrics?.sharpe ?? fund.sharpe_ratio) > 0.7 ? "Superior" : (metrics?.sharpe ?? fund.sharpe_ratio) > 0.4 ? "Good" : "Average",
                      color: (metrics?.sharpe ?? fund.sharpe_ratio) > 0.7 ? "text-emerald-600" : "text-foreground"
                    },
                    {
                      label: "Recovery Strength",
                      value: fund.calmar_ratio > 0.5 ? "Robust" : "Normal",
                      color: fund.calmar_ratio > 0.5 ? "text-emerald-600" : "text-foreground"
                    },
                  ].map(item => (
                    <div key={item.label} className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground font-medium">{item.label}</span>
                      <span className={cn("text-xs font-bold uppercase tracking-wide", item.color)}>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Why the Rank */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-border/40">
                <h3 className="font-bold text-sm">Why Rank #{fund.final_rank}?</h3>
              </div>
              <div className="px-5 py-5 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The composite score weighs risk-adjusted performance across multiple timeframes and metrics.
                </p>
                {[
                  { icon: TrendingUp, color: "text-teal-500 bg-teal-50 dark:bg-teal-950/30", title: "Return Consistency", desc: "High 3Y rolling median return" },
                  { icon: BarChart3, color: "text-indigo-500 bg-indigo-50 dark:bg-indigo-950/30", title: "Alpha Generation", desc: "Positive excess return vs Nifty 50" },
                  { icon: Shield, color: "text-red-500 bg-red-50 dark:bg-red-950/30", title: "Downside Protection", desc: "Controlled max drawdown exposure" },
                ].map(item => (
                  <div key={item.title} className="flex items-center gap-3">
                    <div className={cn("h-8 w-8 rounded-xl flex items-center justify-center flex-shrink-0", item.color.split(" ").slice(1).join(" "))}>
                      <item.icon className={cn("h-4 w-4", item.color.split(" ")[0])} />
                    </div>
                    <div>
                      <p className="text-xs font-bold">{item.title}</p>
                      <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tracking Mutual Funds */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-indigo-500" />
                  <h3 className="font-bold text-sm">Mutual Funds Tracking This Index</h3>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Index funds &amp; ETFs benchmarked to {fund.name}
                </p>
              </div>
              <div className="px-5 py-4">
                {trackingLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="h-10 rounded-xl bg-muted/60 animate-pulse" />
                    ))}
                  </div>
                ) : trackingFunds.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">
                    No mutual funds found tracking this index.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {trackingFunds.map(tf => (
                      <Link
                        key={tf.scheme_code}
                        href={`/funds/${tf.scheme_code}`}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl hover:bg-muted/50 transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold leading-tight text-foreground group-hover:text-primary transition-colors line-clamp-2">
                            {tf.scheme_name}
                          </p>
                          {tf.fund_house && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                              {tf.fund_house}
                            </p>
                          )}
                        </div>
                        <div className="flex-shrink-0 text-right">
                          {tf.return_3y !== null ? (
                            <span className={cn(
                              "text-[11px] font-bold tabular-nums",
                              tf.return_3y >= 0 ? "text-emerald-600" : "text-red-500"
                            )}>
                              {tf.return_3y >= 0 ? "+" : ""}{tf.return_3y.toFixed(1)}%
                              <span className="block text-[9px] font-normal text-muted-foreground">3Y</span>
                            </span>
                          ) : tf.return_1y !== null ? (
                            <span className={cn(
                              "text-[11px] font-bold tabular-nums",
                              tf.return_1y >= 0 ? "text-emerald-600" : "text-red-500"
                            )}>
                              {tf.return_1y >= 0 ? "+" : ""}{tf.return_1y.toFixed(1)}%
                              <span className="block text-[9px] font-normal text-muted-foreground">1Y</span>
                            </span>
                          ) : (
                            <ExternalLink className="h-3 w-3 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                          )}
                        </div>
                      </Link>
                    ))}
                    <div className="pt-1">
                      <Link
                        href={`/funds?search=${encodeURIComponent(fund.name.toLowerCase().replace(/^nifty\s*/i, ""))}`}
                        className="text-[10px] text-indigo-500 hover:text-indigo-700 font-medium flex items-center gap-1 px-3 py-1"
                      >
                        View all in Funds page →
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* CTA */}
            <Link href="/dashboard" className="block">
              <button className="w-full h-12 rounded-2xl bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white font-bold text-sm shadow-md shadow-indigo-900/20 transition-all active:scale-[0.99] flex items-center justify-center gap-2">
                Add to My Portfolio
                <ExternalLink className="h-4 w-4" />
              </button>
            </Link>

          </div>
        </div>
      </div>
    </div>
  )
}
