import { NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    return NextResponse.json({ error: 'SUPABASE_DB_URL not set' }, { status: 500 })
  }

  const sql = postgres(dbUrl.trim(), { max: 1, ssl: 'require' })

  const log: string[] = []

  try {
    await sql`
      create table if not exists maverst_external_data (
        date            date          primary key,
        india_vix       numeric(8,4),
        usdinr          numeric(10,4),
        fii_net_crore   numeric(16,2),
        created_at      timestamptz   default now(),
        updated_at      timestamptz   default now()
      )
    `
    log.push('maverst_external_data: OK')

    await sql`
      create table if not exists maverst_regime_scores (
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
      )
    `
    log.push('maverst_regime_scores: OK')

    await sql`
      create index if not exists idx_maverst_regime_date
        on maverst_regime_scores (date desc)
    `
    log.push('index idx_maverst_regime_date: OK')

    await sql`alter table maverst_external_data enable row level security`
    await sql`alter table maverst_regime_scores enable row level security`
    log.push('RLS enabled: OK')

    await sql`
      do $$ begin
        if not exists (
          select 1 from pg_policies
          where tablename = 'maverst_external_data' and policyname = 'Public read'
        ) then
          execute 'create policy "Public read" on maverst_external_data for select using (true)';
        end if;
      end $$
    `
    await sql`
      do $$ begin
        if not exists (
          select 1 from pg_policies
          where tablename = 'maverst_regime_scores' and policyname = 'Public read'
        ) then
          execute 'create policy "Public read" on maverst_regime_scores for select using (true)';
        end if;
      end $$
    `
    log.push('RLS policies: OK')

    return NextResponse.json({ ok: true, log })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    log.push(`ERROR: ${msg}`)
    return NextResponse.json({ ok: false, log, error: msg }, { status: 500 })
  } finally {
    await sql.end()
  }
}
