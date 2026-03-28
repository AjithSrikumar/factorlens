import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const revalidate = 3600

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('maverst_regime_scores')
      .select('date, score, regime, confidence, alloc_momentum, alloc_gold')
      .order('date', { ascending: true })

    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[regime/history]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
