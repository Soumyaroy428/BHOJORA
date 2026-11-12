import type { AllergenCode, DietaryType, GstTaxSlab } from './catalog';
import type { KolkataZoneId } from './customer';
import type { PlatformInspectionStatus } from './restaurant';

export const QUOTE_TTL_SECONDS = 600;
export const PLATFORM_FEE_PAISE = 500;
export const DELIVERY_PER_KM_PAISE = 600;
export const PACKAGING_PER_UNIT_PAISE = 1000;
export const PACKAGING_MAX_PAISE = 4000;
export const MAX_CART_ITEM_QUANTITY = 20;
export const MAX_DISTINCT_CART_ITEMS = 25;
export const MAX_TIP_PAISE = 50000;
export const DEFAULT_TIP_PRESETS_PAISE = [0, 2000, 3000, 5000] as const;

export const GST_TAX_BPS_BY_SLAB: Readonly<Record<GstTaxSlab, number>> = {
  RESTAURANT_5_PCT: 500,
  BAKERY_18_PCT: 1800,
  EXEMPT_0_PCT: 0,
};

export const TAMPER_PROTECTION_NOTICE =
  'Totals are authoritatively computed on Bhojora servers in integer INR paise and cryptographically signed (HMAC-SHA256) for 600 seconds. Client-supplied price or fee overrides are rejected.';

export interface CartVariantSelectionDto {
  groupId: string;
  optionId: string;
  label: string;
  priceDeltaPaise: number;
}

export interface CartAddonSelectionDto {
  groupId: string;
  optionId: string;
  label: string;
  pricePaise: number;
}

export interface CartItemDto {
  cartItemId: string;
  menuItemId: string;
  title: string;
  dietaryType: DietaryType;
  allergens: AllergenCode[];
  allergenLabels: string[];
  gstTaxSlab: GstTaxSlab;
  quantity: number;
  unitBasePricePaise: number;
  customizationDeltaPaise: number;
  effectiveUnitPricePaise: number;
  lineTotalPaise: number;
  formattedLineTotalInr: string;
  priceAtAddPaise: number;
  currentPriceChanged: boolean;
  isAvailable: boolean;
  selectedVariants: CartVariantSelectionDto[];
  selectedAddons: CartAddonSelectionDto[];
  updatedAt: string;
}

export interface CartDto {
  cartId: string;
  customerId: string;
  outletId: string | null;
  outletName: string | null;
  brandName: string | null;
  outletZoneId: KolkataZoneId | null;
  outletSuspended: boolean;
  items: CartItemDto[];
  itemCount: number;
  itemsSubtotalPaise: number;
  formattedSubtotalInr: string;
  currency: 'INR';
  updatedAt: string;
}

export type CouponDiscountType = 'FLAT_PAISE' | 'PERCENT_BPS';

export interface PublicCouponSummaryDto {
  code: string;
  title: string;
  description: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountPaise: number;
  minOrderSubtotalPaise: number;
  platformShareBps: number;
  restaurantShareBps: number;
  maxRedemptionsPerUser: number;
  validUntil: string;
  fundingSummaryLabel: string;
}

export interface CouponFundingSplitDto {
  couponCode: string;
  title: string;
  discountPaise: number;
  platformShareBps: number;
  restaurantShareBps: number;
  platformFundedPaise: number;
  restaurantFundedPaise: number;
  fundingSummaryLabel: string;
}

export interface PriceDriftWarningDto {
  menuItemId: string;
  title: string;
  previousUnitPricePaise: number;
  currentUnitPricePaise: number;
  formattedPreviousInr: string;
  formattedCurrentInr: string;
  message: string;
}

export interface QuoteLineItemDto {
  cartItemId: string;
  menuItemId: string;
  title: string;
  quantity: number;
  gstTaxSlab: GstTaxSlab;
  unitPricePaise: number;
  lineSubtotalPaise: number;
  gstTaxPaise: number;
}

export interface QuoteAddressSnapshotDto {
  addressId: string | null;
  label: string;
  streetAddress: string;
  locality: string;
  city: string;
  zoneId: KolkataZoneId | null;
  coordinates: [number, number];
}

export interface CheckoutPricingBreakdownDto {
  itemsSubtotalPaise: number;
  discountPaise: number;
  discountedSubtotalPaise: number;
  packagingChargePaise: number;
  deliveryBaseFeePaise: number;
  deliveryDistanceFeePaise: number;
  deliveryFeePaise: number;
  platformFeePaise: number;
  taxableSubtotalPaise: number;
  gstTaxPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  tipPaise: number;
  totalPayablePaise: number;
  formattedTotalPayableInr: string;
}

export type QuoteLifecycleStatus = 'ACTIVE' | 'EXPIRED' | 'CONSUMED';

export interface CheckoutQuoteDto {
  quoteId: string;
  customerId: string;
  outletId: string;
  outletName: string;
  brandName: string;
  outletInspectionStatus: PlatformInspectionStatus;
  outletSafetyScore: number | null;
  status: QuoteLifecycleStatus;
  isExpired: boolean;
  remainingSeconds: number;
  ttlSeconds: number;
  issuedAt: string;
  expiresAt: string;
  signatureAlgorithm: 'HMAC-SHA256';
  signature: string;
  currency: 'INR';
  distanceMeters: number;
  estimatedDeliveryMinutes: number;
  addressSnapshot: QuoteAddressSnapshotDto;
  lineItems: QuoteLineItemDto[];
  priceDriftDetected: boolean;
  priceDriftWarnings: PriceDriftWarningDto[];
  pricingBreakdown: CheckoutPricingBreakdownDto;
  couponAllocation: CouponFundingSplitDto | null;
  tamperProtectionNotice: string;
}

export interface PurePricingInputItem {
  unitPricePaise: number;
  quantity: number;
  gstTaxSlab: GstTaxSlab;
}

export interface PurePricingCouponInput {
  code: string;
  title: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountPaise: number;
  minOrderSubtotalPaise: number;
  platformShareBps: number;
  restaurantShareBps: number;
}

export interface PurePricingComputationResult {
  breakdown: CheckoutPricingBreakdownDto;
  lineTaxPaise: number[];
  couponAllocation: CouponFundingSplitDto | null;
}

function formatInrCompact(amountPaise: number): string {
  const safe = Math.trunc(amountPaise);
  const abs = Math.abs(safe);
  const rupees = Math.trunc(abs / 100);
  const rem = abs % 100;
  return rem === 0
    ? `₹${rupees.toLocaleString('en-IN')}`
    : `₹${rupees.toLocaleString('en-IN')}.${String(rem).padStart(2, '0')}`;
}

export function computeIntegerPricingBreakdown(params: {
  items: readonly PurePricingInputItem[];
  deliveryBaseFeePaise: number;
  distanceMeters: number;
  tipPaise?: number;
  coupon?: PurePricingCouponInput | null;
}): PurePricingComputationResult {
  const safeItems = params.items;
  let itemsSubtotalPaise = 0;
  let totalUnits = 0;

  const lineSubtotals = safeItems.map((item) => {
    const lineSub = item.unitPricePaise * item.quantity;
    itemsSubtotalPaise += lineSub;
    totalUnits += item.quantity;
    return lineSub;
  });

  const packagingChargePaise =
    totalUnits > 0 ? Math.min(PACKAGING_MAX_PAISE, totalUnits * PACKAGING_PER_UNIT_PAISE) : 0;

  const deliveryBaseFeePaise = Math.max(0, Math.trunc(params.deliveryBaseFeePaise));
  const deliveryDistanceFeePaise = Math.max(
    0,
    Math.round((Math.max(0, params.distanceMeters) / 1000) * DELIVERY_PER_KM_PAISE),
  );
  const deliveryFeePaise = deliveryBaseFeePaise + deliveryDistanceFeePaise;
  const platformFeePaise = totalUnits > 0 ? PLATFORM_FEE_PAISE : 0;
  const tipPaise = Math.max(0, Math.min(MAX_TIP_PAISE, Math.trunc(params.tipPaise ?? 0)));

  let discountPaise = 0;
  let couponAllocation: CouponFundingSplitDto | null = null;
  if (params.coupon && itemsSubtotalPaise >= params.coupon.minOrderSubtotalPaise) {
    const rawDiscount =
      params.coupon.discountType === 'FLAT_PAISE'
        ? params.coupon.discountValue
        : Math.round((itemsSubtotalPaise * params.coupon.discountValue) / 10000);
    discountPaise = Math.max(
      0,
      Math.min(itemsSubtotalPaise, params.coupon.maxDiscountPaise, rawDiscount),
    );
    const platformFundedPaise = Math.round(
      (discountPaise * params.coupon.platformShareBps) / 10000,
    );
    const restaurantFundedPaise = discountPaise - platformFundedPaise;
    couponAllocation = {
      couponCode: params.coupon.code,
      title: params.coupon.title,
      discountPaise,
      platformShareBps: params.coupon.platformShareBps,
      restaurantShareBps: params.coupon.restaurantShareBps,
      platformFundedPaise,
      restaurantFundedPaise,
      fundingSummaryLabel: `${Math.round(params.coupon.platformShareBps / 100)}% Platform / ${Math.round(params.coupon.restaurantShareBps / 100)}% Restaurant funded`,
    };
  }

  const discountedSubtotalPaise = Math.max(0, itemsSubtotalPaise - discountPaise);

  let remainingDiscount = discountPaise;
  let gstTaxPaise = 0;
  const lineTaxPaise = safeItems.map((item, idx) => {
    const lineSub = lineSubtotals[idx] ?? 0;
    const allocatedDiscount =
      itemsSubtotalPaise > 0 && discountPaise > 0
        ? idx === safeItems.length - 1
          ? remainingDiscount
          : Math.min(remainingDiscount, Math.floor((discountPaise * lineSub) / itemsSubtotalPaise))
        : 0;
    remainingDiscount -= allocatedDiscount;
    const netLine = Math.max(0, lineSub - allocatedDiscount);
    const slabBps = GST_TAX_BPS_BY_SLAB[item.gstTaxSlab] ?? 500;
    const tax = Math.round((netLine * slabBps) / 10000);
    gstTaxPaise += tax;
    return tax;
  });

  const packagingGstPaise = Math.round((packagingChargePaise * 500) / 10000);
  gstTaxPaise += packagingGstPaise;

  const cgstPaise = Math.floor(gstTaxPaise / 2);
  const sgstPaise = gstTaxPaise - cgstPaise;
  const taxableSubtotalPaise = discountedSubtotalPaise + packagingChargePaise;

  const totalPayablePaise =
    discountedSubtotalPaise +
    packagingChargePaise +
    deliveryFeePaise +
    platformFeePaise +
    gstTaxPaise +
    tipPaise;

  return {
    breakdown: {
      itemsSubtotalPaise,
      discountPaise,
      discountedSubtotalPaise,
      packagingChargePaise,
      deliveryBaseFeePaise,
      deliveryDistanceFeePaise,
      deliveryFeePaise,
      platformFeePaise,
      taxableSubtotalPaise,
      gstTaxPaise,
      cgstPaise,
      sgstPaise,
      tipPaise,
      totalPayablePaise,
      formattedTotalPayableInr: formatInrCompact(totalPayablePaise),
    },
    lineTaxPaise,
    couponAllocation,
  };
}
