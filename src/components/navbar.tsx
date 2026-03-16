"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/funds", label: "Funds" },
  { href: "/rankings", label: "Rankings" },
  { href: "/academy", label: "Academy" },
]

/* ── Inline SVG icons matching v4 exactly ── */
const IconHome = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
  </svg>
)
const IconDash = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
)
const IconFunds = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
  </svg>
)
const IconRank = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
)
const IconLearn = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 22, height: 22 }}>
    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
  </svg>
)

const bottomNavLinks = [
  { href: "/", label: "Home", Icon: IconHome, exact: true },
  { href: "/dashboard", label: "Dashboard", Icon: IconDash },
  { href: "/funds", label: "Funds", Icon: IconFunds },
  { href: "/rankings", label: "Rankings", Icon: IconRank },
  { href: "/academy", label: "Learn", Icon: IconLearn },
]

export function Navbar() {
  const pathname = usePathname()

  return (
    <>
      {/* ── Desktop Top Nav — hidden on mobile ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 300,
        height: 60,
        background: "rgba(245,245,243,.93)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        borderBottom: "1px solid rgba(12,14,19,.12)",
        display: "flex", alignItems: "center",
      }} className="hidden md:flex">
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
              width: 30, height: 30, borderRadius: 8, background: "#0C0E13",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <svg viewBox="0 0 15 15" fill="none" style={{ width: 15, height: 15 }}>
                <rect x="1" y="9" width="3" height="5" rx=".8" fill="rgba(255,255,255,.45)" />
                <rect x="6" y="5" width="3" height="9" rx=".8" fill="rgba(255,255,255,.72)" />
                <rect x="11" y="1" width="3" height="13" rx=".8" fill="white" />
              </svg>
            </div>
            <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.3px" }}>
              <span style={{ color: "#1A56DB" }}>factor</span>
              <span style={{ color: "rgba(12,14,19,.5)" }}>lens</span>
            </span>
          </Link>

          {/* Nav links */}
          <div style={{ display: "flex", gap: 2, flex: 1 }}>
            {navLinks.map((link) => {
              const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  style={{
                    padding: "7px 13px", borderRadius: 8, fontSize: 13.5, fontWeight: 500,
                    color: isActive ? "#0C0E13" : "rgba(12,14,19,.5)",
                    background: isActive ? "#ffffff" : "transparent",
                    boxShadow: isActive ? "0 1px 2px rgba(0,0,0,.05)" : "none",
                    transition: "all .15s", textDecoration: "none", display: "block",
                  }}
                  className={cn(!isActive && "hover:!text-[#0C0E13] hover:!bg-[rgba(12,14,19,.06)]")}
                >
                  {link.label}
                </Link>
              )
            })}
          </div>

          {/* Build Portfolio CTA */}
          <Link
            href="/dashboard"
            style={{
              marginLeft: "auto", padding: "8px 18px", borderRadius: 9,
              background: "#0C0E13", color: "#ffffff",
              fontSize: 13, fontWeight: 600, letterSpacing: "-.1px",
              transition: "all .2s", flexShrink: 0, textDecoration: "none",
              display: "inline-block",
            }}
            className="hover:opacity-85 hover:-translate-y-px hover:shadow-md"
          >
            Build Portfolio
          </Link>
        </div>
      </nav>

      {/* ── Mobile Top Bar — logo only, no page links ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 300,
        height: 52,
        background: "rgba(245,245,243,.95)",
        backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        borderBottom: "1px solid rgba(12,14,19,.10)",
        alignItems: "center", padding: "0 18px",
      }} className="flex md:hidden">
        <Link href="/" style={{
          display: "flex", alignItems: "center", gap: 9,
          textDecoration: "none", flexShrink: 0,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8, background: "#0C0E13",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg viewBox="0 0 15 15" fill="none" style={{ width: 14, height: 14 }}>
              <rect x="1" y="9" width="3" height="5" rx=".8" fill="rgba(255,255,255,.45)" />
              <rect x="6" y="5" width="3" height="9" rx=".8" fill="rgba(255,255,255,.72)" />
              <rect x="11" y="1" width="3" height="13" rx=".8" fill="white" />
            </svg>
          </div>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.3px" }}>
            <span style={{ color: "#1A56DB" }}>factor</span>
            <span style={{ color: "rgba(12,14,19,.5)" }}>lens</span>
          </span>
        </Link>
      </div>

      {/* ── Mobile Bottom Nav ── */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 300,
        height: 68,
        background: "rgba(255,255,255,.97)",
        backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid rgba(12,14,19,.12)",
      }} className="md:hidden flex flex-col justify-stretch">
        <div style={{ display: "flex", alignItems: "stretch", height: "100%", padding: "0 8px" }}>
          {bottomNavLinks.map(({ href, label, Icon, exact }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                style={{
                  flex: 1, display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 4, padding: "6px 4px",
                  borderRadius: 12, textDecoration: "none",
                  color: isActive ? "#1A56DB" : "rgba(12,14,19,.3)",
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
