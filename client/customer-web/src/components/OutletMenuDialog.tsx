import { useEffect, useRef, useState } from 'react';
import {
  ALLERGEN_CODES,
  ALLERGEN_LABELS,
  formatInrFromPaise,
  type AllergenCode,
  type CartAddonSelectionDto,
  type CartVariantSelectionDto,
  type MenuItemDto,
  type OutletCatalogDto,
} from '@bhojora/shared';
import { getFallbackCatalogForKitchen } from '../data/sampleCatalog';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';
import { apiRequest } from '../lib/apiClient';
import { computeEffectiveItemUnitPaise, getInitialItemSelections } from '../lib/cartHelpers';
import type { KitchenOutlet } from '../types/domain';
import { DietaryBadge } from './DietaryBadge';

interface OutletMenuDialogProps {
  kitchen: KitchenOutlet | null;
  activeCartCount: number;
  activeCartOutletName: string | null;
  activeCartOutletId: string | null;
  onAddToCart: (params: {
    kitchen: KitchenOutlet;
    item: MenuItemDto;
    selectedVariants: CartVariantSelectionDto[];
    selectedAddons: CartAddonSelectionDto[];
    replaceOutlet: boolean;
  }) => Promise<'ADDED' | 'CONFLICT'> | 'ADDED' | 'CONFLICT';
  onOpenCart: () => void;
  onClose: () => void;
}

export function OutletMenuDialog({
  kitchen,
  activeCartCount,
  activeCartOutletName,
  onAddToCart,
  onOpenCart,
  onClose,
}: OutletMenuDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useDialogLightDismiss(dialogRef);

  const [catalog, setCatalog] = useState<OutletCatalogDto | null>(null);
  const [sourceNote, setSourceNote] = useState<string>('');
  const [vegFilter, setVegFilter] = useState(false);
  const [excludeAllergens, setExcludeAllergens] = useState<AllergenCode[]>([]);
  const [variantSelections, setVariantSelections] = useState<
    Record<string, CartVariantSelectionDto[]>
  >({});
  const [addonSelections, setAddonSelections] = useState<Record<string, CartAddonSelectionDto[]>>(
    {},
  );
  const [addingItemId, setAddingItemId] = useState<string | null>(null);
  const [addedItemId, setAddedItemId] = useState<string | null>(null);
  const [cartActionError, setCartActionError] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<{
    item: MenuItemDto;
    variants: CartVariantSelectionDto[];
    addons: CartAddonSelectionDto[];
  } | null>(null);

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
    setVariantSelections({});
    setAddonSelections({});
    setAddingItemId(null);
    setAddedItemId(null);
    setCartActionError(null);
    setPendingConflict(null);

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

      {cartActionError ? (
        <div className="cart-error-banner" role="alert" style={{ marginBottom: '12px' }}>
          {cartActionError}
        </div>
      ) : null}

      {pendingConflict && kitchen ? (
        <div className="menu-conflict-banner" role="alert">
          <div style={{ fontWeight: 700, fontSize: '14px' }}>
            Single-Outlet Cart Active ({activeCartOutletName ?? 'Another Kitchen'})
          </div>
          <p style={{ marginTop: '4px', fontSize: '13px' }}>
            Your cart currently has items from{' '}
            <strong>{activeCartOutletName ?? 'another outlet'}</strong>. Replace your cart to add{' '}
            <strong>{pendingConflict.item.title}</strong> from <strong>{kitchen.name}</strong>?
          </p>
          <div className="menu-conflict-actions">
            <button
              type="button"
              id="replaceCartConfirmBtn"
              className="btn btn-primary"
              style={{ minHeight: '44px' }}
              onClick={() => {
                const target = pendingConflict;
                setPendingConflict(null);
                setCartActionError(null);
                setAddingItemId(target.item.itemId);
                void Promise.resolve(
                  onAddToCart({
                    kitchen,
                    item: target.item,
                    selectedVariants: target.variants,
                    selectedAddons: target.addons,
                    replaceOutlet: true,
                  }),
                )
                  .then(() => {
                    setAddedItemId(target.item.itemId);
                  })
                  .catch((err) => {
                    setCartActionError(
                      err instanceof Error ? err.message : 'Unable to replace cart item.',
                    );
                  })
                  .finally(() => {
                    setAddingItemId(null);
                  });
              }}
            >
              Replace Cart &amp; Add
            </button>
            <button
              type="button"
              id="keepCurrentCartBtn"
              className="btn btn-outline"
              style={{ minHeight: '44px' }}
              onClick={() => setPendingConflict(null)}
            >
              Keep Current Cart
            </button>
          </div>
        </div>
      ) : null}

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
                {categoryItems.map((item) => {
                  const chosenVariants =
                    variantSelections[item.itemId] ?? getInitialItemSelections(item).variants;
                  const chosenAddons = addonSelections[item.itemId] ?? [];
                  const effectiveUnitPaise = computeEffectiveItemUnitPaise(
                    item,
                    chosenVariants,
                    chosenAddons,
                  );
                  const isSuspended = kitchen?.platformInspectionStatus === 'SUSPENDED';

                  return (
                    <li key={item.itemId} className="menu-item-card">
                      <div className="menu-item-top">
                        <div>
                          <DietaryBadge dietaryType={item.dietaryType} />
                          <h4 className="menu-item-title">{item.title}</h4>
                          <p className="menu-item-desc">{item.description}</p>
                        </div>
                        <div className="menu-price-col">
                          <strong className="menu-price-inr">
                            {formatInrFromPaise(effectiveUnitPaise)}
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

                      {item.variants.length > 0 || item.addonGroups.length > 0 ? (
                        <div className="menu-options-block">
                          {item.variants.map((group) => (
                            <div
                              key={group.groupId}
                              className="menu-option-group"
                              role="radiogroup"
                              aria-label={`${item.title} ${group.name}`}
                            >
                              <span className="menu-option-label">{group.name}</span>
                              <div className="menu-option-chips">
                                {group.options.map((opt) => {
                                  const selected = chosenVariants.some(
                                    (v) =>
                                      v.groupId === group.groupId && v.optionId === opt.optionId,
                                  );
                                  return (
                                    <button
                                      key={opt.optionId}
                                      type="button"
                                      role="radio"
                                      aria-checked={selected}
                                      disabled={!opt.isAvailable}
                                      className={
                                        selected
                                          ? 'menu-option-chip is-selected'
                                          : 'menu-option-chip'
                                      }
                                      onClick={() => {
                                        setVariantSelections((prev) => {
                                          const currentList =
                                            prev[item.itemId] ??
                                            getInitialItemSelections(item).variants;
                                          const withoutGroup = currentList.filter(
                                            (v) => v.groupId !== group.groupId,
                                          );
                                          return {
                                            ...prev,
                                            [item.itemId]: [
                                              ...withoutGroup,
                                              {
                                                groupId: group.groupId,
                                                optionId: opt.optionId,
                                                label: opt.label,
                                                priceDeltaPaise: opt.priceDeltaPaise,
                                              },
                                            ],
                                          };
                                        });
                                      }}
                                    >
                                      {opt.priceDeltaPaise > 0
                                        ? `${opt.label} (+${formatInrFromPaise(opt.priceDeltaPaise)})`
                                        : opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}

                          {item.addonGroups.map((group) => (
                            <div
                              key={group.groupId}
                              className="menu-option-group"
                              role="group"
                              aria-label={`${item.title} ${group.name}`}
                            >
                              <span className="menu-option-label">
                                {group.name} (Up to {group.maxSelections})
                              </span>
                              <div className="menu-option-chips">
                                {group.options.map((opt) => {
                                  const selected = chosenAddons.some(
                                    (a) =>
                                      a.groupId === group.groupId && a.optionId === opt.optionId,
                                  );
                                  return (
                                    <button
                                      key={opt.optionId}
                                      type="button"
                                      role="checkbox"
                                      aria-checked={selected}
                                      disabled={!opt.isAvailable}
                                      className={
                                        selected
                                          ? 'menu-option-chip is-selected'
                                          : 'menu-option-chip'
                                      }
                                      onClick={() => {
                                        setAddonSelections((prev) => {
                                          const currentList = prev[item.itemId] ?? [];
                                          if (selected) {
                                            return {
                                              ...prev,
                                              [item.itemId]: currentList.filter(
                                                (a) =>
                                                  !(
                                                    a.groupId === group.groupId &&
                                                    a.optionId === opt.optionId
                                                  ),
                                              ),
                                            };
                                          }
                                          const inGroup = currentList.filter(
                                            (a) => a.groupId === group.groupId,
                                          );
                                          if (inGroup.length >= group.maxSelections) {
                                            return prev;
                                          }
                                          return {
                                            ...prev,
                                            [item.itemId]: [
                                              ...currentList,
                                              {
                                                groupId: group.groupId,
                                                optionId: opt.optionId,
                                                label: opt.label,
                                                pricePaise: opt.pricePaise,
                                              },
                                            ],
                                          };
                                        });
                                      }}
                                    >
                                      + {opt.label} (+{formatInrFromPaise(opt.pricePaise)})
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="menu-add-row">
                        <span style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
                          GST Slab:{' '}
                          {item.gstTaxSlab === 'BAKERY_18_PCT'
                            ? '18%'
                            : item.gstTaxSlab === 'EXEMPT_0_PCT'
                              ? '0%'
                              : '5%'}{' '}
                          · Unit {formatInrFromPaise(effectiveUnitPaise)}
                        </span>
                        <button
                          type="button"
                          id={`addToCartBtn-${item.itemId}`}
                          className="btn btn-primary"
                          style={{ minHeight: '44px' }}
                          disabled={
                            !item.isAvailable || isSuspended || addingItemId === item.itemId
                          }
                          onClick={() => {
                            if (!kitchen) {
                              return;
                            }
                            setCartActionError(null);
                            setAddingItemId(item.itemId);
                            void Promise.resolve(
                              onAddToCart({
                                kitchen,
                                item,
                                selectedVariants: chosenVariants,
                                selectedAddons: chosenAddons,
                                replaceOutlet: false,
                              }),
                            )
                              .then((outcome) => {
                                if (outcome === 'CONFLICT') {
                                  setPendingConflict({
                                    item,
                                    variants: chosenVariants,
                                    addons: chosenAddons,
                                  });
                                } else {
                                  setAddedItemId(item.itemId);
                                }
                              })
                              .catch((err) => {
                                setCartActionError(
                                  err instanceof Error
                                    ? err.message
                                    : 'Unable to add item to cart.',
                                );
                              })
                              .finally(() => {
                                setAddingItemId(null);
                              });
                          }}
                        >
                          {isSuspended
                            ? 'Outlet Suspended'
                            : !item.isAvailable
                              ? 'Sold Out'
                              : addingItemId === item.itemId
                                ? 'Adding…'
                                : addedItemId === item.itemId
                                  ? 'Added! (+ Add Again)'
                                  : `Add to Cart · ${formatInrFromPaise(effectiveUnitPaise)}`}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {activeCartCount > 0 ? (
        <div className="menu-cart-bar">
          <div>
            <strong style={{ fontSize: '14px', color: 'var(--neutral-950)' }}>
              {activeCartCount} item(s) in cart
            </strong>
            {activeCartOutletName ? (
              <div style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
                Active kitchen: {activeCartOutletName}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            id="menuViewCartBtn"
            className="btn btn-primary"
            style={{ minHeight: '44px' }}
            onClick={onOpenCart}
          >
            View Cart ({activeCartCount})
          </button>
        </div>
      ) : null}
    </dialog>
  );
}
