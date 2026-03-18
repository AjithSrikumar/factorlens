"""
EOD scraper for FactorLens — run manually or via CI.
Fetches daily NAV data for all NSE indices and upserts to Supabase.
New indices are automatically inserted into the `funds` table if missing,
and historical data is pulled from the index inception date on first run.

Sources:
  - NSE indices : niftyindices.com POST API

Usage:
    pip install requests psycopg2-binary
    python scripts/scrape_eod.py
"""

import os, sys, json, time, math
from datetime import datetime, timedelta, timezone
try:
    from zoneinfo import ZoneInfo
except ModuleNotFoundError:
    from backports.zoneinfo import ZoneInfo

import requests
import psycopg2
from psycopg2.extras import execute_values

# ── Config ────────────────────────────────────────────────────────────────────

DB_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres.cxmaeueobsqrbivoqvry:74d4pPImwlV0sCH3LDrUUsB9OIkKHNzSrRZyht8OyWiWSGPr7uA8Iz1qRqlJCxQn@aws-0-us-west-2.pooler.supabase.com:5432/postgres"
)

IST = ZoneInfo("Asia/Kolkata")

NSE_INDICES = [
    # ── Broad Market ──────────────────────────────────────────────────────────
    ("N50",          "NIFTY 50"),
    ("NN50",         "NIFTY NEXT 50"),
    ("N100",         "NIFTY 100"),
    ("N200",         "NIFTY 200"),
    ("N500",         "NIFTY 500"),
    ("NMC50",        "NIFTY MIDCAP 50"),
    ("NMC100",       "NIFTY MIDCAP 100"),
    ("NMC150",       "NIFTY MIDCAP 150"),
    ("NMCSEL",       "NIFTY MIDCAP SELECT"),
    ("NSC50",        "NIFTY SMALLCAP 50"),
    ("NSC100",       "NIFTY SMALLCAP 100"),
    ("NSC250",       "NIFTY SMALLCAP 250"),
    ("NSC500",       "NIFTY SMALLCAP 500"),
    ("NμC250",       "NIFTY MICROCAP 250"),
    ("NTM",          "NIFTY TOTAL MARKET"),
    ("NMSC400",      "NIFTY MIDSMALLCAP 400"),
    ("N500MC5025",   "NIFTY500 MULTICAP 50:25:25"),
    ("NLMC250",      "NIFTY LARGEMIDCAP 250"),
    ("N500LMSECW",   "NIFTY500 LARGEMIDSMALL EQUAL-CAP WEIGHTED"),
    ("NIFPI150",     "NIFTY INDIA FPI 150"),

    # ── Factor: Momentum ──────────────────────────────────────────────────────
    ("MC150M50",     "NIFTY MIDCAP150 MOMENTUM 50"),
    ("N500M50",      "NIFTY500 MOMENTUM 50"),
    ("N200M30",      "NIFTY200 MOMENTUM 30"),
    ("NTMMQ50",      "NIFTY TOTAL MARKET MOMENTUM QUALITY 50"),
    ("MMS400MQ100",  "NIFTY MIDSMALLCAP400 MOMENTUM QUALITY 100"),
    ("SC250MQ100",   "NIFTY SMALLCAP250 MOMENTUM QUALITY 100"),
    ("N500MCQ50",    "NIFTY500 MULTICAP MOMENTUM QUALITY 50"),

    # ── Factor: Quality ───────────────────────────────────────────────────────
    ("MC150Q50",     "NIFTY MIDCAP150 QUALITY 50"),
    ("N500Q50",      "NIFTY500 QUALITY 50"),
    ("N200Q30",      "NIFTY200 QUALITY 30"),
    ("N100Q30",      "NIFTY100 QUALITY 30"),
    ("SC250Q50",     "NIFTY SMALLCAP250 QUALITY 50"),
    ("N500FCQ30",    "NIFTY500 FLEXICAP QUALITY 30"),

    # ── Factor: Low Volatility ────────────────────────────────────────────────
    ("N100LV30",     "NIFTY100 LOW VOLATILITY 30"),
    ("N500LV50",     "NIFTY500 LOW VOLATILITY 50"),
    ("NLV50",        "NIFTY LOW VOLATILITY 50"),

    # ── Factor: Alpha ─────────────────────────────────────────────────────────
    ("NALPHA50",     "NIFTY ALPHA 50"),
    ("N100A30",      "NIFTY100 ALPHA 30"),
    ("N200A30",      "NIFTY200 ALPHA 30"),

    # ── Factor: Value ─────────────────────────────────────────────────────────
    ("N500V50",      "NIFTY500 VALUE 50"),
    ("N200V30",      "NIFTY200 VALUE 30"),
    ("N50V20",       "NIFTY50 VALUE 20"),

    # ── Factor: Multi-Factor ─────────────────────────────────────────────────
    ("N500MF50",     "NIFTY500 MULTIFACTOR MQVLV 50"),
    ("NALV30",       "NIFTY ALPHA LOW-VOLATILITY 30"),
    ("NAQLV30",      "NIFTY ALPHA QUALITY LOW-VOLATILITY 30"),
    ("NAQVLV30",     "NIFTY ALPHA QUALITY VALUE LOW-VOLATILITY 30"),
    ("NQLV30",       "NIFTY QUALITY LOW-VOLATILITY 30"),

    # ── Factor: Dividend ─────────────────────────────────────────────────────
    ("NDIV50",       "NIFTY DIVIDEND OPPORTUNITIES 50"),
    ("N50DP",        "NIFTY50 DIVIDEND POINTS"),

    # ── Factor: Equal Weight ─────────────────────────────────────────────────
    ("N50EW",        "NIFTY50 EQUAL WEIGHT"),
    ("N100EW",       "NIFTY100 EQUAL WEIGHT"),
    ("N500EW",       "NIFTY500 EQUAL WEIGHT"),
    ("NT10EW",       "NIFTY TOP 10 EQUAL WEIGHT"),
    ("NT15EW",       "NIFTY TOP 15 EQUAL WEIGHT"),
    ("NT20EW",       "NIFTY TOP 20 EQUAL WEIGHT"),

    # ── Factor: High Beta ────────────────────────────────────────────────────
    ("NHBETA50",     "NIFTY HIGH BETA 50"),

    # ── Factor: Growth ───────────────────────────────────────────────────────
    ("NGRWTH15",     "NIFTY GROWTH SECTORS 15"),

    # ── Leverage / Inverse ───────────────────────────────────────────────────
    ("N50TR2X",      "NIFTY50 TR 2X LEVERAGE"),
    ("N50PR2X",      "NIFTY50 PR 2X LEVERAGE"),
    ("N50TR1XI",     "NIFTY50 TR 1X INVERSE"),
    ("N50PR1XI",     "NIFTY50 PR 1X INVERSE"),

    # ── USD ──────────────────────────────────────────────────────────────────
    ("N50USD",       "NIFTY50 USD"),

    # ── Sectoral / Thematic ──────────────────────────────────────────────────
    ("NBANK",        "NIFTY BANK"),
    ("NFIN",         "NIFTY FINANCIAL SERVICES"),
    ("NFIN2550",     "NIFTY FINANCIAL SERVICES 25/50"),
    ("NFINEXBNK",    "NIFTY FINANCIAL SERVICES EX-BANK"),
    ("NPVTBNK",      "NIFTY PRIVATE BANK"),
    ("NPSUBNK",      "NIFTY PSU BANK"),
    ("NIT",          "NIFTY IT"),
    ("NPHARMA",      "NIFTY PHARMA"),
    ("NHCARE",       "NIFTY HEALTHCARE INDEX"),
    ("NAUTO",        "NIFTY AUTO"),
    ("NFMCG",        "NIFTY FMCG"),
    ("NMETAL",       "NIFTY METAL"),
    ("NENERGY",      "NIFTY ENERGY"),
    ("NOILGAS",      "NIFTY OIL & GAS"),
    ("NINFRA",       "NIFTY INFRASTRUCTURE"),
    ("NREALTY",      "NIFTY REALTY"),
    ("NMEDIA",       "NIFTY MEDIA"),
    ("NCONSDUR",     "NIFTY CONSUMER DURABLES"),
    ("NCHEM",        "NIFTY CHEMICALS"),
    ("NMNC",         "NIFTY MNC"),
    ("NPSE",         "NIFTY PSE"),
    ("NCPSE",        "NIFTY CPSE"),
    ("NCOMMOD",      "NIFTY COMMODITIES"),
    ("NCON",         "NIFTY INDIA CONSUMPTION"),
    ("NSVC",         "NIFTY SERVICES SECTOR"),
    ("N500HCARE",    "NIFTY500 HEALTHCARE"),
    ("NMSHCARE",     "NIFTY MIDSMALL HEALTHCARE"),
    ("NMSFIN",       "NIFTY MIDSMALL FINANCIAL SERVICES"),
    ("NMSITTEL",     "NIFTY MIDSMALL IT & TELECOM"),
    ("NINDIDEF",     "NIFTY INDIA DEFENCE"),
    ("NINDIATRM",    "NIFTY INDIA TOURISM"),
    ("NCAPITAL",     "NIFTY CAPITAL MARKETS"),
    ("NEVNAA",       "NIFTY EV & NEW AGE AUTOMOTIVE"),
    ("NNACON",       "NIFTY INDIA NEW AGE CONSUMPTION"),
    ("NMATR",        "NIFTY INDIA SELECT 5 CORPORATE GROUPS (MAATR)"),
    ("NMOBIL",       "NIFTY MOBILITY"),
    ("NCOREHSE",     "NIFTY CORE HOUSING"),
    ("NHOUSING",     "NIFTY HOUSING"),
    ("NIPO",         "NIFTY IPO"),
    ("NMSCON",       "NIFTY MIDSMALL INDIA CONSUMPTION"),
    ("NNCC",         "NIFTY NON-CYCLICAL CONSUMER"),
    ("NRURAL",       "NIFTY RURAL"),
    ("NSHAR25",      "NIFTY SHARIAH 25"),
    ("N50SHAR",      "NIFTY50 SHARIAH"),
    ("N500SHAR",     "NIFTY500 SHARIAH"),
    ("NTRANLOG",     "NIFTY TRANSPORTATION & LOGISTICS"),
    ("NSMEEMERGE",   "NIFTY SME EMERGE"),
    ("NINDINTRN",    "NIFTY INDIA INTERNET"),
    ("NWAVES",       "NIFTY WAVES"),
    ("NIIL",         "NIFTY INDIA INFRASTRUCTURE & LOGISTICS"),
    ("NIRNPSU",      "NIFTY INDIA RAILWAYS PSU"),
    ("NCONG50",      "NIFTY CONGLOMERATE 50"),
    ("NINDIAMFG",    "NIFTY INDIA MANUFACTURING"),
    ("NITATACG",     "NIFTY INDIA CORPORATE GROUP INDEX - TATA GROUP 25% CAP"),
    ("N500MCIM",     "NIFTY500 MULTICAP INDIA MANUFACTURING 50:30:20"),
    ("N500MCINFRA",  "NIFTY500 MULTICAP INFRASTRUCTURE 50:30:20"),
    ("N100ESGSL",    "NIFTY100 ESG SECTOR LEADERS"),
    ("N100ESG",      "NIFTY100 ESG"),
    ("N100EESG",     "NIFTY100 ENHANCED ESG"),
    ("NINDIDIG",     "NIFTY INDIA DIGITAL"),

    # ── Liquidity ────────────────────────────────────────────────────────────
    ("N100LQ15",     "NIFTY100 LIQUID 15"),
    ("NMCLQ15",      "NIFTY MIDCAP LIQUID 15"),

    # ── Volatility ───────────────────────────────────────────────────────────
    ("IVIX",         "INDIA VIX"),

    # ── Fixed Income / G-Sec / Bharat Bond ───────────────────────────────────
    ("N813GSEC",     "NIFTY 8-13 YR G-SEC"),
    ("N10GSEC",      "NIFTY 10 YR BENCHMARK G-SEC"),
    ("N10GSECCP",    "NIFTY 10 YR BENCHMARK G-SEC (CLEAN PRICE)"),
    ("N48GSEC",      "NIFTY 4-8 YR G-SEC INDEX"),
    ("N1115GSEC",    "NIFTY 11-15 YR G-SEC INDEX"),
    ("N15PGSEC",     "NIFTY 15 YR AND ABOVE G-SEC INDEX"),
    ("NCGSEC",       "NIFTY COMPOSITE G-SEC INDEX"),
    ("NBB2030",      "NIFTY BHARAT BOND INDEX - APRIL 2030"),
    ("NBB2031",      "NIFTY BHARAT BOND INDEX - APRIL 2031"),
    ("NBB2032",      "NIFTY BHARAT BOND INDEX - APRIL 2032"),
    ("NBB2033",      "NIFTY BHARAT BOND INDEX - APRIL 2033"),
]

# ── Inception dates for new indices (used on first DB insert / first fetch) ───
# These are approximate launch dates; actual first data point may differ slightly.
INCEPTION_DATES = {
    # Broad Market
    "N50":         "1995-11-03",  "NN50":        "1997-01-01",
    "N100":        "2004-01-01",  "N200":        "2004-01-01",
    "N500":        "1995-11-03",  "NMC50":       "2004-01-01",
    "NMC100":      "2004-01-01",  "NMC150":      "2004-01-01",
    "NMCSEL":      "2014-01-01",  "NSC50":       "2004-01-01",
    "NSC100":      "2004-01-01",  "NSC250":      "2004-01-01",
    "NSC500":      "2005-01-03",  "NμC250":      "2005-01-03",
    "NTM":         "2005-01-03",  "NMSC400":     "2004-01-01",
    "N500MC5025":  "2005-01-03",  "NLMC250":     "2004-01-01",
    "N500LMSECW":  "2005-01-03",  "NIFPI150":    "2015-01-01",
    # Momentum
    "MC150M50":    "2005-01-03",  "N500M50":     "2005-01-03",
    "N200M30":     "2005-01-03",  "NTMMQ50":     "2005-01-03",
    "MMS400MQ100": "2005-01-03",  "SC250MQ100":  "2005-01-03",
    "N500MCQ50":   "2005-01-03",
    # Quality
    "MC150Q50":    "2005-01-03",  "N500Q50":     "2005-01-03",
    "N200Q30":     "2005-01-03",  "N100Q30":     "2005-01-03",
    "SC250Q50":    "2005-01-03",  "N500FCQ30":   "2018-01-01",
    # Low Vol
    "N100LV30":    "2005-01-03",  "N500LV50":    "2005-01-03",
    "NLV50":       "2005-01-03",
    # Alpha
    "NALPHA50":    "2005-01-03",  "N100A30":     "2005-01-03",
    "N200A30":     "2005-01-03",
    # Value
    "N500V50":     "2005-01-03",  "N200V30":     "2005-01-03",
    "N50V20":      "2005-01-03",
    # Multi-Factor
    "N500MF50":    "2005-01-03",  "NALV30":      "2005-01-03",
    "NAQLV30":     "2005-01-03",  "NAQVLV30":    "2005-01-03",
    "NQLV30":      "2005-01-03",
    # Dividend
    "NDIV50":      "2005-01-03",  "N50DP":       "2002-01-01",
    # Equal Weight
    "N50EW":       "2003-01-01",  "N100EW":      "2003-01-01",
    "N500EW":      "2005-01-03",  "NT10EW":      "2005-01-03",
    "NT15EW":      "2005-01-03",  "NT20EW":      "2005-01-03",
    # High Beta / Growth
    "NHBETA50":    "2005-01-03",  "NGRWTH15":    "2005-01-03",
    # Leverage
    "N50TR2X":     "2010-01-04",  "N50PR2X":     "2010-01-04",
    "N50TR1XI":    "2010-01-04",  "N50PR1XI":    "2010-01-04",
    "N50USD":      "1995-11-03",
    # Sectoral
    "NBANK":       "2000-01-01",  "NFIN":        "2004-01-01",
    "NFIN2550":    "2004-01-01",  "NFINEXBNK":   "2017-01-01",
    "NPVTBNK":     "2006-04-03",  "NPSUBNK":     "2004-01-01",
    "NIT":         "1996-01-01",  "NPHARMA":     "2001-01-01",
    "NHCARE":      "2017-01-01",  "NAUTO":       "2001-01-01",
    "NFMCG":       "1996-01-01",  "NMETAL":      "2004-01-01",
    "NENERGY":     "2001-01-01",  "NOILGAS":     "2018-01-01",
    "NINFRA":      "2004-01-01",  "NREALTY":     "2007-01-01",
    "NMEDIA":      "2004-01-01",  "NCONSDUR":    "2018-01-01",
    "NCHEM":       "2018-01-01",  "NMNC":        "1996-01-01",
    "NPSE":        "2007-01-01",  "NCPSE":       "2013-01-01",
    "NCOMMOD":     "2004-01-01",  "NCON":        "2011-01-03",
    "NSVC":        "2004-01-01",  "N500HCARE":   "2017-01-01",
    "NMSHCARE":    "2017-01-01",  "NMSFIN":      "2017-01-01",
    "NMSITTEL":    "2017-01-01",  "NINDIDEF":    "2018-01-01",
    "NINDIATRM":   "2022-01-03",  "NCAPITAL":    "2022-01-03",
    "NEVNAA":      "2022-01-03",  "NNACON":      "2022-01-03",
    "NMATR":       "2022-01-03",  "NMOBIL":      "2022-01-03",
    "NCOREHSE":    "2021-01-04",  "NHOUSING":    "2019-01-01",
    "NIPO":        "2010-01-04",  "NMSCON":      "2017-01-01",
    "NNCC":        "2019-01-01",  "NRURAL":      "2019-01-01",
    "NSHAR25":     "2004-01-01",  "N50SHAR":     "2009-01-01",
    "N500SHAR":    "2012-01-02",  "NTRANLOG":    "2022-01-03",
    "NSMEEMERGE":  "2015-01-01",  "NINDINTRN":   "2021-01-04",
    "NWAVES":      "2022-01-03",  "NIIL":        "2022-01-03",
    "NIRNPSU":     "2022-01-03",  "NCONG50":     "2022-01-03",
    "NINDIAMFG":   "2018-01-01",  "NITATACG":    "2019-01-01",
    "N500MCIM":    "2020-01-01",  "N500MCINFRA": "2020-01-01",
    "N100ESGSL":   "2019-01-01",  "N100ESG":     "2011-01-03",
    "N100EESG":    "2019-01-01",  "NINDIDIG":    "2020-01-01",
    # Liquidity
    "N100LQ15":    "2003-01-01",  "NMCLQ15":     "2004-01-01",
    # Volatility
    "IVIX":        "2008-01-01",
    # Fixed Income
    "N813GSEC":    "2001-01-01",  "N10GSEC":     "2001-01-01",
    "N10GSECCP":   "2001-01-01",  "N48GSEC":     "2001-01-01",
    "N1115GSEC":   "2001-01-01",  "N15PGSEC":    "2001-01-01",
    "NCGSEC":      "2001-01-01",  "NBB2030":     "2020-01-01",
    "NBB2031":     "2021-01-04",  "NBB2032":     "2022-01-03",
    "NBB2033":     "2023-01-02",
}

# ── Category helper for auto-insert ──────────────────────────────────────────

def derive_index_category(code: str, name: str) -> str:
    """Derive a display category for a new index based on its code/name."""
    n = name.lower()
    if code in ("IVIX",):                          return "Volatility"
    if "g-sec" in n or "bharat bond" in n:         return "Fixed Income"
    if any(x in n for x in ("momentum",)):         return "Momentum"
    if "multifactor" in n or "mqvlv" in n:         return "Multi-Factor"
    if any(x in n for x in ("alpha", "low vol", "quality", "value")):
        if sum(1 for x in ("alpha","low vol","quality","value") if x in n) >= 2:
            return "Multi-Factor"
        if "momentum" in n:                        return "Momentum"
        if "alpha" in n:                           return "Alpha"
        if "low vol" in n or "low-vol" in n:       return "Low Vol"
        if "quality" in n:                         return "Quality"
        if "value" in n:                           return "Value"
    if "dividend" in n:                            return "Dividend"
    if "equal weight" in n or "equal-cap" in n:    return "Equal Weight"
    if "high beta" in n:                           return "High Beta"
    if any(x in n for x in (
        "bank","financial","it ","pharma","health","auto","fmcg","metal",
        "energy","oil","infra","realty","media","psu","cpse","defence",
        "consumption","tourism","capital market","ev ","digital","rural",
        "shariah","transport","housing","ipo","manufacturing","mnc","pse",
        "chemical","conglomerate","internet","waves","railways","mobility",
        "esg","commodit","service","emerge",
    )):
        return "Thematic"
    return "Broad Market"

# ── Auto-insert new index funds into the `funds` table ───────────────────────

def ensure_funds_in_db(conn, cur) -> dict:
    """
    Insert any index codes from NSE_INDICES that are not yet
    in the `funds` table.  Returns the refreshed code→id mapping.
    """
    cur.execute("SELECT code FROM funds")
    existing = {row[0] for row in cur.fetchall()}

    to_insert = []
    for code, name in NSE_INDICES:
        if code not in existing:
            inception = INCEPTION_DATES.get(code, "2000-01-01")
            category  = derive_index_category(code, name)
            to_insert.append((code, name, category, inception))

    if to_insert:
        print(f"  Auto-inserting {len(to_insert)} new fund(s) into `funds` table …")
        execute_values(
            cur,
            """
            INSERT INTO funds (code, name, category, inception_date)
            VALUES %s
            ON CONFLICT (code) DO NOTHING
            """,
            to_insert,
        )
        conn.commit()
        for code, name, cat, inc in to_insert:
            print(f"    + [{code}] {name}  ({cat}, from {inc})")

    # Return refreshed map
    cur.execute("SELECT id, code FROM funds")
    return {row[1]: row[0] for row in cur.fetchall()}

NIFTY_HEADERS = {
    "Content-Type":     "application/json; charset=utf-8",
    "Accept":           "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    "Referer":          "https://www.niftyindices.com/reports/historical-data",
    "User-Agent":       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
}

# ── Date helpers ──────────────────────────────────────────────────────────────

MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]

def today_ist() -> str:
    return datetime.now(IST).strftime("%Y-%m-%d")

def iso_to_nifty_req(iso: str) -> str:
    """'2026-02-28' → '28-Feb-2026'"""
    d = datetime.strptime(iso, "%Y-%m-%d")
    return d.strftime(f"%d-{MONTHS_SHORT[d.month-1]}-%Y")

def nifty_resp_to_iso(date_str: str) -> str:
    """'28 Feb 2026' → '2026-02-28'"""
    try:
        d = datetime.strptime(date_str.strip(), "%d %b %Y")
        return d.strftime("%Y-%m-%d")
    except Exception:
        return ""

def add_days(iso: str, n: int) -> str:
    d = datetime.strptime(iso, "%Y-%m-%d") + timedelta(days=n)
    return d.strftime("%Y-%m-%d")

# ── Scrapers ──────────────────────────────────────────────────────────────────

def fetch_nifty_index(index_name: str, from_iso: str, to_iso: str, retries=3):
    """Return list of (date_iso, close_value) tuples."""
    cinfo = json.dumps({
        "name": index_name,
        "startDate": iso_to_nifty_req(from_iso),
        "endDate":   iso_to_nifty_req(to_iso),
        "indexName": index_name,
    })
    payload = json.dumps({"cinfo": cinfo})

    for attempt in range(retries):
        try:
            resp = requests.post(
                "https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString",
                data=payload,
                headers=NIFTY_HEADERS,
                timeout=20,
            )
            resp.raise_for_status()
            outer = resp.json()
            rows = json.loads(outer.get("d", "[]"))
            result = []
            for row in rows:
                date_str  = row.get("HistoricalDate") or row.get("Date") or row.get("date", "")
                close_str = row.get("CLOSE") or row.get("Close") or row.get("close", "")
                date_iso  = nifty_resp_to_iso(date_str)
                try:
                    val = float(close_str.replace(",", ""))
                except (ValueError, AttributeError):
                    continue
                if date_iso and val > 0:
                    result.append((date_iso, val))
            return result
        except Exception as e:
            print(f"  [attempt {attempt+1}/{retries}] {index_name}: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return []

# ── Metric computation ────────────────────────────────────────────────────────

def compute_cagr(nav: list) -> float:
    if len(nav) < 2:
        return 0.0
    start_val, end_val = nav[0][1], nav[-1][1]
    start_dt = datetime.strptime(nav[0][0], "%Y-%m-%d")
    end_dt   = datetime.strptime(nav[-1][0], "%Y-%m-%d")
    years = (end_dt - start_dt).days / 365
    if years <= 0:
        return 0.0
    return (end_val / start_val) ** (1.0 / years) - 1.0

def compute_volatility(nav: list) -> float:
    if len(nav) < 2:
        return 0.0
    returns = [(nav[i][1] / nav[i-1][1]) - 1 for i in range(1, len(nav))]
    mean = sum(returns) / len(returns)
    variance = sum((r - mean) ** 2 for r in returns) / len(returns)
    return math.sqrt(variance) * math.sqrt(252)

def compute_max_drawdown(nav: list) -> float:
    peak = nav[0][1]
    max_dd = 0.0
    for _, v in nav:
        if v > peak:
            peak = v
        dd = (v - peak) / peak
        if dd < max_dd:
            max_dd = dd
    return max_dd

def compute_rolling_3y(nav: list) -> list:
    WINDOW = 756
    result = []
    for i in range(WINDOW, len(nav)):
        start_v = nav[i - WINDOW][1]
        end_v   = nav[i][1]
        cagr    = (end_v / start_v) ** (1.0 / 3.0) - 1.0
        result.append(cagr * 100)
    return result

def compute_metrics(nav: list) -> dict:
    cagr    = compute_cagr(nav)
    vol     = compute_volatility(nav)
    max_dd  = compute_max_drawdown(nav)
    sharpe  = cagr / vol if vol > 0 else 0.0
    calmar  = cagr / abs(max_dd) if max_dd != 0 else 0.0
    rolling = compute_rolling_3y(nav)
    avg3y   = (sum(rolling) / len(rolling) / 100) if rolling else 0.0
    return dict(cagr=cagr, vol=vol, max_dd=max_dd, sharpe=sharpe,
                calmar=calmar, avg3y=avg3y)

# ── mfapi.in EOD update ────────────────────────────────────────────────────────

MFAPI_BASE = "https://api.mfapi.in/mf"
MF_FETCH_DELAY = 0.25   # seconds between mfapi requests

MF_MONTHS = {
    "Jan":"01","Feb":"02","Mar":"03","Apr":"04","May":"05","Jun":"06",
    "Jul":"07","Aug":"08","Sep":"09","Oct":"10","Nov":"11","Dec":"12",
}

def mfapi_date_to_iso(s: str) -> str:
    """'13-Mar-2026' → '2026-03-13'"""
    parts = s.strip().split("-")
    if len(parts) != 3:
        return ""
    dd, mon, yyyy = parts
    mm = MF_MONTHS.get(mon, "")
    if not mm:
        return ""
    return f"{yyyy}-{mm}-{dd.zfill(2)}"

def fetch_mf_latest(scheme_code: int, retries: int = 3):
    """Return (date_iso, nav_float) for the latest NAV, or None on failure."""
    for attempt in range(retries):
        try:
            resp = requests.get(
                f"{MFAPI_BASE}/{scheme_code}/latest",
                timeout=10,
                verify=False,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") != "SUCCESS" or not data.get("data"):
                return None
            row = data["data"][0]
            date_iso = mfapi_date_to_iso(row.get("date", ""))
            try:
                nav = float(row.get("nav", "0"))
            except (ValueError, TypeError):
                return None
            if not date_iso or nav <= 0:
                return None
            return (date_iso, nav)
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return None

def fetch_mf_since(scheme_code: int, after_date: str, retries: int = 3):
    """Fetch full history and return rows with date > after_date."""
    for attempt in range(retries):
        try:
            resp = requests.get(
                f"{MFAPI_BASE}/{scheme_code}",
                timeout=30,
                verify=False,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("status") != "SUCCESS" or not data.get("data"):
                return []
            rows = []
            for row in data["data"]:
                date_iso = mfapi_date_to_iso(row.get("date", ""))
                try:
                    nav = float(row.get("nav", "0"))
                except (ValueError, TypeError):
                    continue
                if date_iso and nav > 0 and date_iso > after_date:
                    rows.append((date_iso, nav))
            return rows
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return []

def update_mf_nav(conn, cur) -> None:
    """Fetch latest NAV for all funds in mf_funds and upsert into mf_nav_data."""
    today = today_ist()
    print(f"\n=== MF NAV UPDATE (mfapi.in) — {today} ===")

    # Load all scheme codes
    cur.execute("SELECT scheme_code, scheme_name FROM mf_funds ORDER BY scheme_code")
    mf_funds = cur.fetchall()
    if not mf_funds:
        print("  No funds in mf_funds table — run mfapi_loader.py first")
        return

    print(f"  {len(mf_funds)} funds in mf_funds")

    # Get latest date per scheme from mf_nav_data
    cur.execute("""
        SELECT DISTINCT ON (scheme_code) scheme_code, date
        FROM mf_nav_data
        ORDER BY scheme_code, date DESC
    """)
    latest_by_scheme = {row[0]: row[1].strftime("%Y-%m-%d") for row in cur.fetchall()}

    to_insert = []   # (scheme_code, date, nav)
    skipped   = 0
    errors    = 0

    for scheme_code, scheme_name in mf_funds:
        last_date = latest_by_scheme.get(scheme_code, "2000-01-01")

        result = fetch_mf_latest(scheme_code)
        time.sleep(MF_FETCH_DELAY)

        if not result:
            errors += 1
            continue

        latest_date, latest_nav = result

        if latest_date <= last_date:
            skipped += 1
            continue

        # Missed multiple days — backfill from full history
        day_gap = (
            datetime.strptime(latest_date, "%Y-%m-%d") -
            datetime.strptime(last_date,   "%Y-%m-%d")
        ).days

        if day_gap > 3:
            rows = fetch_mf_since(scheme_code, last_date)
            time.sleep(MF_FETCH_DELAY)
            to_insert.extend((scheme_code, d, v) for d, v in rows)
            print(f"  [{scheme_code}] backfill {len(rows)} rows (gap={day_gap}d) → {latest_date}")
        else:
            to_insert.append((scheme_code, latest_date, latest_nav))

    # Upsert collected rows
    if to_insert:
        execute_values(
            cur,
            """
            INSERT INTO mf_nav_data (scheme_code, date, nav)
            VALUES %s
            ON CONFLICT (scheme_code, date) DO UPDATE SET nav = EXCLUDED.nav
            """,
            to_insert,
        )
        conn.commit()

    inserted = len(to_insert)
    print(f"  Inserted {inserted} rows | skipped {skipped} (up to date) | errors {errors}")


def main():
    today = today_ist()
    print(f"EOD scraper — {today} IST\n")

    conn = psycopg2.connect(DB_URL)
    cur  = conn.cursor()

    # ── Ensure all index entries exist in the `funds` table ──────────────────
    print("=== ENSURING FUND ENTRIES IN DB ===")
    code_to_id = ensure_funds_in_db(conn, cur)

    # Latest nav date per fund
    cur.execute("""
        SELECT DISTINCT ON (fund_id) fund_id, date
        FROM nav_data
        ORDER BY fund_id, date DESC
    """)
    latest_by_fund = {row[0]: row[1].strftime("%Y-%m-%d") for row in cur.fetchall()}

    total_inserted = 0
    funds_updated = []

    # ── NSE indices ──────────────────────────────────────────────────────────
    print("=== NSE INDICES (niftyindices.com) ===")
    for code, index_name in NSE_INDICES:
        fund_id = code_to_id.get(code)
        if not fund_id:
            print(f"  [{code}] not in DB, skipping")
            continue

        # For funds with no data yet, pull from inception date; otherwise +1 day
        default_start = INCEPTION_DATES.get(code, "2000-01-01")
        last_date = latest_by_fund.get(fund_id, default_start)
        from_iso  = add_days(last_date, 1)

        if from_iso > today:
            print(f"  [{code}] up to date ({last_date})")
            continue

        print(f"  [{code}] {index_name}: fetching {from_iso} → {today} ...", end=" ", flush=True)
        rows = fetch_nifty_index(index_name, from_iso, today)

        new_rows = [(fund_id, d, v) for d, v in rows if d > last_date]
        if not new_rows:
            print("no new data")
            continue

        min_date, max_date = new_rows[0][1], new_rows[-1][1]
        cur.execute(
            "DELETE FROM nav_data WHERE fund_id = %s AND date BETWEEN %s AND %s",
            (fund_id, min_date, max_date)
        )
        execute_values(cur, "INSERT INTO nav_data (fund_id, date, nav_value) VALUES %s", new_rows)
        conn.commit()
        print(f"{len(new_rows)} rows → latest {new_rows[-1][1]}")
        total_inserted += len(new_rows)
        funds_updated.append(fund_id)
        time.sleep(0.3)  # be polite to niftyindices

    print(f"\nTotal new rows inserted: {total_inserted}")

    # ── Recompute metrics for updated funds ──────────────────────────────────
    if funds_updated:
        print(f"\n=== RECOMPUTING METRICS ({len(funds_updated)} funds) ===")
        cur.execute(
            "SELECT fund_id, date, nav_value FROM nav_data WHERE fund_id = ANY(%s) ORDER BY fund_id, date",
            (list(set(funds_updated)),)
        )
        nav_rows = cur.fetchall()

        # Group by fund
        nav_by_fund: dict = {}
        for fid, dt, val in nav_rows:
            nav_by_fund.setdefault(fid, []).append((dt.strftime("%Y-%m-%d"), float(val)))

        for fund_id, nav in nav_by_fund.items():
            if len(nav) < 2:
                continue
            m = compute_metrics(nav)
            cur.execute("""
                UPDATE funds SET
                    cagr = %s,
                    volatility = %s,
                    max_drawdown = %s,
                    sharpe_ratio = %s,
                    calmar_ratio = %s,
                    avg_3y_rolling_return = %s
                WHERE id = %s
            """, (m["cagr"], m["vol"], m["max_dd"], m["sharpe"], m["calmar"], m["avg3y"], fund_id))
            code = next((c for c, i in code_to_id.items() if i == fund_id), str(fund_id))
            print(f"  [{code}] CAGR={m['cagr']*100:.2f}%  Sharpe={m['sharpe']:.2f}  MaxDD={m['max_dd']*100:.2f}%")

        conn.commit()

    # ── mfapi.in NAV update ──────────────────────────────────────────────────
    update_mf_nav(conn, cur)

    cur.close()
    conn.close()
    print("\nDone!")


if __name__ == "__main__":
    main()
