export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/mf-load?offset=0&limit=20&secret=<CRON_SECRET>
 *
 * Initial data loader for mf_funds + mf_nav_data tables.
 * Fetches full NAV history since inception for each fund from mfapi.in.
 *
 * Call in a loop (e.g. via scripts/trigger_mf_load.sh) until all 257 funds
 * are loaded.  Idempotent — safe to re-run.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key if available (preferred for admin ops), otherwise fall back
// to anon key — works when RLS is disabled on mf_funds / mf_nav_data tables.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'your-service-role-key-here')
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
)

const MFAPI_BASE = 'https://api.mfapi.in/mf'

// ── Full fund list (257 funds) ────────────────────────────────────────────────

const FUND_NAMES: string[] = [
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

// ── Manual overrides (hard-to-match funds) ────────────────────────────────────

const MANUAL_OVERRIDES: Record<string, number> = {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalise for fuzzy comparison */
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

/** Dice-coefficient bigram similarity (equivalent to Python's difflib ratio) */
function similarity(a: string, b: string): number {
  const bigrams = (s: string) => {
    const set = new Set<string>()
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
    return set
  }
  const ba = bigrams(a), bb = bigrams(b)
  let common = 0
  for (const bg of ba) if (bb.has(bg)) common++
  if (ba.size + bb.size === 0) return 0
  return (2 * common) / (ba.size + bb.size)
}

function buildSearchQuery(name: string): string {
  return name
    .replace(/\s*\(Post Addendum\)\s*$/i, '')
    .replace(/\s*\(G\)\s*$/i, '')
    .replace(/\s*-\s*Reg\s*$/i, '')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .replace(/\d+:\d+:\d+/g, '')
    .replace(/\s+/g, ' ').trim()
}

function expandAbbr(name: string): string {
  return name
    .replace(/\bICICI Pru\b/gi, 'ICICI Prudential')
    .replace(/\bAditya Birla SL\b/gi, 'Aditya Birla Sun Life')
    .replace(/\bLIC MF\b/gi, 'LIC Mutual Fund')
}

async function searchMfapi(query: string): Promise<Array<{ schemeCode: number; schemeName: string }>> {
  try {
    const res = await fetch(`${MFAPI_BASE}/search?q=${encodeURIComponent(query)}`, {
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

function bestMatch(
  fundName: string,
  results: Array<{ schemeCode: number; schemeName: string }>
): { schemeCode: number; schemeName: string; ratio: number } | null {
  const normTarget = normalize(fundName)
  let best = { schemeCode: 0, schemeName: '', ratio: 0 }
  for (const r of results) {
    const ratio = similarity(normTarget, normalize(r.schemeName))
    if (ratio > best.ratio) best = { schemeCode: r.schemeCode, schemeName: r.schemeName, ratio }
  }
  return best.ratio >= 0.65 ? best : null
}

async function resolveSchemeCode(
  fundName: string
): Promise<{ schemeCode: number; schemeName: string; via: string } | null> {
  // 1. Manual override
  if (MANUAL_OVERRIDES[fundName]) {
    return { schemeCode: MANUAL_OVERRIDES[fundName], schemeName: fundName, via: 'override' }
  }

  // 2. Direct search
  const q1 = buildSearchQuery(fundName)
  let results = await searchMfapi(q1)
  let match = bestMatch(fundName, results)
  if (match) return { ...match, via: 'search' }

  // 3. Expanded abbreviations
  const q2 = buildSearchQuery(expandAbbr(fundName))
  if (q2 !== q1) {
    results = await searchMfapi(q2)
    match = bestMatch(fundName, results)
    if (match) return { ...match, via: 'search-expanded' }
  }

  // 4. Shorter query (first 5 words)
  const q3 = expandAbbr(fundName).split(/\s+/).slice(0, 5).join(' ')
  results = await searchMfapi(q3)
  match = bestMatch(fundName, results)
  if (match) return { ...match, via: 'search-short' }

  return null
}

interface MfapiRow { date: string; nav: string }

function mfapiDateToISO(s: string): string {
  const p = s.trim().split('-')
  if (p.length !== 3) return ''
  const [dd, p2, yyyy] = p
  // mfapi.in uses DD-MM-YYYY (numeric months: "22-03-2026")
  if (/^\d{2}$/.test(dd) && /^\d{2}$/.test(p2) && /^\d{4}$/.test(yyyy)) {
    return `${yyyy}-${p2}-${dd}`
  }
  // Fallback: DD-Mon-YYYY abbreviated month ("22-Mar-2026")
  const MONTHS: Record<string, string> = {
    Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
    Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12',
  }
  const mm = MONTHS[p2]
  if (!mm) return ''
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
}

async function fetchFullHistory(
  schemeCode: number
): Promise<Array<{ date: string; nav: number }>> {
  try {
    const res = await fetch(`${MFAPI_BASE}/${schemeCode}`, {
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return []
    const json = await res.json() as { status: string; data: MfapiRow[]; meta: Record<string, string> }
    if (json.status !== 'SUCCESS' || !json.data) return []
    return json.data
      .map((r) => ({ date: mfapiDateToISO(r.date), nav: parseFloat(r.nav) }))
      .filter((r) => r.date.length === 10 && !isNaN(r.nav) && r.nav > 0)
  } catch {
    return []
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const provided = req.nextUrl.searchParams.get('secret') ??
    (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  if (secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const offset = parseInt(req.nextUrl.searchParams.get('offset') ?? '0', 10)
  const limit  = parseInt(req.nextUrl.searchParams.get('limit')  ?? '20', 10)

  const batch = FUND_NAMES.slice(offset, offset + limit)
  if (batch.length === 0) {
    return NextResponse.json({ ok: true, message: 'All funds processed', total: FUND_NAMES.length })
  }

  const log: string[] = []
  log.push(`[mf-load] offset=${offset} limit=${limit} — processing ${batch.length} funds (${offset+1}–${offset+batch.length} of ${FUND_NAMES.length})`)

  // ── Ensure tables exist ────────────────────────────────────────────────────
  // We rely on mfapi_loader.py having created them; if not, return an error.
  const { error: tableCheck } = await supabase.from('mf_funds').select('scheme_code').limit(1)
  if (tableCheck) {
    return NextResponse.json({
      error: 'mf_funds table not found. Run: python scripts/mfapi_loader.py --search-only first, or create tables via Supabase SQL editor.',
      sql: `
CREATE TABLE IF NOT EXISTS mf_funds (
  scheme_code INTEGER PRIMARY KEY, scheme_name TEXT NOT NULL,
  fund_house TEXT, scheme_type TEXT, scheme_category TEXT,
  search_name TEXT, match_ratio NUMERIC(5,3), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS mf_nav_data (
  scheme_code INTEGER NOT NULL REFERENCES mf_funds(scheme_code) ON DELETE CASCADE,
  date DATE NOT NULL, nav NUMERIC(20,4) NOT NULL, PRIMARY KEY (scheme_code, date)
);
CREATE INDEX IF NOT EXISTS idx_mf_nav_scheme_date ON mf_nav_data(scheme_code, date);`
    }, { status: 500 })
  }

  // ── Get already-loaded search names to skip ────────────────────────────────
  const { data: alreadyLoaded } = await supabase
    .from('mf_funds')
    .select('search_name, scheme_code')
    .in('search_name', batch)

  const loadedNames = new Set((alreadyLoaded ?? []).map((r) => r.search_name))
  // Check which have NAV data
  const loadedCodes = (alreadyLoaded ?? []).map((r) => r.scheme_code)
  const { data: navCheck } = loadedCodes.length
    ? await supabase.from('mf_nav_data').select('scheme_code').in('scheme_code', loadedCodes).limit(loadedCodes.length)
    : { data: [] }
  const codesWithNav = new Set((navCheck ?? []).map((r) => r.scheme_code))
  const loadedNamesWithNav = new Set(
    (alreadyLoaded ?? []).filter((r) => codesWithNav.has(r.scheme_code)).map((r) => r.search_name)
  )

  let inserted = 0
  let skipped  = 0
  let failed   = 0

  for (const fundName of batch) {
    if (loadedNamesWithNav.has(fundName)) {
      log.push(`  SKIP  ${fundName}`)
      skipped++
      continue
    }

    // ── Resolve scheme code ────────────────────────────────────────────────
    const resolved = await resolveSchemeCode(fundName)
    if (!resolved) {
      log.push(`  FAIL  ${fundName} — not found on mfapi.in`)
      failed++
      continue
    }

    const { schemeCode, schemeName, via } = resolved
    log.push(`  FOUND [${schemeCode}] ${schemeName} (${via})`)

    // ── Fetch full history ─────────────────────────────────────────────────
    const history = await fetchFullHistory(schemeCode)
    if (!history.length) {
      log.push(`        → no NAV data returned`)
      failed++
      continue
    }

    // ── Fetch meta for fund house / category ───────────────────────────────
    let meta: Record<string, string> = {}
    try {
      const metaRes = await fetch(`${MFAPI_BASE}/${schemeCode}/latest`, { signal: AbortSignal.timeout(8_000) })
      if (metaRes.ok) {
        const metaJson = await metaRes.json() as { meta?: Record<string, string> }
        meta = metaJson.meta ?? {}
      }
    } catch { /* ignore */ }

    // ── Upsert fund metadata ───────────────────────────────────────────────
    await supabase.from('mf_funds').upsert({
      scheme_code:     schemeCode,
      scheme_name:     schemeName,
      fund_house:      meta['fund_house']      ?? '',
      scheme_type:     meta['scheme_type']     ?? '',
      scheme_category: meta['scheme_category'] ?? '',
      search_name:     fundName,
      match_ratio:     resolved.via === 'override' ? 1.0 : (resolved as any).ratio ?? null,
    }, { onConflict: 'scheme_code' })

    // ── Upsert NAV rows in 500-row chunks ──────────────────────────────────
    const CHUNK = 500
    let rows_inserted = 0
    for (let i = 0; i < history.length; i += CHUNK) {
      const chunk = history.slice(i, i + CHUNK).map((r) => ({
        scheme_code: schemeCode,
        date:        r.date,
        nav:         r.nav,
      }))
      const { error } = await supabase
        .from('mf_nav_data')
        .upsert(chunk, { onConflict: 'scheme_code,date' })
      if (!error) rows_inserted += chunk.length
    }

    const oldest = history[history.length - 1].date
    const newest = history[0].date
    log.push(`        → ${rows_inserted} rows  (${oldest} → ${newest})`)
    inserted += rows_inserted
  }

  const nextOffset = offset + limit
  const hasMore    = nextOffset < FUND_NAMES.length

  log.push(`\nBatch done — inserted ${inserted} rows | skipped ${skipped} | failed ${failed}`)
  if (hasMore) log.push(`Next: ?offset=${nextOffset}&limit=${limit}&secret=<secret>`)

  return NextResponse.json({
    ok: true,
    offset,
    limit,
    processed: batch.length,
    inserted,
    skipped,
    failed,
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
    total: FUND_NAMES.length,
    log,
  })
}
