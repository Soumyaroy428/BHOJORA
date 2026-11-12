import crypto from 'node:crypto';
import type {
  CheckoutPricingBreakdownDto,
  CouponDiscountType,
  CouponFundingSplitDto,
  GstTaxSlab,
} from '@bhojora/shared';
import { formatInrFromPaise } from '../catalog/catalog.types';
import {
  DELIVERY_PER_KM_PAISE,
  GST_TAX_BPS_BY_SLAB,
  MAX_TIP_PAISE,
  PACKAGING_MAX_PAISE,
  PACKAGING_PER_UNIT_PAISE,
  PLATFORM_FEE_PAISE,
} from './pricing.types';

export interface ServerPricingItemInput {
  unitPricePaise: number;
  quantity: number;
  gstTaxSlab: GstTaxSlab;
}

export interface ServerPricingCouponInput {
  code: string;
  title: string;
  discountType: CouponDiscountType;
  discountValue: number;
  maxDiscountPaise: number;
  minOrderSubtotalPaise: number;
  platformShareBps: number;
  restaurantShareBps: number;
}

export interface ServerPricingResult {
  breakdown: CheckoutPricingBreakdownDto;
  lineTaxPaise: number[];
  couponAllocation: CouponFundingSplitDto | null;
}

export function computeServerPricingBreakdown(params: {
  items: readonly ServerPricingItemInput[];
  deliveryBaseFeePaise: number;
  distanceMeters: number;
  tipPaise?: number;
  coupon?: ServerPricingCouponInput | null;
}): ServerPricingResult {
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
      formattedTotalPayableInr: formatInrFromPaise(totalPayablePaise),
    },
    lineTaxPaise,
    couponAllocation,
  };
}

export interface QuoteSignatureInput {
  quoteId: string;
  customerId: string;
  outletId: string;
  issuedAtIso: string;
  expiresAtIso: string;
  breakdown: CheckoutPricingBreakdownDto;
}

function canonicalQuotePayload(input: QuoteSignatureInput): string {
  return [
    input.quoteId,
    input.customerId,
    input.outletId,
    input.issuedAtIso,
    input.expiresAtIso,
    input.breakdown.itemsSubtotalPaise,
    input.breakdown.discountPaise,
    input.breakdown.packagingChargePaise,
    input.breakdown.deliveryFeePaise,
    input.breakdown.platformFeePaise,
    input.breakdown.gstTaxPaise,
    input.breakdown.tipPaise,
    input.breakdown.totalPayablePaise,
  ].join('|');
}

export function signQuotePayload(input: QuoteSignatureInput, secret: string): string {
  return crypto.createHmac('sha256', secret).update(canonicalQuotePayload(input)).digest('hex');
}

export function verifyQuoteSignature(
  input: QuoteSignatureInput,
  providedSignature: string,
  secret: string,
): boolean {
  const expected = signQuotePayload(input, secret);
  if (expected.length !== providedSignature.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(providedSignature, 'utf8'),
  );
}
