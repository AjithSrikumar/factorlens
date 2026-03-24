/**
 * NAV split detection and normalization.
 *
 * Problem: Some ETFs / index funds undergo NAV splits where the per-unit NAV
 * drops dramatically overnight (e.g. SBI Gold ETF: ₹4008 → ₹46.2 in FY22).
 * Plotting or computing returns across such splits produces wildly wrong results.
 *
 * Solution: Detect large consecutive NAV drops (>50%) and record them as splits.
 * Then multiply all pre-split NAVs by the ratio to bring everything onto the
 * same scale as the current (most-recent) NAV.
 *
 * Example — SBI Gold ETF:
 *   Raw pre-split NAV: ₹4008.3
 *   Post-split NAV:    ₹46.2
 *   Ratio:             46.2 / 4008.3 ≈ 0.01152
 *   Normalized pre-split NAV: 4008.3 × 0.01152 = ₹46.2  ✓
 */

export interface NavRow  { date: string; nav: number }

export interface SplitEvent {
  scheme_code:   number
  split_date:    string   // ISO date of the day the drop occurred (new NAV date)
  ratio:         number   // new_nav / old_nav  (< 1 for typical splits)
  auto_detected: boolean
  notes?:        string
}

/** Any single-day drop exceeding this is flagged as a split, not a market move */
const SPLIT_DROP_THRESHOLD = 0.5   // ratio < 0.5  → NAV halved (very unusual for markets)

/**
 * Detect NAV splits in a chronologically-sorted history array.
 * Returns splits ordered oldest → newest.
 */
export function detectSplits(history: NavRow[], schemeCode: number): SplitEvent[] {
  const splits: SplitEvent[] = []

  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].nav
    const curr = history[i].nav
    if (prev <= 0 || curr <= 0) continue

    const ratio = curr / prev
    if (ratio < SPLIT_DROP_THRESHOLD) {
      splits.push({
        scheme_code:   schemeCode,
        split_date:    history[i].date,
        ratio,
        auto_detected: true,
        notes: `NAV dropped from ${prev.toFixed(4)} to ${curr.toFixed(4)} (ratio ${ratio.toFixed(6)})`,
      })
    }
  }

  return splits
}

/**
 * Compute adjusted NAVs for each point in history, given the set of splits.
 *
 * Logic: for each historical point, multiply by every split ratio whose
 * split_date is AFTER that point. This brings old NAVs down to the same
 * scale as current NAVs, preserving relative returns.
 *
 * Returns an array of nav_adj values, same length as history (in-order).
 */
export function normalizeHistory(history: NavRow[], splits: SplitEvent[]): number[] {
  if (splits.length === 0) return history.map(h => h.nav)

  // Sort splits oldest → newest (applied left to right as we scan history)
  const sorted = [...splits].sort((a, b) => a.split_date.localeCompare(b.split_date))

  return history.map(point => {
    let nav = point.nav
    // Multiply by every split that happened AFTER this date
    for (const s of sorted) {
      if (point.date < s.split_date) {
        nav = nav * s.ratio
      }
    }
    return Math.round(nav * 10000) / 10000  // 4 decimal places
  })
}

// ── Metric helpers (operate on normalized NAVs) ───────────────────────────────

export function cagrPct(navStart: number, navEnd: number, years: number): number | null {
  if (!navStart || !navEnd || navStart <= 0 || years <= 0) return null
  return (Math.pow(navEnd / navStart, 1 / years) - 1) * 100
}

function dateMinusYears(iso: string, years: number): string {
  const d = new Date(iso)
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

/** Find the NAV closest to targetDate within ±25 trading days */
function findNavAround(history: NavRow[], targetDate: string): NavRow | null {
  const targetMs = new Date(targetDate).getTime()
  let closest: NavRow | null = null
  let minDiff = Infinity
  for (const row of history) {
    const diff = Math.abs(new Date(row.date).getTime() - targetMs)
    if (diff < minDiff) { minDiff = diff; closest = row }
  }
  return minDiff <= 25 * 86_400_000 ? closest : null
}

export interface FundMetrics {
  cagr_inception: number | null
  total_return:   number | null
  return_1y:      number | null
  return_3y:      number | null
  return_5y:      number | null
  volatility:     number | null
  max_drawdown:   number | null
  sharpe:         number | null
}

export interface FYRow {
  fy:        string
  startDate: string
  startNav:  number
  endDate:   string
  endNav:    number
  returnPct: number
  isLive:    boolean
}

/**
 * Compute all performance metrics from a normalized (split-adjusted) history.
 * history must be sorted chronologically (oldest first).
 */
export function computeMetrics(history: NavRow[]): FundMetrics {
  if (history.length < 2) {
    return { cagr_inception: null, total_return: null, return_1y: null,
             return_3y: null, return_5y: null, volatility: null,
             max_drawdown: null, sharpe: null }
  }

  const latest      = history[history.length - 1]
  const inception   = history[0]
  const latestNav   = latest.nav
  const latestDate  = latest.date
  const inceptionNav = inception.nav

  const yearsTotal = (new Date(latestDate).getTime() - new Date(inception.date).getTime()) / (365.25 * 86_400_000)

  const cagr_inception = yearsTotal >= 0.5 ? cagrPct(inceptionNav, latestNav, yearsTotal) : null
  const total_return   = ((latestNav - inceptionNav) / inceptionNav) * 100

  const nav1y = findNavAround(history, dateMinusYears(latestDate, 1))
  const nav3y = findNavAround(history, dateMinusYears(latestDate, 3))
  const nav5y = findNavAround(history, dateMinusYears(latestDate, 5))

  // Annualised volatility from daily log-returns
  const dailyReturns: number[] = []
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1].nav
    const curr = history[i].nav
    if (prev > 0 && curr > 0) dailyReturns.push((curr - prev) / prev)
  }

  let volatility: number | null = null
  if (dailyReturns.length > 30) {
    const mean     = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
    const variance = dailyReturns.reduce((a, b) => a + (b - mean) ** 2, 0) / dailyReturns.length
    volatility = Math.sqrt(variance) * Math.sqrt(252) * 100
  }

  // Max drawdown (peak-to-trough)
  let max_drawdown: number | null = null
  if (history.length > 30) {
    let peak = history[0].nav
    let maxDD = 0
    for (const row of history) {
      if (row.nav > peak) peak = row.nav
      const dd = (row.nav - peak) / peak
      if (dd < maxDD) maxDD = dd
    }
    max_drawdown = maxDD * 100
  }

  // Sharpe ratio (risk-free = 6% p.a.)
  const sharpe = (volatility !== null && cagr_inception !== null)
    ? (cagr_inception - 6) / volatility
    : null

  return {
    cagr_inception,
    total_return,
    return_1y: nav1y ? cagrPct(nav1y.nav, latestNav, 1) : null,
    return_3y: nav3y ? cagrPct(nav3y.nav, latestNav, 3) : null,
    return_5y: nav5y ? cagrPct(nav5y.nav, latestNav, 5) : null,
    volatility,
    max_drawdown,
    sharpe,
  }
}

/**
 * Compute Indian fiscal year (Apr → Mar) returns from normalized history.
 * Returns most-recent year first.
 */
export function computeFiscalYears(history: NavRow[]): FYRow[] {
  if (history.length < 5) return []
  try {
    const oldest = new Date(history[0].date)
    const latest = new Date(history[history.length - 1].date)
    const startFY = oldest.getMonth() >= 3 ? oldest.getFullYear() + 1 : oldest.getFullYear()
    const endFY   = latest.getMonth() >= 3 ? latest.getFullYear() + 1 : latest.getFullYear()

    const rows: FYRow[] = []
    for (let fy = startFY; fy <= endFY; fy++) {
      const fyStart = `${fy - 1}-04-01`
      const fyEnd   = `${fy}-03-31`
      const isLive  = new Date(fyEnd) > latest

      const startPt = findNavAround(history, fyStart)
      if (!startPt) continue
      const endPt = isLive
        ? history[history.length - 1]
        : findNavAround(history, fyEnd)
      if (!endPt) continue

      rows.push({
        fy:        `FY${String(fy).slice(2)}`,
        startDate: startPt.date,
        startNav:  startPt.nav,
        endDate:   endPt.date,
        endNav:    endPt.nav,
        returnPct: ((endPt.nav - startPt.nav) / startPt.nav) * 100,
        isLive,
      })
    }
    return rows.reverse() // most-recent first
  } catch {
    return []
  }
}
