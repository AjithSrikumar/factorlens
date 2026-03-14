#!/bin/bash
# Trigger the initial MF historical data load in batches.
# Usage: ./scripts/trigger_mf_load.sh <BASE_URL> <SECRET>
#
# Example:
#   ./scripts/trigger_mf_load.sh https://factorlens.vercel.app <your-CRON_SECRET>
#
# The script calls /api/admin/mf-load?offset=N&limit=20&secret=... in a loop
# until the server reports hasMore=false (all 257+ funds processed).

set -euo pipefail

BASE_URL="${1:-}"
SECRET="${2:-}"

if [[ -z "$BASE_URL" || -z "$SECRET" ]]; then
  echo "Usage: $0 <BASE_URL> <CRON_SECRET>"
  echo "  e.g. $0 https://factorlens.vercel.app my-secret-value"
  exit 1
fi

ENDPOINT="$BASE_URL/api/admin/mf-load"
LIMIT=20
OFFSET=0
TOTAL_INSERTED=0
TOTAL_SKIPPED=0
TOTAL_FAILED=0
BATCH=1

echo "=== MF Historical Data Load ==="
echo "Endpoint : $ENDPOINT"
echo "Batch sz : $LIMIT"
echo "Started  : $(date)"
echo ""

while true; do
  URL="${ENDPOINT}?offset=${OFFSET}&limit=${LIMIT}&secret=${SECRET}"
  echo "--- Batch ${BATCH} (offset=${OFFSET}) ---"

  RESPONSE=$(curl -sf "$URL" 2>&1) || {
    echo "ERROR: curl failed for offset=$OFFSET"
    echo "Response: $RESPONSE"
    echo "Retrying in 5s..."
    sleep 5
    continue
  }

  # Extract fields with python3 (universally available)
  HAS_MORE=$(echo "$RESPONSE"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('hasMore','false'))" 2>/dev/null || echo "false")
  NEXT_OFF=$(echo "$RESPONSE"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('nextOffset',0))"     2>/dev/null || echo "0")
  INSERTED=$(echo "$RESPONSE"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('inserted',0))"       2>/dev/null || echo "0")
  SKIPPED=$( echo "$RESPONSE"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('skipped',0))"        2>/dev/null || echo "0")
  FAILED=$(  echo "$RESPONSE"  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('failed',0))"         2>/dev/null || echo "0")
  PROCESSED=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processed',0))"     2>/dev/null || echo "0")

  TOTAL_INSERTED=$((TOTAL_INSERTED + INSERTED))
  TOTAL_SKIPPED=$((TOTAL_SKIPPED   + SKIPPED))
  TOTAL_FAILED=$((TOTAL_FAILED     + FAILED))

  echo "  processed=$PROCESSED  inserted=$INSERTED  skipped=$SKIPPED  failed=$FAILED"

  # Print log lines from response
  echo "$RESPONSE" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for line in d.get('log', []):
    print('  LOG:', line)
" 2>/dev/null || true

  if [[ "$HAS_MORE" != "true" ]]; then
    echo ""
    echo "=== Load complete ==="
    echo "Total inserted : $TOTAL_INSERTED rows"
    echo "Total skipped  : $TOTAL_SKIPPED funds"
    echo "Total failed   : $TOTAL_FAILED funds"
    echo "Finished       : $(date)"
    break
  fi

  OFFSET="$NEXT_OFF"
  BATCH=$((BATCH + 1))
  echo "  Next batch in 3s..."
  sleep 3
done
