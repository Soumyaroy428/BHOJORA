import { FormEvent, useRef, useState } from 'react';
import type { ServiceabilityCheckResultDto } from '@bhojora/shared';
import { apiRequest } from '../lib/apiClient';
import type { KitchenOutlet } from '../types/domain';

interface KitchenDiscoveryProps {
  kitchens: readonly KitchenOutlet[];
  selectedZoneLabel: string;
  minScoreOnly: boolean;
  vegOnly: boolean;
  onToggleMinScore: () => void;
  onToggleVegOnly: () => void;
  onOpenTrustProfile: (kitchen: KitchenOutlet) => void;
  onOpenMenu: (kitchen: KitchenOutlet) => void;
}

const SERVICEABILITY_PRESETS: ReadonlyArray<{ label: string; lng: string; lat: string }> = [
  { label: 'Salt Lake Sec V', lng: '88.4317', lat: '22.5806' },
  { label: 'Park Street', lng: '88.3526', lat: '22.5535' },
  { label: 'Ballygunge', lng: '88.3665', lat: '22.5262' },
];

export function KitchenDiscovery({
  kitchens,
  selectedZoneLabel,
  minScoreOnly,
  vegOnly,
  onToggleMinScore,
  onToggleVegOnly,
  onOpenTrustProfile,
  onOpenMenu,
}: KitchenDiscoveryProps) {
  const [checkLng, setCheckLng] = useState('88.4317');
  const [checkLat, setCheckLat] = useState('22.5806');
  const [coordTouched, setCoordTouched] = useState(false);
  const [coordError, setCoordError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [serviceabilityMessage, setServiceabilityMessage] = useState<string | null>(null);
  const lngInputRef = useRef<HTMLInputElement | null>(null);

  const validateCoords = (lngRaw: string, latRaw: string): string | null => {
    const lng = Number(lngRaw);
    const lat = Number(latRaw);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      return 'Error: Enter finite GeoJSON [longitude, latitude] coordinates (e.g. 88.4317, 22.5806).';
    }
    if (lng >= 18 && lng <= 27 && lat >= 85 && lat <= 91) {
      return 'Error: GeoJSON requires [longitude, latitude] — swap the coordinates before checking.';
    }
    if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
      return 'Error: Coordinates are out of WGS-84 bounds (longitude ±180, latitude ±90).';
    }
    return null;
  };

  const handleServiceabilitySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCoordTouched(true);
    const err = validateCoords(checkLng, checkLat);
    if (err) {
      setCoordError(err);
      lngInputRef.current?.focus();
      return;
    }
    setCoordError(null);
    setChecking(true);
    try {
      const data = await apiRequest<{ serviceability: ServiceabilityCheckResultDto }>(
        `/serviceability?lng=${encodeURIComponent(checkLng.trim())}&lat=${encodeURIComponent(checkLat.trim())}`,
      );
      const result = data.serviceability;
      setServiceabilityMessage(
        `${result.reason} (${result.evaluatedAtIst})${
          result.matchedZone
            ? ` · Fee ₹${(result.matchedZone.deliveryFeePaise / 100).toFixed(0)} · Min ₹${(result.matchedZone.minOrderPaise / 100).toFixed(0)}`
            : ''
        }`,
      );
    } catch (error) {
      setServiceabilityMessage(
        error instanceof Error
          ? error.message
          : 'Live serviceability check requires connected Bhojora API.',
      );
    } finally {
      setChecking(false);
    }
  };

  const statusText =
    kitchens.length === 0
      ? 'No verified kitchens match your current filters. Try choosing All Kolkata or clearing the search box.'
      : `Showing ${kitchens.length} verified kitchen${kitchens.length === 1 ? '' : 's'} in ${selectedZoneLabel}`;

  return (
    <section id="discover" className="container">
      <div className="section-header">
        <div>
          <h2 className="section-title">Verified Kitchens in Kolkata</h2>
          <p className="section-desc">
            Audited on-site by independent hygiene inspectors with verifiable cryptographic photo
            proof.
          </p>
        </div>
        <div className="filter-actions-group">
          <button
            type="button"
            id="scoreFilterBtn"
            className={minScoreOnly ? 'chip active' : 'chip'}
            style={{ fontSize: '11px' }}
            aria-pressed={minScoreOnly}
            onClick={onToggleMinScore}
          >
            🛡️ Score ≥ 90
          </button>
          <button
            type="button"
            id="vegFilterBtn"
            className={vegOnly ? 'chip active' : 'chip'}
            style={{ fontSize: '11px' }}
            aria-pressed={vegOnly}
            onClick={onToggleVegOnly}
          >
            🟢 Pure Veg
          </button>
        </div>
      </div>

      <form
        aria-labelledby="serviceability-check-heading"
        className="card"
        style={{ padding: '14px 16px', marginBottom: '18px' }}
        onSubmit={(event) => void handleServiceabilitySubmit(event)}
      >
        <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
          <legend
            id="serviceability-check-heading"
            style={{ fontWeight: 700, fontSize: '14px', marginBottom: '6px' }}
          >
            Kolkata Delivery Zone &amp; Live IST Serviceability Check
          </legend>
          <div className="filter-actions-group" style={{ alignItems: 'flex-end', gap: '10px' }}>
            {SERVICEABILITY_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="chip"
                onClick={() => {
                  setCheckLng(preset.lng);
                  setCheckLat(preset.lat);
                  setCoordError(null);
                }}
              >
                {preset.label}
              </button>
            ))}
            <div>
              <label htmlFor="customerCheckLng" style={{ display: 'block', fontSize: '12px' }}>
                Longitude
              </label>
              <input
                ref={lngInputRef}
                id="customerCheckLng"
                name="lng"
                type="text"
                inputMode="decimal"
                required
                className="auth-input"
                aria-invalid={coordTouched && coordError ? 'true' : 'false'}
                aria-describedby={
                  coordTouched && coordError ? 'serviceability-coord-error' : undefined
                }
                value={checkLng}
                onChange={(e) => {
                  setCheckLng(e.target.value);
                  if (coordError && !validateCoords(e.target.value, checkLat)) {
                    setCoordError(null);
                  }
                }}
                onBlur={() => {
                  setCoordTouched(true);
                  setCoordError(validateCoords(checkLng, checkLat));
                }}
                style={{ width: '132px' }}
              />
            </div>
            <div>
              <label htmlFor="customerCheckLat" style={{ display: 'block', fontSize: '12px' }}>
                Latitude
              </label>
              <input
                id="customerCheckLat"
                name="lat"
                type="text"
                inputMode="decimal"
                required
                className="auth-input"
                aria-invalid={coordTouched && coordError ? 'true' : 'false'}
                aria-describedby={
                  coordTouched && coordError ? 'serviceability-coord-error' : undefined
                }
                value={checkLat}
                onChange={(e) => {
                  setCheckLat(e.target.value);
                  if (coordError && !validateCoords(checkLng, e.target.value)) {
                    setCoordError(null);
                  }
                }}
                onBlur={() => {
                  setCoordTouched(true);
                  setCoordError(validateCoords(checkLng, checkLat));
                }}
                style={{ width: '132px' }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={checking}>
              {checking ? 'Checking...' : 'Check Serviceability'}
            </button>
          </div>
          {coordTouched && coordError ? (
            <p
              id="serviceability-coord-error"
              style={{
                color: 'var(--terracotta-700, #8d352a)',
                fontSize: '13px',
                marginTop: '8px',
              }}
            >
              {coordError}
            </p>
          ) : null}
          {serviceabilityMessage ? (
            <p
              className="filter-status"
              role="status"
              aria-live="polite"
              style={{ marginTop: '8px', marginBottom: 0 }}
            >
              {serviceabilityMessage}
            </p>
          ) : null}
        </fieldset>
      </form>

      <p id="filterStatus" className="filter-status" aria-live="polite">
        {statusText}
      </p>

      <div className="grid-cards" id="kitchenGrid">
        {kitchens.map((kitchen) => (
          <article key={kitchen.key} className="card">
            <div className="card-media" style={{ backgroundImage: `url('${kitchen.imageUrl}')` }}>
              <button
                type="button"
                className="trust-pill"
                aria-label={`View ${kitchen.fullName} trust safety report, verified score ${kitchen.score} out of 100`}
                onClick={() => onOpenTrustProfile(kitchen)}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                </svg>
                <span>VERIFIED • {kitchen.score}/100</span>
              </button>
            </div>
            <div className="card-body">
              <div className="card-title-row">
                <h3 className="card-title">{kitchen.name}</h3>
                <span className="card-rating">
                  ★ {kitchen.rating} ({kitchen.reviewCount})
                </span>
              </div>
              <p className="card-cuisine">{kitchen.cuisines}</p>
              <div className="card-footer">
                <span>
                  {kitchen.locality} • {kitchen.etaMinutes}
                </span>
                <span className="audit-status">🛡️ Audited {kitchen.auditedMonth}</span>
              </div>
              <div className="card-actions-row">
                <button
                  type="button"
                  className="btn btn-outline card-menu-btn"
                  onClick={() => onOpenMenu(kitchen)}
                >
                  View Menu &amp; Allergens
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
