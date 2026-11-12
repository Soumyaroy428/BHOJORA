import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  ALLERGEN_CODES,
  ALLERGEN_LABELS,
  DIETARY_LABELS,
  DIETARY_TYPES,
  formatInrFromPaise,
  GST_TAX_SLABS,
  type AllergenCode,
  type ApiResponse,
  type CatalogAuditEntryDto,
  type DietaryType,
  type GstTaxSlab,
  type MenuCategoryDto,
  type MenuItemDto,
  type OutletCatalogDto,
  type OutletDetailDto,
  type UserRole,
} from '@bhojora/shared';

export interface MenuCatalogPanelProps {
  apiBase: string;
  accessToken: string | null;
  activeRole: UserRole;
  onStatusUpdate?: (message: string) => void;
}

export function MenuCatalogPanel({
  apiBase,
  accessToken,
  activeRole,
  onStatusUpdate,
}: MenuCatalogPanelProps) {
  const [outlets, setOutlets] = useState<OutletDetailDto[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [catalog, setCatalog] = useState<OutletCatalogDto | null>(null);
  const [audits, setAudits] = useState<CatalogAuditEntryDto[]>([]);
  const [busy, setBusy] = useState(false);

  // Category creation state
  const [catName, setCatName] = useState('');
  const [catDescription, setCatDescription] = useState('');
  const [catSortOrder, setCatSortOrder] = useState('1');
  const catNameRef = useRef<HTMLInputElement | null>(null);

  // Item creation state
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pricePaiseRaw, setPricePaiseRaw] = useState('38000');
  const [gstTaxSlab, setGstTaxSlab] = useState<GstTaxSlab>('RESTAURANT_5_PCT');
  const [dietaryType, setDietaryType] = useState<DietaryType>('NON_VEG');
  const [allergens, setAllergens] = useState<AllergenCode[]>(['DAIRY']);
  const [allergenConfirmed, setAllergenConfirmed] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [variantLabel, setVariantLabel] = useState('Regular Portion');
  const [variantDeltaPaiseRaw, setVariantDeltaPaiseRaw] = useState('0');
  const [addonLabel, setAddonLabel] = useState('Extra Aloo');
  const [addonPricePaiseRaw, setAddonPricePaiseRaw] = useState('2000');

  const [itemTouched, setItemTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [panelStatus, setPanelStatus] = useState(
    'Sign in as RESTAURANT_OWNER or RESTAURANT_MANAGER to manage categories, integer-paise prices, variants, add-ons, and allergen labels.',
  );

  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const priceInputRef = useRef<HTMLInputElement | null>(null);

  function report(message: string) {
    setPanelStatus(message);
    onStatusUpdate?.(message);
  }

  function partnerHeaders(includeJson = false): Record<string, string> {
    return {
      ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      'X-Bhojora-Active-Role': activeRole,
    };
  }

  async function loadOutletsAndCatalog() {
    if (!apiBase || !accessToken) {
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/v1/restaurant/outlets`, {
        headers: partnerHeaders(false),
      });
      const payload = (await res.json()) as ApiResponse<{ outlets: OutletDetailDto[] }>;
      if (!res.ok || !payload.success) {
        report(
          payload.success
            ? 'Unable to load outlets for catalog management.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setOutlets(payload.data.outlets);
      const nextId = payload.data.outlets[0]?.outletId ?? '';
      if (nextId) {
        setSelectedOutletId(nextId);
        await loadCatalog(nextId);
      }
    } catch {
      report('Network error while loading partner outlets for menu catalog.');
    }
  }

  async function loadCatalog(outletId: string) {
    if (!apiBase || !accessToken || !outletId) {
      return;
    }
    try {
      const res = await fetch(
        `${apiBase}/api/v1/restaurant/outlets/${encodeURIComponent(outletId)}/menu`,
        {
          headers: partnerHeaders(false),
        },
      );
      const payload = (await res.json()) as ApiResponse<{
        catalog: OutletCatalogDto;
        audits: CatalogAuditEntryDto[];
      }>;
      if (!res.ok || !payload.success) {
        report(
          payload.success
            ? 'Failed to load outlet menu.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setCatalog(payload.data.catalog);
      setAudits(payload.data.audits);
      if (!categoryId && payload.data.catalog.categories[0]) {
        setCategoryId(payload.data.catalog.categories[0].categoryId);
      }
    } catch {
      report('Network error while loading outlet menu catalog.');
    }
  }

  useEffect(() => {
    if (accessToken) {
      void loadOutletsAndCatalog();
    }
  }, [accessToken, activeRole]);

  function validateIntegerPaiseInput(raw: string): number | null {
    const trimmed = raw.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  const parsedPricePaise = validateIntegerPaiseInput(pricePaiseRaw);

  async function handleCreateCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiBase || !accessToken || !selectedOutletId) {
      report('Sign in and select an outlet before creating a menu category.');
      return;
    }
    if (catName.trim().length < 2) {
      report('Error: Enter a category name of at least 2 characters.');
      catNameRef.current?.focus();
      return;
    }
    const sortNum = Number(catSortOrder);
    if (!Number.isInteger(sortNum) || sortNum < 0) {
      report('Error: Sort order must be a non-negative integer.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/restaurant/menu/categories`, {
        method: 'POST',
        headers: partnerHeaders(true),
        body: JSON.stringify({
          outletId: selectedOutletId,
          name: catName.trim(),
          description: catDescription.trim(),
          sortOrder: sortNum,
          isActive: true,
        }),
      });
      const payload = (await res.json()) as ApiResponse<{ category: MenuCategoryDto }>;
      if (!res.ok || !payload.success) {
        report(
          payload.success
            ? 'Failed to create category.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setCatName('');
      setCatDescription('');
      setCategoryId(payload.data.category.categoryId);
      await loadCatalog(selectedOutletId);
      report(`Created category "${payload.data.category.name}" and logged catalog audit entry.`);
    } catch {
      report('Network error while creating menu category.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setItemTouched(true);
    if (!apiBase || !accessToken || !selectedOutletId) {
      report('Sign in and select an outlet before publishing a menu dish.');
      return;
    }
    if (!categoryId) {
      setFormError('Error: Create or select a menu category before adding an item.');
      return;
    }
    if (title.trim().length < 2) {
      setFormError('Error: Enter a dish title of at least 2 characters.');
      titleInputRef.current?.focus();
      return;
    }
    if (parsedPricePaise === null) {
      setFormError('Error: Price must be entered in whole integer paise (e.g. 38000 for ₹380).');
      priceInputRef.current?.focus();
      return;
    }
    if (!allergenConfirmed) {
      setFormError('Error: Confirm the allergen declaration checkbox before saving the dish.');
      return;
    }

    const deltaPaise = validateIntegerPaiseInput(variantDeltaPaiseRaw);
    const addonPaise = validateIntegerPaiseInput(addonPricePaiseRaw);
    if (variantLabel.trim() && deltaPaise === null) {
      setFormError('Error: Variant price delta must be an integer amount in paise.');
      return;
    }
    if (addonLabel.trim() && addonPaise === null) {
      setFormError('Error: Add-on price must be an integer amount in paise.');
      return;
    }

    setFormError(null);
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/restaurant/menu/items`, {
        method: 'POST',
        headers: partnerHeaders(true),
        body: JSON.stringify({
          outletId: selectedOutletId,
          categoryId,
          title: title.trim(),
          description: description.trim(),
          pricePaise: parsedPricePaise,
          gstTaxSlab,
          dietaryType,
          allergens,
          allergenDisclosureConfirmed: true,
          imageUrl: imageUrl.trim() || null,
          isAvailable: true,
          variants: variantLabel.trim()
            ? [
                {
                  name: 'Portion Size',
                  required: true,
                  minSelections: 1,
                  maxSelections: 1,
                  options: [
                    {
                      label: variantLabel.trim(),
                      priceDeltaPaise: deltaPaise ?? 0,
                      isDefault: true,
                      isAvailable: true,
                    },
                  ],
                },
              ]
            : [],
          addonGroups: addonLabel.trim()
            ? [
                {
                  name: 'Recommended Add-ons',
                  minSelections: 0,
                  maxSelections: 3,
                  options: [
                    {
                      label: addonLabel.trim(),
                      pricePaise: addonPaise ?? 0,
                      dietaryType: 'PURE_VEG',
                      allergens: [],
                      isAvailable: true,
                    },
                  ],
                },
              ]
            : [],
        }),
      });
      const payload = (await res.json()) as ApiResponse<{ item: MenuItemDto }>;
      if (!res.ok || !payload.success) {
        const msg = payload.success
          ? 'Failed to create menu item.'
          : `${payload.error.code}: ${payload.error.message}`;
        setFormError(msg);
        report(msg);
        return;
      }
      setTitle('');
      setDescription('');
      setImageUrl('');
      setItemTouched(false);
      await loadCatalog(selectedOutletId);
      report(
        `Saved "${payload.data.item.title}" (${payload.data.item.formattedPriceInr} / ${payload.data.item.pricePaise} paise) with allergen audit.`,
      );
    } catch {
      report('Network error while creating menu item.');
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAvailability(item: MenuItemDto) {
    if (!apiBase || !accessToken) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/restaurant/menu/items/${encodeURIComponent(item.itemId)}/availability`,
        {
          method: 'PATCH',
          headers: partnerHeaders(true),
          body: JSON.stringify({
            isAvailable: !item.isAvailable,
            reason: !item.isAvailable ? 'Restocked in kitchen' : 'Marked sold out on line',
          }),
        },
      );
      const payload = (await res.json()) as ApiResponse<{ item: MenuItemDto }>;
      if (!res.ok || !payload.success) {
        report(
          payload.success
            ? 'Failed to update availability.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      await loadCatalog(item.outletId);
      report(
        `Availability updated & audited for "${payload.data.item.title}": ${payload.data.item.isAvailable ? 'Available' : 'Out of Stock'}.`,
      );
    } catch {
      report('Network error while toggling item availability.');
    } finally {
      setBusy(false);
    }
  }

  function toggleAllergen(code: AllergenCode) {
    setAllergens((prev) =>
      prev.includes(code) ? prev.filter((item) => item !== code) : [...prev, code],
    );
  }

  return (
    <section className="panel" aria-labelledby="catalog-management-heading">
      <div className="topbar-inner" style={{ marginBottom: '0.75rem' }}>
        <div>
          <span className="badge">
            Checkpoint 12 · Catalog, Integer Paise &amp; Allergen Labels
          </span>
          <h2
            id="catalog-management-heading"
            style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}
          >
            Outlet Menu, Variants, Add-ons &amp; Audited Pricing
          </h2>
          <p className="brand-sub" role="status" aria-live="polite">
            {panelStatus}
          </p>
        </div>
        {selectedOutletId ? (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void loadCatalog(selectedOutletId)}
          >
            Refresh Menu
          </button>
        ) : null}
      </div>

      {outlets.length > 0 ? (
        <div className="outlet-tabs" role="group" aria-label="Select outlet for menu catalog">
          {outlets.map((outlet) => (
            <button
              key={outlet.outletId}
              type="button"
              className="tab-btn"
              aria-pressed={outlet.outletId === selectedOutletId}
              onClick={() => {
                setSelectedOutletId(outlet.outletId);
                void loadCatalog(outlet.outletId);
              }}
            >
              {outlet.outletName}
            </button>
          ))}
        </div>
      ) : null}

      <div className="form-grid-2">
        <form
          aria-labelledby="cat-form-heading"
          className="fieldset-group"
          noValidate
          onSubmit={(e) => void handleCreateCategory(e)}
        >
          <h3 id="cat-form-heading" style={{ marginBottom: '0.75rem' }}>
            1. Add Menu Category
          </h3>
          <div className="field">
            <label htmlFor="catName">Category Title</label>
            <p className="field-hint">
              E.g. Kolkata Royal Biryani, Mughlai Kebabs, Heritage Vegetarian
            </p>
            <input
              ref={catNameRef}
              id="catName"
              name="catName"
              type="text"
              required
              minLength={2}
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="catDescription">Description</label>
            <input
              id="catDescription"
              name="catDescription"
              type="text"
              value={catDescription}
              onChange={(e) => setCatDescription(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="catSortOrder">Display Sort Order</label>
            <input
              id="catSortOrder"
              name="catSortOrder"
              type="number"
              min={0}
              max={9999}
              required
              value={catSortOrder}
              onChange={(e) => setCatSortOrder(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={busy || !accessToken}>
            Create Menu Category
          </button>
        </form>

        <form
          aria-labelledby="item-form-heading"
          className="fieldset-group"
          noValidate
          onSubmit={(e) => void handleCreateItem(e)}
        >
          <h3 id="item-form-heading" style={{ marginBottom: '0.75rem' }}>
            2. Add Dish (Price in Paise + Allergens)
          </h3>

          <div className="field">
            <label htmlFor="itemCategory">Category</label>
            <select
              id="itemCategory"
              name="categoryId"
              required
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">-- Select category --</option>
              {(catalog?.categories ?? []).map((cat) => (
                <option key={cat.categoryId} value={cat.categoryId}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="itemTitle">Dish Name</label>
            <input
              ref={titleInputRef}
              id="itemTitle"
              name="title"
              type="text"
              required
              minLength={2}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (formError) setFormError(null);
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="itemDescription">Dish Description</label>
            <textarea
              id="itemDescription"
              name="description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="form-grid-2">
            <div className="field">
              <label htmlFor="itemPricePaise">Price (Integer Paise)</label>
              <p className="field-hint" id="paise-format-hint">
                Stored in paise (ADR-003):{' '}
                {parsedPricePaise !== null
                  ? formatInrFromPaise(parsedPricePaise)
                  : 'Enter whole digits'}
              </p>
              <input
                ref={priceInputRef}
                id="itemPricePaise"
                name="pricePaise"
                type="text"
                inputMode="numeric"
                pattern="\d+"
                required
                aria-describedby="paise-format-hint"
                aria-invalid={itemTouched && parsedPricePaise === null ? 'true' : 'false'}
                value={pricePaiseRaw}
                onChange={(e) => {
                  setPricePaiseRaw(e.target.value);
                  if (formError) setFormError(null);
                }}
                onBlur={() => setItemTouched(true)}
              />
            </div>

            <div className="field">
              <label htmlFor="itemGstSlab">GST Classification</label>
              <select
                id="itemGstSlab"
                name="gstTaxSlab"
                value={gstTaxSlab}
                onChange={(e) => setGstTaxSlab(e.target.value as GstTaxSlab)}
              >
                {GST_TAX_SLABS.map((slab) => (
                  <option key={slab} value={slab}>
                    {slab}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="fieldset-group" style={{ marginBottom: '0.85rem' }}>
            <legend>Indian FSSAI Dietary Classification</legend>
            <div className="allergen-chip-grid">
              {DIETARY_TYPES.map((type) => (
                <label key={type} className="allergen-toggle">
                  <input
                    type="radio"
                    name="dietaryType"
                    value={type}
                    checked={dietaryType === type}
                    onChange={() => setDietaryType(type)}
                  />
                  <span>
                    {type === 'NON_VEG' ? '▲' : '●'} {DIETARY_LABELS[type]}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="fieldset-group" style={{ marginBottom: '0.85rem' }}>
            <legend>Declared Allergens (Required Label Disclosure)</legend>
            <div className="allergen-chip-grid">
              {ALLERGEN_CODES.map((code) => (
                <label key={code} className="allergen-toggle">
                  <input
                    type="checkbox"
                    checked={allergens.includes(code)}
                    onChange={() => toggleAllergen(code)}
                  />
                  <span>{ALLERGEN_LABELS[code]}</span>
                </label>
              ))}
            </div>
            <label className="allergen-toggle" style={{ marginTop: '0.65rem', width: '100%' }}>
              <input
                type="checkbox"
                checked={allergenConfirmed}
                onChange={(e) => {
                  setAllergenConfirmed(e.target.checked);
                  if (formError) setFormError(null);
                }}
              />
              <span>
                I confirm declared allergens accurately reflect kitchen preparation for customer
                safety
              </span>
            </label>
          </fieldset>

          <div className="form-grid-2">
            <div className="field">
              <label htmlFor="variantLabel">Variant Option (Optional)</label>
              <input
                id="variantLabel"
                name="variantLabel"
                type="text"
                value={variantLabel}
                onChange={(e) => setVariantLabel(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="variantDelta">Variant Delta (Paise)</label>
              <input
                id="variantDelta"
                name="variantDelta"
                type="text"
                inputMode="numeric"
                value={variantDeltaPaiseRaw}
                onChange={(e) => setVariantDeltaPaiseRaw(e.target.value)}
              />
            </div>
          </div>

          <div className="form-grid-2">
            <div className="field">
              <label htmlFor="addonLabel">Add-on Option (Optional)</label>
              <input
                id="addonLabel"
                name="addonLabel"
                type="text"
                value={addonLabel}
                onChange={(e) => setAddonLabel(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="addonPaise">Add-on Price (Paise)</label>
              <input
                id="addonPaise"
                name="addonPaise"
                type="text"
                inputMode="numeric"
                value={addonPricePaiseRaw}
                onChange={(e) => setAddonPricePaiseRaw(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="itemImageUrl">Dish Photo URL (https:// public asset only)</label>
            <input
              id="itemImageUrl"
              name="imageUrl"
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>

          {formError ? (
            <p className="field-error" role="alert" style={{ marginBottom: '0.75rem' }}>
              {formError}
            </p>
          ) : null}

          <button type="submit" className="btn-primary" disabled={busy || !accessToken}>
            Publish Audited Menu Item
          </button>
        </form>
      </div>

      {catalog && catalog.items.length > 0 ? (
        <div className="table-scroll" style={{ marginTop: '1rem' }}>
          <table className="data-table">
            <caption>Active outlet menu items stored in integer INR paise</caption>
            <thead>
              <tr>
                <th scope="col">Dish</th>
                <th scope="col">Dietary</th>
                <th scope="col">Price</th>
                <th scope="col">Declared Allergens</th>
                <th scope="col">Status &amp; Action</th>
              </tr>
            </thead>
            <tbody>
              {catalog.items.map((item) => (
                <tr key={item.itemId}>
                  <th scope="row">
                    {item.title}
                    <div className="field-hint">
                      {item.variants.length} variant group(s) · {item.addonGroups.length} add-on
                      group(s)
                    </div>
                  </th>
                  <td>
                    <span
                      className={`dietary-tag ${
                        item.dietaryType === 'PURE_VEG'
                          ? 'dietary-tag-veg'
                          : item.dietaryType === 'EGG'
                            ? 'dietary-tag-egg'
                            : 'dietary-tag-nonveg'
                      }`}
                    >
                      {item.dietaryBadgeLabel}
                    </span>
                  </td>
                  <td>
                    <strong>{item.formattedPriceInr}</strong>
                    <div className="field-hint">{item.pricePaise} paise</div>
                  </td>
                  <td>
                    {item.allergenLabels.length > 0
                      ? item.allergenLabels.join(', ')
                      : 'Confirmed No Major Allergens'}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-ghost"
                      disabled={busy}
                      onClick={() => void handleToggleAvailability(item)}
                    >
                      {item.isAvailable ? 'Available · Mark Out' : 'Sold Out · Restock'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {audits.length > 0 ? (
        <div className="table-scroll" style={{ marginTop: '1rem' }}>
          <table className="data-table">
            <caption>Append-only menu price, allergen &amp; availability audit trail</caption>
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Actor Role</th>
                <th scope="col">Audit Summary</th>
                <th scope="col">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {audits.slice(0, 8).map((audit) => (
                <tr key={audit.auditId}>
                  <th scope="row">{audit.action}</th>
                  <td>{audit.actorRole}</td>
                  <td>{audit.reason ?? audit.outcome}</td>
                  <td>{audit.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
