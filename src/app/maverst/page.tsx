"use client"

import { useEffect, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, CartesianGrid, Legend,
} from 'recharts'

// ── Types ─────────────────────────────────────────────────────────────────────

type RegimeType     = 'Growth' | 'Neutral' | 'Defensive'
type ConfidenceType = 'High' | 'Medium' | 'Low'

interface Indicator {
  key:         string
  label:       string
  description: string
  zscore:      number | null
  raw:         number | null
  sentiment:   string
  direction:   number
}

interface LatestData {
  date:        string
  score:       number
  regime:      RegimeType
  confidence:  ConfidenceType
  allocation:  { midcapMomentum: number; gold: number }
  indicators:  Indicator[]
  keyDrivers:  Indicator[]
  insightLine: string
}

interface HistoryRow {
  date:           string
  score:          number
  regime:         RegimeType
  alloc_momentum: number
  alloc_gold:     number
}

interface BacktestResult {
  equityCurve:          { date: string; strategy: number; benchmark: number; regime: RegimeType }[]
  strategyCagr:         number
  benchmarkCagr:        number
  strategyMaxDrawdown:  number
  benchmarkMaxDrawdown: number
  drawdownReduction:    number
  startDate:            string
  endDate:              string
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const REGIME_COLOR: Record<RegimeType, string> = {
  Growth:    '#16a34a',
  Neutral:   '#d97706',
  Defensive: '#dc2626',
}

const REGIME_BG: Record<RegimeType, string> = {
  Growth:    'rgba(22,163,74,.1)',
  Neutral:   'rgba(217,119,6,.1)',
  Defensive: 'rgba(220,38,38,.1)',
}

const REGIME_ICON: Record<RegimeType, string> = {
  Growth:    '↑',
  Neutral:   '→',
  Defensive: '↓',
}

function fmtPct(v: number, decimals = 1) {
  return `${(v * 100).toFixed(decimals)}%`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  // Map -3…+3 to 0…100%
  const pct = Math.round(((score + 3) / 6) * 100)
  const color = score > 0.33 ? REGIME_COLOR.Growth : score < -0.33 ? REGIME_COLOR.Defensive : REGIME_COLOR.Neutral
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted-foreground)', marginBottom: 4 }}>
        <span>Defensive</span><span>Neutral</span><span>Growth</span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: 'var(--border)', position: 'relative', overflow: 'hidden' }}>
        {/* Zone fills */}
        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '44%', background: 'rgba(220,38,38,.15)', borderRadius: '99px 0 0 99px' }} />
        <div style={{ position: 'absolute', left: '44%', top: 0, height: '100%', width: '12%', background: 'rgba(217,119,6,.15)' }} />
        <div style={{ position: 'absolute', left: '56%', top: 0, height: '100%', width: '44%', background: 'rgba(22,163,74,.15)', borderRadius: '0 99px 99px 0' }} />
        {/* Marker */}
        <div style={{
          position: 'absolute', top: -2, width: 12, height: 12, borderRadius: '50%',
          background: color, border: '2px solid white',
          boxShadow: `0 0 0 2px ${color}40`,
          left: `calc(${pct}% - 6px)`,
          transition: 'left .4s ease',
        }} />
      </div>
      <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color, marginTop: 6 }}>
        Score: {score.toFixed(2)}
      </div>
    </div>
  )
}

// ── Z-score pill ──────────────────────────────────────────────────────────────

function ZPill({ z }: { z: number | null }) {
  if (z === null) return <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>—</span>
  const color = z > 0.3 ? '#16a34a' : z < -0.3 ? '#dc2626' : '#d97706'
  return (
    <span style={{
      display: 'inline-block', padding: '1px 7px', borderRadius: 99,
      background: color + '18', color, fontSize: 11.5, fontWeight: 700,
    }}>
      {z > 0 ? '+' : ''}{z.toFixed(2)}
    </span>
  )
}

// ── Indicator mini bar ────────────────────────────────────────────────────────

function ZBar({ z }: { z: number | null }) {
  if (z === null) return <div style={{ height: 4, borderRadius: 99, background: 'var(--border)' }} />
  const pct  = Math.min(100, Math.abs(z) / 3 * 100)
  const color = z > 0.3 ? '#16a34a' : z < -0.3 ? '#dc2626' : '#d97706'
  return (
    <div style={{ height: 4, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .4s ease' }} />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MAVERSTPage() {
  const [latest,   setLatest]   = useState<LatestData | null>(null)
  const [history,  setHistory]  = useState<HistoryRow[]>([])
  const [backtest, setBacktest] = useState<BacktestResult | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [layer2,   setLayer2]   = useState(false)
  const [btLoaded, setBtLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/regime/latest').then(r => r.json()),
      fetch('/api/regime/history').then(r => r.json()),
    ]).then(([lat, hist]) => {
      setLatest(lat.error ? null : lat)
      setHistory(Array.isArray(hist) ? hist : [])
      setLoading(false)
    })
  }, [])

  function loadBacktest() {
    if (btLoaded) return
    setBtLoaded(true)
    fetch('/api/maverst/backtest')
      .then(r => r.json())
      .then(d => setBacktest(d.error ? null : d))
  }

  if (loading) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 14 }}>
          Computing regime signals…
        </div>
      </div>
    )
  }

  if (!latest) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', padding: 32 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚙️</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--foreground)', marginBottom: 8 }}>Regime Engine Initialising</div>
          <div style={{ fontSize: 13, color: 'var(--muted-foreground)', maxWidth: 360 }}>
            Run the EOD cron to compute today&apos;s regime signal, or ensure the Supabase schema is set up.
          </div>
        </div>
      </div>
    )
  }

  const { regime, confidence, score, allocation, insightLine, keyDrivers, indicators } = latest
  const regimeColor = REGIME_COLOR[regime]

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '72px 20px 120px' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.12em', color: 'var(--muted-foreground)', textTransform: 'uppercase', marginBottom: 6 }}>
          MAVERST · Market Regime Engine
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.5px', color: 'var(--foreground)', margin: 0 }}>
          Daily Market Signal
        </h1>
        <div style={{ fontSize: 12.5, color: 'var(--muted-foreground)', marginTop: 4 }}>
          Updated {fmtDate(latest.date)} · 9 indicators · equal weighted
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          LAYER 1
      ══════════════════════════════════════════════════════════ */}

      {/* ── Hero Card ── */}
      <div style={{
        background: 'var(--card)', border: `1.5px solid ${regimeColor}40`,
        borderRadius: 16, padding: '28px 28px 24px',
        boxShadow: `0 4px 24px ${regimeColor}12`,
        marginBottom: 20,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          {/* Regime badge */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minWidth: 120, padding: '16px 20px', borderRadius: 12,
            background: REGIME_BG[regime], border: `1.5px solid ${regimeColor}30`,
          }}>
            <div style={{ fontSize: 36, lineHeight: 1, color: regimeColor, fontWeight: 900 }}>
              {REGIME_ICON[regime]}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: regimeColor, marginTop: 6, letterSpacing: '-.3px' }}>
              {regime}
            </div>
            <div style={{
              fontSize: 10.5, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
              color: regimeColor + 'cc', marginTop: 4,
            }}>
              {confidence} Confidence
            </div>
          </div>

          {/* Details */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 14, color: 'var(--muted-foreground)', lineHeight: 1.5, marginBottom: 14 }}>
              {insightLine}
            </div>
            <ScoreBar score={score} />
          </div>

          {/* Allocation */}
          <div style={{
            minWidth: 140, padding: '14px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.07)',
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted-foreground)', marginBottom: 10 }}>
              Allocation
            </div>
            <AllocationBar momentum={allocation.midcapMomentum} gold={allocation.gold} />
          </div>
        </div>
      </div>

      {/* ── Key Drivers ── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 }}>
          Key Drivers
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {keyDrivers.map(driver => (
            <div key={driver.key} style={{
              background: 'var(--card)', border: '1px solid rgba(12,14,19,.08)',
              borderRadius: 12, padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)' }}>{driver.label}</span>
                <ZPill z={driver.zscore} />
              </div>
              <ZBar z={driver.zscore} />
              <div style={{ fontSize: 11.5, color: 'var(--muted-foreground)', marginTop: 6 }}>
                {driver.description}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Regime Timeline ── */}
      {history.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 10 }}>
            Regime History
          </div>
          <RegimeTimeline history={history} />
        </div>
      )}

      {/* ── Backtest Snapshot (Layer 1) ── */}
      <BacktestSnapshot />

      {/* ══════════════════════════════════════════════════════════
          LAYER 2 — Technical Deep Dive
      ══════════════════════════════════════════════════════════ */}

      <div style={{ marginTop: 32, borderTop: '1px solid rgba(12,14,19,.08)', paddingTop: 24 }}>
        <button
          onClick={() => { setLayer2(v => !v); if (!layer2) loadBacktest() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'none', border: '1px solid rgba(12,14,19,.12)',
            borderRadius: 10, padding: '10px 18px', cursor: 'pointer',
            fontSize: 13.5, fontWeight: 600, color: 'var(--foreground)',
            transition: 'all .15s',
          }}
        >
          <span>{layer2 ? '▲' : '▼'}</span>
          {layer2 ? 'Hide' : 'Show'} Technical Deep Dive
        </button>

        {layer2 && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Indicator contribution table */}
            <IndicatorTable indicators={indicators} score={score} />

            {/* Allocation logic */}
            <AllocationLogic score={score} regime={regime} allocation={allocation} />

            {/* Full backtest */}
            {backtest && <FullBacktest backtest={backtest} />}
            {!backtest && btLoaded && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted-foreground)', fontSize: 13 }}>
                Backtest data not available — run the MAVERST EOD cron with ?backfill=true first.
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

// ── Allocation bar ────────────────────────────────────────────────────────────

function AllocationBar({ momentum, gold }: { momentum: number; gold: number }) {
  return (
    <div>
      <div style={{ height: 8, borderRadius: 99, overflow: 'hidden', display: 'flex', marginBottom: 8 }}>
        <div style={{ width: `${momentum}%`, background: '#6B9FFF', transition: 'width .4s ease' }} />
        <div style={{ flex: 1, background: '#f59e0b' }} />
      </div>
      <div style={{ fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: '#6B9FFF', flexShrink: 0 }} />
          <span style={{ color: 'var(--muted-foreground)' }}>Midcap Momentum</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--foreground)' }}>{momentum}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: '#f59e0b', flexShrink: 0 }} />
          <span style={{ color: 'var(--muted-foreground)' }}>Gold ETF</span>
          <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--foreground)' }}>{gold}%</span>
        </div>
      </div>
    </div>
  )
}

// ── Regime Timeline ───────────────────────────────────────────────────────────

function RegimeTimeline({ history }: { history: HistoryRow[] }) {
  // Show last 252 trading days max
  const slice = history.slice(-252)
  if (slice.length === 0) return null

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid rgba(12,14,19,.08)',
      borderRadius: 12, padding: '16px 16px 12px',
    }}>
      {/* Color bar */}
      <div style={{ display: 'flex', height: 20, borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
        {slice.map((r, i) => (
          <div key={i} style={{
            flex: 1, background: REGIME_COLOR[r.regime],
            opacity: 0.75,
          }} title={`${r.date}: ${r.regime}`} />
        ))}
      </div>
      {/* X-axis labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--muted-foreground)' }}>
        <span>{slice[0]?.date?.slice(0, 7)}</span>
        <span>{slice[Math.floor(slice.length / 2)]?.date?.slice(0, 7)}</span>
        <span>{slice.at(-1)?.date?.slice(0, 7)}</span>
      </div>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
        {(['Growth', 'Neutral', 'Defensive'] as RegimeType[]).map(r => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: REGIME_COLOR[r] }} />
            <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Backtest Snapshot (Layer 1 summary) ──────────────────────────────────────

function BacktestSnapshot() {
  const [data, setData] = useState<BacktestResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/maverst/backtest')
      .then(r => r.json())
      .then(d => { setData(d.error ? null : d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div style={{ background: 'var(--card)', border: '1px solid rgba(12,14,19,.08)', borderRadius: 12, padding: '24px', marginBottom: 20, minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontSize: 13, color: 'var(--muted-foreground)' }}>Loading backtest…</span>
    </div>
  )

  if (!data) return null

  // Sample every 5th point for a lighter chart
  const curve = data.equityCurve.filter((_, i) => i % 5 === 0 || i === data.equityCurve.length - 1)
  const ddRed  = data.drawdownReduction

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid rgba(12,14,19,.08)',
      borderRadius: 12, padding: '20px 20px 16px', marginBottom: 20,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
        Strategy vs Nifty 50 <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted-foreground)' }}>since {data.startDate?.slice(0, 7)}</span>
      </div>

      {/* Key stat pills */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { label: 'Strategy CAGR',  value: fmtPct(data.strategyCagr),  color: '#6B9FFF' },
          { label: 'Benchmark CAGR', value: fmtPct(data.benchmarkCagr), color: 'var(--muted-foreground)' },
          { label: 'Worst Loss Cut', value: `${ddRed.toFixed(0)}%`, color: '#16a34a' },
        ].map(s => (
          <div key={s.label} style={{
            padding: '6px 12px', borderRadius: 8,
            background: 'rgba(12,14,19,.04)', border: '1px solid rgba(255,255,255,.07)',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(12,14,19,.45)' }}>{s.label} </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={curve} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(0, 7)}
            interval={Math.floor(curve.length / 5)} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}`} />
          <Tooltip
            formatter={(v: number, name: string) => [`${v.toFixed(1)}`, name]}
            labelFormatter={d => fmtDate(d)}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="strategy"  name="MAVERST Strategy" stroke="#1A56DB" dot={false} strokeWidth={2} />
          <Line dataKey="benchmark" name="Nifty 50"          stroke="rgba(148,163,184,.5)" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ── Indicator Table (Layer 2) ─────────────────────────────────────────────────

function IndicatorTable({ indicators, score }: { indicators: Indicator[]; score: number }) {
  const available = indicators.filter(i => i.zscore !== null)
  const weight    = available.length > 0 ? (100 / available.length).toFixed(0) : '0'

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12 }}>
        Indicator Contribution
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted-foreground)', marginLeft: 8 }}>
          MAVERST score: {score.toFixed(2)} · {available.length} of 9 indicators active
        </span>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid rgba(12,14,19,.08)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,.03)', borderBottom: '1px solid rgba(12,14,19,.08)' }}>
              {['Indicator', 'Weight', 'Z-Score', 'Contribution', 'Signal'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--muted-foreground)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indicators.map((ind, i) => {
              const contrib = ind.zscore !== null ? ind.zscore / (available.length || 1) : null
              return (
                <tr key={ind.key} style={{ borderBottom: i < indicators.length - 1 ? '1px solid rgba(255,255,255,.06)' : 'none' }}>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>{ind.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted-foreground)', marginTop: 2 }}>{ind.description}</div>
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--muted-foreground)' }}>{ind.zscore !== null ? `${weight}%` : '—'}</td>
                  <td style={{ padding: '10px 14px' }}><ZPill z={ind.zscore} /></td>
                  <td style={{ padding: '10px 14px' }}>
                    {contrib !== null
                      ? <span style={{ fontWeight: 700, color: contrib > 0 ? '#16a34a' : contrib < 0 ? '#dc2626' : '#d97706' }}>
                          {contrib > 0 ? '+' : ''}{contrib.toFixed(3)}
                        </span>
                      : <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <SentimentBadge sentiment={ind.sentiment} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SentimentBadge({ sentiment }: { sentiment: string }) {
  const cfg: Record<string, { bg: string; color: string }> = {
    'strongly bullish': { bg: '#16a34a18', color: '#15803d' },
    'bullish':          { bg: '#16a34a10', color: '#16a34a' },
    'neutral':          { bg: '#d9780610', color: '#b45309' },
    'bearish':          { bg: '#dc262610', color: '#dc2626' },
    'strongly bearish': { bg: '#dc262618', color: '#b91c1c' },
    'unavailable':      { bg: 'rgba(255,255,255,.06)', color: 'var(--muted-foreground)' },
  }
  const c = cfg[sentiment] ?? cfg['unavailable']
  return (
    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>
      {sentiment}
    </span>
  )
}

// ── Allocation Logic (Layer 2) ────────────────────────────────────────────────

function AllocationLogic({ score, regime, allocation }: {
  score: number; regime: RegimeType; allocation: { midcapMomentum: number; gold: number }
}) {
  const rules = [
    { regime: 'Growth',    threshold: '> 0.33',  momentum: 75, gold: 25, active: regime === 'Growth' },
    { regime: 'Neutral',   threshold: '±0.33',   momentum: 50, gold: 50, active: regime === 'Neutral' },
    { regime: 'Defensive', threshold: '< −0.33', momentum: 25, gold: 75, active: regime === 'Defensive' },
  ]

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12 }}>
        Allocation Logic
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted-foreground)', marginLeft: 8 }}>
          Score {score.toFixed(2)} → {regime} → {allocation.midcapMomentum}% Momentum / {allocation.gold}% Gold
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
        {rules.map(r => (
          <div key={r.regime} style={{
            padding: '14px 16px', borderRadius: 12,
            background: r.active ? REGIME_BG[r.regime as RegimeType] : 'rgba(12,14,19,.02)',
            border: `1.5px solid ${r.active ? REGIME_COLOR[r.regime as RegimeType] + '40' : 'var(--border)'}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: REGIME_COLOR[r.regime as RegimeType], fontSize: 13 }}>{r.regime}</span>
              <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>Score {r.threshold}</span>
            </div>
            <div style={{ fontSize: 12.5 }}>
              <div style={{ color: '#6B9FFF', fontWeight: 600 }}>{r.momentum}% Midcap Momentum</div>
              <div style={{ color: '#d97706', fontWeight: 600 }}>{r.gold}% Gold</div>
            </div>
            {r.active && (
              <div style={{ marginTop: 8, fontSize: 10.5, fontWeight: 700, color: REGIME_COLOR[r.regime as RegimeType],
                background: REGIME_COLOR[r.regime as RegimeType] + '18', padding: '2px 6px', borderRadius: 4, display: 'inline-block' }}>
                CURRENT
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Full Backtest (Layer 2) ───────────────────────────────────────────────────

function FullBacktest({ backtest }: { backtest: BacktestResult }) {
  const curve = backtest.equityCurve.filter((_, i) => i % 3 === 0 || i === backtest.equityCurve.length - 1)

  const metrics = [
    { label: 'Strategy CAGR',        value: fmtPct(backtest.strategyCagr),         highlight: true },
    { label: 'Nifty 50 CAGR',        value: fmtPct(backtest.benchmarkCagr),        highlight: false },
    { label: 'Strategy Max Drawdown',value: fmtPct(backtest.strategyMaxDrawdown),   highlight: true },
    { label: 'Nifty 50 Max Drawdown',value: fmtPct(backtest.benchmarkMaxDrawdown),  highlight: false },
    { label: 'Drawdown Reduction',   value: `${backtest.drawdownReduction.toFixed(1)}%`, highlight: true },
    { label: 'Strategy Sharpe',      value: (backtest as unknown as Record<string, number>)['strategySharpe']?.toFixed(2) ?? '—', highlight: true },
  ]

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--foreground)', marginBottom: 12 }}>
        Full Backtest <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--muted-foreground)' }}>
          {backtest.startDate?.slice(0, 7)} – {backtest.endDate?.slice(0, 7)}
        </span>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8, marginBottom: 20 }}>
        {metrics.map(m => (
          <div key={m.label} style={{
            padding: '12px 14px', borderRadius: 10,
            background: m.highlight ? 'rgba(26,86,219,.05)' : 'rgba(255,255,255,.03)',
            border: `1px solid ${m.highlight ? 'rgba(26,86,219,.12)' : 'var(--border)'}`,
          }}>
            <div style={{ fontSize: 11, color: 'rgba(12,14,19,.45)', marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: m.highlight ? '#6B9FFF' : 'var(--foreground)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Equity curve */}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={curve} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.06)" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(0, 7)}
            interval={Math.floor(curve.length / 8)} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v.toFixed(0)}`} />
          <Tooltip
            formatter={(v: number, name: string) => [`${v.toFixed(1)}`, name]}
            labelFormatter={d => fmtDate(d)}
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,.08)' }}
          />
          <ReferenceLine y={100} stroke="rgba(12,14,19,.15)" strokeDasharray="4 2" />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line dataKey="strategy"  name="MAVERST Strategy" stroke="#1A56DB" dot={false} strokeWidth={2.5} />
          <Line dataKey="benchmark" name="Nifty 50"          stroke="rgba(148,163,184,.5)" dot={false} strokeWidth={1.5} strokeDasharray="4 3" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
