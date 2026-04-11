"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { amcLogoUrl } from "@/lib/amc"

interface Fund {
  id: number
  code: string
  name: string
  category: string
}

interface FundAllocation {
  fund: Fund
  weight: number
}

interface MFFund {
  scheme_code: number
  scheme_name: string
  fund_house: string
  scheme_category: string
  nav: number | null
  return_1y: number | null
  return_3y: number | null
  return_5y: number | null
}

interface FundRow {
  fund: Fund
  weight: number
  allocated: number
  mfs: MFFund[]
  chosen: MFFund | null
  units: number | null
  actualInvestment: number | null
}

interface Props {
  allocations: FundAllocation[]
}

const QUICK_AMOUNTS = [
  { label: '₹25K',  value: 25000 },
  { label: '₹50K',  value: 50000 },
  { label: '₹1L',   value: 100000 },
  { label: '₹2L',   value: 200000 },
  { label: '₹5L',   value: 500000 },
]

function fmt(n: number) {
  return n.toLocaleString('en-IN')
}

function pct(v: number | null) {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function toTitleCase(s: string) {
  return s.replace(/\b\w+\b/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

export function InvestNow({ allocations }: Props) {
  const [expanded, setExpanded]     = useState(false)
  const [amount, setAmount]         = useState('')
  const [mfMap, setMfMap]           = useState<Record<string, MFFund[]>>({})
  const [fetchingMF, setFetchingMF] = useState(false)
  const [chosenIdx, setChosenIdx]   = useState<Record<string, number>>({})
  const [expandedMF, setExpandedMF] = useState<string | null>(null)

  // Fetch MF trackers when section opens
  useEffect(() => {
    if (!expanded || allocations.length === 0) return
    const alreadyLoaded = allocations.every(a => a.fund.code in mfMap)
    if (alreadyLoaded) return

    setFetchingMF(true)
    Promise.all(
      allocations.map(a =>
        fetch(`/api/mffunds/byindex?indexName=${encodeURIComponent(a.fund.name)}`)
          .then(r => r.json())
          .then((d: unknown) => ({
            code: a.fund.code,
            data: Array.isArray(d) ? (d as MFFund[]) : [],
          }))
          .catch(() => ({ code: a.fund.code, data: [] }))
      )
    ).then(results => {
      const map: Record<string, MFFund[]> = { ...mfMap }
      results.forEach(r => { map[r.code] = r.data })
      setMfMap(map)
      setFetchingMF(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, allocations.length])

  const investAmount = parseFloat(amount.replace(/,/g, '')) || 0

  const rows: FundRow[] = allocations.map(a => {
    const allocated = (a.weight / 100) * investAmount
    const mfs = (mfMap[a.fund.code] ?? [])
      .slice()
      .sort((x, y) => {
        if ((x.nav != null) !== (y.nav != null)) return x.nav != null ? -1 : 1
        return (y.return_3y ?? -99) - (x.return_3y ?? -99)
      })
    const idx    = chosenIdx[a.fund.code] ?? 0
    const chosen = mfs[idx] ?? null
    const nav    = chosen?.nav ?? null
    const units  = nav && allocated > 0 ? Math.ceil(allocated / nav) : null
    const actual = nav && units          ? units * nav                : null
    return { fund: a.fund, weight: a.weight, allocated, mfs, chosen, units, actualInvestment: actual }
  })

  const totalActual   = rows.reduce((s, r) => s + (r.actualInvestment ?? r.allocated), 0)
  const leftover      = investAmount > 0 ? investAmount - totalActual : null
  const minimumNeeded = rows.length > 0
    ? Math.max(...rows.map(r => (r.chosen?.nav != null && r.weight > 0) ? (r.chosen.nav * 100) / r.weight : 0))
    : 0

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 20, overflow: 'hidden', marginBottom: 20,
    }}>
      <style>{`
        @media (max-width: 600px) {
          .in-body { padding: 20px 16px 18px !important; }
          .in-fund-row { padding: 12px 14px !important; }
          .in-mf-pad { padding: 0 14px 12px !important; }
          .in-footer { flex-direction: column !important; align-items: flex-start !important; }
        }
      `}</style>

      {/* ── Header ── */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          padding: '20px 24px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          transition: 'background .14s',
        }}
        className="hover:bg-[rgba(12,14,19,.02)]"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg,#0C0E13 0%,#1A56DB 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M3 10h14M10 3l7 7-7 7" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="6" cy="6" r="1.5" fill="rgba(255,255,255,.6)"/>
              <circle cx="6" cy="14" r="1.5" fill="rgba(255,255,255,.6)"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.2px', color: 'var(--foreground)' }}>
              Invest Now
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted-foreground)', marginTop: 2 }}>
              Find mutual funds · Calculate investment amounts
            </div>
          </div>
        </div>
        <span style={{
          padding: '7px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
          background: expanded ? 'rgba(12,14,19,.07)' : '#0C0E13',
          color: expanded ? 'var(--muted-foreground)' : '#ffffff',
          flexShrink: 0, transition: 'all .15s',
        }}>
          {expanded ? 'Close' : 'Get Started →'}
        </span>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div className="in-body" style={{ borderTop: '1px solid var(--border)', padding: '24px 24px 20px' }}>

          {/* ── Amount input section ── */}
          <div style={{
            background: 'var(--muted)', borderRadius: 14,
            padding: '18px 20px', marginBottom: 22,
          }}>
            <div style={{
              fontSize: 10, fontWeight: 800, letterSpacing: '1.2px',
              textTransform: 'uppercase' as const, color: 'var(--muted-foreground)', marginBottom: 12,
            }}>
              Investment Amount
            </div>

            {/* Input row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' as const }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <span style={{
                  position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 17, fontWeight: 700, color: 'rgba(12,14,19,.3)',
                }}>₹</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={amount}
                  onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{
                    padding: '11px 13px 11px 30px',
                    border: '1.5px solid var(--border)', borderRadius: 10,
                    fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    color: 'var(--foreground)', background: 'var(--card)',
                    outline: 'none', width: 160, transition: 'border-color .15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#1A56DB')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
              {/* Quick-amount presets */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const }}>
                {QUICK_AMOUNTS.map(q => (
                  <button
                    key={q.value}
                    onClick={() => setAmount(String(q.value))}
                    style={{
                      fontSize: 12, fontWeight: 600, padding: '7px 13px', borderRadius: 8,
                      border: '1.5px solid',
                      borderColor: investAmount === q.value ? '#1A56DB' : 'var(--border)',
                      background: investAmount === q.value ? '#EBF0FF' : 'var(--card)',
                      color: investAmount === q.value ? '#1A56DB' : 'var(--muted-foreground)',
                      cursor: 'pointer', fontFamily: 'inherit', transition: 'all .12s',
                    }}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Min suggestion + validation */}
            {minimumNeeded > 0 && (
              <div style={{ fontSize: 12, color: 'var(--muted-foreground)', marginTop: 10, lineHeight: 1.5 }}>
                Minimum to buy 1 unit of each fund:{' '}
                <button
                  onClick={() => setAmount(String(Math.ceil(minimumNeeded)))}
                  style={{
                    fontWeight: 700, color: '#1A56DB', background: 'none',
                    border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)',
                    fontSize: 12, padding: 0, textDecoration: 'underline dotted',
                  }}
                >
                  ₹{fmt(Math.ceil(minimumNeeded))}
                </button>
              </div>
            )}
            {investAmount > 0 && investAmount < minimumNeeded && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 12, color: '#C5271E', marginTop: 8,
              }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <circle cx="6.5" cy="6.5" r="6" stroke="#C5271E" strokeWidth="1.2"/>
                  <path d="M6.5 4v3M6.5 9h.01" stroke="#C5271E" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                Amount below minimum — increase to at least ₹{fmt(Math.ceil(minimumNeeded))}
              </div>
            )}
          </div>

          {/* ── Fund → MF cards ── */}
          {fetchingMF ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '32px 0', justifyContent: 'center' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2.5px solid var(--border)', borderTopColor: '#0C0E13', animation: 'spin .75s linear infinite' }} />
              <span style={{ fontSize: 13.5, color: 'var(--muted-foreground)' }}>Finding mutual fund trackers…</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, marginBottom: 22 }}>
              {rows.map(row => {
                const isOpen  = expandedMF === row.fund.code
                const hasMFs  = row.mfs.length > 0
                const moreMFs = row.mfs.length - 1

                return (
                  <div key={row.fund.id} style={{
                    border: '1px solid var(--border)', borderRadius: 14,
                    overflow: 'hidden', background: 'var(--muted)',
                  }}>
                    {/* Index header row */}
                    <div className="in-fund-row" style={{
                      padding: '13px 16px',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.3 }}>
                          {toTitleCase(row.fund.name)}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 10,
                            color: 'var(--muted-foreground)', background: 'rgba(12,14,19,.06)',
                            padding: '1px 6px', borderRadius: 4,
                          }}>{row.fund.code}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: '#1A56DB', background: '#EBF0FF',
                            padding: '2px 8px', borderRadius: 5,
                          }}>
                            {row.weight.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                      {investAmount > 0 && (
                        <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 800, color: 'var(--foreground)' }}>
                            ₹{fmt(Math.round(row.allocated))}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)' }}>to invest</div>
                        </div>
                      )}
                    </div>

                    {/* MF tracker */}
                    <div className="in-mf-pad" style={{ padding: '0 16px 13px' }}>
                      {hasMFs ? (
                        <>
                          {/* Chosen MF card */}
                          <div style={{
                            background: 'var(--card)', border: '1px solid var(--border)',
                            borderRadius: 10, padding: '12px 14px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                              {/* Logo + fund name */}
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
                                {amcLogoUrl(row.chosen!.fund_house) && (
                                  <img
                                    src={amcLogoUrl(row.chosen!.fund_house)!}
                                    alt=""
                                    style={{
                                      width: 32, height: 32, objectFit: 'contain',
                                      borderRadius: 7, flexShrink: 0,
                                      background: '#fff', padding: 3,
                                      border: '1px solid var(--border)',
                                    }}
                                  />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', lineHeight: 1.35 }}>
                                    {row.chosen!.scheme_name}
                                  </div>
                                  {row.chosen!.fund_house && (
                                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
                                      {row.chosen!.fund_house}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {/* NAV */}
                              {row.chosen!.nav != null && (
                                <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                                    ₹{row.chosen!.nav.toFixed(2)}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1 }}>NAV</div>
                                </div>
                              )}
                            </div>

                            {/* Return badges */}
                            <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' as const }}>
                              {row.chosen!.return_1y != null && <ReturnBadge label="1Y" value={row.chosen!.return_1y} />}
                              {row.chosen!.return_3y != null && <ReturnBadge label="3Y" value={row.chosen!.return_3y} />}
                              {row.chosen!.return_5y != null && <ReturnBadge label="5Y" value={row.chosen!.return_5y} />}
                            </div>

                            {/* Investment calculation */}
                            {investAmount > 0 && row.units != null && row.actualInvestment != null && (
                              <div style={{
                                marginTop: 10, padding: '9px 12px', borderRadius: 8,
                                background: '#EBF0FF',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                flexWrap: 'wrap' as const,
                              }}>
                                <span style={{ fontSize: 12.5, color: '#1A56DB' }}>
                                  <strong>{fmt(row.units)}</strong> units × ₹{row.chosen!.nav?.toFixed(2)}
                                </span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: '#1A56DB' }}>
                                  ₹{fmt(Math.round(row.actualInvestment))}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* More options toggle */}
                          {moreMFs > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <button
                                onClick={() => setExpandedMF(isOpen ? null : row.fund.code)}
                                style={{
                                  fontSize: 11.5, color: '#1A56DB', background: 'none',
                                  border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                                  padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4,
                                }}
                              >
                                <span style={{ fontSize: 10 }}>{isOpen ? '▲' : '▼'}</span>
                                {isOpen ? 'Fewer options' : `${moreMFs} more fund${moreMFs !== 1 ? 's' : ''} available`}
                              </button>
                              {isOpen && (
                                <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                                  {row.mfs.slice(1).map((mf, i) => {
                                    const isSelected = (chosenIdx[row.fund.code] ?? 0) === i + 1
                                    return (
                                      <button
                                        key={mf.scheme_code}
                                        onClick={() => setChosenIdx(prev => ({ ...prev, [row.fund.code]: i + 1 }))}
                                        style={{
                                          padding: '10px 12px', borderRadius: 9, cursor: 'pointer',
                                          background: isSelected ? '#EBF0FF' : 'var(--card)',
                                          border: `1.5px solid ${isSelected ? '#1A56DB' : 'var(--border)'}`,
                                          textAlign: 'left' as const, fontFamily: 'inherit',
                                          display: 'flex', alignItems: 'center', gap: 10,
                                        }}
                                      >
                                        {amcLogoUrl(mf.fund_house) && (
                                          <img
                                            src={amcLogoUrl(mf.fund_house)!}
                                            alt=""
                                            style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 5, flexShrink: 0 }}
                                          />
                                        )}
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', lineHeight: 1.3 }}>
                                            {mf.scheme_name}
                                          </div>
                                          {mf.fund_house && (
                                            <div style={{ fontSize: 10.5, color: 'var(--muted-foreground)', marginTop: 1 }}>
                                              {mf.fund_house}
                                            </div>
                                          )}
                                        </div>
                                        <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                                          {mf.return_3y != null && <ReturnBadge label="3Y" value={mf.return_3y} />}
                                          {mf.nav != null && (
                                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>
                                              ₹{mf.nav.toFixed(2)}
                                            </div>
                                          )}
                                        </div>
                                      </button>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{
                          background: 'rgba(197,39,30,.04)', border: '1px dashed rgba(197,39,30,.2)',
                          borderRadius: 10, padding: '11px 14px',
                          fontSize: 12.5, color: '#C5271E',
                        }}>
                          No mutual fund found for this index yet.
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Investment Summary ── */}
          {investAmount > 0 && !fetchingMF && (
            <div style={{
              background: 'var(--muted)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 18px', marginBottom: 20,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '1.1px',
                textTransform: 'uppercase' as const, color: 'var(--muted-foreground)', marginBottom: 12,
              }}>
                Summary
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 8 }}>
                <SummaryRow label="You enter" value={`₹${fmt(Math.round(investAmount))}`} />
                <SummaryRow label="Actual investment" value={`₹${fmt(Math.round(totalActual))}`} bold />
                <div style={{ height: 1, background: 'var(--border)' }} />
                {leftover != null && (
                  <SummaryRow
                    label={leftover >= 0 ? 'Cash leftover' : 'Additional needed'}
                    value={`₹${fmt(Math.abs(Math.round(leftover)))}`}
                    color={leftover >= 0 ? '#0A7C4E' : '#C5271E'}
                    bold
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="in-footer" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
            <Link
              href="/funds"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '9px 17px', borderRadius: 9,
                background: '#0C0E13', color: '#ffffff',
                fontSize: 13, fontWeight: 600, textDecoration: 'none',
                flexShrink: 0,
              }}
              className="hover:opacity-85"
            >
              Browse Index Funds
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2 10L10 2M6 2h4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <p style={{ fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.55, margin: 0 }}>
              NAV data is indicative. Actual units may vary. Not financial advice.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────
function ReturnBadge({ label, value }: { label: string; value: number }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5,
      background: value > 0 ? 'rgba(10,124,78,.08)' : 'rgba(197,39,30,.07)',
      color: value > 0 ? '#0A7C4E' : '#C5271E',
    }}>
      {label}: {pct(value)}
    </span>
  )
}

function SummaryRow({
  label, value, bold, color,
}: {
  label: string; value: string; bold?: boolean; color?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>{label}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 13.5,
        fontWeight: bold ? 700 : 500,
        color: color ?? 'var(--foreground)',
      }}>
        {value}
      </span>
    </div>
  )
}
