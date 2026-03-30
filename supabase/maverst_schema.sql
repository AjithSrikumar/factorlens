-- MAVERST Regime Engine — Supabase Schema
-- Run this in the Supabase SQL Editor

-- ── maverst_external_data ────────────────────────────────────────────────────
-- Stores daily external signals: India VIX, USD/INR, FII net flows.
-- Populated by the maverst-eod cron job.
-- India VIX: scraped from in.investing.com (primary, covers full history
--            from inception 2009-03-02) with niftyindices.com as fallback.
--            Run ?vix-backfill=true on the maverst-eod cron to load full
--            historical data from inception.
-- Nifty 50 / Midcap 150 / Gold NAV signals are read from nav_data (same
-- table as the Index Fund Rankings page, populated by /api/cron/eod).

create table if not exists maverst_external_data (
  date            date          primary key,
  india_vix       numeric(8,4),
  usdinr          numeric(10,4),
  fii_net_crore   numeric(16,2),   -- net FII equity flows in ₹ crore
  created_at      timestamptz   default now(),
  updated_at      timestamptz   default now()
);

-- ── maverst_regime_scores ────────────────────────────────────────────────────
-- One row per trading day. Stores the computed MAVERST score, regime
-- classification, allocation weights, and all indicator z-scores.

create table if not exists maverst_regime_scores (
  date              date          primary key,
  score             numeric(8,4)  not null,
  regime            text          not null check (regime in ('Growth', 'Neutral', 'Defensive')),
  confidence        text          not null check (confidence in ('High', 'Medium', 'Low')),
  -- Allocation weights (%)
  alloc_momentum    numeric(5,2)  not null,   -- Midcap Momentum Index weight
  alloc_gold        numeric(5,2)  not null,   -- Gold ETF weight
  -- Z-scores (direction-adjusted: positive always = bullish)
  z_trend           numeric(8,4),
  z_momentum        numeric(8,4),
  z_midcap_ratio    numeric(8,4),
  z_ew_ratio        numeric(8,4),
  z_vix             numeric(8,4),   -- negated: high VIX → negative z
  z_gold_ratio      numeric(8,4),   -- negated: gold outperforming → negative z
  z_usdinr          numeric(8,4),   -- negated: weaker INR → negative z
  z_fii_flows       numeric(8,4),
  z_sector_ratio    numeric(8,4),
  -- Raw indicator values (before z-scoring)
  raw_trend         numeric(10,6),  -- (N50 / SMA200) - 1
  raw_momentum      numeric(10,6),  -- N50 12-month return
  raw_midcap_ratio  numeric(10,6),  -- NMC150/N50 1-month rel. return
  raw_ew_ratio      numeric(10,6),  -- N100EW/N100 1-month rel. return
  raw_vix           numeric(8,4),
  raw_gold_ratio    numeric(10,6),  -- GOLD/N50 1-month rel. return
  raw_usdinr        numeric(10,4),
  raw_fii_flows     numeric(16,2),  -- 20-day cumulative FII flows
  raw_sector_ratio  numeric(10,6),  -- NHBETA50/NLV50 1-month rel. return
  created_at        timestamptz   default now()
);

create index if not exists idx_maverst_regime_date
  on maverst_regime_scores (date desc);

-- ── Row-Level Security ────────────────────────────────────────────────────────

alter table maverst_external_data  enable row level security;
alter table maverst_regime_scores  enable row level security;

drop policy if exists "Public read" on maverst_external_data;
drop policy if exists "Public read" on maverst_regime_scores;

create policy "Public read" on maverst_external_data  for select using (true);
create policy "Public read" on maverst_regime_scores  for select using (true);

-- Reload PostgREST schema cache so the new tables are immediately visible
notify pgrst, 'reload schema';
