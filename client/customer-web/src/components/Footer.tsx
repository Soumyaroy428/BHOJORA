export function Footer() {
  return (
    <footer id="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-col">
            <div className="brand-logo" style={{ marginBottom: '12px' }}>
              <div className="logo-emblem" style={{ width: '34px', height: '34px' }}>
                <img src="./logo.png" alt="BHOJORA Logo" />
              </div>
              <span style={{ fontSize: '20px' }}>BHOJORA</span>
            </div>
            <p style={{ fontSize: '13px', lineHeight: 1.6, maxWidth: '320px' }}>
              Food You Love. Trust You Deserve.
              <br />
              Launching across Kolkata, West Bengal, India. Built with clean software architecture
              and transparent governance.
            </p>
          </div>
          <div className="footer-col">
            <h3 style={{ fontSize: '14px', color: 'var(--neutral-950)', marginBottom: '14px' }}>
              Ecosystem
            </h3>
            <ul>
              <li>
                <a href="#discover">Bhojora Consumer Web</a>
              </li>
              <li>
                <a href="#pillars">Bhojora Partner Portal</a>
              </li>
              <li>
                <a href="#pillars">Bhojora Delivery Fleet</a>
              </li>
              <li>
                <a href="#pillars">Bhojora Inspect Tool</a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h3 style={{ fontSize: '14px', color: 'var(--neutral-950)', marginBottom: '14px' }}>
              Trust &amp; Safety
            </h3>
            <ul>
              <li>
                <a href="#pillars">Inspection Methodology</a>
              </li>
              <li>
                <a href="#discover">Scoring Policy v2.1</a>
              </li>
              <li>
                <a href="#pillars">Inspector Code of Conduct</a>
              </li>
              <li>
                <a href="#discover">Verified Kitchen Audits</a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h3 style={{ fontSize: '14px', color: 'var(--neutral-950)', marginBottom: '14px' }}>
              Kolkata Launch
            </h3>
            <ul>
              <li>Salt Lake (Sector V)</li>
              <li>Park Street / Central</li>
              <li>New Town Kolkata</li>
              <li>South Kolkata Hub</li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <div>&copy; 2026 BHOJORA Technologies Pvt. Ltd. All rights reserved.</div>
          <div style={{ color: 'var(--trust-green-text)', fontWeight: 600 }}>
            Kolkata Launch • Independent Kitchen Transparency
          </div>
        </div>
      </div>
    </footer>
  );
}
