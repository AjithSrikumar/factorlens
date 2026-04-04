"use client"

import { useState, useEffect, useMemo, use } from "react"
import Link from "next/link"
import { amcBySlug, amcLogoUrl, amcSlug } from "@/lib/amc"
import { getTrackedIndex } from "@/lib/index-fund-map"

interface MFFund {
  scheme_code:     number
  scheme_name:     string
  fund_house:      string
  scheme_category: string
  nav:             number | null
  nav_date:        string | null
  return_1y:       number | null
  return_3y:       number | null
  return_5y:       number | null
}

type SortKey = "scheme_name" | "nav" | "return_1y" | "return_3y" | "return_5y"
type SortDir  = "asc" | "desc"

function ReturnBadge({ value }: { value: number | null }) {
  if (value === null) return <span style={{ color: "rgba(12,14,19,.25)", fontFamily: "var(--font-mono)", fontSize: 12 }}>—</span>
  const pos = value >= 0
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
      color: pos ? "#0A7C4E" : "#C5271E",
    }}>
      {pos ? "+" : ""}{value.toFixed(1)}%
    </span>
  )
}

function SortArrow({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return (
    <svg viewBox="0 0 10 14" fill="none" style={{ width: 8, height: 10, opacity: 0.25 }}>
      <path d="M5 1v12M1 5l4-4 4 4M1 9l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
  return sortDir === "asc" ? (
    <svg viewBox="0 0 10 7" fill="none" style={{ width: 8, height: 6 }}>
      <path d="M1 6l4-5 4 5" stroke="#1A56DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 10 7" fill="none" style={{ width: 8, height: 6 }}>
      <path d="M1 1l4 5 4-5" stroke="#1A56DB" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function AmcDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug }  = use(params)
  const amc       = amcBySlug(slug)

  const [funds,   setFunds]   = useState<MFFund[]>([])
  const [loading, setLoading] = useState(true)
  const [search,  setSearch]  = useState("")
  const [sortKey, setSortKey] = useState<SortKey>("return_3y")
  const [sortDir, setSortDir] = useState<SortDir>("desc")

  useEffect(() => {
    fetch("/api/mffunds")
      .then(r => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          const all = data as MFFund[]
          // Filter to this AMC
          setFunds(all.filter(f => amcSlug(f.fund_house) === slug))
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [slug])

  const filtered = useMemo(() => {
    let list = funds
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(f => f.scheme_name.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => {
      const nullVal = sortDir === "asc" ? Infinity : -Infinity
      let av: string | number = a[sortKey] ?? (nullVal as number)
      let bv: string | number = b[sortKey] ?? (nullVal as number)
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
  }, [funds, search, sortKey, sortDir])

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(col); setSortDir("desc") }
  }

  const logo = amc ? amcLogoUrl(amc.displayName) : null

  if (!loading && !amc) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F5F3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 700, color: "#0C0E13" }}>AMC not found</p>
          <Link href="/amc" style={{ color: "#1A56DB", fontSize: 14 }}>← All AMCs</Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F3" }}>
      <style>{`
        @keyframes amc-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }
        .amc-row:hover { background: rgba(26,86,219,.03) !important; }
        .amc-th:hover { color: #0C0E13 !important; }
        .amc-sort-btn { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; }
      `}</style>

      <div style={{ maxWidth: 1160, margin: "0 auto", padding: "28px 20px 80px" }}>

        {/* Back */}
        <Link href="/amc" style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontSize: 13, color: "rgba(12,14,19,.45)",
          textDecoration: "none", marginBottom: 20,
        }}>
          <svg viewBox="0 0 16 16" fill="none" style={{ width: 14, height: 14 }}>
            <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          All AMCs
        </Link>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          {logo
            ? <img src={logo} alt={amc?.displayName} width={56} height={56}
                style={{ borderRadius: 14, objectFit: "contain", background: "#fff",
                  border: "1px solid rgba(12,14,19,.1)", padding: 4, flexShrink: 0 }}
              />
            : <div style={{
                width: 56, height: 56, borderRadius: 14,
                background: "rgba(12,14,19,.07)",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}>
                <svg viewBox="0 0 20 20" fill="none" style={{ width: 24, height: 24 }}>
                  <rect x="2" y="2" width="16" height="16" rx="3" stroke="rgba(12,14,19,.3)" strokeWidth="1.5" />
                  <path d="M5 10h10M5 7h7M5 13h5" stroke="rgba(12,14,19,.3)" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              </div>
          }
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0C0E13", margin: "0 0 4px", letterSpacing: "-.02em" }}>
              {amc?.displayName ?? slug}
            </h1>
            <p style={{ color: "rgba(12,14,19,.45)", fontSize: 13.5, margin: 0 }}>
              {loading ? "Loading…" : `${funds.length} fund${funds.length !== 1 ? "s" : ""}`}
            </p>
          </div>
        </div>

        {/* Search */}
        <div style={{ position: "relative", maxWidth: 360, marginBottom: 16 }}>
          <svg viewBox="0 0 18 18" fill="none" style={{
            position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
            width: 15, height: 15, pointerEvents: "none",
          }}>
            <circle cx="7.5" cy="7.5" r="5.5" stroke="rgba(12,14,19,.35)" strokeWidth="1.5" />
            <path d="M12 12l3.5 3.5" stroke="rgba(12,14,19,.35)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search funds…"
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

        {!loading && funds.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12.5, color: "rgba(12,14,19,.4)" }}>
              {filtered.length} of {funds.length} funds
            </span>
          </div>
        )}

        {/* Desktop Table */}
        <div className="max-md:hidden" style={{
          background: "#ffffff",
          border: "1px solid rgba(12,14,19,.1)",
          borderRadius: 16, overflow: "hidden",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr style={{ background: "#F5F5F3", borderBottom: "1px solid rgba(12,14,19,.1)" }}>
                  {([
                    { key: "scheme_name" as SortKey, label: "Fund Name",  align: "left"  },
                    { key: "nav"         as SortKey, label: "NAV (₹)",    align: "right" },
                    { key: "return_1y"   as SortKey, label: "1Y Return",  align: "right" },
                    { key: "return_3y"   as SortKey, label: "3Y CAGR",    align: "right" },
                    { key: "return_5y"   as SortKey, label: "5Y CAGR",    align: "right" },
                  ]).map(col => (
                    <th
                      key={col.key}
                      className="amc-th"
                      onClick={() => toggleSort(col.key)}
                      style={{
                        padding: "11px 16px",
                        textAlign: col.align as "left" | "right",
                        fontSize: 10.5, fontWeight: 700,
                        color: "rgba(12,14,19,.4)", letterSpacing: ".7px",
                        textTransform: "uppercase",
                        cursor: "pointer", transition: "color .15s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span className="amc-sort-btn">
                        {col.align === "right" && <SortArrow col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                        {col.label}
                        {col.align === "left"  && <SortArrow col={col.key} sortKey={sortKey} sortDir={sortDir} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i}>
                        {[240, 80, 70, 70, 70].map((w, j) => (
                          <td key={j} style={{ padding: "14px 16px" }}>
                            <div style={{
                              height: 12, width: w, borderRadius: 6,
                              background: "rgba(12,14,19,.07)",
                              animation: "amc-pulse 1.4s ease infinite",
                            }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : filtered.map(fund => {
                      const tracked = getTrackedIndex(fund.scheme_name)
                      return (
                        <tr
                          key={fund.scheme_code}
                          className="amc-row"
                          onClick={() => window.location.href = `/funds/${fund.scheme_code}`}
                          style={{
                            cursor: "pointer",
                            borderBottom: "1px solid rgba(12,14,19,.06)",
                            transition: "background .12s",
                          }}
                        >
                          <td style={{ padding: "13px 16px" }}>
                            <div style={{ fontWeight: 600, fontSize: 13.5, color: "#0C0E13", lineHeight: 1.35, maxWidth: 420 }}>
                              {fund.scheme_name}
                            </div>
                            {tracked && (
                              <div style={{ marginTop: 3 }}>
                                <Link
                                  href={`/rankings/${tracked.code}`}
                                  onClick={e => e.stopPropagation()}
                                  style={{
                                    display: "inline-flex", alignItems: "center", gap: 3,
                                    padding: "1px 6px", borderRadius: 4,
                                    background: "rgba(26,86,219,.08)",
                                    color: "#1A56DB", fontSize: 10, fontWeight: 600,
                                    textDecoration: "none",
                                  }}
                                >
                                  <svg viewBox="0 0 10 10" fill="none" style={{ width: 8, height: 8 }}>
                                    <path d="M1 9L9 1M9 1H3M9 1V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                  {tracked.name}
                                </Link>
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "13px 16px", textAlign: "right" }}>
                            {fund.nav !== null
                              ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "#0C0E13" }}>
                                  ₹{fund.nav.toFixed(1)}
                                </span>
                              : <span style={{ color: "rgba(12,14,19,.2)", fontSize: 12 }}>—</span>
                            }
                            {fund.nav_date && (
                              <div style={{ fontSize: 10, color: "rgba(12,14,19,.3)", marginTop: 1 }}>{fund.nav_date}</div>
                            )}
                          </td>
                          <td style={{ padding: "13px 16px", textAlign: "right" }}><ReturnBadge value={fund.return_1y} /></td>
                          <td style={{ padding: "13px 16px", textAlign: "right" }}><ReturnBadge value={fund.return_3y} /></td>
                          <td style={{ padding: "13px 16px", textAlign: "right" }}><ReturnBadge value={fund.return_5y} /></td>
                        </tr>
                      )
                    })
                }
              </tbody>
            </table>
          </div>
          {!loading && filtered.length === 0 && funds.length > 0 && (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <p style={{ color: "rgba(12,14,19,.4)", fontSize: 14 }}>No funds match your search.</p>
            </div>
          )}
          {!loading && funds.length === 0 && (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <p style={{ color: "rgba(12,14,19,.4)", fontSize: 14 }}>No funds found for this AMC.</p>
            </div>
          )}
        </div>

        {/* Mobile Cards */}
        <div className="flex flex-col md:hidden" style={{ gap: 8 }}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{
                  height: 100, borderRadius: 14,
                  background: "rgba(12,14,19,.06)",
                  animation: "amc-pulse 1.4s ease infinite",
                }} />
              ))
            : filtered.map(fund => {
                const tracked = getTrackedIndex(fund.scheme_name)
                return (
                  <Link
                    key={fund.scheme_code}
                    href={`/funds/${fund.scheme_code}`}
                    style={{
                      display: "block", textDecoration: "none",
                      background: "#ffffff",
                      border: "1px solid rgba(12,14,19,.1)",
                      borderRadius: 14, padding: "14px 16px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{
                          margin: 0, fontWeight: 600, fontSize: 13.5,
                          color: "#0C0E13", lineHeight: 1.35,
                          overflow: "hidden", textOverflow: "ellipsis",
                          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                        }}>
                          {fund.scheme_name}
                        </p>
                        {tracked && (
                          <Link
                            href={`/rankings/${tracked.code}`}
                            onClick={e => e.stopPropagation()}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 3,
                              padding: "1px 6px", marginTop: 4, borderRadius: 4,
                              background: "rgba(26,86,219,.08)",
                              color: "#1A56DB", fontSize: 10, fontWeight: 600,
                              textDecoration: "none",
                            }}
                          >
                            ↗ {tracked.code}
                          </Link>
                        )}
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        {fund.nav !== null
                          ? <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#0C0E13" }}>
                              ₹{fund.nav.toFixed(1)}
                            </p>
                          : <p style={{ margin: 0, color: "rgba(12,14,19,.2)", fontSize: 12 }}>—</p>
                        }
                        {fund.nav_date && (
                          <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(12,14,19,.3)" }}>{fund.nav_date}</p>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[
                        { label: "1Y",      value: fund.return_1y },
                        { label: "3Y CAGR", value: fund.return_3y },
                        { label: "5Y CAGR", value: fund.return_5y },
                      ].map(({ label, value }) => (
                        <div key={label} style={{
                          background: "#F5F5F3", borderRadius: 8,
                          padding: "6px 8px", textAlign: "center",
                        }}>
                          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: "rgba(12,14,19,.35)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 3 }}>
                            {label}
                          </p>
                          <ReturnBadge value={value} />
                        </div>
                      ))}
                    </div>
                  </Link>
                )
              })
          }
        </div>
      </div>
    </div>
  )
}
