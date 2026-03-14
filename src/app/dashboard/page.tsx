"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { PortfolioBuilder, Fund } from "@/components/portfolio-builder"
import { NavChart, DrawdownChart, RollingReturnChart, AllocationPieChart, FiscalYearChart, FiscalYearDetailCards } from "@/components/portfolio-charts"
import { MetricsGrid } from "@/components/metrics-grid"
import { Badge } from "@/components/ui/badge"
import { Info, Sparkles, ChevronDown, ChevronUp, CalendarDays, TrendingUp, BarChart3, PieChart, Activity } from "lucide-react"
import { Button } from "@/components/ui/button"

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
  "Calmar Ratio = CAGR ÷ Max Drawdown. Higher Calmar = better risk-adjusted compounding.",
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
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="py-14 px-6 flex flex-col items-center text-center gap-6">
        <div className="relative">
          <div className="h-14 w-14 rounded-full border-[3px] border-primary/15 border-t-primary animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary/40" />
          </div>
        </div>
        <div>
          <p className="text-base font-bold text-foreground">
            {isDefault ? "Loading model portfolio…" : "Computing risk & return metrics…"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">Crunching 20+ years of real NSE data</p>
        </div>
        <div
          className="w-full max-w-md"
          style={{ opacity: visible ? 1 : 0, transition: "opacity 0.4s ease" }}
        >
          <div className="rounded-2xl bg-muted/40 border border-border/40 px-5 py-4 text-left">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2">Did you know?</p>
            <p className="text-sm text-foreground/80 leading-relaxed">{LOADING_FACTS[factIdx]}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// Section card wrapper for chart sections
function SectionCard({ icon: Icon, iconColor, title, description, children, noPad = false }: {
  icon: React.ElementType
  iconColor: string
  title: string
  description: string
  children: React.ReactNode
  noPad?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl bg-muted/60`}>
            <Icon className={`h-4 w-4 ${iconColor}`} />
          </div>
          <div>
            <h3 className="text-sm font-bold">{title}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
      </div>
      <div className={noPad ? "" : "px-4 sm:px-5 pb-5"}>
        {children}
      </div>
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
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">

        {/* Page header */}
        <div className="pt-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Portfolio Builder
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Institutional-grade backtesting · 20+ years of real NSE data
          </p>
        </div>

        {/* Builder card — collapsible */}
        <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/20 transition-colors text-left"
            onClick={() => setBuilderOpen(o => !o)}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/30">
                <BarChart3 className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <p className="text-sm font-bold">Build Your Portfolio</p>
                {!builderOpen && allocations.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                    {allocations.map(a => `${a.fund.code} ${a.weight}%`).join(" · ")}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {allocations.length > 0 && (
                <Badge variant="secondary" className="text-[10px] font-bold">
                  {allocations.length} selected
                </Badge>
              )}
              {builderOpen
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </div>
          </button>

          {builderOpen && (
            <div className="border-t border-border/50 px-5 py-5">
              {fundsLoading ? (
                <div className="flex items-center justify-center py-12">
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
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {!result && !loading && (
          <div className="rounded-2xl border border-dashed border-border/70 bg-card">
            <div className="py-16 text-center px-6">
              <div className="inline-flex p-4 bg-muted rounded-full mb-4">
                <Info className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <h3 className="font-bold text-base mb-2">No Portfolio Yet</h3>
              <p className="text-muted-foreground text-sm max-w-xs mx-auto leading-relaxed">
                Select funds above, adjust weights, then click &ldquo;Generate Portfolio&rdquo; to see 20 years of backtest results.
              </p>
            </div>
          </div>
        )}

        {/* Loading state */}
        {loading && <LoadingFacts isDefault={isDefault} />}

        {/* Results */}
        {result && !loading && (
          <div ref={resultsRef} className="space-y-4">

            {/* Summary row */}
            <div className="flex flex-wrap gap-2 items-center pt-1">
              {isDefault && (
                <Badge className="text-[10px] gap-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-0 font-bold">
                  <Sparkles className="h-3 w-3" />
                  Default Model Portfolio
                </Badge>
              )}
              <Badge variant="secondary" className="text-[10px] font-bold">{allocations.length} Assets</Badge>
              <Badge variant="secondary" className="text-[10px] font-mono">
                {result.metrics.startDate.slice(0, 4)} – {result.metrics.endDate.slice(0, 4)}
              </Badge>
              <Badge variant="outline" className="text-[10px] font-bold">vs NIFTY 50</Badge>
            </div>

            {/* Metrics */}
            <MetricsGrid metrics={result.metrics} benchmark={result.benchmarkMetrics} />

            {/* Cumulative Growth */}
            <SectionCard
              icon={TrendingUp}
              iconColor="text-indigo-500"
              title="Cumulative Growth"
              description="₹100 invested at common start date vs NIFTY 50"
            >
              <NavChart data={result.portfolioNav} benchmarkData={result.benchmarkNav} />
            </SectionCard>

            {/* Drawdown */}
            <SectionCard
              icon={BarChart3}
              iconColor="text-red-500"
              title="Drawdown Risk"
              description="% decline from previous peak vs NIFTY 50"
            >
              <DrawdownChart data={result.drawdownSeries} benchmarkData={result.benchmarkDrawdown} />
            </SectionCard>

            {/* Rolling Returns */}
            {result.rollingReturns.length > 0 && (
              <SectionCard
                icon={Activity}
                iconColor="text-teal-500"
                title="3-Year Rolling CAGR"
                description="Annualised returns over any 756-day window vs NIFTY 50"
              >
                <RollingReturnChart data={result.rollingReturns} benchmarkData={result.benchmarkRolling} />
              </SectionCard>
            )}

            {/* FY Returns Chart */}
            {result.benchmarkNav && result.benchmarkNav.length > 0 && (
              <SectionCard
                icon={CalendarDays}
                iconColor="text-indigo-500"
                title="Fiscal Year Returns"
                description="Annual returns (Apr – Mar) vs NIFTY 50"
              >
                <FiscalYearChart
                  fundNav={result.portfolioNav}
                  benchmarkNav={result.benchmarkNav}
                  fundName="Portfolio"
                  benchmarkName="NIFTY 50"
                />
              </SectionCard>
            )}

            {/* FY Detail */}
            {result.fyTableData && (
              <SectionCard
                icon={CalendarDays}
                iconColor="text-teal-500"
                title="Fiscal Year Detail"
                description="NAV at FY start/end · Tap a row to expand individual funds"
              >
                <FiscalYearDetailCards
                  fyTableData={result.fyTableData}
                  funds={allocations.map(a => ({ id: a.fund.id, name: a.fund.name }))}
                />
              </SectionCard>
            )}

            {/* Allocation Pie */}
            <SectionCard
              icon={PieChart}
              iconColor="text-indigo-500"
              title="Portfolio Composition"
              description="Weight distribution across selected funds"
            >
              <AllocationPieChart
                data={allocations.map((a) => ({ name: a.fund.name, weight: a.weight }))}
              />
            </SectionCard>

            {/* Disclosure */}
            <div className="rounded-xl border border-dashed border-border/50 p-4 bg-muted/10">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Disclosure</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Past performance is not indicative of future results. All computations use adjusted NSE index NAV data (2005–present).
                CAGR is annualised compounded growth. Volatility is annualised standard deviation of daily returns.
                Max Drawdown represents the deepest peak-to-trough decline. Comparison vs Nifty 50 is for benchmarking purposes only.
              </p>
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
