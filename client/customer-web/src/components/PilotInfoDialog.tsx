import { useEffect, useRef, useState } from 'react';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';
import {
  buildGoogleMapEmbedUrl,
  checkKolkataDeliveryCoverage,
  ZONE_CENTERS,
  type KolkataDeliveryCoverageCheck,
} from '../lib/apiClient';
import type { KolkataZoneId, LocationPermissionState } from '../types/domain';

const NOTIFY_LOCATIONS_STORAGE_KEY = 'bhojora_notify_locations_v1';

interface PilotInfoDialogProps {
  open: boolean;
  selectedZone: KolkataZoneId;
  permissionState: LocationPermissionState;
  onSelectZone: (zone: KolkataZoneId) => void;
  onDetectGpsZone: (
    zone: Exclude<KolkataZoneId, 'all'>,
    permissionState: LocationPermissionState,
    localityLabel: string,
  ) => void;
  onClose: () => void;
}

export function PilotInfoDialog({
  open,
  selectedZone,
  permissionState,
  onSelectZone,
  onDetectGpsZone,
  onClose,
}: PilotInfoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [coverageResult, setCoverageResult] = useState<KolkataDeliveryCoverageCheck | null>(null);
  const [activeMapQuery, setActiveMapQuery] = useState<string>('Kolkata, West Bengal, India');
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [notifyInput, setNotifyInput] = useState('');
  const [notifySubmitted, setNotifySubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState<'map' | 'app'>('map');

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

  // Update map query when selectedZone changes
  useEffect(() => {
    if (detectedCoords) {
      return;
    }
    if (selectedZone === 'all') {
      setActiveMapQuery('Kolkata, West Bengal, India');
    } else {
      const zoneDetail = ZONE_CENTERS.find((z) => z.id === selectedZone);
      if (zoneDetail) {
        setActiveMapQuery(zoneDetail.googleMapQuery);
      }
    }
  }, [selectedZone, detectedCoords]);

  const handleUseCurrentLocation = async (): Promise<void> => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatusNote(
        'Browser geolocation is unavailable on this device. Please select a Kolkata corridor below.',
      );
      setCoverageResult(null);
      return;
    }

    setDetecting(true);
    setStatusNote('Accessing GPS coordinates via browser location service...');
    setCoverageResult(null);

    try {
      if ('permissions' in navigator && typeof navigator.permissions.query === 'function') {
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        if (perm.state === 'denied') {
          setDetecting(false);
          setStatusNote(
            'Location permission is blocked in browser settings. Please enable location permissions or choose a corridor below.',
          );
          return;
        }
      }
    } catch {
      // Proceed directly to getCurrentPosition if permissions.query is unsupported
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setDetectedCoords({ lat, lng });

        // Optional quick reverse geocoding via OpenStreetMap with timeout
        let localityName: string | undefined;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { signal: controller.signal },
          );
          clearTimeout(timeoutId);
          if (res.ok) {
            const data: { display_name?: string; address?: { suburb?: string; city?: string } } =
              await res.json();
            localityName =
              data.address?.suburb || data.address?.city || data.display_name?.split(',')[0];
          }
        } catch {
          // Gracefully continue without external reverse geocode
        }

        const coverage = checkKolkataDeliveryCoverage(lat, lng, localityName);
        setCoverageResult(coverage);
        setDetecting(false);

        // Center map on user's exact detected GPS pin
        setActiveMapQuery(`${lat},${lng}`);

        if (coverage.isCovered) {
          setStatusNote(
            `✓ Delivery available! Matched to ${coverage.nearestZoneLabel} (${coverage.distanceKm} km away).`,
          );
          onDetectGpsZone(coverage.nearestZoneId, 'granted', coverage.nearestZoneLabel);
        } else {
          setStatusNote(
            `Detected location: ${localityName ?? `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`} (${coverage.distanceKm} km from nearest Kolkata hub).`,
          );
        }
      },
      (error) => {
        setDetecting(false);
        const isDenied = error.code === error.PERMISSION_DENIED;
        setStatusNote(
          isDenied
            ? 'Permission denied (ST-06): enable Location access in browser site settings or pick a Kolkata corridor below.'
            : 'Unable to acquire GPS lock. Please select your Kolkata delivery corridor below.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  const handleNotifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifyInput.trim()) return;

    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const raw = window.localStorage.getItem(NOTIFY_LOCATIONS_STORAGE_KEY);
        const existing = raw ? JSON.parse(raw) : [];
        existing.push({
          contact: notifyInput.trim(),
          coords: detectedCoords,
          timestamp: new Date().toISOString(),
        });
        window.localStorage.setItem(NOTIFY_LOCATIONS_STORAGE_KEY, JSON.stringify(existing));
      } catch {
        // Storage quota safe
      }
    }
    setNotifySubmitted(true);
    setNotifyInput('');
  };

  const googleMapUrl = buildGoogleMapEmbedUrl({
    lat: detectedCoords?.lat,
    lng: detectedCoords?.lng,
    query: detectedCoords ? undefined : activeMapQuery,
    zoom: detectedCoords ? 15 : selectedZone === 'all' ? 12 : 14,
  });

  return (
    <dialog
      ref={dialogRef}
      id="infoModal"
      className="trust-dialog kolkata-map-dialog"
      closedby="any"
      aria-labelledby="infoModalTitle"
      onClose={onClose}
    >
      <div className="modal-header">
        <div>
          <h2 id="infoModalTitle" style={{ fontSize: '20px', fontWeight: 800 }}>
            Kolkata Delivery Map &amp; Zones
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--neutral-600)', marginTop: '2px' }}>
            Live Google Map • Real-time GPS Matching • Verified Cloud Kitchen Corridors
          </p>
        </div>
        <form method="dialog">
          <button type="submit" className="modal-close" aria-label="Close location dialog">
            &times;
          </button>
        </form>
      </div>

      {/* Tabs: Map View vs Mobile App info */}
      <div className="dialog-tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'map'}
          className={activeTab === 'map' ? 'dialog-tab-btn active' : 'dialog-tab-btn'}
          onClick={() => setActiveTab('map')}
        >
          🗺️ Kolkata Google Map &amp; GPS
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'app'}
          className={activeTab === 'app' ? 'dialog-tab-btn active' : 'dialog-tab-btn'}
          onClick={() => setActiveTab('app')}
        >
          📱 Get Bhojora Mobile App
        </button>
      </div>

      {activeTab === 'map' ? (
        <div className="kolkata-map-body">
          {/* GPS Location Action Bar */}
          <div className="gps-action-card">
            <div className="gps-action-info">
              <strong>Detect Your Location</strong>
              <span>
                One-tap GPS matching to your nearest verified Kolkata cloud kitchen corridor.
              </span>
            </div>
            <button
              type="button"
              id="detectGpsLocationBtn"
              className="btn btn-primary detect-gps-btn"
              style={{ minHeight: '44px', padding: '8px 18px' }}
              onClick={() => void handleUseCurrentLocation()}
              disabled={detecting}
            >
              {detecting ? (
                <>
                  <span className="spinner-sm" aria-hidden="true" />
                  <span>Locating via GPS...</span>
                </>
              ) : (
                <>
                  <span aria-hidden="true">📍</span>
                  <span>Use Current GPS Location</span>
                </>
              )}
            </button>
          </div>

          {/* Out of Coverage Warning Card */}
          {coverageResult && !coverageResult.isCovered ? (
            <div className="delivery-coverage-alert out-of-coverage" role="alert">
              <div className="coverage-alert-header">
                <span className="coverage-alert-icon" aria-hidden="true">
                  ⚠️
                </span>
                <div>
                  <strong className="coverage-alert-title">
                    Delivery Not Available in Your Area Yet
                  </strong>
                  <p className="coverage-alert-msg">
                    Unfortunately, in this location there is no delivery available right now. We are
                    working hard to make delivery available to your location soon!
                  </p>
                </div>
              </div>

              <div className="coverage-details-grid">
                <div className="coverage-detail-item">
                  <span>Detected Location:</span>
                  <strong>
                    {coverageResult.detectedLocality ??
                      `${coverageResult.latitude.toFixed(4)}°, ${coverageResult.longitude.toFixed(4)}°`}
                  </strong>
                </div>
                <div className="coverage-detail-item">
                  <span>Nearest Operational Hub:</span>
                  <strong>
                    {coverageResult.nearestZoneLabel} ({coverageResult.distanceKm} km away)
                  </strong>
                </div>
              </div>

              {notifySubmitted ? (
                <div className="notify-success-box" role="status">
                  ✓ Thank you! We have registered your location. We will notify you as soon as
                  Bhojora launches delivery in your neighborhood!
                </div>
              ) : (
                <form className="notify-interest-form" onSubmit={handleNotifySubmit}>
                  <label htmlFor="notifyAreaInput" className="notify-label">
                    Want Bhojora in your area? Enter your neighborhood or phone number:
                  </label>
                  <div className="notify-input-group">
                    <input
                      id="notifyAreaInput"
                      type="text"
                      className="input-field"
                      placeholder="e.g. Behala, Howrah, or 9830012345"
                      value={notifyInput}
                      onChange={(e) => setNotifyInput(e.target.value)}
                    />
                    <button
                      type="submit"
                      className="btn btn-secondary"
                      style={{ minHeight: '44px', whiteSpace: 'nowrap' }}
                    >
                      Notify Me
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : null}

          {/* In Coverage Success Card */}
          {coverageResult?.isCovered ? (
            <div className="delivery-coverage-alert in-coverage" role="status">
              <span className="coverage-alert-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <strong>Delivery is Available in Your Location!</strong>
                <p>
                  You are within the service radius of{' '}
                  <strong>{coverageResult.nearestZoneLabel}</strong> ({coverageResult.distanceKm} km
                  away). Live kitchens are ready for instant orders.
                </p>
              </div>
            </div>
          ) : null}

          {statusNote && !coverageResult ? (
            <p
              id="locationPermissionStatus"
              role="status"
              className="location-status-text"
              style={{
                color: permissionState === 'denied' ? '#8a2b2b' : 'var(--trust-green-text)',
              }}
            >
              {statusNote}
            </p>
          ) : null}

          {/* Interactive Google Map Frame */}
          <div className="google-map-wrapper">
            <div className="google-map-header">
              <span className="map-badge-label">
                📍 {detectedCoords ? 'GPS Pin Location' : `Google Map View: ${activeMapQuery}`}
              </span>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  detectedCoords ? `${detectedCoords.lat},${detectedCoords.lng}` : activeMapQuery,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="open-in-google-maps-link"
              >
                Open in Google Maps ↗
              </a>
            </div>
            <iframe
              title="Kolkata Delivery Zone Google Map"
              src={googleMapUrl}
              className="google-map-iframe"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          {/* Kolkata Corridor Selector Chips */}
          <div className="corridor-selection-section">
            <div className="section-subheading">
              <strong>Select a Kolkata Delivery Corridor:</strong>
              <span>Tap any zone to focus the Google Map and filter kitchen menus.</span>
            </div>
            <div className="corridor-cards-grid">
              {ZONE_CENTERS.map((zone) => {
                const active = selectedZone === zone.id;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    className={active ? 'corridor-card active' : 'corridor-card'}
                    aria-pressed={active}
                    onClick={() => {
                      setDetectedCoords(null);
                      setCoverageResult(null);
                      onSelectZone(zone.id);
                      setActiveMapQuery(zone.googleMapQuery);
                    }}
                  >
                    <div className="corridor-card-header">
                      <strong>{zone.label}</strong>
                      <span className="corridor-bengali-title">{zone.bengaliName}</span>
                    </div>
                    <p className="corridor-key-areas">{zone.keyAreas}</p>
                    <div className="corridor-meta-pills">
                      <span className="corridor-eta">⏱️ {zone.avgEtaMinutes}</span>
                      <span className="corridor-kitchens">
                        🍳 {zone.verifiedKitchensCount} Kitchens
                      </span>
                      <span className="corridor-fee">Min ₹{zone.minOrderInr}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="all-zones-row">
              <button
                type="button"
                className={selectedZone === 'all' ? 'chip active' : 'chip'}
                aria-pressed={selectedZone === 'all'}
                onClick={() => {
                  setDetectedCoords(null);
                  setCoverageResult(null);
                  onSelectZone('all');
                  setActiveMapQuery('Kolkata, West Bengal, India');
                }}
              >
                🌟 View All Kolkata Corridors
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Mobile App Tab */
        <div className="get-app-tab-body">
          <div className="app-preview-card">
            <div className="app-preview-icon">📱</div>
            <div className="app-preview-text">
              <h3 style={{ fontSize: '18px', fontWeight: 800 }}>
                Get the BHOJORA Mobile Experience
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--neutral-700)', lineHeight: 1.6 }}>
                Fast, responsive, and installable on both Android and iOS devices. Access real-time
                order tracking, 5-pillar kitchen inspection reports, and exclusive Kolkata pilot
                coupons.
              </p>
            </div>
          </div>

          <div className="app-install-steps-grid">
            <div className="install-step-card">
              <div className="step-number">1</div>
              <strong>Android (Chrome / Edge)</strong>
              <p>
                Tap the three dots (⋮) menu in your browser, then tap{' '}
                <strong>&ldquo;Install App&rdquo;</strong> or{' '}
                <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
              </p>
            </div>

            <div className="install-step-card">
              <div className="step-number">2</div>
              <strong>Apple iOS (Safari)</strong>
              <p>
                Tap the Share icon (⎙) at the bottom of Safari, scroll down and tap{' '}
                <strong>&ldquo;Add to Home Screen&rdquo;</strong>.
              </p>
            </div>

            <div className="install-step-card">
              <div className="step-number">3</div>
              <strong>Instant PWA Updates</strong>
              <p>
                Enjoy zero app-store downloads, instant offline access, and automatic updates to all
                Kolkata corridors.
              </p>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: '48px', padding: '10px 24px' }}
              onClick={() => setActiveTab('map')}
            >
              Back to Kolkata Delivery Map
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}
