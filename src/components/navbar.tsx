"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/components/auth-provider"

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

/* ── User Avatar + Dropdown ──────────────────────────────────────────────── */
function UserMenu() {
  const { user, signOut } = useAuth()
  const [open, setOpen]   = useState(false)
  const ref               = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  if (!user) return null

  const name   = user.user_metadata?.full_name as string | undefined
  const avatar = user.user_metadata?.avatar_url as string | undefined
  const initials = name
    ? name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : (user.email?.[0] ?? "U").toUpperCase()

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Account menu"
        style={{
          width: 34, height: 34, borderRadius: "50%",
          border: "2px solid var(--border-mid)",
          background: "var(--bg2)",
          cursor: "pointer", padding: 0,
          overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "border-color 0.2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--text-raw)")}
        onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-mid)")}
      >
        {avatar
          ? <img src={avatar} alt={initials} style={{ width: "100%", height: "100%", objectFit: "cover" }} referrerPolicy="no-referrer" />
          : <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-raw)" }}>{initials}</span>
        }
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          background: "var(--bg)",
          border: "1px solid var(--border-mid)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-lg)",
          minWidth: 200, zIndex: 300,
          overflow: "hidden",
        }}>
          {/* User info */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border-mid)" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-raw)", marginBottom: 2 }}>
              {name ?? "Account"}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", wordBreak: "break-all" }}>
              {user.email}
            </div>
          </div>
          {/* Actions */}
          <div style={{ padding: "8px 0" }}>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              style={{
                display: "block", padding: "9px 16px",
                fontSize: 13, color: "var(--text-raw)",
                textDecoration: "none", transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "var(--bg2)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              My Portfolio
            </Link>
            <button
              onClick={() => { setOpen(false); signOut() }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "9px 16px",
                fontSize: 13, color: "#dc2626",
                background: "none", border: "none",
                cursor: "pointer", fontFamily: "inherit",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(220,38,38,.06)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export function Navbar() {
  const pathname = usePathname()
  const { user, loading: authLoading, signInWithGoogle } = useAuth()
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

        {/* Right side: auth + CTA + hamburger */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

          {/* Sign In button — desktop only, hidden on mobile */}
          {!authLoading && !user && (
            <button
              onClick={() => signInWithGoogle(typeof window !== 'undefined' ? window.location.pathname : undefined)}
              className="nav-signin-desktop"
              style={{
                background: "none",
                border: "1px solid var(--border-mid)",
                borderRadius: "100px",
                fontFamily: "var(--font-body)", fontSize: "0.82rem", fontWeight: 600,
                cursor: "pointer", padding: "7px 18px",
                color: "var(--text-raw)",
                transition: "all 0.2s", letterSpacing: "0.01em",
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
              Sign In
            </button>
          )}

          {/* User avatar — shown when logged in */}
          {!authLoading && user && <UserMenu />}

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
          {/* Sign In — mobile only, shown in drawer when not logged in */}
          {!authLoading && !user && (
            <li className="nav-signin-mobile">
              <button
                onClick={() => { setDrawerOpen(false); signInWithGoogle(typeof window !== 'undefined' ? window.location.pathname : undefined) }}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "11px 14px",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--text-raw)", color: "#fff",
                  fontWeight: 600, fontSize: "0.9rem",
                  border: "none", cursor: "pointer", fontFamily: "inherit",
                  marginBottom: 8,
                }}
              >
                <svg viewBox="0 0 20 20" fill="none" style={{ width: 16, height: 16 }}>
                  <path d="M10 2a8 8 0 100 16A8 8 0 0010 2zm0 3a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm0 10a6 6 0 01-4.7-2.3C5.7 11.6 7.8 11 10 11s4.3.6 4.7 1.7A6 6 0 0110 15z" fill="currentColor" />
                </svg>
                Sign In with Google
              </button>
            </li>
          )}
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
