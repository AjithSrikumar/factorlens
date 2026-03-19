"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { AMC_LIST, amcSlug, amcLogoUrl } from "@/lib/amc"

interface MFFund {
  scheme_code:     number
  scheme_name:     string
  fund_house:      string
  scheme_category: string
  nav:             number | null
  return_1y:       number | null
  return_3y:       number | null
  return_5y:       number | null
}

export default function AmcListPage() {
  const [funds,   setFunds]   = useState<MFFund[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")

  useEffect(() => {
    fetch("/api/mffunds")
      .then(r => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setFunds(data as MFFund[])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  // Build AMC entries with fund counts from actual data
  const amcEntries = useMemo(() => {
    // Count funds per slug
    const countBySlug: Record<string, number> = {}
    for (const f of funds) {
      const s = amcSlug(f.fund_house)
      countBySlug[s] = (countBySlug[s] ?? 0) + 1
    }

    // Merge with AMC_LIST (only show AMCs with at least 1 fund)
    return AMC_LIST
      .map(amc => ({ ...amc, count: countBySlug[amc.slug] ?? 0 }))
      .filter(amc => amc.count > 0)
      .sort((a, b) => b.count - a.count)
  }, [funds])

  const filtered = useMemo(() => {
    if (!search.trim()) return amcEntries
    const q = search.toLowerCase()
    return amcEntries.filter(a =>
      a.displayName.toLowerCase().includes(q) ||
      a.slug.includes(q)
    )
  }, [amcEntries, search])

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F3" }}>
      <style>{`
        @keyframes amc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
        .amc-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(12,14,19,.1) !important; }
      `}</style>

      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 20px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#0C0E13", margin: "0 0 4px", letterSpacing: "-.02em" }}>
            Asset Management Companies
          </h1>
          <p style={{ color: "rgba(12,14,19,.45)", fontSize: 13.5, margin: 0 }}>
            {loading ? "Loading…" : `${amcEntries.length} AMCs · ${funds.length} total funds`}
          </p>
        </div>

        {/* Search */}
        <div style={{ position: "relative", maxWidth: 360, marginBottom: 24 }}>
          <svg viewBox="0 0 18 18" fill="none" style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            width: 15, height: 15, pointerEvents: "none",
          }}>
            <circle cx="7.5" cy="7.5" r="5.5" stroke="rgba(12,14,19,.35)" strokeWidth="1.5" />
            <path d="M12 12l3.5 3.5" stroke="rgba(12,14,19,.35)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search AMC…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: "100%", paddingLeft: 36, paddingRight: 14,
              paddingTop: 10, paddingBottom: 10,
              border: "1px solid rgba(12,14,19,.12)",
              borderRadius: 10, background: "#ffffff",
              fontSize: 13.5, color: "#0C0E13", outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 14,
          }}>
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} style={{
                height: 96, borderRadius: 14,
                background: "rgba(12,14,19,.06)",
                animation: "amc-pulse 1.4s ease infinite",
              }} />
            ))}
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
            gap: 14,
          }}>
            {filtered.map(amc => {
              const logo = amcLogoUrl(amc.displayName)
              return (
                <Link
                  key={amc.slug}
                  href={`/amc/${amc.slug}`}
                  className="amc-card"
                  style={{
                    display: "flex", flexDirection: "column",
                    alignItems: "center", textAlign: "center",
                    background: "#ffffff",
                    border: "1px solid rgba(12,14,19,.1)",
                    borderRadius: 14, padding: "20px 16px",
                    textDecoration: "none",
                    transition: "all .2s",
                    boxShadow: "0 1px 4px rgba(12,14,19,.05)",
                  }}
                >
                  {/* Logo */}
                  {logo
                    ? <img
                        src={logo}
                        alt={amc.displayName}
                        width={44} height={44}
                        style={{ borderRadius: 10, objectFit: "contain", marginBottom: 10 }}
                      />
                    : <div style={{
                        width: 44, height: 44, borderRadius: 10,
                        background: "rgba(12,14,19,.07)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        marginBottom: 10,
                      }}>
                        <svg viewBox="0 0 20 20" fill="none" style={{ width: 20, height: 20 }}>
                          <rect x="2" y="2" width="16" height="16" rx="3" stroke="rgba(12,14,19,.3)" strokeWidth="1.5" />
                          <path d="M5 10h10M5 7h7M5 13h5" stroke="rgba(12,14,19,.3)" strokeWidth="1.3" strokeLinecap="round" />
                        </svg>
                      </div>
                  }

                  {/* Name */}
                  <span style={{
                    fontSize: 12.5, fontWeight: 700,
                    color: "#0C0E13", lineHeight: 1.3,
                    marginBottom: 6,
                  }}>
                    {amc.displayName}
                  </span>

                  {/* Fund count badge */}
                  <span style={{
                    fontSize: 10.5, fontWeight: 600,
                    color: "rgba(12,14,19,.4)",
                    background: "rgba(12,14,19,.06)",
                    padding: "2px 8px", borderRadius: 99,
                  }}>
                    {amc.count} fund{amc.count !== 1 ? "s" : ""}
                  </span>
                </Link>
              )
            })}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <p style={{ color: "rgba(12,14,19,.4)", fontSize: 14 }}>No AMCs match your search.</p>
          </div>
        )}
      </div>
    </div>
  )
}
