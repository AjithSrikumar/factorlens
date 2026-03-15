"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { Search, TrendingUp, TrendingDown, ArrowUpDown, ChevronUp, ChevronDown, Building2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface MFFund {
  scheme_code: number
  scheme_name: string
  fund_house: string
  scheme_category: string
  nav: number | null
  nav_date: string | null
  return_1y: number | null
  return_3y: number | null
  return_5y: number | null
  aum_cr: null
}

type SortKey = "scheme_name" | "scheme_category" | "nav" | "return_1y" | "return_3y" | "return_5y"
type SortDir = "asc" | "desc"

function ReturnCell({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground/50 font-mono text-xs">—</span>
  const pos = value >= 0
  return (
    <span className={cn(
      "font-mono text-xs font-bold tabular-nums",
      pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
    )}>
      {pos ? "+" : ""}{value.toFixed(1)}%
    </span>
  )
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ArrowUpDown className="h-3 w-3 opacity-30" />
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 text-primary" />
    : <ChevronDown className="h-3 w-3 text-primary" />
}

export default function FundsPage() {
  const [funds, setFunds] = useState<MFFund[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("All")
  const [sortKey, setSortKey] = useState<SortKey>("return_1y")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  useEffect(() => {
    fetch("/api/mffunds")
      .then(r => r.json())
      .then((data: MFFund[]) => { setFunds(data); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  const categories = useMemo(() => {
    const cats = Array.from(new Set(funds.map(f => f.scheme_category).filter(Boolean)))
    return ["All", ...cats.sort()]
  }, [funds])

  const filtered = useMemo(() => {
    let list = funds
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(f =>
        f.scheme_name.toLowerCase().includes(q) ||
        f.fund_house.toLowerCase().includes(q)
      )
    }
    if (categoryFilter !== "All") {
      list = list.filter(f => f.scheme_category === categoryFilter)
    }
    list = [...list].sort((a, b) => {
      let av = a[sortKey]
      let bv = b[sortKey]
      if (av === null) av = sortDir === "asc" ? Infinity : -Infinity
      if (bv === null) bv = sortDir === "asc" ? Infinity : -Infinity
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
    return list
  }, [funds, search, categoryFilter, sortKey, sortDir])

  function toggleSort(col: SortKey) {
    if (sortKey === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc")
    } else {
      setSortKey(col)
      setSortDir("desc")
    }
  }

  const navDate = funds.find(f => f.nav_date)?.nav_date

  return (
    <div className="min-h-screen bg-muted/20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5">

        {/* Header */}
        <div className="pt-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Mutual Funds</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {loading ? "Loading…" : `${funds.length} funds · NAV as of ${navDate ?? "—"}`}
          </p>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <input
              type="text"
              placeholder="Search by fund name or AMC…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-xl border border-border/60 bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="sm:w-56 px-3 py-2.5 text-sm rounded-xl border border-border/60 bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/40 transition-all"
          >
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}

        {/* Results count */}
        {!loading && !error && (
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {funds.length} funds
            {categoryFilter !== "All" && <span> in <span className="font-semibold">{categoryFilter}</span></span>}
          </p>
        )}

        {/* Desktop Table */}
        {!loading && !error && (
          <div className="hidden md:block rounded-2xl border border-border/60 bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    {[
                      { key: "scheme_name" as SortKey, label: "Fund Name", align: "left" },
                      { key: "scheme_category" as SortKey, label: "Category", align: "left" },
                      { key: "nav" as SortKey, label: "NAV (₹)", align: "right" },
                      { key: "return_1y" as SortKey, label: "1Y Return", align: "right" },
                      { key: "return_3y" as SortKey, label: "3Y CAGR", align: "right" },
                      { key: "return_5y" as SortKey, label: "5Y CAGR", align: "right" },
                    ].map(col => (
                      <th
                        key={col.key}
                        className={cn(
                          "px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-foreground select-none transition-colors",
                          col.align === "right" ? "text-right" : "text-left"
                        )}
                        onClick={() => toggleSort(col.key)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.align === "right" && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                          {col.label}
                          {col.align === "left" && <SortIcon col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {filtered.map(fund => (
                    <tr
                      key={fund.scheme_code}
                      className="hover:bg-muted/30 transition-colors cursor-pointer group"
                      onClick={() => window.location.href = `/funds/${fund.scheme_code}`}
                    >
                      <td className="px-4 py-3.5">
                        <div className="font-medium text-sm leading-snug group-hover:text-primary transition-colors line-clamp-2">
                          {fund.scheme_name}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                          <Building2 className="h-3 w-3 flex-shrink-0" />
                          {fund.fund_house}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                          {fund.scheme_category || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        {fund.nav !== null
                          ? <span className="font-mono text-sm font-semibold tabular-nums">₹{fund.nav.toFixed(4)}</span>
                          : <span className="text-muted-foreground/50 text-xs">—</span>
                        }
                      </td>
                      <td className="px-4 py-3.5 text-right"><ReturnCell value={fund.return_1y} /></td>
                      <td className="px-4 py-3.5 text-right"><ReturnCell value={fund.return_3y} /></td>
                      <td className="px-4 py-3.5 text-right"><ReturnCell value={fund.return_5y} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <div className="py-16 text-center">
                <p className="text-muted-foreground text-sm">No funds match your search.</p>
              </div>
            )}
          </div>
        )}

        {/* Mobile Cards */}
        {!loading && !error && (
          <div className="md:hidden space-y-2">
            {filtered.length === 0 && (
              <div className="py-16 text-center rounded-2xl border border-dashed border-border/70 bg-card">
                <p className="text-muted-foreground text-sm">No funds match your search.</p>
              </div>
            )}
            {filtered.map(fund => (
              <Link
                key={fund.scheme_code}
                href={`/funds/${fund.scheme_code}`}
                className="block rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/20 transition-all active:scale-[0.98]"
              >
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-snug line-clamp-2">{fund.scheme_name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{fund.fund_house}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {fund.nav !== null
                      ? <p className="font-mono text-sm font-bold tabular-nums">₹{fund.nav.toFixed(2)}</p>
                      : <p className="text-muted-foreground/50 text-xs">—</p>
                    }
                    {fund.nav_date && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">{fund.nav_date}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 mb-2.5">
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                    {fund.scheme_category || "—"}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "1Y", value: fund.return_1y },
                    { label: "3Y CAGR", value: fund.return_3y },
                    { label: "5Y CAGR", value: fund.return_5y },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-muted/30 px-2.5 py-2 text-center">
                      <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">{label}</p>
                      {value !== null ? (
                        <div className={cn(
                          "flex items-center justify-center gap-0.5 text-xs font-bold tabular-nums",
                          value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
                        )}>
                          {value >= 0
                            ? <TrendingUp className="h-2.5 w-2.5" />
                            : <TrendingDown className="h-2.5 w-2.5" />
                          }
                          {value >= 0 ? "+" : ""}{value.toFixed(1)}%
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground/50">—</p>
                      )}
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Disclaimer */}
        {!loading && !error && funds.length > 0 && (
          <div className="rounded-xl border border-dashed border-border/50 p-4 bg-muted/10">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Disclosure</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              NAV data sourced from AMFI via mfapi.in. Returns are calculated from historical NAV. Past performance is not indicative of future results.
              1Y return is point-to-point; 3Y and 5Y returns are CAGR. AUM data is not available.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
