#!/bin/bash
# FactorLens — Initial NAV sync script
# Run this ONCE to load all historical NAV data into Supabase.
#
# Usage:
#   chmod +x scripts/initial-sync.sh
#   ./scripts/initial-sync.sh
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

SYNCED=0
FAILED=0

for i in $(seq 0 $((TOTAL_BATCHES - 1))); do
  echo -n "  Batch $((i+1))/$TOTAL_BATCHES ... "

  RESPONSE=$(curl -s -X POST \
    "${BASE_URL}/api/nav-sync?action=full&batch=${i}&secret=${SECRET}" \
    -H "Content-Type: application/json" \
    2>&1)

  # Check for error
  if echo "$RESPONSE" | grep -q '"error"'; then
    echo "✗ ERROR: $RESPONSE"
    FAILED=$((FAILED + 1))
  elif echo "$RESPONSE" | grep -q '"synced"'; then
    BATCH_SYNCED=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('synced',0))" 2>/dev/null || echo "?")
    BATCH_FAILED=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('failed',0))" 2>/dev/null || echo "?")
    SYNCED=$((SYNCED + ${BATCH_SYNCED//[^0-9]/}))
    echo "✓  synced ${BATCH_SYNCED} funds (${BATCH_FAILED} failed)"
  else
    echo "? Unexpected response: $RESPONSE"
  fi

  # Small pause between batches to avoid hammering mfapi.in
  if [ $i -lt $((TOTAL_BATCHES - 1)) ]; then
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

NORM_RESPONSE=$(curl -s -X POST \
  "${BASE_URL}/api/nav-sync?action=normalize&secret=${SECRET}" \
  -H "Content-Type: application/json" \
  2>&1)

SPLITS=$(echo "$NORM_RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('splits',0))" 2>/dev/null || echo "?")
echo "  ✓  Normalization complete — $SPLITS splits detected and corrected"
echo ""
echo "  Your FactorLens database is ready!"
echo "  The app will now serve data from Supabase (much faster)."
echo ""
