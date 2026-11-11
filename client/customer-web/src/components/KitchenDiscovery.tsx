import type { KitchenOutlet } from '../types/domain';

interface KitchenDiscoveryProps {
  kitchens: readonly KitchenOutlet[];
  selectedZoneLabel: string;
  minScoreOnly: boolean;
  vegOnly: boolean;
  onToggleMinScore: () => void;
  onToggleVegOnly: () => void;
  onOpenTrustProfile: (kitchen: KitchenOutlet) => void;
}

export function KitchenDiscovery({
  kitchens,
  selectedZoneLabel,
  minScoreOnly,
  vegOnly,
  onToggleMinScore,
  onToggleVegOnly,
  onOpenTrustProfile,
}: KitchenDiscoveryProps) {
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
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
