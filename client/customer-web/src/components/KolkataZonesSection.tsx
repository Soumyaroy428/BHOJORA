import { useState } from 'react';
import {
  buildGoogleMapEmbedUrl,
  checkKolkataDeliveryCoverage,
  ZONE_CENTERS,
  type KolkataDeliveryCoverageCheck,
} from '../lib/apiClient';
import type { KolkataZoneId, LocationPermissionState } from '../types/domain';

interface KolkataZonesSectionProps {
  selectedZone: KolkataZoneId;
  onSelectZone: (zone: KolkataZoneId) => void;
  onOpenPilotDialog: () => void;
  onDetectGpsZone: (
    zone: Exclude<KolkataZoneId, 'all'>,
    permissionState: LocationPermissionState,
    localityLabel: string,
  ) => void;
}

export function KolkataZonesSection({
  selectedZone,
  onSelectZone,
  onOpenPilotDialog,
  onDetectGpsZone,
}: KolkataZonesSectionProps) {
  const [detecting, setDetecting] = useState(false);
  const [coverageCheck, setCoverageCheck] = useState<KolkataDeliveryCoverageCheck | null>(null);
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>(null);

  const activeZoneDetail = ZONE_CENTERS.find((z) => z.id === selectedZone);
  const mapQuery = detectedCoords
    ? `${detectedCoords.lat},${detectedCoords.lng}`
    : activeZoneDetail
      ? activeZoneDetail.googleMapQuery
      : 'Kolkata, West Bengal, India';

  const googleMapUrl = buildGoogleMapEmbedUrl({
    lat: detectedCoords?.lat,
    lng: detectedCoords?.lng,
    query: detectedCoords ? undefined : mapQuery,
    zoom: detectedCoords ? 15 : selectedZone === 'all' ? 12 : 14,
  });

  const handleDetectLocation = (): void => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      alert(
        'Browser geolocation is unavailable on this device. Please select a corridor manually.',
      );
      return;
    }

    setDetecting(true);
    setCoverageCheck(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setDetectedCoords({ lat, lng });

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
          // Gracefully continue without reverse geocode
        }

        const coverage = checkKolkataDeliveryCoverage(lat, lng, localityName);
        setCoverageCheck(coverage);
        setDetecting(false);

        if (coverage.isCovered) {
          onDetectGpsZone(coverage.nearestZoneId, 'granted', coverage.nearestZoneLabel);
        }
      },
      (error) => {
        setDetecting(false);
        const isDenied = error.code === error.PERMISSION_DENIED;
        alert(
          isDenied
            ? 'Location access was denied. Please select your Kolkata corridor manually below.'
            : 'Could not detect GPS location. Please choose a corridor below.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  return (
    <section
      id="kolkata-launch"
      className="kolkata-zones-section"
      aria-label="Kolkata Delivery Zones"
    >
      <div className="container">
        <div className="section-header">
          <div>
            <div className="badge badge-accent" style={{ marginBottom: '8px' }}>
              📍 5 Verified Delivery Corridors
            </div>
            <h2 className="section-title">Kolkata Service Corridors &amp; Live Map</h2>
            <p className="section-subtitle">
              Order from independent cloud kitchens with FSSAI verification and monitored cold
              chains across Kolkata.
            </p>
          </div>
          <div className="section-actions">
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: '44px' }}
              onClick={handleDetectLocation}
              disabled={detecting}
            >
              {detecting ? 'Locating...' : '📍 Use Current GPS Location'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ minHeight: '44px' }}
              onClick={onOpenPilotDialog}
            >
              📱 Get Mobile App
            </button>
          </div>
        </div>

        {/* Coverage Result Notice */}
        {coverageCheck && !coverageCheck.isCovered ? (
          <div
            className="delivery-coverage-alert out-of-coverage"
            role="alert"
            style={{ marginBottom: '20px' }}
          >
            <div className="coverage-alert-header">
              <span className="coverage-alert-icon" aria-hidden="true">
                ⚠️
              </span>
              <div>
                <strong className="coverage-alert-title">
                  Delivery Not Available in Your Location Yet
                </strong>
                <p className="coverage-alert-msg">
                  Unfortunately, in this location there is no delivery available right now. We are
                  working hard to make delivery available to your location soon!
                </p>
                <p style={{ fontSize: '13px', marginTop: '4px', color: 'var(--neutral-700)' }}>
                  Detected:{' '}
                  <strong>
                    {coverageCheck.detectedLocality ??
                      `${coverageCheck.latitude.toFixed(4)}°, ${coverageCheck.longitude.toFixed(4)}°`}
                  </strong>{' '}
                  • Nearest Hub:{' '}
                  <strong>
                    {coverageCheck.nearestZoneLabel} ({coverageCheck.distanceKm} km away)
                  </strong>
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {coverageCheck?.isCovered ? (
          <div
            className="delivery-coverage-alert in-coverage"
            role="status"
            style={{ marginBottom: '20px' }}
          >
            <span className="coverage-alert-icon" aria-hidden="true">
              ✓
            </span>
            <div>
              <strong>Delivery Available!</strong>
              <p>
                Matched to <strong>{coverageCheck.nearestZoneLabel}</strong> (
                {coverageCheck.distanceKm} km away). Browse local verified menus below.
              </p>
            </div>
          </div>
        ) : null}

        {/* Interactive Google Map and Corridor Grid */}
        <div className="zones-map-layout-grid">
          {/* Map Column */}
          <div className="zones-map-column">
            <div className="google-map-wrapper">
              <div className="google-map-header">
                <span className="map-badge-label">
                  📍 {detectedCoords ? 'GPS Location Pin' : `Google Map: ${mapQuery}`}
                </span>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="open-in-google-maps-link"
                >
                  View on Google Maps ↗
                </a>
              </div>
              <iframe
                title="Kolkata Live Delivery Zones Map"
                src={googleMapUrl}
                className="google-map-iframe"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          {/* Corridors List Column */}
          <div className="zones-list-column">
            <div className="corridor-cards-vertical-list">
              {ZONE_CENTERS.map((zone) => {
                const isSelected = selectedZone === zone.id;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    className={isSelected ? 'corridor-card-v active' : 'corridor-card-v'}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setDetectedCoords(null);
                      setCoverageCheck(null);
                      onSelectZone(zone.id);
                    }}
                  >
                    <div className="corridor-card-top">
                      <div>
                        <strong>{zone.label}</strong>
                        <span className="corridor-bengali-title">{zone.bengaliName}</span>
                      </div>
                      <span className="corridor-badge-eta">{zone.avgEtaMinutes}</span>
                    </div>
                    <p className="corridor-areas-text">{zone.keyAreas}</p>
                    <div className="corridor-bottom-stats">
                      <span>🍳 {zone.verifiedKitchensCount} Verified Kitchens</span>
                      <span>Min Order ₹{zone.minOrderInr}</span>
                      {isSelected ? <span className="active-pill">Active Corridor</span> : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
