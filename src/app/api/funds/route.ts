import { NextResponse } from 'next/server'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'
import { NSE_INDEX_LIST } from '@/lib/index-fund-map'

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json([])
  }

  // Auto-insert any indices from NSE_INDEX_LIST that are not yet in Supabase.
  // ignoreDuplicates: true → ON CONFLICT (code) DO NOTHING
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
  const { data, error } = await supabaseAdmin
    .from('funds')
    .select('id, code, name, category, inception_date, cagr, avg_3y_rolling_return, max_drawdown, volatility, sharpe_ratio, calmar_ratio, score, final_rank')
    .order('final_rank', { ascending: true, nullsFirst: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
