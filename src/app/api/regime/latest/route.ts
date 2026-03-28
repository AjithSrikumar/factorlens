import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import {
  fetchNavData,
  fetchExternalData,
  computeRawIndicatorsAtIdx,
  computeRollingZScores,
  buildRegimeResult,
  type RegimeResult,
} from '@/lib/maverst-engine'

export const revalidate = 3600   // cache 1 hour

export async function GET() {
  try {
    // 1. Try to serve from pre-computed scores (fast path)
    const { data: stored } = await supabaseAdmin
      .from('maverst_regime_scores')
      .select('*')
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (stored) {
      const result: RegimeResult = {
        date:       stored.date,
        score:      Number(stored.score),
        regime:     stored.regime,
        confidence: stored.confidence,
        allocation: { midcapMomentum: Number(stored.alloc_momentum), gold: Number(stored.alloc_gold) },
        indicators: [
          { key: 'trend',       label: 'Trend',         description: 'Nifty 50 vs 200-day moving average',                   rawValue: stored.raw_trend,        zscore: stored.z_trend,       weight: 1/9, interpretation: '' },
          { key: 'momentum',    label: 'Momentum',       description: 'Nifty 50 12-month price return',                        rawValue: stored.raw_momentum,     zscore: stored.z_momentum,    weight: 1/9, interpretation: '' },
          { key: 'midcapRatio', label: 'Midcap Ratio',   description: 'Midcap 150 vs Nifty 50 relative strength (1M)',         rawValue: stored.raw_midcap_ratio, zscore: stored.z_midcap_ratio,weight: 1/9, interpretation: '' },
          { key: 'ewRatio',     label: 'Breadth',        description: 'Equal-weight vs cap-weight breadth (1M)',                rawValue: stored.raw_ew_ratio,     zscore: stored.z_ew_ratio,    weight: 1/9, interpretation: '' },
          { key: 'vix',         label: 'Volatility',     description: 'India VIX — lower is better for equities',              rawValue: stored.raw_vix,          zscore: stored.z_vix,         weight: 1/9, interpretation: '' },
          { key: 'goldRatio',   label: 'Gold Signal',    description: 'Gold vs equity relative strength (1M)',                  rawValue: stored.raw_gold_ratio,   zscore: stored.z_gold_ratio,  weight: 1/9, interpretation: '' },
          { key: 'usdinr',      label: 'Rupee Strength', description: 'USD/INR 1-month change — strong rupee = growth',         rawValue: stored.raw_usdinr,       zscore: stored.z_usdinr,      weight: 1/9, interpretation: '' },
          { key: 'fiiFlows',    label: 'FII Activity',   description: '20-day cumulative FII net equity flows (₹ crore)',        rawValue: stored.raw_fii_flows,    zscore: stored.z_fii_flows,   weight: 1/9, interpretation: '' },
          { key: 'sectorRatio', label: 'Risk Appetite',  description: 'High Beta vs Low Volatility relative strength (1M)',     rawValue: stored.raw_sector_ratio, zscore: stored.z_sector_ratio,weight: 1/9, interpretation: '' },
        ].map(ind => ({
          ...ind,
          rawValue: ind.rawValue != null ? Number(ind.rawValue) : null,
          zscore:   ind.zscore   != null ? Number(ind.zscore)   : null,
          interpretation: interpretZ(Number(ind.zscore), ind.label),
        })),
        keyDrivers:  [],
        insightLine: '',
      }
      // Derive keyDrivers
      result.keyDrivers = [...result.indicators]
        .filter(i => i.zscore !== null)
        .sort((a, b) => Math.abs(b.zscore!) - Math.abs(a.zscore!))
        .slice(0, 3)
      result.insightLine = insightLine(result.regime, result.confidence)
      return NextResponse.json(result)
    }

    // 2. Compute on-the-fly if no stored data
    const navData     = await fetchNavData(supabaseAdmin, '2010-01-01')
    const extData     = await fetchExternalData(supabaseAdmin, '2010-01-01')
    const n50         = navData.get('N50') ?? []
    if (n50.length === 0) return NextResponse.json({ error: 'No NAV data available' }, { status: 503 })

    const extMap = new Map(extData.map(r => [r.date, r]))
    const rawSeries = n50.map((_, idx) => ({
      date: n50[idx].date,
      raw:  computeRawIndicatorsAtIdx(navData, extMap, idx),
    }))
    const zRows  = computeRollingZScores(rawSeries)
    const latest = zRows.at(-1)
    if (!latest) return NextResponse.json({ error: 'Insufficient history' }, { status: 503 })

    return NextResponse.json(buildRegimeResult(latest))
  } catch (err) {
    console.error('[regime/latest]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

function interpretZ(z: number | null, label: string): string {
  if (z === null || isNaN(z)) return 'Insufficient data'
  if (z > 1)    return `${label} is strongly bullish`
  if (z > 0.3)  return `${label} is mildly bullish`
  if (z > -0.3) return `${label} is neutral`
  if (z > -1)   return `${label} is mildly bearish`
  return `${label} is strongly bearish`
}

const INSIGHT: Record<string, Record<string, string>> = {
  Growth:    { High: 'Strong bullish signal — momentum, breadth, and trend are all aligned.', Medium: 'Moderately bullish — most indicators point to continued market strength.', Low: 'Mildly positive — market conditions lean growth but conviction is limited.' },
  Neutral:   { High: 'Mixed signals — the model is inconclusive; stay balanced.', Medium: 'Balanced environment — no clear directional edge in either direction.', Low: 'Transitional phase — monitor closely for confirmation of next trend.' },
  Defensive: { High: 'Risk-off signal — multiple indicators flagging elevated downside risk.', Medium: 'Cautious posture warranted — several signals are flashing defensively.', Low: 'Mild caution advised — early signs of weakening, but not yet confirmed.' },
}
function insightLine(regime: string, confidence: string): string {
  return INSIGHT[regime]?.[confidence] ?? ''
}
