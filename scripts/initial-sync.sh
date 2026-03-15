#!/bin/bash
# FactorLens — Initial NAV sync script
# Run this ONCE to load all historical NAV data into Supabase.
#
# Usage (Git Bash / WSL / macOS / Linux):
#   bash scripts/initial-sync.sh
#
# Make sure your dev server is running first: npm run dev

BASE_URL="http://localhost:3000"
SECRET="factorlens2024"   # ← must match SYNC_SECRET in .env.local
TOTAL_BATCHES=26

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║      FactorLens — Initial NAV Sync               ║"
echo "║  This will load ~257 funds into Supabase.        ║"
echo "║  Takes about 10-15 minutes total. Please wait.   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# json_field <json> <key>  — extract a numeric field without python/jq
json_field() {
  echo "$1" | grep -o "\"$2\":[0-9]*" | grep -o '[0-9]*$'
}

SYNCED=0
FAILED=0

for i in $(seq 0 $((TOTAL_BATCHES - 1))); do
  echo -n "  Batch $((i+1))/$TOTAL_BATCHES ... "

  # Single-line curl avoids CRLF/backslash-continuation issues on Windows
  RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" "${BASE_URL}/api/nav-sync?action=full&batch=${i}&secret=${SECRET}" 2>&1)

  if echo "$RESPONSE" | grep -q '"error"'; then
    echo "✗ ERROR: $RESPONSE"
    FAILED=$((FAILED + 1))
  elif echo "$RESPONSE" | grep -q '"synced"'; then
    BATCH_SYNCED=$(json_field "$RESPONSE" "synced")
    BATCH_FAILED=$(json_field "$RESPONSE" "failed")
    BATCH_SYNCED=${BATCH_SYNCED:-0}
    BATCH_FAILED=${BATCH_FAILED:-0}
    SYNCED=$((SYNCED + BATCH_SYNCED))
    echo "✓  synced ${BATCH_SYNCED} funds (${BATCH_FAILED} failed)"
  else
    echo "? Unexpected response: $RESPONSE"
  fi

  # Small pause between batches to avoid hammering mfapi.in
  if [ "$i" -lt $((TOTAL_BATCHES - 1)) ]; then
    sleep 2
  fi
done

echo ""
echo "────────────────────────────────────────────────────"
echo "  Full sync complete!"
echo "  Total synced: ~$SYNCED funds"
echo ""
echo "  Now running normalization (fixes NAV splits)..."
echo ""

NORM_RESPONSE=$(curl -s -X POST -H "Content-Type: application/json" "${BASE_URL}/api/nav-sync?action=normalize&secret=${SECRET}" 2>&1)

SPLITS=$(json_field "$NORM_RESPONSE" "splits")
SPLITS=${SPLITS:-0}
echo "  ✓  Normalization complete — $SPLITS splits detected and corrected"
echo ""
echo "  Your FactorLens database is ready!"
echo "  The app will now serve data from Supabase (much faster)."
echo ""
