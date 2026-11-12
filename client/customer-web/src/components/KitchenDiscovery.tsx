import { FormEvent, useRef, useState } from 'react';
import {
  CURATED_DISCOVERY_CATEGORIES,
  DISCOVERY_RANKING_DISCLOSURE,
  DISCOVERY_SORT_LABELS,
  DISCOVERY_SORT_OPTIONS,
  formatInrFromPaise,
  type CuratedDiscoveryCategoryDef,
  type DiscoveryDishMatchDto,
  type DiscoverySortOption,
  type ServiceabilityCheckResultDto,
} from '@bhojora/shared';
import { apiRequest } from '../lib/apiClient';
import type { KitchenOutlet } from '../types/domain';
import { DietaryBadge } from './DietaryBadge';

interface KitchenDiscoveryProps {
  kitchens: readonly KitchenOutlet[];
  totalMatchedCount: number;
  dishMatches: readonly DiscoveryDishMatchDto[];
  selectedZoneLabel: string;
  activeCategorySlug: string | null;
  verifiedOnly: boolean;
  vegOnly: boolean;
  openNowOnly: boolean;
  savedOnly: boolean;
  savedKitchenKeys: readonly string[];
  maxEtaMinutes: number | null;
  maxPricePaise: number | null;
  sortBy: DiscoverySortOption;
  viewMode: 'list' | 'map';
  hasMore: boolean;
  loadingLive: boolean;
  liveSourceNotice: string | null;
  onSelectCategory: (category: CuratedDiscoveryCategoryDef | null) => void;
  onToggleVerifiedOnly: () => void;
  onToggleVegOnly: () => void;
  onToggleOpenNowOnly: () => void;
  onToggleSavedOnly: () => void;
  onToggleSaveKitchen: (kitchenKey: string) => void;
  onChangeMaxEta: (maxEta: number | null) => void;
  onChangeMaxPrice: (maxPricePaise: number | null) => void;
  onChangeSortBy: (sort: DiscoverySortOption) => void;
  onChangeViewMode: (mode: 'list' | 'map') => void;
  onLoadMore: () => void;
  onOpenTrustProfile: (kitchen: KitchenOutlet) => void;
  onOpenMenu: (kitchen: KitchenOutlet) => void;
}

const SERVICEABILITY_PRESETS: ReadonlyArray<{ label: string; lng: string; lat: string }> = [
  { label: 'Salt Lake Sec V', lng: '88.4317', lat: '22.5806' },
  { label: 'Park Street', lng: '88.3526', lat: '22.5535' },
  { label: 'Ballygunge', lng: '88.3665', lat: '22.5262' },
];

const MAP_BOUNDS = {
  minLng: 88.33,
  maxLng: 88.49,
  minLat: 22.51,
  maxLat: 22.62,
} as const;

function projectKolkataPoint(coordinates: readonly [number, number]): { x: number; y: number } {
  const [lng, lat] = coordinates;
  const xRatio = (lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng);
  const yRatio = (MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat);
  return {
    x: Math.max(8, Math.min(92, xRatio * 100)),
    y: Math.max(12, Math.min(88, yRatio * 100)),
  };
}

export function KitchenDiscovery({
  kitchens,
  totalMatchedCount,
  dishMatches,
  selectedZoneLabel,
  activeCategorySlug,
  verifiedOnly,
  vegOnly,
  openNowOnly,
  savedOnly,
  savedKitchenKeys,
  maxEtaMinutes,
  maxPricePaise,
  sortBy,
  viewMode,
  hasMore,
  loadingLive,
  liveSourceNotice,
  onSelectCategory,
  onToggleVerifiedOnly,
  onToggleVegOnly,
  onToggleOpenNowOnly,
  onToggleSavedOnly,
  onToggleSaveKitchen,
  onChangeMaxEta,
  onChangeMaxPrice,
  onChangeSortBy,
  onChangeViewMode,
  onLoadMore,
  onOpenTrustProfile,
  onOpenMenu,
}: KitchenDiscoveryProps) {
  const [checkLng, setCheckLng] = useState('88.4317');
  const [checkLat, setCheckLat] = useState('22.5806');
  const [coordTouched, setCoordTouched] = useState(false);
  const [coordError, setCoordError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [serviceabilityMessage, setServiceabilityMessage] = useState<string | null>(null);
  const [focusedMapKey, setFocusedMapKey] = useState<string | null>(null);
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

  const scopeLabel = verifiedOnly ? 'verified' : 'listed';
  const statusText = loadingLive
    ? `Searching kitchens in ${selectedZoneLabel}...`
    : kitchens.length === 0
      ? 'No kitchens match your current filters. Try choosing All Kolkata, relaxing ETA/price caps, or turning Verified Only off to inspect newly onboarded kitchens.'
      : `Showing ${kitchens.length} of ${totalMatchedCount} ${scopeLabel} kitchen${totalMatchedCount === 1 ? '' : 's'} in ${selectedZoneLabel}`;

  const selectedMapKitchen =
    kitchens.find((item) => item.key === focusedMapKey) ?? kitchens[0] ?? null;

  return (
    <section id="discover" className="container">
      <div className="section-header">
        <div>
          <h2 className="section-title">Discover Kitchens &amp; Dishes in Kolkata</h2>
          <p className="section-desc">
            Transparent audit status per kitchen: Verified Clean badges show inspection scores &amp;
            dates, while newly onboarded kitchens clearly state Not Yet Inspected.
          </p>
        </div>

        <div className="view-toggle-group" role="group" aria-label="Choose discovery layout view">
          <button
            type="button"
            id="viewListBtn"
            className={viewMode === 'list' ? 'chip active' : 'chip'}
            aria-pressed={viewMode === 'list'}
            onClick={() => onChangeViewMode('list')}
          >
            List View
          </button>
          <button
            type="button"
            id="viewMapBtn"
            className={viewMode === 'map' ? 'chip active' : 'chip'}
            aria-pressed={viewMode === 'map'}
            onClick={() => onChangeViewMode('map')}
          >
            Kolkata Map View
          </button>
        </div>
      </div>

      <div
        className="curated-categories-row"
        role="group"
        aria-label="Curated cuisine and trust discovery collections"
      >
        <button
          type="button"
          className={activeCategorySlug === null ? 'chip active' : 'chip'}
          aria-pressed={activeCategorySlug === null}
          onClick={() => onSelectCategory(null)}
        >
          All Collections
        </button>
        {CURATED_DISCOVERY_CATEGORIES.map((category) => {
          const isActive = activeCategorySlug === category.slug;
          return (
            <button
              key={category.slug}
              type="button"
              className={isActive ? 'chip active' : 'chip'}
              aria-pressed={isActive}
              onClick={() => onSelectCategory(isActive ? null : category)}
            >
              {category.label}
            </button>
          );
        })}
      </div>

      <div className="discovery-toolbar">
        <div
          className="filter-actions-group"
          role="group"
          aria-label="Kitchen safety and dietary filters"
        >
          <button
            type="button"
            id="scoreFilterBtn"
            className={verifiedOnly ? 'chip active' : 'chip'}
            aria-pressed={verifiedOnly}
            onClick={onToggleVerifiedOnly}
          >
            🛡️ Verified Clean Only
          </button>
          <button
            type="button"
            id="vegFilterBtn"
            className={vegOnly ? 'chip active' : 'chip'}
            aria-pressed={vegOnly}
            onClick={onToggleVegOnly}
          >
            🟢 Pure Veg
          </button>
          <button
            type="button"
            id="openNowFilterBtn"
            className={openNowOnly ? 'chip active' : 'chip'}
            aria-pressed={openNowOnly}
            onClick={onToggleOpenNowOnly}
          >
            Open Now (IST)
          </button>
          <button
            type="button"
            id="savedFilterBtn"
            className={savedOnly ? 'chip active' : 'chip'}
            aria-pressed={savedOnly}
            onClick={onToggleSavedOnly}
          >
            Saved ({savedKitchenKeys.length})
          </button>
        </div>

        <div className="discovery-selects-row">
          <div className="discovery-select-field">
            <label htmlFor="maxEtaSelect">Delivery ETA</label>
            <select
              id="maxEtaSelect"
              className="discovery-select"
              value={maxEtaMinutes ?? ''}
              onChange={(e) => onChangeMaxEta(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Any ETA</option>
              <option value="25">Under 25 mins</option>
              <option value="35">Under 35 mins</option>
              <option value="45">Under 45 mins</option>
            </select>
          </div>

          <div className="discovery-select-field">
            <label htmlFor="maxPriceSelect">Starting Price</label>
            <select
              id="maxPriceSelect"
              className="discovery-select"
              value={maxPricePaise ?? ''}
              onChange={(e) => onChangeMaxPrice(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Any Price</option>
              <option value="25000">Up to ₹250</option>
              <option value="35000">Up to ₹350</option>
              <option value="50000">Up to ₹500</option>
            </select>
          </div>

          <div className="discovery-select-field">
            <label htmlFor="discoverySortSelect">Sort By</label>
            <select
              id="discoverySortSelect"
              className="discovery-select"
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value as DiscoverySortOption)}
            >
              {DISCOVERY_SORT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {DISCOVERY_SORT_LABELS[option]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <p className="ranking-disclosure-banner">
        <strong>Transparency Policy:</strong> {DISCOVERY_RANKING_DISCLOSURE} Verified filter
        includes only kitchens with an active physical hygiene inspection score; uninspected and
        expired outlets are explicitly labeled when shown.
      </p>

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
                color: 'var(--terracotta-dark)',
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
        {liveSourceNotice ? ` · ${liveSourceNotice}` : ''}
      </p>

      {dishMatches.length > 0 ? (
        <div className="dish-matches-panel" aria-labelledby="dishMatchesHeading">
          <h3 id="dishMatchesHeading" className="dish-matches-heading">
            Matching Dishes &amp; Declared Allergens
          </h3>
          <ul className="dish-match-grid">
            {dishMatches.slice(0, 4).map((dish) => {
              const parentKitchen = kitchens.find((k) => k.key === dish.outletId);
              return (
                <li key={`${dish.outletId}-${dish.itemId}`} className="dish-match-card">
                  <div className="dish-match-top">
                    <DietaryBadge dietaryType={dish.dietaryType} />
                    <span className="dish-match-price">{dish.formattedPriceInr}</span>
                  </div>
                  <div className="dish-match-title">{dish.title}</div>
                  <div className="dish-match-meta">
                    {dish.brandName} ({dish.outletName}) ·{' '}
                    {dish.outletVerifiedClean && dish.outletSafetyScore !== null
                      ? `Verified ${dish.outletSafetyScore}/100`
                      : 'Not Yet Inspected'}
                  </div>
                  <div className="dish-match-allergens">
                    {dish.allergenLabels.length > 0
                      ? dish.allergenLabels.join(', ')
                      : 'No major allergens declared'}
                  </div>
                  {parentKitchen ? (
                    <button
                      type="button"
                      className="btn btn-outline dish-match-btn"
                      onClick={() => onOpenMenu(parentKitchen)}
                    >
                      Inspect Full Menu
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {viewMode === 'map' && kitchens.length > 0 ? (
        <div className="corridor-map-panel" id="kolkataMapCorridor">
          <div className="corridor-map-canvas" role="region" aria-label="Kolkata kitchen pin plot">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="corridor-map-svg"
              aria-hidden="true"
            >
              <path
                d="M 14 5 C 16 32, 12 65, 9 95"
                fill="none"
                stroke="#c9bcae"
                strokeWidth="2.5"
                strokeDasharray="2 2"
              />
              <text x="16" y="14" fontSize="3.2" fill="#635b55">
                Hooghly River
              </text>
              <text x="64" y="34" fontSize="3.2" fill="#635b55">
                Salt Lake / Sec V
              </text>
              <text x="20" y="60" fontSize="3.2" fill="#635b55">
                Park St / Bhowanipore
              </text>
            </svg>
            {kitchens.map((kitchen) => {
              const point = projectKolkataPoint(kitchen.coordinates);
              const isSelected = selectedMapKitchen?.key === kitchen.key;
              return (
                <button
                  key={kitchen.key}
                  type="button"
                  className={
                    isSelected
                      ? 'map-pin-btn is-selected'
                      : kitchen.isVerified
                        ? 'map-pin-btn'
                        : 'map-pin-btn is-unverified'
                  }
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  aria-pressed={isSelected}
                  onClick={() => setFocusedMapKey(kitchen.key)}
                >
                  <span>{kitchen.name}</span>
                  <strong>
                    {kitchen.isVerified && kitchen.score !== null
                      ? `${kitchen.score}`
                      : 'Uninspected'}
                  </strong>
                </button>
              );
            })}
          </div>

          {selectedMapKitchen ? (
            <div className="corridor-selected-card">
              <div className="card-title-row">
                <h3>{selectedMapKitchen.fullName}</h3>
                <span
                  className={
                    selectedMapKitchen.isVerified
                      ? 'badge-inline-verified'
                      : 'badge-inline-unverified'
                  }
                >
                  {selectedMapKitchen.isVerified && selectedMapKitchen.score !== null
                    ? `Verified Clean • ${selectedMapKitchen.score}/100`
                    : 'Not Yet Inspected'}
                </span>
              </div>
              <p className="card-cuisine">
                {selectedMapKitchen.locality} · {selectedMapKitchen.etaMinutes} · From{' '}
                {formatInrFromPaise(selectedMapKitchen.minPricePaise)} · Coordinates{' '}
                {selectedMapKitchen.coordinates[0].toFixed(4)},{' '}
                {selectedMapKitchen.coordinates[1].toFixed(4)}
              </p>
              <div className="filter-actions-group">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => onOpenTrustProfile(selectedMapKitchen)}
                >
                  Inspect Audit Details
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onOpenMenu(selectedMapKitchen)}
                >
                  View Menu &amp; Allergens
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid-cards" id="kitchenGrid">
        {kitchens.map((kitchen) => {
          const isSaved = savedKitchenKeys.includes(kitchen.key);
          return (
            <article key={kitchen.key} className="card">
              <div className="card-media" style={{ backgroundImage: `url('${kitchen.imageUrl}')` }}>
                <button
                  type="button"
                  className={kitchen.isVerified ? 'trust-pill' : 'trust-pill is-unverified'}
                  aria-label={
                    kitchen.isVerified && kitchen.score !== null
                      ? `View ${kitchen.fullName} trust safety report, verified score ${kitchen.score} out of 100`
                      : `View ${kitchen.fullName} verification status report, not yet inspected by Bhojora`
                  }
                  onClick={() => onOpenTrustProfile(kitchen)}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                  </svg>
                  <span>
                    {kitchen.isVerified && kitchen.score !== null
                      ? `VERIFIED • ${kitchen.score}/100`
                      : 'NOT INSPECTED'}
                  </span>
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
                    {kitchen.locality} • {kitchen.etaMinutes} • From{' '}
                    {formatInrFromPaise(kitchen.minPricePaise)}
                  </span>
                  <span className="audit-status">
                    {kitchen.isVerified
                      ? `🛡️ Audited ${kitchen.auditedMonth}`
                      : '⏳ FSSAI On File · Physical Audit Pending'}
                  </span>
                </div>
                <div className="card-actions-row">
                  <button
                    type="button"
                    className="btn btn-outline card-menu-btn"
                    onClick={() => onOpenMenu(kitchen)}
                  >
                    View Menu &amp; Allergens
                  </button>
                  <button
                    type="button"
                    className={
                      isSaved ? 'btn btn-primary card-save-btn' : 'btn btn-outline card-save-btn'
                    }
                    aria-pressed={isSaved}
                    aria-label={
                      isSaved ? `Remove ${kitchen.name} from saved` : `Save ${kitchen.name}`
                    }
                    onClick={() => onToggleSaveKitchen(kitchen.key)}
                  >
                    {isSaved ? 'Saved ★' : 'Save ☆'}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {hasMore ? (
        <div className="load-more-row">
          <button
            type="button"
            id="loadMoreKitchensBtn"
            className="btn btn-outline"
            onClick={onLoadMore}
          >
            Load More Kitchens ({totalMatchedCount - kitchens.length} remaining)
          </button>
        </div>
      ) : null}
    </section>
  );
}
