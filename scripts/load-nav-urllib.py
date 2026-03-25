"""
Load all NAV data from data.json into production Supabase nav_data table.
Uses urllib (respects system proxy) instead of psycopg2 or node fetch.
"""

import json, urllib.request, urllib.error, time, sys

PROD_URL = 'https://cxmaeueobsqrbivoqvry.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN4bWFldWVvYnNxcmJpdm9xdnJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ4NDY3MSwiZXhwIjoyMDg4MDYwNjcxfQ.4-ncVjM6FN8G77x82RYMdanJH6Vo-_nJ0JruPx8N-Ac'
HEADERS = {
    'apikey': KEY,
    'Authorization': f'Bearer {KEY}',
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
}

def get(path):
    req = urllib.request.Request(f'{PROD_URL}/rest/v1{path}', headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())

def post(path, data):
    body = json.dumps(data).encode()
    req = urllib.request.Request(f'{PROD_URL}/rest/v1{path}', data=body, headers=HEADERS, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return None
    except urllib.error.HTTPError as e:
        return e.read().decode()

print('Loading data.json...')
with open('/home/user/factorlens/data.json') as f:
    data = json.load(f)

nav_records = data['sheets']['NAV_Series']['records']
print(f'NAV records: {len(nav_records)}')

# Get all fund codes -> id from production
funds = get('/funds?select=id,code&limit=500')
code_to_id = {f['code']: f['id'] for f in funds}
print(f'Production funds: {len(funds)}')

# Find funds that already have data
existing = get('/nav_data?select=fund_id&limit=10000')
funds_with_data = set(r['fund_id'] for r in existing)
print(f'Funds already with data: {sorted(funds_with_data)}')

# NAV columns
nav_cols = [k for k in nav_records[0].keys() if k not in ('Row', 'Date')]
print(f'NAV columns: {nav_cols}')

CHUNK = 300
total_inserted = 0

for col in nav_cols:
    fund_id = code_to_id.get(col)
    if not fund_id:
        print(f'SKIP {col}: no matching fund in DB')
        continue
    if fund_id in funds_with_data:
        print(f'SKIP {col} (fund_id={fund_id}): already has data')
        continue

    rows = [
        {'fund_id': fund_id, 'date': rec['Date'], 'nav_value': rec[col]}
        for rec in nav_records
        if rec.get(col) is not None and rec[col] > 0
    ]

    if not rows:
        print(f'SKIP {col}: no valid values')
        continue

    errors = 0
    for i in range(0, len(rows), CHUNK):
        chunk = rows[i:i + CHUNK]
        err = post('/nav_data', chunk)
        if err:
            print(f'  ERROR chunk {i//CHUNK + 1}: {err[:200]}')
            errors += 1
        time.sleep(0.05)  # small delay to avoid rate limits

    total_inserted += len(rows)
    print(f'DONE  {col:20s} (fund_id={fund_id:5d}): {len(rows)} rows, {errors} errors')
    sys.stdout.flush()

print(f'\nFinished. Total rows inserted: {total_inserted}')
