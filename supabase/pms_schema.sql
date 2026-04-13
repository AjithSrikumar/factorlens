-- FactorLens — PMS Data Schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query)
-- Source: pmsbazaar.com — /Explore/PMSDashboardData API + AMC page scraping

-- ── pms_data ──────────────────────────────────────────────────────────────────
-- One row per PMS strategy. Populated by scripts/scrape_pms.py

create table if not exists pms_data (
  -- Identity
  scheme_id               integer primary key,       -- pmsbazaar SchemeId
  scheme_code             text,                       -- e.g. "ABI4"
  pms_name                text    not null,           -- strategy name (SchemeName)
  amc_name                text    not null,           -- fund house (AMCName)
  logo_url                text,                       -- AMC logo image URL

  -- Classification
  category                text,                       -- e.g. "Multi Cap & Flexi Cap"
  asset_class             text,                       -- Equity / Debt / Hybrid / Multiasset
  category_rank           integer,                    -- rank within category by 1Y return

  -- Strategy info
  inception_date          text,                       -- display string e.g. "Oct 2009"
  strategy_inception_date date,                       -- parsed full date
  aum_cr                  numeric(14,2),              -- AMC-level PMS AUM in Crores (scraped from AMC page)
  aum_date                text,                       -- "As On" date for AUM

  -- Returns — scheme (CAGR %, stored as numeric, NULL = not available)
  return_1m               numeric(8,4),               -- 1 Month  (not publicly available)
  return_3m               numeric(8,4),               -- 3 Months (not publicly available)
  return_6m               numeric(8,4),               -- 6 Months (not publicly available)
  return_1y               numeric(8,4),               -- 1 Year
  return_2y               numeric(8,4),               -- 2 Years  (scraped from AMC page)
  return_3y               numeric(8,4),               -- 3 Years
  return_5y               numeric(8,4),               -- 5 Years
  return_10y              numeric(8,4),               -- 10 Years (not publicly available)
  return_since_inception  numeric(8,4),               -- Since Inception

  -- Returns — benchmark index (for same periods, CAGR %)
  benchmark_return_1y              numeric(8,4),
  benchmark_return_3y              numeric(8,4),
  benchmark_return_5y              numeric(8,4),
  benchmark_return_since_inception numeric(8,4),

  -- Metadata
  route_name              text,                       -- URL slug used on pmsbazaar
  amc_route_name          text,
  is_diy_product          boolean default false,
  is_featured             boolean default false,
  hide_in_comparison      boolean default false,
  product_code            text    default 'PMS',

  -- Housekeeping
  scraped_at              timestamptz default now(),
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- Indexes for common query patterns
create index if not exists idx_pms_amc_name      on pms_data (amc_name);
create index if not exists idx_pms_category      on pms_data (category);
create index if not exists idx_pms_asset_class   on pms_data (asset_class);
create index if not exists idx_pms_return_1y     on pms_data (return_1y desc nulls last);
create index if not exists idx_pms_category_rank on pms_data (category, category_rank);

-- Public read-only access (same pattern as other tables in this project)
alter table pms_data enable row level security;

create policy "Public read access"
  on pms_data for select
  using (true);

-- Auto-update updated_at on upsert
create or replace function update_pms_data_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger pms_data_updated_at
  before update on pms_data
  for each row execute function update_pms_data_updated_at();
