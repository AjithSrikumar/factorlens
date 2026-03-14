"use client"

import { useState, useEffect, useCallback } from "react"
import { PortfolioBuilder, Fund } from "@/components/portfolio-builder"
import { NavChart, DrawdownChart, RollingReturnChart, AllocationPieChart, FiscalYearChart, FiscalYearTable } from "@/components/portfolio-charts"
import { MetricsGrid } from "@/components/metrics-grid"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Info, Sparkles, SlidersHorizontal, CalendarDays } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"

// Default model portfolio fund IDs (equi-weighted)
const DEFAULT_FUND_IDS = [26, 9, 19, 28, 27]

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

export default function DashboardPage() {
  const [funds, setFunds] = useState<Fund[]>([])
  const [allocations, setAllocations] = useState<FundAllocation[]>([])
  const [result, setResult] = useState<PortfolioResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [fundsLoading, setFundsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    fetch("/api/funds")
      .then((r) => r.json())
      .then((data: Fund[]) => {
        setFunds(data)
        setFundsLoading(false)
        // Auto-load requested funds at equal weight
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
      const body = {
        allocations: allocations.map((a) => ({ fundId: a.fund.id, weight: a.weight })),
      }
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to compute")
      setResult(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [allocations])

  // Auto-generate the default reference portfolio once funds are loaded
  useEffect(() => {
    if (isDefault && allocations.length === DEFAULT_FUND_IDS.length && !result) {
      handleGenerate()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDefault, allocations.length])

  // Clear the default flag when the user edits allocations manually
  const handleAllocationsChange = useCallback((next: FundAllocation[]) => {
    setAllocations(next)
    setIsDefault(false)
  }, [])

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {/* Header with Mobile Filter Toggle */}
          <div className="flex flex-col mb-6 gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">Portfolio Builder</h1>
                <p className="text-muted-foreground mt-1.5 text-sm sm:text-base font-medium">
                  Institutional-grade backtesting with 20+ years of NSE data.
                </p>
              </div>
            </div>
            
            <div className="lg:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="lg" className="w-full h-14 gap-3 bg-gradient-to-r from-indigo-600 via-indigo-500 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white border-0 shadow-xl font-black text-base rounded-2xl group">
                    <SlidersHorizontal className="h-5 w-5 group-hover:rotate-180 transition-transform duration-500" />
                    Configure Your Portfolio
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[94vh] overflow-y-auto rounded-t-[2.5rem] border-t-primary/20 p-6 pt-2">
                  <div className="w-12 h-1.5 bg-muted rounded-full mx-auto my-4" />
                  <SheetHeader className="mb-6 text-left">
                    <SheetTitle className="text-2xl font-black">Customize Strategy</SheetTitle>
                    <SheetDescription className="text-sm font-medium">
                      Select up to 10 funds and adjust weights. Total must be 100%.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="py-2">
                    {fundsLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
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
                </SheetContent>
              </Sheet>
            </div>
          </div>


        <div className="grid lg:grid-cols-4 gap-8">
          {/* Left panel: Builder (Desktop only) */}
          <div className="hidden lg:block lg:col-span-1">
            <Card className="sticky top-24">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold">Build Your Portfolio</CardTitle>
                <CardDescription className="text-xs">
                  Select up to 10 funds. Weights must sum to 100%.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {fundsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
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
              </CardContent>
            </Card>
          </div>

          {/* Right panel: Results */}
          <div className="lg:col-span-3 space-y-8">
            {error && (
              <Card className="border-destructive/50 bg-destructive/5">
                <CardContent className="p-4 text-sm text-destructive">{error}</CardContent>
              </Card>
            )}

            {!result && !loading && (
              <Card className="border-dashed">
                <CardContent className="p-16 text-center">
                  <div className="inline-flex p-4 bg-primary/5 rounded-full mb-4">
                    <Info className="h-8 w-8 text-primary/40" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">No Portfolio Yet</h3>
                  <p className="text-muted-foreground text-sm max-w-sm mx-auto leading-relaxed">
                      Select funds, adjust your weights, and click &ldquo;Generate Portfolio&rdquo; to see results.
                  </p>
                </CardContent>
              </Card>
            )}

            {loading && (
                <Card>
                  <CardContent className="p-16 text-center">
                    <div className="h-8 w-8 rounded-full border-3 border-primary/20 border-t-primary animate-spin mx-auto mb-4" />
                    <p className="text-muted-foreground text-sm">
                      {isDefault
                        ? "Loading model portfolio…"
                        : "Computing risk & return metrics…"}
                    </p>
                  </CardContent>
                </Card>
              )}

            {result && !loading && (
              <>
                  {/* Summary header */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                    <div className="flex flex-wrap gap-2 items-center">
                      {isDefault && (
                        <Badge className="text-xs gap-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-0">
                          <Sparkles className="h-3 w-3" />
                          Default Model Portfolio
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-xs">
                        {allocations.length} Assets
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {result.metrics.startDate.slice(0, 4)} — {result.metrics.endDate.slice(0, 4)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">VS NIFTY 50</span>
                    </div>
                  </div>

                  {/* Metrics */}
                  <MetricsGrid metrics={result.metrics} benchmark={result.benchmarkMetrics} />

                  {/* Charts */}
                  <Tabs defaultValue="nav" className="space-y-6">
                    <div className="bg-background/50 p-1 rounded-lg border inline-flex">
                      <TabsList className="bg-transparent border-0 h-9">
                        <TabsTrigger value="nav" className="text-xs h-7">Growth</TabsTrigger>
                        <TabsTrigger value="drawdown" className="text-xs h-7">Drawdown</TabsTrigger>
                        <TabsTrigger value="rolling" className="text-xs h-7">Rolling</TabsTrigger>
                        <TabsTrigger value="fiscal" className="text-xs h-7">Fiscal Year</TabsTrigger>
                        <TabsTrigger value="fy-table" className="text-xs h-7">FY Table</TabsTrigger>
                        <TabsTrigger value="allocation" className="text-xs h-7">Weights</TabsTrigger>
                      </TabsList>
                    </div>

                    <TabsContent value="nav" className="m-0">
                      <Card className="overflow-hidden border-border/60">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold">Cumulative Growth</CardTitle>
                          <CardDescription className="text-xs">₹100 invested at common start date</CardDescription>
                        </CardHeader>
                        <CardContent className="px-1 sm:px-6">
                          <NavChart data={result.portfolioNav} benchmarkData={result.benchmarkNav} />
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="drawdown" className="m-0">
                      <Card className="overflow-hidden border-border/60">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold">Drawdown Risk</CardTitle>
                          <CardDescription className="text-xs">% decline from previous peak</CardDescription>
                        </CardHeader>
                        <CardContent className="px-1 sm:px-6">
                          <DrawdownChart data={result.drawdownSeries} benchmarkData={result.benchmarkDrawdown} />
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="rolling" className="m-0">
                      <Card className="overflow-hidden border-border/60">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold">3-Year Rolling CAGR</CardTitle>
                          <CardDescription className="text-xs">Rolling annualized returns over 756 days</CardDescription>
                        </CardHeader>
                        <CardContent className="px-1 sm:px-6">
                          {result.rollingReturns.length > 0 ? (
                            <RollingReturnChart data={result.rollingReturns} benchmarkData={result.benchmarkRolling} />
                          ) : (
                            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                              Insufficient data for rolling analysis.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="fiscal" className="m-0">
                      <Card className="overflow-hidden border-border/60">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-indigo-500" /> Fiscal Year Returns vs NIFTY 50
                          </CardTitle>
                          <CardDescription className="text-xs">Annual returns (Apr – Mar) since portfolio inception</CardDescription>
                        </CardHeader>
                        <CardContent className="px-2 sm:px-6">
                          {result.benchmarkNav && result.benchmarkNav.length > 0 ? (
                            <FiscalYearChart
                              fundNav={result.portfolioNav}
                              benchmarkNav={result.benchmarkNav}
                              fundName="Portfolio"
                              benchmarkName="NIFTY 50"
                            />
                          ) : (
                            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                              Benchmark data unavailable.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="fy-table" className="m-0">
                      <Card className="overflow-hidden border-border/60">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <CalendarDays className="h-4 w-4 text-indigo-500" /> Fiscal Year Detail Table
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Raw index values at FY start/end. Click any row to expand individual index data.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="px-2 sm:px-4 pb-4">
                          {result.fyTableData ? (
                            <FiscalYearTable
                              fyTableData={result.fyTableData}
                              funds={allocations.map(a => ({ id: a.fund.id, name: a.fund.name }))}
                            />
                          ) : (
                            <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
                              No fiscal year data available.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="allocation" className="m-0">
                      <Card className="overflow-hidden border-border/60">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-semibold">Portfolio Composition</CardTitle>
                          <CardDescription className="text-xs">Weight distribution across selected funds</CardDescription>
                        </CardHeader>
                        <CardContent className="px-1 sm:px-6">
                          <AllocationPieChart
                            data={allocations.map((a) => ({
                              name: a.fund.name,
                              weight: a.weight,
                            }))}
                          />
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </Tabs>

                  {/* Footer note */}
                  <div className="rounded-xl border border-dashed p-6 bg-muted/20">
                    <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Disclosure</h4>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      Past performance is not indicative of future results. All computations use adjusted NSE index NAV data (2005–2026). CAGR is annualised compounded growth. Volatility is annualised standard deviation of daily returns. Max Drawdown represents the deepest peak-to-trough decline. Comparison vs Nifty 50 is provided for benchmarking purposes.
                    </p>
                  </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
