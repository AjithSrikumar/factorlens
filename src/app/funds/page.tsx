"use client"

import { useState, useEffect, useMemo, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { getTrackedIndex } from "@/lib/index-fund-map"
import { amcLogoUrl, amcSlug } from "@/lib/amc"

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
  aum_cr:          null
}

type SortKey = "scheme_name" | "scheme_category" | "nav" | "return_1y" | "return_3y" | "return_5y"
type SortDir = "asc" | "desc"

/**
 * Derive a meaningful category from the fund name + AMFI scheme_category.
 * Passive funds (index/ETF) are categorised by strategy; active funds by asset class.
 * Order matters: multi-keyword combos before single-keyword checks.
 */
function deriveCategory(name: string, rawCat?: string | null): string {
  const n   = name.toLowerCase()
  const cat = (rawCat ?? "").toLowerCase()

  // ── Commodities (always first, passive or active) ─────────────────────────
  if (n.includes("gold")) return "Gold"
  if (n.includes("silver")) return "Silver"

  // ── International / Global ────────────────────────────────────────────────
  if (n.includes("nasdaq") || n.includes("s&p 500") || n.includes("s&p500") ||
      n.includes("global") || n.includes("international") || n.includes("world") ||
      n.includes("us equity") || n.includes("hangseng") || n.includes("nifty us") ||
      n.includes("dow jones") || n.includes("ftse") || n.includes("japan") ||
      n.includes("china") || n.includes("taiwan") || n.includes("korea"))
    return "Global"

  // ── Determine if this is a passive fund (index fund / ETF) ────────────────
  // Uses scheme_category from AMFI (via mfapi.in) as the primary signal.
  // Also falls back to name-based detection when scheme_category is absent.
  const catPassive =
    cat.includes("index fund") || cat.includes("- index") ||
    cat.includes("etf") || cat.includes("exchange traded")
  const namePassive =
    n.includes("index fund") || n.includes(" etf") || n.endsWith(" etf") ||
    // Broad name-based detection for missing categories (nifty/sensex funds are always passive)
    (!rawCat && (n.includes("nifty") || n.includes("sensex") || n.includes("bse ") || n.includes("nasdaq") || n.includes("s&p")))
  const isPassive = catPassive || namePassive

  if (isPassive) {
    // Factor strategies — multi-factor combos before single factors
    if ((n.includes("alpha") && n.includes("low vol")) ||
        (n.includes("quality") && n.includes("low vol")) ||
        (n.includes("alpha") && n.includes("quality")) ||
        n.includes("multi-factor") || n.includes("multifactor") || n.includes("mqvlv"))
      return "Multi-Factor"
    if (n.includes("momentum"))   return "Momentum"
    if (n.includes("alpha"))      return "Alpha"
    if (n.includes("low vol") || n.includes("low-vol") || n.includes("low volatility"))
      return "Low Vol"
    if (n.includes("quality"))    return "Quality"
    if (n.includes("value"))      return "Value"
    if (n.includes("dividend"))   return "Dividend"
    if (n.includes("equal weight") || n.includes("equal-cap")) return "Equal Weight"
    if (n.includes("high beta"))  return "High Beta"

    // Sectoral / Thematic passive (before broad-market fallback)
    if (n.includes("defence") || n.includes("defense") || n.includes("infra") ||
        n.includes("infrastructure") || n.includes("energy") || n.includes("pharma") ||
        n.includes("healthcare") || n.includes("health care") || n.includes("bank") ||
        n.includes("financial") || n.includes("nifty it") || n.includes("nifty media") ||
        n.includes("technology") || n.includes("consumption") || n.includes("auto") ||
        n.includes("realty") || n.includes("media") || n.includes("psu") ||
        n.includes("cpse") || n.includes("housing") || n.includes("manufacturing") ||
        n.includes("mfg") || n.includes("metal") || n.includes("oil") ||
        n.includes("fmcg") || n.includes("chemical") || n.includes("mnc") ||
        n.includes("pse") || n.includes("tourism") || n.includes("mobility") ||
        n.includes("shariah") || n.includes("ev ") || n.includes("digital") ||
        n.includes("rural") || n.includes("transport") || n.includes("capital market") ||
        n.includes("ipo") || n.includes("commodit") || n.includes("service sector") ||
        n.includes("private bank") || n.includes("psu bank") || n.includes("reits") ||
        n.includes("conglomerate") || n.includes("waves") || n.includes("railways"))
      return "Thematic"

    return "Broad Market"
  }

  // ── Active funds — categorise by AMFI scheme_category ────────────────────
  if (!rawCat) return "Other"

  // Liquid / Overnight / Money Market
  if (cat.includes("liquid") || cat.includes("overnight") || cat.includes("money market"))
    return "Liquid"

  // All other Debt
  if (cat.includes("debt") || cat.includes("gilt") || cat.includes("bond") ||
      cat.includes("duration") || cat.includes("credit") || cat.includes("floater") ||
      cat.includes("banking and psu") || cat.includes("banking & psu"))
    return "Debt"

  // ELSS (tax-saving equity)
  if (cat.includes("elss") || cat.includes("tax sav") ||
      n.includes("tax sav") || n.includes("elss"))
    return "ELSS"

  // Hybrid schemes
  if (cat.includes("hybrid") || cat.includes("balanced") || cat.includes("multi asset") ||
      cat.includes("arbitrage") || cat.includes("equity savings") ||
      cat.includes("dynamic asset"))
    return "Hybrid"

  // Fund of Funds
  if (cat.includes("fund of fund") || cat.includes("fof"))
    return "FoF"

  // Solution-oriented
  if (cat.includes("solution") || cat.includes("retirement") || cat.includes("children"))
    return "Solution"

  // Active Equity (large/mid/small/flexi/focused/contra/sectoral)
  if (cat.includes("equity") || cat.includes("large cap") || cat.includes("mid cap") ||
      cat.includes("small cap") || cat.includes("flexi cap") || cat.includes("multi cap") ||
      cat.includes("focused") || cat.includes("contra") || cat.includes("sectoral") ||
      cat.includes("thematic"))
    return "Active Equity"

  return "Other"
}

function catLabel(name: string, rawCat?: string | null): string {
  return deriveCategory(name, rawCat)
}

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

// Loading skeleton row
function SkeletonRow() {
  return (
    <tr>
      {[180, 100, 70, 60, 60, 60].map((w, i) => (
        <td key={i} style={{ padding: "14px 16px" }}>
          <div style={{
            height: 12, width: w, borderRadius: 6,
            background: "rgba(12,14,19,.07)",
            animation: "mf-pulse 1.4s ease infinite",
          }} />
        </td>
      ))}
    </tr>
  )
}

function FundsPageInner() {
  const searchParams = useSearchParams()
  const [funds,          setFunds]          = useState<MFFund[]>([])
  const [loading,        setLoading]        = useState(true)
  const [error,          setError]          = useState<string | null>(null)
  const [search,         setSearch]         = useState(searchParams.get("search") ?? "")
  const [categoryFilter, setCategoryFilter] = useState("All")
  const [sortKey,        setSortKey]        = useState<SortKey>("return_3y")
  const [sortDir,        setSortDir]        = useState<SortDir>("desc")

  // Initial load
  useEffect(() => {
    fetch("/api/mffunds")
      .then(r => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setFunds(data as MFFund[])
        } else if (data && typeof data === "object" && "error" in (data as object)) {
          setError(String((data as Record<string, unknown>).error))
        } else {
          setError("Unexpected response from server")
        }
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  // Supabase realtime: update individual fund rows when daily sync pushes new NAV data
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return

    const channel = supabase
      .channel("funds-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "funds" },
        (payload) => {
          const updated = payload.new as MFFund
          setFunds(prev =>
            prev.map(f => f.scheme_code === updated.scheme_code ? { ...f, ...updated } : f)
          )
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const categories = useMemo(() => {
    const cats = Array.from(new Set(funds.map(f => deriveCategory(f.scheme_name, f.scheme_category)).filter(Boolean)))
    return ["All", ...cats.sort()]
  }, [funds])

  const filtered = useMemo(() => {
    let list = funds
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(f =>
        f.scheme_name.toLowerCase().includes(q) ||
        f.fund_house.toLowerCase().includes(q)
      )
    }
    if (categoryFilter !== "All") {
      list = list.filter(f => deriveCategory(f.scheme_name, f.scheme_category) === categoryFilter)
    }
    list = [...list].sort((a, b) => {
      let av: string | number | null = a[sortKey]
      let bv: string | number | null = b[sortKey]
      const nullVal = sortDir === "asc" ? Infinity : -Infinity
      if (av === null) av = nullVal as number
      if (bv === null) bv = nullVal as number
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
    return list
  }, [funds, search, categoryFilter, sortKey, sortDir])

  function toggleSort(col: SortKey) {
    if (sortKey === col) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortKey(col); setSortDir("desc") }
  }

  const navDate     = funds.find(f => f.nav_date)?.nav_date
  const withReturns = funds.filter(f => f.return_1y !== null).length

  return (
    <div style={{ minHeight: "100vh", background: "#F5F5F3" }}>
      <style>{`
        @keyframes mf-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: .4; }
        }
        .mf-row:hover { background: rgba(26,86,219,.03) !important; }
        .mf-th:hover { color: #0C0E13 !important; }
        .mf-sort-btn { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; user-select: none; }
        .mf-cat-pill { display: inline-flex; align-items: center; padding: 4px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; border: 1px solid transparent; cursor: pointer; transition: all .15s; white-space: nowrap; }
        .mf-scroll-cats::-webkit-scrollbar { display: none; }
        .mf-scroll-cats { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "28px 20px 80px" }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "#0C0E13", margin: "0 0 4px", letterSpacing: "-.02em" }}>
            Mutual Funds
          </h1>
          <p style={{ color: "rgba(12,14,19,.45)", fontSize: 13.5, margin: 0 }}>
            {loading
              ? "Loading live data from mfapi.in…"
              : `${funds.length} funds · NAV as of ${navDate ?? "—"} · ${withReturns} with return history`
            }
          </p>
        </div>

        {/* ── Error ── */}
        {error && (
          <div style={{
            background: "rgba(197,39,30,.05)", border: "1px solid rgba(197,39,30,.2)",
            borderRadius: 12, padding: "14px 18px", marginBottom: 20,
          }}>
            <p style={{ color: "#C5271E", fontSize: 13.5, margin: 0 }}>{error}</p>
          </div>
        )}

        {/* ── Search + Filter bar ── */}
            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              {/* Search input */}
              <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
                <svg viewBox="0 0 18 18" fill="none" style={{
                  position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
                  width: 15, height: 15, pointerEvents: "none",
                }}>
                  <circle cx="7.5" cy="7.5" r="5.5" stroke="rgba(12,14,19,.35)" strokeWidth="1.5" />
                  <path d="M12 12l3.5 3.5" stroke="rgba(12,14,19,.35)" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by fund name or AMC…"
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
              {/* Category filter */}
              {categories.length > 1 && (
                <div className="mf-scroll-cats" style={{ display: "flex", gap: 6, overflowX: "auto", alignItems: "center", flexShrink: 0, maxWidth: "100%" }}>
                  {categories.map(c => (
                    <button
                      key={c}
                      onClick={() => setCategoryFilter(c)}
                      className="mf-cat-pill"
                      style={{
                        background: categoryFilter === c ? "#0C0E13" : "#ffffff",
                        color: categoryFilter === c ? "#ffffff" : "rgba(12,14,19,.6)",
                        borderColor: categoryFilter === c ? "#0C0E13" : "rgba(12,14,19,.15)",
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Results count */}
            {!loading && funds.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <span style={{ fontSize: 12.5, color: "rgba(12,14,19,.4)" }}>
                  {filtered.length} of {funds.length} funds
                  {categoryFilter !== "All" && <> in <strong style={{ color: "#0C0E13" }}>{categoryFilter}</strong></>}
                </span>
              </div>
            )}

            {/* ── Desktop Table ── */}
            <div className="md:block hidden" style={{
              background: "#ffffff",
              border: "1px solid rgba(12,14,19,.1)",
              borderRadius: 16, overflow: "hidden",
            }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
                  <thead>
                    <tr style={{ background: "#F5F5F3", borderBottom: "1px solid rgba(12,14,19,.1)" }}>
                      {([
                        { key: "scheme_name"     as SortKey, label: "Fund Name",  align: "left"  },
                        { key: "scheme_category" as SortKey, label: "Category",   align: "left"  },
                        { key: "nav"             as SortKey, label: "NAV (₹)",    align: "right" },
                        { key: "return_1y"       as SortKey, label: "1Y Return",  align: "right" },
                        { key: "return_3y"       as SortKey, label: "3Y CAGR",    align: "right" },
                        { key: "return_5y"       as SortKey, label: "5Y CAGR",    align: "right" },
                      ]).map(col => (
                        <th
                          key={col.key}
                          className="mf-th"
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
                          <span className="mf-sort-btn">
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
                      ? Array.from({ length: 12 }).map((_, i) => <SkeletonRow key={i} />)
                      : filtered.map(fund => (
                        <tr
                          key={fund.scheme_code}
                          className="mf-row"
                          onClick={() => window.location.href = `/funds/${fund.scheme_code}`}
                          style={{
                            cursor: "pointer",
                            borderBottom: "1px solid rgba(12,14,19,.06)",
                            transition: "background .12s",
                          }}
                        >
                          <td style={{ padding: "13px 16px" }}>
                            <div style={{
                              fontWeight: 600, fontSize: 13.5, color: "#0C0E13",
                              lineHeight: 1.35, maxWidth: 380,
                            }}>
                              {fund.scheme_name}
                            </div>
                            <div style={{
                              marginTop: 2, fontSize: 11.5,
                              color: "rgba(12,14,19,.4)",
                              display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap",
                            }}>
                              {amcLogoUrl(fund.fund_house)
                                ? <img
                                    src={amcLogoUrl(fund.fund_house)!}
                                    alt=""
                                    width={16} height={16}
                                    style={{ borderRadius: 3, objectFit: "contain", flexShrink: 0 }}
                                  />
                                : <svg viewBox="0 0 14 14" fill="none" style={{ width: 11, height: 11, flexShrink: 0 }}>
                                    <rect x="1" y="1" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" />
                                    <path d="M4 7h6M4 5h4M4 9h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                                  </svg>
                              }
                              <Link
                                href={`/amc/${amcSlug(fund.fund_house)}`}
                                onClick={e => e.stopPropagation()}
                                style={{ color: "inherit", textDecoration: "none" }}
                              >
                                {fund.fund_house}
                              </Link>
                              {(() => {
                                const tracked = getTrackedIndex(fund.scheme_name)
                                if (!tracked) return null
                                return (
                                  <Link
                                    href={`/rankings/${tracked.code}`}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                      display: "inline-flex", alignItems: "center", gap: 3,
                                      padding: "1px 6px", borderRadius: 4,
                                      background: "rgba(26,86,219,.08)",
                                      color: "#1A56DB", fontSize: 10, fontWeight: 600,
                                      textDecoration: "none", whiteSpace: "nowrap",
                                    }}
                                  >
                                    <svg viewBox="0 0 10 10" fill="none" style={{ width: 8, height: 8 }}>
                                      <path d="M1 9L9 1M9 1H3M9 1V7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    {tracked.name}
                                  </Link>
                                )
                              })()}
                            </div>
                          </td>
                          <td style={{ padding: "13px 16px" }}>
                            <span style={{
                              display: "inline-block", padding: "3px 8px",
                              borderRadius: 6, background: "rgba(12,14,19,.06)",
                              fontSize: 11, fontWeight: 600,
                              color: "rgba(12,14,19,.55)",
                            }}>
                              {catLabel(fund.scheme_name, fund.scheme_category)}
                            </span>
                          </td>
                          <td style={{ padding: "13px 16px", textAlign: "right" }}>
                            {fund.nav !== null
                              ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "#0C0E13" }}>
                                  ₹{fund.nav.toFixed(1)}
                                </span>
                              : <span style={{ color: "rgba(12,14,19,.2)", fontSize: 12 }}>—</span>
                            }
                            {fund.nav_date && (
                              <div style={{ fontSize: 10, color: "rgba(12,14,19,.3)", marginTop: 1 }}>
                                {fund.nav_date}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "13px 16px", textAlign: "right" }}>
                            <ReturnBadge value={fund.return_1y} />
                          </td>
                          <td style={{ padding: "13px 16px", textAlign: "right" }}>
                            <ReturnBadge value={fund.return_3y} />
                          </td>
                          <td style={{ padding: "13px 16px", textAlign: "right" }}>
                            <ReturnBadge value={fund.return_5y} />
                          </td>
                        </tr>
                      ))
                    }
                  </tbody>
                </table>
              </div>

              {!loading && filtered.length === 0 && funds.length > 0 && (
                <div style={{ padding: "48px 24px", textAlign: "center" }}>
                  <p style={{ color: "rgba(12,14,19,.4)", fontSize: 14 }}>No funds match your search.</p>
                </div>
              )}
            </div>

            {/* ── Mobile Cards ── */}
            <div className="flex flex-col md:hidden" style={{ gap: 8 }}>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} style={{
                      height: 110, borderRadius: 14,
                      background: "rgba(12,14,19,.06)",
                      animation: "mf-pulse 1.4s ease infinite",
                    }} />
                  ))
                : filtered.map(fund => (
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
                          <div style={{ margin: "3px 0 0", display: "flex", alignItems: "center", gap: 5 }}>
                            {amcLogoUrl(fund.fund_house) && (
                              <img
                                src={amcLogoUrl(fund.fund_house)!}
                                alt=""
                                width={14} height={14}
                                style={{ borderRadius: 3, objectFit: "contain", flexShrink: 0 }}
                              />
                            )}
                            <Link
                              href={`/amc/${amcSlug(fund.fund_house)}`}
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: 11.5, color: "rgba(12,14,19,.4)", textDecoration: "none" }}
                            >
                              {fund.fund_house}
                            </Link>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          {fund.nav !== null
                            ? <p style={{ margin: 0, fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#0C0E13" }}>
                                ₹{fund.nav.toFixed(1)}
                              </p>
                            : <p style={{ margin: 0, color: "rgba(12,14,19,.2)", fontSize: 12 }}>—</p>
                          }
                          {fund.nav_date && (
                            <p style={{ margin: "2px 0 0", fontSize: 10, color: "rgba(12,14,19,.3)" }}>
                              {fund.nav_date}
                            </p>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                        <span style={{
                          display: "inline-block", padding: "2px 7px",
                          borderRadius: 5, background: "rgba(12,14,19,.06)",
                          fontSize: 10.5, fontWeight: 600, color: "rgba(12,14,19,.5)",
                        }}>
                          {catLabel(fund.scheme_name, fund.scheme_category)}
                        </span>
                        {(() => {
                          const tracked = getTrackedIndex(fund.scheme_name)
                          if (!tracked) return null
                          return (
                            <Link
                              href={`/rankings/${tracked.code}`}
                              onClick={e => e.stopPropagation()}
                              style={{
                                display: "inline-flex", alignItems: "center", gap: 3,
                                padding: "2px 7px", borderRadius: 5,
                                background: "rgba(26,86,219,.08)",
                                color: "#1A56DB", fontSize: 10, fontWeight: 600,
                                textDecoration: "none",
                              }}
                            >
                              ↗ {tracked.code}
                            </Link>
                          )
                        })()}
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
                  ))
              }

              {!loading && filtered.length === 0 && funds.length > 0 && (
                <div style={{ padding: "48px 0", textAlign: "center" }}>
                  <p style={{ color: "rgba(12,14,19,.4)", fontSize: 14 }}>No funds match your search.</p>
                </div>
              )}
            </div>

            {/* ── Disclosure ── */}
            {!loading && funds.length > 0 && (
              <div style={{
                marginTop: 20, borderRadius: 12,
                border: "1px dashed rgba(12,14,19,.15)",
                padding: "12px 16px", background: "rgba(12,14,19,.02)",
              }}>
                <p style={{ margin: "0 0 3px", fontSize: 10, fontWeight: 700, color: "rgba(12,14,19,.35)", textTransform: "uppercase", letterSpacing: ".7px" }}>Disclosure</p>
                <p style={{ margin: 0, fontSize: 11.5, color: "rgba(12,14,19,.45)", lineHeight: 1.65 }}>
                  NAV data sourced from AMFI via mfapi.in (updated 6× daily). Returns are point-to-point (1Y) or CAGR (3Y / 5Y) computed from historical NAV.
                  Past performance is not indicative of future results.
                </p>
              </div>
            )}
      </div>
    </div>
  )
}

export default function FundsPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#F5F5F3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", border: "3px solid rgba(12,14,19,.1)", borderTopColor: "#1A56DB", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    }>
      <FundsPageInner />
    </Suspense>
  )
}
