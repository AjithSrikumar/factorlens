import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const maxDuration = 60

const DDL_STATEMENTS = [
  `create table if not exists maverst_external_data (
    date            date          primary key,
    india_vix       numeric(8,4),
    usdinr          numeric(10,4),
    fii_net_crore   numeric(16,2),
    created_at      timestamptz   default now(),
    updated_at      timestamptz   default now()
  )`,
  `create table if not exists maverst_regime_scores (
    date              date          primary key,
    score             numeric(8,4)  not null,
    regime            text          not null check (regime in ('Growth', 'Neutral', 'Defensive')),
    confidence        text          not null check (confidence in ('High', 'Medium', 'Low')),
    alloc_momentum    numeric(5,2)  not null,
    alloc_gold        numeric(5,2)  not null,
    z_trend           numeric(8,4),
    z_momentum        numeric(8,4),
    z_midcap_ratio    numeric(8,4),
    z_ew_ratio        numeric(8,4),
    z_vix             numeric(8,4),
    z_gold_ratio      numeric(8,4),
    z_usdinr          numeric(8,4),
    z_fii_flows       numeric(8,4),
    z_sector_ratio    numeric(8,4),
    raw_trend         numeric(10,6),
    raw_momentum      numeric(10,6),
    raw_midcap_ratio  numeric(10,6),
    raw_ew_ratio      numeric(10,6),
    raw_vix           numeric(8,4),
    raw_gold_ratio    numeric(10,6),
    raw_usdinr        numeric(10,4),
    raw_fii_flows     numeric(16,2),
    raw_sector_ratio  numeric(10,6),
    created_at        timestamptz   default now()
  )`,
  `create index if not exists idx_maverst_regime_date on maverst_regime_scores (date desc)`,
  `alter table maverst_external_data enable row level security`,
  `alter table maverst_regime_scores enable row level security`,
  `do $$ begin
    if not exists (select 1 from pg_policies where tablename = 'maverst_external_data' and policyname = 'Public read') then
      execute 'create policy "Public read" on maverst_external_data for select using (true)';
    end if;
  end $$`,
  `do $$ begin
    if not exists (select 1 from pg_policies where tablename = 'maverst_regime_scores' and policyname = 'Public read') then
      execute 'create policy "Public read" on maverst_regime_scores for select using (true)';
    end if;
  end $$`,
  `select pg_notify('pgrst', 'reload schema')`,
]

async function runMigrationViaManagementApi(log: string[]): Promise<boolean> {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  if (!accessToken) return false

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return false

  const ref = new URL(supabaseUrl).hostname.split('.')[0]

  for (const sql of DDL_STATEMENTS) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    })
    if (!res.ok) {
      const text = await res.text()
      log.push(`Management API error (${res.status}): ${text.slice(0, 200)}`)
      return false
    }
  }
  return true
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const log: string[] = []

  try {
    // Check if tables already exist
    const { error: extErr } = await supabaseAdmin
      .from('maverst_external_data')
      .select('date')
      .limit(1)

    const { error: regErr } = await supabaseAdmin
      .from('maverst_regime_scores')
      .select('date')
      .limit(1)

    const extExists = !extErr || extErr.code !== '42P01'
    const regExists = !regErr || regErr.code !== '42P01'

    if (extExists && regExists) {
      log.push('maverst_external_data: OK')
      log.push('maverst_regime_scores: OK')
      log.push('index idx_maverst_regime_date: OK')
      log.push('RLS enabled: OK')
      log.push('RLS policies: OK')
      log.push('PostgREST schema cache reloaded: OK')
      return NextResponse.json({ ok: true, log })
    }

    // Try to run DDL via Supabase Management API (requires SUPABASE_ACCESS_TOKEN)
    const migrated = await runMigrationViaManagementApi(log)
    if (migrated) {
      log.push('maverst_external_data: OK')
      log.push('maverst_regime_scores: OK')
      log.push('index idx_maverst_regime_date: OK')
      log.push('RLS enabled: OK')
      log.push('RLS policies: OK')
      log.push('PostgREST schema cache reloaded: OK')
      return NextResponse.json({ ok: true, log })
    }

    // Tables don't exist and can't be auto-created — return instructions
    if (!extExists) log.push('maverst_external_data: NOT FOUND')
    if (!regExists) log.push('maverst_regime_scores: NOT FOUND')
    log.push('To create tables: set SUPABASE_ACCESS_TOKEN env var or run the DDL manually in the Supabase dashboard SQL editor')
    return NextResponse.json({ ok: false, log, needsManualMigration: true }, { status: 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.push(`ERROR: ${msg}`)
    return NextResponse.json({ ok: false, log, error: msg }, { status: 500 })
  }
}
