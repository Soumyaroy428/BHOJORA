import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';
import type {
  AddressLabel,
  KolkataZoneId,
  LocationPermissionState,
  SavedAddressView,
} from '../types/domain';

export interface CreateSavedAddressPayload {
  label: AddressLabel;
  customLabel?: string | null;
  recipientName: string;
  streetAddress: string;
  landmark: string;
  locality: string;
  postalCode: string;
  zoneId: Exclude<KolkataZoneId, 'all'>;
}

const ZONE_OPTIONS: ReadonlyArray<{ id: Exclude<KolkataZoneId, 'all'>; label: string }> = [
  { id: 'salt-lake', label: 'Salt Lake / Sector V' },
  { id: 'central', label: 'Park Street / Central' },
  { id: 'new-town', label: 'New Town Corridor' },
  { id: 'south', label: 'Ballygunge / South Kolkata' },
  { id: 'north', label: 'Shyambazar / North Kolkata' },
];

export function formatFullSavedAddress(address: SavedAddressView): string {
  return [
    address.streetAddress,
    address.landmark,
    address.locality,
    `${address.city} ${address.postalCode}`,
  ]
    .filter((part) => Boolean(part && part.trim()))
    .join(', ');
}

export function getSavedAddressDisplayTitle(address: SavedAddressView): string {
  return address.customLabel?.trim() || address.label;
}

interface LocationPermissionSheetProps {
  open: boolean;
  addresses: readonly SavedAddressView[];
  selectedAddressId: string | null;
  isAuthenticated: boolean;
  hasConfiguredApi: boolean;
  locationPermissionState: LocationPermissionState;
  savingAddress: boolean;
  addressError: string | null;
  defaultRecipientName: string;
  onEnableLocation: () => void;
  onSelectAddress: (address: SavedAddressView) => void;
  onSaveNewAddress: (payload: CreateSavedAddressPayload) => Promise<boolean>;
  onOpenSignIn: () => void;
  onClose: () => void;
}

export function LocationPermissionSheet({
  open,
  addresses,
  selectedAddressId,
  isAuthenticated,
  hasConfiguredApi,
  locationPermissionState,
  savingAddress,
  addressError,
  defaultRecipientName,
  onEnableLocation,
  onSelectAddress,
  onSaveNewAddress,
  onOpenSignIn,
  onClose,
}: LocationPermissionSheetProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [showAllAddresses, setShowAllAddresses] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const [label, setLabel] = useState<AddressLabel>('Home');
  const [recipientName, setRecipientName] = useState(defaultRecipientName || 'Bhojora Customer');
  const [streetAddress, setStreetAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [locality, setLocality] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [zoneId, setZoneId] = useState<Exclude<KolkataZoneId, 'all'>>('salt-lake');

  useDialogLightDismiss(dialogRef);

  useEffect(() => {
    setRecipientName((prev) => prev || defaultRecipientName || 'Bhojora Customer');
  }, [defaultRecipientName]);

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

  const handleCancel = (e: React.SyntheticEvent<HTMLDialogElement, Event>) => {
    e.preventDefault();
    onClose();
  };

  const sortedAddresses = useMemo(() => {
    return [...addresses].sort((a, b) => {
      const aCount = a.selectionCount ?? 0;
      const bCount = b.selectionCount ?? 0;
      if (aCount !== bCount) {
        return bCount - aCount;
      }
      const aLast = a.lastSelectedAt ? Date.parse(a.lastSelectedAt) : 0;
      const bLast = b.lastSelectedAt ? Date.parse(b.lastSelectedAt) : 0;
      if (aLast !== bLast) {
        return bLast - aLast;
      }
      if (a.isDefault !== b.isDefault) {
        return a.isDefault ? -1 : 1;
      }
      return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
    });
  }, [addresses]);

  const filteredAddresses = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return showAllAddresses ? sortedAddresses : sortedAddresses.slice(0, 3);
    }
    return sortedAddresses.filter((addr) => {
      const title = getSavedAddressDisplayTitle(addr).toLowerCase();
      const full = formatFullSavedAddress(addr).toLowerCase();
      return title.includes(q) || full.includes(q) || addr.postalCode.includes(q);
    });
  }, [sortedAddresses, searchQuery, showAllAddresses]);

  const handleAddSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const ok = await onSaveNewAddress({
      label,
      recipientName: recipientName.trim() || 'Bhojora Customer',
      streetAddress: streetAddress.trim(),
      landmark: landmark.trim(),
      locality: locality.trim(),
      postalCode: postalCode.trim(),
      zoneId,
    });
    if (ok) {
      setStreetAddress('');
      setLandmark('');
      setLocality('');
      setPostalCode('');
      setShowAddForm(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="bhojora-location-sheet-dialog"
      closedby="any"
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

        {/* Location Permission Card */}
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
            <h1 id={titleId} className="location-off-title">
              {locationPermissionState === 'granted'
                ? 'Select delivery address'
                : 'Location permission is off'}
            </h1>
            <p className="location-off-subtext">
              {locationPermissionState === 'granted'
                ? 'Choose your exact saved delivery address from your past history'
                : 'Enable your location permission or pick your saved delivery address'}
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
            <h2 className="saved-addresses-heading">Select a saved address</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {sortedAddresses.length > 3 && (
                <button
                  type="button"
                  className="saved-addresses-see-all-btn"
                  onClick={() => setShowAllAddresses((prev) => !prev)}
                  aria-expanded={showAllAddresses}
                >
                  {showAllAddresses ? 'Show less' : 'See all'}
                </button>
              )}
              <button
                type="button"
                className="saved-addresses-see-all-btn"
                onClick={() => setShowAddForm((prev) => !prev)}
                aria-expanded={showAddForm}
              >
                {showAddForm ? 'Cancel' : '+ Add address'}
              </button>
            </div>
          </div>

          {showAddForm ? (
            <form className="saved-address-add-form" onSubmit={(e) => void handleAddSubmit(e)}>
              <div className="saved-address-form-row">
                <label className="saved-address-form-field">
                  <span>Label</span>
                  <select value={label} onChange={(e) => setLabel(e.target.value as AddressLabel)}>
                    <option value="Home">Home</option>
                    <option value="Work">Work</option>
                    <option value="Other">Other</option>
                  </select>
                </label>
                <label className="saved-address-form-field">
                  <span>Service Zone</span>
                  <select
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value as Exclude<KolkataZoneId, 'all'>)}
                  >
                    {ZONE_OPTIONS.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="saved-address-form-field">
                <span>Recipient Name *</span>
                <input
                  type="text"
                  required
                  minLength={1}
                  maxLength={120}
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Full recipient name"
                />
              </label>

              <label className="saved-address-form-field">
                <span>Flat / House No. &amp; Street Address *</span>
                <input
                  type="text"
                  required
                  minLength={4}
                  maxLength={240}
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  placeholder="e.g. Flat 4B, Block EP, 18 Sarat Bose Road"
                  autoFocus
                />
              </label>

              <div className="saved-address-form-row">
                <label className="saved-address-form-field">
                  <span>Landmark *</span>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={140}
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                    placeholder="e.g. Near Metro Gate 2"
                  />
                </label>
                <label className="saved-address-form-field">
                  <span>Locality *</span>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={locality}
                    onChange={(e) => setLocality(e.target.value)}
                    placeholder="e.g. Belgharia / Salt Lake"
                  />
                </label>
              </div>

              <label className="saved-address-form-field">
                <span>PIN Code (6 digits) *</span>
                <input
                  type="text"
                  required
                  pattern="[1-9][0-9]{5}"
                  inputMode="numeric"
                  maxLength={6}
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="e.g. 700056"
                />
              </label>

              {addressError ? (
                <div className="saved-address-form-error" role="alert">
                  {addressError}
                </div>
              ) : null}

              <button
                type="submit"
                className="location-enable-action-btn"
                style={{ width: '100%', marginTop: '6px' }}
                disabled={savingAddress}
              >
                {savingAddress ? 'Saving Address...' : 'Save & Use This Delivery Address'}
              </button>
            </form>
          ) : (
            <div className="saved-addresses-list" role="list">
              {filteredAddresses.map((address) => {
                const title = getSavedAddressDisplayTitle(address);
                const fullAddress = formatFullSavedAddress(address);
                const selectionCount = address.selectionCount ?? 0;
                const isSelected = selectedAddressId === address.addressId;
                return (
                  <button
                    key={address.addressId}
                    type="button"
                    className={`saved-address-card-btn${isSelected ? ' is-selected' : ''}`}
                    role="listitem"
                    onClick={() => onSelectAddress(address)}
                    aria-label={`Select ${title}: ${fullAddress}`}
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
                      <div className="saved-address-name-row">
                        <span className="saved-address-name">{title}</span>
                        {selectionCount > 0 ? (
                          <span className="saved-address-history-badge">
                            Used {selectionCount}×
                          </span>
                        ) : address.isDefault ? (
                          <span className="saved-address-history-badge">Default</span>
                        ) : null}
                      </div>
                      <div className="saved-address-street">{fullAddress}</div>
                    </div>

                    <span className="saved-address-arrow" aria-hidden="true">
                      ›
                    </span>
                  </button>
                );
              })}

              {filteredAddresses.length === 0 && (
                <div className="saved-address-empty-state">
                  {searchQuery.trim() ? (
                    <>
                      <p style={{ margin: '0 0 10px' }}>
                        No saved address matches &ldquo;{searchQuery}&rdquo;.
                      </p>
                      <button
                        type="button"
                        className="saved-addresses-see-all-btn"
                        onClick={() => {
                          setStreetAddress(searchQuery.trim());
                          setShowAddForm(true);
                        }}
                      >
                        + Save &ldquo;{searchQuery.trim()}&rdquo; as delivery address
                      </button>
                    </>
                  ) : (
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                        alignItems: 'center',
                      }}
                    >
                      <p style={{ margin: 0 }}>
                        {hasConfiguredApi && !isAuthenticated
                          ? 'Sign in to load your database saved address history, or add a delivery address below.'
                          : 'No saved delivery addresses yet. Add your proper house/flat & street address below.'}
                      </p>
                      <div
                        style={{
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                          justifyContent: 'center',
                        }}
                      >
                        {hasConfiguredApi && !isAuthenticated ? (
                          <button
                            type="button"
                            className="location-enable-action-btn"
                            style={{ minHeight: '38px', fontSize: '13px', padding: '6px 14px' }}
                            onClick={onOpenSignIn}
                          >
                            Sign In
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="saved-addresses-see-all-btn"
                          onClick={() => setShowAddForm(true)}
                        >
                          + Add delivery address
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Search Bar */}
        {!showAddForm && (
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
                placeholder="Search saved addresses"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search saved addresses"
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
        )}
      </div>
    </dialog>
  );
}
