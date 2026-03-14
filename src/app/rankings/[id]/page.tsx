"use client"

import { useState, useEffect, use } from "react"
import { ArrowLeft, TrendingUp, TrendingDown, Activity, Shield, BarChart3, Info, CalendarDays } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MetricsGrid } from "@/components/metrics-grid"
import { NavChart, DrawdownChart, RollingReturnChart, FiscalYearChart, FiscalYearDetailCards } from "@/components/portfolio-charts"
import { computeAllMetrics, computeDrawdownSeries, computeRolling3YCAGR, computeFYRawRows } from "@/lib/calculations"
import type { FYRawRow } from "@/lib/calculations"
import Link from "next/link"

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

interface NavPoint {
  date: string
  value: number
}

export default function FundDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [fund, setFund] = useState<Fund | null>(null)
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

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch fund by ID, and Nifty 50 by code (N50) — avoids hardcoding a DB row ID
        const [fundRes, benchmarkRes] = await Promise.all([
          fetch(`/api/funds/${id}`),
          fetch(`/api/funds/N50`),
        ])

        const fundData = await fundRes.json()
        const benchmarkData = await benchmarkRes.json()

        if (fundData.error) throw new Error(fundData.error)

        setFund(fundData.fund)

        const fundNavRaw: NavPoint[] = fundData.nav
        const benchNavRaw: NavPoint[] = benchmarkData.nav ?? []

        // Store raw nav for the fiscal year chart (full benchmark history, no filtering)
        setRawFundNav(fundNavRaw)
        setRawBenchmarkNav(benchNavRaw)

        // Compute FY raw rows for detail cards
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
        <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    )
  }

  if (error || !fund) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <h2 className="text-xl font-bold mb-2">Fund Not Found</h2>
        <p className="text-muted-foreground mb-4">{error || "The requested fund could not be located."}</p>
        <Link href="/rankings">
          <Button variant="outline">Back to Rankings</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-12">
      <div className="bg-background border-b mb-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <Link href="/rankings" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-4 transition-colors">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Rankings
          </Link>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border-0">
                  Rank #{fund.final_rank}
                </Badge>
                <Badge variant="outline" className="font-mono text-[10px]">{fund.code}</Badge>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{fund.name}</h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                {fund.category} Index Fund • Inception: {fund.inception_date}
              </p>
            </div>

            <div className="bg-primary/5 rounded-xl p-4 border border-primary/10 flex items-center gap-4">
               <div className="text-right">
                 <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Composite Score</div>
                 <div className="text-2xl font-black text-primary">{fund.score?.toFixed(1)}</div>
               </div>
               <div className="h-10 w-px bg-primary/10" />
               <div className="text-right">
                 <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Outperformance</div>
                 <div className="text-2xl font-black text-teal-600">+{(((metrics?.cagr ?? fund.cagr) - (benchmarkMetrics?.cagr || 0)) * 100).toFixed(1)}%</div>
               </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* Main Metrics */}
            <MetricsGrid metrics={metrics} benchmark={benchmarkMetrics} />

            {/* Main Chart */}
            <Card className="shadow-sm overflow-hidden border-border/60">
              <CardHeader className="pb-0 pt-6 px-6">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold">Growth Comparison</CardTitle>
                    <CardDescription className="text-xs">Rebased to 100 from inception date</CardDescription>
                  </div>
                  <div className="flex items-center gap-3">
                     <div className="flex items-center gap-1.5">
                       <div className="h-2 w-2 rounded-full bg-indigo-600" />
                       <span className="text-[10px] font-medium uppercase">{fund.code}</span>
                     </div>
                     <div className="flex items-center gap-1.5">
                       <div className="h-2 w-2 rounded-full bg-slate-400" />
                       <span className="text-[10px] font-medium uppercase text-muted-foreground">NIFTY 50</span>
                     </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-1 sm:p-6">
                <NavChart data={nav} benchmarkData={benchmarkNav} name={fund.code} benchmarkName="NIFTY 50" />
              </CardContent>
            </Card>

            {/* Risk Analysis */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-red-500" /> Drawdown Risk
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <DrawdownChart data={drawdownSeries} benchmarkData={benchmarkDrawdown} name={fund.code} />
                </CardContent>
              </Card>
              <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <Activity className="h-4 w-4 text-teal-500" /> Rolling 3Y CAGR
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RollingReturnChart data={rollingReturns} benchmarkData={benchmarkRolling} name={fund.code} />
                </CardContent>
              </Card>
            </div>

            {/* Fiscal Year Returns Chart */}
            {rawBenchmarkNav.length > 0 && (
              <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-indigo-500" /> Fiscal Year Returns vs NIFTY 50
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Annual returns (Apr – Mar) since FY2006. NIFTY 50 shown for all years; {fund.code} from inception.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6">
                  <FiscalYearChart
                    fundNav={rawFundNav}
                    benchmarkNav={rawBenchmarkNav}
                    fundName={fund.code}
                    benchmarkName="NIFTY 50"
                  />
                </CardContent>
              </Card>
            )}

            {/* Fiscal Year Detail Cards */}
            {fyRows.length > 0 && (
              <Card className="shadow-sm border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-teal-500" /> Fiscal Year Detail
                  </CardTitle>
                  <CardDescription className="text-xs">
                    NAV at FY start/end with {fund.code} return vs NIFTY 50. Outperformance shown as badge.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-2 sm:px-6 pb-4">
                  <FiscalYearDetailCards
                    fyTableData={{ portfolio: fyRows, funds: {}, benchmark: benchFyRows }}
                    funds={[]}
                    primaryLabel={fund.code}
                    benchmarkName="NIFTY 50"
                  />
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="shadow-sm border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-900/10">
              <CardHeader>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Info className="h-4 w-4 text-indigo-600" /> Fund Characteristics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Investment Strategy</p>
                  <p className="text-sm leading-relaxed font-medium">
                    This is a <strong>{fund.category}</strong> index fund. {
                      fund.category === "Momentum" ? "It selects stocks that have shown the highest price strength over the last 6-12 months, aiming to ride the trend." :
                      fund.category === "Quality" ? "It focuses on companies with high return on equity, low debt, and consistent profit growth." :
                      fund.category === "Low Vol" ? "It selects the least volatile stocks in the market to provide smoother returns during market turbulence." :
                      fund.category === "Value" ? "It targets undervalued companies with low price-to-book or price-to-earnings ratios." :
                      fund.category === "Alpha" ? "It seeks stocks that have generated the highest abnormal returns relative to their beta." :
                      fund.category === "Multi-Factor" ? "It combines multiple factors like Momentum, Quality, and Low Volatility to provide a balanced risk-adjusted profile." :
                      "It tracks a broad-market index to provide exposure to the overall economy."
                    }
                  </p>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">Nifty 50 Comparison</p>
                  <p className="text-sm leading-relaxed font-medium">
                    Compared to the Nifty 50 benchmark, this fund has delivered an annualized excess return of <strong>{(((metrics?.cagr ?? fund.cagr) - (benchmarkMetrics?.cagr || 0)) * 100).toFixed(1)}%</strong>.
                    Its volatility is <strong>{(metrics?.volatility ?? fund.volatility) > (benchmarkMetrics?.volatility || 0) ? "higher" : "lower"}</strong> than the benchmark, resulting in a Sharpe ratio of <strong>{(metrics?.sharpe ?? fund.sharpe_ratio).toFixed(2)}</strong> vs {benchmarkMetrics?.sharpe?.toFixed(2) || "0.00"} for Nifty 50.
                  </p>
                </div>

                <div className="pt-4 border-t border-indigo-100/50 dark:border-indigo-900/50 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-bold">Volatility Profile</span>
                    <Badge variant="secondary" className="text-[10px] font-black uppercase">
                      {fund.volatility > 0.18 ? "High" : fund.volatility > 0.14 ? "Moderate" : "Low"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-bold">Return Efficiency</span>
                    <Badge variant="secondary" className="text-[10px] font-black uppercase">
                      {(metrics?.sharpe ?? fund.sharpe_ratio) > 0.7 ? "Superior" : (metrics?.sharpe ?? fund.sharpe_ratio) > 0.4 ? "Good" : "Average"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground font-bold">Recovery Strength</span>
                    <Badge variant="secondary" className="text-[10px] font-black uppercase">
                      {fund.calmar_ratio > 0.5 ? "Robust" : "Normal"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-border/60">
              <CardHeader>
                <CardTitle className="text-base font-bold">Why the Rank?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  The rank of <strong>#{fund.final_rank}</strong> is calculated based on its risk-adjusted performance across multiple timeframes.
                </p>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-teal-50 dark:bg-teal-900/30 flex items-center justify-center text-teal-600">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Return Consistency</p>
                      <p className="text-[10px] text-muted-foreground">High 3Y rolling median return</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
                      <BarChart3 className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Alpha Generation</p>
                      <p className="text-[10px] text-muted-foreground">Positive excess return vs Nifty 50</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-900/30 flex items-center justify-center text-red-600">
                      <Shield className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold">Downside Protection</p>
                      <p className="text-[10px] text-muted-foreground">Controlled max drawdown exposure</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Link href="/dashboard" className="block">
              <Button className="w-full bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white border-0 py-6 text-sm font-bold shadow-lg group">
                Add to My Portfolio
                <ArrowLeft className="ml-2 h-4 w-4 rotate-180 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
