"use client"

import Link from "next/link"
import { SiteFooter } from "@/components/site-footer"

export default function AcademyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--background)" }}>

      {/* ── Hero ── */}
      <div style={{
        background: "oklch(0.085 0.015 255)",
        position: "relative",
        overflow: "hidden",
        padding: "72px 24px 64px",
        textAlign: "center",
      }}>
        {/* Radial glow */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(26,86,219,.22) 0%, transparent 70%)",
        }} />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 640, margin: "0 auto" }}>
          {/* Pill */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "5px 14px", borderRadius: 99,
            background: "rgba(26,86,219,.18)",
            border: "1px solid rgba(26,86,219,.35)",
            marginBottom: 20,
          }}>
            <svg viewBox="0 0 16 16" fill="none" style={{ width: 13, height: 13 }}>
              <path d="M8 2l1.8 3.6L14 6.3l-3 2.9.7 4.1L8 11.2l-3.7 2.1.7-4.1-3-2.9 4.2-.7z" fill="#60a5fa" />
            </svg>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#93c5fd", letterSpacing: ".5px", textTransform: "uppercase" }}>
              Education Hub
            </span>
          </div>
          {/* Heading */}
          <h1 style={{
            fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
            fontSize: "clamp(32px, 5vw, 48px)",
            fontWeight: 400,
            color: "#ffffff",
            margin: "0 0 16px",
            letterSpacing: "-.02em",
            lineHeight: 1.1,
          }}>
            FactorLens Academy
          </h1>
          <p style={{ color: "rgba(255,255,255,.55)", fontSize: 15, lineHeight: 1.65, margin: 0 }}>
            Everything you need to understand passive investing, factor strategies,<br className="ac-br" />
            and portfolio construction — simple language, real data, no jargon.
          </p>
        </div>
      </div>

      {/* ── Main content ── */}
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 80px" }}>

        {/* TOC Card */}
        <div style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "24px 28px",
          marginBottom: 32,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", opacity: 0.6, letterSpacing: ".8px", textTransform: "uppercase", marginBottom: 14 }}>
            Contents
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {[
              ["#passive", "01", "What is Passive Investing?"],
              ["#factor", "02", "What is Factor Investing?"],
              ["#diversification", "03", "Why Diversification Matters"],
              ["#active-vs-passive", "04", "Active vs Passive: What the Data Says"],
              ["#backtest", "05", "20-Year Backtest Results"],
            ].map(([href, num, label]) => (
              <a key={href} href={href} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "9px 12px", borderRadius: 10, textDecoration: "none",
                color: "var(--foreground)", fontSize: 14, fontWeight: 500,
                transition: "background .15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(79,128,255,.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", minWidth: 22 }}>{num}</span>
                {label}
              </a>
            ))}
          </div>
        </div>

        {/* ── Section 01: Passive Investing ── */}
        <section id="passive" style={{ scrollMarginTop: 80, marginBottom: 40 }}>
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 18,
            overflow: "hidden",
          }}>
            {/* Header */}
            <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: "rgba(26,86,219,.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#1A56DB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                  </svg>
                </div>
                <h2 style={{
                  fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                  fontSize: 24, fontWeight: 400, color: "var(--foreground)",
                  margin: 0, letterSpacing: "-.02em",
                }}>
                  What is Passive Investing?
                </h2>
              </div>
            </div>
            {/* Body */}
            <div style={{ padding: "20px 28px 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                {[
                  "Passive investing means buying and holding a basket of securities that mirrors an index — without trying to pick individual winners or time the market.",
                  "Instead of paying a fund manager to make active decisions, you simply own the market. Research consistently shows that over long periods, most active funds fail to beat their benchmarks after fees.",
                  "Index funds — especially factor-based ones — give you low-cost, diversified exposure to proven return drivers.",
                ].map((para, i) => (
                  <p key={i} style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 14.5, lineHeight: 1.7 }}>{para}</p>
                ))}
              </div>
              {/* Facts */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  "80%+ of active large-cap funds underperform their benchmarks over 10 years",
                  "Expense ratios: Active funds 1.5–2.5% vs Index funds 0.1–0.5%",
                  "No manager risk, no style drift, no surprises",
                ].map((fact, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "11px 14px", borderRadius: 10,
                    background: "rgba(10,124,78,.06)",
                    border: "1px solid rgba(10,124,78,.12)",
                  }}>
                    <svg viewBox="0 0 16 16" fill="none" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }}>
                      <circle cx="8" cy="8" r="7" fill="rgba(10,124,78,.15)" />
                      <path d="M5 8l2 2 4-4" stroke="#0A7C4E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span style={{ fontSize: 13.5, color: "var(--foreground)", lineHeight: 1.5 }}>{fact}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 02: Factor Investing ── */}
        <section id="factor" style={{ scrollMarginTop: 80, marginBottom: 40 }}>
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 18,
            overflow: "hidden",
          }}>
            <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: "rgba(139,92,246,.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                  </svg>
                </div>
                <h2 style={{
                  fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                  fontSize: 24, fontWeight: 400, color: "var(--foreground)",
                  margin: 0, letterSpacing: "-.02em",
                }}>
                  What is Factor Investing?
                </h2>
              </div>
            </div>
            <div style={{ padding: "20px 28px 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {[
                  "Factor investing selects stocks based on specific characteristics — called 'factors' — that academic research has linked to higher long-term returns.",
                  "These factors are systematic and rules-based. They remove human emotion from the equation and have been validated across multiple markets and decades.",
                  "NSE India offers 20+ factor indices that are tracked by low-cost index funds, making them accessible to every investor.",
                ].map((para, i) => (
                  <p key={i} style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 14.5, lineHeight: 1.7 }}>{para}</p>
                ))}
              </div>
              {/* Factor grid */}
              <div className="fgrid2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { name: "Momentum", desc: "Stocks that have recently risen tend to keep rising", bg: "rgba(234,88,12,.08)", color: "#c2410c", border: "rgba(234,88,12,.15)" },
                  { name: "Quality", desc: "High ROE, low debt, stable earnings companies", bg: "rgba(13,148,136,.08)", color: "#0f766e", border: "rgba(13,148,136,.15)" },
                  { name: "Low Volatility", desc: "Less volatile stocks with better risk-adjusted returns", bg: "rgba(10,124,78,.08)", color: "#34D399", border: "rgba(10,124,78,.15)" },
                  { name: "Value", desc: "Undervalued companies with strong fundamentals", bg: "rgba(202,138,4,.08)", color: "#a16207", border: "rgba(202,138,4,.15)" },
                  { name: "Alpha", desc: "Stocks with high excess returns vs market beta", bg: "rgba(219,39,119,.08)", color: "#be185d", border: "rgba(219,39,119,.15)" },
                  { name: "Multi-Factor", desc: "Blend of multiple factors for diversified exposure", bg: "rgba(26,86,219,.08)", color: "#6B9FFF", border: "rgba(26,86,219,.15)" },
                ].map((f) => (
                  <div key={f.name} style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: f.bg,
                    border: `1px solid ${f.border}`,
                    display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 11, fontWeight: 700,
                      color: f.color, letterSpacing: ".3px",
                      textTransform: "uppercase",
                    }}>{f.name}</span>
                    <span style={{ fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{f.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 03: Diversification ── */}
        <section id="diversification" style={{ scrollMarginTop: 80, marginBottom: 40 }}>
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 18,
            overflow: "hidden",
          }}>
            <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: "rgba(13,148,136,.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                    <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
                <h2 style={{
                  fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                  fontSize: 24, fontWeight: 400, color: "var(--foreground)",
                  margin: 0, letterSpacing: "-.02em",
                }}>
                  Why Diversification Matters
                </h2>
              </div>
            </div>
            <div style={{ padding: "20px 28px 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {[
                  "No single factor wins every year. Momentum is powerful in bull markets but can crash hard during reversals. Low Volatility protects in downturns but lags in rallies.",
                  "By combining multiple factors and market-cap segments, you reduce concentration risk, smooth out return variability, and lower your worst-case drawdown.",
                  "Our 20-year backtest data shows that blended portfolios consistently achieve better risk-adjusted returns than single-factor bets.",
                ].map((para, i) => (
                  <p key={i} style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 14.5, lineHeight: 1.7 }}>{para}</p>
                ))}
              </div>
              {/* Comparison table */}
              <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,.08)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 440 }}>
                  <thead>
                    <tr style={{ background: "var(--muted)", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
                      {["Strategy", "CAGR", "Max DD", "Sharpe"].map(h => (
                        <th key={h} style={{
                          padding: "10px 14px", textAlign: "left",
                          fontSize: 10.5, fontWeight: 700,
                          color: "var(--muted-foreground)", letterSpacing: ".8px",
                          textTransform: "uppercase",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: "Single Factor (avg)", cagr: "18.5%", dd: "−55%", sharpe: "0.89" },
                      { label: "2-Factor Blend", cagr: "19.2%", dd: "−48%", sharpe: "1.05" },
                      { label: "4-Factor Blend", cagr: "19.8%", dd: "−40%", sharpe: "1.24" },
                      { label: "Nifty 50 (benchmark)", cagr: "12.7%", dd: "−60%", sharpe: "0.61" },
                    ].map((row, i) => (
                      <tr key={row.label} style={{
                        borderBottom: i < 3 ? "1px solid rgba(255,255,255,.06)" : "none",
                        background: i % 2 !== 0 ? "rgba(255,255,255,.03)" : "transparent",
                      }}>
                        <td style={{ padding: "11px 14px", fontSize: 13.5, fontWeight: 500, color: "#0C0E13" }}>{row.label}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: "#34D399", fontWeight: 600 }}>{row.cagr}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: "#F87171" }}>{row.dd}</td>
                        <td style={{ padding: "11px 14px", fontFamily: "var(--font-mono)", fontSize: 13, color: "#0C0E13" }}>{row.sharpe}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: "9px 14px", borderTop: "1px solid rgba(255,255,255,.06)", fontSize: 11, color: "var(--muted-foreground)", opacity: 0.6 }}>
                  * Illustrative averages based on 20-year NSE backtest data
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 04: Active vs Passive ── */}
        <section id="active-vs-passive" style={{ scrollMarginTop: 80, marginBottom: 40 }}>
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 18,
            overflow: "hidden",
          }}>
            <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: "rgba(202,138,4,.1)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#a16207" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
                  </svg>
                </div>
                <h2 style={{
                  fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                  fontSize: 24, fontWeight: 400, color: "var(--foreground)",
                  margin: 0, letterSpacing: "-.02em",
                }}>
                  Active vs Passive: What the Data Says
                </h2>
              </div>
            </div>
            <div style={{ padding: "20px 28px 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {[
                  "The debate between active and passive investing has been settled by data. Over a 20-year horizon, passive factor investing consistently outperforms active stock picking on a risk-adjusted basis.",
                  "Active managers charge higher fees, change strategies, face key-person risk, and often underperform benchmarks. Factor indices, by contrast, are transparent, low-cost, and mechanically disciplined.",
                ].map((para, i) => (
                  <p key={i} style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 14.5, lineHeight: 1.7 }}>{para}</p>
                ))}
              </div>
              {/* Comparison cards */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Active Large-Cap Funds", pro: "Manager expertise, potential for alpha", con: "High fees (1.8–2.5%), frequent underperformance", proColor: "#34D399", conColor: "#F87171" },
                  { label: "Nifty 50 Index Fund", pro: "Low cost, full market return", con: "No factor premium, capped upside", proColor: "#34D399", conColor: "#F87171" },
                  { label: "Factor Index Funds", pro: "Low cost + proven premium returns", con: "Slightly more complex to understand", proColor: "#34D399", conColor: "#F87171" },
                ].map((item) => (
                  <div key={item.label} style={{
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,.08)",
                    padding: "14px 18px",
                  }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", marginBottom: 10 }}>{item.label}</div>
                    <div className="cmp-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 50, flexShrink: 0, marginTop: 1,
                          background: "rgba(10,124,78,.12)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <svg viewBox="0 0 10 10" fill="none" style={{ width: 8, height: 8 }}>
                            <path d="M2 5l2 2 4-4" stroke="#0A7C4E" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        <span style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{item.pro}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{
                          width: 16, height: 16, borderRadius: 50, flexShrink: 0, marginTop: 1,
                          background: "rgba(197,39,30,.1)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <svg viewBox="0 0 10 10" fill="none" style={{ width: 8, height: 8 }}>
                            <path d="M3 3l4 4M7 3l-4 4" stroke="#C5271E" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </div>
                        <span style={{ fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>{item.con}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── Section 05: Backtest Results ── */}
        <section id="backtest" style={{ scrollMarginTop: 80, marginBottom: 40 }}>
          <div style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 18,
            overflow: "hidden",
          }}>
            <div style={{ padding: "24px 28px 20px", borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: "rgba(220,38,38,.08)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <h2 style={{
                  fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                  fontSize: 24, fontWeight: 400, color: "var(--foreground)",
                  margin: 0, letterSpacing: "-.02em",
                }}>
                  20-Year Backtest Results
                </h2>
              </div>
            </div>
            <div style={{ padding: "20px 28px 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                {[
                  "FactorLens is powered by actual NSE index NAV data from April 2005 to February 2026 — 5,189 daily data points per fund.",
                  "Every CAGR, Sharpe ratio, drawdown, and rolling return you see is computed from this real data, not simulations or hypothetical assumptions.",
                  "The top-ranked multi-factor funds delivered 18–22% CAGR over this period, compared to 12.7% for Nifty 50.",
                ].map((para, i) => (
                  <p key={i} style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 14.5, lineHeight: 1.7 }}>{para}</p>
                ))}
              </div>
              {/* Highlights grid */}
              <div className="hl-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[
                  { metric: "Best CAGR (Fund)", value: "~22%", sub: "NIFTY500 MULTIFACTOR MQVLv 50" },
                  { metric: "Nifty 50 CAGR", value: "12.7%", sub: "Benchmark index" },
                  { metric: "Data Period", value: "21 Years", sub: "Apr 2005 – Feb 2026" },
                  { metric: "Funds Tracked", value: "28", sub: "NSE Indices — Broad, Factor, Strategy" },
                ].map((h) => (
                  <div key={h.metric} style={{
                    padding: "16px 18px",
                    borderRadius: 12,
                    background: "rgba(26,86,219,.04)",
                    border: "1px solid rgba(26,86,219,.12)",
                  }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: ".7px", textTransform: "uppercase", marginBottom: 6 }}>
                      {h.metric}
                    </div>
                    <div style={{
                      fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
                      fontSize: 30, fontWeight: 400,
                      color: "#6B9FFF", letterSpacing: "-.02em", lineHeight: 1,
                      marginBottom: 4,
                    }}>
                      {h.value}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.4 }}>{h.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <div style={{
          background: "oklch(0.085 0.015 255)",
          borderRadius: 20,
          padding: "44px 36px",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* Glow */}
          <div style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(26,86,219,.25) 0%, transparent 70%)",
          }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <h2 style={{
              fontFamily: "var(--font-serif, 'Instrument Serif', Georgia, serif)",
              fontSize: 28, fontWeight: 400, color: "#ffffff",
              margin: "0 0 12px", letterSpacing: "-.02em",
            }}>
              Ready to Build Your Portfolio?
            </h2>
            <p style={{ color: "rgba(255,255,255,.5)", fontSize: 14, lineHeight: 1.65, margin: "0 0 28px", maxWidth: 420, marginLeft: "auto", marginRight: "auto" }}>
              Apply what you&apos;ve learned. Select funds, set weights, and see exactly how your portfolio
              would have performed over 20 years.
            </p>
            <Link href="/dashboard" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              padding: "12px 28px", borderRadius: 10,
              background: "#1A56DB", color: "#ffffff",
              fontSize: 14, fontWeight: 600, textDecoration: "none",
              transition: "all .2s",
            }}
            className="hover:opacity-85 hover:-translate-y-px"
            >
              Build My Portfolio
              <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }}>
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Mobile spacer */}
        <div style={{ height: 32 }} />
      </div>
      <SiteFooter />
    </div>
  )
}
