"use client"

import Link from "next/link"

/* ─────────────────────────────────────────
   DATA
───────────────────────────────────────── */
const heroStats = [
  { v: "20+",   l: "Years of Data" },
  { v: "28",    l: "NSE Funds"     },
  { v: "140K+", l: "Data Points"   },
  { v: "8",     l: "Risk Metrics"  },
]

const features = [
  {
    iconBg: "var(--blue-lg)",
    iconStroke: "var(--blue)",
    iconPath: <><rect x="2" y="2" width="7" height="7" rx="1"/><rect x="13" y="2" width="7" height="7" rx="1"/><rect x="2" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></>,
    title: "Portfolio Builder",
    desc: "Select up to 10 funds, assign weights, and see your portfolio's exact historical performance — computed in real time.",
  },
  {
    iconBg: "var(--green-lg)",
    iconStroke: "var(--green)",
    iconPath: <><polyline points="21 6 12 15 7.5 10.5 1 17"/><polyline points="16 6 21 6 21 11"/></>,
    title: "Factor Investing",
    desc: "Access momentum, quality, low-volatility, alpha and multi-factor strategies backed by academic research and NSE data.",
  },
  {
    iconBg: "var(--red-lg)",
    iconStroke: "var(--red)",
    iconPath: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>,
    title: "Risk Analytics",
    desc: "Understand max drawdown, volatility, Sharpe ratio, and rolling 3-year returns before you invest.",
  },
  {
    iconBg: "#FEF5E6",
    iconStroke: "#B45309",
    iconPath: <><ellipse cx="11" cy="5" rx="9" ry="3"/><path d="M20 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M2 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></>,
    title: "Real NSE Data",
    desc: "Every metric is computed from actual NSE index NAV data — not simulations, not estimates. 2005 to present.",
  },
]

const steps = [
  { n: "01", t: "Select Funds",        d: "Pick 1–10 funds from 28 NSE factor and broad-market indices." },
  { n: "02", t: "Set Weights",         d: "Adjust sliders to allocate percentages. Auto-sum to 100%." },
  { n: "03", t: "Generate Portfolio",  d: "Hit Run Backtest. Get CAGR, Sharpe, Drawdown instantly." },
  { n: "04", t: "Analyse & Decide",    d: "Study interactive charts. Compare against the Nifty 50 benchmark." },
]

const whyPoints = [
  "Systematic, not emotional",
  "Low-cost index funds",
  "Diversified across factors",
  "Decades of academic research",
]

const whyCards = [
  { t: "Beat the Market",      d: "Factor indices like Momentum and Quality have historically outperformed Nifty 50 by 4–8% annually." },
  { t: "Passive. Low Cost.",   d: "Rule-based index funds — no active manager, no high fees, no stock picking." },
  { t: "Diversification Works",d: "Combining factors reduces drawdown and smooths returns. Data proves it." },
  { t: "Data-Backed Decisions",d: "Every allocation backed by 20 years of real NSE price data." },
]

const divStats = [
  { v: "−38%",  l: "Avg drawdown, single factor"       },
  { v: "−24%",  l: "Avg drawdown, blended portfolio"   },
  { v: "+3.2%", l: "Annual outperformance vs Nifty 50" },
]

const footerLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/rankings",  label: "Rankings"  },
  { href: "/academy",   label: "Academy"   },
]

/* ─────────────────────────────────────────
   LOGO MARK
───────────────────────────────────────── */
function LogoMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <div style={{
        width: 30, height: 30, borderRadius: 8,
        background: "var(--navy)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <svg viewBox="0 0 15 15" fill="none" style={{ width: 15, height: 15 }}>
          <rect x="1" y="9"  width="3" height="5"  rx=".8" fill="rgba(255,255,255,.45)"/>
          <rect x="6" y="5"  width="3" height="9"  rx=".8" fill="rgba(255,255,255,.72)"/>
          <rect x="11" y="1" width="3" height="13" rx=".8" fill="white"/>
        </svg>
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.3px" }}>
        <span style={{ color: "var(--blue)" }}>factor</span>
        <span style={{ color: "var(--navy)" }}>lens</span>
      </span>
    </div>
  )
}

/* ─────────────────────────────────────────
   PAGE
───────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div style={{ background: "var(--off)" }}>

      {/* ══════════════════════════════════════
          HERO — navy background
      ══════════════════════════════════════ */}
      <section style={{
        background: "var(--navy)",
        padding: "72px 20px 80px",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Radial gradient glow */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 70% 60% at 50% -15%,rgba(26,86,219,.20) 0%,transparent 65%)",
        }} />

        <div style={{
          maxWidth: 720, margin: "0 auto",
          position: "relative", zIndex: 1, textAlign: "center",
        }}>
          {/* Status pill */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.12)",
            borderRadius: 100, padding: "5px 14px", marginBottom: 28,
            fontSize: 11.5, fontWeight: 600, letterSpacing: ".5px", textTransform: "uppercase",
            color: "rgba(255,255,255,.5)", backdropFilter: "blur(8px)",
          }}>
            <span className="hero-pulse-dot" />
            NSE Factor Investing · 2005–2026
          </div>

          {/* Headline */}
          <h1 style={{
            fontFamily: "var(--font-serif)",
            fontSize: "clamp(36px,6vw,62px)",
            fontWeight: 400, lineHeight: 1.08,
            letterSpacing: "-1.5px", color: "var(--white)", marginBottom: 16,
          }}>
            Build smarter portfolios.<br/>
            Backed by{" "}
            <em style={{
              fontStyle: "italic",
              background: "linear-gradient(120deg,#93c5fd 0%,#6ee7b7 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>data.</em>
          </h1>

          {/* Subhead */}
          <p style={{
            fontSize: "clamp(15px,2.2vw,17px)",
            color: "rgba(255,255,255,.48)",
            maxWidth: 400, margin: "0 auto 38px", lineHeight: 1.65,
          }}>
            Data-backed factor investing for serious investors. 20 years of real NSE backtest data, instantly.
          </p>

          {/* CTAs */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: 11, marginBottom: 68,
          }} className="hero-actions-wrap">
            <Link href="/dashboard" style={{
              padding: "14px 30px", borderRadius: 12,
              background: "var(--white)", color: "var(--navy)",
              fontSize: 14.5, fontWeight: 700, letterSpacing: "-.2px",
              display: "inline-flex", alignItems: "center", gap: 8,
              textDecoration: "none", transition: "all .2s",
              minWidth: 190, justifyContent: "center",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 8px 28px rgba(0,0,0,.22)"; (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none"; (e.currentTarget as HTMLAnchorElement).style.transform = "none"; }}
            >
              Build My Portfolio
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
            <Link href="/rankings" style={{
              padding: "14px 22px", borderRadius: 12,
              background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.14)",
              color: "rgba(255,255,255,.72)", fontSize: 14.5, fontWeight: 600,
              display: "inline-flex", alignItems: "center", gap: 8,
              textDecoration: "none", transition: "all .2s",
              backdropFilter: "blur(8px)", minWidth: 190, justifyContent: "center",
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,.13)"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,.07)"; }}
            >
              View Fund Rankings
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          </div>

          {/* Stats grid */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1,
            background: "rgba(255,255,255,.07)",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 18, overflow: "hidden", maxWidth: 500, margin: "0 auto",
          }} className="hero-stats-grid">
            {heroStats.map(s => (
              <div key={s.l} style={{ padding: "20px 10px", background: "rgba(255,255,255,.03)", textAlign: "center" }}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 400, color: "var(--white)", lineHeight: 1.1, letterSpacing: "-.4px" }}>{s.v}</div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,.35)", marginTop: 5, fontWeight: 500 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FEATURES
      ══════════════════════════════════════ */}
      <section style={{ background: "var(--off)", padding: "72px 0" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px" }} className="landing-pw">
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <span className="sec-lbl">Platform</span>
            <h2 className="sec-h2">Institutional analytics.<br/>For every investor.</h2>
            <p className="sec-sub" style={{ maxWidth: 400, margin: "0 auto" }}>No jargon. No complexity. Just data.</p>
          </div>

          <div className="feat-bento">
            {features.map(f => (
              <div key={f.title} className="fl-card-hover" style={{ padding: "28px 24px" }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: f.iconBg, display: "flex", alignItems: "center",
                  justifyContent: "center", marginBottom: 18,
                }}>
                  <svg viewBox="0 0 22 22" fill="none" stroke={f.iconStroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                    {f.iconPath}
                  </svg>
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.2px", marginBottom: 8, color: "var(--navy)" }}>{f.title}</div>
                <div style={{ fontSize: 13.5, color: "var(--navy-50)", lineHeight: 1.62 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════ */}
      <section style={{ background: "var(--white)", padding: "72px 0" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px" }} className="landing-pw">
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <span className="sec-lbl">Process</span>
            <h2 className="sec-h2">From idea to insight<br/>in under 30 seconds.</h2>
          </div>

          <div className="steps-grid-landing">
            {steps.map(s => (
              <div key={s.n}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: "var(--navy)", color: "var(--white)",
                  fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500,
                  display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14,
                }}>
                  {s.n}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.2px", marginBottom: 7, color: "var(--navy)" }}>{s.t}</div>
                <div style={{ fontSize: 13.5, color: "var(--navy-50)", lineHeight: 1.6 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          WHY FACTOR INVESTING
      ══════════════════════════════════════ */}
      <section style={{ background: "var(--off)", padding: "72px 0" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px" }} className="landing-pw">
          <div className="why-grid-landing">
            {/* Left: copy */}
            <div>
              <span className="sec-lbl">Why Factor Investing?</span>
              <h2 className="sec-h2">Rules-based.<br/>Research-backed.<br/>Proven 20 years.</h2>
              <p style={{ fontSize: 15, color: "var(--navy-50)", lineHeight: 1.7, marginBottom: 4 }}>
                Factor investing selects stocks based on attributes associated with higher returns — implemented
                as NSE indices accessible as low-cost index funds.
              </p>

              <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 11, margin: "22px 0 30px", padding: 0 }}>
                {whyPoints.map(p => (
                  <li key={p} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "var(--navy)" }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                      background: "var(--green-lg)", display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <svg viewBox="0 0 11 11" fill="none" style={{ width: 11, height: 11 }}>
                        <path d="M2 5.5l2 2 4-4" stroke="#0A7C4E" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </span>
                    {p}
                  </li>
                ))}
              </ul>

              <Link href="/academy" className="fl-btn-outline" style={{ display: "inline-flex" }}>
                Learn in Academy
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
            </div>

            {/* Right: 2×2 cards */}
            <div className="why-cards-landing">
              {whyCards.map(w => (
                <div key={w.t} style={{
                  background: "var(--white)", border: "1px solid var(--navy-12)",
                  borderRadius: "var(--r)", padding: "20px", transition: "all .18s",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--navy-30)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--sh-xs)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = "var(--navy-12)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "none"; }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", marginBottom: 7 }}>{w.t}</div>
                  <div style={{ fontSize: 12.5, color: "var(--navy-50)", lineHeight: 1.6 }}>{w.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          DIVERSIFICATION BANNER
      ══════════════════════════════════════ */}
      <section style={{ background: "var(--white)", padding: "48px 0" }}>
        <div style={{ maxWidth: 1160, margin: "0 auto", padding: "0 32px" }} className="landing-pw">
          <div style={{
            background: "var(--navy)", borderRadius: "var(--r-xl)",
            padding: "60px 52px", textAlign: "center",
            position: "relative", overflow: "hidden",
          }} className="div-banner-landing">
            {/* Glow */}
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "radial-gradient(ellipse 60% 70% at 20% 50%,rgba(26,86,219,.14) 0%,transparent 65%)",
            }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <span className="sec-lbl" style={{ color: "rgba(255,255,255,.32)" }}>Why Diversification?</span>
              <h2 style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(26px,3.5vw,40px)", fontWeight: 400,
                letterSpacing: "-.8px", lineHeight: 1.15,
                color: "var(--white)", maxWidth: 420, margin: "0 auto 13px",
              }}>
                No single factor wins every year.
              </h2>
              <p style={{
                fontSize: 16, color: "rgba(255,255,255,.45)",
                maxWidth: 460, margin: "0 auto", lineHeight: 1.7,
              }}>
                Blend factors to reduce worst-case drawdown while preserving long-term return potential.
              </p>

              <div className="div-stats-landing">
                {divStats.map(s => (
                  <div key={s.l} style={{
                    background: "rgba(255,255,255,.06)",
                    border: "1px solid rgba(255,255,255,.09)",
                    borderRadius: "var(--r)", padding: "22px 16px",
                  }}>
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 32, fontWeight: 400, color: "#22D3A0", letterSpacing: "-.5px", lineHeight: 1.1 }}>{s.v}</div>
                    <div style={{ fontSize: 12, color: "rgba(255,255,255,.40)", marginTop: 6 }}>{s.l}</div>
                  </div>
                ))}
              </div>

              <Link href="/dashboard" style={{
                padding: "15px 30px", borderRadius: 12,
                background: "var(--white)", color: "var(--navy)",
                fontSize: 15, fontWeight: 700, letterSpacing: "-.2px",
                display: "inline-flex", alignItems: "center", gap: 8,
                textDecoration: "none", position: "relative", zIndex: 1,
                transition: "all .2s",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = "0 8px 28px rgba(0,0,0,.22)"; (e.currentTarget as HTMLAnchorElement).style.transform = "translateY(-2px)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none"; (e.currentTarget as HTMLAnchorElement).style.transform = "none"; }}
              >
                Build My Portfolio
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════
          FOOTER
      ══════════════════════════════════════ */}
      <footer style={{ borderTop: "1px solid var(--navy-12)", background: "var(--white)", padding: "26px 0" }}>
        <div style={{
          maxWidth: 1160, margin: "0 auto", padding: "0 32px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 16, flexWrap: "wrap",
        }} className="footer-inner-landing">
          <LogoMark />

          <p style={{ fontSize: 11.5, color: "var(--navy-30)", textAlign: "center", flex: 1 }}>
            Data sourced from NSE India. For educational purposes only. Not financial advice.
          </p>

          <div style={{ display: "flex", gap: 20, flexShrink: 0 }}>
            {footerLinks.map(l => (
              <Link key={l.href} href={l.href} style={{
                fontSize: 13, color: "var(--navy-50)", textDecoration: "none", transition: "color .15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--navy)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--navy-50)")}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </footer>
    </div>
  )
}
