/**
 * amc.ts — Shared AMC (Asset Management Company) utilities.
 * Single source of truth for logo URLs, slugs, and display names.
 */

export const GROWW_LOGO = "https://assets-netstorage.groww.in/mf-assets/logos/"

export interface AmcEntry {
  /** URL-safe slug used in /amc/[slug] routes */
  slug: string
  /** Human-readable short name */
  displayName: string
  /** Substrings to match against fund_house (lowercased) */
  keywords: string[]
  /** Groww CDN filename */
  file: string
}

/**
 * Ordered list of known AMCs.
 * More-specific keywords (e.g. "aditya birla") come before shorter ones ("birla")
 * that could shadow them; "quantum" before "quant".
 */
export const AMC_LIST: AmcEntry[] = [
  { slug: "sbi",           displayName: "SBI Mutual Fund",          keywords: ["sbi"],                           file: "sbi_groww.png" },
  { slug: "hdfc",          displayName: "HDFC Mutual Fund",         keywords: ["hdfc"],                          file: "hdfc_groww.png" },
  { slug: "icici",         displayName: "ICICI Prudential MF",      keywords: ["icici"],                         file: "icici_groww.png" },
  { slug: "nippon",        displayName: "Nippon India MF",          keywords: ["nippon"],                        file: "nippon_groww.png" },
  { slug: "mirae",         displayName: "Mirae Asset MF",           keywords: ["mirae"],                         file: "mirae_groww.png" },
  { slug: "axis",          displayName: "Axis Mutual Fund",         keywords: ["axis"],                          file: "axis_groww.png" },
  { slug: "kotak",         displayName: "Kotak Mahindra MF",        keywords: ["kotak"],                         file: "kotak_groww.png" },
  { slug: "dsp",           displayName: "DSP Mutual Fund",          keywords: ["dsp"],                           file: "dsp_groww.png" },
  { slug: "motilal",       displayName: "Motilal Oswal MF",         keywords: ["motilal"],                       file: "motilal_groww.png" },
  { slug: "uti",           displayName: "UTI Mutual Fund",          keywords: ["uti"],                           file: "uti_groww.png" },
  { slug: "tata",          displayName: "Tata Mutual Fund",         keywords: ["tata"],                          file: "tata_groww.png" },
  { slug: "aditya-birla",  displayName: "Aditya Birla Sun Life MF", keywords: ["aditya birla", "birla sun"],     file: "aditya_groww.png" },
  { slug: "franklin",      displayName: "Franklin Templeton MF",    keywords: ["franklin"],                      file: "franklin_groww.png" },
  { slug: "pgim",          displayName: "PGIM India MF",            keywords: ["pgim"],                          file: "pgim_groww.png" },
  { slug: "bandhan",       displayName: "Bandhan Mutual Fund",      keywords: ["bandhan"],                       file: "bandhan_groww.png" },
  { slug: "canara",        displayName: "Canara Robeco MF",         keywords: ["canara"],                        file: "canara_groww.png" },
  { slug: "invesco",       displayName: "Invesco India MF",         keywords: ["invesco"],                       file: "invesco_groww.png" },
  { slug: "lic",           displayName: "LIC Mutual Fund",          keywords: ["lic"],                           file: "lic_groww.png" },
  { slug: "ppfas",         displayName: "PPFAS Mutual Fund",        keywords: ["ppfas", "parag parikh"],         file: "ppfas_groww.png" },
  { slug: "quantum",       displayName: "Quantum Mutual Fund",      keywords: ["quantum"],                       file: "quantum_groww.png" },
  { slug: "quant",         displayName: "Quant Mutual Fund",        keywords: ["quant"],                         file: "quant_groww.png" },
  { slug: "sundaram",      displayName: "Sundaram MF",              keywords: ["sundaram"],                      file: "sundaram_groww.png" },
  { slug: "union",         displayName: "Union Mutual Fund",        keywords: ["union"],                         file: "union_groww.png" },
  { slug: "whiteoak",      displayName: "WhiteOak Capital MF",      keywords: ["whiteoak", "white oak"],         file: "whiteoak_groww.png" },
  { slug: "edelweiss",     displayName: "Edelweiss MF",             keywords: ["edelweiss"],                     file: "edelweiss_groww.png" },
  { slug: "jm",            displayName: "JM Financial MF",          keywords: ["jm financial"],                  file: "jm_groww.png" },
  { slug: "360one",        displayName: "360 ONE Mutual Fund",      keywords: ["360 one"],                       file: "360_groww.png" },
  { slug: "zerodha",       displayName: "Zerodha Mutual Fund",      keywords: ["zerodha"],                       file: "zerodha_groww.png" },
  { slug: "groww",         displayName: "Groww Mutual Fund",        keywords: ["groww"],                         file: "indiabulls_groww.png" },
  { slug: "baroda-bnp",    displayName: "Baroda BNP Paribas MF",    keywords: ["baroda", "bnp paribas"],         file: "barodabnpparibasmutualfund_groww.png" },
  { slug: "bank-of-india", displayName: "Bank of India MF",         keywords: ["bank of india"],                 file: "bank_groww.png" },
  { slug: "mahindra",      displayName: "Mahindra Manulife MF",     keywords: ["mahindra"],                      file: "mahindra_groww.png" },
  { slug: "nj",            displayName: "NJ Mutual Fund",           keywords: ["nj asset", "nj mutual"],         file: "nj_groww.png" },
  { slug: "bajaj",         displayName: "Bajaj Finserv MF",         keywords: ["bajaj"],                         file: "bajaj_groww.png" },
  { slug: "navi",          displayName: "Navi Mutual Fund",         keywords: ["navi"],                          file: "navi_groww.png" },
  { slug: "hsbc",          displayName: "HSBC Mutual Fund",         keywords: ["hsbc"],                          file: "hsbc_groww.png" },
  { slug: "helios",        displayName: "Helios Mutual Fund",       keywords: ["helios"],                        file: "helios_groww.png" },
  { slug: "jio-blackrock", displayName: "Jio BlackRock MF",         keywords: ["jio"],                           file: "jioblackrock_groww.png" },
  { slug: "shriram",       displayName: "Shriram Mutual Fund",      keywords: ["shriram"],                       file: "shriram_groww.png" },
  { slug: "taurus",        displayName: "Taurus Mutual Fund",       keywords: ["taurus"],                        file: "taurus_groww.png" },
  { slug: "samco",         displayName: "Samco Mutual Fund",        keywords: ["samco"],                         file: "samco_groww.png" },
  { slug: "iti",           displayName: "ITI Mutual Fund",          keywords: ["iti mutual", "iti asset"],       file: "iti_groww.png" },
  { slug: "trust",         displayName: "Trust Mutual Fund",        keywords: ["trust mutual", "trust asset"],   file: "trust_groww.png" },
]

/** Return the Groww CDN logo URL for a fund house string, or null if unknown. */
export function amcLogoUrl(fundHouse: string): string | null {
  if (!fundHouse) return null
  const h = fundHouse.toLowerCase()
  for (const amc of AMC_LIST) {
    if (amc.keywords.some(k => h.includes(k))) return GROWW_LOGO + amc.file
  }
  return null
}

/** Return the URL slug for a fund house string. Falls back to a normalized slug for unknowns. */
export function amcSlug(fundHouse: string): string {
  if (!fundHouse) return "other"
  const h = fundHouse.toLowerCase()
  for (const amc of AMC_LIST) {
    if (amc.keywords.some(k => h.includes(k))) return amc.slug
  }
  return fundHouse.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "other"
}

/** Look up an AmcEntry by its slug. */
export function amcBySlug(slug: string): AmcEntry | undefined {
  return AMC_LIST.find(a => a.slug === slug)
}

/** Return true if a fund_house string matches a given slug. */
export function fundMatchesSlug(fundHouse: string, slug: string): boolean {
  return amcSlug(fundHouse) === slug
}
