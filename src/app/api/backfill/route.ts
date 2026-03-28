export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { NSE_INDEX_LIST } from '@/lib/index-fund-map'

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key'
)

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04',
  May: '05', Jun: '06', Jul: '07', Aug: '08',
  Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}
const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function niftyDateToISO(s: string): string {
  const parts = s.trim().split(/\s+/)
  if (parts.length !== 3) return ''
  const [day, mon, year] = parts
  const month = MONTHS[mon]
  if (!month) return ''
  return `${year}-${month}-${day.padStart(2, '0')}`
}

function isoToNiftyReqDate(iso: string): string {
  const d = new Date(iso)
  const day = String(d.getUTCDate()).padStart(2, '0')
  const mon = MON_NAMES[d.getUTCMonth()]
  const year = d.getUTCFullYear()
  return `${day}-${mon}-${year}`
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function parseNum(s: string): number {
  return parseFloat(String(s).replace(/,/g, ''))
}

function todayIST(): string {
  const now = new Date()
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000)
  return ist.toISOString().slice(0, 10)
}

async function fetchNiftyIndex(
  indexName: string,
  fromISO: string,
  toISO: string
): Promise<{ date: string; value: number; rawFields?: Record<string, string> }[]> {
  const cinfo = JSON.stringify({
    name: indexName,
    startDate: isoToNiftyReqDate(fromISO),
    endDate: isoToNiftyReqDate(toISO),
    indexName: indexName,
  })

  const res = await fetch(
    'https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString',
    {
      method: 'POST',
      headers: {
        'Content-Type':     'application/json; charset=utf-8',
        'Accept':           'application/json, text/javascript, */*; q=0.01',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer':          'https://www.niftyindices.com/reports/historical-data',
        'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
      body: JSON.stringify({ cinfo }),
      signal: AbortSignal.timeout(25_000),
    }
  )

  if (!res.ok) throw new Error(`niftyindices HTTP ${res.status}`)

  const outer = await res.json() as { d: string }
  if (!outer.d) return []

  let rows: Record<string, string>[]
  try {
    rows = JSON.parse(outer.d)
  } catch {
    return []
  }

  // Try all known value field names
  const parsed = rows.map((row) => {
    const dateStr = row['HistoricalDate'] ?? row['Date'] ?? row['date'] ?? ''
    const closeStr =
      row['CLOSE'] ?? row['Close'] ?? row['close'] ??
      row['TotalReturnsIndex'] ?? row['IndexValue'] ?? row['Value'] ??
      row['CloseValue'] ?? row['NET_ASSET_VALUE'] ?? ''
    const date = niftyDateToISO(dateStr)
    const value = parseNum(closeStr)
    return { date, value, rawFields: row }
  }).filter((r) => r.date.length === 10 && !isNaN(r.value) && r.value > 0)

  const deduped = new Map<string, number>()
  for (const r of parsed) deduped.set(r.date, r.value)
  return Array.from(deduped.entries())
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const secret = url.searchParams.get('secret') ?? ''
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && secret !== cronSecret) {
    const authHeader = req.headers.get('authorization') ?? ''
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ?probe=NTM&name=CUSTOM+NAME → test what API returns for that code/name, without inserting
  const probeCode = url.searchParams.get('probe')
  if (probeCode) {
    const entry = NSE_INDEX_LIST.find(i => i.code === probeCode)
    const customName = url.searchParams.get('name')
    const testName = customName ?? entry?.name ?? probeCode
    if (!entry && !customName) return NextResponse.json({ error: `Code ${probeCode} not in NSE_INDEX_LIST` })

    const today = todayIST()
    const fromISO = addDays(today, -30)
    try {
      const res = await fetch(
        'https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': 'https://www.niftyindices.com/reports/historical-data',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
          body: JSON.stringify({ cinfo: JSON.stringify({
            name: testName,
            startDate: isoToNiftyReqDate(fromISO),
            endDate: isoToNiftyReqDate(today),
            indexName: testName,
          })}),
          signal: AbortSignal.timeout(25_000),
        }
      )
      const outer = await res.json() as { d: string }
      let rows: unknown[] = []
      try { rows = JSON.parse(outer.d) } catch { /* empty */ }
      return NextResponse.json({
        code: probeCode,
        testedName: testName,
        httpStatus: res.status,
        rowCount: rows.length,
        firstRow: rows[0] ?? null,
        d_raw: outer.d?.slice(0, 500),
      })
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }

  // ?findnames=NTM,NLMC250 → try many name variations and return which work
  const findNames = url.searchParams.get('findnames')
  if (findNames) {
    const codes = findNames.split(',').map(s => s.trim())
    const today = todayIST()
    const fromISO = addDays(today, -30)
    const results: Record<string, string | null> = {}

    // Helper to test a name
    async function testName(testName: string): Promise<boolean> {
      try {
        const res = await fetch(
          'https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Accept': 'application/json, text/javascript, */*; q=0.01',
              'X-Requested-With': 'XMLHttpRequest',
              'Referer': 'https://www.niftyindices.com/reports/historical-data',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            },
            body: JSON.stringify({ cinfo: JSON.stringify({ name: testName, startDate: isoToNiftyReqDate(fromISO), endDate: isoToNiftyReqDate(today), indexName: testName }) }),
            signal: AbortSignal.timeout(15_000),
          }
        )
        const outer = await res.json() as { d: string }
        const rows = JSON.parse(outer.d ?? '[]') as unknown[]
        return rows.length > 0
      } catch {
        return false
      }
    }

    for (const code of codes.slice(0, 5)) {
      const entry = NSE_INDEX_LIST.find(i => i.code === code)
      if (!entry) { results[code] = 'NOT IN LIST'; continue }

      const base = entry.name
      // Generate variations
      const variations = [
        base,
        base.replace('MARKET', 'MKT'),
        base.replace('LARGEMIDCAP', 'LARGEMID').replace(' ', ''),
        base.replace(' AND ', ' & ').replace(' & ', ' and '),
        base.replace('SMALLCAP', 'SMALL CAP'),
        base.replace('MIDCAP', 'MID CAP'),
        // Title case version
        base.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' '),
        // Try without spaces in number parts
        base.replace(/(\D)\s+(\d)/, '$1$2'),
        base.replace('EQUAL WEIGHT', 'EW'),
        base.replace('FINANCIAL SERVICES', 'FIN SERV'),
        base.replace('FINANCIAL SERVICES', 'FINANCIAL SVC'),
        base.replace('SELECT', 'SEL'),
        base.replace('DIVIDEND', 'DIV'),
        base.replace('INFRASTRUCTURE', 'INFRA'),
        base.replace('MANUFACTURING', 'MFG'),
        base.replace('CONSUMER DURABLES', 'CON DUR'),
        base.replace('LOW VOLATILITY', 'LV'),
        base.replace(' BANK', 'BANK'),
      ]

      let found = null
      for (const v of [...new Set(variations)]) {
        if (await testName(v)) { found = v; break }
        await new Promise(r => setTimeout(r, 200))
      }
      results[code] = found
    }

    return NextResponse.json({ results })
  }

  // ?codes=NTM,NLMC250,... → process only these codes
  // if omitted, process all codes with no nav data
  const codesParam = url.searchParams.get('codes')
  const today = todayIST()
  const log: string[] = [`[backfill] started ${new Date().toISOString()} today=${today}`]
  const startTime = Date.now()

  try {
    // Load all funds
    const { data: funds } = await supabase.from('funds').select('id, code, inception_date')
    if (!funds) return NextResponse.json({ error: 'Failed to load funds' }, { status: 500 })

    const codeToId        = new Map<string, number>(funds.map(f => [f.code, f.id]))
    const codeToInception = new Map<string, string>(funds.map(f => [f.code, (f.inception_date as string | null) ?? '2005-01-03']))

    // Determine which codes to process
    let targetCodes: string[]
    if (codesParam) {
      targetCodes = codesParam.split(',').map(s => s.trim()).filter(Boolean)
    } else {
      // Find all NSE indices with no data
      const { data: fundIds } = await supabase.from('nav_data').select('fund_id').limit(1)
      // Get funds that have nav data
      const { data: fundsWithData } = await supabase
        .from('nav_data')
        .select('fund_id')
        .limit(5000)
      const idsWithData = new Set((fundsWithData ?? []).map(r => (r as { fund_id: number }).fund_id))
      targetCodes = NSE_INDEX_LIST
        .filter(idx => {
          const id = codeToId.get(idx.code)
          return id && !idsWithData.has(id)
        })
        .map(idx => idx.code)
      void fundIds
    }

    log.push(`[backfill] processing ${targetCodes.length} codes: ${targetCodes.slice(0, 10).join(',')}${targetCodes.length > 10 ? '...' : ''}`)

    const DEADLINE_MS = 260_000
    let totalInserted = 0

    for (const code of targetCodes) {
      if (Date.now() - startTime > DEADLINE_MS) {
        log.push(`[backfill] time budget reached after ${Math.round((Date.now() - startTime)/1000)}s`)
        break
      }

      const entry = NSE_INDEX_LIST.find(i => i.code === code)
      if (!entry) { log.push(`[${code}] not in NSE_INDEX_LIST`); continue }

      const fundId = codeToId.get(code)
      if (!fundId) { log.push(`[${code}] not in DB`); continue }

      const inception = codeToInception.get(code) ?? entry.inception ?? '2005-01-03'

      // Check latest nav date
      const { data: latestRow } = await supabase
        .from('nav_data')
        .select('date, nav_value')
        .eq('fund_id', fundId)
        .order('date', { ascending: false })
        .limit(1)

      const last = latestRow?.[0]
      const isNew = !last

      if (!isNew && addDays(last!.date, 1) > today) {
        log.push(`[${code}] already up to date (${last!.date})`)
        continue
      }

      const fromISO = isNew ? inception : addDays(last!.date, -20)
      const newAfter = isNew ? '' : last!.date

      try {
        const rawRows = await fetchNiftyIndex(entry.name, fromISO, today)

        if (rawRows.length === 0) {
          log.push(`[${code}] WARNING: API returned 0 rows (name="${entry.name}")`)
          await new Promise(r => setTimeout(r, 500))
          continue
        }

        // Compute scale factor to maintain continuity with existing data
        let scale = 1
        if (!isNew && last) {
          const candidates = rawRows.filter(r => r.date <= last!.date)
          if (candidates.length > 0) {
            const anchor = candidates[candidates.length - 1]
            if (anchor.value > 0) scale = last!.value / anchor.value
          }
        }

        const toInsert = rawRows
          .filter(r => r.date > newAfter)
          .map(r => ({ fund_id: fundId, date: r.date, nav_value: r.value * scale }))

        if (toInsert.length === 0) {
          log.push(`[${code}] no new rows after ${newAfter}`)
          continue
        }

        // Insert in batches of 500
        const BATCH = 500
        let inserted = 0
        for (let i = 0; i < toInsert.length; i += BATCH) {
          const batch = toInsert.slice(i, i + BATCH)
          const { error } = await supabase
            .from('nav_data')
            .upsert(batch, { onConflict: 'fund_id,date' })
          if (!error) inserted += batch.length
        }

        totalInserted += inserted
        log.push(`[${code}] inserted ${inserted} rows (${toInsert[0].date} → ${toInsert[toInsert.length-1].date})`)
      } catch (e) {
        log.push(`[${code}] ERROR: ${e}`)
      }

      await new Promise(r => setTimeout(r, 300))
    }

    log.push(`[backfill] done. total inserted=${totalInserted} elapsed=${Math.round((Date.now()-startTime)/1000)}s`)
    return NextResponse.json({ ok: true, log }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    log.push(`[backfill] fatal error: ${e}`)
    return NextResponse.json({ ok: false, log, error: String(e) }, { status: 500 })
  }
}
