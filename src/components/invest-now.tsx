"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

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
  // which MF is chosen per fund code (user can switch)
  const [chosenIdx, setChosenIdx]   = useState<Record<string, number>>({})
  // which fund's "more options" is open
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
            data: Array.isArray(d) ? (d as MFFund[]).filter(f => f.nav != null && f.nav > 0) : [],
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
    const mfs       = (mfMap[a.fund.code] ?? [])
      .slice()
      .sort((x, y) => (y.return_3y ?? -99) - (x.return_3y ?? -99))
    const idx    = chosenIdx[a.fund.code] ?? 0
    const chosen = mfs[idx] ?? null
    const nav    = chosen?.nav ?? null
    const units  = nav && allocated > 0 ? Math.ceil(allocated / nav) : null
    const actual = nav && units          ? units * nav                : null
    return { fund: a.fund, weight: a.weight, allocated, mfs, chosen, units, actualInvestment: actual }
  })

  const totalActual    = rows.reduce((s, r) => s + (r.actualInvestment ?? r.allocated), 0)
  const leftover       = investAmount > 0 ? investAmount - totalActual : null
  const minPerFund     = rows.map(r => r.chosen?.nav ?? 100)
  const minimumNeeded  = minPerFund.reduce((s, v) => s + v, 0)

  return (
    <div style={{
      background: '#ffffff', border: '1px solid rgba(12,14,19,.12)',
      borderRadius: 20, overflow: 'hidden', marginBottom: 20,
    }}>

      {/* ── Header ── */}
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          padding: '22px 28px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'background .14s',
        }}
        className="hover:bg-[rgba(12,14,19,.02)]"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 11, flexShrink: 0,
            background: 'linear-gradient(135deg,#0C0E13 0%,#1A56DB 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M10 2.5a7.5 7.5 0 100 15 7.5 7.5 0 000-15z" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M10 6v4l2.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M7 14l-2 2M13 14l2 2" stroke="rgba(255,255,255,.5)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.2px' }}>Invest Now</div>
            <div style={{ fontSize: 12.5, color: 'rgba(12,14,19,.45)', marginTop: 2 }}>
              Map each index to a mutual fund · Calculate minimum investment
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            padding: '6px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: expanded ? 'rgba(12,14,19,.06)' : '#0C0E13',
            color: expanded ? 'rgba(12,14,19,.5)' : '#ffffff',
            transition: 'all .15s',
          }}>
            {expanded ? 'Close' : 'Get Started →'}
          </span>
        </div>
      </div>

      {/* ── Expanded body ── */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(12,14,19,.08)', padding: '28px 28px 24px' }}>

          {/* Amount input */}
          <div style={{ marginBottom: 28 }}>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '1px',
              textTransform: 'uppercase' as const, color: 'rgba(12,14,19,.35)', marginBottom: 8,
            }}>
              Total Investment Amount
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  fontSize: 16, fontWeight: 700, color: 'rgba(12,14,19,.35)',
                }}>₹</span>
                <input
                  type="text"
                  placeholder="50,000"
                  value={amount}
                  onChange={e => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  style={{
                    padding: '12px 14px 12px 30px',
                    border: '1.5px solid rgba(12,14,19,.12)', borderRadius: 10,
                    fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    color: '#0C0E13', background: '#F5F5F3', outline: 'none', width: 180,
                    transition: 'border-color .15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = '#1A56DB')}
                  onBlur={e => (e.target.style.borderColor = 'rgba(12,14,19,.12)')}
                />
              </div>
              {minimumNeeded > 0 && (
                <div style={{ fontSize: 12.5, color: 'rgba(12,14,19,.45)', lineHeight: 1.5 }}>
                  Minimum suggested:{' '}
                  <strong style={{ color: '#0C0E13' }}>₹{fmt(Math.ceil(minimumNeeded))}</strong>
                  {' '}(1 unit per fund)
                </div>
              )}
            </div>
            {investAmount > 0 && investAmount < minimumNeeded && (
              <p style={{ fontSize: 12, color: '#C5271E', marginTop: 6 }}>
                ⚠ Amount is below minimum. Increase to at least ₹{fmt(Math.ceil(minimumNeeded))}.
              </p>
            )}
          </div>

          {/* Fund → MF cards */}
          {fetchingMF ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '32px 0', justifyContent: 'center' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', border: '2.5px solid rgba(12,14,19,.1)', borderTopColor: '#0C0E13', animation: 'spin .75s linear infinite' }} />
              <span style={{ fontSize: 13.5, color: 'rgba(12,14,19,.4)' }}>Finding mutual fund trackers…</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14, marginBottom: 24 }}>
              {rows.map(row => {
                const isOpen    = expandedMF === row.fund.code
                const hasMFs    = row.mfs.length > 0
                const moreMFs   = row.mfs.length - 1

                return (
                  <div key={row.fund.id} style={{
                    border: '1px solid rgba(12,14,19,.09)', borderRadius: 14,
                    overflow: 'hidden', background: '#F5F5F3',
                  }}>
                    {/* Index row */}
                    <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0C0E13', lineHeight: 1.3 }}>
                          {toTitleCase(row.fund.name)}
                        </div>
                        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' as const }}>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 10,
                            color: 'rgba(12,14,19,.3)', background: 'rgba(12,14,19,.06)',
                            padding: '1px 6px', borderRadius: 4,
                          }}>{row.fund.code}</span>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            color: '#1A56DB', background: '#EBF0FF',
                            padding: '1px 7px', borderRadius: 4,
                          }}>
                            {row.weight.toFixed(1)}% weight
                          </span>
                        </div>
                      </div>
                      {investAmount > 0 && (
                        <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 700, color: '#0C0E13' }}>
                            ₹{fmt(Math.round(row.allocated))}
                          </div>
                          <div style={{ fontSize: 10.5, color: 'rgba(12,14,19,.35)' }}>allocated</div>
                        </div>
                      )}
                    </div>

                    {/* MF tracker */}
                    <div style={{ padding: '0 16px 14px' }}>
                      {hasMFs ? (
                        <>
                          {/* Chosen MF card */}
                          <div style={{
                            background: '#ffffff', border: '1px solid rgba(12,14,19,.10)',
                            borderRadius: 10, padding: '12px 14px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0C0E13', lineHeight: 1.35 }}>
                                  {row.chosen!.scheme_name}
                                </div>
                                {row.chosen!.fund_house && (
                                  <div style={{ fontSize: 11, color: 'rgba(12,14,19,.38)', marginTop: 2 }}>
                                    {row.chosen!.fund_house}
                                  </div>
                                )}
                              </div>
                              {row.chosen!.nav != null && (
                                <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 }}>
                                    ₹{row.chosen!.nav.toFixed(2)}
                                  </div>
                                  <div style={{ fontSize: 10, color: 'rgba(12,14,19,.3)' }}>NAV</div>
                                </div>
                              )}
                            </div>

                            {/* Returns */}
                            <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' as const }}>
                              {row.chosen!.return_1y != null && (
                                <ReturnBadge label="1Y" value={row.chosen!.return_1y} />
                              )}
                              {row.chosen!.return_3y != null && (
                                <ReturnBadge label="3Y" value={row.chosen!.return_3y} />
                              )}
                              {row.chosen!.return_5y != null && (
                                <ReturnBadge label="5Y" value={row.chosen!.return_5y} />
                              )}
                            </div>

                            {/* Investment calculation */}
                            {investAmount > 0 && row.units != null && row.actualInvestment != null && (
                              <div style={{
                                marginTop: 10, padding: '9px 12px', borderRadius: 8,
                                background: '#EBF0FF',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              }}>
                                <span style={{ fontSize: 12.5, color: '#1A56DB' }}>
                                  <strong>{fmt(row.units)}</strong> units @ ₹{row.chosen!.nav?.toFixed(2)}
                                </span>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13.5, fontWeight: 700, color: '#1A56DB' }}>
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
                                  border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0,
                                }}
                              >
                                {isOpen ? '▲ Fewer options' : `▼ +${moreMFs} more fund${moreMFs !== 1 ? 's' : ''} available`}
                              </button>
                              {isOpen && (
                                <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column' as const, gap: 6 }}>
                                  {row.mfs.slice(1).map((mf, i) => (
                                    <button
                                      key={mf.scheme_code}
                                      onClick={() => setChosenIdx(prev => ({ ...prev, [row.fund.code]: i + 1 }))}
                                      style={{
                                        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                                        background: (chosenIdx[row.fund.code] ?? 0) === i + 1 ? '#EBF0FF' : '#ffffff',
                                        border: `1px solid ${(chosenIdx[row.fund.code] ?? 0) === i + 1 ? '#1A56DB' : 'rgba(12,14,19,.10)'}`,
                                        textAlign: 'left' as const, fontFamily: 'inherit',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                      }}
                                    >
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: '#0C0E13', lineHeight: 1.3 }}>{mf.scheme_name}</div>
                                        <div style={{ fontSize: 10.5, color: 'rgba(12,14,19,.38)', marginTop: 1 }}>{mf.fund_house}</div>
                                      </div>
                                      <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                                        {mf.return_3y != null && (
                                          <ReturnBadge label="3Y" value={mf.return_3y} />
                                        )}
                                        {mf.nav != null && (
                                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'rgba(12,14,19,.4)', marginTop: 2 }}>
                                            ₹{mf.nav.toFixed(2)}
                                          </div>
                                        )}
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{
                          background: '#FEF2F2', border: '1px dashed rgba(197,39,30,.2)',
                          borderRadius: 10, padding: '11px 14px',
                          fontSize: 12.5, color: '#C5271E',
                        }}>
                          No mutual fund found for this index. It may not have a tracking fund in India yet.
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
              background: '#F5F5F3', border: '1px solid rgba(12,14,19,.09)',
              borderRadius: 14, padding: '18px 20px', marginBottom: 22,
            }}>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '1px',
                textTransform: 'uppercase' as const, color: 'rgba(12,14,19,.3)', marginBottom: 13,
              }}>
                Investment Summary
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 9 }}>
                <SummaryRow label="Requested amount" value={`₹${fmt(Math.round(investAmount))}`} />
                <SummaryRow label="Actual investment (after rounding)" value={`₹${fmt(Math.round(totalActual))}`} bold />
                <div style={{ height: 1, background: 'rgba(12,14,19,.08)' }} />
                {leftover != null && (
                  <SummaryRow
                    label={leftover >= 0 ? 'Leftover cash' : 'Additional needed'}
                    value={`₹${fmt(Math.abs(Math.round(leftover)))}`}
                    color={leftover >= 0 ? '#0A7C4E' : '#C5271E'}
                    bold
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Footer CTAs ── */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' as const }}>
            <Link
              href="/funds"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '10px 18px', borderRadius: 10,
                background: '#0C0E13', color: '#ffffff',
                fontSize: 13.5, fontWeight: 600, textDecoration: 'none',
              }}
              className="hover:opacity-85"
            >
              Browse All Mutual Funds
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 10L10 2M6 2h4v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <p style={{ fontSize: 11, color: 'rgba(12,14,19,.28)', lineHeight: 1.55, maxWidth: 420 }}>
              NAV data is indicative. Actual units allotted may vary based on applicable date, cut-off times, and AMC terms.
              Past performance is not indicative of future returns. Not financial advice.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Small sub-components ────────────────────────────────────────────────────
function ReturnBadge({ label, value }: { label: string; value: number }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5,
      background: 'rgba(12,14,19,.06)',
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
      <span style={{ fontSize: 13.5, color: 'rgba(12,14,19,.55)' }}>{label}</span>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 13.5,
        fontWeight: bold ? 700 : 500,
        color: color ?? '#0C0E13',
      }}>
        {value}
      </span>
    </div>
  )
}
