/**
 * risk-engine.ts
 *
 * Risk profile scoring, fund selection, and weight optimisation.
 * Pure logic — no DB / fetch calls here.
 */

export type RiskCategory = 'Conservative' | 'Balanced' | 'Growth' | 'Aggressive'

export interface RiskAnswers {
  q1: number   // investing-experience score
  q2: number   // income-stability score
  q3: number   // dependents score
  q4: number   // drawdown-tolerance score
}

/** Question definitions with their answer options and point values */
export const RISK_QUESTIONS = [
  {
    key: 'q1' as const,
    icon: '📊',
    title: 'What is your investing experience?',
    subtitle: 'Helps us understand your familiarity with market volatility.',
    options: [
      { label: "I've never invested before",  value: 10 },
      { label: '1–3 years of experience',     value: 30 },
      { label: '4–7 years of experience',     value: 60 },
      { label: 'More than 7 years',           value: 90 },
    ],
  },
  {
    key: 'q2' as const,
    icon: '💼',
    title: 'What is your primary income source?',
    subtitle: 'Income stability affects how much portfolio risk you can handle.',
    options: [
      { label: 'Salaried employee',              value: 70 },
      { label: 'Business owner / Self-employed', value: 60 },
      { label: 'Retired',                        value: 40 },
      { label: 'Investment / Passive income',    value: 80 },
    ],
  },
  {
    key: 'q3' as const,
    icon: '👨‍👩‍👦',
    title: 'Who are your financial dependents?',
    subtitle: 'More dependents increase the need for capital stability.',
    options: [
      { label: 'No dependents', value: 90 },
      { label: 'Spouse only',   value: 70 },
      { label: 'Parents',       value: 60 },
      { label: 'Children',      value: 40 },
    ],
  },
  {
    key: 'q4' as const,
    icon: '📉',
    title: 'How much portfolio drop can you handle?',
    subtitle: 'Markets fall temporarily. What is your emotional and financial limit?',
    options: [
      { label: "I can't tolerate any loss",          value: 10 },
      { label: '-5% to -10% is my limit',            value: 40 },
      { label: 'I can handle -10% to -20%',          value: 70 },
      { label: 'I am comfortable with -20% or more', value: 90 },
    ],
  },
]

/** Compute a 0–100 risk score from the four question answers */
export function computeRiskScore(a: RiskAnswers): number {
  const raw = a.q1 * 0.25 + a.q2 * 0.20 + a.q3 * 0.20 + a.q4 * 0.35
  return Math.round(Math.min(100, Math.max(0, raw)))
}

/** Map score to one of four risk buckets */
export function getRiskCategory(score: number): RiskCategory {
  if (score <= 30) return 'Conservative'
  if (score <= 60) return 'Balanced'
  if (score <= 80) return 'Growth'
  return 'Aggressive'
}

export const RISK_CATEGORY_META: Record<RiskCategory, {
  color: string; bg: string; border: string; description: string; icon: string
}> = {
  Conservative: {
    color: '#0369A1', bg: '#F0F9FF', border: '#BAE6FD',
    icon: '🛡️',
    description: 'Capital preservation with steady growth. Low drawdown and high stability — ideal when protecting principal matters most.',
  },
  Balanced: {
    color: '#0A7C4E', bg: '#E6F4EE', border: '#86EFAC',
    icon: '⚖️',
    description: 'Mix of growth and stability with moderate risk. Diversified factor exposure across market cycles.',
  },
  Growth: {
    color: '#7C3AED', bg: '#F3F0FF', border: '#C4B5FD',
    icon: '📈',
    description: 'Strong long-term returns with manageable risk. Factor-tilted allocation for investors with a 7+ year horizon.',
  },
  Aggressive: {
    color: '#C2410C', bg: '#FFF7ED', border: '#FED7AA',
    icon: '🚀',
    description: 'Maximum wealth creation through high-alpha factor strategies. Higher short-term volatility in exchange for superior long-run compounding.',
  },
}

// ─── MF-eligible index codes ──────────────────────────────────────────────────
// Only indices where at least one Indian mutual fund actively tracks them.
export const MF_ELIGIBLE_CODES = new Set([
  // Broad Market (all have many MFs)
  'N50', 'NN50', 'N100', 'N200', 'N500',
  'NMC150', 'NMC100', 'NMC50',
  'NSC250', 'NSC100', 'NSC50',
  'NLMC250', 'NMSC400', 'NMCSEL', 'NTM',
  'N500MC5025',
  // Momentum factor
  'N200M30', 'MC150M50', 'N500M50', 'N500MCQ50',
  // Quality factor
  'N100Q30', 'MC150Q50', 'N200Q30', 'N500Q50',
  // Low-Volatility / Alpha-LowVol / Quality-LowVol
  'N100LV30', 'NALV30', 'NQLV30', 'NLV50',
  // Alpha factor
  'NALPHA50', 'N100A30',
  // Value factor
  'N50V20', 'N200V30', 'N500V50',
])

// ─── Fund data shape (matches Supabase select in /api/recommend) ──────────────
export interface FundData {
  id: number
  code: string
  name: string
  category: string
  cagr_10y: number | null
  cagr_20y: number | null
  avg_3y_rolling_return: number | null
  sharpe_ratio: number | null
  max_drawdown: number | null
  score: number | null
  final_rank: number | null
}

export interface RecommendedFund {
  id: number
  code: string
  name: string
  category: string
  weight: number        // 0–100
  reason: string
  scoreBreakdown: { label: string; value: string }[]
}

// ─── Category preference multipliers ─────────────────────────────────────────
const CATEGORY_PREF: Record<RiskCategory, Record<string, number>> = {
  Conservative: {
    'Broad Market': 1.0, 'Low Vol': 1.3, 'Quality': 1.2, 'Multi-Factor': 0.9,
    'Value': 0.8, 'Dividend': 0.9, 'Momentum': 0.5, 'Alpha': 0.5,
    'Equal Weight': 0.7, 'High Beta': 0.2, 'Thematic': 0.3,
  },
  Balanced: {
    'Broad Market': 1.0, 'Low Vol': 0.9, 'Quality': 1.1, 'Multi-Factor': 1.1,
    'Value': 0.9, 'Dividend': 0.8, 'Momentum': 0.9, 'Alpha': 0.9,
    'Equal Weight': 0.8, 'High Beta': 0.5, 'Thematic': 0.6,
  },
  Growth: {
    'Broad Market': 0.8, 'Low Vol': 0.5, 'Quality': 0.9, 'Multi-Factor': 1.1,
    'Value': 0.9, 'Dividend': 0.7, 'Momentum': 1.2, 'Alpha': 1.2,
    'Equal Weight': 0.8, 'High Beta': 0.9, 'Thematic': 1.0,
  },
  Aggressive: {
    'Broad Market': 0.6, 'Low Vol': 0.3, 'Quality': 0.7, 'Multi-Factor': 1.0,
    'Value': 0.8, 'Dividend': 0.5, 'Momentum': 1.3, 'Alpha': 1.4,
    'Equal Weight': 0.7, 'High Beta': 1.2, 'Thematic': 1.1,
  },
}

const REASONS: Record<RiskCategory, string[]> = {
  Conservative: [
    'Top-ranked for drawdown protection and Sharpe ratio in its category',
    'Low volatility with consistent long-term rolling returns',
    'Stable quality factor — historically holds up in market downturns',
    'Broad large-cap diversification to anchor the portfolio',
    'Proven capital preservation track record over 10+ years',
  ],
  Balanced: [
    'Best risk-adjusted returns in its category across market cycles',
    'Strong 10Y CAGR with a moderate drawdown profile',
    'Quality tilt provides stability without sacrificing growth',
    'Factor diversification for resilience across economic regimes',
    'Consistent outperformer vs NIFTY 50 over rolling 3-year periods',
  ],
  Growth: [
    'High 10Y CAGR — top-tier long-term compounder in its factor class',
    'Strong rolling returns indicate persistent outperformance',
    'Factor alpha over broad market with managed max drawdown',
    'Momentum exposure captures growth in sustained market upcycles',
    'Multi-factor diversification for risk-adjusted alpha generation',
  ],
  Aggressive: [
    'Maximum 10Y CAGR — the highest compounder in the eligible universe',
    'Pure momentum — systematically rides the strongest market trends',
    'Small/mid-cap factor tilt for superior long-run wealth creation',
    'High-alpha strategy that consistently beats the broad market',
    'Aggressive multi-factor diversification across high-growth indices',
  ],
}

/** Compute a risk-category-adjusted score for a single fund */
function computeFundScore(fund: FundData, cat: RiskCategory): number {
  const cagr    = fund.cagr_10y               ?? 0
  const rolling = fund.avg_3y_rolling_return   ?? 0
  const sharpe  = fund.sharpe_ratio            ?? 0
  // drawdown protection: 0 = worst, ~0.6 = great
  const ddProt  = 1 + (fund.max_drawdown       ?? -0.5)
  const catMult = CATEGORY_PREF[cat][fund.category] ?? 0.7

  let raw: number
  switch (cat) {
    case 'Conservative':
      raw = sharpe * 0.40 + ddProt * 0.40 + cagr * 0.20; break
    case 'Balanced':
      raw = sharpe * 0.25 + ddProt * 0.25 + cagr * 0.30 + rolling * 0.20; break
    case 'Growth':
      raw = cagr * 0.35 + rolling * 0.30 + sharpe * 0.20 + ddProt * 0.15; break
    case 'Aggressive':
      raw = cagr * 0.45 + rolling * 0.35 + sharpe * 0.15 + ddProt * 0.05; break
  }
  return raw * catMult
}

/** Cap-at-35% weight optimisation with iterative redistribution */
function optimiseWeights(scores: number[]): number[] {
  const totalScore = scores.reduce((s, v) => s + v, 0)
  if (totalScore === 0) {
    const eq = parseFloat((100 / scores.length).toFixed(1))
    return scores.map(() => eq)
  }

  let w = scores.map(s => (s / totalScore) * 100)

  // Iteratively push excess from capped funds to uncapped ones
  for (let iter = 0; iter < 10; iter++) {
    const excess = w.reduce((s, v) => s + Math.max(0, v - 35), 0)
    if (excess < 0.01) break
    const capped = w.map(v => Math.min(v, 35))
    const uncapSum = capped.reduce((s, v, i) => s + (w[i] < 35 ? v : 0), 0)
    if (uncapSum < 0.01) break
    w = capped.map((v, i) =>
      w[i] < 35 ? v + (v / uncapSum) * excess : v
    )
  }

  // Round to 1 decimal and fix sum
  const rounded = w.map(v => Math.round(v * 10) / 10)
  const diff = parseFloat((100 - rounded.reduce((s, v) => s + v, 0)).toFixed(1))
  if (diff !== 0) rounded[0] = parseFloat((rounded[0] + diff).toFixed(1))
  return rounded
}

/** Select 5 MF-eligible funds and compute optimised weights for a risk category */
export function selectAndWeightFunds(
  funds: FundData[],
  cat: RiskCategory,
): RecommendedFund[] {
  // Filter to MF-eligible indices that have at least some metric data
  const eligible = funds.filter(f =>
    MF_ELIGIBLE_CODES.has(f.code) &&
    (f.cagr_10y != null || f.sharpe_ratio != null || f.max_drawdown != null)
  )

  // Score and rank
  const scored = eligible
    .map(f => ({ ...f, rs: computeFundScore(f, cat) }))
    .sort((a, b) => b.rs - a.rs)

  // Pick top 5 with max-2-per-category diversification
  const selected: typeof scored = []
  const catCount: Record<string, number> = {}
  for (const fund of scored) {
    if (selected.length >= 5) break
    const c = fund.category
    if ((catCount[c] ?? 0) >= 2) continue
    catCount[c] = (catCount[c] ?? 0) + 1
    selected.push(fund)
  }
  // Relax constraint if we still need more funds
  if (selected.length < 5) {
    for (const fund of scored) {
      if (selected.length >= 5) break
      if (selected.some(s => s.id === fund.id)) continue
      selected.push(fund)
    }
  }

  const weights = optimiseWeights(selected.map(f => f.rs))

  return selected.map((fund, i) => ({
    id:       fund.id,
    code:     fund.code,
    name:     fund.name,
    category: fund.category,
    weight:   weights[i],
    reason:   REASONS[cat][i] ?? 'Strong risk-adjusted performance in its factor class',
    scoreBreakdown: [
      { label: '10Y CAGR',   value: fund.cagr_10y             != null ? `${(fund.cagr_10y * 100).toFixed(1)}%`             : '—' },
      { label: '3Y Rolling', value: fund.avg_3y_rolling_return != null ? `${(fund.avg_3y_rolling_return * 100).toFixed(1)}%` : '—' },
      { label: 'Sharpe',     value: fund.sharpe_ratio          != null ? fund.sharpe_ratio.toFixed(2)                        : '—' },
      { label: 'Max DD',     value: fund.max_drawdown          != null ? `${(fund.max_drawdown * 100).toFixed(1)}%`          : '—' },
    ],
  }))
}
