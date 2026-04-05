-- FactorLens — NSE Index Rankings Schema
-- Run this in the Supabase SQL Editor for your project (lerpchldswooqrfscuig)
--
-- IMPORTANT: This script drops the old schema (scheme_code-based) and recreates
-- the tables with the schema the app code actually expects.
-- Safe to run even if the tables don't yet exist.

-- ── Drop old tables (cascade removes FK constraints) ─────────────────────────
drop table if exists nav_history  cascade;
drop table if exists split_events cascade;
drop table if exists nav_data     cascade;
drop table if exists funds        cascade;

-- ── funds ─────────────────────────────────────────────────────────────────────
-- One row per tracked NSE index / commodity. Metrics are computed by the EOD cron.

create table funds (
  id             serial        primary key,
  code           text          not null unique,
  name           text          not null,
  category       text          not null default '',
  inception_date date,
  -- Inception-to-date CAGR
  cagr           numeric(10,6),
  -- Period CAGRs
  cagr_1y        numeric(10,6),
  cagr_3y        numeric(10,6),
  cagr_5y        numeric(10,6),
  cagr_10y       numeric(10,6),
  cagr_20y       numeric(10,6),
  -- Risk / quality metrics
  avg_3y_rolling_return numeric(10,6),
  max_drawdown          numeric(10,6),
  volatility            numeric(10,6),
  sharpe_ratio          numeric(10,6),
  calmar_ratio          numeric(10,6),
  -- Composite ranking
  score          numeric(10,6),
  final_rank     integer,
  -- Timestamps
  created_at     timestamptz   default now(),
  updated_at     timestamptz   default now()
);

-- ── nav_data ──────────────────────────────────────────────────────────────────
-- Daily NAV / index close values. Populated by the EOD cron job.

create table nav_data (
  fund_id    integer  not null references funds(id) on delete cascade,
  date       date     not null,
  nav_value  numeric(20,6) not null,
  primary key (fund_id, date)
);

create index idx_nav_data_fund_date on nav_data (fund_id, date);
create index idx_nav_data_date      on nav_data (date desc);

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table funds    enable row level security;
alter table nav_data enable row level security;

create policy "Public read" on funds    for select using (true);
create policy "Public read" on nav_data for select using (true);

-- ── Reload PostgREST schema cache ─────────────────────────────────────────────
notify pgrst, 'reload schema';
