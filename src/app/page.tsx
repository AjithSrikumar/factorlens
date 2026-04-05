"use client"

import { useState } from "react"
import Link from "next/link"
import { SiteFooter } from "@/components/site-footer"

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const heroStats = [
  { v: "20+",    l: "Years of Data"       },
  { v: "2,500+", l: "Funds Analysed"      },
  { v: "Quant",  l: "Driven Portfolios"   },
  { v: "NSE & BSE", l: "Real Market Data" },
]

const problemCards = [
  {
    icon: <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="9" stroke="var(--text-muted)" strokeWidth="1.5"/><path d="M11 7v5l3 2" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    iconBg: "var(--bg3)",
    title: "Too Many Funds",
    desc:  "2,500+ schemes, no clear signal. Most investors never find what actually works.",
  },
  {
    icon: <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M4 16l4-4 3 3 4-5 3 2" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><rect x="2" y="4" width="18" height="14" rx="2" stroke="var(--text-muted)" strokeWidth="1.5"/></svg>,
    iconBg: "var(--bg3)",
    title: "Messy Portfolios",
    desc:  "20+ funds, no allocation, no strategy. Accumulation without architecture.",
  },
  {
    icon: <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 3v4M11 15v4M4.22 4.22l2.83 2.83M14.95 14.95l2.83 2.83M3 11h4M15 11h4M4.22 17.78l2.83-2.83M14.95 7.05l2.83-2.83" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    iconBg: "var(--bg3)",
    title: "Emotional Decisions",
    desc:  "Buying on news, selling on fear. Emotion consistently erodes long-term performance.",
  },
  {
    icon: <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M5 12l4 4 8-8" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    iconBg: "var(--accent-light)",
    title: "Meet FactorLens",
    desc:  "A disciplined, data-driven partner for long-term wealth creation — built around process, not opinion.",
  },
]

const platformCards = [
  {
    icon: <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><rect x="2" y="14" width="4" height="6" rx="1" stroke="var(--text-muted)" strokeWidth="1.5"/><rect x="9" y="9" width="4" height="11" rx="1" stroke="var(--text-muted)" strokeWidth="1.5"/><rect x="16" y="4" width="4" height="16" rx="1" stroke="var(--text-muted)" strokeWidth="1.5"/></svg>,
    title: "Portfolio Builder",
    desc:  "Create your portfolio in minutes — based on your goals and risk profile. Select funds, assign weights, see results instantly.",
  },
  {
    icon: <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M3 17l5-6 4 3 5-7 3 3" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
    title: "Factor Investing Engine",
    desc:  "Access momentum, value, quality, and multi-factor strategies backed by decades of research and real market data.",
  },
  {
    icon: <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 3a8 8 0 100 16A8 8 0 0011 3z" stroke="var(--text-muted)" strokeWidth="1.5"/><path d="M11 7v4l3 2" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round"/></svg>,
    title: "Risk Analytics",
    desc:  "See drawdowns, Sharpe ratios, and rolling returns before you invest — so there are no surprises later.",
  },
  {
    icon: <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><ellipse cx="11" cy="11" rx="9" ry="5" stroke="var(--text-muted)" strokeWidth="1.5"/><path d="M2 11c0 2.76 4.03 5 9 5s9-2.24 9-5" stroke="var(--text-muted)" strokeWidth="1.5"/><path d="M2 7.5C2 10.26 6.03 12.5 11 12.5S20 10.26 20 7.5" stroke="var(--text-muted)" strokeWidth="1.5"/></svg>,
    title: "Real Market Data",
    desc:  "Built on actual NSE & BSE data — not simulations or assumptions. 2005 to present, updated continuously.",
  },
]

const steps = [
  { n: "01", t: "Select Funds",          d: "Choose from curated index funds and ETFs covering every major factor style." },
  { n: "02", t: "Set Your Allocation",   d: "Aligned to your risk profile and goals. They auto-sum to 100% — the maths is always clean." },
  { n: "03", t: "Generate Portfolio",    d: "Instant backtests, risk metrics, and expected behaviour — computed in real time." },
  { n: "04", t: "Invest with Confidence",d: "Use your existing broker account. No custody, no lock-ins, full transparency." },
]

const whyPoints = [
  "Factor-based investing proven over long periods",
  "Diversification across styles — no single factor wins every year",
  "Data-backed decisions tested on years of market history",
  "No active fund bias, no stock picking, no manager risk",
]

const whyCards = [
  { tag: "Increase returns",    t: "+6.2% Portfolio vs NIFTY at −1.5% in FY26",      d: "Factor indices like Momentum and Quality have a consistent long-term edge over broad-market benchmarks — verified on real market data." },
  { tag: "Reduce drawdowns",    t: "Blending factors cuts worst-case losses",           d: "No single factor wins every year. Combining them reduces drawdown while preserving upside — improving risk-adjusted returns." },
  { tag: "Improve consistency", t: "Smoother return profiles over market cycles",       d: "Because wealth isn't built by chasing returns — it's built by staying invested intelligently through every cycle." },
  { tag: "Data-backed decisions",t: "Every allocation tested on real NSE history",      d: "Every insight on FactorLens is backed by actual NSE NAV data from 2005 — not simulations, not assumptions." },
]

const divStats = [
  { v: "−38%",  cls: "neg", l: "Avg drawdown, single factor"       },
  { v: "−24%",  cls: "neu", l: "Avg drawdown, blended portfolio"   },
  { v: "+3.2%", cls: "pos", l: "Annual outperformance vs Nifty 50" },
]

const faqs = [
  { q: "What is FactorLens?",             a: "FactorLens is a data-driven wealth platform that helps you invest in ready-made, diversified portfolios of mutual funds and ETFs, built using quantitative models. No guesswork — just disciplined, research-backed investing." },
  { q: "How much do I need to start?",    a: "You can start with just ₹5,000. There is no upper limit. FactorLens is designed for long-term wealth creation at any starting point." },
  { q: "Is my money safe?",               a: "Yes. Your investments remain in your own brokerage account. We never hold your funds — not even for a moment. FactorLens is a research and analytics platform, not a custodian." },
  { q: "Are returns guaranteed?",         a: "No. Markets carry risk, and no strategy guarantees future returns. Our goal is to maximize returns while controlling risk, using disciplined, data-backed strategies tested on real NSE data. Please consult a SEBI-registered advisor before investing." },
  { q: "Can I stop anytime?",             a: "Yes. There are no lock-ins. You can pause or withdraw anytime through your broker. FactorLens imposes no restrictions on your own money." },
  { q: "Who is FactorLens built for?",    a: "Serious long-term investors who value discipline over speculation, data over opinions, and process over emotion. If that's you, FactorLens is built for you." },
]

/* ─────────────────────────────────────────
   LOGO ICON
───────────────────────────────────────── */
function LogoIcon() {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "var(--radius-sm)",
      background: "var(--text-raw)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg viewBox="0 0 18 18" fill="none" style={{ width: 16, height: 16 }}>
        <rect x="2"   y="10" width="3" height="6"  rx="1" fill="white"/>
        <rect x="7.5" y="6"  width="3" height="10" rx="1" fill="white"/>
        <rect x="13"  y="2"  width="3" height="14" rx="1" fill="white"/>
      </svg>
    </div>
  )
}

/* ─────────────────────────────────────────
   FAQ ITEM (accordion)
───────────────────────────────────────── */
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

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div>

      {/* ══ HERO ═══════════════════════════════════════════════════ */}
      <div className="hero">
        <div className="hero-badge anim-1">
          <span className="hero-dot" />
          Quant-driven investing · Real NSE &amp; BSE data
        </div>

        <h1 className="anim-2">
          Build real wealth.<br />
          Backed by <em>data,</em> not noise.
        </h1>

        <p className="hero-sub anim-3">
          Factor investing for serious long-term investors — disciplined, low-cost,
          and built on 20 years of real market data.
        </p>

        <div className="hero-ctas anim-4">
          <Link href="/dashboard" className="btn-accent-ws">Build My Portfolio →</Link>
          <Link href="/rankings"  className="btn-outline-ws">View Fund Rankings ›</Link>
        </div>

        <p className="anim-4" style={{ fontSize: "0.78rem", color: "var(--text-dim)", marginBottom: 28, marginTop: -12 }}>
          No lock-ins. No custody. Full control.
        </p>

        <div className="stats-strip anim-5">
          {heroStats.map(s => (
            <div key={s.l} className="stat-cell">
              <div className="stat-num">{s.v}</div>
              <div className="stat-lbl">{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ THE PROBLEM ════════════════════════════════════════════ */}
      <div className="plat-bg">
        <div className="section section-c">
          <p className="eyebrow">The Problem</p>
          <h2 className="sec-h2">Investing today<br />is broken.</h2>
          <p className="sec-sub">Too many funds. Too much noise. Too little discipline. FactorLens fixes this.</p>
          <div className="cards-grid">
            {problemCards.map(c => (
              <div key={c.title} className="plat-card">
                <div className="pc-ico" style={{ background: c.iconBg }}>{c.icon}</div>
                <div className="pc-t">{c.title}</div>
                <div className="pc-d">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ VALUE PROP ═════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <div className="section section-c">
          <p className="eyebrow">A smarter portfolio</p>
          <h2 className="sec-h2">Built for your risk.<br />Designed for your future.</h2>
          <p className="sec-sub">
            Diversified across factors, asset classes, and market cycles. Built using low-cost index funds and ETFs.
            Continuously monitored and rebalanced. All powered by quantitative models — not opinions.
          </p>
        </div>
      </div>

      {/* ══ PLATFORM ═══════════════════════════════════════════════ */}
      <div className="plat-bg">
        <div className="section section-c">
          <p className="eyebrow">Platform</p>
          <h2 className="sec-h2">Institutional-grade investing.<br />Made simple.</h2>
          <p className="sec-sub">
            The same tools professional fund managers use — now in your hands,
            without the jargon or complexity.
          </p>
          <div className="cards-grid">
            {platformCards.map(c => (
              <div key={c.title} className="plat-card">
                <div className="pc-ico">{c.icon}</div>
                <div className="pc-t">{c.title}</div>
                <div className="pc-d">{c.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ══ PROCESS ════════════════════════════════════════════════ */}
      <div className="section section-c">
        <p className="eyebrow">Process</p>
        <h2 className="sec-h2">From confusion to clarity<br />in under 30 seconds.</h2>
        <p className="sec-sub">No finance degree required. Four steps between you and a data-backed portfolio.</p>
        <div className="steps-grid">
          {steps.map(s => (
            <div key={s.n} className="step">
              <div className="step-line" />
              <div className="step-n">{s.n}</div>
              <div className="step-t">{s.t}</div>
              <div className="step-d">{s.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ WHY FACTOR ═════════════════════════════════════════════ */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <div className="section">
          <p className="eyebrow">Core differentiation</p>
          <div className="why-grid">
            {/* Left */}
            <div>
              <h2 className="why-h2">Rules-based.<br />Research-backed.<br />Built to outperform.</h2>
              <p className="why-p">
                FactorLens portfolios are designed to increase returns, reduce drawdowns, and improve consistency.
                Factor-based investing is proven to outperform over long periods — implemented systematically, at low cost.
              </p>
              <ul className="check-list">
                {whyPoints.map(p => <li key={p}>{p}</li>)}
              </ul>
              <Link href="/academy" className="btn-text-link">Learn in Academy →</Link>
            </div>
            {/* Right: 2×2 cards */}
            <div className="why-cards">
              {whyCards.map(w => (
                <div key={w.t} className="why-card">
                  <div className="wc-tag">{w.tag}</div>
                  <div className="wc-t">{w.t}</div>
                  <div className="wc-d">{w.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ══ DIVERSIFICATION ════════════════════════════════════════ */}
      <div className="div-bg">
        <div className="section section-c">
          <p className="eyebrow">Risk &amp; return philosophy</p>
          <h2 className="sec-h2">Maximize return.<br />Minimize risk.</h2>
          <p className="sec-sub">
            Our portfolio construction system is designed to reduce volatility and drawdowns, deliver smoother
            return profiles, and stay aligned with long-term compounding.
          </p>
          <div className="div-stats">
            {divStats.map(s => (
              <div key={s.l} className="dv-cell">
                <div className={`dv-val ${s.cls}`}>{s.v}</div>
                <div className="dv-lbl">{s.l}</div>
              </div>
            ))}
          </div>

          {/* Safety strip */}
          <div style={{
            marginTop: 48, background: "var(--surface)", border: "1px solid var(--border-mid)",
            borderRadius: "var(--radius-lg)", padding: "36px 40px",
            textAlign: "left", display: "flex", justifyContent: "space-between",
            alignItems: "center", gap: 40, flexWrap: "wrap",
          }}>
            <div>
              <div className="eyebrow" style={{ marginBottom: 10 }}>Safety &amp; Control</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: "1.5rem", letterSpacing: "-0.02em", marginBottom: 8 }}>
                Your money stays yours.
              </div>
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", lineHeight: 1.7, maxWidth: 320 }}>
                Invest via your own broker. No custody, no lock-ins, full transparency at every step.
              </p>
            </div>
            <div>
              <div style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-dim)", marginBottom: 16 }}>
                Supported Platforms
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, maxWidth: 340 }}>
                {["Groww", "Zerodha", "Upstox", "ICICI Direct", "Angel One", "Paytm Money"].map(name => (
                  <div key={name} style={{
                    background: "var(--bg2)", border: "1px solid var(--border-mid)",
                    borderRadius: "var(--radius-md)", padding: "10px 14px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <span style={{ fontSize: "0.78rem", fontWeight: 600, color: "var(--text-raw)" }}>{name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══ CTA ════════════════════════════════════════════════════ */}
      <div className="cta-section">
        <p className="eyebrow" style={{ marginBottom: 14 }}>Disciplined investing, done right</p>
        <h2>Blend factors.<br />Stay invested.</h2>
        <p>No single strategy wins every year. That&apos;s why diversification matters — build a portfolio designed to last.</p>
        <Link href="/dashboard" className="btn-accent-ws" style={{ fontSize: "0.95rem", padding: "12px 30px" }}>
          Build My Portfolio →
        </Link>
      </div>

      {/* ══ FAQ ════════════════════════════════════════════════════ */}
      <div style={{ background: "var(--bg2)", borderTop: "1px solid var(--border)" }}>
        <div className="faq-wrap">
          <h2>Common questions,<br />straight answers.</h2>
          <p className="faq-sub">If you value discipline over speculation, data over opinions, and process over emotion — read on.</p>
          {faqs.map(f => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </div>

      {/* ══ FOOTER ═════════════════════════════════════════════════ */}
      <SiteFooter />
    </div>
  )
}
