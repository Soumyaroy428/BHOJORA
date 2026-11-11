interface HeaderProps {
  headerZoneLabel: string;
  signedInFirstName: string | null;
  onOpenPilotInfo: () => void;
  onOpenAuthModal: () => void;
}

export function Header({
  headerZoneLabel,
  signedInFirstName,
  onOpenPilotInfo,
  onOpenAuthModal,
}: HeaderProps) {
  return (
    <header>
      <div className="container navbar">
        <div className="navbar-brand-group">
          <a href="/" className="brand-logo">
            <div className="logo-emblem">
              <img src="./logo.png" alt="BHOJORA Logo" />
            </div>
            <span>BHOJORA</span>
          </a>

          <button
            type="button"
            className="location-pill"
            onClick={onOpenPilotInfo}
            aria-label={`Current delivery zone: ${headerZoneLabel}, Kolkata`}
          >
            <span aria-hidden="true">📍</span>
            <span id="headerZoneLabel">{headerZoneLabel}</span>
            <span aria-hidden="true" style={{ color: 'var(--neutral-400)' }}>
              ▼
            </span>
          </button>
        </div>

        <div className="header-actions">
          <nav className="nav-links" aria-label="Primary">
            <a href="#discover">Discovery</a>
            <a href="#pillars">Trust Engine</a>
            <a href="#kolkata-launch">Kolkata Zones</a>
            <button type="button" className="btn btn-primary" onClick={onOpenPilotInfo}>
              Get Bhojora App
            </button>
          </nav>
          <button
            type="button"
            id="openAuthModalBtn"
            className="btn btn-outline"
            style={{ minHeight: '44px', padding: '8px 14px' }}
            onClick={onOpenAuthModal}
          >
            {signedInFirstName ?? 'Sign In'}
          </button>
        </div>
      </div>
    </header>
  );
}
