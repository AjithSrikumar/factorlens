"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/dashboard", label: "Portfolio" },
  { href: "/rankings",  label: "Rankings" },
  { href: "/funds",     label: "Funds" },
  { href: "/news",      label: "News" },
  { href: "/maverst",   label: "Regime" },
  { href: "/amc",       label: "AMC" },
  { href: "/academy",   label: "Academy" },
]

const LogoMark = ({ size = 28 }: { size?: number }) => (
  <svg viewBox="0 0 28 28" fill="none" style={{ width: size, height: size }}>
    <rect x="3" y="17" width="5" height="8" rx="1.5" fill="rgba(79,128,255,0.4)"/>
    <rect x="11" y="11" width="5" height="14" rx="1.5" fill="rgba(79,128,255,0.7)"/>
    <rect x="19" y="4" width="5" height="21" rx="1.5" fill="#6B9FFF"/>
  </svg>
)

const IconHome = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)
const IconPortfolio = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <rect x="3" y="3" width="7" height="7" rx="1.5"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5"/>
  </svg>
)
const IconNews = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M4 22h16a2 2 0 002-2V4a2 2 0 00-2-2H8a2 2 0 00-2 2v16a2 2 0 01-2 2z"/>
    <path d="M4 22a2 2 0 01-2-2v-9c0-1.1.9-2 2-2h2"/>
    <path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>
  </svg>
)
const IconRankings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)
const IconFunds = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </svg>
)

const bottomLinks = [
  { href: "/",          label: "Home",      Icon: IconHome,      exact: true },
  { href: "/dashboard", label: "Portfolio", Icon: IconPortfolio },
  { href: "/news",      label: "News",      Icon: IconNews },
  { href: "/rankings",  label: "Rankings",  Icon: IconRankings },
  { href: "/funds",     label: "Funds",     Icon: IconFunds },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <>
      {/* ── Desktop Nav ────────────────────────────────────── */}
      <nav className="hidden md:flex nav-glass" style={{
        position: "sticky", top: 0, zIndex: 300,
        height: 58,
        alignItems: "center",
      }}>
        <div style={{
          maxWidth: 1200, width: "100%", margin: "0 auto",
          padding: "0 32px", display: "flex", alignItems: "center", gap: 8,
        }}>
          {/* Logo */}
          <Link href="/" style={{
            display: "flex", alignItems: "center", gap: 8,
            marginRight: 20, textDecoration: "none", flexShrink: 0,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "rgba(79,128,255,0.12)",
              border: "1px solid rgba(79,128,255,0.20)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <LogoMark size={18} />
            </div>
            <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.4px" }}>
              <span style={{ color: "#6B9FFF" }}>factor</span>
              <span style={{ color: "rgba(148,163,184,0.7)" }}>lens</span>
            </span>
          </Link>

          {/* Nav links */}
          <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "center" }}>
            {navLinks.map(({ href, label }) => {
              const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn("nav-link", active ? "nav-link-active" : "nav-link-inactive")}
                >
                  {label}
                </Link>
              )
            })}
          </div>

          {/* CTA */}
          <Link href="/dashboard" className="fl-btn-primary" style={{ padding: "8px 18px", fontSize: 13 }}>
            Build Portfolio
          </Link>
        </div>
      </nav>

      {/* ── Mobile Top Bar ─────────────────────────────────── */}
      <div className="flex md:hidden nav-glass" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
        height: 52, alignItems: "center", padding: "0 18px",
        justifyContent: "space-between",
      }}>
        <Link href="/" style={{
          display: "flex", alignItems: "center", gap: 8, textDecoration: "none",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "rgba(79,128,255,0.12)",
            border: "1px solid rgba(79,128,255,0.20)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <LogoMark size={16} />
          </div>
          <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.4px" }}>
            <span style={{ color: "#6B9FFF" }}>factor</span>
            <span style={{ color: "rgba(148,163,184,0.7)" }}>lens</span>
          </span>
        </Link>

        {/* Mobile CTA */}
        <Link href="/dashboard" style={{
          padding: "6px 14px", borderRadius: 8,
          background: "rgba(79,128,255,0.12)",
          border: "1px solid rgba(79,128,255,0.25)",
          color: "#6B9FFF", fontSize: 12.5, fontWeight: 600,
          textDecoration: "none", display: "inline-flex", alignItems: "center",
        }}>
          Build
        </Link>
      </div>

      {/* ── Mobile Bottom Nav ──────────────────────────────── */}
      <div className="flex md:hidden" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 300,
        height: 64,
        background: "rgba(8,11,20,0.95)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}>
        <div style={{
          display: "flex", alignItems: "stretch", width: "100%", padding: "0 4px",
        }}>
          {bottomLinks.map(({ href, label, Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                style={{
                  flex: 1, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center",
                  gap: 3, padding: "6px 2px", borderRadius: 10,
                  textDecoration: "none",
                  color: active ? "#6B9FFF" : "rgba(148,163,184,0.45)",
                  transition: "color 0.15s",
                  position: "relative",
                }}
              >
                {active && (
                  <div style={{
                    position: "absolute", top: 0, left: "50%",
                    transform: "translateX(-50%)",
                    width: 28, height: 2, borderRadius: 2,
                    background: "#6B9FFF",
                  }} />
                )}
                <Icon />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.2px" }}>
                  {label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </>
  )
}
