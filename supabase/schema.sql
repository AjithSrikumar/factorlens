-- FactorLens — Supabase Schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query)

-- ── funds ─────────────────────────────────────────────────────────────────────
-- One row per tracked scheme. Holds latest NAV + pre-computed metrics.

create table if not exists funds (
  scheme_code     integer primary key,
  scheme_name     text    not null,
  fund_house      text    default '',
  scheme_category text    default '',
  scheme_type     text    default '',
  inception_date  date,
  nav             numeric(12,4),
  nav_date        date,
  return_1y       numeric(8,4),
  return_3y       numeric(8,4),
  return_5y       numeric(8,4),
  cagr_inception  numeric(8,4),
  total_return    numeric(10,4),
  volatility      numeric(8,4),
  max_drawdown    numeric(8,4),
  sharpe          numeric(8,4),
  last_nav_sync   timestamptz,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── nav_history ───────────────────────────────────────────────────────────────
-- Daily NAV records. nav_adj is the split-adjusted value (null = no adjustment).

create table if not exists nav_history (
  scheme_code  integer  not null references funds(scheme_code) on delete cascade,
  date         date     not null,
  nav          numeric(12,4) not null,   -- raw NAV from mfapi.in
  nav_adj      numeric(12,4),             -- split-adjusted NAV (populated by normalize step)
  primary key (scheme_code, date)
);

create index if not exists idx_nav_hist_scheme_date on nav_history (scheme_code, date);

-- ── split_events ──────────────────────────────────────────────────────────────
-- Detected or manually recorded NAV splits / fund mergers.
-- ratio = new_nav / old_nav on the split date (e.g. 0.01152 for SBI Gold FY22 split).
-- To normalize: multiply all pre-split raw NAVs by ratio → same scale as post-split.

create table if not exists split_events (
  id             serial primary key,
  scheme_code    integer not null references funds(scheme_code) on delete cascade,
  split_date     date    not null,
  ratio          numeric(20,10) not null,
  auto_detected  boolean default true,
  notes          text,
  created_at     timestamptz default now(),
  unique (scheme_code, split_date)
);

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Public SELECT (anon key). Writes use the service-role key (bypasses RLS).

alter table funds        enable row level security;
alter table nav_history  enable row level security;
alter table split_events enable row level security;

-- Drop policies before creating to make this script idempotent
drop policy if exists "Public read" on funds;
drop policy if exists "Public read" on nav_history;
drop policy if exists "Public read" on split_events;

create policy "Public read" on funds        for select using (true);
create policy "Public read" on nav_history  for select using (true);
create policy "Public read" on split_events for select using (true);

-- ── Realtime ──────────────────────────────────────────────────────────────────
-- Allows client-side subscriptions to receive live fund updates after daily sync.
-- Run: alter publication supabase_realtime add table funds;
-- (only needed if not already in the publication — check in Supabase Dashboard → Database → Replication)
