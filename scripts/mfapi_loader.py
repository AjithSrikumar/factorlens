"""
mfapi_loader.py — Fetch historical NAV data from mfapi.in and store in Supabase.

Creates two new tables:
  mf_funds     — fund metadata (scheme_code, scheme_name, fund_house, etc.)
  mf_nav_data  — daily NAV history (scheme_code, date, nav)

Usage:
    pip install requests psycopg2-binary
    python scripts/mfapi_loader.py [--dry-run] [--search-only] [--resume]

Flags:
  --dry-run      Search for scheme codes only, print matches, no DB writes
  --search-only  Like dry-run but also writes fund matches to mf_funds (no NAV)
  --resume       Skip funds that already have NAV data in mf_nav_data
"""

import os
import sys
import time
import re
import json
import difflib
import argparse
from datetime import datetime

import requests
import urllib3
import psycopg2
from psycopg2.extras import execute_values

# Suppress SSL warnings in environments where cert verification is unavailable
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# ── Config ────────────────────────────────────────────────────────────────────

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.cxmaeueobsqrbivoqvry:74d4pPImwlV0sCH3LDrUUsB9OIkKHNzSrRZyht8OyWiWSGPr7uA8Iz1qRqlJCxQn@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
)

MFAPI_BASE   = "https://api.mfapi.in/mf"
SEARCH_DELAY = 0.35   # seconds between search requests
FETCH_DELAY  = 0.5    # seconds between history fetch requests
BATCH_SIZE   = 500    # rows per DB insert batch

# ── Fund names (250 funds) ────────────────────────────────────────────────────

FUND_NAMES = [
    "UTI Nifty 50 Index Fund-Reg(G)",
    "HDFC Nifty 50 Index Fund(G)(Post Addendum)",
    "SBI Gold-Reg(G)",
    "ICICI Pru Nifty 50 Index Fund-Reg(G)",
    "SBI Nifty Index Fund-Reg(G)",
    "HDFC Gold ETF FoF(G)",
    "HDFC BSE Sensex Index Fund(G)(Post Addendum)",
    "UTI Nifty200 Momentum 30 Index Fund-Reg(G)",
    "ICICI Pru Nifty Next 50 Index Fund(G)",
    "Nippon India Gold Savings Fund(G)",
    "Kotak Gold Fund(G)",
    "ICICI Pru Gold ETF FOF(G)",
    "UTI Nifty Next 50 Index Fund-Reg(G)",
    "HDFC Silver ETF FoF-Reg(G)",
    "Motilal Oswal Nifty India Defence Index Fund-Reg(G)",
    "Navi Nifty 50 Index Fund-Reg(G)",
    "Nippon India Index Fund-Nifty 50 Plan(G)",
    "Motilal Oswal Nifty Midcap 150 Index Fund-Reg(G)",
    "Axis Gold Fund-Reg(G)",
    "Motilal Oswal Nifty 500 Index Fund-Reg(G)",
    "Nippon India Nifty Smallcap 250 Index Fund-Reg(G)",
    "Motilal Oswal Gold and Silver Passive FoF-Reg(G)",
    "DSP Nifty 50 Equal Weight Index Fund-Reg(G)",
    "Motilal Oswal Nifty Microcap 250 Index Fund-Reg(G)",
    "HDFC NIFTY Next 50 Index Fund-Reg(G)",
    "Bandhan Nifty 50 Index Fund-Reg(G)",
    "Nippon India Nifty Midcap 150 Index Fund-Reg(G)",
    "ICICI Pru PSU Equity Fund-Reg(G)",
    "Axis Nifty 100 Index Fund-Reg(G)",
    "SBI Nifty Next 50 Index Fund-Reg(G)",
    "ICICI Pru BSE Sensex Index Fund(G)",
    "Bandhan Nifty100 Low Volatility 30 Index Fund-Reg(G)",
    "Aditya Birla SL Gold Fund-Reg(G)",
    "Motilal Oswal BSE Enhanced Value Index Fund-Reg(G)",
    "HDFC NIFTY50 Equal Weight Index Fund-Reg(G)",
    "Tata NIFTY 50 Index Fund-Reg(G)",
    "Edelweiss Nifty Midcap150 Momentum 50 Index Fund-Reg(G)",
    "SBI Nifty Smallcap 250 Index Fund-Reg(G)",
    "Nippon India Nifty Alpha Low Volatility 30 Index Fund(G)",
    "UTI Gold ETF FoF-Reg(G)",
    "DSP Nifty Top 10 Equal Weight Index Fund-Reg(G)",
    "Aditya Birla SL Nifty 50 Index Fund-Reg(G)",
    "Axis Silver FoF-Reg(G)",
    "DSP NIFTY Next 50 Index Fund-Reg(G)",
    "Navi Nifty Next 50 Index Fund-Reg(G)",
    "Nippon India Nifty 500 Momentum 50 Index Fund-Reg(G)",
    "Kotak Gold Silver Passive FOF-Reg(G)",
    "Tata Nifty Midcap 150 Momentum 50 Index Fund-Reg(G)",
    "SBI Nifty50 Equal Weight Index Fund-Reg(G)",
    "Kotak Nifty 50 Index Fund-Reg(G)",
    "Nippon India Nifty 50 Value 20 Index Fund-Reg(G)",
    "Motilal Oswal Nifty Smallcap 250 Index Fund-Reg(G)",
    "Kotak Silver ETF FoF-Reg(G)",
    "DSP NIFTY 50 Index Fund-Reg(G)",
    "Motilal Oswal Nifty 200 Momentum 30 Index Fund-Reg(G)",
    "SBI Nifty Midcap 150 Index Fund-Reg(G)",
    "ICICI Pru Nifty Midcap 150 Index Fund-Reg(G)",
    "Nippon India Index Fund-BSE Sensex Plan(G)",
    "Kotak Nifty Next 50 Index Fund-Reg(G)",
    "Aditya Birla SL Nifty India Defence Index Fund-Reg(G)",
    "Motilal Oswal Nifty 50 Index Fund-Reg(G)",
    "Axis Nifty 50 Index Fund-Reg(G)",
    "LIC MF Gold ETF FoF(G)",
    "SBI Nifty 500 Index Fund-Reg(G)",
    "Franklin India NSE Nifty 50 Index Fund(G)",
    "Motilal Oswal Nifty 500 Momentum 50 Index Fund-Reg(G)",
    "ICICI Pru Nifty Bank Index Fund-Reg(G)",
    "Motilal Oswal Nifty Bank Index Fund-Reg(G)",
    "Navi Nifty Bank Index Fund-Reg(G)",
    "HDFC NIFTY200 Momentum 30 Index Fund-Reg(G)",
    "UTI Nifty 500 Value 50 Index Fund-Reg(G)",
    "UTI Nifty200 Quality 30 Index Fund-Reg(G)",
    "Axis Nifty Midcap 50 Index Fund-Reg(G)",
    "ICICI Pru Nifty Smallcap 250 Index Fund(G)",
    "Axis Gold and Silver Passive FoF-Reg(G)",
    "ICICI Pru Nifty 200 Momentum 30 Index Fund-Reg(G)",
    "HDFC NIFTY Smallcap 250 Index Fund-Reg(G)",
    "Axis Nifty Smallcap 50 Index Fund-Reg(G)",
    "DSP Gold ETF FoF-Reg(G)",
    "UTI BSE Low Volatility Index Fund-Reg(G)",
    "Edelweiss Nifty500 Multicap Momentum Quality 50 Index Fund-Reg(G)",
    "Bandhan Nifty Alpha 50 Index Fund-Reg(G)",
    "ICICI Pru Nifty IT Index Fund-Reg(G)",
    "Quantum Gold Saving Fund-Reg(G)",
    "HDFC NIFTY Midcap 150 Index Fund-Reg(G)",
    "Kotak Nifty 200 Momentum 30 Index Fund-Reg(G)",
    "Tata Nifty Capital Markets Index Fund-Reg(G)",
    "Invesco India Gold ETF FoF-Reg(G)",
    "Aditya Birla SL Nifty 50 Equal Weight Index Fund-Reg(G)",
    "DSP Nifty Midcap 150 Quality 50 Index Fund-Reg(G)",
    "Axis Nifty Next 50 Index Fund-Reg(G)",
    "HDFC Nifty500 Multicap 50:25:25 Index Fund-Reg(G)",
    "Motilal Oswal Nifty Next 50 Index Fund-Reg(G)",
    "Aditya Birla SL Nifty Midcap 150 Index Fund-Reg(G)",
    "HDFC Nifty LargeMidcap 250 Index Fund-Reg(G)",
    "HDFC NIFTY 100 Equal Weight Index Fund-Reg(G)",
    "HDFC NIFTY 100 Index Fund-Reg(G)",
    "Tata BSE Sensex Index Fund-Reg(G)",
    "Nippon India Nifty 500 Equal Weight Index Fund-Reg(G)",
    "HSBC Nifty 50 Index Fund-Reg(G)",
    "Navi Nifty Midcap 150 Index Fund-Reg(G)",
    "LIC MF Nifty 50 Index Fund(G)",
    "Motilal Oswal Nifty Capital Market Index Fund-Reg(G)",
    "Groww Nifty Total Market Index Fund-Reg(G)",
    "Edelweiss NIFTY Large Mid Cap 250 Index Fund-Reg(G)",
    "Kotak NIFTY Midcap 150 Momentum 50 Index Fund-Reg(G)",
    "Axis Nifty 500 Index Fund-Reg(G)",
    "SBI BSE Sensex Index Fund-Reg(G)",
    "SBI Nifty200 Quality 30 Index Fund-Reg(G)",
    "SBI BSE PSU Bank Index Fund-Reg(G)",
    "DSP Nifty Smallcap250 Quality 50 Index Fund-Reg(G)",
    "SBI Nifty India Consumption Index Fund-Reg(G)",
    "HDFC BSE 500 Index Fund-Reg(G)",
    "Edelweiss Nifty 50 Index Fund-Reg(G)",
    "Tata Nifty India Tourism Index Fund-Reg(G)",
    "HDFC NIFTY100 Low Volatility 30 Index Fund-Reg(G)",
    "Aditya Birla SL Nifty Smallcap 50 Index Fund-Reg(G)",
    "ICICI Pru Nifty LargeMidcap 250 Index Fund-Reg(G)",
    "Aditya Birla SL Nifty Next 50 Index Fund-Reg(G)",
    "UTI Nifty Midcap 150 Quality 50 Index Fund-Reg(G)",
    "Bandhan Nifty 100 Index Fund-Reg(G)",
    "Tata Nifty Midcap 150 Index Fund-Reg(G)",
    "Tata BSE Select Business Groups Index Fund-Reg(G)",
    "UTI Nifty Private Bank Index Fund-Reg(G)",
    "Edelweiss Nifty Next 50 Index Fund-Reg(G)",
    "ICICI Pru Nifty50 Equal Weight Index Fund-Reg(G)",
    "UTI BSE Sensex Index Fund-Reg(G)",
    "ICICI Pru Nifty200 Value 30 Index Fund-Reg(G)",
    "Tata Nifty200 Alpha 30 Index Fund-Reg(G)",
    "Edelweiss Nifty Smallcap 250 Index Fund-Reg(G)",
    "HDFC BSE India Sector Leaders Index Fund-Reg(G)",
    "Nippon India Nifty Bank Index Fund-Reg(G)",
    "Nippon India Nifty IT Index Fund-Reg(G)",
    "Kotak Nifty Smallcap 50 Index Fund-Reg(G)",
    "Edelweiss MSCI India Domestic & World Healthcare 45 Index Fund-Reg(G)",
    "Union Gold ETF FoF-Reg(G)",
    "HDFC Nifty India Consumption Index Fund-Reg(G)",
    "Tata Nifty MidSmall Healthcare Index Fund-Reg(G)",
    "Bandhan Silver ETF FOF-Reg(G)",
    "HDFC Nifty100 Quality 30 Index Fund-Reg(G)",
    "Axis Nifty Bank Index Fund-Reg(G)",
    "HSBC Nifty Next 50 Index Fund-Reg(G)",
    "Axis Nifty500 Value 50 Index Fund-Reg(G)",
    "SBI Nifty Bank Index Fund-Reg(G)",
    "Edelweiss Nifty 100 Quality 30 Index Fund-Reg(G)",
    "HDFC Nifty India Digital Index Fund-Reg(G)",
    "Sundaram Nifty 100 Equal Weight Fund(G)",
    "Bandhan Nifty200 Momentum 30 Index Fund-Reg(G)",
    "Kotak NIFTY 100 Low Volatility 30 Index Fund-Reg(G)",
    "DSP Nifty500 Flexicap Quality 30 Index Fund-Reg(G)",
    "Bandhan Gold ETF FOF-Reg(G)",
    "UTI NIFTY50 Equal Weight Index Fund-Reg(G)",
    "Axis Nifty500 Momentum 50 Index Fund-Reg(G)",
    "Tata Nifty500 Multicap India Manufacturing 50:30:20 Index Fund-Reg(G)",
    "Edelweiss Silver ETF FoF-Reg(G)",
    "Axis NIFTY IT Index Fund-Reg(G)",
    "Edelweiss Nifty Alpha Low Volatility 30 Index Fund-Reg(G)",
    "Groww Nifty Smallcap 250 Index Fund-Reg(G)",
    "Groww Gold ETF FOF-Reg(G)",
    "SBI Nifty200 Momentum 30 Index Fund-Reg(G)",
    "Tata Nifty Next 50 Index Fund-Reg(G)",
    "Motilal Oswal BSE Low Volatility Index Fund-Reg(G)",
    "ICICI Pru Nifty50 Value 20 Index Fund-Reg(G)",
    "HDFC NIFTY Realty Index Fund-Reg(G)",
    "LIC MF Nifty Next 50 Index Fund(G)",
    "Kotak Nifty Financial Services Ex-Bank Index Fund-Reg(G)",
    "UTI Nifty Midsmallcap 400 Momentum Quality 100 Index Fund-Reg(G)",
    "Kotak BSE PSU Index Fund-Reg(G)",
    "LIC MF BSE Sensex Index Fund-Reg(G)",
    "HDFC Nifty Top 20 Equal Weight Index Fund-Reg(G)",
    "Motilal Oswal Nifty MidSmall Financial Services Index Fund-Reg(G)",
    "SBI Nifty IT Index Fund-Reg(G)",
    "Nippon India BSE Sensex Next 30 Index Fund-Reg(G)",
    "Tata Nifty Financial Services Index Fund-Reg(G)",
    "Tata Nifty500 Multicap Infrastructure 50:30:20 Index Fund-Reg(G)",
    "UTI Nifty Alpha Low-Volatility 30 Index Fund-Reg(G)",
    "Axis Nifty500 Quality 50 Index Fund-Reg(G)",
    "Navi Nifty India Manufacturing Index Fund-Reg(G)",
    "ICICI Pru Nifty 500 Index Fund-Reg(G)",
    "Aditya Birla SL BSE 500 Quality 50 Index Fund-Reg(G)",
    "UTI Nifty500 Shariah Index Fund-Reg(G)",
    "Kotak NIFTY Midcap 50 Index Fund-Reg(G)",
    "Aditya Birla SL BSE 500 Momentum 50 Index Fund-Reg(G)",
    "SBI Nifty100 Low Volatility 30 Index Fund-Reg(G)",
    "Baroda BNP Paribas Nifty 50 Index Fund-Reg(G)",
    "UTI Nifty Midcap 150 Index Fund-Reg(G)",
    "Bandhan Nifty Smallcap 250 Index Fund-Reg(G)",
    "DSP Nifty Private Bank Index Fund-Reg(G)",
    "DSP Nifty Bank Index Fund-Reg(G)",
    "Motilal Oswal BSE Quality Index Fund-Reg(G)",
    "DSP Nifty IT Index Fund-Reg(G)",
    "Motilal Oswal BSE 1000 Index Fund-Reg(G)",
    "Angel One Nifty Total Market Index Fund-Reg(G)",
    "Mirae Asset Nifty 50 Index Fund-Reg(G)",
    "Tata BSE Quality Index Fund-Reg(G)",
    "Kotak Nifty 50 Equal Weight Index Fund-Reg(G)",
    "Axis BSE Sensex Index Fund-Reg(G)",
    "Tata BSE Multicap Consumption 50:30:20 Index Fund-Reg(G)",
    "Mirae Asset Nifty Total Market Index Fund-Reg(G)",
    "Groww Nifty India Railways PSU Index Fund-Reg(G)",
    "Tata Nifty Realty Index Fund-Reg(G)",
    "Nippon India Nifty 500 Quality 50 Index Fund-Reg(G)",
    "Bajaj Finserv Nifty 50 Index Fund-Reg(G)",
    "Kotak Nifty Smallcap 250 Index Fund-Reg(G)",
    "Groww Nifty Non-Cyclical Consumer Index Fund-Reg(G)",
    "Bandhan Nifty Total Market Index Fund-Reg(G)",
    "Nippon India Nifty India Manufacturing Index Fund-Reg(G)",
    "Kotak Nifty 100 Equal Weight Index Fund-Reg(G)",
    "Axis BSE India Sector Leaders Index Fund-Reg(G)",
    "Nippon India Nifty Realty Index Fund-Reg(G)",
    "Mirae Asset Nifty LargeMidcap 250 Index Fund-Reg(G)",
    "Kotak Nifty Top 10 Equal Weight Index Fund-Reg(G)",
    "Motilal Oswal Nifty MidSmall IT and Telecom Index Fund-Reg(G)",
    "Angel One Nifty Total Market Momentum Quality 50 Index Fund-Reg(G)",
    "Kotak Nifty India Tourism Index Fund-Reg(G)",
    "Bandhan Nifty Midcap 150 Index Fund-Reg(G)",
    "Motilal Oswal BSE Financials ex Bank 30 Index Fund-Reg(G)",
    "Angel One Nifty 50 Index Fund-Reg(G)",
    "Angel One Gold ETF FOF-Reg(G)",
    "Bandhan Nifty 500 Momentum 50 Index Fund-Reg(G)",
    "ICICI Pru Nifty Top 15 Equal Weight Index Fund-Reg(G)",
    "Bandhan Nifty 500 Value 50 Index Fund-Reg(G)",
    "Motilal Oswal Nifty MidSmall Healthcare Index Fund-Reg(G)",
    "Nippon India Nifty 500 Low Volatility 50 Index Fund-Reg(G)",
    "Bandhan BSE India Sector Leaders Index Fund-Reg(G)",
    "Bandhan Nifty IT Index Fund-Reg(G)",
    "Bandhan Nifty Next 50 Index Fund-Reg(G)",
    "Navi Nifty 500 Multicap 50:25:25 Index Fund-Reg(G)",
    "Navi Nifty Smallcap250 Momentum Quality 100 Index Fund-Reg(G)",
    "Kotak Nifty Alpha 50 Index Fund-Reg(G)",
    "UTI BSE Housing Index Fund-Reg(G)",
    "Baroda BNP Paribas Nifty200 Momentum 30 Index Fund-Reg(G)",
    "ICICI Pru Nifty200 Quality 30 Index Fund-Reg(G)",
    "Motilal Oswal Nifty MidSmall India Consumption Index Fund-Reg(G)",
    "Kotak Nifty Midcap 150 Index Fund-Reg(G)",
    "Navi BSE Sensex Index Fund-Reg(G)",
    "Groww Nifty 50 Index Fund-Reg(G)",
    "Bandhan Nifty Bank Index Fund-Reg(G)",
    "ICICI Pru Nifty Private Bank Index Fund-Reg(G)",
    "Kotak Nifty500 Momentum 50 Index Fund-Reg(G)",
    "Bandhan BSE Healthcare Index Fund-Reg(G)",
    "Kotak BSE Sensex Index Fund-Reg(G)",
    "DSP BSE Sensex Next 30 Index Fund-Reg(G)",
    "Kotak Nifty 200 Quality 30 Index Fund-Reg(G)",
    "Kotak BSE Housing Index Fund-Reg(G)",
    "The Wealth Company Gold ETF FOF-Reg(G)",
    "Groww Nifty Midcap 150 Index Fund-Reg(G)",
    "Bandhan Nifty 200 Quality 30 Index Fund-Reg(G)",
    "Bandhan Nifty Alpha Low Volatility 30 Index Fund-Reg(G)",
    "DSP Nifty 500 Index Fund-Reg(G)",
    "Kotak Nifty200 Value 30 Index Fund-Reg(G)",
    "Navi Nifty MidSmallcap 400 Index Fund-Reg(G)",
    "DSP Nifty Midcap 150 Index Fund-Reg(G)",
    "DSP Nifty Smallcap 250 Index Fund-Reg(G)",
    "Baroda BNP Paribas NIFTY Midcap 150 Index Fund-Reg(G)",
    "Groww Nifty Next 50 Index Fund-Reg(G)",
    "Taurus Nifty 50 Index Fund-Reg(G)",
    "Groww Nifty PSU Bank Index Fund-Reg(G)",
]

# ── Helpers ───────────────────────────────────────────────────────────────────

def normalize(name: str) -> str:
    """Normalise fund name for fuzzy comparison."""
    n = name.lower()
    n = re.sub(r"\s*-\s*regular\s*(plan\s*)?-?\s*", " ", n)
    n = re.sub(r"\s*-\s*growth\s*(option)?\s*", " ", n)
    n = re.sub(r"\bgrowth\s+option\b", "", n)
    n = re.sub(r"\(g\)", "", n)
    n = re.sub(r"-reg\b", " ", n)
    n = re.sub(r"\(post addendum\)", "", n)
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    n = re.sub(r"\s+", " ", n).strip()
    return n


# Expand common abbreviations used in fund names to match mfapi naming
_ABBREVIATIONS = {
    r"\bICICI Pru\b":         "ICICI Prudential",
    r"\bAditya Birla SL\b":   "Aditya Birla Sun Life",
    r"\bLIC MF\b":            "LIC Mutual Fund",
    r"\bDSP\b":               "DSP",
    r"\bHSBC\b":              "HSBC",
}


def expand_abbreviations(name: str) -> str:
    for pattern, replacement in _ABBREVIATIONS.items():
        name = re.sub(pattern, replacement, name, flags=re.I)
    return name


def build_search_query(name: str) -> str:
    """Strip trailing qualifiers for a cleaner mfapi search query."""
    q = re.sub(r"\s*\(Post Addendum\)\s*$", "", name, flags=re.I)
    q = re.sub(r"\s*\(G\)\s*$", "", q, flags=re.I)
    q = re.sub(r"\s*-\s*Reg\s*$", "", q, flags=re.I)
    # Add space between letter and digit (Nifty200 → Nifty 200)
    q = re.sub(r"([a-zA-Z])(\d)", r"\1 \2", q)
    # Remove allocation ratios like 50:25:25
    q = re.sub(r"\d+:\d+:\d+", "", q)
    # Normalise "Index Fund-X Plan" → keep the qualifier "X"
    q = re.sub(r"Index Fund-(\w+) Plan", r"Index Fund \1", q, flags=re.I)
    return re.sub(r"\s+", " ", q).strip()


def build_fallback_queries(name: str) -> list[str]:
    """Return alternate search queries for hard-to-match names."""
    queries = []
    base = build_search_query(expand_abbreviations(name))

    # FoF funds: try with "Fund of Funds" spelled out
    if re.search(r"\bFoF\b", name, re.I):
        q2 = re.sub(r"\bFoF\b", "Fund of Funds", base, flags=re.I)
        queries.append(q2)
        # Also try just house + commodity keyword
        m = re.match(r"^(\S+\s+\S+)\s+.*(Gold|Silver)", name, re.I)
        if m:
            queries.append(f"{m.group(1)} {m.group(2)}")

    # Smallcap250 / Midcap150 without space
    if re.search(r"(?:Small|Mid|Large|Micro)cap\d+", name, re.I):
        q2 = re.sub(r"((?:Small|Mid|Large|Micro)cap)(\d+)", r"\1 \2", base, flags=re.I)
        queries.append(q2)

    # "Nippon India Index Fund-X Plan" style
    m = re.search(r"Index Fund[- ]+(\w+) Plan", name, re.I)
    if m:
        words = name.split()[:3]
        queries.append(" ".join(words) + " " + m.group(1))

    # Groww PSU Bank → drop "Nifty"
    if "Groww" in name and "PSU Bank" in name:
        queries.append("Groww Nifty PSU Bank")
        queries.append("Groww PSU Bank")

    # Generic: first 4 words
    queries.append(" ".join(base.split()[:4]))

    return queries


def parse_date(date_str: str) -> str:
    """'03-Mar-2026' → '2026-03-03'. Returns '' on failure."""
    try:
        return datetime.strptime(date_str.strip(), "%d-%b-%Y").strftime("%Y-%m-%d")
    except Exception:
        return ""


def search_fund(query: str, retries: int = 3):
    """Return list of {schemeCode, schemeName} from mfapi search."""
    for attempt in range(retries):
        try:
            resp = requests.get(
                f"{MFAPI_BASE}/search",
                params={"q": query},
                timeout=10,
                verify=False,
            )
            resp.raise_for_status()
            return resp.json() or []
        except Exception as e:
            print(f"    [search attempt {attempt+1}/{retries}] {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return []


def best_match(fund_name: str, results: list) -> dict | None:
    """Pick the highest-ratio match from search results; must be >= 0.65."""
    norm_target = normalize(fund_name)
    best_ratio = 0.0
    best = None
    for r in results:
        norm_r = normalize(r.get("schemeName", ""))
        ratio = difflib.SequenceMatcher(None, norm_target, norm_r).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best = r
    if best and best_ratio >= 0.65:
        return {**best, "match_ratio": round(best_ratio, 3)}
    return None


def fetch_history(scheme_code: int, retries: int = 3):
    """Fetch full NAV history from mfapi.in/mf/{scheme_code}."""
    for attempt in range(retries):
        try:
            resp = requests.get(f"{MFAPI_BASE}/{scheme_code}", timeout=30, verify=False)
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") == "SUCCESS":
                return data
        except Exception as e:
            print(f"    [fetch attempt {attempt+1}/{retries}] {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return None


# ── Database helpers ──────────────────────────────────────────────────────────

def create_tables(cur):
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mf_funds (
            scheme_code     INTEGER     PRIMARY KEY,
            scheme_name     TEXT        NOT NULL,
            fund_house      TEXT,
            scheme_type     TEXT,
            scheme_category TEXT,
            search_name     TEXT,
            match_ratio     NUMERIC(5,3),
            created_at      TIMESTAMPTZ DEFAULT NOW()
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS mf_nav_data (
            scheme_code  INTEGER NOT NULL
                         REFERENCES mf_funds(scheme_code) ON DELETE CASCADE,
            date         DATE    NOT NULL,
            nav          NUMERIC(20, 4) NOT NULL,
            PRIMARY KEY (scheme_code, date)
        )
    """)
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_mf_nav_scheme_date
        ON mf_nav_data (scheme_code, date)
    """)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Load MF NAV data from mfapi.in")
    parser.add_argument("--dry-run",     action="store_true",
                        help="Print matches only; no DB writes")
    parser.add_argument("--search-only", action="store_true",
                        help="Upsert fund metadata only; skip NAV history")
    parser.add_argument("--resume",      action="store_true",
                        help="Skip funds that already have ≥1 NAV row")
    args = parser.parse_args()

    conn = None
    cur  = None

    if not args.dry_run:
        conn = psycopg2.connect(DB_URL)
        cur  = conn.cursor()

        print("Creating tables if they don't exist…")
        create_tables(cur)
        conn.commit()

    # Build sets of already-loaded scheme codes / search names (for --resume)
    loaded_search_names: set[str] = set()
    if args.resume and not args.dry_run and cur:
        cur.execute("""
            SELECT f.search_name
            FROM mf_funds f
            WHERE EXISTS (
                SELECT 1 FROM mf_nav_data n WHERE n.scheme_code = f.scheme_code
            )
        """)
        loaded_search_names = {row[0] for row in cur.fetchall() if row[0]}
        print(f"Resuming: {len(loaded_search_names)} funds already loaded, skipping.\n")

    total   = len(FUND_NAMES)
    ok      = 0
    skipped = 0
    failed: list[str] = []

    print(f"Processing {total} funds…\n")

    for i, fund_name in enumerate(FUND_NAMES, 1):
        prefix = f"[{i:>3}/{total}]"

        if fund_name in loaded_search_names:
            print(f"{prefix} SKIP (already loaded) — {fund_name}")
            skipped += 1
            ok += 1
            continue

        print(f"{prefix} {fund_name}")

        # ── Search ──────────────────────────────────────────────────────────
        query   = build_search_query(fund_name)
        results = search_fund(query)
        time.sleep(SEARCH_DELAY)

        match = best_match(fund_name, results)

        # Fallback 1: expand abbreviations (e.g. ICICI Pru → ICICI Prudential)
        if not match:
            expanded = build_search_query(expand_abbreviations(fund_name))
            if expanded != query:
                results2 = search_fund(expanded)
                time.sleep(SEARCH_DELAY)
                match = best_match(fund_name, results2)

        # Fallback 2: targeted queries for FoF, spacing issues, etc.
        if not match:
            for fb_q in build_fallback_queries(fund_name):
                if fb_q == query:
                    continue
                results_fb = search_fund(fb_q)
                time.sleep(SEARCH_DELAY)
                match = best_match(fund_name, results_fb)
                if match:
                    break

        if not match:
            print(f"  ✗ NOT FOUND (searched: {query!r})")
            failed.append(fund_name)
            continue

        scheme_code  = match["schemeCode"]
        scheme_name  = match["schemeName"]
        match_ratio  = match["match_ratio"]
        status_icon  = "✓" if match_ratio >= 0.80 else "~"
        print(f"  {status_icon} [{scheme_code}] {scheme_name}  (ratio={match_ratio})")

        if args.dry_run:
            ok += 1
            continue

        # ── Fetch history ────────────────────────────────────────────────────
        if not args.search_only:
            print(f"    Fetching history…", end=" ", flush=True)
            hist = fetch_history(scheme_code)
            time.sleep(FETCH_DELAY)
            if not hist:
                print("FAILED")
                failed.append(fund_name)
                continue
            meta         = hist.get("meta", {})
            nav_rows_raw = hist.get("data", [])
        else:
            meta         = {}
            nav_rows_raw = []

        # ── Upsert fund metadata ─────────────────────────────────────────────
        cur.execute("""
            INSERT INTO mf_funds
                (scheme_code, scheme_name, fund_house, scheme_type,
                 scheme_category, search_name, match_ratio)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (scheme_code) DO UPDATE SET
                scheme_name     = EXCLUDED.scheme_name,
                fund_house      = EXCLUDED.fund_house,
                scheme_type     = EXCLUDED.scheme_type,
                scheme_category = EXCLUDED.scheme_category,
                search_name     = EXCLUDED.search_name,
                match_ratio     = EXCLUDED.match_ratio
        """, (
            scheme_code,
            scheme_name,
            meta.get("fund_house", ""),
            meta.get("scheme_type", ""),
            meta.get("scheme_category", ""),
            fund_name,
            match_ratio,
        ))
        conn.commit()

        if args.search_only:
            ok += 1
            print(f"    Metadata saved.")
            continue

        # ── Parse NAV rows ───────────────────────────────────────────────────
        nav_rows = []
        for row in nav_rows_raw:
            date_iso = parse_date(row.get("date", ""))
            try:
                nav_val = float(str(row.get("nav", "0")).replace(",", ""))
            except ValueError:
                continue
            if date_iso and nav_val > 0:
                nav_rows.append((scheme_code, date_iso, nav_val))

        if not nav_rows:
            print("0 NAV rows parsed")
            ok += 1
            continue

        # ── Upsert NAV data in batches ───────────────────────────────────────
        inserted = 0
        for start in range(0, len(nav_rows), BATCH_SIZE):
            batch = nav_rows[start : start + BATCH_SIZE]
            execute_values(
                cur,
                """
                INSERT INTO mf_nav_data (scheme_code, date, nav)
                VALUES %s
                ON CONFLICT (scheme_code, date) DO UPDATE
                    SET nav = EXCLUDED.nav
                """,
                batch,
            )
            inserted += len(batch)

        conn.commit()
        # data from mfapi is newest-first; oldest date is last element
        oldest = nav_rows[-1][1]
        newest = nav_rows[0][1]
        print(f"{inserted} rows  ({oldest} → {newest})")
        ok += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    print(f"\n{'='*60}")
    print(f"Done.  {ok}/{total} funds loaded  |  {skipped} skipped  |  {len(failed)} failed")

    if failed:
        print(f"\nFailed / not found ({len(failed)}):")
        for name in failed:
            print(f"  - {name}")

        # Write failures to a file for easy review
        fail_path = os.path.join(os.path.dirname(__file__), "mfapi_failures.txt")
        with open(fail_path, "w") as fh:
            fh.write("\n".join(failed) + "\n")
        print(f"\nFailures written to {fail_path}")

    if cur:
        cur.close()
    if conn:
        conn.close()


if __name__ == "__main__":
    main()
