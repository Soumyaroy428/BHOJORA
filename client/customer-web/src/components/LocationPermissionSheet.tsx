import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';
import type { KolkataZoneId } from '../types/domain';

export interface SavedAddressItem {
  id: string;
  label: 'Home' | 'Work' | 'Other';
  title: string;
  addressLine: string;
  zoneId: Exclude<KolkataZoneId, 'all'>;
  zoneName: string;
  isPrimary?: boolean;
}

export const DEFAULT_SAVED_ADDRESSES: readonly SavedAddressItem[] = [
  {
    id: 'addr_rkm_belgharia',
    label: 'Home',
    title: 'Home',
    addressLine: "Ramakrishna Mission Calcutta Students' Home , Belgharia, Kolkata 700056",
    zoneId: 'north',
    zoneName: 'Shyambazar / North Kolkata',
    isPrimary: true,
  },
  {
    id: 'addr_salt_lake_hub',
    label: 'Home',
    title: 'Home / Work',
    addressLine: 'Bhojora Tech Hub, Sector V, Salt Lake, Kolkata 700091',
    zoneId: 'salt-lake',
    zoneName: 'Salt Lake / Sector V',
  },
  {
    id: 'addr_park_street',
    label: 'Other',
    title: 'Park Street Central',
    addressLine: '24 Park Street & Camac Street Crossing, Kolkata 700016',
    zoneId: 'central',
    zoneName: 'Park Street / Central',
  },
  {
    id: 'addr_ballygunge',
    label: 'Other',
    title: 'Ballygunge Circular',
    addressLine: 'Ballygunge Circular Road & Gariahat Junction, Kolkata 700019',
    zoneId: 'south',
    zoneName: 'Ballygunge / South Kolkata',
  },
  {
    id: 'addr_new_town',
    label: 'Work',
    title: 'New Town Action Area',
    addressLine: 'Action Area I, Major Arterial Road, New Town, Kolkata 700156',
    zoneId: 'new-town',
    zoneName: 'New Town Corridor',
  },
];

interface LocationPermissionSheetProps {
  open: boolean;
  onEnableLocation: () => void;
  onSelectAddress: (address: SavedAddressItem) => void;
  onClose: () => void;
}

export function LocationPermissionSheet({
  open,
  onEnableLocation,
  onSelectAddress,
  onClose,
}: LocationPermissionSheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [showAllAddresses, setShowAllAddresses] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useDialogLightDismiss(dialogRef);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Handle native cancel event (Esc key)
  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    onClose();
  };

  const filteredAddresses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return showAllAddresses ? DEFAULT_SAVED_ADDRESSES : DEFAULT_SAVED_ADDRESSES.slice(0, 3);
    }
    return DEFAULT_SAVED_ADDRESSES.filter(
      (addr) =>
        addr.title.toLowerCase().includes(q) ||
        addr.addressLine.toLowerCase().includes(q) ||
        addr.zoneName.toLowerCase().includes(q),
    );
  }, [searchQuery, showAllAddresses]);

  return (
    <dialog
      ref={dialogRef}
      className="bhojora-location-sheet-dialog"
      aria-labelledby={titleId}
      onCancel={handleCancel}
    >
      <div className="location-sheet-container">
        {/* Top Center Close Button */}
        <div className="location-sheet-close-bar">
          <button
            type="button"
            className="location-sheet-circle-close-btn"
            onClick={onClose}
            aria-label="Close location selector"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Red Alert Card: Location Permission Off */}
        <div className="location-permission-off-card">
          <div className="location-off-icon-wrap" aria-hidden="true">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#EF4444"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
              <line x1="3" y1="3" x2="21" y2="21" stroke="#EF4444" strokeWidth="2.5" />
            </svg>
          </div>

          <div className="location-off-content">
            <h2 id={titleId} className="location-off-title">
              Location permission is off
            </h2>
            <p className="location-off-subtext">
              Enable your location permission for a better delivery experience
            </p>
          </div>

          <button
            type="button"
            className="location-enable-action-btn"
            onClick={onEnableLocation}
            aria-label="Enable location permission"
          >
            Enable
          </button>
        </div>

        {/* Section: Select a saved address */}
        <div className="saved-addresses-section">
          <div className="saved-addresses-header">
            <h3 className="saved-addresses-heading">Select a saved address</h3>
            <button
              type="button"
              className="saved-addresses-see-all-btn"
              onClick={() => setShowAllAddresses((prev) => !prev)}
              aria-expanded={showAllAddresses}
            >
              {showAllAddresses ? 'Show less' : 'See all'}
            </button>
          </div>

          <div className="saved-addresses-list" role="list">
            {filteredAddresses.map((address) => (
              <button
                key={address.id}
                type="button"
                className="saved-address-card-btn"
                role="listitem"
                onClick={() => onSelectAddress(address)}
                aria-label={`Select ${address.title}: ${address.addressLine}`}
              >
                <div className="saved-address-icon-wrap" aria-hidden="true">
                  {address.label === 'Home' ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                  ) : address.label === 'Work' ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect width="20" height="14" x="2" y="7" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  )}
                </div>

                <div className="saved-address-info">
                  <div className="saved-address-name">{address.title}</div>
                  <div className="saved-address-street">{address.addressLine}</div>
                </div>

                <span className="saved-address-arrow" aria-hidden="true">
                  ›
                </span>
              </button>
            ))}

            {filteredAddresses.length === 0 && (
              <div className="saved-address-empty-state">
                No matching Kolkata locations found for &ldquo;{searchQuery}&rdquo;.
              </div>
            )}
          </div>
        </div>

        {/* Bottom Search Bar */}
        <div className="location-sheet-search-wrap">
          <div className="location-sheet-search-box">
            <span className="search-input-icon" aria-hidden="true">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#EF4444"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="location-sheet-search-input"
              placeholder="Search location manually"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search location manually"
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
                aria-label="Clear location search"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
