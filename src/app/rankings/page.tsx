"use client"

import { useState, useEffect, useMemo } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { NavChart, DrawdownChart, FiscalYearTable } from "@/components/portfolio-charts"

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

const CATEGORY_COLORS: Record<string, string> = {
  "Broad Market": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "Momentum": "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  "Multi-Factor": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "Quality": "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  "Low Vol": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  "Alpha": "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  "Value": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "Global/Other": "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300",
}

function pct(v: number | null) {
  if (v == null) return "—"
  return `${(v * 100).toFixed(2)}%`
}

function fixed(v: number | null, d = 2) {
  if (v == null) return "—"
  return v.toFixed(d)
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

  // Fetch chart data when a fund is expanded
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

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc")
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const handleToggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id)
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />
  }

  function FundCharts({ fund }: { fund: Fund }) {
    const data = chartCache[fund.id]
    if (chartLoading && expandedId === fund.id && !data) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="h-7 w-7 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <span className="ml-3 text-sm text-muted-foreground">Loading charts…</span>
        </div>
      )
    }
    if (!data) return null
    return (
      <div className="space-y-6 pt-2">
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold">Cumulative Growth</p>
              <p className="text-xs text-muted-foreground">₹100 invested at inception vs Nifty 50</p>
            </div>
            <Badge variant="secondary" className="text-[10px] gap-1">
              <span className="inline-block w-2 h-0.5 bg-slate-400 mr-0.5" />
              Nifty 50
            </Badge>
          </div>
          <NavChart
            data={data.portfolioNav}
            benchmarkData={data.benchmarkNav}
            name={fund.code}
            benchmarkName="Nifty 50"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-sm font-semibold">Drawdown Risk</p>
              <p className="text-xs text-muted-foreground">% decline from previous peak vs Nifty 50</p>
            </div>
          </div>
          <DrawdownChart
            data={data.drawdownSeries}
            benchmarkData={data.benchmarkDrawdown}
            name={fund.code}
            benchmarkName="Nifty 50"
          />
        </div>
        {data.fyTableData && (
          <div>
            <p className="text-sm font-semibold mb-1">Fiscal Year Returns</p>
            <p className="text-xs text-muted-foreground mb-3">Annual returns (Apr – Mar) with NIFTY 50 comparison</p>
            <FiscalYearTable
              fyTableData={data.fyTableData}
              funds={[]}
              benchmarkName="NIFTY 50"
            />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Fund Rankings</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              All 28 NSE factor & broad-market funds ranked by composite score.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/dashboard" className="w-full sm:w-auto">
              <Button size="sm" className="w-full bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white border-0 shadow-md">
                Build Portfolio
              </Button>
            </Link>
          </div>
        </div>

        {/* Score explanation */}
        <Card className="mb-6 bg-indigo-50 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800 shadow-sm overflow-hidden">
          <CardContent className="p-4 flex gap-4 items-start">
            <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <span className="text-indigo-600 dark:text-indigo-400 font-bold text-lg">!</span>
            </div>
            <p className="text-xs sm:text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed">
              <strong>Composite Score</strong> weights multiple metrics: CAGR, 3-year rolling returns, Nifty 50 outperformance, excess returns, Sharpe ratio, and drawdown protection.
              Rank 1 is the highest-scoring fund. <strong>Click any row</strong> to compare Cumulative Growth & Drawdown vs Nifty 50.
            </p>
          </CardContent>
        </Card>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search funds..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-background border-border/60"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar sm:pb-0 sm:flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[10px] sm:text-xs font-medium transition-colors whitespace-nowrap border",
                  catFilter === cat
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground border-border/60"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop View (Table) */}
        <div className="hidden md:block">
          <Card className="shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-24">
                  <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        {[
                          { key: "final_rank" as SortKey, label: "Rank" },
                          { key: "name" as SortKey, label: "Fund Name" },
                          { key: "category" as SortKey, label: "Category" },
                          { key: "cagr" as SortKey, label: "CAGR" },
                          { key: "avg_3y_rolling_return" as SortKey, label: "Avg 3Y" },
                          { key: "sharpe_ratio" as SortKey, label: "Sharpe" },
                          { key: "max_drawdown" as SortKey, label: "Max DD" },
                          { key: "volatility" as SortKey, label: "Volatility" },
                          { key: "score" as SortKey, label: "Score" },
                        ].map((col) => (
                          <th
                            key={col.key}
                            className="px-4 py-3 text-left font-medium text-muted-foreground text-[10px] uppercase tracking-wider cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                            onClick={() => handleSort(col.key)}
                          >
                            <span className="flex items-center gap-1">
                              {col.label}
                              <SortIcon col={col.key} />
                            </span>
                          </th>
                        ))}
                        <th className="px-4 py-3 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((fund, i) => (
                        <>
                          <tr
                            key={fund.id}
                            className={cn(
                              "border-b transition-colors group cursor-pointer",
                              expandedId === fund.id ? "bg-indigo-50/60 dark:bg-indigo-950/20 border-indigo-200 dark:border-indigo-800" : i % 2 === 0 ? "bg-background hover:bg-muted/30" : "bg-muted/5 hover:bg-muted/30"
                            )}
                            onClick={() => handleToggleExpand(fund.id)}
                          >
                            <td className="px-4 py-4 font-bold text-center">
                              <span className={cn(
                                "inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold",
                                fund.final_rank === 1 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800" :
                                fund.final_rank === 2 ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700" :
                                fund.final_rank === 3 ? "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300 ring-1 ring-orange-200 dark:ring-orange-800" :
                                "bg-muted text-muted-foreground"
                              )}>
                                {fund.final_rank}
                              </span>
                            </td>
                            <td className="px-4 py-4 font-medium max-w-xs">
                              <Link
                                href={`/rankings/${fund.id}`}
                                className="hover:text-primary transition-colors flex items-center gap-1.5"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <span className="truncate">{fund.name}</span>
                                <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </Link>
                              <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{fund.code}</div>
                            </td>
                            <td className="px-4 py-4">
                              <Badge variant="secondary" className={cn("text-[10px] whitespace-nowrap", CATEGORY_COLORS[fund.category])}>
                                {fund.category}
                              </Badge>
                            </td>
                            <td className={cn("px-4 py-4 tabular-nums whitespace-nowrap", fund.cagr > 0.18 ? "text-teal-600 font-semibold" : "text-foreground")}>
                              {pct(fund.cagr)}
                              {nifty50 && fund.id !== nifty50.id && (
                                <div className={cn("text-[9px] font-bold", fund.cagr > nifty50.cagr ? "text-teal-600" : "text-red-400")}>
                                  {fund.cagr > nifty50.cagr ? "+" : ""}{((fund.cagr - nifty50.cagr) * 100).toFixed(1)}% vs N50
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 tabular-nums whitespace-nowrap text-muted-foreground">
                              {pct(fund.avg_3y_rolling_return)}
                            </td>
                            <td className={cn("px-4 py-4 tabular-nums whitespace-nowrap", fund.sharpe_ratio > 0.6 ? "text-teal-600 font-semibold" : "text-foreground")}>
                              {fixed(fund.sharpe_ratio)}
                              {nifty50 && fund.id !== nifty50.id && (
                                <div className={cn("text-[9px] font-bold", fund.sharpe_ratio > nifty50.sharpe_ratio ? "text-teal-600" : "text-red-400")}>
                                  {fund.sharpe_ratio > nifty50.sharpe_ratio ? "+" : ""}{(fund.sharpe_ratio - nifty50.sharpe_ratio).toFixed(2)} vs N50
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-4 tabular-nums whitespace-nowrap text-red-500">
                              {pct(fund.max_drawdown)}
                            </td>
                            <td className="px-4 py-4 tabular-nums whitespace-nowrap text-muted-foreground">
                              {pct(fund.volatility)}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-muted rounded-full min-w-[48px]">
                                  <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-teal-500 rounded-full shadow-sm"
                                    style={{ width: `${Math.min((fund.score / 50) * 100, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-foreground tabular-nums">{fund.score?.toFixed(1)}</span>
                              </div>
                            </td>
                            <td className="px-4 py-4 text-muted-foreground">
                              {expandedId === fund.id
                                ? <ChevronUp className="h-4 w-4" />
                                : <ChevronDown className="h-4 w-4" />
                              }
                            </td>
                          </tr>
                          {expandedId === fund.id && (
                            <tr key={`${fund.id}-charts`} className="border-b bg-indigo-50/40 dark:bg-indigo-950/10">
                              <td colSpan={10} className="px-6 py-6">
                                <Card className="border-indigo-200 dark:border-indigo-800 shadow-sm">
                                  <CardHeader className="pb-2 pt-4 px-5">
                                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                      {fund.name}
                                      <Badge variant="secondary" className="text-[10px]">vs Nifty 50</Badge>
                                    </CardTitle>
                                    <CardDescription className="text-xs">Cumulative Growth & Drawdown Risk comparison</CardDescription>
                                  </CardHeader>
                                  <CardContent className="px-5 pb-5">
                                    <FundCharts fund={fund} />
                                  </CardContent>
                                </Card>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Mobile View (Cards) */}
        <div className="md:hidden space-y-4">
          {loading ? (
            <div className="flex flex-col gap-4">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-32 w-full rounded-2xl bg-muted/40 animate-pulse" />
              ))}
            </div>
          ) : (
            sorted.map((fund) => (
              <div
                key={fund.id}
                className={cn(
                  "bg-background border rounded-2xl overflow-hidden transition-all duration-300",
                  expandedId === fund.id ? "ring-2 ring-primary/20 shadow-xl border-primary/40 scale-[1.02]" : "border-border/60"
                )}
              >
                <div
                  className="p-5 flex items-center justify-between cursor-pointer active:bg-muted/30"
                  onClick={() => handleToggleExpand(fund.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className={cn(
                      "inline-flex items-center justify-center w-10 h-10 rounded-xl text-xs font-black flex-shrink-0 shadow-sm",
                      fund.final_rank === 1 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40" :
                      fund.final_rank === 2 ? "bg-slate-100 text-slate-600 dark:bg-slate-800" :
                      fund.final_rank === 3 ? "bg-orange-100 text-orange-600 dark:bg-orange-900/40" :
                      "bg-muted text-muted-foreground"
                    )}>
                      #{fund.final_rank}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <Link
                        href={`/rankings/${fund.id}`}
                        className="font-bold text-[15px] hover:text-primary transition-colors leading-tight truncate pr-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {fund.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="secondary" className={cn("text-[9px] h-4.5 py-0 px-1.5 uppercase tracking-wider font-bold", CATEGORY_COLORS[fund.category])}>
                          {fund.category}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1 rounded">{fund.code}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right flex flex-col items-end">
                      <div className="text-[16px] font-black text-teal-600 tabular-nums">{pct(fund.cagr)}</div>
                      {nifty50 && fund.id !== nifty50.id && (
                        <div className={cn("text-[9px] font-bold px-1 rounded", fund.cagr > nifty50.cagr ? "text-teal-600" : "text-red-400")}>
                          {fund.cagr > nifty50.cagr ? "+" : ""}{((fund.cagr - nifty50.cagr) * 100).toFixed(0)}% vs N50
                        </div>
                      )}
                      {!nifty50 || fund.id === nifty50.id ? <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">CAGR</div> : null}
                    </div>
                    <div className={cn("transition-transform duration-300", expandedId === fund.id && "rotate-180")}>
                      <ChevronDown className="h-5 w-5 text-muted-foreground/60" />
                    </div>
                  </div>
                </div>

                {expandedId === fund.id && (
                  <div className="px-5 pb-5 pt-0 border-t bg-muted/5 animate-in slide-in-from-top-2 duration-300">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-5 py-5">
                      <div className="space-y-1">
                        <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest opacity-70">3Y Avg Rolling</div>
                        <div className="text-sm font-bold tabular-nums">{pct(fund.avg_3y_rolling_return)}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest opacity-70">Sharpe Ratio</div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-bold tabular-nums">{fixed(fund.sharpe_ratio)}</div>
                          {nifty50 && fund.id !== nifty50.id && (
                            <span className={cn("text-[10px] font-bold px-1 rounded", fund.sharpe_ratio > nifty50.sharpe_ratio ? "bg-teal-50 text-teal-600" : "bg-red-50 text-red-400")}>
                              {fund.sharpe_ratio > nifty50.sharpe_ratio ? "↑" : "↓"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] text-red-500 uppercase font-bold tracking-widest opacity-70">Max Drawdown</div>
                        <div className="text-sm font-bold text-red-500 tabular-nums">{pct(fund.max_drawdown)}</div>
                      </div>
                      <div className="space-y-1">
                        <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest opacity-70">Volatility</div>
                        <div className="text-sm font-bold tabular-nums">{pct(fund.volatility)}</div>
                      </div>
                    </div>

                    {/* Charts section */}
                    <div className="border-t border-dashed pt-5">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">vs Nifty 50</p>
                        <Link href={`/rankings/${fund.id}`} onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" className="h-8 rounded-xl px-3 text-xs font-bold gap-1.5 shadow-md bg-primary hover:bg-primary/90">
                            Full Details <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                      <FundCharts fund={fund} />
                    </div>

                    <div className="pt-4 flex flex-col gap-4 border-t border-dashed mt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 mr-6">
                          <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Composite Score</span>
                            <span className="text-sm font-black text-primary tabular-nums">{fund.score?.toFixed(1)}</span>
                          </div>
                          <div className="h-2 w-full bg-muted rounded-full shadow-inner overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-teal-500 rounded-full"
                              style={{ width: `${Math.min((fund.score / 50) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <p className="text-[10px] sm:text-xs text-muted-foreground mt-8 text-center leading-relaxed max-w-lg mx-auto">
          {sorted.length} of {funds.length} funds shown · Data: NSE India (Apr 2005–Feb 2026) · Backtested performance is not a guarantee of future returns.
        </p>
      </div>
    </div>
  )
}
