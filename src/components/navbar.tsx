"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

/* ── Navigation links (no News) ─────────────────────────────────── */
const navLinks = [
  { href: "/dashboard", label: "Portfolio" },
  { href: "/rankings",  label: "Rankings"  },
  { href: "/funds",     label: "Funds"     },
  { href: "/maverst",   label: "Regime"    },
  { href: "/amc",       label: "AMC"       },
  { href: "/academy",   label: "Academy"   },
]

/* ── Logo mark ──────────────────────────────────────────────────── */
const LogoMark = ({ size = 15 }: { size?: number }) => (
  <svg viewBox="0 0 15 15" fill="none" style={{ width: size, height: size }}>
    <rect x="1" y="9"  width="3" height="5"  rx=".8" fill="rgba(12,14,19,.40)"/>
    <rect x="6" y="5"  width="3" height="9"  rx=".8" fill="rgba(12,14,19,.70)"/>
    <rect x="11" y="1" width="3" height="13" rx=".8" fill="#0C0E13"/>
  </svg>
)

/* ── Bottom nav icons ────────────────────────────────────────────── */
const IconHome = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
)
const IconPortfolio = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <rect x="3" y="3" width="7" height="7" rx="1"/>
    <rect x="14" y="3" width="7" height="7" rx="1"/>
    <rect x="3" y="14" width="7" height="7" rx="1"/>
    <rect x="14" y="14" width="7" height="7" rx="1"/>
  </svg>
)
const IconRankings = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
  </svg>
)
const IconLearn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
  </svg>
)
const IconFunds = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
    <path d="M2 17l10 5 10-5"/>
    <path d="M2 12l10 5 10-5"/>
  </svg>
)

const bottomLinks = [
  { href: "/",          label: "Home",      Icon: IconHome,      exact: true },
  { href: "/dashboard", label: "Portfolio", Icon: IconPortfolio },
  { href: "/rankings",  label: "Rankings",  Icon: IconRankings },
  { href: "/funds",     label: "Funds",     Icon: IconFunds },
  { href: "/academy",   label: "Learn",     Icon: IconLearn },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <>
      {/* ── Desktop Nav ──────────────────────────────────────────── */}
      <nav className="hidden md:flex nav-glass" style={{
        position: "sticky", top: 0, zIndex: 300,
        height: 60, alignItems: "center",
      }}>
        <div style={{
          maxWidth: 1160, width: "100%", margin: "0 auto",
          padding: "0 32px", display: "flex", alignItems: "center",
        }}>
          {/* Logo */}
          <Link href="/" style={{
            display: "flex", alignItems: "center", gap: 9,
            marginRight: 28, textDecoration: "none", flexShrink: 0,
          }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: "var(--navy)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <LogoMark size={15} />
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.3px" }}>
              <span style={{ color: "var(--blue)" }}>factor</span>
              <span style={{ color: "var(--navy)" }}>lens</span>
            </span>
          </Link>

          {/* Nav links */}
          <div style={{ display: "flex", gap: 2, flex: 1, alignItems: "center" }}>
            {navLinks.map(({ href, label }) => {
              const active = pathname.startsWith(href)
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
          <Link href="/dashboard" className="fl-btn-primary" style={{ padding: "8px 18px", fontSize: 13, borderRadius: 9 }}>
            Build Portfolio
          </Link>
        </div>
      </nav>

      {/* ── Mobile Top Bar ───────────────────────────────────────── */}
      <div className="flex md:hidden nav-glass" style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 300,
        height: 52, alignItems: "center", padding: "0 20px",
        justifyContent: "space-between",
      }}>
        <Link href="/" style={{
          display: "flex", alignItems: "center", gap: 8, textDecoration: "none",
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 7,
            background: "var(--navy)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <LogoMark size={14} />
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.3px" }}>
            <span style={{ color: "var(--blue)" }}>factor</span>
            <span style={{ color: "var(--navy)" }}>lens</span>
          </span>
        </Link>

        <Link href="/dashboard" className="fl-btn-blue" style={{ padding: "6px 14px", fontSize: 12.5 }}>
          Build
        </Link>
      </div>

      {/* ── Mobile Bottom Nav ────────────────────────────────────── */}
      <div className="flex md:hidden" style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 300,
        height: "var(--bnav)",
        background: "rgba(255,255,255,.97)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--navy-12)",
        paddingBottom: "env(safe-area-inset-bottom,0)",
      }}>
        <div style={{
          display: "flex", alignItems: "stretch", width: "100%", padding: "0 8px",
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
                  gap: 4, padding: "6px 4px", borderRadius: 12,
                  textDecoration: "none",
                  color: active ? "var(--blue)" : "var(--navy-30)",
                  transition: "color .15s",
                }}
              >
                <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Icon />
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".1px" }}>
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
