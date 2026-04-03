"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

/* ── Drawer nav links (no News) ──────────────────────────────────── */
const drawerLinks = [
  { href: "/dashboard", label: "Dashboard"  },
  { href: "/rankings",  label: "Rankings"   },
  { href: "/funds",     label: "Funds"       },
  { href: "/maverst",   label: "Regime"      },
  { href: "/amc",       label: "AMC"         },
  { href: "/academy",   label: "Academy"     },
]

/* ── Logo icon ──────────────────────────────────────────────────── */
function LogoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 18 18" fill="none" style={{ width: size, height: size }}>
      <rect x="2"   y="10" width="3" height="6"  rx="1" fill="white"/>
      <rect x="7.5" y="6"  width="3" height="10" rx="1" fill="white"/>
      <rect x="13"  y="2"  width="3" height="14" rx="1" fill="white"/>
    </svg>
  )
}

export function Navbar() {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  /* Close drawer on route change */
  useEffect(() => { setDrawerOpen(false) }, [pathname])

  /* Shadow on scroll */
  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 8)
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [])

  /* Lock body scroll when drawer is open */
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [drawerOpen])

  return (
    <>
      {/* ── Top Nav ──────────────────────────────────────────────── */}
      <nav
        className={`nav-glass${scrolled ? " nav-scrolled" : ""}`}
        style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 52px", height: 64,
          transition: "box-shadow 0.3s",
          boxShadow: scrolled ? "var(--shadow-md)" : "none",
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex", alignItems: "center", gap: 9,
            textDecoration: "none", color: "var(--text-raw)",
            fontWeight: 700, fontSize: "1.05rem", letterSpacing: "-0.01em",
          }}
        >
          <div style={{
            width: 30, height: 30, borderRadius: "var(--radius-sm)",
            background: "var(--text-raw)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <LogoIcon size={18} />
          </div>
          factorlens
        </Link>

        {/* Right side: CTA + hamburger */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Link
            href="/dashboard"
            style={{
              background: "var(--text-raw)", color: "#fff",
              border: "none", borderRadius: "100px",
              fontFamily: "var(--font-body)", fontSize: "0.85rem", fontWeight: 600,
              cursor: "pointer", padding: "9px 22px",
              textDecoration: "none", display: "inline-block",
              transition: "all 0.2s", letterSpacing: "0.01em",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.background = "#333"
              el.style.transform = "translateY(-1px)"
              el.style.boxShadow = "var(--shadow-md)"
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.background = "var(--text-raw)"
              el.style.transform = "none"
              el.style.boxShadow = "none"
            }}
          >
            Build Portfolio
          </Link>

          {/* Hamburger button */}
          <button
            aria-label="Menu"
            onClick={() => setDrawerOpen(o => !o)}
            style={{
              background: "none",
              border: `1px solid var(--border-mid)`,
              width: 36, height: 36, borderRadius: "var(--radius-sm)",
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: "4.5px", cursor: "pointer",
              transition: "all 0.2s", padding: 0,
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = "var(--text-raw)"
              el.style.background = "var(--bg2)"
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.borderColor = "var(--border-mid)"
              el.style.background = "none"
            }}
          >
            <span style={{
              display: "block", width: 16, height: "1.5px",
              background: "var(--text-raw)", borderRadius: 2,
              transition: "all 0.25s",
              transform: drawerOpen ? "translateY(6px) rotate(45deg)" : "none",
            }} />
            <span style={{
              display: "block", width: 16, height: "1.5px",
              background: "var(--text-raw)", borderRadius: 2,
              transition: "all 0.25s",
              opacity: drawerOpen ? 0 : 1,
            }} />
            <span style={{
              display: "block", width: 16, height: "1.5px",
              background: "var(--text-raw)", borderRadius: 2,
              transition: "all 0.25s",
              transform: drawerOpen ? "translateY(-6px) rotate(-45deg)" : "none",
            }} />
          </button>
        </div>
      </nav>

      {/* ── Overlay ──────────────────────────────────────────────── */}
      {drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{
            position: "fixed", inset: "64px 0 0 0", zIndex: 198,
          }}
        />
      )}

      {/* ── Side Drawer ──────────────────────────────────────────── */}
      <div
        style={{
          position: "fixed", top: 64, right: 0, bottom: 0, width: 260,
          background: "var(--bg)", borderLeft: "1px solid var(--border-mid)",
          zIndex: 199, padding: "24px 20px",
          transform: drawerOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.06)",
        }}
      >
        <ul style={{ listStyle: "none", marginBottom: 24 }}>
          {drawerLinks.map(({ href, label }) => {
            const active = pathname.startsWith(href)
            return (
              <li key={href}>
                <Link
                  href={href}
                  style={{
                    display: "block", padding: "11px 14px",
                    borderRadius: "var(--radius-sm)",
                    color: active ? "var(--text-raw)" : "var(--text-muted)",
                    background: active ? "var(--bg2)" : "transparent",
                    fontWeight: active ? 600 : 500,
                    fontSize: "0.9rem", textDecoration: "none",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.background = "var(--bg2)"
                      el.style.color = "var(--text-raw)"
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.background = "transparent"
                      el.style.color = "var(--text-muted)"
                    }
                  }}
                >
                  {label}
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
