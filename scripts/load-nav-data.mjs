/**
 * One-time script: load all NAV data from data.json into production Supabase nav_data table.
 * Skips funds that already have data.
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const PROD_URL = 'https://cxmaeueobsqrbivoqvry.supabase.co'
const PROD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bWFldWVvYnNxcmJpdm9xdnJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ4NDY3MSwiZXhwIjoyMDg4MDYwNjcxfQ.4-ncVjM6FN8G77x82RYMdanJH6Vo-_nJ0JruPx8N-Ac'

const supabase = createClient(PROD_URL, PROD_KEY)

console.log('Loading data.json...')
const raw = readFileSync('/home/user/factorlens/data.json', 'utf8')
const data = JSON.parse(raw)
const navRecords = data.sheets.NAV_Series.records
console.log(`NAV records in data.json: ${navRecords.length}`)

// Fetch all fund codes -> id from production
const { data: funds, error: fundsErr } = await supabase
  .from('funds')
  .select('id, code')
  .limit(500)

if (fundsErr) { console.error('Failed to fetch funds:', fundsErr.message); process.exit(1) }

const codeToId = {}
for (const f of funds) codeToId[f.code] = f.id
console.log(`Production funds loaded: ${funds.length}`)

// Codes in the NAV data (excluding Row/Date meta columns)
const navCols = Object.keys(navRecords[0]).filter(k => k !== 'Row' && k !== 'Date')
console.log(`NAV columns in data.json: ${navCols.join(', ')}`)

// Find which funds already have data
const { data: existingCounts } = await supabase
  .from('nav_data')
  .select('fund_id')
  .limit(10000)

const fundsWithData = new Set((existingCounts || []).map(r => r.fund_id))
console.log(`Funds already with nav_data: ${[...fundsWithData].join(', ')}`)

let totalInserted = 0

for (const col of navCols) {
  const fundId = codeToId[col]
  if (!fundId) {
    console.log(`SKIP ${col}: no matching fund in DB`)
    continue
  }
  if (fundsWithData.has(fundId)) {
    console.log(`SKIP ${col} (fund_id=${fundId}): already has data`)
    continue
  }

  const rows = []
  for (const rec of navRecords) {
    const val = rec[col]
    if (val !== null && val !== undefined && val > 0) {
      rows.push({ fund_id: fundId, date: rec.Date, nav_value: val })
    }
  }

  if (rows.length === 0) {
    console.log(`SKIP ${col}: no non-null values`)
    continue
  }

  // Insert in chunks of 500
  const CHUNK = 500
  let errors = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabase.from('nav_data').insert(chunk)
    if (error) {
      console.error(`  ERROR chunk ${Math.floor(i/CHUNK)+1}: ${error.message}`)
      errors++
    }
  }

  totalInserted += rows.length
  console.log(`DONE ${col} (fund_id=${fundId}): ${rows.length} rows, ${Math.ceil(rows.length/CHUNK)} chunks, ${errors} errors`)
}

console.log(`\nFinished. Total rows inserted: ${totalInserted}`)
