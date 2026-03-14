#!/usr/bin/env python3
"""
FactorLens Database Migration Script
=====================================
Migrates all data from the OLD Supabase project to the NEW one.

Prerequisites (run from this repo root):
    pip install psycopg2-binary requests

Usage:
    python scripts/migrate_to_new_supabase.py

IMPORTANT: Run scripts/schema.sql in the new Supabase SQL Editor FIRST:
    https://supabase.com/dashboard/project/lerpchldswooqrfscuig/editor
"""

from __future__ import annotations

import os
import sys
import time
import json
import psycopg2
import requests
from psycopg2.extras import RealDictCursor

# ── Old Supabase (source) ──────────────────────────────────────────────────────
# Can be overridden with OLD_DB_URL env var
OLD_DB_URL = os.getenv(
    "OLD_DB_URL",
    "postgresql://postgres.cxmaeueobsqrbivoqvry"
    ":74d4pPImwlV0sCH3LDrUUsB9OIkKHNzSrRZyht8OyWiWSGPr7uA8Iz1qRqlJCxQn"
    "@aws-0-us-west-2.pooler.supabase.com:5432/postgres",
)

# ── New Supabase (destination) ─────────────────────────────────────────────────
# Set NEW_SUPABASE_URL and NEW_SERVICE_ROLE_KEY in your environment, or update here.
NEW_SUPABASE_URL     = os.getenv("NEW_SUPABASE_URL", "https://lerpchldswooqrfscuig.supabase.co")
NEW_SERVICE_ROLE_KEY = os.getenv("NEW_SERVICE_ROLE_KEY", "")

if not NEW_SERVICE_ROLE_KEY:
    print("ERROR: Set NEW_SERVICE_ROLE_KEY env var to the new Supabase service role key.")
    sys.exit(1)

HEADERS = {
    "apikey":        NEW_SERVICE_ROLE_KEY,
    "Authorization": f"Bearer {NEW_SERVICE_ROLE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "resolution=merge-duplicates,return=minimal",
}

BATCH_SIZE = 500


# ── REST API helpers ───────────────────────────────────────────────────────────

def rest_upsert(table: str, rows: list[dict]) -> None:
    """Upsert a batch of rows into the new Supabase via REST API."""
    if not rows:
        return
    url = f"{NEW_SUPABASE_URL}/rest/v1/{table}"
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        resp = requests.post(url, headers=HEADERS, data=json.dumps(batch, default=str))
        if resp.status_code not in (200, 201):
            print(f"  ERROR inserting batch into {table}: {resp.status_code} {resp.text[:300]}")
            sys.exit(1)
        print(f"  Upserted rows {i+1}–{min(i+BATCH_SIZE, len(rows))} / {len(rows)}")


def verify_schema() -> None:
    """Check that the target tables exist in the new Supabase."""
    print("\nVerifying schema in new Supabase…")
    for table in ("funds", "nav_data", "mf_funds", "mf_nav_data"):
        url = f"{NEW_SUPABASE_URL}/rest/v1/{table}?limit=1"
        r = requests.get(url, headers=HEADERS)
        if r.status_code == 200:
            print(f"  ✓ {table}")
        else:
            print(f"\n  ✗ Table '{table}' not found (HTTP {r.status_code}).")
            print("  → Run scripts/schema.sql in the Supabase SQL Editor first:")
            print("    https://supabase.com/dashboard/project/lerpchldswooqrfscuig/editor")
            sys.exit(1)
    print("Schema OK.\n")


# ── Migration steps ────────────────────────────────────────────────────────────

def migrate_funds(cur) -> dict:
    """Migrate funds table. Returns mapping old_id -> new_id."""
    print("── Migrating funds ──────────────────────────────────────────────────")
    cur.execute("""
        SELECT id, code, name, category, inception_date,
               cagr, avg_3y_rolling_return, max_drawdown,
               volatility, sharpe_ratio, calmar_ratio, score, final_rank
        FROM funds
        ORDER BY id
    """)
    rows = cur.fetchall()
    print(f"  Found {len(rows)} funds in source DB.")

    # We upsert without id so Supabase auto-assigns new ids.
    # Build a code→old_id map for nav_data remapping.
    code_to_old_id = {r["code"]: r["id"] for r in rows}

    payload = [
        {k: v for k, v in r.items() if k != "id"}   # drop old PK
        for r in rows
    ]
    rest_upsert("funds", payload)

    # Fetch newly assigned ids from new DB
    resp = requests.get(
        f"{NEW_SUPABASE_URL}/rest/v1/funds?select=id,code",
        headers=HEADERS,
    )
    new_funds = resp.json()
    code_to_new_id = {f["code"]: f["id"] for f in new_funds}

    # Build old_id → new_id mapping via code
    old_id_to_new_id = {
        code_to_old_id[code]: new_id
        for code, new_id in code_to_new_id.items()
        if code in code_to_old_id
    }
    print(f"  Migrated {len(payload)} funds. ID mapping built ({len(old_id_to_new_id)} entries).")
    return old_id_to_new_id


def migrate_nav_data(cur, id_map: dict) -> None:
    print("\n── Migrating nav_data ───────────────────────────────────────────────")
    cur.execute("SELECT COUNT(*) FROM nav_data")
    total = cur.fetchone()["count"]
    print(f"  Total rows: {total}")

    offset = 0
    migrated = 0
    while True:
        cur.execute(
            "SELECT fund_id, date, nav_value FROM nav_data ORDER BY fund_id, date LIMIT %s OFFSET %s",
            (BATCH_SIZE, offset),
        )
        rows = cur.fetchall()
        if not rows:
            break

        payload = [
            {
                "fund_id":   id_map.get(r["fund_id"], r["fund_id"]),
                "date":      str(r["date"]),
                "nav_value": float(r["nav_value"]),
            }
            for r in rows
        ]
        rest_upsert("nav_data", payload)
        migrated += len(rows)
        print(f"  Progress: {migrated}/{total}")
        offset += BATCH_SIZE

    print(f"  nav_data migration complete ({migrated} rows).")


def migrate_mf_funds(cur) -> None:
    print("\n── Migrating mf_funds ───────────────────────────────────────────────")
    cur.execute("""
        SELECT scheme_code, scheme_name, fund_house, scheme_type,
               scheme_category, search_name, match_ratio, created_at
        FROM mf_funds
        ORDER BY scheme_code
    """)
    rows = cur.fetchall()
    print(f"  Found {len(rows)} mutual funds.")

    payload = [
        {
            "scheme_code":     r["scheme_code"],
            "scheme_name":     r["scheme_name"],
            "fund_house":      r["fund_house"],
            "scheme_type":     r["scheme_type"],
            "scheme_category": r["scheme_category"],
            "search_name":     r["search_name"],
            "match_ratio":     float(r["match_ratio"]) if r["match_ratio"] is not None else None,
            "created_at":      str(r["created_at"]) if r["created_at"] else None,
        }
        for r in rows
    ]
    rest_upsert("mf_funds", payload)
    print(f"  Migrated {len(payload)} mf_funds rows.")


def migrate_mf_nav_data(cur) -> None:
    print("\n── Migrating mf_nav_data ────────────────────────────────────────────")
    cur.execute("SELECT COUNT(*) FROM mf_nav_data")
    total = cur.fetchone()["count"]
    print(f"  Total rows: {total}")

    offset = 0
    migrated = 0
    while True:
        cur.execute(
            "SELECT scheme_code, date, nav FROM mf_nav_data ORDER BY scheme_code, date LIMIT %s OFFSET %s",
            (BATCH_SIZE, offset),
        )
        rows = cur.fetchall()
        if not rows:
            break

        payload = [
            {
                "scheme_code": r["scheme_code"],
                "date":        str(r["date"]),
                "nav":         float(r["nav"]),
            }
            for r in rows
        ]
        rest_upsert("mf_nav_data", payload)
        migrated += len(rows)
        print(f"  Progress: {migrated}/{total}")
        offset += BATCH_SIZE

    print(f"  mf_nav_data migration complete ({migrated} rows).")


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    verify_schema()

    print("Connecting to source (old) Supabase…")
    try:
        conn = psycopg2.connect(OLD_DB_URL, cursor_factory=RealDictCursor)
    except Exception as e:
        print(f"Failed to connect to source DB: {e}")
        sys.exit(1)

    cur = conn.cursor()
    print("Connected.\n")

    start = time.time()

    id_map = migrate_funds(cur)
    migrate_nav_data(cur, id_map)
    migrate_mf_funds(cur)
    migrate_mf_nav_data(cur)

    cur.close()
    conn.close()

    elapsed = time.time() - start
    print(f"\n✓ Migration complete in {elapsed:.1f}s")
    print("Update your .env.local — it has already been updated in the repo.")


if __name__ == "__main__":
    main()
