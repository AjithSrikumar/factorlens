/**
 * index-fund-map.ts
 *
 * Canonical list of NSE indices tracked by FactorLens.
 * Used to:
 *  1. Map a mutual-fund name → the index it tracks  (getTrackedIndex)
 *  2. Map an index code/name → search terms to find tracking MFs  (getIndexSearchTerms)
 */

export interface IndexEntry {
  /** Short DB code used in the `funds` table (e.g. "N500LV50") */
  code: string
  /** Full index name as used by niftyindices.com API */
  name: string
  /** Category shown on rankings page */
  category: string
  /** Approximate inception date (YYYY-MM-DD) for historical backfill */
  inception: string
}

/**
 * Complete list of NSE indices.
 * Entries are ordered so that more-specific names come BEFORE shorter ones
 * that could be a sub-string match (e.g. "NIFTY 100" before "NIFTY 50").
 */
export const NSE_INDEX_LIST: IndexEntry[] = [
  // ── Broad Market ──────────────────────────────────────────────────────────
  { code: "NTM",         name: "NIFTY TOTAL MKT",                                 category: "Broad Market", inception: "2005-01-03" },
  { code: "N500",        name: "NIFTY 500",                                        category: "Broad Market", inception: "1995-11-03" },
  { code: "N200",        name: "NIFTY 200",                                        category: "Broad Market", inception: "2004-01-01" },
  { code: "N100",        name: "NIFTY 100",                                        category: "Broad Market", inception: "2004-01-01" },
  { code: "NLMC250",     name: "NIFTY LARGEMID250",                               category: "Broad Market", inception: "2004-01-01" },
  { code: "NMSC400",     name: "NIFTY MIDSMALLCAP 400",                            category: "Broad Market", inception: "2004-01-01" },
  { code: "NN50",        name: "NIFTY NEXT 50",                                    category: "Broad Market", inception: "1997-01-01" },
  { code: "N50",         name: "NIFTY 50",                                         category: "Broad Market", inception: "1995-11-03" },
  { code: "NMC150",      name: "NIFTY MIDCAP 150",                                 category: "Broad Market", inception: "2004-01-01" },
  { code: "NMC100",      name: "NIFTY MIDCAP 100",                                 category: "Broad Market", inception: "2004-01-01" },
  { code: "NMC50",       name: "NIFTY MIDCAP 50",                                  category: "Broad Market", inception: "2004-01-01" },
  { code: "NMCSEL",      name: "NIFTY MID SELECT",                                category: "Broad Market", inception: "2014-01-01" },
  { code: "NSC250",      name: "NIFTY SMALLCAP 250",                               category: "Broad Market", inception: "2004-01-01" },
  { code: "NSC100",      name: "NIFTY SMALLCAP 100",                               category: "Broad Market", inception: "2004-01-01" },
  { code: "NSC50",       name: "NIFTY SMALLCAP 50",                                category: "Broad Market", inception: "2004-01-01" },
  { code: "NμC250",      name: "NIFTY MICROCAP250",                               category: "Broad Market", inception: "2005-01-03" },
  { code: "NSC500",      name: "NIFTY SMALLCAP 500",                               category: "Broad Market", inception: "2005-01-03" },
  { code: "N500MC5025",  name: "NIFTY500 MULTICAP 50:25:25",                       category: "Broad Market", inception: "2005-01-03" },
  { code: "N500LMSECW",  name: "NIFTY500 LARGEMIDSMALL EQUAL-CAP WEIGHTED",        category: "Broad Market", inception: "2005-01-03" },

  // ── Factor: Momentum ──────────────────────────────────────────────────────
  { code: "NTMMQ50",     name: "NIFTY TOTAL MARKET MOMENTUM QUALITY 50",          category: "Momentum",    inception: "2005-01-03" },
  { code: "MMS400MQ100", name: "NIFTY MIDSMALLCAP400 MOMENTUM QUALITY 100",       category: "Momentum",    inception: "2005-01-03" },
  { code: "SC250MQ100",  name: "NIFTY SMALLCAP250 MOMENTUM QUALITY 100",          category: "Momentum",    inception: "2005-01-03" },
  { code: "N500MCQ50",   name: "NIFTY500 MULTICAP MOMENTUM QUALITY 50",           category: "Momentum",    inception: "2005-01-03" },
  { code: "MC150M50",    name: "NIFTY MIDCAP150 MOMENTUM 50",                     category: "Momentum",    inception: "2005-01-03" },
  { code: "N500M50",     name: "NIFTY500 MOMENTUM 50",                            category: "Momentum",    inception: "2005-01-03" },
  { code: "N200M30",     name: "NIFTY200 MOMENTUM 30",                            category: "Momentum",    inception: "2005-01-03" },

  // ── Factor: Quality ───────────────────────────────────────────────────────
  { code: "MC150Q50",    name: "NIFTY MIDCAP150 QUALITY 50",                      category: "Quality",     inception: "2005-01-03" },
  { code: "N500Q50",     name: "NIFTY500 QUALITY 50",                             category: "Quality",     inception: "2005-01-03" },
  { code: "N200Q30",     name: "NIFTY200 QUALITY 30",                             category: "Quality",     inception: "2005-01-03" },
  { code: "N100Q30",     name: "NIFTY100 QUALITY 30",                             category: "Quality",     inception: "2005-01-03" },
  { code: "SC250Q50",    name: "NIFTY SMALLCAP250 QUALITY 50",                    category: "Quality",     inception: "2005-01-03" },
  { code: "NQLV30",      name: "NIFTY QUALITY LOW-VOLATILITY 30",                 category: "Multi-Factor",inception: "2005-01-03" },
  { code: "N500FCQ30",   name: "NIFTY500 FLEXICAP QUALITY 30",                    category: "Quality",     inception: "2005-01-03" },

  // ── Factor: Low Volatility ────────────────────────────────────────────────
  { code: "N100LV30",    name: "NIFTY100 LOW VOLATILITY 30",                      category: "Low Vol",     inception: "2005-01-03" },
  { code: "N500LV50",    name: "NIFTY500 LOW VOLATILITY 50",                      category: "Low Vol",     inception: "2005-01-03" },
  { code: "NLV50",       name: "NIFTY LOW VOLATILITY 50",                         category: "Low Vol",     inception: "2005-01-03" },

  // ── Factor: Alpha ─────────────────────────────────────────────────────────
  { code: "NALPHA50",    name: "NIFTY ALPHA 50",                                  category: "Alpha",       inception: "2005-01-03" },
  { code: "N100A30",     name: "NIFTY100 ALPHA 30",                               category: "Alpha",       inception: "2005-01-03" },
  { code: "N200A30",     name: "NIFTY200 ALPHA 30",                               category: "Alpha",       inception: "2005-01-03" },

  // ── Factor: Value ─────────────────────────────────────────────────────────
  { code: "N500V50",     name: "NIFTY500 VALUE 50",                               category: "Value",       inception: "2005-01-03" },
  { code: "N200V30",     name: "NIFTY200 VALUE 30",                               category: "Value",       inception: "2005-01-03" },
  { code: "N50V20",      name: "NIFTY50 VALUE 20",                                category: "Value",       inception: "2005-01-03" },

  // ── Factor: Dividend ─────────────────────────────────────────────────────
  { code: "NDIV50",      name: "NIFTY DIVIDEND OPPORTUNITIES 50",                 category: "Dividend",    inception: "2005-01-03" },
  { code: "N50DP",       name: "NIFTY50 DIVIDEND POINTS",                         category: "Dividend",    inception: "2002-01-01" },

  // ── Factor: Equal Weight ─────────────────────────────────────────────────
  { code: "N50EW",       name: "NIFTY50 EQUAL WEIGHT",                            category: "Equal Weight",inception: "2003-01-01" },
  { code: "N100EW",      name: "NIFTY100 EQUAL WEIGHT",                           category: "Equal Weight",inception: "2003-01-01" },
  { code: "N500EW",      name: "NIFTY500 EQUAL WEIGHT",                           category: "Equal Weight",inception: "2005-01-03" },
  { code: "NT10EW",      name: "NIFTY TOP 10 EQUAL WEIGHT",                       category: "Equal Weight",inception: "2005-01-03" },
  { code: "NT15EW",      name: "NIFTY TOP 15 EQUAL WEIGHT",                       category: "Equal Weight",inception: "2005-01-03" },
  { code: "NT20EW",      name: "NIFTY TOP 20 EQUAL WEIGHT",                       category: "Equal Weight",inception: "2005-01-03" },

  // ── Factor: Multi-Factor ─────────────────────────────────────────────────
  { code: "N500MF50",    name: "NIFTY500 MULTIFACTOR MQVLV 50",                   category: "Multi-Factor",inception: "2005-01-03" },
  { code: "NALV30",      name: "NIFTY ALPHA LOW-VOLATILITY 30",                   category: "Multi-Factor",inception: "2005-01-03" },
  { code: "NAQLV30",     name: "NIFTY ALPHA QUALITY LOW-VOLATILITY 30",           category: "Multi-Factor",inception: "2005-01-03" },
  { code: "NAQVLV30",    name: "NIFTY ALPHA QUALITY VALUE LOW-VOLATILITY 30",     category: "Multi-Factor",inception: "2005-01-03" },

  // ── Factor: High Beta ────────────────────────────────────────────────────
  { code: "NHBETA50",    name: "NIFTY HIGH BETA 50",                              category: "High Beta",   inception: "2005-01-03" },

  // ── Factor: Growth ───────────────────────────────────────────────────────
  { code: "NGRWTH15",    name: "NIFTY GROWTH SECTORS 15",                         category: "Thematic",    inception: "2005-01-03" },

  // ── Leverage / Inverse ───────────────────────────────────────────────────
  { code: "N50TR2X",     name: "NIFTY50 TR 2X LEV",                               category: "Leverage",    inception: "2010-01-04" },
  { code: "N50PR2X",     name: "NIFTY50 PR 2X LEV",                               category: "Leverage",    inception: "2010-01-04" },
  { code: "N50TR1XI",    name: "NIFTY50 TR 1X INV",                               category: "Leverage",    inception: "2010-01-04" },
  { code: "N50PR1XI",    name: "NIFTY50 PR 1X INV",                               category: "Leverage",    inception: "2010-01-04" },

  // ── USD / FPI ────────────────────────────────────────────────────────────
  { code: "N50USD",      name: "NIFTY50 USD",                                     category: "Broad Market",inception: "1995-11-03" },
  { code: "NIFPI150",    name: "NIFTY INDIA FPI 150",                             category: "Broad Market",inception: "2015-01-01" },

  // ── Sectoral / Thematic ──────────────────────────────────────────────────
  { code: "NBANK",       name: "NIFTY BANK",                                      category: "Thematic",    inception: "2000-01-01" },
  { code: "NFIN",        name: "NIFTY FINANCIAL SERVICES",                        category: "Thematic",    inception: "2004-01-01" },
  { code: "NFIN2550",    name: "NIFTY FINANCIAL SERVICES 25/50",                  category: "Thematic",    inception: "2004-01-01" },
  { code: "NFINEXBNK",   name: "NIFTY FINANCIAL SERVICES EX-BANK",                category: "Thematic",    inception: "2017-01-01" },
  { code: "NPVTBNK",     name: "Nifty Pvt Bank",                                  category: "Thematic",    inception: "2006-04-03" },
  { code: "NPSUBNK",     name: "NIFTY PSU BANK",                                  category: "Thematic",    inception: "2004-01-01" },
  { code: "NIT",         name: "NIFTY IT",                                        category: "Thematic",    inception: "1996-01-01" },
  { code: "NPHARMA",     name: "NIFTY PHARMA",                                    category: "Thematic",    inception: "2001-01-01" },
  { code: "NHCARE",      name: "Nifty Healthcare",                                category: "Thematic",    inception: "2017-01-01" },
  { code: "NAUTO",       name: "NIFTY AUTO",                                      category: "Thematic",    inception: "2001-01-01" },
  { code: "NFMCG",       name: "NIFTY FMCG",                                      category: "Thematic",    inception: "1996-01-01" },
  { code: "NMETAL",      name: "NIFTY METAL",                                     category: "Thematic",    inception: "2004-01-01" },
  { code: "NENERGY",     name: "NIFTY ENERGY",                                    category: "Thematic",    inception: "2001-01-01" },
  { code: "NOILGAS",     name: "Nifty Oil and Gas",                               category: "Thematic",    inception: "2018-01-01" },
  { code: "NINFRA",      name: "Nifty Infra",                                     category: "Thematic",    inception: "2004-01-01" },
  { code: "NREALTY",     name: "NIFTY REALTY",                                    category: "Thematic",    inception: "2007-01-01" },
  { code: "NMEDIA",      name: "NIFTY MEDIA",                                     category: "Thematic",    inception: "2004-01-01" },
  { code: "NCONSDUR",    name: "NIFTY CONSUMER DURABLES",                         category: "Thematic",    inception: "2018-01-01" },
  { code: "NCHEM",       name: "NIFTY CHEMICALS",                                 category: "Thematic",    inception: "2018-01-01" },
  { code: "NMNC",        name: "NIFTY MNC",                                       category: "Thematic",    inception: "1996-01-01" },
  { code: "NPSE",        name: "NIFTY PSE",                                       category: "Thematic",    inception: "2007-01-01" },
  { code: "NCPSE",       name: "NIFTY CPSE",                                      category: "Thematic",    inception: "2013-01-01" },
  { code: "NCOMMOD",     name: "NIFTY COMMODITIES",                               category: "Thematic",    inception: "2004-01-01" },
  { code: "NCON",        name: "Nifty Consumption",                               category: "Thematic",    inception: "2011-01-03" },
  { code: "NSVC",        name: "Nifty Serv Sector",                               category: "Thematic",    inception: "2004-01-01" },
  { code: "N500HCARE",   name: "NIFTY500 HEALTHCARE",                             category: "Thematic",    inception: "2017-01-01" },
  { code: "NMSHCARE",    name: "NIFTY MIDSMALL HEALTHCARE",                       category: "Thematic",    inception: "2017-01-01" },
  { code: "NMSFIN",      name: "NIFTY MIDSMALL FINANCIAL SERVICES",               category: "Thematic",    inception: "2017-01-01" },
  { code: "NMSITTEL",    name: "NIFTY MIDSMALL IT & TELECOM",                     category: "Thematic",    inception: "2017-01-01" },
  { code: "NINDIDEF",    name: "NIFTY INDIA DEFENCE",                             category: "Thematic",    inception: "2018-01-01" },
  { code: "NINDIATRM",   name: "NIFTY INDIA TOURISM",                             category: "Thematic",    inception: "2022-01-03" },
  { code: "NCAPITAL",    name: "NIFTY CAPITAL MARKETS",                           category: "Thematic",    inception: "2022-01-03" },
  { code: "NEVNAA",      name: "NIFTY EV & NEW AGE AUTOMOTIVE",                   category: "Thematic",    inception: "2022-01-03" },
  { code: "NNACON",      name: "NIFTY INDIA NEW AGE CONSUMPTION",                 category: "Thematic",    inception: "2022-01-03" },
  { code: "NMATR",       name: "NIFTY INDIA SELECT 5 CORPORATE GROUPS (MAATR)",   category: "Thematic",    inception: "2022-01-03" },
  { code: "NMOBIL",      name: "NIFTY MOBILITY",                                  category: "Thematic",    inception: "2022-01-03" },
  { code: "NCOREHSE",    name: "NIFTY CORE HOUSING",                              category: "Thematic",    inception: "2021-01-04" },
  { code: "NHOUSING",    name: "NIFTY HOUSING",                                   category: "Thematic",    inception: "2019-01-01" },
  { code: "NIPO",        name: "NIFTY IPO",                                       category: "Thematic",    inception: "2010-01-04" },
  { code: "NMSCON",      name: "NIFTY MIDSMALL INDIA CONSUMPTION",                category: "Thematic",    inception: "2017-01-01" },
  { code: "NNCC",        name: "NIFTY NON-CYCLICAL CONSUMER",                     category: "Thematic",    inception: "2019-01-01" },
  { code: "NRURAL",      name: "NIFTY RURAL",                                     category: "Thematic",    inception: "2019-01-01" },
  { code: "NSHAR25",     name: "NIFTY SHARIAH 25",                                category: "Thematic",    inception: "2004-01-01" },
  { code: "N50SHAR",     name: "NIFTY50 SHARIAH",                                 category: "Thematic",    inception: "2009-01-01" },
  { code: "N500SHAR",    name: "NIFTY500 SHARIAH",                                category: "Thematic",    inception: "2012-01-02" },
  { code: "NTRANLOG",    name: "NIFTY TRANSPORTATION & LOGISTICS",                category: "Thematic",    inception: "2022-01-03" },
  { code: "NSMEEMERGE",  name: "NIFTY SME EMERGE",                                category: "Thematic",    inception: "2015-01-01" },
  { code: "NINDINTRN",   name: "NIFTY INDIA INTERNET",                            category: "Thematic",    inception: "2021-01-04" },
  { code: "NWAVES",      name: "NIFTY WAVES",                                     category: "Thematic",    inception: "2022-01-03" },
  { code: "NIIL",        name: "NIFTY INDIA INFRASTRUCTURE & LOGISTICS",          category: "Thematic",    inception: "2022-01-03" },
  { code: "NIRNPSU",     name: "NIFTY INDIA RAILWAYS PSU",                        category: "Thematic",    inception: "2022-01-03" },
  { code: "NCONG50",     name: "NIFTY CONGLOMERATE 50",                           category: "Thematic",    inception: "2022-01-03" },
  { code: "NINDIAMFG",   name: "Nifty India Mfg",                                 category: "Thematic",    inception: "2018-01-01" },
  { code: "NITATACG",    name: "NIFTY INDIA CORPORATE GROUP INDEX - TATA GROUP 25% CAP", category: "Thematic", inception: "2019-01-01" },
  { code: "N500MCIM",    name: "NIFTY500 MULTICAP INDIA MANUFACTURING 50:30:20",  category: "Thematic",    inception: "2020-01-01" },
  { code: "N500MCINFRA", name: "NIFTY500 MULTICAP INFRASTRUCTURE 50:30:20",       category: "Thematic",    inception: "2020-01-01" },
  { code: "N100ESGSL",   name: "NIFTY100 ESG SECTOR LEADERS",                    category: "Thematic",    inception: "2019-01-01" },
  { code: "N100ESG",     name: "NIFTY100 ESG",                                   category: "Thematic",    inception: "2011-01-03" },
  { code: "N100EESG",    name: "NIFTY100 ENHANCED ESG",                          category: "Thematic",    inception: "2019-01-01" },
  { code: "NINDIDIG",    name: "NIFTY INDIA DIGITAL",                             category: "Thematic",    inception: "2020-01-01" },

  // ── Liquidity ────────────────────────────────────────────────────────────
  { code: "N100LQ15",    name: "NIFTY100 LIQUID 15",                              category: "Broad Market",inception: "2003-01-01" },
  { code: "NMCLQ15",     name: "NIFTY MIDCAP LIQUID 15",                          category: "Broad Market",inception: "2004-01-01" },

  // ── Volatility Index ─────────────────────────────────────────────────────
  { code: "IVIX",        name: "INDIA VIX",                                       category: "Volatility",  inception: "2008-01-01" },

  // ── Fixed Income / G-Sec / Bharat Bond ───────────────────────────────────
  { code: "N813GSEC",    name: "NIFTY 8-13 YR G-SEC",                            category: "Fixed Income",inception: "2001-01-01" },
  { code: "N10GSEC",     name: "NIFTY 10 YR BENCHMARK G-SEC",                    category: "Fixed Income",inception: "2001-01-01" },
  { code: "N10GSECCP",   name: "NIFTY 10 YR BENCHMARK G-SEC (CLEAN PRICE)",      category: "Fixed Income",inception: "2001-01-01" },
  { code: "N48GSEC",     name: "NIFTY 4-8 YR G-SEC INDEX",                       category: "Fixed Income",inception: "2001-01-01" },
  { code: "N1115GSEC",   name: "NIFTY 11-15 YR G-SEC INDEX",                     category: "Fixed Income",inception: "2001-01-01" },
  { code: "N15PGSEC",    name: "NIFTY 15 YR AND ABOVE G-SEC INDEX",              category: "Fixed Income",inception: "2001-01-01" },
  { code: "NCGSEC",      name: "NIFTY COMPOSITE G-SEC INDEX",                    category: "Fixed Income",inception: "2001-01-01" },
  { code: "NBB2030",     name: "NIFTY BHARAT BOND INDEX - APRIL 2030",           category: "Fixed Income",inception: "2020-01-01" },
  { code: "NBB2031",     name: "NIFTY BHARAT BOND INDEX - APRIL 2031",           category: "Fixed Income",inception: "2021-01-04" },
  { code: "NBB2032",     name: "NIFTY BHARAT BOND INDEX - APRIL 2032",           category: "Fixed Income",inception: "2022-01-03" },
  { code: "NBB2033",     name: "NIFTY BHARAT BOND INDEX - APRIL 2033",           category: "Fixed Income",inception: "2023-01-02" },

  // ── Fixed Income / Duration / Debt Category (base date 2001-09-03) ────────
  { code: "NLIQ",        name: "NIFTY LIQUID INDEX",                             category: "Fixed Income",inception: "2001-09-03" },
  { code: "NMMI",        name: "NIFTY MONEY MARKET INDEX",                       category: "Fixed Income",inception: "2001-09-03" },
  { code: "NUSDD",       name: "NIFTY ULTRA SHORT DURATION DEBT INDEX",          category: "Fixed Income",inception: "2001-09-03" },
  { code: "NLDD",        name: "NIFTY LOW DURATION DEBT INDEX",                  category: "Fixed Income",inception: "2001-09-03" },
  { code: "NSDD",        name: "NIFTY SHORT DURATION DEBT INDEX",                category: "Fixed Income",inception: "2001-09-03" },
  { code: "NMDD",        name: "NIFTY MEDIUM DURATION DEBT INDEX",               category: "Fixed Income",inception: "2001-09-03" },
  { code: "NMLDD",       name: "NIFTY MEDIUM TO LONG DURATION DEBT INDEX",       category: "Fixed Income",inception: "2001-09-03" },
  { code: "NLNGDD",      name: "NIFTY LONG DURATION DEBT INDEX",                 category: "Fixed Income",inception: "2001-09-03" },
  { code: "NCOMPD",      name: "NIFTY COMPOSITE DEBT INDEX",                     category: "Fixed Income",inception: "2001-09-03" },
  { code: "NCORPBD",     name: "NIFTY CORPORATE BOND INDEX",                     category: "Fixed Income",inception: "2001-09-03" },
  { code: "NCRBOND",     name: "NIFTY CREDIT RISK BOND INDEX",                   category: "Fixed Income",inception: "2001-09-03" },
  { code: "NBPSUD",      name: "NIFTY BANKING & PSU DEBT INDEX",                 category: "Fixed Income",inception: "2001-09-03" },
  { code: "NADSEC",      name: "NIFTY ALL DURATION G-SEC INDEX",                 category: "Fixed Income",inception: "2001-09-03" },

  // ── Fixed Income / Overnight & Liquid Fund ────────────────────────────────
  { code: "N1DR",        name: "NIFTY 1D RATE INDEX",                            category: "Fixed Income",inception: "2015-01-01" },
  { code: "NLIQF",       name: "NIFTY LIQUID FUND INDEX",                        category: "Fixed Income",inception: "2015-01-01" },

  // ── Fixed Income / G-Sec Benchmark ───────────────────────────────────────
  { code: "N5GSEC",      name: "NIFTY 5 YR BENCHMARK G-SEC INDEX",              category: "Fixed Income",inception: "2004-01-01" },

  // ── Fixed Income / G-Sec Target Maturity ─────────────────────────────────
  { code: "NGSDEC26",    name: "NIFTY G-SEC DEC 2026 INDEX",                    category: "Fixed Income",inception: "2019-01-01" },
  { code: "NGSJUN27",    name: "NIFTY G-SEC JUN 2027 INDEX",                    category: "Fixed Income",inception: "2020-01-01" },
  { code: "NGSJUL27",    name: "NIFTY G-SEC JUL 2027 INDEX",                    category: "Fixed Income",inception: "2020-01-01" },
  { code: "NGSSEP27",    name: "NIFTY G-SEC SEP 2027 INDEX",                    category: "Fixed Income",inception: "2020-01-01" },
  { code: "NGSOCT28",    name: "NIFTY G-SEC OCT 2028 INDEX",                    category: "Fixed Income",inception: "2021-01-01" },
  { code: "NGSAPR29",    name: "NIFTY G-SEC APR 2029 INDEX",                    category: "Fixed Income",inception: "2022-01-01" },
  { code: "NGSDEC29",    name: "NIFTY G-SEC DEC 2029 INDEX",                    category: "Fixed Income",inception: "2020-01-01" },
  { code: "NGSDEC30",    name: "NIFTY G-SEC DEC 2030 INDEX",                    category: "Fixed Income",inception: "2020-01-01" },
  { code: "NGSJUL31",    name: "NIFTY G-SEC JULY 2031 INDEX",                   category: "Fixed Income",inception: "2020-01-01" },
  { code: "NGSSEP32",    name: "NIFTY G-SEC SEP 2032 INDEX",                    category: "Fixed Income",inception: "2021-01-01" },
  { code: "NGSJUL33",    name: "NIFTY G-SEC JULY 2033 INDEX",                   category: "Fixed Income",inception: "2021-01-01" },
  { code: "NGSJUN36",    name: "NIFTY G-SEC JUN 2036 INDEX",                    category: "Fixed Income",inception: "2022-01-01" },

  // ── Fixed Income / SDL Single ─────────────────────────────────────────────
  { code: "NSDLJUL26",   name: "NIFTY SDL JUL 2026 INDEX",                      category: "Fixed Income",inception: "2019-01-01" },
  { code: "NSDLSEP26",   name: "NIFTY SDL SEP 2026 INDEX",                      category: "Fixed Income",inception: "2019-01-01" },
  { code: "NSDLOCT26",   name: "NIFTY SDL OCT 2026 INDEX",                      category: "Fixed Income",inception: "2019-01-01" },
  { code: "NSDLDEC26",   name: "NIFTY SDL DECEMBER 2026 INDEX",                 category: "Fixed Income",inception: "2019-01-01" },
  { code: "NSDLAPR27",   name: "NIFTY SDL APR 2027 INDEX",                      category: "Fixed Income",inception: "2020-01-01" },
  { code: "NSDLJUN27",   name: "NIFTY SDL JUN 2027 INDEX",                      category: "Fixed Income",inception: "2020-01-01" },
  { code: "NSDLSEP27",   name: "NIFTY SDL SEP 2027 INDEX",                      category: "Fixed Income",inception: "2020-01-01" },
  { code: "NSDLJUN28",   name: "NIFTY SDL JUNE 2028 INDEX",                     category: "Fixed Income",inception: "2021-01-01" },
  { code: "NSDLDEC28",   name: "NIFTY SDL DEC 2028 INDEX",                      category: "Fixed Income",inception: "2021-01-01" },
  { code: "NSDLJUL33",   name: "NIFTY SDL JUL 2033 INDEX",                      category: "Fixed Income",inception: "2021-01-01" },

  // ── Fixed Income / SDL Equal-Weight ──────────────────────────────────────
  { code: "NSDLT20A26",  name: "NIFTY SDL APR 2026 TOP 20 EQUAL WEIGHT INDEX",  category: "Fixed Income",inception: "2019-01-01" },
  { code: "NSDLT12A27",  name: "NIFTY SDL APR 2027 TOP 12 EQUAL WEIGHT INDEX",  category: "Fixed Income",inception: "2020-01-01" },
  { code: "NSDLT12A32",  name: "NIFTY SDL APR 2032 TOP 12 EQUAL WEIGHT INDEX",  category: "Fixed Income",inception: "2021-01-01" },

  // ── Fixed Income / SDL + G-Sec Blends ────────────────────────────────────
  { code: "NSDLGSJ27",   name: "NIFTY SDL PLUS G-SEC JUN 2027 40:60 INDEX",     category: "Fixed Income",inception: "2020-01-01" },
  { code: "NSDLGSS27",   name: "NIFTY SDL PLUS G-SEC SEP 2027 50:50 INDEX",     category: "Fixed Income",inception: "2020-01-01" },
  { code: "NSDLGSJ28",   name: "NIFTY SDL PLUS G-SEC JUN 2028 70:30 INDEX",     category: "Fixed Income",inception: "2021-01-01" },
  { code: "NSDLGSJ29",   name: "NIFTY SDL PLUS G-SEC JUN 2029 70:30 INDEX",     category: "Fixed Income",inception: "2022-01-01" },

  // ── Fixed Income / SDL + AAA PSU Bond Blends ─────────────────────────────
  { code: "NSDLAAA26",   name: "NIFTY SDL PLUS AAA PSU BOND APR 2026 75:25 INDEX",     category: "Fixed Income",inception: "2019-01-01" },
  { code: "NSDLAAD27",   name: "NIFTY SDL PLUS AAA PSU BOND DEC 2027 60:40 INDEX - TRI",category: "Fixed Income",inception: "2020-01-01" },
  { code: "NSDLAAJ28",   name: "NIFTY SDL PLUS AAA PSU BOND JUL 2028 60:40 INDEX",     category: "Fixed Income",inception: "2021-01-01" },
  { code: "NSDLAAA28",   name: "NIFTY SDL PLUS AAA PSU BOND APR 2028 75:25 INDEX",     category: "Fixed Income",inception: "2021-01-01" },

  // ── Fixed Income / SDL + PSU Bond Blend ──────────────────────────────────
  { code: "NSDLPSP26",   name: "NIFTY SDL PLUS PSU BOND SEP 2026 60:40 INDEX",  category: "Fixed Income",inception: "2019-01-01" },

  // ── Fixed Income / PSU Bond + SDL Blends ─────────────────────────────────
  { code: "NPSUA26",     name: "NIFTY PSU BOND PLUS SDL APR 2026 50:50 INDEX",  category: "Fixed Income",inception: "2019-01-01" },
  { code: "NPSUA27",     name: "NIFTY PSU BOND PLUS SDL APR 2027 50:50 INDEX",  category: "Fixed Income",inception: "2020-01-01" },
  { code: "NPSUSP27",    name: "NIFTY PSU BOND PLUS SDL SEP 2027 40:60 INDEX",  category: "Fixed Income",inception: "2020-01-01" },

  // ── Fixed Income / AAA Bond Blends ───────────────────────────────────────
  { code: "NAAAS26",     name: "NIFTY AAA BOND PLUS SDL APR 2026 50:50 INDEX",      category: "Fixed Income",inception: "2019-01-01" },
  { code: "NAAAFM28",    name: "NIFTY AAA FINANCIAL SERVICES BOND MAR 2028 INDEX",  category: "Fixed Income",inception: "2021-01-01" },
  { code: "NAAACSA27",   name: "NIFTY AAA CPSE BOND PLUS SDL APR 2027 60:40 INDEX", category: "Fixed Income",inception: "2020-01-01" },
  { code: "NAAAPSS26",   name: "NIFTY AAA PSU BOND PLUS SDL SEP 2026 50:50 INDEX",  category: "Fixed Income",inception: "2019-01-01" },

  // ── Fixed Income / CPSE Bond ──────────────────────────────────────────────
  { code: "NCPSESS26",   name: "NIFTY CPSE BOND PLUS SDL SEP 2026 50:50 INDEX", category: "Fixed Income",inception: "2019-01-01" },
]

/** Build a lowercase-name → entry lookup for O(1) reverse lookups */
const _byName = new Map<string, IndexEntry>(
  NSE_INDEX_LIST.map(e => [e.name.toLowerCase(), e])
)
const _byCode = new Map<string, IndexEntry>(
  NSE_INDEX_LIST.map(e => [e.code, e])
)

/** Get index entry by code (e.g. "N500LV50") */
export function getIndexByCode(code: string): IndexEntry | undefined {
  return _byCode.get(code)
}

/** Get index entry by exact name (case-insensitive) */
export function getIndexByName(name: string): IndexEntry | undefined {
  return _byName.get(name.toLowerCase())
}

/**
 * Given a mutual-fund scheme name, return the NSE index it tracks (if any).
 * We normalize spacing variants (e.g. "Nifty50" ↔ "Nifty 50") and check
 * whether the fund name contains the index name as a substring.
 */
export function getTrackedIndex(fundName: string): IndexEntry | undefined {
  const fn = fundName.toLowerCase()
    .replace(/nifty50(\s|$)/g, "nifty 50 ")
    .replace(/nifty100(\s|$)/g, "nifty 100 ")
    .replace(/nifty200(\s|$)/g, "nifty 200 ")
    .replace(/nifty500(\s|$)/g, "nifty 500 ")
    .replace(/midcap150(\s|$)/g, "midcap 150 ")
    .replace(/smallcap250(\s|$)/g, "smallcap 250 ")
    .replace(/smallcap100(\s|$)/g, "smallcap 100 ")
    .replace(/smallcap50(\s|$)/g, "smallcap 50 ")
    .replace(/midcap100(\s|$)/g, "midcap 100 ")
    .replace(/midcap50(\s|$)/g, "midcap 50 ")
    .replace(/\s+/g, " ")
    .trim()

  // Try each index entry from most-specific (longest name) to least-specific
  const sorted = [...NSE_INDEX_LIST].sort((a, b) => b.name.length - a.name.length)
  for (const entry of sorted) {
    const iName = entry.name.toLowerCase()
      .replace(/nifty50(\s|$)/g, "nifty 50 ")
      .replace(/nifty100(\s|$)/g, "nifty 100 ")
      .replace(/nifty200(\s|$)/g, "nifty 200 ")
      .replace(/nifty500(\s|$)/g, "nifty 500 ")
      .replace(/midcap150(\s|$)/g, "midcap 150 ")
      .replace(/smallcap250(\s|$)/g, "smallcap 250 ")
      .replace(/smallcap100(\s|$)/g, "smallcap 100 ")
      .replace(/smallcap50(\s|$)/g, "smallcap 50 ")
      .replace(/midcap100(\s|$)/g, "midcap 100 ")
      .replace(/midcap50(\s|$)/g, "midcap 50 ")
      .replace(/\s+/g, " ")
      .trim()
    if (fn.includes(iName)) return entry
  }
  return undefined
}

/**
 * Return the search terms to use when looking for MF funds that track a given index.
 * Returns an array of candidate search strings (try each until results found).
 *
 * Generates multiple variants to maximise recall:
 *  1. Original lowercase
 *  2. De-hyphenated  ("low-volatility" → "low volatility")
 *  3. Spaced numbers  ("midcap150"      → "midcap 150")
 *  4. Compact numbers ("midcap 150"     → "midcap150")
 *  5. Short key-phrase for long names
 */
export function getIndexSearchTerms(indexName: string): string[] {
  const base = indexName.toLowerCase().trim()

  // Special override for Gold commodity fund
  if (base === 'mcx gold' || base === 'gold') {
    return [
      'nippon india etf gold bees',
      'nippon india etf gold',
      'gold bees',
      'sbi gold etf',
      'hdfc gold etf',
      'axis gold etf',
    ]
  }

  const add  = new Set<string>([base])

  // 1. De-hyphenated variant
  const dehyphen = base.replace(/-/g, ' ').replace(/\s+/g, ' ').trim()
  add.add(dehyphen)

  // 2. Spaced-number variant  (nifty500 → nifty 500, midcap150 → midcap 150)
  const spaced = base
    .replace(/\bnifty(\d+)\b/g,        'nifty $1')
    .replace(/\bmidcap(\d+)\b/g,       'midcap $1')
    .replace(/\bsmallcap(\d+)\b/g,     'smallcap $1')
    .replace(/\bmicrocap(\d+)\b/g,     'microcap $1')
    .replace(/\blargemidcap(\d+)\b/g,  'largemidcap $1')
    .replace(/\bmidsmallcap(\d+)\b/g,  'midsmallcap $1')
    .replace(/\s+/g, ' ').trim()
  add.add(spaced)

  // Also de-hyphen the spaced variant
  add.add(spaced.replace(/-/g, ' ').replace(/\s+/g, ' ').trim())

  // 3. Compact-number variant  (midcap 150 → midcap150, nifty 50 → nifty50)
  const compact = base
    .replace(/\bmidcap\s+(\d+)\b/g,       'midcap$1')
    .replace(/\bsmallcap\s+(\d+)\b/g,     'smallcap$1')
    .replace(/\bnifty\s+(\d+)\b/g,        'nifty$1')
    .replace(/\blargemidcap\s+(\d+)\b/g,  'largemidcap$1')
    .replace(/\bmidsmallcap\s+(\d+)\b/g,  'midsmallcap$1')
    .replace(/\s+/g, ' ').trim()
  add.add(compact)

  // 4. Short key-phrase for very long names (skip "nifty" and "index")
  const words = dehyphen.split(/\s+/).filter(w => w !== 'nifty' && w !== 'index')
  if (words.length > 4) add.add('nifty ' + words.slice(0, 4).join(' '))

  return [...add].filter(t => t.length > 0)
}
