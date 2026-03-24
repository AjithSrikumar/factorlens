import { NextRequest, NextResponse } from 'next/server'
import postgres from 'postgres'

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sql = postgres(process.env.SUPABASE_DB_URL!, { ssl: 'require', max: 1 })

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS news (
        id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        headline         TEXT        NOT NULL,
        summary          TEXT,
        source           TEXT        NOT NULL,
        source_url       TEXT        UNIQUE NOT NULL,
        image_url        TEXT,
        category         TEXT        CHECK (category IN ('Markets', 'Companies', 'Economy', 'Policy')),
        published_at     TIMESTAMPTZ,
        scraped_at       TIMESTAMPTZ DEFAULT NOW(),
        importance_score FLOAT       DEFAULT 5.0 CHECK (importance_score BETWEEN 0 AND 10),
        key_points       JSONB       DEFAULT '[]'::jsonb,
        why_it_matters   TEXT,
        is_market_moving BOOLEAN     DEFAULT FALSE,
        tags             TEXT[]      DEFAULT '{}',
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `
    await sql`CREATE INDEX IF NOT EXISTS idx_news_published_at  ON news (published_at DESC NULLS LAST)`
    await sql`CREATE INDEX IF NOT EXISTS idx_news_category       ON news (category)`
    await sql`CREATE INDEX IF NOT EXISTS idx_news_importance     ON news (importance_score DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_news_scraped_at     ON news (scraped_at DESC)`
    await sql`CREATE INDEX IF NOT EXISTS idx_news_source_url     ON news (source_url)`
    await sql`ALTER TABLE news ENABLE ROW LEVEL SECURITY`

    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='news' AND policyname='Public read access') THEN
          CREATE POLICY "Public read access" ON news FOR SELECT USING (true);
        END IF;
      END $$
    `
    await sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='news' AND policyname='Service role full access') THEN
          CREATE POLICY "Service role full access" ON news FOR ALL USING (auth.role() = 'service_role');
        END IF;
      END $$
    `

    // Reload PostgREST schema cache so the REST API recognizes the new table
    await sql`NOTIFY pgrst, 'reload schema'`

    return NextResponse.json({ ok: true, message: 'news table created successfully' })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  } finally {
    await sql.end()
  }
}
