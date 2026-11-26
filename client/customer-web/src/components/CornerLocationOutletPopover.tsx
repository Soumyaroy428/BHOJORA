import { useEffect, useRef } from 'react';

interface CornerLocationOutletPopoverProps {
  open: boolean;
  currentZoneLabel: string;
  currentAddressTitle?: string;
  currentAddressSummary?: string;
  onUseMyLocation: () => void;
  onSelectManually: () => void;
  onClose: () => void;
}

export function CornerLocationOutletPopover({
  open,
  currentZoneLabel,
  currentAddressTitle,
  currentAddressSummary,
  onUseMyLocation,
  onSelectManually,
  onClose,
}: CornerLocationOutletPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Close on Escape or click outside
  useEffect(() => {
    if (!open) {
      return;
    }

    let active = false;
    const timer = setTimeout(() => {
      active = true;
    }, 150);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (!active) {
        return;
      }
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={popoverRef}
      className="corner-location-outlet-popover animate-slide-down"
      role="region"
      aria-labelledby="corner-loc-title"
    >
      {/* Upward pointer arrow notch */}
      <div className="corner-popover-notch" aria-hidden="true" />

      {/* Top row with subtle close button */}
      <button
        type="button"
        className="corner-popover-close-btn"
        onClick={onClose}
        aria-label="Dismiss location prompt"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      <div className="corner-popover-body">
        <h3 id="corner-loc-title" className="corner-popover-heading">
          Select your location
        </h3>
        <p className="corner-popover-subtext">
          We need your location to show you curated assortment from your nearest store
        </p>

        {(currentAddressSummary || currentZoneLabel) && (
          <div className="corner-current-zone-badge">
            <span aria-hidden="true">📍</span>{' '}
            {currentAddressTitle && currentAddressSummary ? (
              <>
                <strong>{currentAddressTitle}</strong> · {currentAddressSummary}
              </>
            ) : currentAddressTitle ? (
              <>
                <strong>{currentAddressTitle}</strong> · {currentZoneLabel}
              </>
            ) : (
              <>
                Active: <strong>{currentZoneLabel}</strong>
              </>
            )}
          </div>
        )}

        <div className="corner-popover-actions">
          <button
            type="button"
            className="corner-btn-use-location"
            onClick={onUseMyLocation}
            aria-label="Use my current GPS location"
          >
            Use my location
          </button>
          <button
            type="button"
            className="corner-btn-select-manually"
            onClick={onSelectManually}
            aria-label="Select address manually"
          >
            Select manually
          </button>
        </div>
      </div>
    </div>
  );
}
