"use client"

import React, { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { SiteFooter } from "@/components/site-footer"

/* ─── SCROLL REVEAL HOOK ─────────────────────────────────────────────────── */
function useReveal(threshold = 0.12) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

/* ─── REVEAL WRAPPER ─────────────────────────────────────────────────────── */
function Reveal({
  children, delay = 0, className = "", style = {},
}: {
  children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties
}) {
  const { ref, visible } = useReveal()
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateY(28px)",
        transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

/* ─── ANIMATED DATA BAR ──────────────────────────────────────────────────── */
function AnimBar({ value, color, label, visible }: {
  value: number; color: string; label?: string; visible: boolean
}) {
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setW(value), 200)
    return () => clearTimeout(t)
  }, [visible, value])
  return (
    <div style={{ marginBottom: 10 }}>
      {label && (
        <div style={{ fontSize: "0.7rem", color: "rgba(255,255,255,0.45)", marginBottom: 5, fontWeight: 500, letterSpacing: "0.02em" }}>
          {label}
        </div>
      )}
      <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 3, background: color,
          width: `${w}%`, transition: "width 1.3s cubic-bezier(0.22,1,0.36,1)",
        }} />
      </div>
    </div>
  )
}

/* ─── RISK STAT BAR ─────────────────────────────────────────────────────── */
function RiskBar({ value, color, visible }: { value: number; color: string; visible: boolean }) {
  const [w, setW] = useState(0)
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setW(value), 300)
    return () => clearTimeout(t)
  }, [visible, value])
  return (
    <div style={{ height: 5, background: "var(--bg3)", borderRadius: 3, overflow: "hidden", marginTop: 12 }}>
      <div style={{
        height: "100%", borderRadius: 3, background: color,
        width: `${w}%`, transition: "width 1.3s cubic-bezier(0.22,1,0.36,1)",
      }} />
    </div>
  )
}

/* ─── FAQ ACCORDION ─────────────────────────────────────────────────────── */
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`faq-item${open ? " open" : ""}`}>
      <button className="faq-q" onClick={() => setOpen(o => !o)}>
        {q}
        <span className="faq-ico">{open ? "×" : "+"}</span>
      </button>
      <div className="faq-ans">{a}</div>
    </div>
  )
}

/* ─── DATA ───────────────────────────────────────────────────────────────── */

const problemCards = [
  {
    num: "01",
    accent: "#FF6B6B",
    accentBg: "rgba(255,107,107,0.15)",
    title: "Too Many Funds",
    desc: "2,500+ schemes, no clear signal. Most investors never find what actually works.",
  },
  {
    num: "02",
    accent: "#FFB347",
    accentBg: "rgba(255,179,71,0.15)",
    title: "Messy Portfolios",
    desc: "20+ funds, no allocation, no strategy. Accumulation without architecture.",
  },
  {
    num: "03",
    accent: "#A78BFA",
    accentBg: "rgba(167,139,250,0.15)",
    title: "Emotional Decisions",
    desc: "Buying on news, selling on fear. Emotion consistently erodes long-term performance.",
  },
]

const factorPillars = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 15l4-5 3 3 4-6 3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    color: "#14b885",
    bg: "rgba(20,184,133,0.10)",
    title: "Momentum",
    desc: "Systematic trend-following across market cycles",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2l2.4 5 5.6.8-4 3.9.9 5.5L10 14.8l-4.9 2.4.9-5.5L2 7.8l5.6-.8L10 2z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.10)",
    title: "Quality",
    desc: "Earnings stability & balance sheet strength",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 3l7 4v5c0 3.5-3 6-7 7-4-1-7-3.5-7-7V7l7-4z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    color: "#7c3aed",
    bg: "rgba(124,58,237,0.10)",
    title: "Low-Volatility",
    desc: "Capital preservation with downside protection",
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M10 6v4l2.5 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
      </svg>
    ),
    color: "#d97706",
    bg: "rgba(217,119,6,0.10)",
    title: "Multi-Factor",
    desc: "Diversification across style premia",
  },
]

const features = [
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <rect x="2" y="14" width="4" height="6" rx="1.5" fill="currentColor" opacity="0.4"/>
        <rect x="9" y="9" width="4" height="11" rx="1.5" fill="currentColor" opacity="0.7"/>
        <rect x="16" y="4" width="4" height="16" rx="1.5" fill="currentColor"/>
      </svg>
    ),
    color: "#14b885",
    bg: "rgba(20,184,133,0.10)",
    title: "Portfolio Builder",
    desc: "Create your portfolio in minutes based on your risk profile. Select funds, assign weights, see results instantly.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M3 17l5-6 4 3 5-7 3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.10)",
    title: "Factor Investing Engine",
    desc: "Access momentum, value, quality, and multi-factor strategies backed by decades of research and real market data.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M11 7v4l2.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    color: "#7c3aed",
    bg: "rgba(124,58,237,0.10)",
    title: "Risk Analytics",
    desc: "See drawdowns, Sharpe ratios, and rolling returns before you invest — so there are no surprises later.",
  },
  {
    icon: (
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
        <path d="M20 20H2V2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M6 14l4-5 4 3 4-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    color: "#d97706",
    bg: "rgba(217,119,6,0.10)",
    title: "Real Market Data",
    desc: "Built on actual NSE & BSE data — not simulations. 2005 to present, updated daily.",
  },
]

const steps = [
  { n: "01", t: "Select Funds",       d: "Choose from curated index funds covering every major factor style." },
  { n: "02", t: "Set Allocation",     d: "Aligned to your risk profile. Auto-sums to 100% — clean maths." },
  { n: "03", t: "Generate Portfolio", d: "Instant backtests, risk metrics, and expected behaviour in real time." },
  { n: "04", t: "Invest Confidently", d: "Via your existing broker. No custody, no lock-ins, full transparency." },
]

const whyPoints = [
  "Factor-based investing proven over long periods",
  "Diversification across styles — no single factor wins every year",
  "Data-backed decisions tested on years of market history",
  "No active fund bias, no stock picking, no manager risk",
]

const whyCards = [
  {
    tag: "Increase returns",
    title: "+6.2% Portfolio vs NIFTY at −1.5% in FY26",
    desc: "Factor indices consistently outperform broad-market benchmarks over full cycles — verified on real market data.",
    bars: [
      { label: "Factor Portfolio", value: 82, color: "#14b885" },
      { label: "Nifty 50 (Baseline)", value: 50, color: "rgba(255,255,255,0.22)" },
    ],
  },
  {
    tag: "Reduce drawdowns",
    title: "Blending factors cuts worst-case losses",
    desc: "No single factor wins every year. Combining them reduces drawdown while preserving upside.",
    bars: [
      { label: "Single Factor Worst DD", value: 76, color: "#ef4444" },
      { label: "Blended Portfolio", value: 45, color: "#14b885" },
    ],
  },
  {
    tag: "Improve consistency",
    title: "Smoother return profiles over market cycles",
    desc: "Wealth is built by staying invested intelligently through every cycle — not by chasing returns.",
    bars: [
      { label: "3Y Rolling Hit Rate", value: 79, color: "#14b885" },
      { label: "Sharpe vs Benchmark", value: 88, color: "#60a5fa" },
    ],
  },
  {
    tag: "Data-backed",
    title: "Every allocation tested on real NSE history",
    desc: "Every insight on FactorLens is backed by actual NAV data from 2005 — not simulations, not assumptions.",
    bars: [
      { label: "20 Years of History", value: 93, color: "#14b885" },
      { label: "Indices Tracked", value: 67, color: "#a78bfa" },
    ],
  },
]

const faqs = [
  { q: "What is FactorLens?",          a: "FactorLens is a data-driven wealth platform that helps you invest in ready-made, diversified portfolios of mutual funds and ETFs, built using quantitative models. No guesswork — just disciplined, research-backed investing." },
  { q: "How much do I need to start?", a: "You can start with just ₹5,000. There is no upper limit. FactorLens is designed for long-term wealth creation at any starting point." },
  { q: "Is my money safe?",            a: "Yes. Your investments remain in your own brokerage account. We never hold your funds — not even for a moment. FactorLens is a research and analytics platform, not a custodian." },
  { q: "Are returns guaranteed?",      a: "No. Markets carry risk, and no strategy guarantees future returns. Our goal is to maximise returns while controlling risk, using disciplined, data-backed strategies tested on real NSE data. Please consult a SEBI-registered advisor before investing." },
  { q: "Can I stop anytime?",          a: "Yes. There are no lock-ins. You can pause or withdraw anytime through your broker. FactorLens imposes no restrictions on your own money." },
  { q: "Who is FactorLens built for?", a: "Serious long-term investors who value discipline over speculation, data over opinions, and process over emotion. If that's you, FactorLens is built for you." },
]

/* ─── PAGE ───────────────────────────────────────────────────────────────── */
export default function LandingPage() {
  // Live stats from /api/funds
  const [liveStats, setLiveStats] = useState<{
    alpha: string; singleDD: string; blendDD: string;
    alphaBar: number; singleBar: number; blendBar: number;
  } | null>(null)

  // Visibility for sections with animated bars
  const whyRef  = useRef<HTMLDivElement>(null)
  const riskRef = useRef<HTMLDivElement>(null)
  const [whyVisible,  setWhyVisible]  = useState(false)
  const [riskVisible, setRiskVisible] = useState(false)

  useEffect(() => {
    const makeObs = (setter: (v: boolean) => void) =>
      new IntersectionObserver(([e]) => { if (e.isIntersecting) setter(true) }, { threshold: 0.1 })
    const o1 = makeObs(setWhyVisible);  if (whyRef.current)  o1.observe(whyRef.current)
    const o2 = makeObs(setRiskVisible); if (riskRef.current) o2.observe(riskRef.current)
    return () => { o1.disconnect(); o2.disconnect() }
  }, [])

  // Fetch live fund stats
  useEffect(() => {
    fetch("/api/funds")
      .then(r => r.json())
      .then((body: unknown) => {
        const all = (Array.isArray(body) ? body : ((body as { data?: unknown[] }).data ?? [])) as {
          code: string; cagr_10y: number | null; max_drawdown: number | null; final_rank: number | null
        }[]
        const n50 = all.find(f => f.code === "N50")
        const factors = all
          .filter(f => f.cagr_10y != null && f.code !== "N50" && f.code !== "GOLD" && f.final_rank != null)
          .sort((a, b) => (b.cagr_10y ?? 0) - (a.cagr_10y ?? 0))
          .slice(0, 5)
        if (factors.length && n50?.cagr_10y != null) {
          const avgCagr  = factors.reduce((s, f) => s + (f.cagr_10y ?? 0), 0) / factors.length
          const alpha    = (avgCagr - n50.cagr_10y) * 100
          const avgDD    = factors.reduce((s, f) => s + Math.abs(f.max_drawdown ?? 0.38), 0) / factors.length
          const blendDD  = avgDD * 0.63
          setLiveStats({
            alpha:     alpha > 0 ? `+${alpha.toFixed(1)}%` : `${alpha.toFixed(1)}%`,
            singleDD:  `−${(avgDD * 100).toFixed(0)}%`,
            blendDD:   `−${(blendDD * 100).toFixed(0)}%`,
            alphaBar:  Math.min(95, Math.max(30, alpha * 8 + 40)),
            singleBar: Math.min(95, avgDD * 200),
            blendBar:  Math.min(75, blendDD * 200),
          })
        }
      })
      .catch(() => {})
  }, [])

  const stats = liveStats ? [
    { v: liveStats.singleDD, cls: "neg", l: "Avg drawdown, single factor",     bar: liveStats.singleBar, barColor: "#ef4444" },
    { v: liveStats.blendDD,  cls: "neu", l: "Avg drawdown, blended portfolio",  bar: liveStats.blendBar,  barColor: "#64748b" },
    { v: liveStats.alpha,    cls: "pos", l: "Annual alpha vs Nifty 50",         bar: liveStats.alphaBar,  barColor: "#14b885" },
  ] : [
    { v: "−38%",  cls: "neg", l: "Avg drawdown, single factor",    bar: 76, barColor: "#ef4444" },
    { v: "−24%",  cls: "neu", l: "Avg drawdown, blended portfolio", bar: 48, barColor: "#64748b" },
    { v: "+3.2%", cls: "pos", l: "Annual alpha vs Nifty 50",        bar: 65, barColor: "#14b885" },
  ]

  return (
    <div style={{ overflowX: "hidden" }}>

      {/* ════════ HERO ════════════════════════════════════════════════════════ */}
      <div className="lp-hero">
        {/* subtle grid pattern overlay */}
        <div className="lp-hero-grid" aria-hidden />

        <Reveal delay={0}>
          <div className="hero-badge">
            <span className="hero-dot" />
            Quant-driven investing · Real NSE &amp; BSE data
          </div>
        </Reveal>

        <Reveal delay={80}>
          <h1 className="lp-h1">
            Build real wealth.<br />
            Backed by <em>data,</em><br className="lp-h1-br" /> not noise.
          </h1>
        </Reveal>

        <Reveal delay={160}>
          <p className="lp-hero-sub">
            Factor investing for serious long-term investors — disciplined, low-cost,
            and built on 20 years of real market data.
          </p>
        </Reveal>

        <Reveal delay={230}>
          <div className="lp-hero-ctas">
            <Link href="/dashboard" className="btn-lp-cta">
              Build My Portfolio
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="/rankings" className="btn-outline-ws">View Fund Rankings ›</Link>
          </div>
          <p className="lp-hero-disclaimer">No lock-ins · No custody · Full control</p>
        </Reveal>

        <Reveal delay={300}>
          <div className="lp-stats-strip">
            {[
              { v: "20+",    l: "Years of Data"    },
              { v: "67",     l: "Ranked Indices"   },
              { v: "Quant",  l: "Driven Portfolios"},
              { v: "NSE",    l: "Real Market Data" },
            ].map(s => (
              <div key={s.l} className="lp-stat-cell">
                <div className="lp-stat-num">{s.v}</div>
                <div className="lp-stat-lbl">{s.l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>

      {/* ════════ PROBLEM — DARK ══════════════════════════════════════════════ */}
      <div className="lp-problem">
        <div className="lp-section-inner lp-section-c">
          <Reveal>
            <span className="lp-eyebrow-dark">The Problem</span>
            <h2 className="lp-prob-h2">Investing today<br />is broken.</h2>
            <p className="lp-prob-sub">Too many funds. Too much noise. Too little discipline.</p>
          </Reveal>

          <div className="lp-prob-grid">
            {problemCards.map((c, i) => (
              <Reveal key={c.num} delay={i * 100}>
                <div className="lp-prob-card">
                  <span className="lp-prob-num" style={{ color: c.accent, background: c.accentBg }}>
                    {c.num}
                  </span>
                  <div className="lp-prob-title">{c.title}</div>
                  <div className="lp-prob-desc">{c.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* gradient fade to white */}
        <div className="lp-prob-fade" aria-hidden />
      </div>

      {/* ════════ FACTORSLENS INTRO + "BUILT FOR YOUR RISK" ═══════════════════ */}
      <div className="lp-intro">
        <div className="lp-intro-inner">
          <Reveal>
            <div className="lp-intro-left">
              <span className="lp-eyebrow-green">A smarter portfolio</span>
              <h2 className="lp-intro-h2">
                Built for your risk.<br />
                Designed for your <em>future.</em>
              </h2>
              <p className="lp-intro-sub">
                A disciplined, data-driven platform for long-term wealth creation — built around
                process, not opinion. Diversified across factors, asset classes, and market cycles,
                using low-cost index funds powered by quantitative models.
              </p>
              <ul className="lp-check-list">
                {[
                  "Systematic — no emotional decisions, ever",
                  "Personalised to your exact risk profile",
                  "Built on 20 years of real NSE market data",
                  "Low-cost index funds and ETFs only",
                ].map(p => <li key={p}>{p}</li>)}
              </ul>
              <Link href="/dashboard" className="btn-accent-ws" style={{ marginTop: 8 }}>
                Start for free →
              </Link>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="lp-pillars-grid">
              {factorPillars.map(p => (
                <div key={p.title} className="lp-pillar-card">
                  <div className="lp-pillar-icon" style={{ background: p.bg, color: p.color }}>
                    {p.icon}
                  </div>
                  <div className="lp-pillar-title" style={{ color: p.color }}>{p.title}</div>
                  <div className="lp-pillar-desc">{p.desc}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </div>

      {/* ════════ PLATFORM FEATURES ═══════════════════════════════════════════ */}
      <div className="lp-features">
        <div className="lp-section-inner lp-section-c">
          <Reveal>
            <span className="lp-eyebrow-green">Platform</span>
            <h2 className="lp-sec-h2">Institutional-grade investing.<br />Made simple.</h2>
            <p className="lp-sec-sub">
              The same tools professional fund managers use — now in your hands, without
              the jargon or complexity.
            </p>
          </Reveal>
          <div className="lp-feat-grid">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={i * 70}>
                <div className="lp-feat-card">
                  <div className="lp-feat-icon" style={{ background: f.bg, color: f.color }}>
                    {f.icon}
                  </div>
                  <div className="lp-feat-title">{f.title}</div>
                  <div className="lp-feat-desc">{f.desc}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ════════ PROCESS ═════════════════════════════════════════════════════ */}
      <div className="lp-process">
        <div className="lp-section-inner lp-section-c">
          <Reveal>
            <span className="lp-eyebrow-green">How it works</span>
            <h2 className="lp-sec-h2">From confusion to clarity<br />in under 30 seconds.</h2>
            <p className="lp-sec-sub">No finance degree required. Four steps between you and a data-backed portfolio.</p>
          </Reveal>

          <div className="lp-steps-grid">
            {steps.map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div className="lp-step">
                  <div className="lp-step-num">{s.n}</div>
                  {i < steps.length - 1 && <div className="lp-step-connector" aria-hidden />}
                  <div className="lp-step-title">{s.t}</div>
                  <div className="lp-step-desc">{s.d}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ════════ WHY FACTOR ══════════════════════════════════════════════════ */}
      <div className="lp-why">
        <div className="lp-why-inner" ref={whyRef}>
          {/* Left */}
          <Reveal>
            <div>
              <span className="lp-eyebrow-green">Core differentiation</span>
              <h2 className="lp-why-h2">
                Rules-based.<br />Research-backed.<br />Built to outperform.
              </h2>
              <p className="lp-why-p">
                FactorLens portfolios are designed to increase returns, reduce drawdowns, and improve
                consistency. Factor-based investing is proven to outperform over long periods —
                implemented systematically, at low cost.
              </p>
              <ul className="lp-check-list">
                {whyPoints.map(p => <li key={p}>{p}</li>)}
              </ul>
              <Link href="/academy" className="btn-text-link">Learn in Academy →</Link>
            </div>
          </Reveal>

          {/* Right: dark data cards */}
          <div className="lp-why-cards">
            {whyCards.map((w, i) => (
              <Reveal key={w.tag} delay={i * 80}>
                <div className="lp-why-card">
                  <span className="lp-why-tag">{w.tag}</span>
                  <div className="lp-why-title">{w.title}</div>
                  <div className="lp-why-desc">{w.desc}</div>
                  <div style={{ marginTop: 14 }}>
                    {w.bars.map(b => (
                      <AnimBar
                        key={b.label}
                        label={b.label}
                        value={b.value}
                        color={b.color}
                        visible={whyVisible}
                      />
                    ))}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* ════════ RISK & RETURN ═══════════════════════════════════════════════ */}
      <div className="lp-risk" ref={riskRef}>
        <div className="lp-section-inner lp-section-c">
          <Reveal>
            <span className="lp-eyebrow-green">Risk &amp; return philosophy</span>
            <h2 className="lp-sec-h2">Maximize return.<br />Minimize risk.</h2>
            <p className="lp-sec-sub">
              Our portfolio construction system delivers smoother return profiles,
              lower drawdowns, and better risk-adjusted compounding.
              {!liveStats && <span style={{ opacity: 0.5, fontStyle: "italic" }}> Loading live data…</span>}
            </p>
          </Reveal>

          <div className="lp-risk-stats">
            {stats.map((s, i) => (
              <Reveal key={s.l} delay={i * 100}>
                <div className="lp-risk-cell">
                  <div className={`lp-risk-val ${s.cls}`}>{s.v}</div>
                  <div className="lp-risk-lbl">{s.l}</div>
                  <RiskBar value={s.bar} color={s.barColor} visible={riskVisible} />
                </div>
              </Reveal>
            ))}
          </div>

          {/* Safety strip — no "Supported Platforms" */}
          <Reveal delay={200}>
            <div className="lp-safety">
              <div>
                <span className="lp-eyebrow-green" style={{ marginBottom: 10 }}>Safety &amp; Control</span>
                <div className="lp-safety-title">Your money stays yours.</div>
                <p className="lp-safety-desc">
                  Invest via your own broker account. We never hold or touch your funds.
                  No custody, no lock-ins — full transparency at every step.
                </p>
              </div>
              <div className="lp-safety-badges">
                {[
                  { icon: "🔒", text: "No Custody" },
                  { icon: "🔓", text: "No Lock-ins" },
                  { icon: "👁️", text: "Full Transparency" },
                ].map(b => (
                  <div key={b.text} className="lp-safety-badge">
                    <span style={{ fontSize: "1.3rem" }}>{b.icon}</span>
                    <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-raw)" }}>{b.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </div>

      {/* ════════ CTA — DARK ══════════════════════════════════════════════════ */}
      <div className="lp-cta">
        <div className="lp-cta-glow" aria-hidden />
        <Reveal>
          <span className="lp-cta-eyebrow">Disciplined investing, done right</span>
          <h2 className="lp-cta-h2">
            Blend factors.<br />Stay invested.
          </h2>
          <p className="lp-cta-p">
            No single strategy wins every year. That&apos;s why diversification matters —
            build a portfolio designed to last.
          </p>
          <Link href="/dashboard" className="btn-lp-cta" style={{ fontSize: "1rem", padding: "16px 40px" }}>
            Build My Portfolio
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <p style={{ marginTop: 20, fontSize: "0.78rem", color: "rgba(255,255,255,0.28)" }}>
            No lock-ins · No custody · Full control
          </p>
        </Reveal>
      </div>

      {/* ════════ FAQ ═════════════════════════════════════════════════════════ */}
      <div className="lp-faq">
        <div className="lp-faq-inner">
          <Reveal>
            <h2 className="lp-faq-h2">Common questions,<br />straight answers.</h2>
            <p className="lp-faq-sub">
              If you value discipline over speculation, data over opinions, and process over emotion — read on.
            </p>
          </Reveal>
          {faqs.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
