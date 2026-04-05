-- FactorLens — User auth & persistence schema
-- Run in Supabase SQL Editor after enabling Google OAuth in the dashboard.
-- Requires: Authentication > Providers > Google to be configured.

-- ── user_risk_profiles ────────────────────────────────────────────────────────
-- Stores the latest risk questionnaire result per user.
-- UNIQUE on user_id so we upsert in place (no history, keeps it simple).

CREATE TABLE IF NOT EXISTS user_risk_profiles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  answers    jsonb       NOT NULL,   -- { q1, q2, q3, q4 } integers
  score      numeric     NOT NULL,   -- 0–100 risk score
  category   text        NOT NULL,   -- "Conservative" | "Balanced" | "Aggressive" | …
  funds      jsonb       NOT NULL,   -- RecommendedFund[] from risk engine
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

-- ── user_portfolios ───────────────────────────────────────────────────────────
-- Stores the latest portfolio allocation per user.
-- Allocations are stored as { fundId: number, weight: number }[] JSON.

CREATE TABLE IF NOT EXISTS user_portfolios (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  allocations jsonb       NOT NULL,  -- [{ fundId, weight }]
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

-- ── Row-Level Security ────────────────────────────────────────────────────────
-- Each user can only read/write their own rows.

ALTER TABLE user_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_portfolios    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own risk profile" ON user_risk_profiles;
DROP POLICY IF EXISTS "Own portfolio"    ON user_portfolios;

CREATE POLICY "Own risk profile"
  ON user_risk_profiles FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Own portfolio"
  ON user_portfolios FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_risk_profiles_updated_at ON user_risk_profiles;
CREATE TRIGGER trg_risk_profiles_updated_at
  BEFORE UPDATE ON user_risk_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_portfolios_updated_at ON user_portfolios;
CREATE TRIGGER trg_portfolios_updated_at
  BEFORE UPDATE ON user_portfolios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
