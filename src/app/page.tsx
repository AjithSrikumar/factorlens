"use client"

import Link from "next/link"
import { ArrowRight, ChevronRight, TrendingUp, Shield, BarChart2, Database } from "lucide-react"

/* ── Category Color Helpers ──────────────────────────────────────── */
const CAT = {
  blue:   { bg: "rgba(79,128,255,0.12)",  border: "rgba(79,128,255,0.20)",  text: "#93BFFF"  },
  green:  { bg: "rgba(16,185,129,0.12)",  border: "rgba(16,185,129,0.20)",  text: "#6EE7B7"  },
  amber:  { bg: "rgba(245,158,11,0.12)",  border: "rgba(245,158,11,0.20)",  text: "#FCD34D"  },
  purple: { bg: "rgba(139,92,246,0.12)",  border: "rgba(139,92,246,0.20)",  text: "#C4B5FD"  },
}

const features = [
  {
    icon: <BarChart2 size={20} />, cat: CAT.blue,
    title: "Portfolio Builder",
    desc: "Select up to 10 factor funds, allocate weights, and compute exact historical performance — in real time.",
  },
  {
    icon: <TrendingUp size={20} />, cat: CAT.green,
    title: "Factor Strategies",
    desc: "Access momentum, quality, low-vol, alpha and multi-factor strategies backed by NSE index data.",
  },
  {
    icon: <Shield size={20} />, cat: CAT.amber,
    title: "Risk Analytics",
    desc: "Sharpe, Sortino, Calmar ratios. Max drawdown, volatility, rolling 3-year returns — all computed live.",
  },
  {
    icon: <Database size={20} />, cat: CAT.purple,
    title: "Real NSE Data",
    desc: "140K+ daily NAV data points from actual NSE index series. 2005 to present. No simulations.",
  },
]

const steps = [
  { n: "01", title: "Select Funds",       desc: "Pick from 28 NSE factor and broad-market indices." },
  { n: "02", title: "Set Weights",        desc: "Adjust sliders — they auto-sum to 100%." },
  { n: "03", title: "Run Backtest",       desc: "Instant CAGR, Sharpe, Drawdown, and more." },
  { n: "04", title: "Analyse & Decide",   desc: "Interactive charts vs Nifty 50 benchmark." },
]

const whyPoints = [
  "Systematic, not emotional",
  "Low-cost index funds",
  "Diversified across factors",
  "Decades of academic research",
]

const whyCards = [
  { title: "Beat the Market",     desc: "Momentum & Quality indices have outperformed Nifty 50 by 4–8% annually over 20 years." },
  { title: "Passive. Low Cost.",  desc: "Rule-based — no active manager, no high fees, no stock-picking guesswork." },
  { title: "Diversify by Factor", desc: "Combining factors reduces drawdown and smooths returns. The data proves it." },
  { title: "Data-Backed",         desc: "Every allocation backed by 20 years of real NSE price history." },
]

const divStats = [
  { v: "−38%",  l: "Avg drawdown, single factor" },
  { v: "−24%",  l: "Avg drawdown, blended portfolio" },
  { v: "+3.2%", l: "Annual alpha vs Nifty 50" },
]

const heroStats = [
  { v: "20+",   l: "Years Data" },
  { v: "28",    l: "NSE Funds" },
  { v: "140K+", l: "Data Points" },
  { v: "8",     l: "Risk Metrics" },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen landing-hero-offset">

      {/* ══════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════ */}
      <section style={{
        background: "#080B14",
        padding: "80px 20px 96px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Mesh gradient */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: `
            radial-gradient(ellipse 80% 60% at 50% -10%, rgba(79,128,255,.18) 0%, transparent 65%),
            radial-gradient(ellipse 40% 35% at 80% 80%, rgba(16,185,129,.08) 0%, transparent 55%)
          `,
        }} />

        {/* Grid lines */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.03,
          backgroundImage: "linear-gradient(rgba(148,163,184,1) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }} />

        <div style={{ maxWidth: 740, margin: "0 auto", position: "relative", zIndex: 1, textAlign: "center" }}>

          {/* Status badge */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7,
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 100, padding: "5px 14px", marginBottom: 32,
            fontSize: 11, fontWeight: 600, letterSpacing: "0.8px", textTransform: "uppercase" as const,
            color: "rgba(148,163,184,0.65)", backdropFilter: "blur(10px)",
          }}>
            <span className="hero-pulse-dot" />
            NSE Factor Investing · 2005–2026
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: "var(--font-serif), 'Instrument Serif', Georgia, serif",
            fontSize: "clamp(38px, 6.5vw, 68px)",
            fontWeight: 400,
            lineHeight: 1.06,
            letterSpacing: "-2px",
            color: "#F1F5F9",
            marginBottom: 20,
          }}>
            Build smarter<br />
            portfolios.{" "}
            <em style={{ fontStyle: "italic" }} className="gradient-text-blue">
              Backed by data.
            </em>
          </h1>

          {/* Subhead */}
          <p style={{
            fontSize: "clamp(15px, 2vw, 17.5px)",
            color: "rgba(148,163,184,0.70)",
            maxWidth: 440, margin: "0 auto 44px",
            lineHeight: 1.68,
          }}>
            Institutional-grade factor portfolio analytics for serious investors.
            20 years of real NSE backtest data, computed instantly.
          </p>

          {/* CTAs */}
          <div style={{
            display: "flex", flexDirection: "column" as const,
            alignItems: "center", gap: 12, marginBottom: 72,
          }} className="hero-actions-wrap">
            <Link href="/dashboard" className="fl-btn-primary" style={{ minWidth: 200, padding: "15px 32px", fontSize: 15, borderRadius: 12 }}>
              Build My Portfolio <ArrowRight size={16} />
            </Link>
            <Link href="/rankings" className="fl-btn-secondary" style={{ minWidth: 200, padding: "15px 26px", fontSize: 15, borderRadius: 12 }}>
              View Fund Rankings <ChevronRight size={16} />
            </Link>
          </div>

          {/* Stats row */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 20, overflow: "hidden",
            maxWidth: 520, margin: "0 auto",
          }} className="hero-stats-grid">
            {heroStats.map(s => (
              <div key={s.l} style={{
                padding: "22px 12px", background: "rgba(255,255,255,0.02)", textAlign: "center" as const,
              }}>
                <div style={{
                  fontFamily: "var(--font-serif), Georgia, serif",
                  fontSize: 28, fontWeight: 400, color: "#F1F5F9",
                  lineHeight: 1.1, letterSpacing: "-0.5px",
                }}>{s.v}</div>
                <div style={{ fontSize: 10.5, color: "rgba(148,163,184,0.45)", marginTop: 5, fontWeight: 500 }}>
                  {s.l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FEATURES — bento grid
      ══════════════════════════════════════════════════ */}
      <section style={{ background: "var(--background)", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }} className="landing-pw">
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <span className="fl-section-label">Platform</span>
            <h2 style={{
              fontFamily: "var(--font-serif), Georgia, serif",
              fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 400,
              letterSpacing: "-1px", lineHeight: 1.14, marginBottom: 14,
            }}>
              Institutional analytics.<br />For every investor.
            </h2>
            <p style={{ fontSize: 15.5, color: "var(--muted-foreground)", lineHeight: 1.65, maxWidth: 380, margin: "0 auto" }}>
              No jargon. No complexity. Just real data.
            </p>
          </div>

          <div className="feat-bento">
            {features.map(f => (
              <div key={f.title} className="fl-card-hover" style={{ padding: "28px 24px" }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: f.cat.bg, border: `1px solid ${f.cat.border}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 18, color: f.cat.text,
                }}>
                  {f.icon}
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.2px", marginBottom: 8 }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--muted-foreground)", lineHeight: 1.65 }}>
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          HOW IT WORKS — 4 steps
      ══════════════════════════════════════════════════ */}
      <section style={{ background: "var(--muted)", padding: "80px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }} className="landing-pw">
          <div style={{ textAlign: "center", marginBottom: 52 }}>
            <span className="fl-section-label">Process</span>
            <h2 style={{
              fontFamily: "var(--font-serif), Georgia, serif",
              fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 400,
              letterSpacing: "-1px", lineHeight: 1.14,
            }}>
              From idea to insight<br />in under 30 seconds.
            </h2>
          </div>

          <div className="steps-grid-landing">
            {steps.map((s, i) => (
              <div key={s.n} style={{ position: "relative" }}>
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div className="hidden md:block" style={{
                    position: "absolute", top: 20, left: "calc(100% - 12px)",
                    width: "24px", height: 1,
                    background: "var(--border)",
                    zIndex: 0,
                  }} />
                )}
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: "var(--foreground)", color: "var(--background)",
                  fontFamily: "var(--font-mono), monospace",
                  fontSize: 11.5, fontWeight: 600,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: 16, position: "relative", zIndex: 1,
                }}>
                  {s.n}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.2px", marginBottom: 8 }}>
                  {s.title}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--muted-foreground)", lineHeight: 1.65 }}>
                  {s.desc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          WHY FACTOR INVESTING
      ══════════════════════════════════════════════════ */}
      <section style={{ background: "var(--background)", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }} className="landing-pw">
          <div className="why-grid-landing">
            {/* Left copy */}
            <div>
              <span className="fl-section-label">Why Factor Investing?</span>
              <h2 style={{
                fontFamily: "var(--font-serif), Georgia, serif",
                fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 400,
                letterSpacing: "-1px", lineHeight: 1.14, marginBottom: 14,
              }}>
                Rules-based.<br />Research-backed.<br />Proven 20 years.
              </h2>
              <p style={{ fontSize: 15, color: "var(--muted-foreground)", lineHeight: 1.72, marginBottom: 24 }}>
                Factor investing selects stocks based on attributes linked to higher long-term returns —
                implemented as NSE indices accessible as low-cost index funds.
              </p>
              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column" as const, gap: 11, margin: "0 0 32px" }}>
                {whyPoints.map(item => (
                  <li key={item} style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 14 }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg viewBox="0 0 11 11" fill="none" style={{ width: 10, height: 10 }}>
                        <path d="M2 5.5l2 2 4-4" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    <span style={{ color: "var(--foreground)" }}>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/academy" className="fl-btn-outline" style={{ display: "inline-flex" }}>
                Learn in Academy <ChevronRight size={15} />
              </Link>
            </div>

            {/* Right 2×2 cards */}
            <div className="why-cards-landing">
              {whyCards.map(w => (
                <div key={w.title} className="fl-card" style={{ padding: "20px 18px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: "#6B9FFF", marginBottom: 8, letterSpacing: "-0.1px" }}>
                    {w.title}
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.65 }}>
                    {w.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          DIVERSIFICATION BANNER — dark card
      ══════════════════════════════════════════════════ */}
      <section style={{ background: "var(--muted)", padding: "60px 0", borderTop: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 32px" }} className="landing-pw">
          <div style={{
            background: "#080B14", borderRadius: 28, padding: "64px 56px",
            textAlign: "center", position: "relative", overflow: "hidden",
          }} className="div-banner-landing">

            {/* Glow effects */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: `
                radial-gradient(ellipse 60% 70% at 15% 50%, rgba(79,128,255,.12) 0%, transparent 60%),
                radial-gradient(ellipse 40% 50% at 85% 30%, rgba(16,185,129,.08) 0%, transparent 55%)
              `,
            }} />

            <div style={{ position: "relative", zIndex: 1 }}>
              <span style={{
                fontSize: 10.5, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase" as const,
                color: "rgba(148,163,184,0.35)", marginBottom: 12, display: "block",
              }}>
                Why Diversification?
              </span>
              <h2 style={{
                fontFamily: "var(--font-serif), Georgia, serif",
                fontSize: "clamp(26px, 3.5vw, 42px)", fontWeight: 400,
                letterSpacing: "-1px", lineHeight: 1.14,
                color: "#F1F5F9", maxWidth: 440, margin: "0 auto 14px",
              }}>
                No single factor wins every year.
              </h2>
              <p style={{
                fontSize: 15.5, color: "rgba(148,163,184,0.55)",
                maxWidth: 480, margin: "0 auto", lineHeight: 1.7,
              }}>
                Blend factors to reduce worst-case drawdown while preserving long-term return potential.
              </p>

              {/* Stats */}
              <div className="div-stats-landing">
                {divStats.map(s => (
                  <div key={s.l} style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 16, padding: "24px 18px",
                  }}>
                    <div style={{
                      fontFamily: "var(--font-serif), Georgia, serif",
                      fontSize: 34, fontWeight: 400,
                      color: "#34D399", letterSpacing: "-0.6px", lineHeight: 1.1,
                    }}>{s.v}</div>
                    <div style={{ fontSize: 12, color: "rgba(148,163,184,0.45)", marginTop: 7 }}>{s.l}</div>
                  </div>
                ))}
              </div>

              <Link href="/dashboard" className="fl-btn-primary" style={{ minWidth: 200, padding: "15px 32px", fontSize: 15, borderRadius: 12 }}>
                Build My Portfolio <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════
          FOOTER
      ══════════════════════════════════════════════════ */}
      <footer style={{
        borderTop: "1px solid var(--border)",
        background: "var(--background)",
        padding: "28px 0",
      }}>
        <div style={{
          maxWidth: 1200, margin: "0 auto", padding: "0 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 20, flexWrap: "wrap" as const,
        }} className="footer-inner-landing">
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: "rgba(79,128,255,0.12)",
              border: "1px solid rgba(79,128,255,0.20)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg viewBox="0 0 28 28" fill="none" style={{ width: 16, height: 16 }}>
                <rect x="3" y="17" width="5" height="8" rx="1.5" fill="rgba(79,128,255,0.5)"/>
                <rect x="11" y="11" width="5" height="14" rx="1.5" fill="rgba(79,128,255,0.75)"/>
                <rect x="19" y="4" width="5" height="21" rx="1.5" fill="#6B9FFF"/>
              </svg>
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.3px" }}>
              <span style={{ color: "#6B9FFF" }}>factor</span>
              <span style={{ color: "var(--muted-foreground)" }}>lens</span>
            </span>
          </div>

          <p style={{ fontSize: 11.5, color: "var(--muted-foreground)", textAlign: "center" as const, flex: 1 }}>
            Data sourced from NSE India. For educational purposes only. Not financial advice.
          </p>

          <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
            {[
              { href: "/dashboard", label: "Portfolio" },
              { href: "/rankings",  label: "Rankings" },
              { href: "/academy",   label: "Academy" },
            ].map(l => (
              <Link key={l.href} href={l.href} style={{
                fontSize: 13, color: "var(--muted-foreground)", textDecoration: "none",
                transition: "color 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--foreground)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
