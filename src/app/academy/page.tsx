"use client"

import Link from "next/link"
import { ArrowRight, BookOpen, TrendingUp, Shield, BarChart3, Layers, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const sections = [
  {
    id: "passive",
    icon: BookOpen,
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    accent: "border-indigo-200/60 dark:border-indigo-800/40",
    title: "What is Passive Investing?",
    content: [
      "Passive investing means buying and holding a basket of securities that mirrors an index — without trying to pick individual winners or time the market.",
      "Instead of paying a fund manager to make active decisions, you simply own the market. Research consistently shows that over long periods, most active funds fail to beat their benchmarks after fees.",
      "Index funds — especially factor-based ones — give you low-cost, diversified exposure to proven return drivers.",
    ],
    facts: [
      "80%+ of active large-cap funds underperform their benchmarks over 10 years",
      "Expense ratios: Active funds 1.5–2.5% vs Index funds 0.1–0.5%",
      "No manager risk, no style drift, no surprises",
    ],
  },
  {
    id: "factor",
    icon: BarChart3,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-950/30",
    accent: "border-violet-200/60 dark:border-violet-800/40",
    title: "What is Factor Investing?",
    content: [
      "Factor investing selects stocks based on specific characteristics — called 'factors' — that academic research has linked to higher long-term returns.",
      "These factors are systematic and rules-based. They remove human emotion from the equation and have been validated across multiple markets and decades.",
      "NSE India offers 20+ factor indices that are tracked by low-cost index funds, making them accessible to every investor.",
    ],
    factors: [
      { name: "Momentum", desc: "Stocks that have recently risen tend to keep rising", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
      { name: "Quality", desc: "High ROE, low debt, stable earnings companies", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
      { name: "Low Volatility", desc: "Less volatile stocks with better risk-adjusted returns", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
      { name: "Value", desc: "Undervalued companies with strong fundamentals", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
      { name: "Alpha", desc: "Stocks with high excess returns vs market beta", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
      { name: "Multi-Factor", desc: "Blend of multiple factors for diversified exposure", color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
    ],
  },
  {
    id: "diversification",
    icon: Layers,
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    accent: "border-teal-200/60 dark:border-teal-800/40",
    title: "Why Diversification Matters",
    content: [
      "No single factor wins every year. Momentum is powerful in bull markets but can crash hard during reversals. Low Volatility protects in downturns but lags in rallies.",
      "By combining multiple factors and market-cap segments, you reduce concentration risk, smooth out return variability, and lower your worst-case drawdown.",
      "Our 20-year backtest data shows that blended portfolios consistently achieve better risk-adjusted returns than single-factor bets.",
    ],
    comparison: [
      { label: "Single Factor (avg)", cagr: "18.5%", dd: "−55%", sharpe: "0.89" },
      { label: "2-Factor Blend", cagr: "19.2%", dd: "−48%", sharpe: "1.05" },
      { label: "4-Factor Blend", cagr: "19.8%", dd: "−40%", sharpe: "1.24" },
      { label: "Nifty 50 (benchmark)", cagr: "12.7%", dd: "−60%", sharpe: "0.61" },
    ],
  },
  {
    id: "active-vs-passive",
    icon: TrendingUp,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    accent: "border-amber-200/60 dark:border-amber-800/40",
    title: "Active vs Passive: What the Data Says",
    content: [
      "The debate between active and passive investing has been settled by data. Over a 20-year horizon, passive factor investing consistently outperforms active stock picking on a risk-adjusted basis.",
      "Active managers charge higher fees, change strategies, face key-person risk, and often underperform benchmarks. Factor indices, by contrast, are transparent, low-cost, and mechanically disciplined.",
    ],
    comparison: [
      { label: "Active Large-Cap Funds", pro: "Manager expertise", con: "High fees (1.8–2.5%), frequent underperformance" },
      { label: "Nifty 50 Index Fund", pro: "Low cost, full market return", con: "No factor premium" },
      { label: "Factor Index Funds", pro: "Low cost + proven premium returns", con: "Slightly more complex to understand" },
    ],
  },
  {
    id: "backtest",
    icon: Shield,
    color: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-50 dark:bg-rose-950/30",
    accent: "border-rose-200/60 dark:border-rose-800/40",
    title: "20-Year Backtest Results",
    content: [
      "FactorLens is powered by actual NSE index NAV data from April 2005 to February 2026 — 5,189 daily data points per fund.",
      "Every CAGR, Sharpe ratio, drawdown, and rolling return you see is computed from this real data, not simulations or hypothetical assumptions.",
      "The top-ranked multi-factor funds delivered 18–22% CAGR over this period, compared to 12.7% for Nifty 50.",
    ],
    highlights: [
      { metric: "Best CAGR (Fund)", value: "~22%", fund: "NIFTY500 MULTIFACTOR MQVLv 50" },
      { metric: "Nifty 50 CAGR", value: "12.7%", fund: "Benchmark" },
      { metric: "Data Period", value: "Apr 2005 – Feb 2026", fund: "5,189 trading days" },
      { metric: "Funds Tracked", value: "28 NSE Indices", fund: "Broad, Factor, Strategy" },
    ],
  },
]

const tocLabels: Record<string, string> = {
  passive: "Passive Investing",
  factor: "Factor Investing",
  diversification: "Diversification",
  "active-vs-passive": "Active vs Passive",
  backtest: "Backtest Results",
}

export default function AcademyPage() {
  return (
    <div className="min-h-screen bg-muted/20">

      {/* Hero */}
      <div className="bg-gradient-to-b from-violet-950 via-violet-900/80 to-muted/20 pt-14 pb-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <Badge className="mb-4 bg-violet-100/20 text-violet-200 border-violet-500/30 text-[11px] font-bold">
            Education Hub
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4 tracking-tight">
            FactorLens Academy
          </h1>
          <p className="text-violet-200/80 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Everything you need to understand passive investing, factor strategies, and portfolio construction.
            Simple language, real data, no jargon.
          </p>
        </div>
      </div>

      {/* Sticky TOC */}
      <div className="sticky top-[60px] z-30 bg-background/95 backdrop-blur border-b border-border/60">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="flex gap-0.5 overflow-x-auto py-2.5 no-scrollbar">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-accent transition-colors whitespace-nowrap flex-shrink-0"
              >
                {tocLabels[s.id]}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10 space-y-14">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-28">

            {/* Section header */}
            <div className="flex items-center gap-3 mb-5">
              <div className={cn("p-2.5 rounded-xl flex-shrink-0", section.bg)}>
                <section.icon className={cn("h-5 w-5", section.color)} />
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{section.title}</h2>
            </div>

            {/* Body text */}
            <div className="space-y-3.5 text-muted-foreground leading-relaxed mb-6 text-sm sm:text-[15px]">
              {section.content.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            {/* Passive facts */}
            {'facts' in section && (
              <div className="space-y-2">
                {(section as { facts: string[] }).facts.map((fact, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-muted/40 border border-border/40">
                    <CheckCircle2 className="h-4 w-4 text-teal-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{fact}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Factor cards */}
            {'factors' in section && (
              <div className="grid sm:grid-cols-2 gap-3">
                {(section as { factors: { name: string; desc: string; color: string }[] }).factors.map((f) => (
                  <div key={f.name} className="rounded-xl border border-border/60 bg-card p-4 flex items-start gap-3">
                    <Badge className={cn("text-[10px] flex-shrink-0 font-bold", f.color)}>{f.name}</Badge>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Diversification table */}
            {'comparison' in section && section.id === 'diversification' && (
              <div className="overflow-x-auto rounded-xl border border-border/60 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60">
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Strategy</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">CAGR</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Max DD</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Sharpe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(section as { comparison: { label: string; cagr: string; dd: string; sharpe: string }[] }).comparison.map((row, i) => (
                      <tr key={row.label} className={cn("border-b border-border/40 last:border-0", i % 2 !== 0 && "bg-muted/15")}>
                        <td className="px-4 py-3 font-medium text-sm">{row.label}</td>
                        <td className="px-4 py-3 text-emerald-600 dark:text-emerald-400 font-bold font-mono">{row.cagr}</td>
                        <td className="px-4 py-3 text-red-500 font-mono">{row.dd}</td>
                        <td className="px-4 py-3 font-mono">{row.sharpe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[10px] text-muted-foreground px-4 py-2.5 border-t border-border/40 bg-muted/10">
                  * Illustrative averages based on 20-year NSE backtest data
                </p>
              </div>
            )}

            {/* Active vs passive comparison */}
            {'comparison' in section && section.id === 'active-vs-passive' && (
              <div className="space-y-3">
                {(section as { comparison: { label: string; pro: string; con: string }[] }).comparison.map((item) => (
                  <div key={item.label} className="rounded-xl border border-border/60 bg-card p-4">
                    <h4 className="font-semibold text-sm mb-3">{item.label}</h4>
                    <div className="grid sm:grid-cols-2 gap-2.5">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-teal-500 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-muted-foreground leading-relaxed">{item.pro}</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-muted-foreground leading-relaxed">{item.con}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Backtest highlights */}
            {'highlights' in section && (
              <div className="grid sm:grid-cols-2 gap-3">
                {(section as { highlights: { metric: string; value: string; fund: string }[] }).highlights.map((h) => (
                  <div key={h.metric} className="rounded-xl border border-border/60 bg-card p-4">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-2">{h.metric}</p>
                    <p className="text-2xl font-bold metric-value text-primary tabular-nums">{h.value}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">{h.fund}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}

        {/* CTA */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-indigo-900/80 p-8 sm:p-10 text-center">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 tracking-tight">
            Ready to Build Your Portfolio?
          </h2>
          <p className="text-indigo-200/80 mb-7 max-w-md mx-auto text-sm sm:text-base leading-relaxed">
            Apply what you&apos;ve learned. Select funds, set weights, and see exactly how your portfolio
            would have performed over 20 years.
          </p>
          <Link href="/dashboard">
            <Button
              size="lg"
              className="bg-gradient-to-r from-indigo-500 to-teal-500 hover:from-indigo-600 hover:to-teal-600 text-white border-0 px-8 h-12 font-bold shadow-lg shadow-indigo-900/40"
            >
              Build My Portfolio <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Bottom spacer for mobile */}
        <div className="h-4" />
      </div>
    </div>
  )
}
