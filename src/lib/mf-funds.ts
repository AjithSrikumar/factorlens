/**
 * Shared fund-name list and mfapi.in scheme-code discovery.
 * Fetches the full mfapi.in scheme directory once, fuzzy-matches it against
 * FUND_NAMES, and caches the results for 24 hours via Next.js fetch cache.
 *
 * This means the funds list page works with ZERO database setup.
 */

const MFAPI_BASE = 'https://api.mfapi.in/mf'

// ── Canonical fund names ──────────────────────────────────────────────────────

export const FUND_NAMES: string[] = [
  "UTI Nifty 50 Index Fund-Reg(G)",
  "HDFC Nifty 50 Index Fund(G)(Post Addendum)",
  "SBI Gold-Reg(G)",
  "ICICI Pru Nifty 50 Index Fund-Reg(G)",
  "SBI Nifty Index Fund-Reg(G)",
  "HDFC Gold ETF FoF(G)",
  "HDFC BSE Sensex Index Fund(G)(Post Addendum)",
  "UTI Nifty200 Momentum 30 Index Fund-Reg(G)",
  "ICICI Pru Nifty Next 50 Index Fund(G)",
  "Nippon India Gold Savings Fund(G)",
  "Kotak Gold Fund(G)",
  "ICICI Pru Gold ETF FOF(G)",
  "UTI Nifty Next 50 Index Fund-Reg(G)",
  "HDFC Silver ETF FoF-Reg(G)",
  "Motilal Oswal Nifty India Defence Index Fund-Reg(G)",
  "Navi Nifty 50 Index Fund-Reg(G)",
  "Nippon India Index Fund-Nifty 50 Plan(G)",
  "Motilal Oswal Nifty Midcap 150 Index Fund-Reg(G)",
  "Axis Gold Fund-Reg(G)",
  "Motilal Oswal Nifty 500 Index Fund-Reg(G)",
  "Nippon India Nifty Smallcap 250 Index Fund-Reg(G)",
  "Motilal Oswal Gold and Silver Passive FoF-Reg(G)",
  "DSP Nifty 50 Equal Weight Index Fund-Reg(G)",
  "Motilal Oswal Nifty Microcap 250 Index Fund-Reg(G)",
  "HDFC NIFTY Next 50 Index Fund-Reg(G)",
  "Bandhan Nifty 50 Index Fund-Reg(G)",
  "Nippon India Nifty Midcap 150 Index Fund-Reg(G)",
  "ICICI Pru PSU Equity Fund-Reg(G)",
  "Axis Nifty 100 Index Fund-Reg(G)",
  "SBI Nifty Next 50 Index Fund-Reg(G)",
  "ICICI Pru BSE Sensex Index Fund(G)",
  "Bandhan Nifty100 Low Volatility 30 Index Fund-Reg(G)",
  "Aditya Birla SL Gold Fund-Reg(G)",
  "Motilal Oswal BSE Enhanced Value Index Fund-Reg(G)",
  "HDFC NIFTY50 Equal Weight Index Fund-Reg(G)",
  "Tata NIFTY 50 Index Fund-Reg(G)",
  "Edelweiss Nifty Midcap150 Momentum 50 Index Fund-Reg(G)",
  "SBI Nifty Smallcap 250 Index Fund-Reg(G)",
  "Nippon India Nifty Alpha Low Volatility 30 Index Fund(G)",
  "UTI Gold ETF FoF-Reg(G)",
  "DSP Nifty Top 10 Equal Weight Index Fund-Reg(G)",
  "Aditya Birla SL Nifty 50 Index Fund-Reg(G)",
  "Axis Silver FoF-Reg(G)",
  "DSP NIFTY Next 50 Index Fund-Reg(G)",
  "Navi Nifty Next 50 Index Fund-Reg(G)",
  "Nippon India Nifty 500 Momentum 50 Index Fund-Reg(G)",
  "Kotak Gold Silver Passive FOF-Reg(G)",
  "Tata Nifty Midcap 150 Momentum 50 Index Fund-Reg(G)",
  "SBI Nifty50 Equal Weight Index Fund-Reg(G)",
  "Kotak Nifty 50 Index Fund-Reg(G)",
  "Nippon India Nifty 50 Value 20 Index Fund-Reg(G)",
  "Motilal Oswal Nifty Smallcap 250 Index Fund-Reg(G)",
  "Kotak Silver ETF FoF-Reg(G)",
  "DSP NIFTY 50 Index Fund-Reg(G)",
  "Motilal Oswal Nifty 200 Momentum 30 Index Fund-Reg(G)",
  "SBI Nifty Midcap 150 Index Fund-Reg(G)",
  "ICICI Pru Nifty Midcap 150 Index Fund-Reg(G)",
  "Nippon India Index Fund-BSE Sensex Plan(G)",
  "Kotak Nifty Next 50 Index Fund-Reg(G)",
  "Aditya Birla SL Nifty India Defence Index Fund-Reg(G)",
  "Motilal Oswal Nifty 50 Index Fund-Reg(G)",
  "Axis Nifty 50 Index Fund-Reg(G)",
  "LIC MF Gold ETF FoF(G)",
  "SBI Nifty 500 Index Fund-Reg(G)",
  "Franklin India NSE Nifty 50 Index Fund(G)",
  "Motilal Oswal Nifty 500 Momentum 50 Index Fund-Reg(G)",
  "ICICI Pru Nifty Bank Index Fund-Reg(G)",
  "Motilal Oswal Nifty Bank Index Fund-Reg(G)",
  "Navi Nifty Bank Index Fund-Reg(G)",
  "HDFC NIFTY200 Momentum 30 Index Fund-Reg(G)",
  "UTI Nifty 500 Value 50 Index Fund-Reg(G)",
  "UTI Nifty200 Quality 30 Index Fund-Reg(G)",
  "Axis Nifty Midcap 50 Index Fund-Reg(G)",
  "ICICI Pru Nifty Smallcap 250 Index Fund(G)",
  "Axis Gold and Silver Passive FoF-Reg(G)",
  "ICICI Pru Nifty 200 Momentum 30 Index Fund-Reg(G)",
  "HDFC NIFTY Smallcap 250 Index Fund-Reg(G)",
  "Axis Nifty Smallcap 50 Index Fund-Reg(G)",
  "DSP Gold ETF FoF-Reg(G)",
  "UTI BSE Low Volatility Index Fund-Reg(G)",
  "Edelweiss Nifty500 Multicap Momentum Quality 50 Index Fund-Reg(G)",
  "Bandhan Nifty Alpha 50 Index Fund-Reg(G)",
  "ICICI Pru Nifty IT Index Fund-Reg(G)",
  "Quantum Gold Saving Fund-Reg(G)",
  "HDFC NIFTY Midcap 150 Index Fund-Reg(G)",
  "Kotak Nifty 200 Momentum 30 Index Fund-Reg(G)",
  "Tata Nifty Capital Markets Index Fund-Reg(G)",
  "Invesco India Gold ETF FoF-Reg(G)",
  "Aditya Birla SL Nifty 50 Equal Weight Index Fund-Reg(G)",
  "DSP Nifty Midcap 150 Quality 50 Index Fund-Reg(G)",
  "Axis Nifty Next 50 Index Fund-Reg(G)",
  "HDFC Nifty500 Multicap 50:25:25 Index Fund-Reg(G)",
  "Motilal Oswal Nifty Next 50 Index Fund-Reg(G)",
  "Aditya Birla SL Nifty Midcap 150 Index Fund-Reg(G)",
  "HDFC Nifty LargeMidcap 250 Index Fund-Reg(G)",
  "HDFC NIFTY 100 Equal Weight Index Fund-Reg(G)",
  "HDFC NIFTY 100 Index Fund-Reg(G)",
  "Tata BSE Sensex Index Fund-Reg(G)",
  "Nippon India Nifty 500 Equal Weight Index Fund-Reg(G)",
  "HSBC Nifty 50 Index Fund-Reg(G)",
  "Navi Nifty Midcap 150 Index Fund-Reg(G)",
  "LIC MF Nifty 50 Index Fund(G)",
  "Motilal Oswal Nifty Capital Market Index Fund-Reg(G)",
  "Groww Nifty Total Market Index Fund-Reg(G)",
  "Edelweiss NIFTY Large Mid Cap 250 Index Fund-Reg(G)",
  "Kotak NIFTY Midcap 150 Momentum 50 Index Fund-Reg(G)",
  "Axis Nifty 500 Index Fund-Reg(G)",
  "SBI BSE Sensex Index Fund-Reg(G)",
  "SBI Nifty200 Quality 30 Index Fund-Reg(G)",
  "SBI BSE PSU Bank Index Fund-Reg(G)",
  "DSP Nifty Smallcap250 Quality 50 Index Fund-Reg(G)",
  "SBI Nifty India Consumption Index Fund-Reg(G)",
  "HDFC BSE 500 Index Fund-Reg(G)",
  "Edelweiss Nifty 50 Index Fund-Reg(G)",
  "Tata Nifty India Tourism Index Fund-Reg(G)",
  "HDFC NIFTY100 Low Volatility 30 Index Fund-Reg(G)",
  "Aditya Birla SL Nifty Smallcap 50 Index Fund-Reg(G)",
  "ICICI Pru Nifty LargeMidcap 250 Index Fund-Reg(G)",
  "Aditya Birla SL Nifty Next 50 Index Fund-Reg(G)",
  "UTI Nifty Midcap 150 Quality 50 Index Fund-Reg(G)",
  "Bandhan Nifty 100 Index Fund-Reg(G)",
  "Tata Nifty Midcap 150 Index Fund-Reg(G)",
  "Tata BSE Select Business Groups Index Fund-Reg(G)",
  "UTI Nifty Private Bank Index Fund-Reg(G)",
  "Edelweiss Nifty Next 50 Index Fund-Reg(G)",
  "ICICI Pru Nifty50 Equal Weight Index Fund-Reg(G)",
  "UTI BSE Sensex Index Fund-Reg(G)",
  "ICICI Pru Nifty200 Value 30 Index Fund-Reg(G)",
  "Tata Nifty200 Alpha 30 Index Fund-Reg(G)",
  "Edelweiss Nifty Smallcap 250 Index Fund-Reg(G)",
  "HDFC BSE India Sector Leaders Index Fund-Reg(G)",
  "Nippon India Nifty Bank Index Fund-Reg(G)",
  "Nippon India Nifty IT Index Fund-Reg(G)",
  "Kotak Nifty Smallcap 50 Index Fund-Reg(G)",
  "Edelweiss MSCI India Domestic & World Healthcare 45 Index Fund-Reg(G)",
  "Union Gold ETF FoF-Reg(G)",
  "HDFC Nifty India Consumption Index Fund-Reg(G)",
  "Tata Nifty MidSmall Healthcare Index Fund-Reg(G)",
  "Bandhan Silver ETF FOF-Reg(G)",
  "HDFC Nifty100 Quality 30 Index Fund-Reg(G)",
  "Axis Nifty Bank Index Fund-Reg(G)",
  "HSBC Nifty Next 50 Index Fund-Reg(G)",
  "Axis Nifty500 Value 50 Index Fund-Reg(G)",
  "SBI Nifty Bank Index Fund-Reg(G)",
  "Edelweiss Nifty 100 Quality 30 Index Fund-Reg(G)",
  "HDFC Nifty India Digital Index Fund-Reg(G)",
  "Sundaram Nifty 100 Equal Weight Fund(G)",
  "Bandhan Nifty200 Momentum 30 Index Fund-Reg(G)",
  "Kotak NIFTY 100 Low Volatility 30 Index Fund-Reg(G)",
  "DSP Nifty500 Flexicap Quality 30 Index Fund-Reg(G)",
  "Bandhan Gold ETF FOF-Reg(G)",
  "UTI NIFTY50 Equal Weight Index Fund-Reg(G)",
  "Axis Nifty500 Momentum 50 Index Fund-Reg(G)",
  "Tata Nifty500 Multicap India Manufacturing 50:30:20 Index Fund-Reg(G)",
  "Edelweiss Silver ETF FoF-Reg(G)",
  "Axis NIFTY IT Index Fund-Reg(G)",
  "Edelweiss Nifty Alpha Low Volatility 30 Index Fund-Reg(G)",
  "Groww Nifty Smallcap 250 Index Fund-Reg(G)",
  "Groww Gold ETF FOF-Reg(G)",
  "SBI Nifty200 Momentum 30 Index Fund-Reg(G)",
  "Tata Nifty Next 50 Index Fund-Reg(G)",
  "Motilal Oswal BSE Low Volatility Index Fund-Reg(G)",
  "ICICI Pru Nifty50 Value 20 Index Fund-Reg(G)",
  "HDFC NIFTY Realty Index Fund-Reg(G)",
  "LIC MF Nifty Next 50 Index Fund(G)",
  "Kotak Nifty Financial Services Ex-Bank Index Fund-Reg(G)",
  "UTI Nifty Midsmallcap 400 Momentum Quality 100 Index Fund-Reg(G)",
  "Kotak BSE PSU Index Fund-Reg(G)",
  "LIC MF BSE Sensex Index Fund-Reg(G)",
  "HDFC Nifty Top 20 Equal Weight Index Fund-Reg(G)",
  "Motilal Oswal Nifty MidSmall Financial Services Index Fund-Reg(G)",
  "SBI Nifty IT Index Fund-Reg(G)",
  "Nippon India BSE Sensex Next 30 Index Fund-Reg(G)",
  "Tata Nifty Financial Services Index Fund-Reg(G)",
  "Tata Nifty500 Multicap Infrastructure 50:30:20 Index Fund-Reg(G)",
  "UTI Nifty Alpha Low-Volatility 30 Index Fund-Reg(G)",
  "Axis Nifty500 Quality 50 Index Fund-Reg(G)",
  "Navi Nifty India Manufacturing Index Fund-Reg(G)",
  "ICICI Pru Nifty 500 Index Fund-Reg(G)",
  "Aditya Birla SL BSE 500 Quality 50 Index Fund-Reg(G)",
  "UTI Nifty500 Shariah Index Fund-Reg(G)",
  "Kotak NIFTY Midcap 50 Index Fund-Reg(G)",
  "Aditya Birla SL BSE 500 Momentum 50 Index Fund-Reg(G)",
  "SBI Nifty100 Low Volatility 30 Index Fund-Reg(G)",
  "Baroda BNP Paribas Nifty 50 Index Fund-Reg(G)",
  "UTI Nifty Midcap 150 Index Fund-Reg(G)",
  "Bandhan Nifty Smallcap 250 Index Fund-Reg(G)",
  "DSP Nifty Private Bank Index Fund-Reg(G)",
  "DSP Nifty Bank Index Fund-Reg(G)",
  "Motilal Oswal BSE Quality Index Fund-Reg(G)",
  "DSP Nifty IT Index Fund-Reg(G)",
  "Motilal Oswal BSE 1000 Index Fund-Reg(G)",
  "Angel One Nifty Total Market Index Fund-Reg(G)",
  "Mirae Asset Nifty 50 Index Fund-Reg(G)",
  "Tata BSE Quality Index Fund-Reg(G)",
  "Kotak Nifty 50 Equal Weight Index Fund-Reg(G)",
  "Axis BSE Sensex Index Fund-Reg(G)",
  "Tata BSE Multicap Consumption 50:30:20 Index Fund-Reg(G)",
  "Mirae Asset Nifty Total Market Index Fund-Reg(G)",
  "Groww Nifty India Railways PSU Index Fund-Reg(G)",
  "Tata Nifty Realty Index Fund-Reg(G)",
  "Nippon India Nifty 500 Quality 50 Index Fund-Reg(G)",
  "Bajaj Finserv Nifty 50 Index Fund-Reg(G)",
  "Kotak Nifty Smallcap 250 Index Fund-Reg(G)",
  "Groww Nifty Non-Cyclical Consumer Index Fund-Reg(G)",
  "Bandhan Nifty Total Market Index Fund-Reg(G)",
  "Nippon India Nifty India Manufacturing Index Fund-Reg(G)",
  "Kotak Nifty 100 Equal Weight Index Fund-Reg(G)",
  "Axis BSE India Sector Leaders Index Fund-Reg(G)",
  "Nippon India Nifty Realty Index Fund-Reg(G)",
  "Mirae Asset Nifty LargeMidcap 250 Index Fund-Reg(G)",
  "Kotak Nifty Top 10 Equal Weight Index Fund-Reg(G)",
  "Motilal Oswal Nifty MidSmall IT and Telecom Index Fund-Reg(G)",
  "Angel One Nifty Total Market Momentum Quality 50 Index Fund-Reg(G)",
  "Kotak Nifty India Tourism Index Fund-Reg(G)",
  "Bandhan Nifty Midcap 150 Index Fund-Reg(G)",
  "Motilal Oswal BSE Financials ex Bank 30 Index Fund-Reg(G)",
  "Angel One Nifty 50 Index Fund-Reg(G)",
  "Angel One Gold ETF FOF-Reg(G)",
  "Bandhan Nifty 500 Momentum 50 Index Fund-Reg(G)",
  "ICICI Pru Nifty Top 15 Equal Weight Index Fund-Reg(G)",
  "Bandhan Nifty 500 Value 50 Index Fund-Reg(G)",
  "Motilal Oswal Nifty MidSmall Healthcare Index Fund-Reg(G)",
  "Nippon India Nifty 500 Low Volatility 50 Index Fund-Reg(G)",
  "Bandhan BSE India Sector Leaders Index Fund-Reg(G)",
  "Bandhan Nifty IT Index Fund-Reg(G)",
  "Bandhan Nifty Next 50 Index Fund-Reg(G)",
  "Navi Nifty 500 Multicap 50:25:25 Index Fund-Reg(G)",
  "Navi Nifty Smallcap250 Momentum Quality 100 Index Fund-Reg(G)",
  "Kotak Nifty Alpha 50 Index Fund-Reg(G)",
  "UTI BSE Housing Index Fund-Reg(G)",
  "Baroda BNP Paribas Nifty200 Momentum 30 Index Fund-Reg(G)",
  "ICICI Pru Nifty200 Quality 30 Index Fund-Reg(G)",
  "Motilal Oswal Nifty MidSmall India Consumption Index Fund-Reg(G)",
  "Kotak Nifty Midcap 150 Index Fund-Reg(G)",
  "Navi BSE Sensex Index Fund-Reg(G)",
  "Groww Nifty 50 Index Fund-Reg(G)",
  "Bandhan Nifty Bank Index Fund-Reg(G)",
  "ICICI Pru Nifty Private Bank Index Fund-Reg(G)",
  "Kotak Nifty500 Momentum 50 Index Fund-Reg(G)",
  "Bandhan BSE Healthcare Index Fund-Reg(G)",
  "Kotak BSE Sensex Index Fund-Reg(G)",
  "DSP BSE Sensex Next 30 Index Fund-Reg(G)",
  "Kotak Nifty 200 Quality 30 Index Fund-Reg(G)",
  "Kotak BSE Housing Index Fund-Reg(G)",
  "The Wealth Company Gold ETF FOF-Reg(G)",
  "Groww Nifty Midcap 150 Index Fund-Reg(G)",
  "Bandhan Nifty 200 Quality 30 Index Fund-Reg(G)",
  "Bandhan Nifty Alpha Low Volatility 30 Index Fund-Reg(G)",
  "DSP Nifty 500 Index Fund-Reg(G)",
  "Kotak Nifty200 Value 30 Index Fund-Reg(G)",
  "Navi Nifty MidSmallcap 400 Index Fund-Reg(G)",
  "DSP Nifty Midcap 150 Index Fund-Reg(G)",
  "DSP Nifty Smallcap 250 Index Fund-Reg(G)",
  "Baroda BNP Paribas NIFTY Midcap 150 Index Fund-Reg(G)",
  "Groww Nifty Next 50 Index Fund-Reg(G)",
  "Taurus Nifty 50 Index Fund-Reg(G)",
  "Groww Nifty PSU Bank Index Fund-Reg(G)",
]

// Known hard-coded overrides (scheme codes that don't match via search)
export const MANUAL_OVERRIDES: Record<string, number> = {
  "HDFC Gold ETF FoF(G)":                                    115934,
  "UTI Nifty200 Momentum 30 Index Fund-Reg(G)":              148704,
  "HDFC Silver ETF FoF-Reg(G)":                              150736,
  "Nippon India Index Fund-Nifty 50 Plan(G)":                113296,
  "UTI Gold ETF FoF-Reg(G)":                                 150715,
  "Axis Silver FoF-Reg(G)":                                  150617,
  "Kotak Silver ETF FoF-Reg(G)":                             151602,
  "Nippon India Index Fund-BSE Sensex Plan(G)":              113269,
  "LIC MF Gold ETF FoF(G)":                                  151973,
  "UTI Nifty200 Quality 30 Index Fund-Reg(G)":               152858,
  "DSP Gold ETF FoF-Reg(G)":                                 152182,
  "Invesco India Gold ETF FoF-Reg(G)":                       116077,
  "Edelweiss NIFTY Large Mid Cap 250 Index Fund-Reg(G)":     149341,
  "Navi Nifty 500 Multicap 50:25:25 Index Fund-Reg(G)":      152750,
  "Navi Nifty Smallcap250 Momentum Quality 100 Index Fund-Reg(G)": 153363,
  "Union Gold ETF FoF-Reg(G)":                               153338,
}

// ── Fuzzy matching helpers ────────────────────────────────────────────────────

function normalize(name: string): string {
  return name.toLowerCase()
    .replace(/\s*-\s*regular\s*(plan\s*)?-?\s*/g, ' ')
    .replace(/\s*-\s*growth\s*(option)?\s*/g, ' ')
    .replace(/\bgrowth\s+option\b/g, '')
    .replace(/\(g\)/g, '')
    .replace(/-reg\b/g, ' ')
    .replace(/\(post addendum\)/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

function similarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const ba = bigrams(a), bb = bigrams(b)
  let common = 0
  for (const bg of ba) if (bb.has(bg)) common++
  return (ba.size + bb.size === 0) ? 0 : (2 * common) / (ba.size + bb.size)
}

// ── Scheme code discovery ─────────────────────────────────────────────────────

export interface SchemeEntry {
  schemeCode: number
  schemeName: string
  fundName:   string   // our canonical FUND_NAMES entry
}

/**
 * Fetch ALL schemes from mfapi.in once and fuzzy-match against FUND_NAMES.
 * Result is cached by Next.js for 24 hours (next.revalidate = 86400).
 * Returns an array of matched scheme entries.
 */
export async function discoverSchemeEntries(): Promise<SchemeEntry[]> {
  // Fetch the full scheme directory from mfapi.in (~600KB, cached 24h)
  let allSchemes: Array<{ schemeCode: number; schemeName: string }> = []
  try {
    const res = await fetch(`${MFAPI_BASE}`, {
      signal: AbortSignal.timeout(30_000),
      next: { revalidate: 86400 }, // cache for 24 hours
    })
    if (res.ok) allSchemes = await res.json()
  } catch {
    // If fetch fails, fall back to manual overrides only
  }

  const entries: SchemeEntry[] = []

  for (const fundName of FUND_NAMES) {
    // Check manual overrides first
    if (MANUAL_OVERRIDES[fundName]) {
      entries.push({
        schemeCode: MANUAL_OVERRIDES[fundName],
        schemeName: fundName,
        fundName,
      })
      continue
    }

    if (allSchemes.length === 0) continue

    // Fuzzy match against all schemes
    const normTarget = normalize(fundName)
    let bestCode   = 0
    let bestName   = ''
    let bestScore  = 0

    for (const s of allSchemes) {
      const score = similarity(normTarget, normalize(s.schemeName))
      if (score > bestScore) {
        bestScore = score
        bestCode  = s.schemeCode
        bestName  = s.schemeName
      }
    }

    if (bestScore >= 0.60) {
      entries.push({ schemeCode: bestCode, schemeName: bestName, fundName })
    }
  }

  return entries
}
