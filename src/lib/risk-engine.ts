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

/** Code for the Gold commodity fund (Yahoo Finance: GC=F) */
export const GOLD_CODE = 'GOLD'

/** Preferred Low-Volatility index codes, in order of preference */
export const LOW_VOL_CODES = ['N100LV30', 'NLV50', 'NALV30', 'NQLV30']

/** Fixed allocation weights (%) for Gold and Low-Vol slots, by risk category */
const FIXED_ALLOC: Record<RiskCategory, { gold: number; lowvol: number }> = {
  Conservative: { gold: 15, lowvol: 25 },
  Balanced:     { gold: 10, lowvol: 15 },
  Growth:       { gold:  5, lowvol: 10 },
  Aggressive:   { gold:  5, lowvol:  5 },
}

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
  weight: number        // 0–100, always a multiple of 5
  reason: string
  scoreBreakdown: { label: string; value: string }[]
}

// ─── Category preference multipliers (differentiated) ────────────────────────
const CATEGORY_PREF: Record<RiskCategory, Record<string, number>> = {
  Conservative: {
    'Broad Market': 0.8, 'Low Vol': 2.0, 'Quality': 1.5, 'Multi-Factor': 0.8,
    'Value': 0.7, 'Dividend': 0.8, 'Momentum': 0.2, 'Alpha': 0.3,
    'Equal Weight': 0.6, 'High Beta': 0.1, 'Thematic': 0.2,
  },
  Balanced: {
    'Broad Market': 1.0, 'Low Vol': 0.9, 'Quality': 1.2, 'Multi-Factor': 1.1,
    'Value': 1.0, 'Dividend': 0.8, 'Momentum': 0.8, 'Alpha': 0.8,
    'Equal Weight': 0.7, 'High Beta': 0.4, 'Thematic': 0.5,
  },
  Growth: {
    'Broad Market': 0.7, 'Low Vol': 0.4, 'Quality': 0.9, 'Multi-Factor': 1.1,
    'Value': 0.9, 'Dividend': 0.6, 'Momentum': 1.4, 'Alpha': 1.3,
    'Equal Weight': 0.7, 'High Beta': 0.8, 'Thematic': 0.9,
  },
  Aggressive: {
    'Broad Market': 0.3, 'Low Vol': 0.05, 'Quality': 0.5, 'Multi-Factor': 0.9,
    'Value': 0.7, 'Dividend': 0.4, 'Momentum': 1.8, 'Alpha': 2.0,
    'Equal Weight': 0.6, 'High Beta': 1.3, 'Thematic': 1.0,
  },
}

// Reasons for the 3 variable slots
const REASONS: Record<RiskCategory, string[]> = {
  Conservative: [
    'Drawdown leader — top Sharpe ratio and max-drawdown protection in its category',
    'Quality factor tilt provides earnings stability during volatile markets',
    'Broad large-cap diversification to anchor the core portfolio',
  ],
  Balanced: [
    'Best risk-adjusted returns in its category across market cycles',
    'Strong 10Y CAGR with a moderate drawdown profile',
    'Factor diversification for resilience across economic regimes',
  ],
  Growth: [
    'High 10Y CAGR — top-tier long-term compounder in its factor class',
    'Strong rolling returns indicate persistent outperformance',
    'Momentum or multi-factor exposure for growth in sustained upcycles',
  ],
  Aggressive: [
    'Maximum 10Y CAGR — highest compounder in the eligible universe',
    'Pure alpha or momentum — systematically rides the strongest market trends',
    'Small/mid-cap factor tilt for superior long-run wealth creation',
  ],
}

const GOLD_REASON: Record<RiskCategory, string> = {
  Conservative: 'Safe-haven asset — gold preserves capital during equity drawdowns and inflationary periods',
  Balanced:     'Portfolio diversifier — gold provides inflation hedge and crisis protection',
  Growth:       'Tail-risk hedge — small gold allocation reduces portfolio correlation and peak drawdowns',
  Aggressive:   'Crisis buffer — minimal gold allocation as insurance against systemic risk',
}

const LOWVOL_REASON: Record<RiskCategory, string> = {
  Conservative: 'Core defensive holding — low volatility factor with superior drawdown protection and Sharpe ratio',
  Balanced:     'Stability anchor — low volatility index smooths portfolio returns across economic cycles',
  Growth:       'Volatility dampener — balances the higher-risk factor tilts in the portfolio',
  Aggressive:   'Minimal hedging — small low-vol position to reduce peak-to-trough drawdowns',
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

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
      raw = ddProt * 0.50 + rolling * 0.30 + sharpe * 0.15 + cagr * 0.05; break
    case 'Balanced':
      raw = rolling * 0.35 + sharpe * 0.30 + cagr * 0.25 + ddProt * 0.10; break
    case 'Growth':
      raw = cagr * 0.40 + rolling * 0.35 + sharpe * 0.20 + ddProt * 0.05; break
    case 'Aggressive':
      raw = cagr * 0.60 + rolling * 0.30 + sharpe * 0.08 + ddProt * 0.02; break
  }
  return raw * catMult
}

// ─── Weight distribution ──────────────────────────────────────────────────────

/**
 * Distribute a budget (multiple of 5) across funds proportional to scores,
 * rounding each to the nearest multiple of 5 using the largest-remainder method.
 */
function distributeToNearest5(scores: number[], target: number): number[] {
  if (scores.length === 0) return []
  if (scores.length === 1) return [target]

  const total = scores.reduce((s, v) => s + Math.max(0, v), 0)
  if (total === 0) {
    // Equal split
    const eq = Math.floor(target / scores.length / 5) * 5
    const result = scores.map(() => eq)
    const deficit = Math.round((target - result.reduce((s, v) => s + v, 0)) / 5)
    for (let k = 0; k < deficit; k++) result[k % scores.length] += 5
    return result
  }

  const raw     = scores.map(s => (Math.max(0, s) / total) * target)
  const floored = raw.map(v => Math.floor(v / 5) * 5)
  const sumFloor = floored.reduce((s, v) => s + v, 0)
  const deficit  = Math.round((target - sumFloor) / 5)

  // Sort indices by remainder descending, add 5 to the top `deficit` entries
  const order = raw
    .map((v, i) => ({ i, r: v - floored[i] }))
    .sort((a, b) => b.r - a.r)

  const result = [...floored]
  for (let k = 0; k < deficit && k < order.length; k++) {
    result[order[k].i] += 5
  }
  return result
}

// ─── Fund selection ───────────────────────────────────────────────────────────

/**
 * Select a 5-fund portfolio with optimised weights for a risk category.
 *
 * Layout:
 *   • Slot 1–3: top-scored MF-eligible index funds (max-2-per-category diversity)
 *   • Slot 4:   best Low-Volatility index (fixed weight from FIXED_ALLOC)
 *   • Slot 5:   Gold commodity fund       (fixed weight from FIXED_ALLOC)
 *
 * All weights are multiples of 5, summing to 100.
 */
export function selectAndWeightFunds(
  funds: FundData[],
  cat: RiskCategory,
  goldFund?: FundData | null,
): RecommendedFund[] {
  const { gold: goldW, lowvol: lowvolW } = FIXED_ALLOC[cat]

  // ── Find the best Low-Vol fund ────────────────────────────────────────────
  const lowVolCandidates = funds.filter(f =>
    LOW_VOL_CODES.includes(f.code) &&
    (f.cagr_10y != null || f.sharpe_ratio != null || f.max_drawdown != null)
  )

  // Sort by preference order first (N100LV30 preferred), then by score
  lowVolCandidates.sort((a, b) => {
    const ai = LOW_VOL_CODES.indexOf(a.code)
    const bi = LOW_VOL_CODES.indexOf(b.code)
    const scoreDiff = computeFundScore(b, cat) - computeFundScore(a, cat)
    // If both are preferred codes, pick by score; otherwise keep preference order
    if (ai !== bi && (ai === 0 || bi === 0)) return ai - bi
    return scoreDiff
  })
  const bestLowVol = lowVolCandidates[0] ?? null

  const actualGoldW   = goldFund ? goldW : 0
  const actualLowVolW = bestLowVol ? lowvolW : 0
  const remainingBudget = 100 - actualGoldW - actualLowVolW

  // ── Build scoring pool (exclude Gold + LowVol codes) ─────────────────────
  const excludeCodes = new Set<string>([
    GOLD_CODE,
    ...(bestLowVol ? [bestLowVol.code] : []),
  ])

  const eligible = funds.filter(f =>
    MF_ELIGIBLE_CODES.has(f.code) &&
    !excludeCodes.has(f.code) &&
    (f.cagr_10y != null || f.sharpe_ratio != null || f.max_drawdown != null)
  )

  const scored = eligible
    .map(f => ({ ...f, rs: computeFundScore(f, cat) }))
    .sort((a, b) => b.rs - a.rs)

  // ── Pick top 3 with max-2-per-category diversification ───────────────────
  const selected: typeof scored = []
  const catCount: Record<string, number> = {}
  for (const fund of scored) {
    if (selected.length >= 3) break
    const c = fund.category
    if ((catCount[c] ?? 0) >= 2) continue
    catCount[c] = (catCount[c] ?? 0) + 1
    selected.push(fund)
  }
  // Relax constraint if we need more
  if (selected.length < 3) {
    for (const fund of scored) {
      if (selected.length >= 3) break
      if (selected.some(s => s.id === fund.id)) continue
      selected.push(fund)
    }
  }

  // ── Distribute remaining budget to the 3 scored slots ────────────────────
  const weights3 = distributeToNearest5(selected.map(f => f.rs), remainingBudget)

  const mkBreakdown = (f: FundData) => [
    { label: '10Y CAGR',   value: f.cagr_10y             != null ? `${(f.cagr_10y * 100).toFixed(1)}%`             : '—' },
    { label: '3Y Rolling', value: f.avg_3y_rolling_return != null ? `${(f.avg_3y_rolling_return * 100).toFixed(1)}%` : '—' },
    { label: 'Sharpe',     value: f.sharpe_ratio          != null ? f.sharpe_ratio.toFixed(2)                        : '—' },
    { label: 'Max DD',     value: f.max_drawdown          != null ? `${(f.max_drawdown * 100).toFixed(1)}%`          : '—' },
  ]

  const result: RecommendedFund[] = []

  // 3 scored funds
  selected.forEach((fund, i) => {
    result.push({
      id:       fund.id,
      code:     fund.code,
      name:     fund.name,
      category: fund.category,
      weight:   weights3[i],
      reason:   REASONS[cat][i] ?? 'Strong risk-adjusted performance in its factor class',
      scoreBreakdown: mkBreakdown(fund),
    })
  })

  // Low-Vol fund (fixed weight)
  if (bestLowVol) {
    result.push({
      id:       bestLowVol.id,
      code:     bestLowVol.code,
      name:     bestLowVol.name,
      category: bestLowVol.category,
      weight:   actualLowVolW,
      reason:   LOWVOL_REASON[cat],
      scoreBreakdown: mkBreakdown(bestLowVol),
    })
  }

  // Gold fund (fixed weight)
  if (goldFund) {
    result.push({
      id:       goldFund.id,
      code:     GOLD_CODE,
      name:     goldFund.name,
      category: 'Commodity',
      weight:   actualGoldW,
      reason:   GOLD_REASON[cat],
      scoreBreakdown: mkBreakdown(goldFund),
    })
  }

  return result
}
