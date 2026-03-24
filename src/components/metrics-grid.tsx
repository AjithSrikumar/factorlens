"use client"

import { TrendingUp, TrendingDown, Activity, Shield, BarChart3, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

interface Metrics {
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

interface Props {
  metrics: Metrics
  benchmark?: Metrics
}

function DeltaBadge({ portfolio, bench, higherIsBetter = true, formatter }: {
  portfolio: number
  bench: number
  higherIsBetter?: boolean
  formatter: (v: number) => string
}) {
  const diff = portfolio - bench
  const isGood = higherIsBetter ? diff > 0 : diff < 0
  const sign = diff > 0 ? "+" : ""
  return (
    <span className={cn(
      "inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full",
      isGood
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
        : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
    )}>
      {sign}{formatter(diff)}
    </span>
  )
}

function MetricCard({
  label,
  value,
  sub,
  benchValue,
  benchLabel,
  icon: Icon,
  colorClass,
  bgClass,
  delta,
}: {
  label: string
  value: string
  sub?: string
  benchValue?: string
  benchLabel?: string
  icon: React.ElementType
  colorClass: string
  bgClass: string
  delta?: React.ReactNode
}) {
  return (
    <div className={cn(
      "relative bg-card rounded-2xl border border-border/60 p-4 sm:p-5",
      "hover:border-primary/20 transition-all card-hover overflow-hidden"
    )}>
      {/* Subtle top-left icon glow */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          {label}
        </span>
        <div className={cn("p-1.5 rounded-lg", bgClass)}>
          <Icon className={cn("h-3.5 w-3.5", colorClass)} />
        </div>
      </div>

      {/* Main value — large Instrument Serif */}
      <p className={cn("text-[28px] sm:text-[32px] leading-none font-bold metric-value", colorClass)}>
        {value}
      </p>

      {/* Sub label + benchmark */}
      <div className="flex items-center justify-between mt-2 gap-1">
        {sub && (
          <span className="text-[11px] text-muted-foreground truncate">{sub}</span>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {delta}
          {benchValue && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {benchLabel ?? "N50"} {benchValue}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function MetricsGrid({ metrics, benchmark }: Props) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="h-28 rounded-2xl bg-muted/30 animate-pulse" />
        ))}
      </div>
    )
  }

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  const pctDiff = (v: number) => `${(Math.abs(v) * 100).toFixed(1)}%`
  const fixed = (v: number, d = 2) => v.toFixed(d)
  const fixedDiff = (v: number, d = 2) => Math.abs(v).toFixed(d)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      {/* CAGR — hero metric */}
      <MetricCard
        label="CAGR"
        value={pct(metrics.cagr)}
        sub="Annualised Return"
        benchValue={benchmark ? pct(benchmark.cagr) : undefined}
        icon={TrendingUp}
        colorClass="text-emerald-600 dark:text-emerald-400"
        bgClass="bg-emerald-50 dark:bg-emerald-950/30"
        delta={benchmark && (
          <DeltaBadge
            portfolio={metrics.cagr}
            bench={benchmark.cagr}
            formatter={pctDiff}
          />
        )}
      />

      {/* Sharpe */}
      <MetricCard
        label="Sharpe Ratio"
        value={fixed(metrics.sharpe)}
        sub="Return per risk unit"
        benchValue={benchmark ? fixed(benchmark.sharpe) : undefined}
        icon={BarChart3}
        colorClass={metrics.sharpe > 0.5 ? "text-indigo-600 dark:text-indigo-400" : "text-foreground"}
        bgClass="bg-indigo-50 dark:bg-indigo-950/30"
        delta={benchmark && (
          <DeltaBadge
            portfolio={metrics.sharpe}
            bench={benchmark.sharpe}
            formatter={fixedDiff}
          />
        )}
      />

      {/* Max Drawdown */}
      <MetricCard
        label="Max Drawdown"
        value={pct(metrics.maxDrawdown)}
        sub="Worst peak-to-trough"
        benchValue={benchmark ? pct(benchmark.maxDrawdown) : undefined}
        icon={TrendingDown}
        colorClass="text-red-500 dark:text-red-400"
        bgClass="bg-red-50 dark:bg-red-950/30"
        delta={benchmark && (
          <DeltaBadge
            portfolio={metrics.maxDrawdown}
            bench={benchmark.maxDrawdown}
            higherIsBetter={false}
            formatter={pctDiff}
          />
        )}
      />

      {/* Volatility */}
      <MetricCard
        label="Volatility"
        value={pct(metrics.volatility)}
        sub="Annual std deviation"
        benchValue={benchmark ? pct(benchmark.volatility) : undefined}
        icon={Activity}
        colorClass={metrics.volatility < 0.20 ? "text-teal-600 dark:text-teal-400" : "text-foreground"}
        bgClass="bg-teal-50 dark:bg-teal-950/30"
      />

      {/* Calmar */}
      <MetricCard
        label="Calmar Ratio"
        value={fixed(metrics.calmar)}
        sub="CAGR ÷ Max Drawdown"
        benchValue={benchmark ? fixed(benchmark.calmar) : undefined}
        icon={Shield}
        colorClass={metrics.calmar > 0.3 ? "text-violet-600 dark:text-violet-400" : "text-foreground"}
        bgClass="bg-violet-50 dark:bg-violet-950/30"
      />

      {/* Total Return */}
      <MetricCard
        label="Total Return"
        value={`${metrics.totalReturn.toFixed(0)}%`}
        sub="Since inception"
        benchValue={benchmark ? `${benchmark.totalReturn.toFixed(0)}%` : undefined}
        icon={Zap}
        colorClass={metrics.totalReturn > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}
        bgClass="bg-amber-50 dark:bg-amber-950/30"
        delta={benchmark && (
          <DeltaBadge
            portfolio={metrics.totalReturn}
            bench={benchmark.totalReturn}
            formatter={(v) => `${Math.abs(v).toFixed(0)}%`}
          />
        )}
      />
    </div>
  )
}
