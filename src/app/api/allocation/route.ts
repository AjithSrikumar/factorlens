export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const revalidate = 3600

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('maverst_regime_scores')
      .select('date, regime, confidence, alloc_momentum, alloc_gold')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'No allocation data available' }, { status: 404 })
    }

    return NextResponse.json({
      date:            data.date,
      regime:          data.regime,
      confidence:      data.confidence,
      midcapMomentum:  Number(data.alloc_momentum),
      gold:            Number(data.alloc_gold),
      assets: [
        { name: 'Nifty Midcap150 Momentum 50', code: 'MC150M50', weight: Number(data.alloc_momentum) },
        { name: 'Gold ETF',                     code: 'GOLD',     weight: Number(data.alloc_gold) },
      ],
    })
  } catch (err) {
    console.error('[allocation]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
