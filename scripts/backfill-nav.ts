/**
 * backfill-nav.ts — Fetch 5 years of historical NAV data from mfapi.in
 * and insert into mf_nav_data in Supabase.
 *
 * Run from the project root:
 *   npx tsx scripts/backfill-nav.ts
 *
 * Reads credentials from .env.local automatically.
 * Safe to re-run — skips funds whose data is already up to date.
 */

import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

// ── Load .env.local ───────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
const MFAPI_BASE  = 'https://api.mfapi.in/mf'
const DELAY_MS    = 400   // delay between fund fetches
const CHUNK_SIZE  = 500   // rows per Supabase upsert
const FETCH_TIMEOUT_MS = 20_000  // 20 s per fund

// Only backfill funds whose oldest stored data is newer than this cutoff.
const BACKFILL_BEFORE = '2021-06-01'

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

function bar(done: number, total: number, width = 30): string {
  const filled = Math.round((done / total) * width)
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + `] ${done}/${total}`
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ── Connectivity check ────────────────────────────────────────────────────────

async function checkConnectivity(): Promise<boolean> {
  const TEST_CODE = 120503  // UTI Nifty 50 Index Fund — always present
  console.log(`Checking connectivity to mfapi.in (scheme ${TEST_CODE})…`)
  try {
    const res = await fetchWithTimeout(`${MFAPI_BASE}/${TEST_CODE}`, 10_000)
    if (!res.ok) {
      console.error(`  mfapi.in returned HTTP ${res.status}`)
      return false
    }
    const json = await res.json() as { status: string; data?: unknown[] }
    if (json.status !== 'SUCCESS') {
      console.error(`  mfapi.in status: ${json.status}`)
      return false
    }
    console.log(`  OK — mfapi.in is reachable (${(json.data ?? []).length} rows for test fund)\n`)
    return true
  } catch (e) {
    console.error(`  mfapi.in unreachable: ${e}`)
    return false
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 0. Connectivity test
  if (!await checkConnectivity()) {
    console.error('\nmfapi.in is not reachable from this machine.')
    console.error('Try: ping api.mfapi.in   or   curl https://api.mfapi.in/mf/120503')
    process.exit(1)
  }

  // 1. Load all scheme codes
  const { data: funds, error: fundsErr } = await supabase
    .from('mf_funds')
    .select('scheme_code, scheme_name')
    .order('scheme_code')

  if (fundsErr || !funds) {
    console.error('Failed to load mf_funds:', fundsErr?.message)
    process.exit(1)
  }
  console.log(`Loaded ${funds.length} funds from mf_funds`)

  // 2. Get the earliest stored date per scheme (to know what's missing)
  const { data: earliestRows, error: eErr } = await supabase
    .from('mf_nav_data')
    .select('scheme_code, date')
    .in('scheme_code', funds.map(f => f.scheme_code))
    .order('date', { ascending: true })

  if (eErr) {
    console.error('Failed to query mf_nav_data:', eErr.message)
    process.exit(1)
  }

  const earliestDate = new Map<number, string>()
  for (const row of earliestRows ?? []) {
    if (!earliestDate.has(row.scheme_code)) {
      earliestDate.set(row.scheme_code, row.date)
    }
  }

  // 3. Only backfill funds that don't have old-enough history
  const toBackfill = funds.filter(f => {
    const oldest = earliestDate.get(f.scheme_code)
    return !oldest || oldest > BACKFILL_BEFORE
  })

  if (toBackfill.length === 0) {
    console.log('All funds already have history before', BACKFILL_BEFORE, '— nothing to do.')
    return
  }
  console.log(`${toBackfill.length} / ${funds.length} funds need backfill (no data before ${BACKFILL_BEFORE})\n`)

  let done = 0, totalInserted = 0, errors = 0
  const errorLog: string[] = []

  for (const fund of toBackfill) {
    const label = fund.scheme_name.slice(0, 45).padEnd(45)
    process.stdout.write(`\r${bar(done, toBackfill.length)}  ${label}`)

    try {
      const res = await fetchWithTimeout(`${MFAPI_BASE}/${fund.scheme_code}`, FETCH_TIMEOUT_MS)
      if (!res.ok) {
        const msg = `[${fund.scheme_code}] HTTP ${res.status}`
        errorLog.push(msg)
        errors++
        done++
        continue
      }

      const json = await res.json() as {
        status: string
        data:   Array<{ date: string; nav: string }>
      }

      if (json.status !== 'SUCCESS' || !json.data?.length) {
        const msg = `[${fund.scheme_code}] bad response: status=${json.status}, rows=${json.data?.length ?? 0}`
        errorLog.push(msg)
        errors++
        done++
        continue
      }

      const rows: Array<{ scheme_code: number; date: string; nav: number }> = []
      for (const entry of json.data) {
        const date = mfapiDateToISO(entry.date)
        const nav  = parseFloat(entry.nav)
        if (date && !isNaN(nav) && nav > 0) {
          rows.push({ scheme_code: fund.scheme_code, date, nav })
        }
      }

      // Upsert in chunks
      let chunkErr = false
      for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const { error } = await supabase
          .from('mf_nav_data')
          .upsert(rows.slice(i, i + CHUNK_SIZE), { onConflict: 'scheme_code,date' })
        if (error) {
          const msg = `[${fund.scheme_code}] upsert error: ${error.message}`
          errorLog.push(msg)
          chunkErr = true
          break
        }
      }

      if (!chunkErr) totalInserted += rows.length
      done++
    } catch (e) {
      const msg = `[${fund.scheme_code}] ${e instanceof Error ? e.message : String(e)}`
      errorLog.push(msg)
      errors++
      done++
    }

    await sleep(DELAY_MS)
  }

  process.stdout.write(`\r${bar(done, toBackfill.length)}  ${'done'.padEnd(45)}\n`)
  console.log(`\nBackfill complete`)
  console.log(`  Funds processed  : ${done}`)
  console.log(`  NAV rows upserted: ${totalInserted.toLocaleString()}`)
  console.log(`  Errors           : ${errors}`)

  if (errorLog.length > 0) {
    console.log(`\nFirst 20 errors:`)
    for (const e of errorLog.slice(0, 20)) console.log(' ', e)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
