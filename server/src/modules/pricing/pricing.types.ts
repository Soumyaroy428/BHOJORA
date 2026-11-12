import type {
  CheckoutPricingBreakdownDto,
  CheckoutQuoteDto,
  CouponDiscountType,
  CouponFundingSplitDto,
  GstTaxSlab,
  PlatformInspectionStatus,
  PriceDriftWarningDto,
  PublicCouponSummaryDto,
  QuoteAddressSnapshotDto,
  QuoteLifecycleStatus,
  QuoteLineItemDto,
} from '@bhojora/shared';

export const QUOTE_TTL_SECONDS = 600;
export const PLATFORM_FEE_PAISE = 500;
export const DELIVERY_PER_KM_PAISE = 600;
export const PACKAGING_PER_UNIT_PAISE = 1000;
export const PACKAGING_MAX_PAISE = 4000;
export const MAX_TIP_PAISE = 50000;

export const GST_TAX_BPS_BY_SLAB: Readonly<Record<GstTaxSlab, number>> = {
  RESTAURANT_5_PCT: 500,
  BAKERY_18_PCT: 1800,
  EXEMPT_0_PCT: 0,
};

export const TAMPER_PROTECTION_NOTICE =
  'Totals are authoritatively computed on Bhojora servers in integer INR paise and cryptographically signed (HMAC-SHA256) for 600 seconds. Client-supplied price or fee overrides are rejected.';

export interface CouponUserRedemptionRecord {
  userId: string;
  count: number;
  lastRedeemedAt: Date;
}

export interface CouponRecord {
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
  maxGlobalRedemptions: number;
  totalRedemptions: number;
  userRedemptions: CouponUserRedemptionRecord[];
  isActive: boolean;
  validFrom: Date;
  validUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingQuoteRecord {
  quoteId: string;
  customerId: string;
  outletId: string;
  outletName: string;
  brandName: string;
  outletInspectionStatus: PlatformInspectionStatus;
  outletSafetyScore: number | null;
  status: QuoteLifecycleStatus;
  ttlSeconds: number;
  issuedAt: Date;
  expiresAt: Date;
  signatureAlgorithm: 'HMAC-SHA256';
  signature: string;
  distanceMeters: number;
  estimatedDeliveryMinutes: number;
  addressSnapshot: QuoteAddressSnapshotDto;
  lineItems: QuoteLineItemDto[];
  priceDriftDetected: boolean;
  priceDriftWarnings: PriceDriftWarningDto[];
  pricingBreakdown: CheckoutPricingBreakdownDto;
  couponAllocation: CouponFundingSplitDto | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingStore {
  upsertCoupon(record: CouponRecord): Promise<CouponRecord>;
  getCouponByCode(code: string): Promise<CouponRecord | null>;
  listActiveCoupons(now: Date): Promise<CouponRecord[]>;
  saveQuote(record: PricingQuoteRecord): Promise<PricingQuoteRecord>;
  getQuoteById(quoteId: string): Promise<PricingQuoteRecord | null>;
  updateQuoteStatus(
    quoteId: string,
    status: QuoteLifecycleStatus,
    updatedAt: Date,
  ): Promise<PricingQuoteRecord | null>;
}

export type {
  CheckoutPricingBreakdownDto,
  CheckoutQuoteDto,
  CouponDiscountType,
  CouponFundingSplitDto,
  PublicCouponSummaryDto,
};
