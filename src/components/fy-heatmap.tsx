"use client"

import { useEffect, useState } from "react"

/* ─────────────────────────────────────────────────────────
   TYPES  (mirroring the API response)
───────────────────────────────────────────────────────── */
interface CellData {
  code:     string
  label:    string
  fullName: string
  ret:      number | null
}

interface FYYear {
  label:   string   // e.g. "FY10", "FY27 ▸ Live"
  live:    boolean
  endDate: string
  cells:   CellData[]  // sorted best → worst
}

interface ApiResponse {
  years:       FYYear[]
  lastUpdated: string
}

/* ─────────────────────────────────────────────────────────
   COLOR LOGIC
   Return-based colour scale (similar to reference heatmap):
     ≥ 60 %  → deep emerald
     35-60 % → green
     15-35 % → light green
      0-15 % → amber
    -15-0  % → orange-red
    < -15  % → red / deep red
───────────────────────────────────────────────────────── */
function cellColor(ret: number | null): { bg: string; text: string } {
  if (ret === null) return { bg: "#f5f5f4", text: "#a8a29e" }
  if (ret >= 60)  return { bg: "#14532d", text: "#ffffff" }
  if (ret >= 35)  return { bg: "#166534", text: "#ffffff" }
  if (ret >= 15)  return { bg: "#15803d", text: "#ffffff" }
  if (ret >= 5)   return { bg: "#4d7c0f", text: "#ffffff" }
  if (ret >= 0)   return { bg: "#a16207", text: "#ffffff" }
  if (ret >= -15) return { bg: "#b45309", text: "#ffffff" }
  if (ret >= -30) return { bg: "#dc2626", text: "#ffffff" }
  return              { bg: "#7f1d1d", text: "#ffffff" }
}

function fmt(v: number | null): string {
  if (v === null) return "—"
  const sign = v >= 0 ? "+" : ""
  return `${sign}${v.toFixed(1)}%`
}

/* ─────────────────────────────────────────────────────────
   SKELETON  (shown while loading)
───────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div style={{ padding: "24px 0" }}>
      <div style={{
        height: 16, width: "40%", borderRadius: 6,
        background: "rgba(0,0,0,.07)", marginBottom: 20,
        animation: "pulse 1.4s ease infinite",
      }} />
      <div style={{
        height: 280, borderRadius: 12,
        background: "rgba(0,0,0,.05)",
        animation: "pulse 1.4s ease infinite",
      }} />
    </div>
  )
}

/* ─────────────────────────────────────────────────────────
   COLOUR LEGEND
───────────────────────────────────────────────────────── */
const LEGEND_ITEMS = [
  { label: "≥ 60%",  bg: "#14532d" },
  { label: "35–60%", bg: "#166534" },
  { label: "15–35%", bg: "#15803d" },
  { label: "5–15%",  bg: "#4d7c0f" },
  { label: "0–5%",   bg: "#a16207" },
  { label: "0 – −15%",  bg: "#b45309" },
  { label: "< −15%", bg: "#dc2626" },
]

/* ─────────────────────────────────────────────────────────
   MAIN COMPONENT
───────────────────────────────────────────────────────── */
export function FiscalYearHeatmap() {
  const [data, setData]     = useState<ApiResponse | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/academy/fy-returns")
      .then(r => r.json())
      .then((d: ApiResponse) => { setData(d); setLoading(false) })
      .catch(() => { setError("Could not load chart data."); setLoading(false) })
  }, [])

  if (loading) return <Skeleton />
  if (error || !data) return (
    <div style={{ padding: "20px 0", color: "var(--muted-foreground)", fontSize: 13 }}>
      {error ?? "No data available."}
    </div>
  )

  const { years, lastUpdated } = data
  // Number of rows = 8 indices
  const nRows = years[0]?.cells.length ?? 0

  const CELL_W   = 80   // px per column (FY)
  const CELL_H   = 60   // px per row
  const COL_W    = 36   // rank column width

  return (
    <div style={{ marginTop: 8 }}>
      {/* ── Header row ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: ".6px", textTransform: "uppercase" }}>
          Fiscal Year Returns  ·  FY10 – FY27 Live
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted-foreground)", opacity: .7 }}>
          Updated {lastUpdated}
        </div>
      </div>

      {/* ── Scrollable table ── */}
      <div style={{
        overflowX: "auto",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,.1)",
        WebkitOverflowScrolling: "touch",
      }}>
        <table style={{
          borderCollapse: "collapse",
          minWidth: years.length * CELL_W + COL_W,
          width: "100%",
          tableLayout: "fixed",
        }}>
          {/* Column widths */}
          <colgroup>
            <col style={{ width: COL_W }} />
            {years.map(y => <col key={y.label} style={{ width: CELL_W }} />)}
          </colgroup>

          {/* Year headers */}
          <thead>
            <tr>
              <th style={{
                padding: "8px 4px", fontSize: 9.5, fontWeight: 700,
                color: "var(--muted-foreground)", textAlign: "center",
                background: "var(--muted, #f5f5f4)",
                borderRight: "1px solid rgba(0,0,0,.08)",
                position: "sticky", left: 0, zIndex: 2,
              }}>
                #
              </th>
              {years.map(y => (
                <th key={y.label} style={{
                  padding: "7px 3px",
                  fontSize: 9,
                  fontWeight: y.live ? 800 : 700,
                  color: y.live ? "#1A56DB" : "var(--muted-foreground)",
                  textAlign: "center",
                  background: y.live ? "rgba(26,86,219,.06)" : "var(--muted, #f5f5f4)",
                  borderRight: "1px solid rgba(0,0,0,.05)",
                  letterSpacing: "0.3px",
                  whiteSpace: "nowrap",
                  lineHeight: 1.3,
                }}>
                  {y.live ? (
                    <>
                      <span style={{ display: "block" }}>{y.label.split(" ▸")[0]}</span>
                      <span style={{ display: "block", color: "#1A56DB", fontWeight: 900, fontSize: 7.5, letterSpacing: ".4px" }}>▸ LIVE</span>
                    </>
                  ) : y.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* Rows: rank 1 (best) to rank N (worst) */}
          <tbody>
            {Array.from({ length: nRows }).map((_, rowIdx) => (
              <tr key={rowIdx}>
                {/* Rank label */}
                <td style={{
                  padding: "2px 4px",
                  fontSize: 9, fontWeight: 700,
                  color: "var(--muted-foreground)",
                  textAlign: "center",
                  background: "var(--muted, #f5f5f4)",
                  borderRight: "1px solid rgba(0,0,0,.08)",
                  borderTop: "1px solid rgba(0,0,0,.05)",
                  position: "sticky", left: 0, zIndex: 1,
                  verticalAlign: "middle",
                }}>
                  {rowIdx + 1}
                </td>

                {/* Data cells */}
                {years.map(fy => {
                  const cell  = fy.cells[rowIdx]
                  const color = cellColor(cell?.ret ?? null)
                  return (
                    <td
                      key={fy.label}
                      title={cell ? `${cell.fullName}: ${fmt(cell.ret)}` : ""}
                      style={{
                        height: CELL_H,
                        padding: "4px 3px",
                        background: color.bg,
                        borderTop: "1px solid rgba(255,255,255,.12)",
                        borderRight: "1px solid rgba(255,255,255,.08)",
                        textAlign: "center",
                        verticalAlign: "middle",
                        cursor: "default",
                      }}
                    >
                      {cell ? (
                        <>
                          <div style={{
                            fontSize: 8.5, fontWeight: 700,
                            color: color.text,
                            lineHeight: 1.2,
                            opacity: .92,
                            letterSpacing: "0.2px",
                          }}>
                            {cell.label}
                          </div>
                          <div style={{
                            fontSize: 10.5, fontWeight: 800,
                            color: color.text,
                            lineHeight: 1.3,
                            marginTop: 2,
                            fontVariantNumeric: "tabular-nums",
                          }}>
                            {fmt(cell.ret)}
                          </div>
                        </>
                      ) : (
                        <span style={{ fontSize: 10, color: "#a8a29e" }}>—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Colour legend ── */}
      <div style={{
        marginTop: 12,
        display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
      }}>
        <span style={{ fontSize: 9.5, color: "var(--muted-foreground)", fontWeight: 600, marginRight: 4 }}>Return:</span>
        {LEGEND_ITEMS.map(l => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: l.bg, flexShrink: 0 }} />
            <span style={{ fontSize: 9.5, color: "var(--muted-foreground)" }}>{l.label}</span>
          </div>
        ))}
      </div>

      {/* ── Index key ── */}
      <div style={{
        marginTop: 14,
        background: "rgba(0,0,0,.03)",
        borderRadius: 10,
        padding: "12px 14px",
        border: "1px solid rgba(0,0,0,.07)",
      }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: ".6px", textTransform: "uppercase", marginBottom: 8 }}>
          Index Key
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 20px" }}>
          {[
            { label: "Quality",   full: "Nifty Midcap150 Quality 50"  },
            { label: "Value",     full: "Nifty500 Value 50"            },
            { label: "Momentum",  full: "Nifty Midcap150 Momentum 50" },
            { label: "Alpha",     full: "Nifty200 Alpha 30"            },
            { label: "Size",      full: "Nifty Smallcap 250"           },
            { label: "Global",    full: "S&P 500 (USD)"                },
            { label: "Gold",      full: "Gold BeES (ETF)"              },
            { label: "Nifty 50",  full: "Nifty 50"                     },
          ].map(k => (
            <div key={k.label} style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              <span style={{ fontWeight: 700, color: "var(--foreground)" }}>{k.label}</span>
              <span style={{ opacity: .7 }}> = {k.full}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Disclaimer ── */}
      <p style={{
        marginTop: 10, fontSize: 10.5,
        color: "var(--muted-foreground)", opacity: .65,
        lineHeight: 1.5,
      }}>
        Returns shown are price returns for each India Fiscal Year (Apr 1 – Mar 31). S&amp;P 500 in USD.
        Past performance is not indicative of future results. Source: NSE India, Yahoo Finance.
      </p>
    </div>
  )
}
