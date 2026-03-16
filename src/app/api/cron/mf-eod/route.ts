import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Use service role key if available, otherwise fall back to anon key
// (works when RLS is disabled on mf_funds / mf_nav_data tables).
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY !== 'your-service-role-key-here')
    ? process.env.SUPABASE_SERVICE_ROLE_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const MFAPI_BASE = 'https://api.mfapi.in/mf'

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayIST(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
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

// ── mfapi fetchers ────────────────────────────────────────────────────────────

interface MfLatest {
  date: string   // ISO
  nav:  number
}

async function fetchLatest(schemeCode: number): Promise<MfLatest | null> {
  try {
    const res = await fetch(`${MFAPI_BASE}/${schemeCode}/latest`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const json = await res.json() as {
      status: string
      data: Array<{ date: string; nav: string }>
    }
    if (json.status !== 'SUCCESS' || !json.data?.length) return null
    const row = json.data[0]
    const date = mfapiDateToISO(row.date)
    const nav  = parseFloat(row.nav)
    if (!date || isNaN(nav) || nav <= 0) return null
    return { date, nav }
  } catch {
    return null
  }
}

/**
 * Fetch full history since `afterDate` (exclusive).
 * Used when `/latest` returns data older than expected, meaning we've
 * missed multiple days and need to backfill.
 */
async function fetchSince(
  schemeCode: number,
  afterDate: string
): Promise<MfLatest[]> {
  try {
    const res = await fetch(`${MFAPI_BASE}/${schemeCode}`, {
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return []
    const json = await res.json() as {
      status: string
      data: Array<{ date: string; nav: string }>
    }
    if (json.status !== 'SUCCESS' || !json.data) return []
    const rows: MfLatest[] = []
    for (const row of json.data) {
      const date = mfapiDateToISO(row.date)
      const nav  = parseFloat(row.nav)
      if (date && !isNaN(nav) && nav > 0 && date > afterDate) {
        rows.push({ date, nav })
      }
    }
    return rows
  } catch {
    return []
  }
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
    // ── 1. Load all scheme codes from mf_funds ────────────────────────────────
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

    // ── 2. Get latest date per scheme code from mf_nav_data ───────────────────
    //
    // Supabase doesn't support GROUP BY directly, so we use a single ordered
    // query and pick the first row per scheme (which is the latest due to DESC).
    const schemeCodes = mfFunds.map((f) => f.scheme_code)

    const { data: latestRows, error: latestErr } = await supabase
      .from('mf_nav_data')
      .select('scheme_code, date')
      .in('scheme_code', schemeCodes)
      .order('date', { ascending: false })

    if (latestErr) {
      return NextResponse.json(
        { error: 'Failed to load latest dates: ' + latestErr.message },
        { status: 500 }
      )
    }

    const latestDateByScheme = new Map<number, string>()
    for (const row of latestRows ?? []) {
      if (!latestDateByScheme.has(row.scheme_code)) {
        latestDateByScheme.set(row.scheme_code, row.date)
      }
    }

    // ── 3. Fetch latest NAV from mfapi in batches of 20 ──────────────────────
    const BATCH_SIZE     = 20
    const BATCH_DELAY_MS = 500   // ms between batches (be polite to mfapi)

    let totalInserted  = 0
    let totalSkipped   = 0
    let totalErrors    = 0
    const toInsert: Array<{ scheme_code: number; date: string; nav: number }> = []

    for (let i = 0; i < mfFunds.length; i += BATCH_SIZE) {
      const batch = mfFunds.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async ({ scheme_code }) => {
          const lastDate = latestDateByScheme.get(scheme_code) ?? '2000-01-01'

          const latest = await fetchLatest(scheme_code)

          if (!latest) {
            totalErrors++
            return
          }

          // Already up to date
          if (latest.date <= lastDate) {
            totalSkipped++
            return
          }

          // Missed multiple days — backfill from full history
          const dayDiff = (
            new Date(latest.date).getTime() - new Date(lastDate).getTime()
          ) / 86_400_000

          if (dayDiff > 3) {
            // Fetch full history and insert all missing rows
            const rows = await fetchSince(scheme_code, lastDate)
            for (const r of rows) {
              toInsert.push({ scheme_code, date: r.date, nav: r.nav })
            }
          } else {
            toInsert.push({ scheme_code, date: latest.date, nav: latest.nav })
          }
        })
      )

      if (i + BATCH_SIZE < mfFunds.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
      }
    }

    // ── 4. Upsert collected rows into mf_nav_data ─────────────────────────────
    if (toInsert.length > 0) {
      // Supabase upsert in chunks of 500
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

      // ── 5. Also update the `funds` table so the API reflects today's NAV ────
      // Build a map of the most-recent NAV per scheme_code from what we just inserted.
      const latestBySch = new Map<number, { date: string; nav: number }>()
      for (const r of toInsert) {
        const prev = latestBySch.get(r.scheme_code)
        if (!prev || r.date > prev.date) {
          latestBySch.set(r.scheme_code, { date: r.date, nav: r.nav })
        }
      }

      const nowISO = new Date().toISOString()
      const fundsUpdateResults = await Promise.allSettled(
        Array.from(latestBySch.entries()).map(([scheme_code, latest]) =>
          supabase.from('funds')
            .update({ nav: latest.nav, nav_date: latest.date, last_nav_sync: nowISO })
            .eq('scheme_code', scheme_code)
        )
      )
      const fundsUpdated = fundsUpdateResults.filter(r => r.status === 'fulfilled').length
      log.push(`[mf-eod] updated funds table for ${fundsUpdated} / ${latestBySch.size} schemes`)
    }

    log.push(
      `[mf-eod] done — inserted ${totalInserted} rows | skipped ${totalSkipped} (up to date) | errors ${totalErrors}`
    )
    return NextResponse.json({ ok: true, log })

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    log.push(`FATAL: ${msg}`)
    return NextResponse.json({ ok: false, error: msg, log }, { status: 500 })
  }
}
