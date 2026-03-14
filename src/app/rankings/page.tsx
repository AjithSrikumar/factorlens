"use client"

import { useState, useEffect, useMemo } from "react"
import { ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { NavChart, DrawdownChart, FiscalYearDetailCards } from "@/components/portfolio-charts"

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
  "Global/Other": "bg-gray-100 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300",
}

function pct(v: number | null) {
  if (v == null) return "—"
  return `${(v * 100).toFixed(2)}%`
}

function fixed(v: number | null, d = 2) {
  if (v == null) return "—"
  return v.toFixed(d)
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-8 h-8 rounded-xl text-xs font-bold flex-shrink-0",
      rank === 1 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 ring-1 ring-amber-200 dark:ring-amber-800/60" :
      rank === 2 ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 ring-1 ring-slate-200 dark:ring-slate-700" :
      rank === 3 ? "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300 ring-1 ring-orange-200 dark:ring-orange-800/60" :
      "bg-muted text-muted-foreground"
    )}>
      {rank <= 3 ? ["🥇","🥈","🥉"][rank-1] : rank}
    </span>
  )
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
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc")
    else { setSortKey(key); setSortDir("asc") }
  }

  const handleToggleExpand = (id: number) => setExpandedId(expandedId === id ? null : id)

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/60" />
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />
  }

  function FundCharts({ fund }: { fund: Fund }) {
    const data = chartCache[fund.id]
    if (chartLoading && expandedId === fund.id && !data) {
      return (
        <div className="flex items-center justify-center py-12 gap-3">
          <div className="h-6 w-6 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <span className="text-sm text-muted-foreground">Loading charts…</span>
        </div>
      )
    }
    if (!data) return null
    return (
      <div className="space-y-6 pt-2">
        <div>
          <p className="text-sm font-semibold mb-1">Cumulative Growth</p>
          <p className="text-[11px] text-muted-foreground mb-3">₹100 invested at inception vs Nifty 50</p>
          <NavChart data={data.portfolioNav} benchmarkData={data.benchmarkNav} name={fund.code} benchmarkName="Nifty 50" />
        </div>
        <div>
          <p className="text-sm font-semibold mb-1">Drawdown Risk</p>
          <p className="text-[11px] text-muted-foreground mb-3">% decline from previous peak vs Nifty 50</p>
          <DrawdownChart data={data.drawdownSeries} benchmarkData={data.benchmarkDrawdown} name={fund.code} benchmarkName="Nifty 50" />
        </div>
        {data.fyTableData && (
          <div>
            <p className="text-sm font-semibold mb-1">Fiscal Year Detail</p>
            <p className="text-[11px] text-muted-foreground mb-3">Annual returns vs NIFTY 50</p>
            <FiscalYearDetailCards fyTableData={data.fyTableData} funds={[]} benchmarkName="NIFTY 50" primaryLabel={fund.code} />
          </div>
        )}
      </div>
    )
  }

  const tableColumns = [
    { key: "final_rank" as SortKey, label: "Rank" },
    { key: "name" as SortKey, label: "Fund" },
    { key: "category" as SortKey, label: "Category" },
    { key: "cagr" as SortKey, label: "CAGR" },
    { key: "avg_3y_rolling_return" as SortKey, label: "Avg 3Y" },
    { key: "sharpe_ratio" as SortKey, label: "Sharpe" },
    { key: "max_drawdown" as SortKey, label: "Max DD" },
    { key: "volatility" as SortKey, label: "Volatility" },
    { key: "score" as SortKey, label: "Score" },
  ]

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">

        {/* Page header */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Fund Rankings</h1>
            <p className="text-muted-foreground text-sm mt-1">
              28 NSE factor & broad-market funds ranked by composite score
            </p>
          </div>
          <Link href="/dashboard">
            <Button
              size="sm"
              className="bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white border-0 font-semibold shadow-sm h-9 px-5"
            >
              Build Portfolio
            </Button>
          </Link>
        </div>

        {/* Score explanation */}
        <div className="mb-5 rounded-2xl border border-indigo-200/60 dark:border-indigo-800/40 bg-indigo-50/60 dark:bg-indigo-950/20 px-4 py-3.5 flex gap-3 items-start">
          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black flex-shrink-0 mt-0.5">i</div>
          <p className="text-xs sm:text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed">
            <strong>Composite Score</strong> weights CAGR, 3-year rolling returns, outperformance vs Nifty 50, Sharpe ratio, and drawdown protection.
            Rank #1 is the highest-scoring fund. <strong>Tap any row</strong> to compare growth & drawdown vs Nifty 50.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              placeholder="Search funds…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl bg-card border-border/60"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCatFilter(cat)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap flex-shrink-0 transition-all border",
                  catFilter === cat
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "bg-card text-muted-foreground hover:bg-accent border-border/60"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block">
          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            {loading ? (
              <div className="flex items-center justify-center py-24">
                <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/20">
                      {tableColumns.map((col) => (
                        <th
                          key={col.key}
                          className="px-4 py-3.5 text-left font-bold text-[10px] uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                          onClick={() => handleSort(col.key)}
                        >
                          <span className="flex items-center gap-1.5">
                            {col.label}
                            <SortIcon col={col.key} />
                          </span>
                        </th>
                      ))}
                      <th className="px-4 py-3.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((fund, i) => (
                      <>
                        <tr
                          key={fund.id}
                          className={cn(
                            "border-b border-border/40 transition-colors group cursor-pointer",
                            expandedId === fund.id
                              ? "bg-indigo-50/50 dark:bg-indigo-950/15"
                              : i % 2 === 0
                              ? "hover:bg-muted/20"
                              : "bg-muted/5 hover:bg-muted/25"
                          )}
                          onClick={() => handleToggleExpand(fund.id)}
                        >
                          <td className="px-4 py-4">
                            <RankBadge rank={fund.final_rank} />
                          </td>
                          <td className="px-4 py-4 max-w-[220px]">
                            <Link
                              href={`/rankings/${fund.id}`}
                              className="font-semibold hover:text-primary transition-colors flex items-center gap-1.5 truncate"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <span className="truncate">{fund.name}</span>
                              <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-60 flex-shrink-0 transition-opacity" />
                            </Link>
                            <div className="text-[10px] text-muted-foreground font-mono mt-0.5">{fund.code}</div>
                          </td>
                          <td className="px-4 py-4">
                            <Badge variant="secondary" className={cn("text-[9px] whitespace-nowrap font-bold", CATEGORY_COLORS[fund.category])}>
                              {fund.category}
                            </Badge>
                          </td>
                          <td className="px-4 py-4 font-mono whitespace-nowrap">
                            <span className={cn("font-bold", fund.cagr > 0.18 ? "text-emerald-600 dark:text-emerald-400" : "")}>
                              {pct(fund.cagr)}
                            </span>
                            {nifty50 && fund.id !== nifty50.id && (
                              <div className={cn("text-[9px] font-bold font-mono", fund.cagr > nifty50.cagr ? "text-emerald-600" : "text-red-400")}>
                                {fund.cagr > nifty50.cagr ? "+" : ""}{((fund.cagr - nifty50.cagr) * 100).toFixed(1)}% vs N50
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-4 font-mono whitespace-nowrap text-muted-foreground">
                            {pct(fund.avg_3y_rolling_return)}
                          </td>
                          <td className="px-4 py-4 font-mono whitespace-nowrap">
                            <span className={cn(fund.sharpe_ratio > 0.6 ? "text-indigo-600 dark:text-indigo-400 font-bold" : "")}>
                              {fixed(fund.sharpe_ratio)}
                            </span>
                          </td>
                          <td className="px-4 py-4 font-mono whitespace-nowrap text-red-500 dark:text-red-400">
                            {pct(fund.max_drawdown)}
                          </td>
                          <td className="px-4 py-4 font-mono whitespace-nowrap text-muted-foreground">
                            {pct(fund.volatility)}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2 min-w-[72px]">
                              <div className="flex-1 h-1.5 bg-muted rounded-full">
                                <div
                                  className="h-full bg-gradient-to-r from-indigo-500 to-teal-500 rounded-full"
                                  style={{ width: `${Math.min((fund.score / 50) * 100, 100)}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold font-mono text-foreground tabular-nums">
                                {fund.score?.toFixed(1)}
                              </span>
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
                          <tr key={`${fund.id}-charts`} className="border-b border-indigo-200/50 dark:border-indigo-800/30 bg-indigo-50/30 dark:bg-indigo-950/10">
                            <td colSpan={10} className="px-6 py-5">
                              <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-800/30 bg-card overflow-hidden">
                                <div className="px-5 pt-4 pb-2 border-b border-border/40">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-bold text-sm">{fund.name}</h4>
                                    <Badge variant="secondary" className="text-[9px] font-bold">vs Nifty 50</Badge>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">Growth & drawdown comparison</p>
                                </div>
                                <div className="px-5 py-5">
                                  <FundCharts fund={fund} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Cards */}
        <div className="md:hidden space-y-3">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-24 w-full rounded-2xl bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : (
            sorted.map((fund) => (
              <div
                key={fund.id}
                className={cn(
                  "bg-card border rounded-2xl overflow-hidden transition-all",
                  expandedId === fund.id
                    ? "border-primary/30 shadow-lg ring-1 ring-primary/10"
                    : "border-border/60"
                )}
              >
                {/* Card header */}
                <div
                  className="px-4 py-4 flex items-center gap-3 cursor-pointer active:bg-muted/20 transition-colors"
                  onClick={() => handleToggleExpand(fund.id)}
                >
                  <RankBadge rank={fund.final_rank} />

                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/rankings/${fund.id}`}
                      className="font-semibold text-sm hover:text-primary transition-colors leading-tight line-clamp-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {fund.name}
                    </Link>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant="secondary" className={cn("text-[9px] h-4 py-0 px-1.5 uppercase font-bold", CATEGORY_COLORS[fund.category])}>
                        {fund.category}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-1 rounded">{fund.code}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <div className="text-right">
                      <div className="text-lg font-bold metric-value text-emerald-600 dark:text-emerald-400 tabular-nums leading-none">
                        {pct(fund.cagr)}
                      </div>
                      {nifty50 && fund.id !== nifty50.id && (
                        <div className={cn("text-[9px] font-bold font-mono", fund.cagr > nifty50.cagr ? "text-emerald-600" : "text-red-400")}>
                          {fund.cagr > nifty50.cagr ? "+" : ""}{((fund.cagr - nifty50.cagr) * 100).toFixed(0)}% vs N50
                        </div>
                      )}
                    </div>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground/60 transition-transform duration-200", expandedId === fund.id && "rotate-180")} />
                  </div>
                </div>

                {/* Expanded content */}
                {expandedId === fund.id && (
                  <div className="border-t border-border/40 bg-muted/5">
                    {/* Quick metrics grid */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-4 px-4 py-4">
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest mb-1">3Y Avg Rolling</p>
                        <p className="text-sm font-bold font-mono">{pct(fund.avg_3y_rolling_return)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Sharpe Ratio</p>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold font-mono">{fixed(fund.sharpe_ratio)}</p>
                          {nifty50 && fund.id !== nifty50.id && (
                            <span className={cn("text-[10px] font-bold px-1 rounded", fund.sharpe_ratio > nifty50.sharpe_ratio ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600" : "bg-red-50 dark:bg-red-950/30 text-red-400")}>
                              {fund.sharpe_ratio > nifty50.sharpe_ratio ? "↑" : "↓"}
                            </span>
                          )}
                        </div>
                      </div>
                      <div>
                        <p className="text-[9px] text-red-500 uppercase font-bold tracking-widest mb-1">Max Drawdown</p>
                        <p className="text-sm font-bold font-mono text-red-500">{pct(fund.max_drawdown)}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest mb-1">Volatility</p>
                        <p className="text-sm font-bold font-mono">{pct(fund.volatility)}</p>
                      </div>
                    </div>

                    {/* Score bar */}
                    <div className="px-4 pb-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] text-muted-foreground uppercase font-bold tracking-widest">Composite Score</span>
                        <span className="text-sm font-bold text-primary font-mono">{fund.score?.toFixed(1)}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-teal-500 rounded-full"
                          style={{ width: `${Math.min((fund.score / 50) * 100, 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Charts section */}
                    <div className="border-t border-dashed border-border/50 px-4 py-4">
                      <div className="flex items-center justify-between mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Performance vs Nifty 50</p>
                        <Link href={`/rankings/${fund.id}`} onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" className="h-8 px-3 text-xs font-bold gap-1 rounded-xl bg-primary hover:bg-primary/90 shadow-sm">
                            Details <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                      <FundCharts fund={fund} />
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer note */}
        <p className="text-[10px] text-muted-foreground text-center mt-6 leading-relaxed">
          {sorted.length} of {funds.length} funds shown · NSE India data (Apr 2005 – Feb 2026) · Past performance is not a guarantee of future returns.
        </p>

      </div>
    </div>
  )
}
