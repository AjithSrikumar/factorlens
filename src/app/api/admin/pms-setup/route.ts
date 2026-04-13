export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * /api/admin/pms-setup
 *
 * One-shot admin endpoint that:
 *   1. Creates the pms_data table (and indexes/RLS) if it doesn't exist
 *   2. Fetches all ~500 PMS strategies from pmsbazaar.com
 *   3. Scrapes AMC pages for AUM + 2Y returns
 *   4. Computes category ranks
 *   5. Upserts everything into pms_data
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *
 * Example:
 *   curl -X POST https://your-app.vercel.app/api/admin/pms-setup \
 *        -H "Authorization: Bearer factorlens2024"
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Supabase client (service role = full DB access) ───────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ── Types ─────────────────────────────────────────────────────────────────────

interface SchemeReturn {
  SchemeReturnText: string
  SchemeReturnValue: string
  IndexReturnText: string
  IndexReturnValue: string
}

interface RawScheme {
  SchemeId: number
  SchemeCode: string
  SchemeName: string
  AMCName: string
  AMCLogoLink: string
  Category: string
  AssetClass: string
  Inception_Date: string
  Strategy_Inception_Date: string
  SchemeReturns: SchemeReturn[]
  RouteName: string
  AMCRouteName: string
  IsDIYProduct: boolean
  IsFeatured: boolean
  HideInComparison: boolean
  ProductCode: string
}

interface AmcData {
  aum_cr: number | null
  aum_date: string | null
  returns_2y: Record<string, number>
}

interface PmsRow {
  scheme_id: number
  scheme_code: string | null
  pms_name: string
  amc_name: string
  logo_url: string | null
  category: string
  asset_class: string
  category_rank: number | null
  inception_date: string | null
  strategy_inception_date: string | null
  aum_cr: number | null
  aum_date: string | null
  return_1m: null
  return_3m: null
  return_6m: null
  return_1y: number | null
  return_2y: number | null
  return_3y: number | null
  return_5y: number | null
  return_10y: null
  return_since_inception: number | null
  benchmark_return_1y: number | null
  benchmark_return_3y: number | null
  benchmark_return_5y: number | null
  benchmark_return_since_inception: number | null
  route_name: string
  amc_route_name: string
  is_diy_product: boolean
  is_featured: boolean
  hide_in_comparison: boolean
  product_code: string
  scraped_at: string
}

// ── Schema DDL ────────────────────────────────────────────────────────────────

const CREATE_TABLE_SQL = `
create table if not exists pms_data (
  scheme_id               integer primary key,
  scheme_code             text,
  pms_name                text    not null,
  amc_name                text    not null,
  logo_url                text,
  category                text,
  asset_class             text,
  category_rank           integer,
  inception_date          text,
  strategy_inception_date date,
  aum_cr                  numeric(14,2),
  aum_date                text,
  return_1m               numeric(8,4),
  return_3m               numeric(8,4),
  return_6m               numeric(8,4),
  return_1y               numeric(8,4),
  return_2y               numeric(8,4),
  return_3y               numeric(8,4),
  return_5y               numeric(8,4),
  return_10y              numeric(8,4),
  return_since_inception  numeric(8,4),
  benchmark_return_1y              numeric(8,4),
  benchmark_return_3y              numeric(8,4),
  benchmark_return_5y              numeric(8,4),
  benchmark_return_since_inception numeric(8,4),
  route_name              text,
  amc_route_name          text,
  is_diy_product          boolean default false,
  is_featured             boolean default false,
  hide_in_comparison      boolean default false,
  product_code            text    default 'PMS',
  scraped_at              timestamptz default now(),
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);
create index if not exists idx_pms_amc_name      on pms_data (amc_name);
create index if not exists idx_pms_category      on pms_data (category);
create index if not exists idx_pms_asset_class   on pms_data (asset_class);
create index if not exists idx_pms_return_1y     on pms_data (return_1y desc nulls last);
create index if not exists idx_pms_category_rank on pms_data (category, category_rank);
alter table pms_data enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename = 'pms_data' and policyname = 'Public read access'
  ) then
    create policy "Public read access" on pms_data for select using (true);
  end if;
end $$;
`.trim()

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseReturn(value: string | null | undefined): number | null {
  if (!value) return null
  const clean = value.replace('%', '').trim()
  if (['NA', 'N/A', '-', ''].includes(clean.toUpperCase())) return null
  const n = parseFloat(clean)
  return isNaN(n) ? null : n
}

function getReturn(list: SchemeReturn[], key: string): number | null {
  return parseReturn(list.find(r => r.SchemeReturnText === key)?.SchemeReturnValue)
}

function getIndexReturn(list: SchemeReturn[], key: string): number | null {
  return parseReturn(list.find(r => r.IndexReturnText === key)?.IndexReturnValue)
}

function amcSlug(name: string): string {
  return name.trim().replace(/\s+/g, '-')
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// ── Step 1: Ensure schema ─────────────────────────────────────────────────────

async function ensureSchema(log: string[]): Promise<boolean> {
  // Check if table already exists via a lightweight query
  const { error: checkErr } = await supabase.from('pms_data').select('scheme_id').limit(1)
  if (!checkErr) {
    log.push('[schema] pms_data table already exists — skipping DDL')
    return true
  }
  if (!checkErr.message?.includes('does not exist') && !checkErr.message?.includes('schema cache')) {
    log.push(`[schema] unexpected check error: ${checkErr.message}`)
  }

  // Table doesn't exist — run DDL via the postgres client
  // This uses the service_role key which has full DB permissions
  log.push('[schema] creating pms_data table …')

  // Use the pg meta API to run DDL (available in Supabase deployed environment)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const statements = CREATE_TABLE_SQL
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)

  let allOk = true
  for (const stmt of statements) {
    try {
      const res = await fetch(`${supabaseUrl}/pg-meta/v1/query`, {
        method: 'POST',
        headers: {
          'apikey': serviceKey,
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: stmt + ';' }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) {
        const text = await res.text()
        log.push(`  WARN stmt failed (${res.status}): ${text.slice(0, 100)}`)
        allOk = false
      }
    } catch (e) {
      log.push(`  WARN stmt exception: ${e}`)
      allOk = false
    }
  }

  if (allOk) {
    log.push('[schema] DDL applied successfully')
  } else {
    log.push('[schema] WARNING: some DDL statements may have failed.')
    log.push('[schema] Please run supabase/pms_schema.sql manually in the Supabase SQL Editor.')
  }
  return allOk
}

// ── Step 2: Fetch PMS dashboard data ─────────────────────────────────────────

async function fetchDashboardData(log: string[]): Promise<RawScheme[]> {
  const url = 'https://pmsbazaar.com/Explore/PMSDashboardData'
  log.push('[fetch] calling PMSDashboardData API …')

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Content-Length': '0',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': 'https://pmsbazaar.com/Explore/PMS',
        },
        body: '',
        signal: AbortSignal.timeout(60_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const outer = await res.json() as string | RawScheme[]
      const data: RawScheme[] = typeof outer === 'string' ? JSON.parse(outer) : outer
      log.push(`[fetch] ${data.length} schemes received`)
      return data
    } catch (e) {
      log.push(`[fetch] attempt ${attempt} failed: ${e}`)
      if (attempt < 3) await sleep(5_000)
    }
  }
  throw new Error('PMSDashboardData fetch failed after 3 attempts')
}

// ── Step 3: Scrape AMC pages for AUM + 2Y returns ────────────────────────────

async function scrapeAmcPage(amcName: string): Promise<AmcData> {
  const result: AmcData = { aum_cr: null, aum_date: null, returns_2y: {} }
  const slug = amcSlug(amcName)
  const url  = `https://pmsbazaar.com/AMC/${slug}`

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return result
    const html = await res.text()

    // Extract AUM from page text: "AUM (Cr.)  31447.24"
    const aumMatch = html.match(/AUM\s*\(Cr\.?\)\s*([\d,]+\.?\d*)/i)
    if (aumMatch) result.aum_cr = parseFloat(aumMatch[1].replace(/,/g, ''))

    // Extract "As On" date
    const asOnMatch = html.match(/As\s+On\s+(\d+\s+\w+\s+\d{4})/i)
    if (asOnMatch) result.aum_date = asOnMatch[1]

    // Parse 2Y returns from the PMS strategies table
    // The table has headers like: Investment Approach | Category | 1 Yr | 2 Yr | 3 Yr | 5 Yr | Inception Date
    // Find the sub-header row pattern then extract data rows
    const tableMatch = html.match(
      /Investment Approach<\/th>[^]*?<\/table>/i
    )
    if (tableMatch) {
      const rows = tableMatch[0].split(/<tr[^>]*>/i).slice(1)
      for (const row of rows) {
        const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map(m =>
          m[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim()
        )
        // Expected: [Strategy Name, Category, 1Y, 2Y, 3Y, 5Y, Inception]
        if (cells.length >= 4) {
          const name = cells[0]
          const ret2y = parseReturn(cells[3])
          if (name && ret2y !== null && name.toLowerCase() !== 'investment approach') {
            result.returns_2y[name] = ret2y
          }
        }
      }
    }
  } catch {
    // silently skip failed AMC pages
  }
  return result
}

// ── Step 4: Compute category ranks ───────────────────────────────────────────

function computeCategoryRanks(schemes: RawScheme[]): Map<number, number> {
  const byCategory = new Map<string, Array<{ id: number; ret: number | null }>>()
  for (const s of schemes) {
    const cat = (s.Category || 'Unknown').trim()
    const ret = getReturn(s.SchemeReturns, 'Return_1_Yr')
    const arr = byCategory.get(cat) ?? []
    arr.push({ id: s.SchemeId, ret })
    byCategory.set(cat, arr)
  }
  const ranks = new Map<number, number>()
  for (const items of byCategory.values()) {
    items.sort((a, b) => {
      if (a.ret === null && b.ret === null) return 0
      if (a.ret === null) return 1
      if (b.ret === null) return -1
      return b.ret - a.ret
    })
    items.forEach((item, idx) => ranks.set(item.id, idx + 1))
  }
  return ranks
}

// ── Step 5: Build rows ────────────────────────────────────────────────────────

function buildRows(
  schemes: RawScheme[],
  amcData: Map<string, AmcData>,
  ranks: Map<number, number>,
): PmsRow[] {
  const now = new Date().toISOString()
  return schemes.map(s => {
    const amc  = amcData.get(s.AMCName) ?? { aum_cr: null, aum_date: null, returns_2y: {} }
    const rets = s.SchemeReturns ?? []

    let stratDt: string | null = null
    if (s.Strategy_Inception_Date) {
      try { stratDt = new Date(s.Strategy_Inception_Date).toISOString().slice(0, 10) }
      catch { /* ignore */ }
    }

    return {
      scheme_id:    s.SchemeId,
      scheme_code:  s.SchemeCode ?? null,
      pms_name:     s.SchemeName?.trim() ?? '',
      amc_name:     s.AMCName?.trim()    ?? '',
      logo_url:     s.AMCLogoLink        ?? null,
      category:     (s.Category ?? '').trim(),
      asset_class:  (s.AssetClass ?? '').trim(),
      category_rank: ranks.get(s.SchemeId) ?? null,
      inception_date:          s.Inception_Date ?? null,
      strategy_inception_date: stratDt,
      aum_cr:   amc.aum_cr,
      aum_date: amc.aum_date,
      return_1m:  null,
      return_3m:  null,
      return_6m:  null,
      return_1y:  getReturn(rets, 'Return_1_Yr'),
      return_2y:  amc.returns_2y[s.SchemeName?.trim()] ?? null,
      return_3y:  getReturn(rets, 'Return_3_Yr'),
      return_5y:  getReturn(rets, 'Return_5_Yr'),
      return_10y: null,
      return_since_inception: getReturn(rets, 'Return_Inception'),
      benchmark_return_1y:   getIndexReturn(rets, 'Return_Index_1_Yr'),
      benchmark_return_3y:   getIndexReturn(rets, 'Return_Index_3_Yr'),
      benchmark_return_5y:   getIndexReturn(rets, 'Return_Index_5_Yr'),
      benchmark_return_since_inception: getIndexReturn(rets, 'Return_Index_Inception'),
      route_name:     (s.RouteName    ?? '').trim(),
      amc_route_name: (s.AMCRouteName ?? '').trim(),
      is_diy_product:    Boolean(s.IsDIYProduct),
      is_featured:       Boolean(s.IsFeatured),
      hide_in_comparison: Boolean(s.HideInComparison),
      product_code: s.ProductCode ?? 'PMS',
      scraped_at:   now,
    }
  })
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authHeader  = req.headers.get('authorization') ?? ''
  const cronSecret  = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const params   = req.nextUrl.searchParams
  const noAmc    = params.get('no_amc') === '1'
  const log: string[] = [`[pms-setup] started ${new Date().toISOString()}`]
  const startTime = Date.now()

  try {
    // 1. Ensure schema
    await ensureSchema(log)

    // 2. Fetch dashboard data
    const schemes = await fetchDashboardData(log)

    // 3. Scrape AMC pages (unless skipped)
    const amcData = new Map<string, AmcData>()
    if (!noAmc) {
      const uniqueAmcs = [...new Set(schemes.map(s => s.AMCName).filter(Boolean))]
      log.push(`[amc] scraping ${uniqueAmcs.length} AMC pages …`)
      const BUDGET_MS = 200_000 - (Date.now() - startTime)
      const perAmcMs  = Math.min(3_000, BUDGET_MS / uniqueAmcs.length)

      for (let i = 0; i < uniqueAmcs.length; i++) {
        if (Date.now() - startTime > 220_000) {
          log.push(`[amc] time budget reached at ${i}/${uniqueAmcs.length} — stopping`)
          break
        }
        const name = uniqueAmcs[i]
        amcData.set(name, await scrapeAmcPage(name))
        if (perAmcMs > 500) await sleep(500)
      }

      const withAum = [...amcData.values()].filter(v => v.aum_cr !== null).length
      log.push(`[amc] AUM found for ${withAum}/${uniqueAmcs.length} AMCs`)
    } else {
      log.push('[amc] skipped (no_amc=1)')
    }

    // 4. Category ranks
    log.push('[ranks] computing category ranks …')
    const ranks = computeCategoryRanks(schemes)

    // 5. Build rows
    const rows = buildRows(schemes, amcData, ranks)
    log.push(`[rows] built ${rows.length} rows`)

    // 6. Upsert in batches of 100
    log.push('[upsert] upserting to pms_data …')
    let upserted = 0
    const BATCH = 100
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { error } = await supabase
        .from('pms_data')
        .upsert(batch, { onConflict: 'scheme_id' })
      if (error) {
        log.push(`  batch ${i / BATCH + 1} ERROR: ${error.message}`)
      } else {
        upserted += batch.length
      }
    }
    log.push(`[upsert] done — ${upserted} / ${rows.length} rows upserted`)

    const elapsedSec = Math.round((Date.now() - startTime) / 1000)
    log.push(`[pms-setup] completed in ${elapsedSec}s`)
    return NextResponse.json({ ok: true, total: rows.length, upserted, log })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.push(`[ERROR] ${msg}`)
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}
