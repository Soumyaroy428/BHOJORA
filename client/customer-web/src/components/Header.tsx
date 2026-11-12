interface HeaderProps {
  headerZoneLabel: string;
  signedInFirstName: string | null;
  cartItemCount: number;
  onOpenPilotInfo: () => void;
  onOpenAuthModal: () => void;
  onOpenCartModal: () => void;
}

export function Header({
  headerZoneLabel,
  signedInFirstName,
  cartItemCount,
  onOpenPilotInfo,
  onOpenAuthModal,
  onOpenCartModal,
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
            id="openCartModalBtn"
            className="btn btn-outline cart-header-btn"
            style={{ minHeight: '44px', padding: '8px 14px' }}
            aria-label={`Open cart, ${cartItemCount} items`}
            onClick={onOpenCartModal}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
              <path d="M3 6h18" />
              <path d="M16 10a4 4 0 0 1-8 0" />
            </svg>
            <span>Cart ({cartItemCount})</span>
          </button>
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
