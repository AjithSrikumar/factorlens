export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import postgres from 'postgres'

export async function GET() {
  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl) {
    return NextResponse.json({ error: 'SUPABASE_DB_URL not configured' }, { status: 503 })
  }

  const sql = postgres(dbUrl, { ssl: 'require', max: 1 })

  try {
    // Drop old tables (old schema used scheme_code as PK — incompatible with app)
    await sql`drop table if exists nav_history  cascade`
    await sql`drop table if exists split_events cascade`
    await sql`drop table if exists nav_data     cascade`
    await sql`drop table if exists funds        cascade`

    // Create funds table with correct schema
    await sql`
      create table funds (
        id             serial        primary key,
        code           text          not null unique,
        name           text          not null,
        category       text          not null default '',
        inception_date date,
        cagr           numeric(10,6),
        cagr_1y        numeric(10,6),
        cagr_3y        numeric(10,6),
        cagr_5y        numeric(10,6),
        cagr_10y       numeric(10,6),
        cagr_20y       numeric(10,6),
        avg_3y_rolling_return numeric(10,6),
        max_drawdown          numeric(10,6),
        volatility            numeric(10,6),
        sharpe_ratio          numeric(10,6),
        calmar_ratio          numeric(10,6),
        score          numeric(10,6),
        final_rank     integer,
        created_at     timestamptz   default now(),
        updated_at     timestamptz   default now()
      )
    `

    // Create nav_data table
    await sql`
      create table nav_data (
        fund_id    integer  not null references funds(id) on delete cascade,
        date       date     not null,
        nav_value  numeric(20,6) not null,
        primary key (fund_id, date)
      )
    `

    await sql`create index idx_nav_data_fund_date on nav_data (fund_id, date)`
    await sql`create index idx_nav_data_date      on nav_data (date desc)`

    // Enable RLS
    await sql`alter table funds    enable row level security`
    await sql`alter table nav_data enable row level security`

    await sql`create policy "Public read" on funds    for select using (true)`
    await sql`create policy "Public read" on nav_data for select using (true)`

    // Reload PostgREST schema cache
    await sql`notify pgrst, 'reload schema'`

    return NextResponse.json({ ok: true, message: 'Database schema migrated successfully' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  } finally {
    await sql.end()
  }
}
