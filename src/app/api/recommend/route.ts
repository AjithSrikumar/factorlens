export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase-server'
import {
  computeRiskScore,
  getRiskCategory,
  selectAndWeightFunds,
  MF_ELIGIBLE_CODES,
  GOLD_CODE,
} from '@/lib/risk-engine'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const { q1, q2, q3, q4 } = body
  if ([q1, q2, q3, q4].some(v => typeof v !== 'number')) {
    return NextResponse.json({ error: 'q1–q4 must be numbers' }, { status: 400 })
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const score    = computeRiskScore({ q1, q2, q3, q4 })
  const category = getRiskCategory(score)

  // Fetch all MF-eligible index funds and the Gold fund in parallel
  const [fundsResult, goldResult] = await Promise.all([
    supabaseAdmin
      .from('funds')
      .select('id, code, name, category, cagr_10y, cagr_20y, avg_3y_rolling_return, sharpe_ratio, max_drawdown, score, final_rank')
      .in('code', Array.from(MF_ELIGIBLE_CODES)),
    supabaseAdmin
      .from('funds')
      .select('id, code, name, category, cagr_10y, cagr_20y, avg_3y_rolling_return, sharpe_ratio, max_drawdown, score, final_rank')
      .eq('code', GOLD_CODE)
      .maybeSingle(),
  ])

  if (fundsResult.error) {
    return NextResponse.json({ error: fundsResult.error.message }, { status: 500 })
  }
  if (!fundsResult.data?.length) {
    return NextResponse.json({ error: 'No eligible funds found in database' }, { status: 500 })
  }

  const recommended = selectAndWeightFunds(
    fundsResult.data,
    category,
    goldResult.data ?? null,
  )

  return NextResponse.json(
    { score, category, funds: recommended },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
