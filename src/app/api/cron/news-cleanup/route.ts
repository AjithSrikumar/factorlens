export const dynamic = 'force-dynamic'

/**
 * /api/cron/news-cleanup
 *
 * Daily cron: delete news articles older than 7 days.
 * Keeps the news table lean and relevant.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
)

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.get('authorization') ?? ''
  return auth === `Bearer ${secret}` || req.nextUrl.searchParams.get('secret') === secret
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error, count } = await supabase
    .from('news')
    .delete({ count: 'exact' })
    .lt('published_at', cutoff)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: count ?? 0, cutoff })
}
