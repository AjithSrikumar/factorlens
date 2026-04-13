"""
PMS Data Scraper for FactorLens
================================
Scrapes all PMS (Portfolio Management Service) data from pmsbazaar.com and
upserts it into the `pms_data` table in Supabase.

Data sources:
  1. POST /Explore/PMSDashboardData  — public JSON API, returns all 500+ schemes
     Fields: SchemeName, AMCName, AMCLogoLink, Category, AssetClass, Inception_Date,
             SchemeReturns (1Y / 3Y / 5Y / Since Inception with benchmark index values)
  2. /AMC/{AMC-Name}                 — public HTML pages, one per AMC
     Fields: AUM (Cr), AUM date, 2Y returns per strategy

Output columns: see supabase/pms_schema.sql

Usage:
    pip install requests psycopg2-binary beautifulsoup4 lxml
    python scripts/scrape_pms.py                 # full scrape + upsert
    python scripts/scrape_pms.py --dry-run       # print data, no DB write
    python scripts/scrape_pms.py --no-amc        # skip slow AMC page scraping
"""

import os
import sys
import json
import time
import re
import argparse
import logging
from datetime import datetime, timezone
from typing import Optional

import requests
import requests.packages.urllib3
requests.packages.urllib3.disable_warnings(
    requests.packages.urllib3.exceptions.InsecureRequestWarning
)
import psycopg2
from psycopg2.extras import execute_values

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

# ── Config ────────────────────────────────────────────────────────────────────

DB_URL = os.getenv(
    "SUPABASE_DB_URL",
    os.getenv("DATABASE_URL", "")
)

BASE_URL = "https://pmsbazaar.com"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer": f"{BASE_URL}/Explore/PMS",
}

SESSION = requests.Session()
SESSION.headers.update(HEADERS)

AMC_DELAY = 1.0    # seconds between AMC page requests (be polite)
RETRY_DELAY = 5.0  # seconds to wait on HTTP error before retrying

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_return(value: Optional[str]) -> Optional[float]:
    """Convert '25.44%' or '25.44' → 25.44, 'NA' / None → None."""
    if not value or str(value).strip().upper() in ("NA", "N/A", "-", ""):
        return None
    cleaned = str(value).replace("%", "").strip()
    try:
        return float(cleaned)
    except ValueError:
        return None


def get_return(returns_list: list, key: str) -> Optional[float]:
    """Pull SchemeReturnValue for a given SchemeReturnText key."""
    for r in returns_list:
        if r.get("SchemeReturnText") == key:
            return parse_return(r.get("SchemeReturnValue"))
    return None


def get_index_return(returns_list: list, key: str) -> Optional[float]:
    """Pull IndexReturnValue for a given IndexReturnText key."""
    for r in returns_list:
        if r.get("IndexReturnText") == key:
            return parse_return(r.get("IndexReturnValue"))
    return None


def amc_url_slug(amc_name: str) -> str:
    """Convert 'Aditya Birla Sun Life AMC' → 'Aditya-Birla-Sun-Life-AMC'."""
    return re.sub(r"\s+", "-", amc_name.strip())


# ── Step 1: Fetch all PMS schemes from the public API ─────────────────────────

def fetch_dashboard_data() -> list[dict]:
    """
    POST /Explore/PMSDashboardData
    Returns the raw JSON list of all PMS schemes.
    """
    url = f"{BASE_URL}/Explore/PMSDashboardData"
    log.info("Fetching PMSDashboardData …")

    for attempt in range(3):
        try:
            resp = SESSION.post(
                url,
                data="",
                headers={
                    **HEADERS,
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "Content-Length": "0",
                },
                timeout=60,
                verify=False,
            )
            resp.raise_for_status()
            # Response is a JSON-encoded string of a JSON array (double-encoded)
            outer = resp.json()
            if isinstance(outer, str):
                data = json.loads(outer)
            elif isinstance(outer, list):
                data = outer
            else:
                data = json.loads(json.dumps(outer))
            log.info("  → %d schemes fetched", len(data))
            return data
        except Exception as exc:
            log.warning("  attempt %d failed: %s", attempt + 1, exc)
            if attempt < 2:
                time.sleep(RETRY_DELAY)

    raise RuntimeError("Failed to fetch PMSDashboardData after 3 attempts")


# ── Step 2: Scrape AMC pages for AUM + 2Y returns ────────────────────────────

def scrape_amc_page(amc_name: str) -> dict:
    """
    Scrape /AMC/{amc_slug} to extract:
      - aum_cr     : total PMS AUM in Crores (AMC-level)
      - aum_date   : "As On" date string
      - returns_2y : {strategy_name → 2Y return float}
    Returns a dict with keys 'aum_cr', 'aum_date', 'returns_2y'.
    """
    result = {"aum_cr": None, "aum_date": None, "returns_2y": {}}

    if BeautifulSoup is None:
        log.warning("beautifulsoup4 not installed; skipping AMC page scrape")
        return result

    slug = amc_url_slug(amc_name)
    url = f"{BASE_URL}/AMC/{slug}"

    try:
        resp = SESSION.get(url, timeout=30, verify=False)
        if resp.status_code != 200:
            log.warning("  AMC page %s → HTTP %d", url, resp.status_code)
            return result
        if "Login" in resp.url or "ReturnUrl" in resp.url:
            log.warning("  AMC page redirected to login: %s", amc_name)
            return result
    except Exception as exc:
        log.warning("  AMC page request failed for %s: %s", amc_name, exc)
        return result

    soup = BeautifulSoup(resp.text, "lxml")

    # ── Extract AUM ──
    # Pattern: "AUM (Cr.)" label followed by value, or direct data in table
    aum_val = None
    aum_date_val = None

    # Strategy 1: look for "AUM (Cr.)" text then the numeric value nearby
    for tag in soup.find_all(string=re.compile(r"AUM\s*\(Cr", re.IGNORECASE)):
        parent = tag.parent
        # Walk siblings or parent containers for the numeric value
        for candidate in parent.parent.find_all(string=True):
            text = candidate.strip()
            if re.match(r"^[\d,]+\.?\d*$", text):
                try:
                    aum_val = float(text.replace(",", ""))
                    break
                except ValueError:
                    pass
        if aum_val:
            break

    # Strategy 2: "As On DD Month YYYY" pattern
    as_on_match = soup.find(string=re.compile(r"As\s+On\s+\d+\s+\w+\s+\d{4}", re.IGNORECASE))
    if as_on_match:
        m = re.search(r"As\s+On\s+(\d+\s+\w+\s+\d{4})", str(as_on_match), re.IGNORECASE)
        if m:
            aum_date_val = m.group(1)

    # Strategy 3: scrape comment-hidden table that appears in raw HTML
    # The page has <!-- <table ... -->  AUM value in commented HTML
    raw = resp.text
    aum_comment_match = re.search(
        r"<th>(\d[\d,]*\.?\d*)</th>\s*<th>\d+</th>\s*<th>\d+</th>",
        raw
    )
    if aum_comment_match and aum_val is None:
        try:
            aum_val = float(aum_comment_match.group(1).replace(",", ""))
        except ValueError:
            pass

    # Strategy 4: look for number after visible AUM label in page text
    if aum_val is None:
        page_text = soup.get_text(" ", strip=True)
        aum_pattern = re.search(
            r"AUM\s*\(Cr\.?\)\s*([\d,]+\.?\d*)", page_text, re.IGNORECASE
        )
        if aum_pattern:
            try:
                aum_val = float(aum_pattern.group(1).replace(",", ""))
            except ValueError:
                pass

    if aum_val is not None:
        result["aum_cr"] = aum_val
    if aum_date_val:
        result["aum_date"] = aum_date_val

    # ── Extract per-strategy 2Y returns ──
    # The AMC page has a table structure:
    #   - outer <th> row with colspan headers ("PMS Investment Approach(s)", "Returns", ...)
    #   - inner sub-header <tr> with actual column names ("Investment Approach", "1 Yr", "2 Yr", ...)
    #   - data rows with strategy returns
    tables = soup.find_all("table")
    for table in tables:
        all_text = table.get_text(" ", strip=True).lower()
        # Must be a PMS table (not AIF) with 2Y returns
        if "pms" not in all_text:
            continue
        if "2 yr" not in all_text and "2 year" not in all_text:
            continue

        # Find the sub-header row — the row whose cells include "1 yr" / "2 yr"
        sub_header_cells = None
        data_start_row = 0
        for row_idx, row in enumerate(table.find_all("tr")):
            cells = [c.get_text(strip=True).lower() for c in row.find_all(["td", "th"])]
            joined = " ".join(cells)
            if ("investment approach" in joined or "scheme" in joined) and "2 yr" in joined:
                sub_header_cells = cells
                data_start_row = row_idx + 1
                break

        if sub_header_cells is None:
            continue

        try:
            name_col = next(
                i for i, c in enumerate(sub_header_cells)
                if "investment approach" in c or "strategy" in c or "scheme" in c
            )
            yr2_col = next(
                i for i, c in enumerate(sub_header_cells)
                if "2 yr" in c or "2yr" in c or "2 year" in c
            )
        except StopIteration:
            continue

        all_rows = table.find_all("tr")
        for row in all_rows[data_start_row:]:
            cells = row.find_all(["td", "th"])
            if len(cells) <= max(name_col, yr2_col):
                continue
            strat_name = cells[name_col].get_text(strip=True)
            ret_2y_text = cells[yr2_col].get_text(strip=True)
            # Skip rows that look like sub-headers
            if strat_name.lower() in ("investment approach", "strategy", "scheme"):
                continue
            val = parse_return(ret_2y_text)
            if strat_name and val is not None:
                result["returns_2y"][strat_name] = val

    return result


# ── Step 3: Compute category ranks ───────────────────────────────────────────

def compute_category_ranks(schemes: list[dict]) -> dict[int, int]:
    """
    Rank each scheme within its Category by 1Y return (descending).
    Schemes with no 1Y return are ranked last.
    Returns {scheme_id → rank_int}.
    """
    from collections import defaultdict

    by_category: dict[str, list[tuple]] = defaultdict(list)
    for s in schemes:
        cat = (s.get("Category") or "Unknown").strip()
        ret_1y = get_return(s.get("SchemeReturns", []), "Return_1_Yr")
        by_category[cat].append((s["SchemeId"], ret_1y))

    ranks: dict[int, int] = {}
    for cat, items in by_category.items():
        # Sort descending: schemes with returns first, then NA
        sorted_items = sorted(
            items,
            key=lambda x: (x[1] is None, -(x[1] or -9999))
        )
        for rank, (scheme_id, _) in enumerate(sorted_items, start=1):
            ranks[scheme_id] = rank

    return ranks


# ── Step 4: Build rows for DB upsert ─────────────────────────────────────────

def build_rows(
    schemes: list[dict],
    amc_data: dict[str, dict],
    ranks: dict[int, int],
) -> list[tuple]:
    """
    Merge API data + AMC page data + computed ranks → DB rows.
    Column order must match the INSERT statement in upsert_rows().
    """
    rows = []
    now = datetime.now(timezone.utc)

    for s in schemes:
        scheme_id = s["SchemeId"]
        scheme_name = (s.get("SchemeName") or "").strip()
        amc_name = (s.get("AMCName") or "").strip()
        returns_list = s.get("SchemeReturns", [])

        # ── parse strategy_inception_date ──
        raw_dt = s.get("Strategy_Inception_Date")
        strategy_dt = None
        if raw_dt:
            # "2009-10-06T00:00:00"
            try:
                strategy_dt = datetime.fromisoformat(raw_dt.replace("Z", "+00:00")).date()
            except (ValueError, AttributeError):
                pass

        # ── returns from API ──
        return_1y   = get_return(returns_list, "Return_1_Yr")
        return_3y   = get_return(returns_list, "Return_3_Yr")
        return_5y   = get_return(returns_list, "Return_5_Yr")
        return_si   = get_return(returns_list, "Return_Inception")
        bm_1y       = get_index_return(returns_list, "Return_Index_1_Yr")
        bm_3y       = get_index_return(returns_list, "Return_Index_3_Yr")
        bm_5y       = get_index_return(returns_list, "Return_Index_5_Yr")
        bm_si       = get_index_return(returns_list, "Return_Index_Inception")

        # ── data from AMC page ──
        amc_info = amc_data.get(amc_name, {})
        aum_cr   = amc_info.get("aum_cr")
        aum_date = amc_info.get("aum_date")
        return_2y = amc_info.get("returns_2y", {}).get(scheme_name)

        rows.append((
            scheme_id,                              # scheme_id
            s.get("SchemeCode"),                    # scheme_code
            scheme_name,                            # pms_name
            amc_name,                               # amc_name
            s.get("AMCLogoLink"),                   # logo_url
            (s.get("Category") or "").strip(),      # category
            (s.get("AssetClass") or "").strip(),    # asset_class
            ranks.get(scheme_id),                   # category_rank
            s.get("Inception_Date"),                # inception_date
            strategy_dt,                            # strategy_inception_date
            aum_cr,                                 # aum_cr
            aum_date,                               # aum_date
            None,                                   # return_1m (not public)
            None,                                   # return_3m (not public)
            None,                                   # return_6m (not public)
            return_1y,                              # return_1y
            return_2y,                              # return_2y
            return_3y,                              # return_3y
            return_5y,                              # return_5y
            None,                                   # return_10y (not public)
            return_si,                              # return_since_inception
            bm_1y,                                  # benchmark_return_1y
            bm_3y,                                  # benchmark_return_3y
            bm_5y,                                  # benchmark_return_5y
            bm_si,                                  # benchmark_return_since_inception
            (s.get("RouteName") or "").strip(),     # route_name
            (s.get("AMCRouteName") or "").strip(),  # amc_route_name
            bool(s.get("IsDIYProduct")),            # is_diy_product
            bool(s.get("IsFeatured")),              # is_featured
            bool(s.get("HideInComparison")),        # hide_in_comparison
            s.get("ProductCode", "PMS"),            # product_code
            now,                                    # scraped_at
        ))

    return rows


# ── Step 5: Upsert into Supabase ──────────────────────────────────────────────

UPSERT_SQL = """
INSERT INTO pms_data (
  scheme_id, scheme_code, pms_name, amc_name, logo_url,
  category, asset_class, category_rank,
  inception_date, strategy_inception_date,
  aum_cr, aum_date,
  return_1m, return_3m, return_6m,
  return_1y, return_2y, return_3y, return_5y, return_10y,
  return_since_inception,
  benchmark_return_1y, benchmark_return_3y, benchmark_return_5y,
  benchmark_return_since_inception,
  route_name, amc_route_name,
  is_diy_product, is_featured, hide_in_comparison,
  product_code, scraped_at
)
VALUES %s
ON CONFLICT (scheme_id) DO UPDATE SET
  scheme_code                      = EXCLUDED.scheme_code,
  pms_name                         = EXCLUDED.pms_name,
  amc_name                         = EXCLUDED.amc_name,
  logo_url                         = EXCLUDED.logo_url,
  category                         = EXCLUDED.category,
  asset_class                      = EXCLUDED.asset_class,
  category_rank                    = EXCLUDED.category_rank,
  inception_date                   = EXCLUDED.inception_date,
  strategy_inception_date          = EXCLUDED.strategy_inception_date,
  aum_cr                           = EXCLUDED.aum_cr,
  aum_date                         = EXCLUDED.aum_date,
  return_1m                        = EXCLUDED.return_1m,
  return_3m                        = EXCLUDED.return_3m,
  return_6m                        = EXCLUDED.return_6m,
  return_1y                        = EXCLUDED.return_1y,
  return_2y                        = EXCLUDED.return_2y,
  return_3y                        = EXCLUDED.return_3y,
  return_5y                        = EXCLUDED.return_5y,
  return_10y                       = EXCLUDED.return_10y,
  return_since_inception           = EXCLUDED.return_since_inception,
  benchmark_return_1y              = EXCLUDED.benchmark_return_1y,
  benchmark_return_3y              = EXCLUDED.benchmark_return_3y,
  benchmark_return_5y              = EXCLUDED.benchmark_return_5y,
  benchmark_return_since_inception = EXCLUDED.benchmark_return_since_inception,
  route_name                       = EXCLUDED.route_name,
  amc_route_name                   = EXCLUDED.amc_route_name,
  is_diy_product                   = EXCLUDED.is_diy_product,
  is_featured                      = EXCLUDED.is_featured,
  hide_in_comparison               = EXCLUDED.hide_in_comparison,
  product_code                     = EXCLUDED.product_code,
  scraped_at                       = EXCLUDED.scraped_at,
  updated_at                       = now()
"""


def upsert_rows(rows: list[tuple], db_url: str) -> None:
    """Connect to Postgres and batch-upsert all rows."""
    log.info("Connecting to database …")
    conn = psycopg2.connect(db_url)
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            log.info("Upserting %d rows into pms_data …", len(rows))
            execute_values(cur, UPSERT_SQL, rows, page_size=100)
        conn.commit()
        log.info("Upsert complete.")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ── Main ──────────────────────────────────────────────────────────────────────

def upsert_rows_rest(rows: list[tuple], supabase_url: str, service_key: str) -> None:
    """
    Upsert rows via the Supabase REST API (HTTPS POST).
    Use this when direct psycopg2/TCP connection is unavailable.
    """
    import requests as _requests
    col_names = [
        "scheme_id", "scheme_code", "pms_name", "amc_name", "logo_url",
        "category", "asset_class", "category_rank",
        "inception_date", "strategy_inception_date",
        "aum_cr", "aum_date",
        "return_1m", "return_3m", "return_6m",
        "return_1y", "return_2y", "return_3y", "return_5y", "return_10y",
        "return_since_inception",
        "benchmark_return_1y", "benchmark_return_3y",
        "benchmark_return_5y", "benchmark_return_since_inception",
        "route_name", "amc_route_name",
        "is_diy_product", "is_featured", "hide_in_comparison",
        "product_code", "scraped_at",
    ]

    def to_dict(row: tuple) -> dict:
        d = dict(zip(col_names, row))
        # Convert non-serializable types; keep all keys (PostgREST requires uniform keys)
        for k, v in d.items():
            if hasattr(v, 'isoformat'):
                d[k] = v.isoformat()
        return d

    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",  # upsert via REST
    }
    url = f"{supabase_url}/rest/v1/pms_data"

    BATCH = 100
    upserted = 0
    for i in range(0, len(rows), BATCH):
        batch = [to_dict(r) for r in rows[i:i + BATCH]]
        resp = _requests.post(url, headers=headers, json=batch, timeout=30, verify=False)
        if resp.status_code in (200, 201):
            upserted += len(batch)
        else:
            log.warning("REST upsert batch %d failed: %s %s", i // BATCH + 1,
                        resp.status_code, resp.text[:200])
    log.info("REST upsert complete: %d / %d rows", upserted, len(rows))


def main():
    parser = argparse.ArgumentParser(description="Scrape PMS data from pmsbazaar.com")
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Fetch and process data but do NOT write to DB"
    )
    parser.add_argument(
        "--no-amc", action="store_true",
        help="Skip AMC page scraping (faster, no AUM / 2Y returns)"
    )
    parser.add_argument(
        "--db-url", default=DB_URL,
        help="PostgreSQL connection URL (overrides SUPABASE_DB_URL env var)"
    )
    parser.add_argument(
        "--rest", action="store_true",
        help="Use Supabase REST API for upsert instead of psycopg2 (no direct DB needed)"
    )
    args = parser.parse_args()

    db_url = args.db_url
    use_rest = args.rest
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

    if not args.dry_run and not use_rest and not db_url:
        log.error(
            "No DB URL found. Set SUPABASE_DB_URL or pass --db-url.\n"
            "  For REST API mode (no direct DB required): pass --rest\n"
            "    (requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env)\n"
            "  Or use --dry-run to skip all DB writes."
        )
        sys.exit(1)

    if use_rest and (not supabase_url or not service_key):
        log.error(
            "--rest mode requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars."
        )
        sys.exit(1)

    # ── 1. Fetch all schemes ──
    schemes = fetch_dashboard_data()

    # ── 2. Scrape AMC pages ──
    amc_data: dict[str, dict] = {}
    if not args.no_amc:
        if BeautifulSoup is None:
            log.warning(
                "beautifulsoup4 / lxml not installed — skipping AMC page scraping.\n"
                "  Install with: pip install beautifulsoup4 lxml"
            )
        else:
            unique_amcs = sorted({s["AMCName"] for s in schemes if s.get("AMCName")})
            log.info("Scraping %d AMC pages for AUM + 2Y returns …", len(unique_amcs))
            for i, amc_name in enumerate(unique_amcs, 1):
                log.info("  [%d/%d] %s", i, len(unique_amcs), amc_name)
                amc_data[amc_name] = scrape_amc_page(amc_name)
                time.sleep(AMC_DELAY)

            # Summary
            amc_with_aum = sum(1 for v in amc_data.values() if v.get("aum_cr"))
            log.info("  → AUM found for %d / %d AMCs", amc_with_aum, len(unique_amcs))
    else:
        log.info("Skipping AMC page scraping (--no-amc)")

    # ── 3. Compute category ranks ──
    log.info("Computing category ranks …")
    ranks = compute_category_ranks(schemes)

    # ── 4. Build rows ──
    rows = build_rows(schemes, amc_data, ranks)
    log.info("Built %d rows", len(rows))

    if use_rest and not args.dry_run:
        # ── 5b. REST API upsert ──
        upsert_rows_rest(rows, supabase_url, service_key)
        log.info("Done. %d PMS strategies processed.", len(rows))
        return

    if args.dry_run:
        log.info("--- DRY RUN: sample of first 5 rows ---")
        col_names = [
            "scheme_id", "scheme_code", "pms_name", "amc_name", "logo_url",
            "category", "asset_class", "category_rank",
            "inception_date", "strategy_inception_date",
            "aum_cr", "aum_date",
            "return_1m", "return_3m", "return_6m",
            "return_1y", "return_2y", "return_3y", "return_5y", "return_10y",
            "return_since_inception",
            "benchmark_return_1y", "benchmark_return_3y",
            "benchmark_return_5y", "benchmark_return_since_inception",
            "route_name", "amc_route_name",
            "is_diy_product", "is_featured", "hide_in_comparison",
            "product_code", "scraped_at",
        ]
        for row in rows[:5]:
            print("\n---")
            for name, val in zip(col_names, row):
                print(f"  {name:40s}: {val}")
        log.info("Dry run complete. %d total rows would be upserted.", len(rows))
        return

    # ── 5. Upsert ──
    upsert_rows(rows, db_url)
    log.info("Done. %d PMS strategies stored in pms_data.", len(rows))


if __name__ == "__main__":
    main()
