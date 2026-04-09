export const dynamic = 'force-dynamic'

/**
 * GET /api/mffunds/[id]
 *
 * Returns full NAV history + metrics for a single mutual fund scheme.
 *
 * Data priority:
 *   1. Supabase mf_nav_data  — pre-normalised, fast (<100 ms)
 *   2. AMFI NAV History portal — canonical source, fetched live when Supabase
 *      is stale (>7 days) or not yet populated for this scheme.
 *
 * AMFI endpoint:
 *   https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx
 *     ?NavDate=01-Apr-2006&ToNav=<DD-Mon-YYYY>&SCode=<schemeCode>
 *
 * Response format (semicolon-delimited, one row per NAV date):
 *   SchemeCode;ISIN1;ISIN2;SchemeName;NAV;Date
 *   e.g. 120503;INF174K...;INF174K...;Kotak Banking PSU Debt;10.2958;22-Mar-2026
 *
 * NOTE: mfapi.in is NOT used. All historical data comes directly from AMFI.
 */

import { NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'
import {
  detectSplits,
  normalizeHistory,
  computeMetrics,
  computeFiscalYears,
  type NavRow,
} from '@/lib/nav-normalize'

// ── AMFI constants ────────────────────────────────────────────────────────────

const AMFI_HISTORY_URL = 'https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx'
const AMFI_INCEPTION   = '01-Apr-2006'   // earliest date AMFI provides data for

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns today in AMFI query format: 'DD-Mon-YYYY' (IST) */
function todayAMFI(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const dd   = String(ist.getDate()).padStart(2, '0')
  const mon  = MONTHS[ist.getMonth()]
  const yyyy = ist.getFullYear()
  return `${dd}-${mon}-${yyyy}`
}

/**
 * Parse AMFI date strings → ISO 'YYYY-MM-DD'.
 * Handles both 'DD-Mon-YYYY' (alphabetic month) and 'DD-MM-YYYY' (numeric month).
 * Returns '' on failure.
 */
function amfiDateToISO(s: string): string {
  const MONTHS: Record<string, string> = {
    Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06',
    Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12',
  }
  const parts = s.trim().split('-')
  if (parts.length !== 3) return ''
  const [dd, mon, yyyy] = parts
  if (!/^\d{4}$/.test(yyyy) || !/^\d{1,2}$/.test(dd)) return ''
  const mm = /^\d+$/.test(mon) ? mon.padStart(2, '0') : MONTHS[mon]
  if (!mm) return ''
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`
}

// ── AMFI history fetcher ──────────────────────────────────────────────────────

/**
 * Fetch complete NAV history for a scheme directly from AMFI's portal.
 *
 * Browser-like headers are sent to bypass the Vercel IP block that
 * portal.amfiindia.com applies to plain server/bot requests.
 *
 * Throws if AMFI is unreachable, returns an HTTP error, or returns an HTML
 * block page — the caller surfaces the error to the client rather than
 * silently falling back to mfapi.in.
 */
async function fetchAmfiHistory(schemeCode: number): Promise<{
  rows: NavRow[]
  schemeName: string
}> {
  const url =
    `${AMFI_HISTORY_URL}` +
    `?NavDate=${AMFI_INCEPTION}` +
    `&ToNav=${todayAMFI()}` +
    `&SCode=${schemeCode}`

  const res = await fetch(url, {
    signal: AbortSignal.timeout(60_000),
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection':      'keep-alive',
      'Referer':         'https://www.amfiindia.com/net-asset-value/nav-history',
      'Origin':          'https://www.amfiindia.com',
    },
  })

  if (!res.ok) {
    throw new Error(`AMFI portal returned HTTP ${res.status} for scheme ${schemeCode}`)
  }

  const text = await res.text()

  // AMFI returns an HTML page when it blocks server IPs
  if (text.trimStart().startsWith('<') || text.toLowerCase().includes('<html')) {
    throw new Error(
      `AMFI portal blocked this server IP for scheme ${schemeCode}. ` +
      `Run the /api/cron/mf-backfill cron to pre-populate Supabase.`
    )
  }

  const rows: NavRow[] = []
  let schemeName = ''

  for (const line of text.split('\n')) {
    const parts = line.trim().split(';')
    if (parts.length < 6) continue
    const code = parseInt(parts[0], 10)
    // SCode parameter filters to our scheme, but still validate
    if (isNaN(code) || code !== schemeCode) continue
    // Capture the scheme name from the first matching row
    if (!schemeName && parts[3]?.trim()) schemeName = parts[3].trim()
    const nav  = parseFloat(parts[4])
    const date = amfiDateToISO(parts[5])
    if (!date || isNaN(nav) || nav <= 0) continue
    rows.push({ date, nav })
  }

  // AMFI portal returns rows newest-first — sort chronologically
  rows.sort((a, b) => a.date.localeCompare(b.date))

  if (!rows.length) {
    throw new Error(
      `AMFI returned no NAV data for scheme ${schemeCode}. ` +
      `The scheme code may be invalid or the fund may be too new.`
    )
  }

  return { rows, schemeName }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const schemeCode = parseInt(id, 10)

  if (isNaN(schemeCode)) {
    return NextResponse.json({ error: 'Invalid scheme code' }, { status: 400 })
  }

  try {
    // ── Path A: Supabase — normalised NAV, pre-computed metrics ───────────────
    //
    // Metadata (scheme_name, fund_house, etc.) is fetched regardless of whether
    // NAV history is fresh, so it can be used in Path B if we fall through.
    let savedMeta: Record<string, unknown> | null = null

    if (isSupabaseConfigured()) {
      const dbUrl = process.env.SUPABASE_DB_URL

      const [metaResult, { data: rawHistory, error: histErr }] = await Promise.all([
        dbUrl
          ? (async () => {
              const sql = postgres(dbUrl, {
                ssl: 'require', max: 1, idle_timeout: 20, connect_timeout: 10,
              })
              try {
                const rows = await sql`
                  SELECT scheme_name, fund_house, scheme_type, scheme_category
                  FROM mf_funds WHERE scheme_code = ${schemeCode} LIMIT 1
                `
                return { data: rows[0] ?? null }
              } finally { await sql.end() }
            })()
          : supabaseAdmin
              .from('mf_funds')
              .select('scheme_name, fund_house, scheme_type, scheme_category')
              .eq('scheme_code', schemeCode)
              .single()
              .then(r => ({ data: r.data })),
        supabaseAdmin
          .from('mf_nav_data')
          .select('date, nav')
          .eq('scheme_code', schemeCode)
          .order('date', { ascending: true })
          .limit(10_000),
      ])

      // Always preserve metadata for use in Path B
      savedMeta = (metaResult.data ?? null) as Record<string, unknown> | null

      if (!histErr && rawHistory?.length) {
        const latestHistDate = rawHistory[rawHistory.length - 1].date as string
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 7)  // 7 days: covers weekends + public holidays
        const isStale = latestHistDate < cutoff.toISOString().slice(0, 10)

        if (!isStale) {
          // Supabase data is fresh — normalise splits and return
          const rawNavs: NavRow[] = rawHistory.map(r => ({
            date: r.date as string,
            nav:  Number(r.nav),
          }))
          const splits  = detectSplits(rawNavs, schemeCode)
          const adjNavs = normalizeHistory(rawNavs, splits)
          const history = rawNavs.map((h, i) => ({ date: h.date, nav: adjNavs[i] }))
          const metrics = computeMetrics(history)
          const fy_data = computeFiscalYears(history)
          const meta    = savedMeta ?? {}

          return NextResponse.json({
            fund: {
              scheme_code:     schemeCode,
              scheme_name:     (meta.scheme_name     as string) ?? '',
              fund_house:      (meta.fund_house      as string) ?? '',
              scheme_type:     (meta.scheme_type     as string) ?? '',
              scheme_category: (meta.scheme_category as string) ?? '',
              nav:             history[history.length - 1].nav,
              nav_date:        latestHistDate,
              inception_date:  history[0].date,
            },
            metrics,
            fy_data,
            nav_history: history,
          }, { headers: { 'Cache-Control': 'no-store' } })
        }
        // Supabase history is stale — fall through to AMFI live fetch
      }
    }

    // ── Path B: AMFI portal (Supabase stale, missing, or not configured) ─────
    //
    // Fetches complete NAV history directly from AMFI's official portal —
    // the same canonical source that populates mf_nav_data via the mf-backfill
    // cron. No mfapi.in involved.
    const { rows: amfiRows, schemeName: amfiSchemeName } =
      await fetchAmfiHistory(schemeCode)

    // Apply split normalisation (same logic as Supabase path)
    const splits  = detectSplits(amfiRows, schemeCode)
    const adjNavs = normalizeHistory(amfiRows, splits)
    const history = amfiRows.map((r, i) => ({ date: r.date, nav: adjNavs[i] }))

    const metrics = computeMetrics(history)
    const fy_data = computeFiscalYears(history)

    // Prefer Supabase metadata (richer: fund_house, category), fall back to
    // the scheme name embedded in the AMFI response
    const meta = savedMeta ?? {}

    return NextResponse.json({
      fund: {
        scheme_code:     schemeCode,
        scheme_name:     (meta.scheme_name     as string) || amfiSchemeName,
        fund_house:      (meta.fund_house      as string) ?? '',
        scheme_type:     (meta.scheme_type     as string) ?? '',
        scheme_category: (meta.scheme_category as string) ?? '',
        nav:             history[history.length - 1].nav,
        nav_date:        history[history.length - 1].date,
        inception_date:  history[0].date,
      },
      metrics,
      fy_data,
      nav_history: history,
    }, { headers: { 'Cache-Control': 'no-store' } })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: `Failed to fetch fund data: ${msg}` },
      { status: 500 },
    )
  }
}
