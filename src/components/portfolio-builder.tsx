"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { X, Plus, ChevronDown, Search, Equal } from "lucide-react"
import { amcLogoUrl } from "@/lib/amc"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"

export interface Fund {
  id: number
  code: string
  name: string
  category: string
  cagr: number
  sharpe_ratio: number
  max_drawdown: number
  final_rank: number
}

interface FundAllocation {
  fund: Fund
  weight: number
}

interface Props {
  funds: Fund[]
  allocations: FundAllocation[]
  onChange: (allocations: FundAllocation[]) => void
  onGenerate: () => void
  loading: boolean
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

export function PortfolioBuilder({ funds, allocations, onChange, onGenerate, loading }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [catFilter, setCatFilter] = useState("All")
  // MF trackers: keyed by fund code
  const [mfTrackers, setMfTrackers] = useState<Record<string, { schemeName: string; amcLogo: string | null }>>({})
  const fetchedCodes = useRef<Set<string>>(new Set())

  // Fetch MF tracker for any newly added fund
  useEffect(() => {
    const toFetch = allocations.filter(a => !fetchedCodes.current.has(a.fund.code))
    if (toFetch.length === 0) return
    toFetch.forEach(a => fetchedCodes.current.add(a.fund.code))
    Promise.all(
      toFetch.map(a =>
        fetch(`/api/mffunds/byindex?indexName=${encodeURIComponent(a.fund.name)}`)
          .then(r => r.json())
          .then((d: unknown) => {
            const arr = Array.isArray(d) ? d : []
            const top = arr[0] as { scheme_name?: string; fund_house?: string } | undefined
            return {
              code: a.fund.code,
              schemeName: top?.scheme_name ?? '',
              amcLogo: top?.fund_house ? amcLogoUrl(top.fund_house) : null,
            }
          })
          .catch(() => ({ code: a.fund.code, schemeName: '', amcLogo: null }))
      )
    ).then(results => {
      setMfTrackers(prev => {
        const next = { ...prev }
        results.forEach(r => { next[r.code] = { schemeName: r.schemeName, amcLogo: r.amcLogo } })
        return next
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allocations.length])

  const categories = ["All", ...Array.from(new Set(funds.map((f) => f.category)))]
  const totalWeight = allocations.reduce((sum, a) => sum + a.weight, 0)
  const weightError = Math.abs(totalWeight - 100) > 0.5
  const selectedIds = new Set(allocations.map((a) => a.fund.id))

  // Detect if weights are unequal (to highlight the Equalize button)
  const equalWeight = allocations.length > 0 ? Math.round(100 / allocations.length) : 0
  const weightsUnequal = allocations.length > 1 && allocations.some(a => Math.round(a.weight) !== equalWeight)

  const filteredFunds = funds.filter((f) => {
    const matchCat = catFilter === "All" || f.category === catFilter
    const matchSearch = f.name.toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch && !selectedIds.has(f.id)
  })

  const addFund = useCallback((fund: Fund) => {
    if (allocations.length >= 10) return
    const newAllocations = [...allocations, { fund, weight: 0 }]
    const equal = Math.floor(100 / newAllocations.length)
    const remainder = 100 - equal * newAllocations.length
    onChange(newAllocations.map((a, i) => ({ ...a, weight: equal + (i === 0 ? remainder : 0) })))
    setOpen(false)
    setSearch("")
  }, [allocations, onChange])

  const removeFund = useCallback((id: number) => {
    onChange(allocations.filter((a) => a.fund.id !== id))
  }, [allocations, onChange])

  const updateWeight = useCallback((id: number, weight: number) => {
    onChange(allocations.map((a) => a.fund.id === id ? { ...a, weight } : a))
  }, [allocations, onChange])

  const autoNormalize = useCallback(() => {
    if (allocations.length === 0) return
    const equal = Math.floor(100 / allocations.length)
    const remainder = 100 - equal * allocations.length
    onChange(allocations.map((a, i) => ({ ...a, weight: equal + (i === 0 ? remainder : 0) })))
  }, [allocations, onChange])

  return (
    <div className="space-y-5">

      {/* Section header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Selected Funds
          </span>
          <span className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-full",
            allocations.length >= 10
              ? "bg-destructive/10 text-destructive"
              : "bg-muted text-muted-foreground"
          )}>
            {allocations.length}/10
          </span>
        </div>
        {allocations.length > 1 && (
          <button
            onClick={autoNormalize}
            className={cn(
              "flex items-center gap-1.5 text-xs font-semibold transition-all px-2.5 py-1.5 rounded-lg",
              weightsUnequal
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 animate-in fade-in duration-200"
                : "text-muted-foreground hover:text-primary hover:bg-primary/5"
            )}
          >
            <Equal className="h-3 w-3" />
            Equalize
          </button>
        )}
      </div>

      {/* Selected funds list */}
      {allocations.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-10 text-center">
          <div className="w-10 h-10 rounded-full bg-muted/60 flex items-center justify-center mx-auto mb-3">
            <Plus className="h-5 w-5 text-muted-foreground/60" />
          </div>
          <p className="text-sm font-semibold text-foreground/70">No funds selected</p>
          <p className="text-xs text-muted-foreground mt-1">Tap &ldquo;Add Fund&rdquo; below to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allocations.map((a) => (
            <div
              key={a.fund.id}
              className="rounded-2xl border border-border/70 bg-card p-4 hover:border-primary/30 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0 mr-3">
                  <p className="font-semibold text-[14px] leading-snug text-foreground truncate">
                    {a.fund.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[9px] px-1.5 py-0 h-4 uppercase font-bold tracking-wider",
                        CATEGORY_COLORS[a.fund.category]
                      )}
                    >
                      {a.fund.category}
                    </Badge>
                    <span className="text-[10px] font-mono text-muted-foreground/70">
                      {a.fund.code}
                    </span>
                  </div>
                  {/* MF tracker — AMC logo + scheme name */}
                  {mfTrackers[a.fund.code]?.schemeName && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      {mfTrackers[a.fund.code].amcLogo && (
                        <img
                          src={mfTrackers[a.fund.code].amcLogo!}
                          alt=""
                          style={{ width: 16, height: 16, objectFit: 'contain', borderRadius: 3, flexShrink: 0 }}
                        />
                      )}
                      <span className="text-[11px] text-muted-foreground truncate">
                        {mfTrackers[a.fund.code].schemeName}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <span className="font-bold text-[22px] metric-value text-primary tabular-nums leading-none">
                      {a.weight}
                    </span>
                    <span className="text-xs font-bold text-primary/70">%</span>
                  </div>
                  <button
                    className="h-7 w-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                    onClick={() => removeFund(a.fund.id)}
                    aria-label="Remove fund"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <Slider
                value={[a.weight]}
                onValueChange={([v]) => updateWeight(a.fund.id, v)}
                min={1}
                max={100}
                step={1}
                className="w-full"
              />
            </div>
          ))}
        </div>
      )}

      {/* Weight progress bar + status */}
      {allocations.length > 0 && (
        <div className="space-y-2">
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                totalWeight > 100 ? "bg-destructive" :
                totalWeight === 100 ? "bg-emerald-500" : "bg-primary"
              )}
              style={{ width: `${Math.min(totalWeight, 100)}%` }}
            />
          </div>
          <div className={cn(
            "flex items-center justify-between text-xs",
            weightError ? "text-destructive" : "text-muted-foreground"
          )}>
            <span>
              Total: <span className="font-bold font-mono">{totalWeight}%</span>
            </span>
            {weightError
              ? <span className="font-medium">Must equal 100%</span>
              : <span className="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Ready to generate</span>
            }
          </div>
        </div>
      )}

      {/* Add Fund dropdown */}
      <div className="relative">
        <button
          className={cn(
            "w-full h-11 flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed font-semibold text-sm transition-all",
            allocations.length >= 10
              ? "opacity-40 cursor-not-allowed border-border text-muted-foreground"
              : "border-border text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]"
          )}
          onClick={() => allocations.length < 10 && setOpen(!open)}
          disabled={allocations.length >= 10}
        >
          <Plus className="h-4 w-4" />
          Add Fund
          <ChevronDown className={cn(
            "h-4 w-4 ml-auto mr-1 transition-transform duration-200",
            open && "rotate-180"
          )} />
        </button>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-popover border-2 border-border rounded-2xl shadow-2xl overflow-hidden origin-top animate-in fade-in zoom-in-95 duration-150">

            {/* Search */}
            <div className="p-3 border-b border-border/60">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <Input
                  placeholder={`Search ${filteredFunds.length + allocations.length} factor indices…`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10 rounded-xl bg-muted/40 border-muted text-sm"
                  autoFocus
                />
              </div>
            </div>

            {/* Category filter chips */}
            <div className="px-3 py-2 border-b border-border/40 flex gap-1.5 overflow-x-auto no-scrollbar bg-muted/20">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap flex-shrink-0 transition-all",
                    catFilter === cat
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card text-muted-foreground hover:bg-accent border border-border/60"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Fund list */}
            <div className="max-h-72 overflow-y-auto">
              {filteredFunds.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">No funds found</p>
                </div>
              ) : (
                filteredFunds.map((fund) => (
                  <button
                    key={fund.id}
                    onClick={() => addFund(fund)}
                    className="w-full text-left px-4 py-3.5 flex items-center justify-between gap-3 border-b last:border-0 border-border/40 hover:bg-accent/50 active:bg-accent transition-colors group"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold leading-tight text-foreground group-hover:text-primary transition-colors truncate">
                        {fund.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge
                          variant="secondary"
                          className={cn(
                            "text-[9px] h-4 py-0 px-1.5 uppercase font-bold tracking-wider",
                            CATEGORY_COLORS[fund.category]
                          )}
                        >
                          {fund.category}
                        </Badge>
                        <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          {(fund.cagr * 100).toFixed(1)}% CAGR
                        </span>
                      </div>
                    </div>
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all flex-shrink-0">
                      <Plus className="h-3.5 w-3.5" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      <Button
        className="w-full h-12 text-[15px] font-bold bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white border-0 rounded-2xl shadow-md shadow-indigo-900/20 active:scale-[0.99] transition-all"
        onClick={onGenerate}
        disabled={loading || allocations.length === 0 || weightError}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Computing Portfolio…
          </span>
        ) : (
          "Generate Portfolio"
        )}
      </Button>
    </div>
  )
}
