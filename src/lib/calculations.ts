// Portfolio computation engine - matches Excel workbook logic exactly

export interface NavPoint {
  date: string
  value: number
}

export interface PortfolioMetrics {
  cagr: number
  volatility: number
  sharpe: number
  maxDrawdown: number
  calmar: number
  sortino: number
  totalReturn: number
  startDate: string
  endDate: string
}

export interface RollingReturn {
  date: string
  value: number
}

export interface DrawdownPoint {
  date: string
  value: number
}

// Compute weighted portfolio NAV series from individual fund NAV series
export function computePortfolioNav(
  fundNavs: { fundId: number; weight: number; navSeries: NavPoint[] }[]
): NavPoint[] {
  if (fundNavs.length === 0) return []

  // Find common dates
  const dateSet = new Set<string>(fundNavs[0].navSeries.map((n) => n.date))
  for (const fund of fundNavs) {
    const fundDates = new Set(fund.navSeries.map((n) => n.date))
    for (const d of dateSet) {
      if (!fundDates.has(d)) dateSet.delete(d)
    }
  }

  const commonDates = Array.from(dateSet).sort()
  if (commonDates.length === 0) return []

  // Build lookup maps
  const navMaps = fundNavs.map((fund) => {
    const map = new Map<string, number>()
    fund.navSeries.forEach((n) => map.set(n.date, n.value))
    return { weight: fund.weight, map }
  })

  // Rebase each fund to 100 on the first common date and compute weighted NAV
  const firstDate = commonDates[0]
  const basePrices = navMaps.map((f) => f.map.get(firstDate)!)

  const portfolioNav: NavPoint[] = commonDates.map((date) => {
    let portValue = 0
    navMaps.forEach((fund, i) => {
      const price = fund.map.get(date)!
      const rebased = (price / basePrices[i]) * 100
      portValue += (fund.weight / 100) * rebased
    })
    return { date, value: portValue }
  })

  return portfolioNav
}

// CAGR = (end/start)^(1/years) - 1
export function computeCAGR(navSeries: NavPoint[]): number {
  if (navSeries.length < 2) return 0
  const start = navSeries[0].value
  const end = navSeries[navSeries.length - 1].value
  const startDate = new Date(navSeries[0].date)
  const endDate = new Date(navSeries[navSeries.length - 1].date)
  const years = (endDate.getTime() - startDate.getTime()) / (365 * 24 * 3600 * 1000)
  if (years <= 0) return 0
  return Math.pow(end / start, 1 / years) - 1
}

// Annualized volatility = std dev of daily returns * sqrt(252)
export function computeVolatility(navSeries: NavPoint[]): number {
  if (navSeries.length < 2) return 0
  const dailyReturns: number[] = []
  for (let i = 1; i < navSeries.length; i++) {
    const ret = navSeries[i].value / navSeries[i - 1].value - 1
    dailyReturns.push(ret)
  }
  const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (dailyReturns.length - 1)
  return Math.sqrt(variance) * Math.sqrt(252)
}

// Max Drawdown = maximum peak-to-trough decline
export function computeMaxDrawdown(navSeries: NavPoint[]): number {
  if (navSeries.length === 0) return 0
  let maxDD = 0
  let peak = navSeries[0].value
  for (const point of navSeries) {
    if (point.value > peak) peak = point.value
    const dd = (point.value - peak) / peak
    if (dd < maxDD) maxDD = dd
  }
  return maxDD
}

// Drawdown series for charting
export function computeDrawdownSeries(navSeries: NavPoint[]): DrawdownPoint[] {
  const result: DrawdownPoint[] = []
  let peak = navSeries[0]?.value ?? 0
  for (const point of navSeries) {
    if (point.value > peak) peak = point.value
    const dd = peak > 0 ? (point.value - peak) / peak : 0
    result.push({ date: point.date, value: dd * 100 })
  }
  return result
}

// Rolling 3-year CAGR (756 trading days window)
export function computeRolling3YCAGR(navSeries: NavPoint[]): RollingReturn[] {
  const WINDOW = 756 // ~3 years of trading days
  const result: RollingReturn[] = []
  for (let i = WINDOW; i < navSeries.length; i++) {
    const start = navSeries[i - WINDOW]
    const end = navSeries[i]
    const years = 3
    const cagr = Math.pow(end.value / start.value, 1 / years) - 1
    result.push({ date: end.date, value: cagr * 100 })
  }
  return result
}

// Sortino ratio (downside deviation)
export function computeSortino(navSeries: NavPoint[], riskFreeRate = 0.06): number {
  if (navSeries.length < 2) return 0
  const dailyRF = riskFreeRate / 252
  const dailyReturns: number[] = []
  for (let i = 1; i < navSeries.length; i++) {
    dailyReturns.push(navSeries[i].value / navSeries[i - 1].value - 1)
  }
  const downside = dailyReturns.filter((r) => r < dailyRF)
  if (downside.length === 0) return 999
  const downsideVariance = downside.reduce((a, r) => a + Math.pow(r - dailyRF, 2), 0) / dailyReturns.length
  const downsideDevAnnualized = Math.sqrt(downsideVariance) * Math.sqrt(252)
  const cagr = computeCAGR(navSeries)
  return downsideDevAnnualized > 0 ? (cagr - riskFreeRate) / downsideDevAnnualized : 0
}

// Full metrics computation
export function computeAllMetrics(navSeries: NavPoint[]): PortfolioMetrics {
  const cagr = computeCAGR(navSeries)
  const vol = computeVolatility(navSeries)
  const maxDD = computeMaxDrawdown(navSeries)
  const sharpe = vol > 0 ? (cagr - 0.06) / vol : 0
  const calmar = maxDD !== 0 ? cagr / Math.abs(maxDD) : 0
  const sortino = computeSortino(navSeries)
  const totalReturn = navSeries.length > 1
    ? (navSeries[navSeries.length - 1].value / navSeries[0].value - 1) * 100
    : 0

  return {
    cagr,
    volatility: vol,
    sharpe,
    maxDrawdown: maxDD,
    calmar,
    sortino,
    totalReturn,
    startDate: navSeries[0]?.date ?? '',
    endDate: navSeries[navSeries.length - 1]?.date ?? '',
  }
}
