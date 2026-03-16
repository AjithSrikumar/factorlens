import { NextResponse } from 'next/server'
import { discoverSchemeEntries } from '@/lib/mf-funds'
import { fetchViaProxy } from '@/lib/fetch-proxy'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'

const MFAPI_BASE = 'https://api.mfapi.in/mf'

// ── Per-fund cache keyed by scheme code — 30-min TTL ─────────────────────────
// NAV updates once per day; 30 min keeps data fresh without hammering mfapi.in.
const _cache = new Map<number, { data: FundRow; ts: number }>()
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

// ── Types ────────────────────────────────────────────────────────────────────

interface FundRow {
  scheme_code:     number
  scheme_name:     string
  fund_house:      string
  scheme_category: string
  nav:             number | null
  nav_date:        string | null
  return_1y:       number | null
  return_3y:       number | null
  return_5y:       number | null
  aum_cr:          null         // AMFI AUM not available via mfapi.in
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function mfapiDateToISO(s: string): string {
  const M: Record<string, string> = {
    Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
  }
  const parts = s.trim().split('-')
  if (parts.length !== 3) return ''
  const [dd, mon, yyyy] = parts
  // Numeric month (e.g. "03-03-2025")
  if (/^\d+$/.test(mon)) return `${yyyy}-${mon.padStart(2,'0')}-${dd.padStart(2,'0')}`
  // Abbreviated month name (e.g. "13-Mar-2026")
  const mm = M[mon] ?? ''
  if (!mm) return ''
  return `${yyyy}-${mm}-${dd.padStart(2,'0')}`
}

function dateMinusYears(iso: string, years: number): string {
  const d = new Date(iso)
  d.setFullYear(d.getFullYear() - years)
  return d.toISOString().slice(0, 10)
}

function cagrPct(navStart: number, navEnd: number, years: number): number | null {
  if (!navStart || !navEnd || navStart <= 0) return null
  return (Math.pow(navEnd / navStart, 1 / years) - 1) * 100
}

// ── Core batch fetch: full history → live NAV + 1Y/3Y/5Y returns ─────────────

async function fetchFundsBatch(codes: number[]): Promise<Map<number, FundRow>> {
  const result = new Map<number, FundRow>()
  const BATCH  = 20   // max parallel requests through proxy
  const now    = Date.now()

  for (let i = 0; i < codes.length; i += BATCH) {
    const batch   = codes.slice(i, i + BATCH)
    const settled = await Promise.allSettled(
      batch.map(async (code): Promise<FundRow | null> => {
        // Return from in-memory cache if still fresh
        const cached = _cache.get(code)
        if (cached && now - cached.ts < CACHE_TTL) return cached.data

        // Fetch full NAV history from mfapi.in
        let res: Response
        try {
          res = await fetchViaProxy(`${MFAPI_BASE}/${code}`, {
            signal: AbortSignal.timeout(30_000),
          })
        } catch {
          return null
        }
        if (!res.ok) return null

        const json = await res.json() as {
          status: string
          data:   Array<{ date: string; nav: string }>
          meta:   Record<string, string | number>
        }
        if (json.status !== 'SUCCESS' || !json.data?.length) return null

        // Parse history — mfapi.in returns newest-first
        type NavPt = { date: string; nav: number }
        const hist: NavPt[] = []
        for (const r of json.data) {
          const date = mfapiDateToISO(r.date)
          const nav  = parseFloat(r.nav)
          if (date && !isNaN(nav) && nav > 0) hist.push({ date, nav })
        }
        if (!hist.length) return null

        const latest = hist[0]   // newest entry

        // Find closest NAV to a target date (within ±30 days)
        const findNav = (target: string): number | null => {
          const tMs    = new Date(target).getTime()
          let best: NavPt | null = null
          let bestDiff = Infinity
          for (const h of hist) {
            const diff = Math.abs(new Date(h.date).getTime() - tMs)
            if (diff < bestDiff) { bestDiff = diff; best = h }
          }
          return best && bestDiff <= 30 * 86400000 ? best.nav : null
        }

        const nav1y = findNav(dateMinusYears(latest.date, 1))
        const nav3y = findNav(dateMinusYears(latest.date, 3))
        const nav5y = findNav(dateMinusYears(latest.date, 5))

        const row: FundRow = {
          scheme_code:     code,
          scheme_name:     String(json.meta['scheme_name']     ?? ''),
          fund_house:      String(json.meta['fund_house']      ?? ''),
          scheme_category: String(json.meta['scheme_category'] ?? ''),
          nav:             latest.nav,
          nav_date:        latest.date,
          return_1y:       nav1y ? cagrPct(nav1y, latest.nav, 1) : null,
          return_3y:       nav3y ? cagrPct(nav3y, latest.nav, 3) : null,
          return_5y:       nav5y ? cagrPct(nav5y, latest.nav, 5) : null,
          aum_cr:          null,
        }

        // Store in cache
        _cache.set(code, { data: row, ts: now })
        return row
      })
    )

    for (const r of settled) {
      if (r.status === 'fulfilled' && r.value) {
        result.set(r.value.scheme_code, r.value)
      }
    }
  }

  return result
}

// ── Main handler ──────────────────────────────────────────────────────────────

export async function GET() {
  try {
    // ── Path A: Supabase (fast — pre-computed metrics, normalized NAVs) ────────
    if (isSupabaseConfigured()) {
      const { data: sbFunds, error } = await supabaseAdmin
        .from('funds')
        .select('scheme_code, scheme_name, fund_house, scheme_category, nav, nav_date, return_1y, return_3y, return_5y')
        .not('last_nav_sync', 'is', null)
        .limit(500)

      if (!error && sbFunds && sbFunds.length > 0) {
        // Staleness check: if the most recent nav_date is older than 3 days,
        // fall through to mfapi.in so today's NAV is always reflected.
        const maxNavDate = sbFunds.reduce((max, f) =>
          f.nav_date && f.nav_date > max ? f.nav_date : max, '')
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 3)
        const cutoffStr = cutoff.toISOString().slice(0, 10)

        if (maxNavDate >= cutoffStr) {
          const result = sbFunds.map(f => ({ ...f, aum_cr: null }))
          return NextResponse.json(result, {
            headers: { 'Cache-Control': 'no-store' },
          })
        }
        // Supabase data is stale — fall through to live mfapi.in fetch
      }
    }

    // ── Path B: mfapi.in fallback (cold start or Supabase not configured) ─────
    // 1. Get the list of all 257 scheme entries (instant — pre-computed)
    const entries = await discoverSchemeEntries()

    if (entries.length === 0) {
      return NextResponse.json(
        { error: 'Could not find fund list. Try again shortly.' },
        { status: 503 }
      )
    }

    const codes = entries.map(e => e.schemeCode)

    // 2. Batch-fetch full history for all funds (cached 6h per fund)
    //    Each fetch returns live NAV + 1Y/3Y/5Y returns in one shot.
    const fundMap = await fetchFundsBatch(codes)

    // 3. Assemble result in original entry order
    const result: FundRow[] = entries.map(e => {
      const row = fundMap.get(e.schemeCode)
      if (row) return row
      // Fund not yet available from mfapi.in — return skeleton
      return {
        scheme_code:     e.schemeCode,
        scheme_name:     e.schemeName,
        fund_house:      '',
        scheme_category: '',
        nav:             null,
        nav_date:        null,
        return_1y:       null,
        return_3y:       null,
        return_5y:       null,
        aum_cr:          null,
      }
    })

    // 4. Sort: funds with live NAV first, then by 1Y return desc
    result.sort((a, b) => {
      if (a.nav !== null && b.nav === null) return -1
      if (a.nav === null && b.nav !== null) return  1
      // Both have NAV: sort by 1Y return descending (nulls last)
      const ar = a.return_1y ?? -Infinity
      const br = b.return_1y ?? -Infinity
      return br - ar
    })

    return NextResponse.json(result, {
      headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=1800' },
    })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
