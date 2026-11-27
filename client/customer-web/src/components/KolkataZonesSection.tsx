import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  buildGoogleMapEmbedUrl,
  checkKolkataDeliveryCoverage,
  ZONE_CENTERS,
  type KolkataDeliveryCoverageCheck,
} from '../lib/apiClient';
import type { KolkataZoneId, LocationPermissionState } from '../types/domain';
import { resolveManualLocationFallback } from '../utils/deliveryGraph';

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
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [showManualFallback, setShowManualFallback] = useState(false);
  const [manualQuery, setManualQuery] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

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

  const applyCoordinatesEvaluation = useCallback(
    (
      lat: number,
      lng: number,
      localityLabel: string | undefined,
      permState: LocationPermissionState,
    ): void => {
      setDetectedCoords({ lat, lng });
      setLocationNotice(null);
      setManualError(null);
      const coverage = checkKolkataDeliveryCoverage(lat, lng, localityLabel);
      setCoverageCheck(coverage);
      if (coverage.isCovered) {
        onDetectGpsZone(coverage.nearestZoneId, permState, coverage.nearestZoneLabel);
      }
    },
    [onDetectGpsZone],
  );

  const handleDetectLocation = useCallback((): void => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setShowManualFallback(true);
      setLocationNotice(
        'Browser geolocation is unavailable on this device. Enter your Kolkata locality or 6-digit PIN code below.',
      );
      return;
    }

    setDetecting(true);
    setLocationNotice(null);
    setManualError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

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

        setDetecting(false);
        setShowManualFallback(false);
        applyCoordinatesEvaluation(lat, lng, localityName, 'granted');
      },
      (error) => {
        setDetecting(false);
        setShowManualFallback(true);
        const isDenied = error.code === error.PERMISSION_DENIED;
        setLocationNotice(
          isDenied
            ? 'Location permission was denied. Enter your Kolkata area or 6-digit PIN code below to evaluate 15 km delivery corridors.'
            : 'Unable to detect GPS coordinates right now. Use the manual area / PIN lookup below.',
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  }, [applyCoordinatesEvaluation]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) {
      return;
    }
    let cancelled = false;
    void navigator.permissions
      .query({ name: 'geolocation' })
      .then((status) => {
        if (cancelled) {
          return;
        }
        if (status.state === 'granted') {
          handleDetectLocation();
        } else if (status.state === 'denied') {
          setShowManualFallback(true);
          setLocationNotice(
            'Geolocation permission is blocked in browser settings. Enter a Kolkata locality or PIN code below.',
          );
        }
      })
      .catch(() => {
        // Ignore browsers without permissions.query support
      });
    return () => {
      cancelled = true;
    };
  }, [handleDetectLocation]);

  const handleManualFallbackSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const match = resolveManualLocationFallback(manualQuery);
    if (!match) {
      setManualError(
        'Enter a Kolkata locality (e.g. Karunamoyee, Gariahat, Hatibagan, Howrah) or 6-digit PIN code (e.g. 700091).',
      );
      return;
    }
    applyCoordinatesEvaluation(match.lat, match.lng, match.label, 'manual');
  };

  const routing = coverageCheck?.routing ?? null;

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
              📍 5 Verified Delivery Corridors • 15 km Optimal Graph Routing
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
              id="reDetectZonesLocationBtn"
              className="btn btn-primary"
              style={{ minHeight: '44px' }}
              onClick={handleDetectLocation}
              disabled={detecting}
            >
              {detecting
                ? 'Locating...'
                : routing
                  ? '🔄 Re-detect Location'
                  : '📍 Detect My Location'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ minHeight: '44px' }}
              onClick={() => setShowManualFallback((prev) => !prev)}
            >
              {showManualFallback ? 'Hide Area / PIN Input' : '✍️ Enter Area / PIN'}
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

        {/* Top Location Status Bar */}
        <div className="zones-location-status-bar" role="status" aria-live="polite">
          <div className="zones-status-meta">
            <span className="zones-status-pin" aria-hidden="true">
              {routing ? (routing.hasAnyCoverage ? '✅' : '⚠️') : '🧭'}
            </span>
            <div>
              <div className="zones-status-title">
                {routing ? (
                  <>
                    Location:{' '}
                    <strong>
                      {routing.detectedLocality
                        ? `${routing.detectedLocality} (${routing.userLat.toFixed(4)}°, ${routing.userLng.toFixed(4)}°)`
                        : `${routing.userLat.toFixed(4)}°, ${routing.userLng.toFixed(4)}°`}
                    </strong>
                  </>
                ) : (
                  'Detect your GPS location or enter a Kolkata PIN / area to rank corridors within 15 km'
                )}
              </div>
              {routing ? (
                <div className="zones-status-summary">
                  <strong>
                    Delivery Available in {routing.availableCorridorCount} of{' '}
                    {routing.totalCorridors} Corridors within {routing.maxRadiusKm} km
                  </strong>{' '}
                  • Nearest: {routing.nearestCorridor.label} ({routing.nearestCorridor.distanceKm}{' '}
                  km road path)
                </div>
              ) : locationNotice ? (
                <div className="zones-status-summary is-warning">{locationNotice}</div>
              ) : null}
            </div>
          </div>

          <div className="zones-status-actions">
            {routing ? (
              <span
                className={
                  routing.hasAnyCoverage ? 'zones-summary-pill in-range' : 'zones-summary-pill out'
                }
              >
                {routing.availableCorridorCount} / {routing.totalCorridors} Within 15 km
              </span>
            ) : null}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ minHeight: '38px' }}
              onClick={handleDetectLocation}
              disabled={detecting}
            >
              {detecting ? 'Locating...' : 'Re-detect Location'}
            </button>
          </div>
        </div>

        {/* Manual Address / PIN Code Fallback Bar */}
        {showManualFallback ? (
          <form className="zones-manual-fallback-bar" onSubmit={handleManualFallbackSubmit}>
            <label htmlFor="manualZoneLocationInput" className="visually-hidden">
              Enter Kolkata locality or 6-digit PIN code
            </label>
            <input
              id="manualZoneLocationInput"
              type="text"
              className="zones-manual-input"
              placeholder="Enter Kolkata locality or PIN code (e.g. Karunamoyee, 700019, Howrah, Eco Park)"
              value={manualQuery}
              onChange={(event) => {
                setManualQuery(event.target.value);
                if (manualError) {
                  setManualError(null);
                }
              }}
            />
            <button type="submit" className="btn btn-primary" style={{ minHeight: '42px' }}>
              Check 15 km Range
            </button>
            {manualError ? (
              <p className="zones-manual-error" role="alert">
                {manualError}
              </p>
            ) : null}
          </form>
        ) : null}

        {/* Coverage Result Notice when completely outside 15 km */}
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
                  Out of 15 km Delivery Range — No Corridors Reachable Yet
                </strong>
                <p className="coverage-alert-msg">
                  Shortest road distance to the nearest hub (
                  <strong>{coverageCheck.nearestZoneLabel}</strong>) is{' '}
                  <strong>{coverageCheck.distanceKm} km</strong>, which exceeds the 15 km delivery
                  limit.
                </p>
              </div>
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
                  📍 {detectedCoords ? 'Live Location Pin' : `Google Map: ${mapQuery}`}
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

          {/* Corridors List Column (Sorted dynamically by shortest graph path when location is known) */}
          <div className="zones-list-column">
            <div className="corridor-cards-vertical-list">
              {routing
                ? routing.corridors.map((corridor) => {
                    const isSelected = selectedZone === corridor.zoneId;
                    const cardClass = [
                      'corridor-card-v',
                      isSelected ? 'active' : '',
                      corridor.isNearest && corridor.isAvailable ? 'nearest-optimal' : '',
                      !corridor.isAvailable ? 'out-of-range' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const routePreview =
                      corridor.pathLabels.length > 2
                        ? corridor.pathLabels
                            .slice(1, Math.min(4, corridor.pathLabels.length))
                            .join(' → ')
                        : corridor.label;

                    return (
                      <button
                        key={corridor.zoneId}
                        type="button"
                        className={cardClass}
                        aria-pressed={isSelected}
                        onClick={() => onSelectZone(corridor.zoneId)}
                      >
                        <div className="corridor-card-top">
                          <div>
                            <strong>{corridor.label}</strong>
                            <span className="corridor-bengali-title">{corridor.bengaliName}</span>
                          </div>
                          <span
                            className={
                              corridor.isAvailable
                                ? 'corridor-badge-eta'
                                : 'corridor-badge-eta is-muted'
                            }
                          >
                            {corridor.estimatedEtaLabel}
                          </span>
                        </div>
                        <p className="corridor-areas-text">{corridor.keyAreas}</p>
                        <div className="corridor-route-meta">
                          <span>
                            🛣️ Optimal path: <strong>{corridor.distanceKm} km</strong> (via{' '}
                            {routePreview})
                          </span>
                          {corridor.reachableSubAreas.length > 0 ? (
                            <span>{corridor.reachableSubAreas.length} sub-areas within 15 km</span>
                          ) : null}
                        </div>
                        <div className="corridor-bottom-stats">
                          <span>🍳 {corridor.verifiedKitchensCount} Verified Kitchens</span>
                          <span>Min Order ₹{corridor.minOrderInr}</span>
                          {corridor.isAvailable ? (
                            <span className="active-pill">
                              Delivery Available
                              {corridor.isNearest ? ' • Nearest' : ''}
                            </span>
                          ) : (
                            <span className="out-of-range-pill">
                              Out of 15 km Delivery Range ({corridor.distanceKm} km)
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                : ZONE_CENTERS.map((zone) => {
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
