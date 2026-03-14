"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { PortfolioBuilder, Fund } from "@/components/portfolio-builder"
import { NavChart, DrawdownChart, RollingReturnChart, AllocationPieChart, FiscalYearChart, FiscalYearTable } from "@/components/portfolio-charts"
import { MetricsGrid } from "@/components/metrics-grid"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Info, Sparkles, ChevronDown, ChevronUp, CalendarDays, TrendingUp, BarChart3, PieChart } from "lucide-react"
import { Button } from "@/components/ui/button"

// Default model portfolio fund IDs (equi-weighted)
const DEFAULT_FUND_IDS = [26, 9, 19, 28, 27]

const LOADING_FACTS = [
  "The Nifty 50 TRI has compounded at ~15% CAGR since 2006 — ₹100 became ₹1,100+.",
  "Factor investing strategies have historically added 2–4% alpha vs broad market over long cycles.",
  "Momentum funds tend to shine in trending markets; Quality funds protect capital in downturns.",
  "A diversified multi-factor portfolio can reduce peak drawdown while preserving strong CAGR.",
  "The COVID crash of 2020 saw Nifty 50 fall 38% in just 40 days — factor portfolios varied widely.",
  "Rolling 3-year CAGR is a more reliable performance gauge than point-to-point returns.",
  "Low-volatility funds have historically outperformed in high-inflation, high-rate environments.",
  "NSE launched its first factor index (Nifty Quality 30) in 2012 — the category has grown 10×.",
  "Calmar Ratio = CAGR ÷ Max Drawdown. A higher Calmar means better risk-adjusted compounding.",
  "Sortino Ratio penalises only downside volatility, making it a sharper lens than Sharpe for equity.",
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
    <Card className="border-border/60">
      <CardContent className="py-12 px-6 flex flex-col items-center text-center gap-6">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-[3px] border-primary/20 border-t-primary animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary/40" />
          </div>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground mb-1">
            {isDefault ? "Loading model portfolio…" : "Computing risk & return metrics…"}
          </p>
          <p className="text-xs text-muted-foreground">Crunching 20+ years of NSE data</p>
        </div>
        <div
          className="max-w-sm"
          style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}
        >
          <div className="rounded-xl bg-muted/50 border border-border/40 px-5 py-4">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Did you know?</p>
            <p className="text-sm text-foreground/80 leading-relaxed">{LOADING_FACTS[factIdx]}</p>
          </div>
        </div>
      </CardContent>
    </Card>
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
  const [builderOpen, setBuilderOpen] = useState(true)
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

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Portfolio Builder
          </h1>
          <p className="text-muted-foreground mt-1 text-sm font-medium">
            Institutional-grade backtesting with 20+ years of NSE data.
          </p>
        </div>

        {/* Portfolio Builder — always at top, collapsible */}
        <Card className="border-border/60 overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors text-left"
            onClick={() => setBuilderOpen(o => !o)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/30">
                <BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-bold">Build Your Portfolio</p>
                {!builderOpen && allocations.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {allocations.length} fund{allocations.length !== 1 ? "s" : ""} · {allocations.map(a => `${a.fund.code} ${a.weight}%`).join(", ")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {allocations.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{allocations.length} selected</Badge>
              )}
              {builderOpen
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>

          {builderOpen && (
            <div className="border-t border-border/60 px-5 py-5">
              {fundsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-7 w-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
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
        </Card>

        {/* Error */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <div className="inline-flex p-4 bg-primary/5 rounded-full mb-4">
                <Info className="h-8 w-8 text-primary/40" />
              </div>
              <h3 className="font-semibold text-lg mb-2">No Portfolio Yet</h3>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
                Select funds, adjust weights, then click &ldquo;Generate Portfolio&rdquo; above to see results.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {loading && <LoadingFacts isDefault={isDefault} />}

        {/* Results */}
        {result && !loading && (
          <div ref={resultsRef} className="space-y-5">

            {/* Summary badges */}
            <div className="flex flex-wrap gap-2 items-center">
              {isDefault && (
                <Badge className="text-xs gap-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-0">
                  <Sparkles className="h-3 w-3" />
                  Default Model Portfolio
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs">{allocations.length} Assets</Badge>
              <Badge variant="secondary" className="text-xs">
                {result.metrics.startDate.slice(0, 4)} — {result.metrics.endDate.slice(0, 4)}
              </Badge>
              <Badge variant="outline" className="text-xs">vs NIFTY 50</Badge>
            </div>

            {/* Metrics grid */}
            <MetricsGrid metrics={result.metrics} benchmark={result.benchmarkMetrics} />

            {/* Cumulative Growth */}
            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-indigo-500" />
                  Cumulative Growth
                </CardTitle>
                <CardDescription className="text-xs">₹100 invested at common start date vs NIFTY 50</CardDescription>
              </CardHeader>
              <CardContent className="px-1 sm:px-4 pb-4">
                <NavChart data={result.portfolioNav} benchmarkData={result.benchmarkNav} />
              </CardContent>
            </Card>

            {/* Drawdown */}
            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-red-500" />
                  Drawdown Risk
                </CardTitle>
                <CardDescription className="text-xs">% decline from previous peak vs NIFTY 50</CardDescription>
              </CardHeader>
              <CardContent className="px-1 sm:px-4 pb-4">
                <DrawdownChart data={result.drawdownSeries} benchmarkData={result.benchmarkDrawdown} />
              </CardContent>
            </Card>

            {/* Rolling Returns */}
            {result.rollingReturns.length > 0 && (
              <Card className="border-border/60">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold">3-Year Rolling CAGR</CardTitle>
                  <CardDescription className="text-xs">Annualised returns over any 756-day window vs NIFTY 50</CardDescription>
                </CardHeader>
                <CardContent className="px-1 sm:px-4 pb-4">
                  <RollingReturnChart data={result.rollingReturns} benchmarkData={result.benchmarkRolling} />
                </CardContent>
              </Card>
            )}

            {/* FY Bar Chart */}
            {result.benchmarkNav && result.benchmarkNav.length > 0 && (
              <Card className="border-border/60">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                    Fiscal Year Returns
                  </CardTitle>
                  <CardDescription className="text-xs">Annual returns (Apr – Mar) vs NIFTY 50</CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-4 pb-4">
                  <FiscalYearChart
                    fundNav={result.portfolioNav}
                    benchmarkNav={result.benchmarkNav}
                    fundName="Portfolio"
                    benchmarkName="NIFTY 50"
                  />
                </CardContent>
              </Card>
            )}

            {/* FY Detail Table */}
            {result.fyTableData && (
              <Card className="border-border/60">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                    Fiscal Year Detail
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Portfolio NAV at FY start/end with return vs NIFTY 50. Tap a row to expand individual funds.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0 sm:px-2 pb-4">
                  <FiscalYearTable
                    fyTableData={result.fyTableData}
                    funds={allocations.map(a => ({ id: a.fund.id, name: a.fund.name }))}
                  />
                </CardContent>
              </Card>
            )}

            {/* Allocation Pie */}
            <Card className="border-border/60">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <PieChart className="h-4 w-4 text-indigo-500" />
                  Portfolio Composition
                </CardTitle>
                <CardDescription className="text-xs">Weight distribution across selected funds</CardDescription>
              </CardHeader>
              <CardContent className="px-1 sm:px-4 pb-4">
                <AllocationPieChart
                  data={allocations.map((a) => ({ name: a.fund.name, weight: a.weight }))}
                />
              </CardContent>
            </Card>

            {/* Disclosure */}
            <div className="rounded-xl border border-dashed p-5 bg-muted/20">
              <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Disclosure</h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Past performance is not indicative of future results. All computations use adjusted NSE index NAV data (2005–present).
                CAGR is annualised compounded growth. Volatility is annualised standard deviation of daily returns.
                Max Drawdown represents the deepest peak-to-trough decline. Comparison vs Nifty 50 is for benchmarking only.
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
