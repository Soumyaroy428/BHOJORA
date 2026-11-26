import { useEffect, useRef, useState } from 'react';

interface HeaderProps {
  headerZoneLabel: string;
  headerAddressTitle?: string;
  deliveryEtaText?: string;
  signedInFirstName: string | null;
  cartItemCount: number;
  activeOrderCount: number;
  onOpenPilotInfo: () => void;
  onOpenLocationSheet?: () => void;
  onToggleCornerOutlet?: () => void;
  onOpenAuthModal: () => void;
  onOpenCartModal: () => void;
  onOpenOrdersModal: () => void;
}

export function Header({
  headerZoneLabel,
  headerAddressTitle,
  deliveryEtaText,
  signedInFirstName,
  cartItemCount,
  activeOrderCount,
  onOpenPilotInfo,
  onOpenLocationSheet,
  onToggleCornerOutlet,
  onOpenAuthModal,
  onOpenCartModal,
  onOpenOrdersModal,
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const toggleBtnRef = useRef<HTMLButtonElement | null>(null);

  // Hide Bhojora logo and wordmark on mobile scroll down so delivery location expands cleanly
  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setIsScrolled((prev) => {
        if (!prev && y > 48) {
          return true;
        }
        if (prev && y < 16) {
          return false;
        }
        return prev;
      });
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close dropdown on click outside or Escape key press
  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        toggleBtnRef.current?.focus();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        toggleBtnRef.current &&
        !toggleBtnRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [menuOpen]);

  const handleDropdownItemSelect = (action?: () => void) => {
    setMenuOpen(false);
    if (action) {
      action();
    }
  };

  return (
    <header className={isScrolled ? 'site-header is-scrolled' : 'site-header'}>
      <div className="container navbar">
        <div className="navbar-brand-group">
          <a href="/" className="brand-logo" aria-label="BHOJORA Home">
            <div className="logo-emblem">
              <img src="./logo.png" alt="BHOJORA Logo" />
            </div>
            <span className="brand-title">BHOJORA</span>
          </a>

          {/* Location view in header (visible across desktop, tablet, and mobile) */}
          <button
            type="button"
            className="location-pill header-location-view"
            onClick={onToggleCornerOutlet ?? onOpenLocationSheet ?? onOpenPilotInfo}
            aria-label={`Delivery in 27 minutes. Current delivery address: ${headerAddressTitle ?? headerZoneLabel}. Click to view or change address.`}
            title={headerAddressTitle ?? 'Select delivery address'}
          >
            <span aria-hidden="true" className="location-pin-icon">
              📍
            </span>
            <span className="location-eta-group">
              <span className="delivery-eta-headline">
                {deliveryEtaText ?? 'Delivery in 27 minutes'}
              </span>
              <span id="headerZoneLabel" className="location-label-text">
                {headerZoneLabel}
                <span aria-hidden="true" className="location-arrow-icon">
                  ▼
                </span>
              </span>
            </span>
          </button>
        </div>

        <div className="header-actions">
          {/* Desktop Navigation Links (hidden on tablet and mobile <= 1024px) */}
          <nav className="nav-links desktop-nav-links" aria-label="Primary Navigation">
            <a href="#discover">Discovery</a>
            <a href="#pillars">Trust Engine</a>
            <a href="#kolkata-launch">Kolkata Zones</a>
            <button
              type="button"
              className="btn btn-primary get-app-desktop-btn"
              onClick={onOpenPilotInfo}
            >
              Get Bhojora App
            </button>
          </nav>

          {/* Cart Button in Header (always visible in header across all screen sizes) */}
          <button
            type="button"
            id="openCartModalBtn"
            className="btn btn-outline cart-header-btn"
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
            <span className="cart-text">
              <span className="cart-label-word">Cart </span>
              <span className="cart-count-badge">({cartItemCount})</span>
            </span>
          </button>

          {/* Desktop-only Orders & Sign In buttons (moved into dropdown on mobile/tablet) */}
          <div className="desktop-only-buttons">
            <button
              type="button"
              id="openOrdersModalBtn"
              className="btn btn-outline"
              aria-label={`Open orders, ${activeOrderCount} active`}
              onClick={onOpenOrdersModal}
            >
              {activeOrderCount > 0 ? `Orders (${activeOrderCount})` : 'Orders'}
            </button>
            <button
              type="button"
              id="openAuthModalBtn"
              className="btn btn-outline"
              onClick={onOpenAuthModal}
            >
              {signedInFirstName ?? 'Sign In'}
            </button>
          </div>

          {/* Mobile & Tablet Dropdown Menu Trigger (Hamburger) */}
          <button
            ref={toggleBtnRef}
            type="button"
            className="btn btn-outline mobile-menu-toggle-btn mobile-tablet-header-btn"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={menuOpen}
            aria-controls="mobileNavDropdown"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile & Tablet Dropdown Menu */}
      {menuOpen ? (
        <div
          id="mobileNavDropdown"
          ref={dropdownRef}
          className="mobile-nav-dropdown-panel"
          role="menu"
          aria-label="Mobile and tablet navigation menu"
        >
          <div className="mobile-dropdown-container">
            <div className="mobile-dropdown-group">
              <span className="mobile-dropdown-group-title">EXPLORE BHOJORA</span>
              <a
                href="#discover"
                className="mobile-dropdown-link"
                role="menuitem"
                onClick={() => handleDropdownItemSelect()}
              >
                <span className="dropdown-link-icon" aria-hidden="true">
                  🔍
                </span>
                <div className="dropdown-link-body">
                  <strong>Discovery</strong>
                  <span>Verified Kolkata cloud kitchens &amp; menus</span>
                </div>
              </a>

              <a
                href="#pillars"
                className="mobile-dropdown-link"
                role="menuitem"
                onClick={() => handleDropdownItemSelect()}
              >
                <span className="dropdown-link-icon" aria-hidden="true">
                  🛡️
                </span>
                <div className="dropdown-link-body">
                  <strong>Trust Engine</strong>
                  <span>5-pillar physical audits, FSSAI verification &amp; hygiene scores</span>
                </div>
              </a>

              <button
                type="button"
                className="mobile-dropdown-link as-button"
                role="menuitem"
                onClick={() => handleDropdownItemSelect(onOpenPilotInfo)}
              >
                <span className="dropdown-link-icon" aria-hidden="true">
                  🗺️
                </span>
                <div className="dropdown-link-body">
                  <strong>Kolkata Zones &amp; Live Map</strong>
                  <span>Interactive Google Map &amp; corridor boundaries</span>
                </div>
              </button>

              <button
                type="button"
                className="mobile-dropdown-link as-button highlight-get-app"
                role="menuitem"
                onClick={() => handleDropdownItemSelect(onOpenPilotInfo)}
              >
                <span className="dropdown-link-icon" aria-hidden="true">
                  📱
                </span>
                <div className="dropdown-link-body">
                  <strong>Get Bhojora App</strong>
                  <span>Download our mobile app for fastest deliveries</span>
                </div>
              </button>
            </div>

            <div className="mobile-dropdown-divider" />

            <div className="mobile-dropdown-group">
              <span className="mobile-dropdown-group-title">ACCOUNT &amp; ACTIVITY</span>

              <button
                type="button"
                className="mobile-dropdown-link as-button"
                role="menuitem"
                onClick={() => handleDropdownItemSelect(onOpenOrdersModal)}
              >
                <span className="dropdown-link-icon" aria-hidden="true">
                  📦
                </span>
                <div className="dropdown-link-body">
                  <strong>Orders</strong>
                  <span>
                    {activeOrderCount > 0
                      ? `${activeOrderCount} active order in delivery`
                      : 'Live tracking, invoices & past orders'}
                  </span>
                </div>
                {activeOrderCount > 0 ? (
                  <span className="mobile-dropdown-badge">{activeOrderCount}</span>
                ) : null}
              </button>

              <button
                type="button"
                className="mobile-dropdown-link as-button highlight-sign-in"
                role="menuitem"
                onClick={() => handleDropdownItemSelect(onOpenAuthModal)}
              >
                <span className="dropdown-link-icon" aria-hidden="true">
                  👤
                </span>
                <div className="dropdown-link-body">
                  <strong>
                    {signedInFirstName ? `Account (${signedInFirstName})` : 'Sign In'}
                  </strong>
                  <span>
                    {signedInFirstName
                      ? 'Addresses, dietary preferences & session info'
                      : 'Login or register with OTP / password'}
                  </span>
                </div>
              </button>
            </div>

            <div className="mobile-dropdown-footer">
              <div className="mobile-dropdown-location-summary">
                <span>
                  Delivery to: <strong>{headerZoneLabel}</strong>
                </span>
                <button
                  type="button"
                  className="mobile-dropdown-change-loc-btn"
                  onClick={() => handleDropdownItemSelect(onOpenPilotInfo)}
                >
                  Change on Map
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
