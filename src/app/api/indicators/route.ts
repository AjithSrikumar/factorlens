export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'

export const revalidate = 3600

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('maverst_regime_scores')
      .select(`
        date, score, regime,
        z_trend, z_momentum, z_midcap_ratio, z_ew_ratio, z_vix,
        z_gold_ratio, z_usdinr, z_fii_flows, z_sector_ratio,
        raw_trend, raw_momentum, raw_midcap_ratio, raw_ew_ratio, raw_vix,
        raw_gold_ratio, raw_usdinr, raw_fii_flows, raw_sector_ratio
      `)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'No indicator data available' }, { status: 404 })
    }

    const indicators = [
      { key: 'trend',       label: 'Trend',         description: 'Nifty 50 vs 200-day moving average',               direction:  1, zscore: data.z_trend,        raw: data.raw_trend        },
      { key: 'momentum',    label: 'Momentum',       description: 'Nifty 50 12-month price return',                   direction:  1, zscore: data.z_momentum,     raw: data.raw_momentum     },
      { key: 'midcapRatio', label: 'Midcap Ratio',   description: 'Midcap 150 vs Nifty 50 relative strength (1M)',    direction:  1, zscore: data.z_midcap_ratio, raw: data.raw_midcap_ratio },
      { key: 'ewRatio',     label: 'Breadth',        description: 'Equal-weight vs cap-weight breadth (1M)',           direction:  1, zscore: data.z_ew_ratio,     raw: data.raw_ew_ratio     },
      { key: 'vix',         label: 'Volatility',     description: 'India VIX — lower is better for equities',         direction: -1, zscore: data.z_vix,          raw: data.raw_vix          },
      { key: 'goldRatio',   label: 'Gold Signal',    description: 'Gold vs equity relative strength (1M)',             direction: -1, zscore: data.z_gold_ratio,   raw: data.raw_gold_ratio   },
      { key: 'usdinr',      label: 'Rupee Strength', description: 'USD/INR 1-month change',                           direction: -1, zscore: data.z_usdinr,       raw: data.raw_usdinr       },
      { key: 'fiiFlows',    label: 'FII Activity',   description: '20-day cumulative FII net equity flows (₹ crore)',  direction:  1, zscore: data.z_fii_flows,    raw: data.raw_fii_flows    },
      { key: 'sectorRatio', label: 'Risk Appetite',  description: 'High Beta vs Low Volatility relative strength (1M)',direction:  1, zscore: data.z_sector_ratio, raw: data.raw_sector_ratio },
    ].map(ind => ({
      ...ind,
      zscore:         ind.zscore != null ? Number(ind.zscore) : null,
      raw:            ind.raw    != null ? Number(ind.raw)    : null,
      sentiment:      zToSentiment(ind.zscore != null ? Number(ind.zscore) : null),
    }))

    return NextResponse.json({
      date:       data.date,
      score:      Number(data.score),
      regime:     data.regime,
      indicators,
    })
  } catch (err) {
    console.error('[indicators]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function zToSentiment(z: number | null): 'strongly bullish' | 'bullish' | 'neutral' | 'bearish' | 'strongly bearish' | 'unavailable' {
  if (z === null) return 'unavailable'
  if (z > 1)    return 'strongly bullish'
  if (z > 0.3)  return 'bullish'
  if (z > -0.3) return 'neutral'
  if (z > -1)   return 'bearish'
  return 'strongly bearish'
}
