import { NextResponse } from 'next/server'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'
import { NSE_INDEX_LIST } from '@/lib/index-fund-map'

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ data: [], lastNavDate: null })
  }

  // Insert any indices from NSE_INDEX_LIST that are not yet in Supabase.
  // ignoreDuplicates: true → ON CONFLICT DO NOTHING, so existing rows
  // (including computed metrics) are never overwritten.
  const toInsert = NSE_INDEX_LIST.map(idx => ({
    code:           idx.code,
    name:           idx.name,
    category:       idx.category,
    inception_date: idx.inception,
  }))

  await supabaseAdmin
    .from('funds')
    .upsert(toInsert, { onConflict: 'code', ignoreDuplicates: true })

  // Fetch all funds — ranked first (nulls last), then unranked alphabetically.
  // Try with new period-CAGR columns first; fall back to existing columns if
  // the migration hasn't been applied yet (prevents crash on older DB schema).
  let { data, error } = await supabaseAdmin
    .from('funds')
    .select('id, code, name, category, inception_date, cagr, cagr_1y, cagr_3y, cagr_5y, cagr_10y, cagr_20y, avg_3y_rolling_return, max_drawdown, volatility, sharpe_ratio, calmar_ratio, score, final_rank')
    .order('final_rank', { ascending: true, nullsFirst: false })

  if (error) {
    // New columns likely don't exist yet — fall back to schema without them
    const fallback = await supabaseAdmin
      .from('funds')
      .select('id, code, name, category, inception_date, cagr, avg_3y_rolling_return, max_drawdown, volatility, sharpe_ratio, calmar_ratio, score, final_rank')
      .order('final_rank', { ascending: true, nullsFirst: false })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data  = fallback.data as any
    error = fallback.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get the most recent NAV date across all index funds so the UI can show
  // "Data as of [date]" and warn users when data is stale.
  let lastNavDate: string | null = null
  const { data: latestNav } = await supabaseAdmin
    .from('nav_data')
    .select('date')
    .order('date', { ascending: false })
    .limit(1)
    .single()
  if (latestNav?.date) lastNavDate = latestNav.date as string

  return NextResponse.json({ data: data ?? [], lastNavDate }, { headers: { 'Cache-Control': 'no-store' } })
}
