import {
  ALLERGEN_LABELS,
  computeIntegerPricingBreakdown,
  formatInrFromPaise,
  PLATFORM_FEE_PAISE,
  QUOTE_TTL_SECONDS,
  TAMPER_PROTECTION_NOTICE,
  type CartAddonSelectionDto,
  type CartDto,
  type CartItemDto,
  type CartVariantSelectionDto,
  type CheckoutQuoteDto,
  type MenuItemDto,
  type PublicCouponSummaryDto,
} from '@bhojora/shared';
import type { KitchenOutlet, KolkataZoneId } from '../types/domain';

const PREVIEW_CART_STORAGE_KEY = 'bhojora_preview_cart_v1';

export const PREVIEW_PILOT_COUPONS: readonly PublicCouponSummaryDto[] = [
  {
    code: 'BHOJORA100',
    title: '₹100 Off Kolkata Welcome Offer',
    description: 'Flat ₹100 off on orders ₹400 and above.',
    discountType: 'FLAT_PAISE',
    discountValue: 10000,
    maxDiscountPaise: 10000,
    minOrderSubtotalPaise: 40000,
    platformShareBps: 6000,
    restaurantShareBps: 4000,
    maxRedemptionsPerUser: 1,
    validUntil: '2028-12-31T23:59:59.000Z',
    fundingSummaryLabel: '60% Platform / 40% Restaurant funded',
  },
  {
    code: 'KOLKATA20',
    title: '20% Off Up To ₹80',
    description: '20% savings up to ₹80 on orders ₹250 and above.',
    discountType: 'PERCENT_BPS',
    discountValue: 2000,
    maxDiscountPaise: 8000,
    minOrderSubtotalPaise: 25000,
    platformShareBps: 5000,
    restaurantShareBps: 5000,
    maxRedemptionsPerUser: 3,
    validUntil: '2028-12-31T23:59:59.000Z',
    fundingSummaryLabel: '50% Platform / 50% Restaurant funded',
  },
];

export const KOLKATA_QUOTE_LOCATIONS: ReadonlyArray<{
  id: Exclude<KolkataZoneId, 'all'>;
  label: string;
  streetAddress: string;
  locality: string;
  coordinates: [number, number];
  deliveryBaseFeePaise: number;
}> = [
  {
    id: 'salt-lake',
    label: 'Salt Lake Sec V',
    streetAddress: 'Block GP, Sector V, Bidhannagar',
    locality: 'Salt Lake Sector V',
    coordinates: [88.4317, 22.5806],
    deliveryBaseFeePaise: 2500,
  },
  {
    id: 'central',
    label: 'Park Street',
    streetAddress: '18 Park Street, Taltala',
    locality: 'Park Street',
    coordinates: [88.3526, 22.5535],
    deliveryBaseFeePaise: 2900,
  },
  {
    id: 'south',
    label: 'Ballygunge',
    streetAddress: '42 Ballygunge Place',
    locality: 'Ballygunge',
    coordinates: [88.3665, 22.5262],
    deliveryBaseFeePaise: 2900,
  },
];

export function createEmptyCart(): CartDto {
  return {
    cartId: 'cart_preview_guest',
    customerId: 'guest_preview',
    outletId: null,
    outletName: null,
    brandName: null,
    outletZoneId: null,
    outletSuspended: false,
    items: [],
    itemCount: 0,
    itemsSubtotalPaise: 0,
    formattedSubtotalInr: formatInrFromPaise(0),
    currency: 'INR',
    updatedAt: new Date().toISOString(),
  };
}

export function readStoredPreviewCart(): CartDto {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createEmptyCart();
  }
  try {
    const raw = window.localStorage.getItem(PREVIEW_CART_STORAGE_KEY);
    if (!raw) {
      return createEmptyCart();
    }
    const parsed = JSON.parse(raw) as CartDto;
    if (!parsed || !Array.isArray(parsed.items)) {
      return createEmptyCart();
    }
    return parsed;
  } catch {
    return createEmptyCart();
  }
}

export function writeStoredPreviewCart(cart: CartDto): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(PREVIEW_CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Ignore storage quota exceptions cleanly
  }
}

export function getInitialItemSelections(item: MenuItemDto): {
  variants: CartVariantSelectionDto[];
  addons: CartAddonSelectionDto[];
} {
  const variants: CartVariantSelectionDto[] = [];
  for (const group of item.variants) {
    const chosen =
      group.options.find((opt) => opt.isDefault && opt.isAvailable) ??
      (group.required || group.minSelections > 0
        ? group.options.find((opt) => opt.isAvailable)
        : undefined);
    if (chosen) {
      variants.push({
        groupId: group.groupId,
        optionId: chosen.optionId,
        label: chosen.label,
        priceDeltaPaise: chosen.priceDeltaPaise,
      });
    }
  }
  return { variants, addons: [] };
}

export function computeEffectiveItemUnitPaise(
  item: MenuItemDto,
  variants: readonly CartVariantSelectionDto[],
  addons: readonly CartAddonSelectionDto[],
): number {
  const variantDelta = variants.reduce((sum, entry) => sum + entry.priceDeltaPaise, 0);
  const addonDelta = addons.reduce((sum, entry) => sum + entry.pricePaise, 0);
  return item.pricePaise + variantDelta + addonDelta;
}

export function applyPreviewCartAddition(params: {
  current: CartDto;
  kitchen: KitchenOutlet;
  item: MenuItemDto;
  variants: readonly CartVariantSelectionDto[];
  addons: readonly CartAddonSelectionDto[];
  quantity: number;
  replaceOutlet: boolean;
}): { ok: true; cart: CartDto } | { ok: false; conflictOutletName: string } {
  const { current, kitchen, item, variants, addons, quantity, replaceOutlet } = params;
  if (
    current.outletId &&
    current.items.length > 0 &&
    current.outletId !== kitchen.key &&
    !replaceOutlet
  ) {
    return {
      ok: false,
      conflictOutletName: current.brandName ?? current.outletId,
    };
  }

  const nowIso = new Date().toISOString();
  const baseItems: CartItemDto[] =
    current.outletId && current.outletId !== kitchen.key ? [] : [...current.items];

  const varSig = variants
    .map((v) => `${v.groupId}:${v.optionId}`)
    .sort()
    .join(',');
  const addSig = addons
    .map((a) => `${a.groupId}:${a.optionId}`)
    .sort()
    .join(',');
  const matchKey = `${item.itemId}|${varSig}|${addSig}`;

  const variantDelta = variants.reduce((s, v) => s + v.priceDeltaPaise, 0);
  const addonDelta = addons.reduce((s, a) => s + a.pricePaise, 0);
  const customizationDeltaPaise = variantDelta + addonDelta;
  const effectiveUnitPricePaise = item.pricePaise + customizationDeltaPaise;

  const existingIdx = baseItems.findIndex((line) => {
    const lineVarSig = line.selectedVariants
      .map((v) => `${v.groupId}:${v.optionId}`)
      .sort()
      .join(',');
    const lineAddSig = line.selectedAddons
      .map((a) => `${a.groupId}:${a.optionId}`)
      .sort()
      .join(',');
    return `${line.menuItemId}|${lineVarSig}|${lineAddSig}` === matchKey;
  });

  if (existingIdx >= 0) {
    const target = baseItems[existingIdx]!;
    const nextQty = Math.min(20, target.quantity + quantity);
    const lineTotalPaise = effectiveUnitPricePaise * nextQty;
    baseItems[existingIdx] = {
      ...target,
      quantity: nextQty,
      lineTotalPaise,
      formattedLineTotalInr: formatInrFromPaise(lineTotalPaise),
      updatedAt: nowIso,
    };
  } else {
    const lineTotalPaise = effectiveUnitPricePaise * quantity;
    baseItems.push({
      cartItemId: `preview_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      menuItemId: item.itemId,
      title: item.title,
      dietaryType: item.dietaryType,
      allergens: [...item.allergens],
      allergenLabels: item.allergens.map((c) => ALLERGEN_LABELS[c] ?? c),
      gstTaxSlab: item.gstTaxSlab,
      quantity,
      unitBasePricePaise: item.pricePaise,
      customizationDeltaPaise,
      effectiveUnitPricePaise,
      lineTotalPaise,
      formattedLineTotalInr: formatInrFromPaise(lineTotalPaise),
      priceAtAddPaise: effectiveUnitPricePaise,
      currentPriceChanged: false,
      isAvailable: item.isAvailable,
      selectedVariants: variants.map((v) => ({ ...v })),
      selectedAddons: addons.map((a) => ({ ...a })),
      updatedAt: nowIso,
    });
  }

  return recalculatePreviewCartTotals({
    ...current,
    outletId: kitchen.key,
    outletName: kitchen.locality,
    brandName: kitchen.name,
    outletZoneId: kitchen.zones[0] ?? 'central',
    items: baseItems,
    updatedAt: nowIso,
  });
}

export function recalculatePreviewCartTotals(cart: CartDto): { ok: true; cart: CartDto } {
  const nextItems = cart.items.filter((i) => i.quantity > 0);
  if (nextItems.length === 0) {
    return { ok: true, cart: createEmptyCart() };
  }
  const itemCount = nextItems.reduce((sum, i) => sum + i.quantity, 0);
  const itemsSubtotalPaise = nextItems.reduce((sum, i) => sum + i.lineTotalPaise, 0);
  return {
    ok: true,
    cart: {
      ...cart,
      items: nextItems,
      itemCount,
      itemsSubtotalPaise,
      formattedSubtotalInr: formatInrFromPaise(itemsSubtotalPaise),
      updatedAt: new Date().toISOString(),
    },
  };
}

function haversineMeters(from: readonly [number, number], to: readonly [number, number]): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(to[1] - from[1]);
  const dLng = toRad(to[0] - from[0]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from[1])) * Math.cos(toRad(to[1])) * Math.sin(dLng / 2) ** 2;
  return Math.round(r * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))));
}

export function buildPreviewCheckoutQuote(params: {
  cart: CartDto;
  kitchen: KitchenOutlet | undefined;
  locationId: Exclude<KolkataZoneId, 'all'>;
  couponCode: string;
  tipPaise: number;
}): { quote: CheckoutQuoteDto | null; couponError: string | null } {
  const { cart, kitchen, locationId, couponCode, tipPaise } = params;
  if (!cart.outletId || cart.items.length === 0) {
    return { quote: null, couponError: null };
  }
  const loc =
    KOLKATA_QUOTE_LOCATIONS.find((l) => l.id === locationId) ?? KOLKATA_QUOTE_LOCATIONS[0]!;
  const distanceMeters = kitchen ? haversineMeters(loc.coordinates, kitchen.coordinates) : 2200;

  let couponError: string | null = null;
  let matchedCoupon: PublicCouponSummaryDto | null = null;
  const trimmedCode = couponCode.trim().toUpperCase();
  if (trimmedCode) {
    const found = PREVIEW_PILOT_COUPONS.find((c) => c.code === trimmedCode);
    if (!found) {
      couponError = `Coupon "${trimmedCode}" not recognized (try BHOJORA100 or KOLKATA20).`;
    } else if (cart.itemsSubtotalPaise < found.minOrderSubtotalPaise) {
      couponError = `Coupon ${found.code} requires minimum subtotal of ${formatInrFromPaise(found.minOrderSubtotalPaise)}.`;
    } else {
      matchedCoupon = found;
    }
  }

  const computed = computeIntegerPricingBreakdown({
    items: cart.items.map((item) => ({
      unitPricePaise: item.effectiveUnitPricePaise,
      quantity: item.quantity,
      gstTaxSlab: item.gstTaxSlab,
    })),
    deliveryBaseFeePaise: loc.deliveryBaseFeePaise,
    distanceMeters,
    tipPaise,
    coupon: matchedCoupon
      ? {
          code: matchedCoupon.code,
          title: matchedCoupon.title,
          discountType: matchedCoupon.discountType,
          discountValue: matchedCoupon.discountValue,
          maxDiscountPaise: matchedCoupon.maxDiscountPaise,
          minOrderSubtotalPaise: matchedCoupon.minOrderSubtotalPaise,
          platformShareBps: matchedCoupon.platformShareBps,
          restaurantShareBps: matchedCoupon.restaurantShareBps,
        }
      : null,
  });

  const now = new Date();
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_SECONDS * 1000);

  return {
    couponError,
    quote: {
      quoteId: `preview_quote_${cart.outletId}_${Math.floor(now.getTime() / 1000)}`,
      customerId: cart.customerId,
      outletId: cart.outletId,
      outletName: cart.outletName ?? 'Kolkata Kitchen',
      brandName: cart.brandName ?? 'Bhojora Kitchen',
      outletInspectionStatus: kitchen?.platformInspectionStatus ?? 'VERIFIED_CLEAN',
      outletSafetyScore: kitchen?.isVerified ? kitchen.score : null,
      status: 'ACTIVE',
      isExpired: false,
      remainingSeconds: QUOTE_TTL_SECONDS,
      ttlSeconds: QUOTE_TTL_SECONDS,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      signatureAlgorithm: 'HMAC-SHA256',
      signature: 'preview-mode-signed-on-server-at-checkout',
      currency: 'INR',
      distanceMeters,
      estimatedDeliveryMinutes:
        (kitchen?.etaMinValue ?? 25) + Math.min(15, Math.round(distanceMeters / 1000)),
      addressSnapshot: {
        addressId: null,
        label: loc.label,
        streetAddress: loc.streetAddress,
        locality: loc.locality,
        city: 'Kolkata',
        zoneId: loc.id,
        coordinates: [...loc.coordinates] as [number, number],
      },
      lineItems: cart.items.map((item, idx) => ({
        cartItemId: item.cartItemId,
        menuItemId: item.menuItemId,
        title: item.title,
        quantity: item.quantity,
        gstTaxSlab: item.gstTaxSlab,
        unitPricePaise: item.effectiveUnitPricePaise,
        lineSubtotalPaise: item.lineTotalPaise,
        gstTaxPaise: computed.lineTaxPaise[idx] ?? 0,
      })),
      priceDriftDetected: false,
      priceDriftWarnings: [],
      pricingBreakdown: {
        ...computed.breakdown,
        platformFeePaise: PLATFORM_FEE_PAISE,
      },
      couponAllocation: computed.couponAllocation,
      tamperProtectionNotice: TAMPER_PROTECTION_NOTICE,
    },
  };
}
