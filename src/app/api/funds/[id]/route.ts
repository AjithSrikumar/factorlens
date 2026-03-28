export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
)

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const fundId = parseInt(id)

    // Support lookup by numeric ID or by fund code (e.g. "N50")
    let fundQuery
    if (isNaN(fundId)) {
      fundQuery = supabase.from('funds').select('*').eq('code', id).single()
    } else {
      fundQuery = supabase.from('funds').select('*').eq('id', fundId).single()
    }
    const { data: fund, error: fundError } = await fundQuery

    if (fundError || !fund) return NextResponse.json({ error: 'Fund not found' }, { status: 404 })

    // Fetch NAV data (paged)
    const PAGE = 1000
    let navRows: { date: string; nav_value: number }[] = []
    let from = 0
    while (true) {
      const { data, error } = await supabase
        .from('nav_data')
        .select('date, nav_value')
        .eq('fund_id', fund.id)
        .order('date', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) break
      if (!data || data.length === 0) break
      navRows = navRows.concat(data)
      if (data.length < PAGE) break
      from += PAGE
    }

    return NextResponse.json({
      fund,
      nav: navRows.map(r => ({ date: r.date, value: Number(r.nav_value) }))
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
