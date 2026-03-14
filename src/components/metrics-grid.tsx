"use client"

import { TrendingUp, TrendingDown, Activity, Shield, BarChart3, Zap } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
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

function MetricCard({
  label,
  value,
  sub,
  benchmarkValue,
  icon: Icon,
  positive,
  className,
}: {
  label: string
  value: string
  sub?: string
  benchmarkValue?: string
  icon: React.ElementType
  positive?: boolean
  className?: string
}) {
  return (
    <Card className={cn("border-border/60 hover:border-primary/20 transition-colors", className)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
          <div className={cn(
            "p-1.5 rounded-lg",
            positive === true ? "bg-teal-50 dark:bg-teal-950/30" :
            positive === false ? "bg-red-50 dark:bg-red-950/30" :
            "bg-muted"
          )}>
            <Icon className={cn(
              "h-3.5 w-3.5",
              positive === true ? "text-teal-600" :
              positive === false ? "text-red-500" :
              "text-muted-foreground"
            )} />
          </div>
        </div>
        <p className={cn(
          "text-2xl font-bold tabular-nums",
          positive === true ? "text-teal-600" :
          positive === false ? "text-red-500" :
          "text-foreground"
        )}>
          {value}
        </p>
        <div className="flex items-center justify-between mt-1">
          {sub && <p className="text-[10px] text-muted-foreground truncate">{sub}</p>}
          {benchmarkValue && (
            <p className="text-[10px] text-muted-foreground font-medium ml-auto">
              vs {benchmarkValue}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function MetricsGrid({ metrics, benchmark }: Props) {
  if (!metrics) return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <Card key={i} className="border-border/60 h-24 animate-pulse bg-muted/20" />
      ))}
    </div>
  )

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`
  const fixed = (v: number, d = 2) => v.toFixed(d)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      <MetricCard
        label="CAGR"
        value={pct(metrics.cagr)}
        benchmarkValue={benchmark ? pct(benchmark.cagr) : undefined}
        sub="Annualised Return"
        icon={TrendingUp}
        positive={metrics.cagr > 0}
      />
      <MetricCard
        label="Volatility"
        value={pct(metrics.volatility)}
        benchmarkValue={benchmark ? pct(benchmark.volatility) : undefined}
        sub="Annual std dev"
        icon={Activity}
        positive={metrics.volatility < 0.2}
      />
      <MetricCard
        label="Sharpe Ratio"
        value={fixed(metrics.sharpe)}
        benchmarkValue={benchmark ? fixed(benchmark.sharpe) : undefined}
        sub="Return per risk"
        icon={BarChart3}
        positive={metrics.sharpe > 0.5}
      />
      <MetricCard
        label="Max Drawdown"
        value={pct(metrics.maxDrawdown)}
        benchmarkValue={benchmark ? pct(benchmark.maxDrawdown) : undefined}
        sub="Worst Decline"
        icon={TrendingDown}
        positive={false}
      />
      <MetricCard
        label="Calmar Ratio"
        value={fixed(metrics.calmar)}
        benchmarkValue={benchmark ? fixed(benchmark.calmar) : undefined}
        sub="Return / MDD"
        icon={Shield}
        positive={metrics.calmar > 0.3}
      />
      <MetricCard
        label="Total Return"
        value={`${metrics.totalReturn.toFixed(0)}%`}
        benchmarkValue={benchmark ? `${benchmark.totalReturn.toFixed(0)}%` : undefined}
        sub="Since inception"
        icon={Zap}
        positive={metrics.totalReturn > 0}
      />
    </div>
  )
}
