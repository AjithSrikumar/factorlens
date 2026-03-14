"use client"

import { useState, useCallback } from "react"
import { X, Plus, ChevronDown, Search } from "lucide-react"
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
  "Global/Other": "bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-300",
}

export function PortfolioBuilder({ funds, allocations, onChange, onGenerate, loading }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [catFilter, setCatFilter] = useState("All")

  const categories = ["All", ...Array.from(new Set(funds.map((f) => f.category)))]
  const totalWeight = allocations.reduce((sum, a) => sum + a.weight, 0)
  const weightError = Math.abs(totalWeight - 100) > 0.5

  const selectedIds = new Set(allocations.map((a) => a.fund.id))

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
    <div className="space-y-6">
      {/* Fund selector */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            Selected Funds ({allocations.length}/10)
          </h3>
          {allocations.length > 0 && (
            <Button variant="ghost" size="sm" onClick={autoNormalize} className="text-xs h-7">
              Auto-Equalise
            </Button>
          )}
        </div>

        {/* Selected funds list */}
        {allocations.length === 0 ? (
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
            <p className="text-muted-foreground text-sm">No funds selected yet.</p>
              <p className="text-xs text-muted-foreground mt-1">Click &ldquo;Add Fund&rdquo; to get started.</p>
          </div>
        ) : (
            <div className="space-y-4">
              {allocations.map((a) => (
                <div key={a.fund.id} className="border-2 rounded-2xl p-4 bg-card hover:border-primary/40 transition-all shadow-sm">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0 mr-3">
                      <p className="font-bold text-[15px] leading-tight text-foreground truncate">{a.fund.name}</p>
                      <Badge variant="secondary" className={cn("text-[10px] mt-1.5 px-2 py-0 h-4.5 uppercase font-bold tracking-wider", CATEGORY_COLORS[a.fund.category])}>
                        {a.fund.category}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="bg-primary/10 px-2 py-1 rounded-lg">
                        <span className="font-black text-lg text-primary tabular-nums">{a.weight}%</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => removeFund(a.fund.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="px-1.5 pb-2">
                    <Slider
                      value={[a.weight]}
                      onValueChange={([v]) => updateWeight(a.fund.id, v)}
                      min={1}
                      max={100}
                      step={1}
                      className="w-full"
                    />
                  </div>
                </div>
              ))}
            </div>

        )}

        {/* Weight indicator */}
        {allocations.length > 0 && (
          <div className={cn(
            "mt-3 flex items-center justify-between text-sm px-1",
            weightError ? "text-destructive" : "text-muted-foreground"
          )}>
            <span>Total weight: <strong>{totalWeight}%</strong></span>
            {weightError && <span className="text-xs">Must equal 100%</span>}
            {!weightError && <span className="text-xs text-teal-600 font-medium">Ready to generate</span>}
          </div>
        )}

        {/* Progress bar */}
        {allocations.length > 0 && (
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                totalWeight > 100 ? "bg-destructive" : totalWeight === 100 ? "bg-teal-500" : "bg-primary"
              )}
              style={{ width: `${Math.min(totalWeight, 100)}%` }}
            />
          </div>
        )}
      </div>

      {/* Add Fund button + dropdown */}
      <div className="relative">
        <Button
          variant="outline"
          className="w-full h-12 gap-3 border-dashed border-2 rounded-2xl font-bold text-muted-foreground hover:text-primary hover:border-primary/50 transition-all"
          onClick={() => setOpen(!open)}
          disabled={allocations.length >= 10}
        >
          <Plus className="h-5 w-5" />
          Add Fund
          <ChevronDown className={cn("h-4 w-4 ml-auto transition-transform duration-300", open && "rotate-180")} />
        </Button>

        {open && (
          <div className="absolute top-full left-0 right-0 mt-3 z-50 bg-popover border-2 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
            {/* Search */}
            <div className="p-4 border-b">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
                <Input
                  placeholder="Search 28 factor indexes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10 h-11 text-[15px] font-medium rounded-xl border-muted bg-muted/30 focus-visible:ring-primary/20"
                  autoFocus
                />
              </div>
            </div>

            {/* Category filter */}
            <div className="p-2.5 border-b flex gap-1.5 overflow-x-auto no-scrollbar bg-muted/10">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCatFilter(cat)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs whitespace-nowrap font-bold transition-all flex-shrink-0",
                    catFilter === cat
                      ? "bg-primary text-primary-foreground shadow-md scale-105"
                      : "bg-background text-muted-foreground hover:bg-accent border"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Fund list */}
            <div className="max-h-80 overflow-y-auto scrollbar-thin">
              {filteredFunds.length === 0 ? (
                <div className="p-12 text-center space-y-2">
                  <div className="bg-muted rounded-full w-10 h-10 flex items-center justify-center mx-auto opacity-50">
                    <Search className="h-5 w-5" />
                  </div>
                  <p className="text-sm font-bold text-muted-foreground">No funds found</p>
                </div>
              ) : (
                filteredFunds.map((fund) => (
                  <button
                    key={fund.id}
                    onClick={() => addFund(fund)}
                    className="w-full text-left px-5 py-4 hover:bg-accent/60 transition-all flex items-center justify-between gap-4 border-b last:border-0 group active:bg-accent"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[14px] font-black leading-tight text-foreground group-hover:text-primary transition-colors truncate">{fund.name}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge variant="secondary" className={cn("text-[9px] h-4 py-0 px-1.5 uppercase font-bold tracking-wider", CATEGORY_COLORS[fund.category])}>
                          {fund.category}
                        </Badge>
                        <span className="text-[11px] font-bold text-teal-600">
                          {(fund.cagr * 100).toFixed(1)}% CAGR
                        </span>
                      </div>
                    </div>
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                      <Plus className="h-4 w-4" />
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
        className="w-full h-12 text-base bg-gradient-to-r from-indigo-600 to-teal-500 hover:from-indigo-700 hover:to-teal-600 text-white border-0 font-semibold"
        onClick={onGenerate}
        disabled={loading || allocations.length === 0 || weightError}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
            Computing Portfolio...
          </span>
        ) : (
          "Generate Portfolio"
        )}
      </Button>
    </div>
  )
}
