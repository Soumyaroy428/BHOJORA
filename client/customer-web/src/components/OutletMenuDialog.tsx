import { useEffect, useRef, useState } from 'react';
import {
  ALLERGEN_CODES,
  ALLERGEN_LABELS,
  formatInrFromPaise,
  type AllergenCode,
  type OutletCatalogDto,
} from '@bhojora/shared';
import { getFallbackCatalogForKitchen } from '../data/sampleCatalog';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';
import { apiRequest } from '../lib/apiClient';
import type { KitchenOutlet } from '../types/domain';
import { DietaryBadge } from './DietaryBadge';

interface OutletMenuDialogProps {
  kitchen: KitchenOutlet | null;
  onClose: () => void;
}

export function OutletMenuDialog({ kitchen, onClose }: OutletMenuDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useDialogLightDismiss(dialogRef);

  const [catalog, setCatalog] = useState<OutletCatalogDto | null>(null);
  const [sourceNote, setSourceNote] = useState<string>('');
  const [vegFilter, setVegFilter] = useState(false);
  const [excludeAllergens, setExcludeAllergens] = useState<AllergenCode[]>([]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (kitchen && !dialog.open) {
      dialog.showModal();
    } else if (!kitchen && dialog.open) {
      dialog.close();
    }
  }, [kitchen]);

  useEffect(() => {
    if (!kitchen) {
      return;
    }
    let cancelled = false;
    setVegFilter(false);
    setExcludeAllergens([]);

    const configuredApi =
      typeof window.BHOJORA_API_BASE === 'string'
        ? window.BHOJORA_API_BASE.trim()
        : (import.meta.env.VITE_API_BASE?.trim() ?? '');

    if (!configuredApi) {
      setCatalog(getFallbackCatalogForKitchen(kitchen.key, kitchen.fullName));
      setSourceNote('Verified Kolkata preview catalog (prices rendered from integer paise).');
      return;
    }

    setCatalog(getFallbackCatalogForKitchen(kitchen.key, kitchen.fullName));
    setSourceNote('Syncing live outlet menu...');

    void (async () => {
      try {
        const data = await apiRequest<{ catalog: OutletCatalogDto }>(
          `/outlets/${encodeURIComponent(kitchen.key)}/menu`,
        );
        if (!cancelled) {
          setCatalog(data.catalog);
          setSourceNote('Live outlet catalog verified by Bhojora API.');
        }
      } catch {
        if (!cancelled) {
          setCatalog(getFallbackCatalogForKitchen(kitchen.key, kitchen.fullName));
          setSourceNote('Showing offline sample menu (no live API record for preview outlet).');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [kitchen]);

  function toggleAllergenFilter(code: AllergenCode) {
    setExcludeAllergens((prev) =>
      prev.includes(code) ? prev.filter((entry) => entry !== code) : [...prev, code],
    );
  }

  const visibleItems = (catalog?.items ?? []).filter((item) => {
    if (vegFilter && item.dietaryType !== 'PURE_VEG') {
      return false;
    }
    if (excludeAllergens.length > 0 && item.allergens.some((a) => excludeAllergens.includes(a))) {
      return false;
    }
    return true;
  });

  return (
    <dialog
      ref={dialogRef}
      id="outletMenuModal"
      className="trust-dialog menu-dialog"
      closedby="any"
      aria-labelledby="menuModalTitle"
      onClose={onClose}
    >
      <div className="modal-header">
        <div>
          <h2 id="menuModalTitle" style={{ fontSize: '18px' }}>
            {kitchen?.fullName ?? 'Outlet Menu'} — Catalog &amp; Allergens
          </h2>
          <p className="menu-source-note">{sourceNote}</p>
        </div>
        <form method="dialog">
          <button type="submit" className="modal-close" aria-label="Close outlet menu dialog">
            &times;
          </button>
        </form>
      </div>

      <div
        className="menu-filter-bar"
        role="group"
        aria-label="Filter dishes by dietary type and allergen exclusions"
      >
        <button
          type="button"
          className={vegFilter ? 'chip active' : 'chip'}
          aria-pressed={vegFilter}
          onClick={() => setVegFilter((prev) => !prev)}
        >
          ● Pure Veg Only
        </button>
        {ALLERGEN_CODES.slice(0, 6).map((code) => {
          const active = excludeAllergens.includes(code);
          return (
            <button
              key={code}
              type="button"
              className={active ? 'chip active' : 'chip'}
              aria-pressed={active}
              onClick={() => toggleAllergenFilter(code)}
            >
              Hide {code.replace('_', ' ')}
            </button>
          );
        })}
      </div>

      <p
        className="filter-status"
        role="status"
        aria-live="polite"
        style={{ marginBottom: '12px' }}
      >
        Showing {visibleItems.length} of {catalog?.items.length ?? 0} dishes · Prices in INR (stored
        in paise)
      </p>

      <div className="menu-category-stack">
        {(catalog?.categories ?? []).map((category) => {
          const categoryItems = visibleItems.filter(
            (item) => item.categoryId === category.categoryId,
          );
          if (categoryItems.length === 0) {
            return null;
          }
          return (
            <section key={category.categoryId} aria-labelledby={`cat-h-${category.categoryId}`}>
              <h3 id={`cat-h-${category.categoryId}`} className="menu-category-title">
                {category.name}
              </h3>
              {category.description ? (
                <p className="menu-category-desc">{category.description}</p>
              ) : null}
              <ul className="menu-item-list">
                {categoryItems.map((item) => (
                  <li key={item.itemId} className="menu-item-card">
                    <div className="menu-item-top">
                      <div>
                        <DietaryBadge dietaryType={item.dietaryType} />
                        <h4 className="menu-item-title">{item.title}</h4>
                        <p className="menu-item-desc">{item.description}</p>
                      </div>
                      <div className="menu-price-col">
                        <strong className="menu-price-inr">
                          {formatInrFromPaise(item.pricePaise)}
                        </strong>
                        <span
                          className={`menu-avail-pill ${item.isAvailable ? 'is-open' : 'is-soldout'}`}
                        >
                          {item.isAvailable ? 'Available' : 'Sold Out'}
                        </span>
                      </div>
                    </div>

                    <div
                      className="menu-allergen-row"
                      aria-label={`Allergen declaration for ${item.title}`}
                    >
                      {item.allergens.length > 0 ? (
                        item.allergens.map((code) => (
                          <span key={code} className="allergen-pill">
                            ⚠ {ALLERGEN_LABELS[code]}
                          </span>
                        ))
                      ) : (
                        <span className="allergen-pill is-clear">
                          Confirmed No Major Allergens Declared
                        </span>
                      )}
                    </div>

                    {item.variants.length > 0 ? (
                      <div className="menu-custom-meta">
                        {item.variants.map((group) => (
                          <div key={group.groupId}>
                            <strong>{group.name}:</strong>{' '}
                            {group.options
                              .map((opt) =>
                                opt.priceDeltaPaise > 0
                                  ? `${opt.label} (+${formatInrFromPaise(opt.priceDeltaPaise)})`
                                  : opt.label,
                              )
                              .join(' · ')}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {item.addonGroups.length > 0 ? (
                      <div className="menu-custom-meta">
                        {item.addonGroups.map((group) => (
                          <div key={group.groupId}>
                            <strong>{group.name}:</strong>{' '}
                            {group.options
                              .map((opt) => `${opt.label} (+${formatInrFromPaise(opt.pricePaise)})`)
                              .join(' · ')}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </dialog>
  );
}
