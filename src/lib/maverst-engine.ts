/**
 * maverst-engine.ts
 *
 * MAVERST (Market Regime Engine) — core computation library.
 *
 * Indicators (9 total, equal-weighted):
 *   1. Trend         — Nifty 50 vs 200-day SMA
 *   2. Momentum      — Nifty 50 12-month return
 *   3. Midcap Ratio  — Nifty Midcap 150 / Nifty 50 relative strength (1M)
 *   4. EW Ratio      — Nifty 100 Equal Weight / Nifty 100 breadth (1M)
 *   5. VIX           — India VIX level (inverted)
 *   6. Gold Ratio    — Gold / Nifty 50 relative strength (1M, inverted)
 *   7. USD/INR       — Rupee vs USD 1-month change (inverted)
 *   8. FII Flows     — 20-day cumulative net FII equity flows
 *   9. Sector Ratio  — High Beta / Low Vol relative strength (1M)
 *
 * Regime:   score > 0.33 → Growth | < -0.33 → Defensive | else Neutral
 * Alloc:    Growth 75/25 | Neutral 50/50 | Defensive 25/75
 *           (Nifty Midcap150 Momentum 50 / Gold ETF)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Types ─────────────────────────────────────────────────────────────────────

export type RegimeType     = 'Growth' | 'Neutral' | 'Defensive'
export type ConfidenceType = 'High' | 'Medium' | 'Low'

export interface NavPoint { date: string; value: number }

export interface ExternalDataRow {
  date:          string
  india_vix:     number | null
  usdinr:        number | null
  fii_net_crore: number | null
}

export interface IndicatorSnapshot {
  key:            string
  label:          string
  description:    string
  rawValue:       number | null
  zscore:         number | null   // direction-adjusted (positive = bullish)
  weight:         number          // 1 / n_available
  interpretation: string
}

export interface RegimeResult {
  date:          string
  score:         number
  regime:        RegimeType
  confidence:    ConfidenceType
  allocation:    { midcapMomentum: number; gold: number }
  indicators:    IndicatorSnapshot[]
  keyDrivers:    IndicatorSnapshot[]   // top 3 by |zscore|
  insightLine:   string
}

export interface BacktestPoint {
  date:      string
  strategy:  number   // rebased to 100
  benchmark: number
  regime:    RegimeType
}

export interface BacktestResult {
  equityCurve:            BacktestPoint[]
  strategyCagr:           number
  benchmarkCagr:          number
  strategySharpe:         number
  benchmarkSharpe:        number
  strategyMaxDrawdown:    number
  benchmarkMaxDrawdown:   number
  strategyVolatility:     number
  benchmarkVolatility:    number
  drawdownReduction:      number   // % reduction vs benchmark
  startDate:              string
  endDate:                string
}

// ── Constants ─────────────────────────────────────────────────────────────────

// NSE index codes used in the nav_data / funds tables
export const MAVERST_NAV_CODES = ['N50', 'NMC150', 'N100EW', 'N100', 'NHBETA50', 'NLV50', 'MC150M50', 'GOLD'] as const

const REGIME_GROWTH_THRESHOLD    =  0.33
const REGIME_DEFENSIVE_THRESHOLD = -0.33
const CONFIDENCE_HIGH_THRESHOLD  =  1.0
const CONFIDENCE_MED_THRESHOLD   =  0.5
const ZSCORE_WINDOW              =  252   // ~1 trading year
const ZSCORE_MIN_WINDOW          =  63    // min 3 months before scoring
const MOMENTUM_WINDOW            =  252   // 12M
const RATIO_WINDOW               =  21    // 1M relative strength
const FII_WINDOW                 =  20    // 20-day FII cumulation
const SMA_WINDOW                 =  200   // 200-day trend

const ALLOCATION: Record<RegimeType, { midcapMomentum: number; gold: number }> = {
  Growth:    { midcapMomentum: 75, gold: 25 },
  Neutral:   { midcapMomentum: 50, gold: 50 },
  Defensive: { midcapMomentum: 25, gold: 75 },
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/** Loads nav_data for all MAVERST codes from the database. */
export async function fetchNavData(
  supabase: SupabaseClient,
  fromDate = '2010-01-01'
): Promise<Map<string, NavPoint[]>> {
  // Look up fund IDs for the required codes
  const { data: funds } = await supabase
    .from('funds')
    .select('id, code')
    .in('code', [...MAVERST_NAV_CODES])

  if (!funds || funds.length === 0) return new Map()

  const idToCode = new Map<number, string>(funds.map((f: { id: number; code: string }) => [f.id, f.code]))
  const fundIds  = funds.map((f: { id: number }) => f.id)

  const { data: rows } = await supabase
    .from('nav_data')
    .select('fund_id, date, nav_value')
    .in('fund_id', fundIds)
    .gte('date', fromDate)
    .order('date', { ascending: true })

  const result = new Map<string, NavPoint[]>()
  for (const row of rows ?? []) {
    const code = idToCode.get(row.fund_id)
    if (!code) continue
    if (!result.has(code)) result.set(code, [])
    result.get(code)!.push({ date: row.date, value: Number(row.nav_value) })
  }
  return result
}

/** Loads external data (VIX, USD/INR, FII) from maverst_external_data. */
export async function fetchExternalData(
  supabase: SupabaseClient,
  fromDate = '2010-01-01'
): Promise<ExternalDataRow[]> {
  const { data } = await supabase
    .from('maverst_external_data')
    .select('date, india_vix, usdinr, fii_net_crore')
    .gte('date', fromDate)
    .order('date', { ascending: true })
  return (data ?? []) as ExternalDataRow[]
}

/** Loads stored regime scores from maverst_regime_scores. */
export async function fetchStoredRegimeScores(
  supabase: SupabaseClient,
  fromDate = '2012-01-01'
): Promise<{ date: string; score: number; regime: RegimeType; alloc_momentum: number; alloc_gold: number }[]> {
  const { data } = await supabase
    .from('maverst_regime_scores')
    .select('date, score, regime, alloc_momentum, alloc_gold')
    .gte('date', fromDate)
    .order('date', { ascending: true })
  return (data ?? []) as { date: string; score: number; regime: RegimeType; alloc_momentum: number; alloc_gold: number }[]
}

// ── Indicator computation ─────────────────────────────────────────────────────

interface RawIndicators {
  trend:       number | null
  momentum:    number | null
  midcapRatio: number | null
  ewRatio:     number | null
  vix:         number | null
  goldRatio:   number | null
  usdinr:      number | null
  fiiFlows:    number | null
  sectorRatio: number | null
}

/** Build a reverse-chronological lookup: index → nav value on or before date. */
function buildLookup(series: NavPoint[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of series) m.set(p.date, p.value)
  return m
}

/** Find the most recent value at or before `targetDate` within `series`. */
function valueAtOrBefore(sorted: NavPoint[], targetDate: string): number | null {
  let lo = 0, hi = sorted.length - 1, idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (sorted[mid].date <= targetDate) { idx = mid; lo = mid + 1 }
    else hi = mid - 1
  }
  return idx >= 0 ? sorted[idx].value : null
}

/** SMA of the last `n` points ending at index `endIdx` in a sorted series. */
function sma(series: NavPoint[], endIdx: number, n: number): number | null {
  if (endIdx < n - 1) return null
  let sum = 0
  for (let i = endIdx - n + 1; i <= endIdx; i++) sum += series[i].value
  return sum / n
}

/**
 * Compute raw indicator values at a specific index position in the N50 series.
 * `idx` is the position in the N50 series.
 */
export function computeRawIndicatorsAtIdx(
  navData: Map<string, NavPoint[]>,
  externalMap: Map<string, ExternalDataRow>,
  n50Idx: number
): RawIndicators {
  const n50Series  = navData.get('N50')  ?? []
  const mc150      = navData.get('NMC150') ?? []
  const n100ew     = navData.get('N100EW') ?? []
  const n100       = navData.get('N100')   ?? []
  const hbeta      = navData.get('NHBETA50') ?? []
  const lvol       = navData.get('NLV50')  ?? []
  const gold       = navData.get('GOLD')   ?? []

  if (n50Idx < 0 || n50Idx >= n50Series.length) return nullIndicators()

  const date     = n50Series[n50Idx].date
  const n50Today = n50Series[n50Idx].value

  // 1. Trend: (N50 / SMA200) - 1
  const sma200 = sma(n50Series, n50Idx, SMA_WINDOW)
  const trend  = sma200 !== null ? (n50Today / sma200) - 1 : null

  // 2. Momentum: N50 12M return
  const n50Prev252 = n50Idx >= MOMENTUM_WINDOW ? n50Series[n50Idx - MOMENTUM_WINDOW].value : null
  const momentum   = n50Prev252 !== null ? (n50Today / n50Prev252) - 1 : null

  // 3. Midcap Ratio: (NMC150/N50) relative 1M return
  const midcapRatio = computeRatioReturn(mc150, n50Series, date, RATIO_WINDOW)

  // 4. EW Ratio: (N100EW/N100) relative 1M return
  const ewRatio = computeRatioReturn(n100ew, n100, date, RATIO_WINDOW)

  // 5. VIX: raw India VIX
  const ext    = externalMap.get(date)
  const vix    = ext?.india_vix ?? null

  // 6. Gold Ratio: (GOLD/N50) relative 1M return
  const goldRatio = computeRatioReturn(gold, n50Series, date, RATIO_WINDOW)

  // 7. USD/INR: 1M change in USD/INR
  const usdinr = computeExternalReturn(externalMap, date, 'usdinr', RATIO_WINDOW)

  // 8. FII Flows: 20-day cumulative
  const fiiFlows = computeFIICumulative(externalMap, date, FII_WINDOW)

  // 9. Sector Ratio: (NHBETA50/NLV50) relative 1M return
  const sectorRatio = computeRatioReturn(hbeta, lvol, date, RATIO_WINDOW)

  return { trend, momentum, midcapRatio, ewRatio, vix, goldRatio, usdinr, fiiFlows, sectorRatio }
}

function nullIndicators(): RawIndicators {
  return { trend: null, momentum: null, midcapRatio: null, ewRatio: null,
           vix: null, goldRatio: null, usdinr: null, fiiFlows: null, sectorRatio: null }
}

/**
 * 1-month return of (numerator/denominator) ratio.
 * Both series must be rebased to handle scale differences.
 */
function computeRatioReturn(
  numSeries:   NavPoint[],
  denSeries:   NavPoint[],
  targetDate:  string,
  lookback:    number
): number | null {
  const numNow = valueAtOrBefore(numSeries, targetDate)
  const denNow = valueAtOrBefore(denSeries, targetDate)
  if (numNow === null || denNow === null || denNow === 0) return null

  // Find the date `lookback` entries ago (approximate by traversing the shorter series)
  const pastDate = shiftDate(targetDate, -lookback)
  const numPast  = valueAtOrBefore(numSeries, pastDate)
  const denPast  = valueAtOrBefore(denSeries, pastDate)
  if (numPast === null || denPast === null || denPast === 0 || numPast === 0) return null

  const ratioNow  = numNow / denNow
  const ratioPast = numPast / denPast
  return (ratioNow / ratioPast) - 1
}

function computeExternalReturn(
  extMap:     Map<string, ExternalDataRow>,
  date:       string,
  field:      'usdinr',
  lookback:   number
): number | null {
  const now  = extMap.get(date)?.[field] ?? null
  if (now === null) return null
  const pastDate = shiftDate(date, -lookback)
  // Walk back to find the nearest available past date
  let past: number | null = null
  for (let d = 0; d <= 5; d++) {
    const pd = shiftDate(pastDate, -d)
    const row = extMap.get(pd)
    if (row?.[field] != null) { past = row[field] as number; break }
  }
  if (past === null || past === 0) return null
  return (now / past) - 1
}

function computeFIICumulative(
  extMap:   Map<string, ExternalDataRow>,
  date:     string,
  window:   number
): number | null {
  const dates = Array.from(extMap.keys()).sort()
  const idx   = dates.findLastIndex(d => d <= date)
  if (idx < 0) return null
  const start = Math.max(0, idx - window + 1)
  let sum = 0, count = 0
  for (let i = start; i <= idx; i++) {
    const v = extMap.get(dates[i])?.fii_net_crore ?? null
    if (v !== null) { sum += v; count++ }
  }
  return count > 0 ? sum : null
}

/** Approximate shift: adds `days` calendar days to an ISO date string. */
function shiftDate(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// ── Z-score computation ───────────────────────────────────────────────────────

type IndicatorKey = keyof RawIndicators

const INDICATOR_DIRECTION: Record<IndicatorKey, 1 | -1> = {
  trend:       1,
  momentum:    1,
  midcapRatio: 1,
  ewRatio:     1,
  vix:        -1,   // high VIX = bad
  goldRatio:  -1,   // gold outperforming = risk-off
  usdinr:     -1,   // rupee weakening = bad
  fiiFlows:    1,
  sectorRatio: 1,
}

interface ZScoreRow {
  date:    string
  raw:     RawIndicators
  z:       Partial<Record<IndicatorKey, number>>
}

/**
 * Compute rolling z-scores for a time series of raw indicator values.
 * Uses a 252-day lookback window; requires at least ZSCORE_MIN_WINDOW points.
 */
export function computeRollingZScores(
  series: { date: string; raw: RawIndicators }[]
): ZScoreRow[] {
  const keys = Object.keys(INDICATOR_DIRECTION) as IndicatorKey[]
  const result: ZScoreRow[] = []

  for (let i = 0; i < series.length; i++) {
    const windowStart = Math.max(0, i - ZSCORE_WINDOW + 1)
    const window      = series.slice(windowStart, i + 1)
    const z: Partial<Record<IndicatorKey, number>> = {}

    for (const key of keys) {
      const vals = window
        .map(r => r.raw[key])
        .filter((v): v is number => v !== null && isFinite(v))

      if (vals.length < ZSCORE_MIN_WINDOW) continue

      const mean = vals.reduce((a, b) => a + b, 0) / vals.length
      const std  = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1))
      if (std === 0) continue

      const current = series[i].raw[key]
      if (current === null || !isFinite(current)) continue

      // Apply direction: positive z always = bullish
      z[key] = clamp(((current - mean) / std) * INDICATOR_DIRECTION[key], -3, 3)
    }

    result.push({ date: series[i].date, raw: series[i].raw, z })
  }
  return result
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

// ── Regime scoring ────────────────────────────────────────────────────────────

/** Compute MAVERST score from direction-adjusted z-scores (equal weight). */
export function computeScore(z: Partial<Record<IndicatorKey, number>>): number {
  const vals = Object.values(z).filter((v): v is number => v !== undefined && isFinite(v))
  if (vals.length === 0) return 0
  return clamp(vals.reduce((a, b) => a + b, 0) / vals.length, -3, 3)
}

export function classifyRegime(score: number): RegimeType {
  if (score >  REGIME_GROWTH_THRESHOLD)    return 'Growth'
  if (score <  REGIME_DEFENSIVE_THRESHOLD) return 'Defensive'
  return 'Neutral'
}

export function computeConfidence(score: number): ConfidenceType {
  const abs = Math.abs(score)
  if (abs >= CONFIDENCE_HIGH_THRESHOLD) return 'High'
  if (abs >= CONFIDENCE_MED_THRESHOLD)  return 'Medium'
  return 'Low'
}

export function getAllocation(regime: RegimeType) {
  return ALLOCATION[regime]
}

// ── Insight generator ─────────────────────────────────────────────────────────

const REGIME_LINES: Record<RegimeType, Record<ConfidenceType, string>> = {
  Growth: {
    High:   'Strong bullish signal — momentum, breadth, and trend are all aligned.',
    Medium: 'Moderately bullish — most indicators point to continued market strength.',
    Low:    'Mildly positive — market conditions lean growth but conviction is limited.',
  },
  Neutral: {
    High:   'Mixed signals — the model is inconclusive; stay balanced.',
    Medium: 'Balanced environment — no clear directional edge in either direction.',
    Low:    'Transitional phase — monitor closely for confirmation of next trend.',
  },
  Defensive: {
    High:   'Risk-off signal — multiple indicators flagging elevated downside risk.',
    Medium: 'Cautious posture warranted — several signals are flashing defensively.',
    Low:    'Mild caution advised — early signs of weakening, but not yet confirmed.',
  },
}

export function buildInsightLine(regime: RegimeType, confidence: ConfidenceType): string {
  return REGIME_LINES[regime][confidence]
}

// ── Build full RegimeResult for a single day ──────────────────────────────────

const INDICATOR_META: { key: IndicatorKey; label: string; description: string }[] = [
  { key: 'trend',       label: 'Trend',         description: 'Nifty 50 vs 200-day moving average' },
  { key: 'momentum',    label: 'Momentum',       description: 'Nifty 50 12-month price return' },
  { key: 'midcapRatio', label: 'Midcap Ratio',   description: 'Midcap 150 vs Nifty 50 relative strength (1M)' },
  { key: 'ewRatio',     label: 'Breadth',        description: 'Equal-weight vs cap-weight breadth (1M)' },
  { key: 'vix',         label: 'Volatility',     description: 'India VIX — lower is better for equities' },
  { key: 'goldRatio',   label: 'Gold Signal',    description: 'Gold vs equity relative strength (1M)' },
  { key: 'usdinr',      label: 'Rupee Strength', description: 'USD/INR 1-month change — strong rupee = growth' },
  { key: 'fiiFlows',    label: 'FII Activity',   description: '20-day cumulative FII net equity flows (₹ crore)' },
  { key: 'sectorRatio', label: 'Risk Appetite',  description: 'High Beta vs Low Volatility relative strength (1M)' },
]

function indicatorInterpretation(z: number | undefined, label: string): string {
  if (z === undefined) return 'Insufficient data'
  if (z > 1)   return `${label} is strongly bullish`
  if (z > 0.3) return `${label} is mildly bullish`
  if (z > -0.3) return `${label} is neutral`
  if (z > -1)  return `${label} is mildly bearish`
  return `${label} is strongly bearish`
}

export function buildRegimeResult(row: ZScoreRow): RegimeResult {
  const score      = computeScore(row.z)
  const regime     = classifyRegime(score)
  const confidence = computeConfidence(score)
  const alloc      = getAllocation(regime)

  const n = Object.keys(row.z).length || 1
  const snapshots: IndicatorSnapshot[] = INDICATOR_META.map(meta => {
    const z = row.z[meta.key]
    return {
      key:            meta.key,
      label:          meta.label,
      description:    meta.description,
      rawValue:       row.raw[meta.key],
      zscore:         z ?? null,
      weight:         z !== undefined ? 1 / n : 0,
      interpretation: indicatorInterpretation(z, meta.label),
    }
  })

  const keyDrivers = [...snapshots]
    .filter(s => s.zscore !== null)
    .sort((a, b) => Math.abs(b.zscore!) - Math.abs(a.zscore!))
    .slice(0, 3)

  return {
    date:        row.date,
    score,
    regime,
    confidence,
    allocation:  alloc,
    indicators:  snapshots,
    keyDrivers,
    insightLine: buildInsightLine(regime, confidence),
  }
}

// ── Full history computation ──────────────────────────────────────────────────

/**
 * Computes regime scores for all available N50 dates.
 * This is used for historical backfill — results are stored in maverst_regime_scores.
 */
export function computeFullHistory(
  navData:      Map<string, NavPoint[]>,
  externalData: ExternalDataRow[]
): ZScoreRow[] {
  const n50 = navData.get('N50') ?? []
  if (n50.length === 0) return []

  const extMap = new Map<string, ExternalDataRow>(externalData.map(r => [r.date, r]))

  // Build raw indicator series aligned to N50 dates
  const rawSeries: { date: string; raw: RawIndicators }[] = n50.map((_, idx) => ({
    date: n50[idx].date,
    raw:  computeRawIndicatorsAtIdx(navData, extMap, idx),
  }))

  return computeRollingZScores(rawSeries)
}

// ── Backtest engine ───────────────────────────────────────────────────────────

/**
 * Runs a historical backtest of the MAVERST allocation strategy.
 *
 * Strategy: at the start of each month, allocate between MC150M50 (Midcap
 * Momentum) and GOLD based on the regime signal from the prior month-end.
 * Benchmark: Nifty 50 (N50).
 */
export function runBacktest(
  navData:       Map<string, NavPoint[]>,
  regimeHistory: { date: string; regime: RegimeType; alloc_momentum: number; alloc_gold: number }[],
  fromDate       = '2012-01-01'
): BacktestResult | null {
  const mc150m50 = navData.get('MC150M50') ?? []
  const gold     = navData.get('GOLD')     ?? []
  const n50      = navData.get('N50')      ?? []

  if (mc150m50.length === 0 || gold.length === 0 || n50.length === 0) return null

  // Build date-keyed lookups
  const mcMap   = buildLookup(mc150m50)
  const goldMap = buildLookup(gold)
  const n50Map  = buildLookup(n50)

  const regimeMap = new Map(regimeHistory.map(r => [r.date, r]))

  // Find the common start date (max of all fromDates and fromDate param)
  const allDates = n50
    .map(p => p.date)
    .filter(d => d >= fromDate && mcMap.has(d) && goldMap.has(d))

  if (allDates.length < 2) return null

  const startDate = allDates[0]
  const endDate   = allDates[allDates.length - 1]

  // Run backtest with monthly rebalancing
  let strategyValue  = 100
  let benchmarkValue = 100

  const equityCurve: BacktestPoint[] = []

  // Initial allocation: find regime at or before start
  let currentAlloc = { midcapMomentum: 50, gold: 50 } as { midcapMomentum: number; gold: number }
  let currentRegime: RegimeType = 'Neutral'

  // Rebalance at start of each month — find last regime before each month start
  let lastMcPrice   = mcMap.get(startDate)!
  let lastGoldPrice = goldMap.get(startDate)!
  let lastN50       = n50Map.get(startDate)!

  equityCurve.push({ date: startDate, strategy: 100, benchmark: 100, regime: currentRegime })

  for (let i = 1; i < allDates.length; i++) {
    const date      = allDates[i]
    const mcPrice   = mcMap.get(date)!
    const goldPrice = goldMap.get(date)!
    const n50Price  = n50Map.get(date)!

    // Rebalance check: first trading day of a new month
    const prevDate = allDates[i - 1]
    const isNewMonth = date.slice(0, 7) !== prevDate.slice(0, 7)
    if (isNewMonth) {
      // Use regime from last known date before this month
      const regime = findRegimeAtOrBefore(regimeMap, prevDate)
      if (regime) {
        currentAlloc  = { midcapMomentum: regime.alloc_momentum, gold: regime.alloc_gold }
        currentRegime = regime.regime
      }
      // Rebase prices for new allocation period
      lastMcPrice   = mcPrice
      lastGoldPrice = goldPrice
    }

    // Daily P&L
    const mcReturn   = lastMcPrice   > 0 ? (mcPrice   / lastMcPrice   - 1) : 0
    const goldReturn = lastGoldPrice > 0 ? (goldPrice / lastGoldPrice - 1) : 0
    const n50Return  = lastN50       > 0 ? (n50Price  / lastN50       - 1) : 0

    const stratReturn = (currentAlloc.midcapMomentum / 100) * mcReturn
                      + (currentAlloc.gold           / 100) * goldReturn

    strategyValue  *= (1 + stratReturn)
    benchmarkValue *= (1 + n50Return)

    lastMcPrice   = mcPrice
    lastGoldPrice = goldPrice
    lastN50       = n50Price

    equityCurve.push({
      date,
      strategy:  parseFloat(strategyValue.toFixed(4)),
      benchmark: parseFloat(benchmarkValue.toFixed(4)),
      regime:    currentRegime,
    })
  }

  // Compute metrics
  const stratNav  = equityCurve.map(p => ({ date: p.date, value: p.strategy }))
  const benchNav  = equityCurve.map(p => ({ date: p.date, value: p.benchmark }))

  return {
    equityCurve,
    strategyCagr:         computeCAGR(stratNav),
    benchmarkCagr:        computeCAGR(benchNav),
    strategySharpe:       computeSharpe(stratNav),
    benchmarkSharpe:      computeSharpe(benchNav),
    strategyMaxDrawdown:  computeMaxDD(stratNav),
    benchmarkMaxDrawdown: computeMaxDD(benchNav),
    strategyVolatility:   computeVol(stratNav),
    benchmarkVolatility:  computeVol(benchNav),
    drawdownReduction:    computeDrawdownReduction(stratNav, benchNav),
    startDate,
    endDate,
  }
}

function findRegimeAtOrBefore(
  regimeMap: Map<string, { regime: RegimeType; alloc_momentum: number; alloc_gold: number }>,
  date:      string
) {
  // Check exact date first, then walk back up to 10 days
  for (let d = 0; d <= 10; d++) {
    const check = shiftDate(date, -d)
    const r = regimeMap.get(check)
    if (r) return r
  }
  return null
}

// ── Mini math helpers (duplicated here to keep lib self-contained) ─────────────

function computeCAGR(nav: NavPoint[]): number {
  if (nav.length < 2) return 0
  const years = (new Date(nav.at(-1)!.date).getTime() - new Date(nav[0].date).getTime())
              / (365.25 * 86400 * 1000)
  if (years <= 0) return 0
  return Math.pow(nav.at(-1)!.value / nav[0].value, 1 / years) - 1
}

function computeVol(nav: NavPoint[]): number {
  if (nav.length < 2) return 0
  const rets: number[] = []
  for (let i = 1; i < nav.length; i++) rets.push(nav[i].value / nav[i - 1].value - 1)
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length
  const std  = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (rets.length - 1))
  return std * Math.sqrt(252)
}

function computeSharpe(nav: NavPoint[], rf = 0.06): number {
  const cagr = computeCAGR(nav)
  const vol  = computeVol(nav)
  return vol > 0 ? (cagr - rf) / vol : 0
}

function computeMaxDD(nav: NavPoint[]): number {
  let peak = nav[0]?.value ?? 0
  let maxDD = 0
  for (const p of nav) {
    if (p.value > peak) peak = p.value
    const dd = (p.value - peak) / peak
    if (dd < maxDD) maxDD = dd
  }
  return maxDD
}

function computeDrawdownReduction(strategy: NavPoint[], benchmark: NavPoint[]): number {
  const sDD = computeMaxDD(strategy)
  const bDD = computeMaxDD(benchmark)
  if (bDD === 0) return 0
  return ((Math.abs(bDD) - Math.abs(sDD)) / Math.abs(bDD)) * 100
}
