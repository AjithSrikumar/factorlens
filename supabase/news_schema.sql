-- ─────────────────────────────────────────────────────────────────────────────
-- FactorLens News: database schema
-- Run this in Supabase SQL Editor to create the news table and supporting objects.
-- ─────────────────────────────────────────────────────────────────────────────

-- Main news table
CREATE TABLE IF NOT EXISTS news (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  headline         TEXT        NOT NULL,
  summary          TEXT,                          -- structured AI summary (120-250 words)
  source           TEXT        NOT NULL,           -- 'Business Standard', 'NDTV Profit', etc.
  source_url       TEXT        UNIQUE NOT NULL,    -- deduplication key
  image_url        TEXT,
  category         TEXT        CHECK (category IN ('Markets', 'Companies', 'Economy', 'Policy')),
  published_at     TIMESTAMPTZ,
  scraped_at       TIMESTAMPTZ DEFAULT NOW(),
  importance_score FLOAT       DEFAULT 5.0 CHECK (importance_score BETWEEN 0 AND 10),
  key_points       JSONB       DEFAULT '[]'::jsonb,
  why_it_matters   TEXT,                          -- single-sentence highlight
  is_market_moving BOOLEAN     DEFAULT FALSE,
  tags             TEXT[]      DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_news_published_at    ON news (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_news_category        ON news (category);
CREATE INDEX IF NOT EXISTS idx_news_importance      ON news (importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_news_scraped_at      ON news (scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_market_moving   ON news (is_market_moving) WHERE is_market_moving = TRUE;
CREATE INDEX IF NOT EXISTS idx_news_source_url      ON news (source_url);

-- Row-Level Security: public read, service-role write
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access"
  ON news FOR SELECT USING (true);

CREATE POLICY "Service role full access"
  ON news FOR ALL USING (auth.role() = 'service_role');
