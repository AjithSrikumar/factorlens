export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import {
  fetchNavData,
  fetchStoredRegimeScores,
  runBacktest,
} from '@/lib/maverst-engine'

export const revalidate = 86400   // cache 24h — backtest only changes daily

export async function GET() {
  try {
    const [navData, regimeHistory] = await Promise.all([
      fetchNavData(supabaseAdmin, '2010-01-01'),
      fetchStoredRegimeScores(supabaseAdmin, '2012-01-01'),
    ])

    if (regimeHistory.length === 0) {
      return NextResponse.json({ error: 'No regime history — run /api/cron/maverst-eod?backfill=true first' }, { status: 503 })
    }

    const result = runBacktest(navData, regimeHistory, '2012-01-01')
    if (!result) {
      return NextResponse.json({ error: 'Insufficient NAV data for backtest' }, { status: 503 })
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[maverst/backtest]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
