import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useFormAriaValidation } from '../hooks/useFormAriaValidation';
import { apiRequest, getZoneCoordinates } from '../lib/apiClient';
import type {
  AddressLabel,
  AuthSessionState,
  ConsentRecordView,
  CustomerDietaryPreference,
  CustomerProfileView,
  KolkataZoneId,
  LanguagePreference,
  LocationPermissionState,
  SavedAddressView,
} from '../types/domain';

interface CustomerAccountPanelProps {
  session: AuthSessionState;
  selectedZone: KolkataZoneId;
  locationPermissionState: LocationPermissionState;
  onSessionUpdate: (session: AuthSessionState | null) => void;
  onZoneSelect: (zone: KolkataZoneId) => void;
  onLocationPermissionChange: (state: LocationPermissionState) => void;
  onStatusMessage: (banner: { text: string; kind: 'neutral' | 'success' | 'error' }) => void;
}

type AccountTab = 'profile' | 'addresses' | 'privacy';

const DIETARY_LABELS: ReadonlyArray<{ value: CustomerDietaryPreference; label: string }> = [
  { value: 'NONE', label: 'No preference (All kitchens)' },
  { value: 'VEG', label: 'Pure Vegetarian' },
  { value: 'EGGETARIAN', label: 'Eggetarian' },
  { value: 'VEGAN', label: 'Vegan' },
  { value: 'JAIN', label: 'Jain' },
];

const KOLKATA_DELIVERY_ZONES: ReadonlyArray<{
  value: Exclude<KolkataZoneId, 'all'>;
  label: string;
}> = [
  { value: 'salt-lake', label: 'Salt Lake (Sector V & Karunamoyee)' },
  { value: 'central', label: 'Park Street & Central Kolkata' },
  { value: 'new-town', label: 'New Town & Rajarhat' },
  { value: 'south', label: 'Ballygunge & Gariahat' },
  { value: 'north', label: 'Shyambazar & North Kolkata' },
];

export function CustomerAccountPanel({
  session,
  selectedZone,
  locationPermissionState,
  onSessionUpdate,
  onZoneSelect,
  onLocationPermissionChange,
  onStatusMessage,
}: CustomerAccountPanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<AccountTab>('profile');
  const [busy, setBusy] = useState(false);

  const [fullName, setFullName] = useState(session.user.name);
  const [language, setLanguage] = useState<LanguagePreference>(session.user.languagePreference);
  const [dietary, setDietary] = useState<CustomerDietaryPreference>('NONE');
  const [preferredZone, setPreferredZone] = useState<Exclude<KolkataZoneId, 'all'>>(
    selectedZone === 'all' ? 'salt-lake' : selectedZone,
  );
  const [orderUpdates, setOrderUpdates] = useState(true);
  const [safetyAlerts, setSafetyAlerts] = useState(true);
  const [promotions, setPromotions] = useState(false);

  const [addresses, setAddresses] = useState<SavedAddressView[]>([]);
  const [consents, setConsents] = useState<ConsentRecordView[]>([]);

  // Saved address creation form
  const [addrLabel, setAddrLabel] = useState<AddressLabel>('Home');
  const [addrRecipient, setAddrRecipient] = useState(session.user.name);
  const [addrPhone, setAddrPhone] = useState('');
  const [addrStreet, setAddrStreet] = useState('');
  const [addrLandmark, setAddrLandmark] = useState('');
  const [addrLocality, setAddrLocality] = useState('Salt Lake');
  const [addrPostalCode, setAddrPostalCode] = useState('700091');
  const [addrZone, setAddrZone] = useState<Exclude<KolkataZoneId, 'all'>>('salt-lake');
  const [addrInstructions, setAddrInstructions] = useState('');
  const [addrIsDefault, setAddrIsDefault] = useState(true);

  // Account deletion confirmation
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteReason, setDeleteReason] = useState('');

  useFormAriaValidation(containerRef, [activeTab, addresses.length]);

  useEffect(() => {
    setFullName(session.user.name);
    setLanguage(session.user.languagePreference);
  }, [session.user.name, session.user.languagePreference]);

  useEffect(() => {
    let active = true;
    const loadCustomerData = async (): Promise<void> => {
      try {
        const [bundle, addrData] = await Promise.all([
          apiRequest<{
            profile: CustomerProfileView;
            consents: ConsentRecordView[];
          }>('/customer/profile', { token: session.tokens.accessToken }),
          apiRequest<{ addresses: SavedAddressView[] }>('/addresses', {
            token: session.tokens.accessToken,
          }),
        ]);
        if (!active) {
          return;
        }
        setDietary(bundle.profile.dietaryPreference);
        if (bundle.profile.savedDeliveryZoneId) {
          setPreferredZone(bundle.profile.savedDeliveryZoneId);
        }
        setOrderUpdates(bundle.profile.notificationPreferences.orderUpdates);
        setSafetyAlerts(bundle.profile.notificationPreferences.safetyAlerts);
        setPromotions(bundle.profile.notificationPreferences.promotions);
        onLocationPermissionChange(bundle.profile.locationPermissionState);
        setConsents(bundle.consents);
        setAddresses(addrData.addresses);
      } catch (error) {
        if (!active) {
          return;
        }
        if (error instanceof Error && error.message !== 'PREVIEW_NO_API') {
          onStatusMessage({ text: error.message, kind: 'error' });
        }
      }
    };

    void loadCustomerData();
    return () => {
      active = false;
    };
  }, [session.tokens.accessToken, onLocationPermissionChange, onStatusMessage]);

  const handleSaveProfile = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await apiRequest<{
        user: { name: string; languagePreference: LanguagePreference };
        profile: CustomerProfileView;
        consents: ConsentRecordView[];
      }>('/customer/profile', {
        method: 'PATCH',
        token: session.tokens.accessToken,
        body: {
          name: fullName.trim(),
          languagePreference: language,
          dietaryPreference: dietary,
          savedDeliveryZoneId: preferredZone,
          locationPermissionState,
          notificationPreferences: {
            orderUpdates,
            safetyAlerts,
            promotions,
          },
        },
      });
      setConsents(data.consents);
      onZoneSelect(preferredZone);
      onSessionUpdate({
        ...session,
        user: {
          ...session.user,
          name: data.user.name,
          languagePreference: data.user.languagePreference,
        },
      });
      onStatusMessage({ text: 'Customer profile & preferences updated.', kind: 'success' });
    } catch (error) {
      if (error instanceof Error && error.message === 'PREVIEW_NO_API') {
        onZoneSelect(preferredZone);
        onSessionUpdate({
          ...session,
          user: { ...session.user, name: fullName.trim(), languagePreference: language },
        });
        onStatusMessage({
          text: 'Preview mode: preferences updated locally (start backend API on /api/v1 for persistence).',
          kind: 'neutral',
        });
      } else {
        onStatusMessage({
          text: error instanceof Error ? error.message : 'Unable to save profile',
          kind: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleAddAddress = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        label: addrLabel,
        recipientName: addrRecipient.trim(),
        contactPhone: addrPhone.trim() || null,
        streetAddress: addrStreet.trim(),
        landmark: addrLandmark.trim(),
        locality: addrLocality.trim(),
        city: 'Kolkata',
        postalCode: addrPostalCode.trim(),
        zoneId: addrZone,
        deliveryInstructions: addrInstructions.trim() || null,
        coordinates: getZoneCoordinates(addrZone),
        isDefault: addrIsDefault,
      };
      const result = await apiRequest<{ address: SavedAddressView }>('/addresses', {
        method: 'POST',
        token: session.tokens.accessToken,
        body: payload,
      });
      setAddresses((prev) => {
        const mapped = result.address.isDefault
          ? prev.map((item) => ({ ...item, isDefault: false }))
          : prev;
        return [result.address, ...mapped];
      });
      setAddrStreet('');
      setAddrLandmark('');
      setAddrInstructions('');
      onStatusMessage({ text: 'Kolkata delivery address saved securely.', kind: 'success' });
    } catch (error) {
      if (error instanceof Error && error.message === 'PREVIEW_NO_API') {
        const localAddr: SavedAddressView = {
          addressId: `preview_${Date.now()}`,
          userId: session.user.id,
          label: addrLabel,
          recipientName: addrRecipient.trim(),
          contactPhoneMasked: addrPhone.trim() ? '******' + addrPhone.trim().slice(-4) : null,
          streetAddress: addrStreet.trim(),
          landmark: addrLandmark.trim(),
          locality: addrLocality.trim(),
          city: 'Kolkata',
          postalCode: addrPostalCode.trim(),
          zoneId: addrZone,
          deliveryInstructions: addrInstructions.trim() || null,
          location: { type: 'Point', coordinates: getZoneCoordinates(addrZone) },
          isDefault: addrIsDefault || addresses.length === 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setAddresses((prev) => [
          localAddr,
          ...prev.map((item) => (localAddr.isDefault ? { ...item, isDefault: false } : item)),
        ]);
        setAddrStreet('');
        setAddrLandmark('');
        onStatusMessage({
          text: 'Preview mode: address added locally (backend MongoDB API stores persisted addresses).',
          kind: 'neutral',
        });
      } else {
        onStatusMessage({
          text: error instanceof Error ? error.message : 'Unable to save address',
          kind: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSetDefaultAddress = async (addressId: string): Promise<void> => {
    setBusy(true);
    try {
      await apiRequest(`/addresses/${encodeURIComponent(addressId)}/default`, {
        method: 'POST',
        token: session.tokens.accessToken,
      });
      setAddresses((prev) =>
        prev.map((item) => ({ ...item, isDefault: item.addressId === addressId })),
      );
      onStatusMessage({ text: 'Default delivery address updated.', kind: 'success' });
    } catch (error) {
      if (error instanceof Error && error.message === 'PREVIEW_NO_API') {
        setAddresses((prev) =>
          prev.map((item) => ({ ...item, isDefault: item.addressId === addressId })),
        );
      } else {
        onStatusMessage({
          text: error instanceof Error ? error.message : 'Failed to update default address',
          kind: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAddress = async (addressId: string): Promise<void> => {
    setBusy(true);
    try {
      await apiRequest(`/addresses/${encodeURIComponent(addressId)}`, {
        method: 'DELETE',
        token: session.tokens.accessToken,
      });
      setAddresses((prev) => prev.filter((item) => item.addressId !== addressId));
      onStatusMessage({ text: 'Saved address deleted.', kind: 'neutral' });
    } catch (error) {
      if (error instanceof Error && error.message === 'PREVIEW_NO_API') {
        setAddresses((prev) => prev.filter((item) => item.addressId !== addressId));
      } else {
        onStatusMessage({
          text: error instanceof Error ? error.message : 'Unable to delete address',
          kind: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleExportMyData = async (): Promise<void> => {
    setBusy(true);
    try {
      let exported: unknown;
      try {
        exported = await apiRequest('/customer/privacy/export', {
          token: session.tokens.accessToken,
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'PREVIEW_NO_API') {
          exported = {
            exportedAt: new Date().toISOString(),
            account: session.user,
            preferences: { dietary, preferredZone, orderUpdates, safetyAlerts, promotions },
            addresses,
            retentionDays: 30,
          };
        } else {
          throw err;
        }
      }
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `bhojora-privacy-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      onStatusMessage({ text: 'Privacy data export downloaded.', kind: 'success' });
    } catch (error) {
      onStatusMessage({
        text: error instanceof Error ? error.message : 'Privacy export failed',
        kind: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRequestDeletion = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setBusy(true);
    try {
      await apiRequest('/customer/account/deletion-request', {
        method: 'POST',
        token: session.tokens.accessToken,
        body: {
          confirmText: deleteConfirmText.trim(),
          reason: deleteReason.trim() || null,
        },
      });
      onSessionUpdate(null);
      onStatusMessage({
        text: 'Account deletion requested. All active sessions have been revoked; 30-day statutory retention window started.',
        kind: 'neutral',
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'PREVIEW_NO_API') {
        onSessionUpdate(null);
        onStatusMessage({
          text: 'Preview mode: account deletion simulation completed and local session cleared.',
          kind: 'neutral',
        });
      } else {
        onStatusMessage({
          text: error instanceof Error ? error.message : 'Unable to request deletion',
          kind: 'error',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={containerRef} id="customerAccountPanel" style={{ marginTop: '14px' }}>
      <div className="auth-tabs" role="tablist" aria-label="Customer account management">
        <button
          type="button"
          className="auth-tab"
          role="tab"
          aria-selected={activeTab === 'profile'}
          onClick={() => setActiveTab('profile')}
        >
          Profile &amp; Prefs
        </button>
        <button
          type="button"
          className="auth-tab"
          role="tab"
          aria-selected={activeTab === 'addresses'}
          onClick={() => setActiveTab('addresses')}
        >
          Saved Addresses ({addresses.length})
        </button>
        <button
          type="button"
          className="auth-tab"
          role="tab"
          aria-selected={activeTab === 'privacy'}
          onClick={() => setActiveTab('privacy')}
        >
          Privacy &amp; Delete
        </button>
      </div>

      {activeTab === 'profile' ? (
        <form
          id="customerProfileForm"
          className="auth-form"
          onSubmit={(event) => void handleSaveProfile(event)}
        >
          <div className="auth-field">
            <label htmlFor="profileFullName">
              Full name <span aria-hidden="true">*</span>
            </label>
            <input
              id="profileFullName"
              name="name"
              type="text"
              className="auth-input"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              data-error="profileNameError"
              required
            />
            <div id="profileNameError" className="auth-field-error">
              <span role="img" aria-label="Error">
                ⚠️
              </span>{' '}
              Enter your display name (English or Bengali script supported).
            </div>
          </div>

          <div className="account-grid-2">
            <div className="auth-field">
              <label htmlFor="profileLang">Language preference</label>
              <select
                id="profileLang"
                className="auth-input"
                value={language}
                onChange={(event) => setLanguage(event.target.value as LanguagePreference)}
              >
                <option value="en-IN">English (India)</option>
                <option value="bn-IN">বাংলা (Bengali)</option>
              </select>
            </div>

            <div className="auth-field">
              <label htmlFor="profileDietary">Dietary preference</label>
              <select
                id="profileDietary"
                className="auth-input"
                value={dietary}
                onChange={(event) => setDietary(event.target.value as CustomerDietaryPreference)}
              >
                {DIETARY_LABELS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="auth-field">
            <label htmlFor="profilePreferredZone">Preferred Kolkata delivery corridor</label>
            <select
              id="profilePreferredZone"
              className="auth-input"
              value={preferredZone}
              onChange={(event) =>
                setPreferredZone(event.target.value as Exclude<KolkataZoneId, 'all'>)
              }
            >
              {KOLKATA_DELIVERY_ZONES.map((zone) => (
                <option key={zone.value} value={zone.value}>
                  {zone.label}
                </option>
              ))}
            </select>
          </div>

          <div className="privacy-callout">
            <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '6px' }}>
              Notification &amp; Privacy Consents
            </div>
            <label className="auth-checkbox-row" style={{ marginBottom: '6px' }}>
              <input
                type="checkbox"
                checked={orderUpdates}
                onChange={(event) => setOrderUpdates(event.target.checked)}
              />
              <span>Essential order updates &amp; delivery OTP notices</span>
            </label>
            <label className="auth-checkbox-row" style={{ marginBottom: '6px' }}>
              <input
                type="checkbox"
                checked={safetyAlerts}
                onChange={(event) => setSafetyAlerts(event.target.checked)}
              />
              <span>Independent kitchen safety score &amp; audit alerts</span>
            </label>
            <label className="auth-checkbox-row" style={{ marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={promotions}
                onChange={(event) => setPromotions(event.target.checked)}
              />
              <span>Kolkata festival &amp; restaurant offers (optional, off by default)</span>
            </label>
          </div>

          <button
            type="submit"
            id="saveCustomerProfileBtn"
            className="btn btn-primary"
            style={{ width: '100%', minHeight: '46px', marginTop: '10px' }}
            disabled={busy}
          >
            Save Profile &amp; Preferences
          </button>
        </form>
      ) : null}

      {activeTab === 'addresses' ? (
        <div id="savedAddressesTab">
          {addresses.length === 0 ? (
            <div className="privacy-callout" style={{ marginBottom: '14px' }}>
              No Kolkata delivery addresses saved yet. Add your primary flat or office landmark
              below for faster delivery serviceability checks.
            </div>
          ) : (
            <div id="savedAddressesList" style={{ marginBottom: '16px' }}>
              {addresses.map((address) => (
                <div key={address.addressId} className="address-card">
                  <div className="address-card-head">
                    <span className="address-tag">
                      {address.label}
                      {address.isDefault ? ' • Default' : ''}
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {!address.isDefault ? (
                        <button
                          type="button"
                          className="auth-link-btn"
                          style={{ minHeight: '32px' }}
                          onClick={() => void handleSetDefaultAddress(address.addressId)}
                          disabled={busy}
                        >
                          Make Default
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="auth-link-btn"
                        style={{ minHeight: '32px', color: '#8D352A' }}
                        onClick={() => void handleDeleteAddress(address.addressId)}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--neutral-950)' }}>
                    {address.recipientName}
                    {address.contactPhoneMasked ? ` • ${address.contactPhoneMasked}` : ''}
                  </div>
                  <div style={{ fontSize: '13px', color: 'var(--neutral-800)', marginTop: '2px' }}>
                    {address.streetAddress}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--neutral-600)', marginTop: '2px' }}>
                    Landmark: {address.landmark} • {address.locality}, {address.city} –{' '}
                    {address.postalCode}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form
            id="addAddressForm"
            className="auth-form"
            onSubmit={(event) => void handleAddAddress(event)}
          >
            <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px' }}>
              Add Kolkata Delivery Address
            </div>

            <div className="account-grid-2">
              <div className="auth-field">
                <label htmlFor="addrLabel">Address label</label>
                <select
                  id="addrLabel"
                  className="auth-input"
                  value={addrLabel}
                  onChange={(event) => setAddrLabel(event.target.value as AddressLabel)}
                >
                  <option value="Home">Home</option>
                  <option value="Work">Work</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="auth-field">
                <label htmlFor="addrZone">Kolkata zone</label>
                <select
                  id="addrZone"
                  className="auth-input"
                  value={addrZone}
                  onChange={(event) =>
                    setAddrZone(event.target.value as Exclude<KolkataZoneId, 'all'>)
                  }
                >
                  {KOLKATA_DELIVERY_ZONES.map((zone) => (
                    <option key={zone.value} value={zone.value}>
                      {zone.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="account-grid-2">
              <div className="auth-field">
                <label htmlFor="addrRecipient">
                  Recipient name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="addrRecipient"
                  name="recipientName"
                  type="text"
                  className="auth-input"
                  autoComplete="name"
                  value={addrRecipient}
                  onChange={(event) => setAddrRecipient(event.target.value)}
                  data-error="addrRecipientError"
                  required
                />
                <div id="addrRecipientError" className="auth-field-error">
                  Enter recipient name.
                </div>
              </div>
              <div className="auth-field">
                <label htmlFor="addrPhone">Contact mobile (optional)</label>
                <input
                  id="addrPhone"
                  name="contactPhone"
                  type="tel"
                  className="auth-input"
                  autoComplete="tel"
                  inputMode="numeric"
                  placeholder="+919830012345"
                  value={addrPhone}
                  onChange={(event) => setAddrPhone(event.target.value)}
                />
                <span className="auth-hint">
                  Shared only via masked proxy during active delivery handoff.
                </span>
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="addrStreet">
                Flat / House No., Building &amp; Street <span aria-hidden="true">*</span>
              </label>
              <textarea
                id="addrStreet"
                name="streetAddress"
                rows={2}
                className="auth-input"
                autoComplete="street-address"
                placeholder="Flat 4B, Greenfield Tower, Block EP, Salt Lake"
                value={addrStreet}
                onChange={(event) => setAddrStreet(event.target.value)}
                data-error="addrStreetError"
                required
              />
              <div id="addrStreetError" className="auth-field-error">
                Enter street and building details (min 4 characters).
              </div>
            </div>

            <div className="account-grid-3">
              <div className="auth-field">
                <label htmlFor="addrLandmark">
                  Kolkata landmark <span aria-hidden="true">*</span>
                </label>
                <input
                  id="addrLandmark"
                  name="landmark"
                  type="text"
                  className="auth-input"
                  placeholder="Near Karunamoyee"
                  value={addrLandmark}
                  onChange={(event) => setAddrLandmark(event.target.value)}
                  data-error="addrLandmarkError"
                  required
                />
                <div id="addrLandmarkError" className="auth-field-error">
                  Landmark required for Kolkata courier routing.
                </div>
              </div>
              <div className="auth-field">
                <label htmlFor="addrLocality">
                  Locality <span aria-hidden="true">*</span>
                </label>
                <input
                  id="addrLocality"
                  name="locality"
                  type="text"
                  className="auth-input"
                  autoComplete="address-level2"
                  value={addrLocality}
                  onChange={(event) => setAddrLocality(event.target.value)}
                  data-error="addrLocalityError"
                  required
                />
                <div id="addrLocalityError" className="auth-field-error">
                  Enter neighborhood / locality.
                </div>
              </div>
              <div className="auth-field">
                <label htmlFor="addrPostalCode">
                  PIN code <span aria-hidden="true">*</span>
                </label>
                <input
                  id="addrPostalCode"
                  name="postalCode"
                  type="text"
                  className="auth-input"
                  autoComplete="postal-code"
                  inputMode="numeric"
                  pattern="[1-9][0-9]{5}"
                  maxLength={6}
                  value={addrPostalCode}
                  onChange={(event) => setAddrPostalCode(event.target.value)}
                  data-error="addrPinError"
                  required
                />
                <div id="addrPinError" className="auth-field-error">
                  Enter a 6-digit PIN code.
                </div>
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="addrInstructions">Delivery instructions (optional)</label>
              <input
                id="addrInstructions"
                name="deliveryInstructions"
                type="text"
                className="auth-input"
                placeholder="Ring bell once / Leave at security desk"
                value={addrInstructions}
                onChange={(event) => setAddrInstructions(event.target.value)}
              />
            </div>

            <label className="auth-checkbox-row">
              <input
                type="checkbox"
                checked={addrIsDefault}
                onChange={(event) => setAddrIsDefault(event.target.checked)}
              />
              <span>Set as default Kolkata delivery address</span>
            </label>

            <button
              type="submit"
              id="saveAddressBtn"
              className="btn btn-primary"
              style={{ width: '100%', minHeight: '46px' }}
              disabled={busy}
            >
              Save Delivery Address
            </button>
          </form>
        </div>
      ) : null}

      {activeTab === 'privacy' ? (
        <div id="customerPrivacyTab">
          <div className="privacy-callout" style={{ marginBottom: '14px' }}>
            <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
              Data Retention &amp; Self-Service Privacy Controls
            </div>
            <p style={{ fontSize: '12px', color: 'var(--neutral-600)', lineHeight: 1.55 }}>
              Saved addresses and profile details remain strictly scoped to your account (zero
              cross-user access). Active delivery GPS pings retain for up to 24 hours. Upon deletion
              request, sessions revoke immediately and personal PII is anonymized after a{' '}
              <strong>30-day statutory hold</strong>, while pseudonymous tax/order ledgers remain
              under Indian compliance law.
            </p>
            <button
              type="button"
              id="exportPrivacyDataBtn"
              className="btn btn-outline"
              style={{ marginTop: '10px', minHeight: '40px', fontSize: '13px' }}
              onClick={() => void handleExportMyData()}
              disabled={busy}
            >
              Download My Account Data (JSON)
            </button>
          </div>

          {consents.length > 0 ? (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ fontWeight: 700, fontSize: '12px', marginBottom: '6px' }}>
                Recent Append-Only Consent History
              </div>
              {consents.slice(0, 4).map((item) => (
                <div key={item.id} className="session-card" style={{ padding: '8px 10px' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '12px' }}>
                      {item.consentType} ({item.granted ? 'Granted' : 'Withdrawn'})
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--neutral-600)' }}>
                      Policy {item.policyVersion} • {item.source} •{' '}
                      {new Date(item.acceptedAt).toLocaleDateString('en-IN')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <form
            id="accountDeletionForm"
            className="danger-zone-box"
            onSubmit={(event) => void handleRequestDeletion(event)}
          >
            <div
              style={{ fontWeight: 700, fontSize: '13px', color: '#5F2120', marginBottom: '6px' }}
            >
              Delete My Account &amp; Erase Personal Data
            </div>
            <div className="auth-field">
              <label htmlFor="deleteConfirmInput">
                Type <strong>DELETE</strong> to confirm <span aria-hidden="true">*</span>
              </label>
              <input
                id="deleteConfirmInput"
                type="text"
                className="auth-input"
                pattern="DELETE"
                placeholder="DELETE"
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                data-error="deleteConfirmError"
                required
              />
              <div id="deleteConfirmError" className="auth-field-error">
                Type DELETE in uppercase to confirm account deletion.
              </div>
            </div>
            <div className="auth-field">
              <label htmlFor="deleteReasonInput">Optional reason (feedback)</label>
              <input
                id="deleteReasonInput"
                type="text"
                className="auth-input"
                placeholder="Moving out of Kolkata / Privacy preference"
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
              />
            </div>
            <button
              type="submit"
              id="requestAccountDeletionBtn"
              className="btn btn-outline"
              style={{
                width: '100%',
                minHeight: '44px',
                borderColor: '#D32F2F',
                color: '#5F2120',
                background: '#FDEAEA',
              }}
              disabled={busy}
            >
              Request Permanent Account Deletion
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
