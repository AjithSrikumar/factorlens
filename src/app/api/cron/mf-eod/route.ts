import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { discoverSchemeEntries } from '@/lib/mf-funds'

// Use service role key if available, otherwise fall back to anon key
// (works when RLS is disabled on mf_funds / mf_nav_data tables).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'your-service-role-key-here')
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const AMFI_NAV_URL = 'https://www.amfiindia.com/spages/NAVAll.txt'

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayIST(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function cagrPct(navStart: number, navEnd: number, years: number): number | null {
  if (!navStart || !navEnd || navStart <= 0 || navEnd <= 0) return null
  return (Math.pow(navEnd / navStart, 1 / years) - 1) * 100
}

/** '13-Mar-2026' → '2026-03-13'. Returns '' on failure. */
function mfapiDateToISO(s: string): string {
  const MONTHS: Record<string, string> = {
    Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
  }
  const parts = s.trim().split('-')
  if (parts.length !== 3) return ''
  const [dd, mon, yyyy] = parts
  const mm = MONTHS[mon]
  if (!mm) return ''
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
}

// ── AMFI NAV fetcher ──────────────────────────────────────────────────────────
//
// AMFI publishes all fund NAVs in a single text file daily.
// Format per data line: SchemeCode;ISIN1;ISIN2;SchemeName;NAV;Date
// e.g.  120503;INF174KA1LS2;INF174KA1LT0;Kotak Banking and PSU Debt;10.2958;22-Mar-2026
//
// One request replaces 286 individual mfapi.in calls (which time out from Vercel).

async function fetchAmfiNavs(
  log: string[],
): Promise<Map<number, { date: string; nav: number }>> {
  const res = await fetch(AMFI_NAV_URL, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`AMFI HTTP ${res.status}`)
  const text = await res.text()

  const navMap = new Map<number, { date: string; nav: number }>()
  for (const line of text.split('\n')) {
    const parts = line.trim().split(';')
    if (parts.length < 6) continue
    const schemeCode = parseInt(parts[0], 10)
    if (isNaN(schemeCode)) continue
    const nav  = parseFloat(parts[4])
    const date = mfapiDateToISO(parts[5])
    if (!date || isNaN(nav) || nav <= 0) continue
    navMap.set(schemeCode, { date, nav })
  }
  log.push(`[mf-eod] AMFI: parsed ${navMap.size} NAV entries`)
  return navMap
}

// ── Returns computation from stored mf_nav_data ────────────────────────────
//
// Instead of downloading full history on every page load, returns are computed
// here in the cron and stored in mf_funds.  The API then serves them instantly.

async function computeAndStoreReturns(
  latestBySch: Map<number, { date: string; nav: number }>,
  metaBySch:   Map<number, { fundHouse: string; schemeCategory: string }>,
  log: string[],
): Promise<void> {
  if (latestBySch.size === 0) return

  const codes   = Array.from(latestBySch.keys())
  const today   = todayIST()

  // ── Fetch three narrow date windows (±45 days around 1y / 3y / 5y ago) ──
  // This is far cheaper than loading the full 5-year history for all funds.
  const fetchWindow = async (
    from: string,
    to: string,
  ): Promise<Map<number, Array<{ date: string; nav: number }>>> => {
    const byScheme = new Map<number, Array<{ date: string; nav: number }>>()
    let offset = 0
    while (true) {
      const { data, error } = await supabase
        .from('mf_nav_data')
        .select('scheme_code, date, nav')
        .in('scheme_code', codes)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false })
        .range(offset, offset + 999)
      if (error || !data || data.length === 0) break
      for (const row of data) {
        if (!byScheme.has(row.scheme_code)) byScheme.set(row.scheme_code, [])
        byScheme.get(row.scheme_code)!.push({ date: row.date, nav: Number(row.nav) })
      }
      if (data.length < 1000) break
      offset += 1000
    }
    return byScheme
  }

  const findNearest = (
    rows: Array<{ date: string; nav: number }>,
    target: string,
  ): number | null => {
    const tMs = new Date(target).getTime()
    let best: { date: string; nav: number } | null = null
    let bestDiff = Infinity
    for (const r of rows) {
      const diff = Math.abs(new Date(r.date).getTime() - tMs)
      if (diff < bestDiff) { bestDiff = diff; best = r }
    }
    return best && bestDiff <= 30 * 86_400_000 ? best.nav : null
  }

  const [w1y, w3y, w5y] = await Promise.all([
    fetchWindow(addDays(today, -365 - 45), addDays(today, -365 + 45)),
    fetchWindow(addDays(today, -365 * 3 - 45), addDays(today, -365 * 3 + 45)),
    fetchWindow(addDays(today, -365 * 5 - 45), addDays(today, -365 * 5 + 45)),
  ])

  // Build upsert records
  const fundUpdates: Array<{
    scheme_code:     number
    nav:             number
    nav_date:        string
    return_1y:       number | null
    return_3y:       number | null
    return_5y:       number | null
    fund_house?:     string
    scheme_category?: string
  }> = []

  for (const [scheme_code, latest] of latestBySch.entries()) {
    const nav1y = findNearest(w1y.get(scheme_code) ?? [], addDays(latest.date, -365))
    const nav3y = findNearest(w3y.get(scheme_code) ?? [], addDays(latest.date, -365 * 3))
    const nav5y = findNearest(w5y.get(scheme_code) ?? [], addDays(latest.date, -365 * 5))

    const rec: typeof fundUpdates[number] = {
      scheme_code,
      nav:       latest.nav,
      nav_date:  latest.date,
      return_1y: nav1y ? cagrPct(nav1y, latest.nav, 1) : null,
      return_3y: nav3y ? cagrPct(nav3y, latest.nav, 3) : null,
      return_5y: nav5y ? cagrPct(nav5y, latest.nav, 5) : null,
    }

    const meta = metaBySch.get(scheme_code)
    if (meta?.fundHouse)      rec.fund_house      = meta.fundHouse
    if (meta?.schemeCategory) rec.scheme_category = meta.schemeCategory

    fundUpdates.push(rec)
  }

  // Use RPC to bypass PostgREST schema cache validation.
  // Direct upsert fails when PostgREST's cache is stale (e.g. after ALTER TABLE
  // until the cache reloads). The stored procedure receives raw JSON and updates
  // PostgreSQL directly, skipping column-level schema validation entirely.
  const CHUNK = 100
  let updated = 0

  for (let i = 0; i < fundUpdates.length; i += CHUNK) {
    const chunk = fundUpdates.slice(i, i + CHUNK)
    const { error } = await supabase.rpc('update_mf_fund_metrics', {
      records: chunk,
    })
    if (error) {
      log.push(`[mf-eod] rpc update error (chunk ${i / CHUNK + 1}): ${error.message}`)
      break
    }
    updated += Math.min(CHUNK, fundUpdates.length - i)
  }
  log.push(`[mf-eod] mf_funds updated with returns for ${updated} / ${fundUpdates.length} schemes`)
}

// ── Main handler ──────────────────────────────────────────────────────────────

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') ?? ''
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const today = todayIST()
  const log: string[] = [
    `[mf-eod] started at ${new Date().toISOString()} — today IST: ${today}`,
  ]

  try {
    // ── 0. Seed mf_funds from the pre-computed SCHEME_ENTRIES list ───────────
    // This ensures the funds page renders instantly (fund names at minimum)
    // even before any NAV data has been fetched.
    const schemeEntries = await discoverSchemeEntries()
    if (schemeEntries.length > 0) {
      const { error: seedErr } = await supabase.from('mf_funds').upsert(
        schemeEntries.map(e => ({
          scheme_code: e.schemeCode,
          scheme_name: e.schemeName,
        })),
        { onConflict: 'scheme_code', ignoreDuplicates: true },
      )
      if (seedErr) {
        log.push(`[mf-eod] seed warning: ${seedErr.message}`)
      } else {
        log.push(`[mf-eod] seeded mf_funds with ${schemeEntries.length} scheme entries`)
      }
    }

    // ── 1. Load all scheme codes from mf_funds ───────────────────────────────
    const { data: mfFunds, error: fundsErr } = await supabase
      .from('mf_funds')
      .select('scheme_code, scheme_name')
      .order('scheme_code')

    if (fundsErr || !mfFunds) {
      return NextResponse.json(
        { error: 'Failed to load mf_funds: ' + fundsErr?.message },
        { status: 500 }
      )
    }

    log.push(`[mf-eod] ${mfFunds.length} funds loaded from mf_funds`)

    // ── 2. Get latest stored NAV date per scheme from mf_funds.nav_date ─────
    // Reading nav_date from funds (286 rows) is far cheaper than scanning
    // all of nav_history (millions of rows) to find the max date per scheme.
    const schemeCodes = mfFunds.map((f) => f.scheme_code)

    const { data: navDateRows, error: latestErr } = await supabase
      .from('mf_funds')
      .select('scheme_code, nav_date')
      .in('scheme_code', schemeCodes)

    // If nav_date column doesn't exist yet (schema not migrated), proceed with
    // empty map — mf_nav_data's unique constraint will deduplicate on upsert.
    if (latestErr) {
      log.push(`[mf-eod] nav_date column missing in mf_funds — proceeding without dedup (${latestErr.message})`)
    }

    const latestDateByScheme = new Map<number, string>()
    for (const row of navDateRows ?? []) {
      if (row.nav_date) latestDateByScheme.set(row.scheme_code, row.nav_date)
    }

    // ── 3. Fetch all NAVs from AMFI in one request ────────────────────────
    let amfiNavs: Map<number, { date: string; nav: number }>
    try {
      amfiNavs = await fetchAmfiNavs(log)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      log.push(`[mf-eod] AMFI fetch failed: ${msg}`)
      return NextResponse.json({ ok: false, error: msg, log }, { status: 500 })
    }

    let totalInserted  = 0
    let totalSkipped   = 0
    let totalErrors    = 0
    const toInsert: Array<{ scheme_code: number; date: string; nav: number }> = []
    const metaBySch = new Map<number, { fundHouse: string; schemeCategory: string }>()

    for (const { scheme_code } of mfFunds) {
      const entry = amfiNavs.get(scheme_code)
      if (!entry) {
        totalErrors++
        continue
      }
      const lastDate = latestDateByScheme.get(scheme_code) ?? '2000-01-01'
      if (entry.date <= lastDate) {
        totalSkipped++
        continue
      }
      toInsert.push({ scheme_code, date: entry.date, nav: entry.nav })
    }

    // ── 4. Upsert collected rows into mf_nav_data ─────────────────────────
    if (toInsert.length > 0) {
      const CHUNK = 500
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK)
        const { error: upsertErr } = await supabase
          .from('mf_nav_data')
          .upsert(
            chunk.map((r) => ({ scheme_code: r.scheme_code, date: r.date, nav: r.nav })),
            { onConflict: 'scheme_code,date' }
          )
        if (upsertErr) {
          log.push(`[upsert] ERROR chunk ${i / CHUNK + 1}: ${upsertErr.message}`)
          totalErrors++
        } else {
          totalInserted += chunk.length
        }
      }
    }

    // ── 5. Compute & store 1y/3y/5y returns → mf_funds ───────────────────────
    // Build the latest-nav map for ALL funds (not just today's inserts) so
    // that returns are recomputed even on holidays / already-up-to-date days.
    const latestBySch = new Map<number, { date: string; nav: number }>()

    // Prefer today's fresh inserts first
    for (const r of toInsert) {
      const prev = latestBySch.get(r.scheme_code)
      if (!prev || r.date > prev.date) {
        latestBySch.set(r.scheme_code, { date: r.date, nav: r.nav })
      }
    }

    // Fill in any funds not in today's insert from the stored latest NAV
    for (const { scheme_code } of mfFunds) {
      if (latestBySch.has(scheme_code)) continue
      const amfiEntry = amfiNavs.get(scheme_code)
      if (amfiEntry) {
        latestBySch.set(scheme_code, amfiEntry)
      }
    }

    await computeAndStoreReturns(latestBySch, metaBySch, log)

    log.push(
      `[mf-eod] done — inserted ${totalInserted} nav rows | skipped ${totalSkipped} (up to date) | errors ${totalErrors}`
    )
    return NextResponse.json({ ok: true, log })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`FATAL: ${msg}`)
    return NextResponse.json({ ok: false, error: msg, log }, { status: 500 })
  }
}
