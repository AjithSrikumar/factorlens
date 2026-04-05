import Link from "next/link"

function LogoIcon() {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "var(--radius-sm)",
      background: "var(--text-raw)",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg viewBox="0 0 18 18" fill="none" style={{ width: 16, height: 16 }}>
        <rect x="2"   y="10" width="3" height="6"  rx="1" fill="white"/>
        <rect x="7.5" y="6"  width="3" height="10" rx="1" fill="white"/>
        <rect x="13"  y="2"  width="3" height="14" rx="1" fill="white"/>
      </svg>
    </div>
  )
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div className="footer-brand">
          <Link href="/">
            <LogoIcon />
            factorlens
          </Link>
          <p>Investing doesn&apos;t need to be complicated.<br />It just needs to be done right.</p>
        </div>
        <div className="footer-links">
          <div className="footer-col">
            <h4>Platform</h4>
            <ul>
              <li><Link href="/dashboard">Dashboard</Link></li>
              <li><Link href="/dashboard">Portfolio Builder</Link></li>
              <li><Link href="/rankings">Fund Rankings</Link></li>
              <li><Link href="/funds">Mutual Funds</Link></li>
              <li><Link href="/amc">AMC Directory</Link></li>
              <li><Link href="/maverst">Regime Tracker</Link></li>
            </ul>
          </div>
          <div className="footer-col">
            <h4>Learn</h4>
            <ul>
              <li><Link href="/academy">Academy</Link></li>
              <li><Link href="/academy">Factor Primer</Link></li>
              <li><Link href="/academy">Methodology</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="footer-bottom">
        <p className="footer-legal">
          Data sourced from NSE India &amp; AMFI. For educational purposes only. Not financial advice.
          Past performance is not indicative of future returns. Please consult a SEBI-registered advisor.
        </p>
        <p className="footer-copy">© 2026 FactorLens</p>
      </div>
    </footer>
  )
}
