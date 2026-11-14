import { z } from 'zod';
import type {
  CampaignStatus,
  CampaignDto,
  CouponDto,
  CouponDiscountType,
  LoyaltyLedgerEntryType,
  LoyaltyLedgerEntryDto,
  MembershipTier,
  MembershipSubscriptionDto,
} from '@bhojora/shared';

export interface CampaignRecord {
  campaignId: string;
  title: string;
  description: string;
  budgetCapPaise: number;
  currentSpendPaise: number;
  status: CampaignStatus;
  validFrom: Date;
  validUntil: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CouponUserRedemption {
  userId: string;
  orderId: string;
  discountPaise: number;
  redeemedAt: Date;
}

export interface PromotionCouponRecord {
  couponId: string;
  campaignId: string | null;
  code: string;
  title: string;
  description: string;
  termsConditions: string[];
  discountType: CouponDiscountType;
  discountValue: number; // paise if FLAT_PAISE, bps if PERCENT_BPS
  minOrderSubtotalPaise: number;
  maxDiscountPaise: number;
  platformShareBps: number;
  restaurantShareBps: number;
  applicableZones: string[]; // empty = all
  totalRedemptionLimit: number;
  perUserRedemptionLimit: number;
  currentRedemptionCount: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  validFrom: Date;
  validUntil: Date;
  userRedemptions: CouponUserRedemption[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ReferralRecord {
  referralId: string;
  referrerUserId: string;
  refereeUserId: string;
  referralCode: string;
  status: 'PENDING' | 'QUALIFIED' | 'REWARDED';
  rewardPoints: number;
  rewardPaise: number;
  qualifyingOrderId: string | null;
  createdAt: Date;
  qualifiedAt: Date | null;
}

export interface LoyaltyLedgerRecord {
  entryId: string;
  userId: string;
  entryType: LoyaltyLedgerEntryType;
  points: number;
  equivalentPaise: number;
  orderId: string | null;
  reason: string;
  balanceAfter: number;
  createdAt: Date;
}

export interface MembershipSubscriptionRecord {
  subscriptionId: string;
  userId: string;
  tier: MembershipTier;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  startedAt: Date;
  expiresAt: Date;
  autoRenew: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Zod Validation Schemas
export const createCampaignSchema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().min(5).max(300),
  budgetCapPaise: z.number().int().min(1000), // Min ₹10.00
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
});

export const createPromotionCouponSchema = z.object({
  campaignId: z.string().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_-]{3,24}$/, 'Coupon code must be 3-24 uppercase alphanumeric characters'),
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(5).max(200),
  termsConditions: z.array(z.string()).min(1),
  discountType: z.enum(['FLAT_PAISE', 'PERCENT_BPS']),
  discountValue: z.number().int().positive(),
  minOrderSubtotalPaise: z.number().int().min(0).default(0),
  maxDiscountPaise: z.number().int().positive(),
  platformShareBps: z.number().int().min(0).max(10000).default(10000), // Default 100% platform funded
  applicableZones: z.array(z.string()).default([]),
  totalRedemptionLimit: z.number().int().min(1).default(10000),
  perUserRedemptionLimit: z.number().int().min(1).default(1),
  firstOrderOnly: z.boolean().default(false),
  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
});

export const validateCouponSchema = z.object({
  code: z.string().trim().toUpperCase(),
  subtotalPaise: z.number().int().min(0),
  zoneId: z.string().optional(),
  isFirstOrder: z.boolean().default(false),
});

export const applyReferralSchema = z.object({
  referralCode: z.string().trim().toUpperCase().min(4).max(16),
});

export const redeemPointsSchema = z.object({
  pointsToRedeem: z.number().int().positive(),
  cartSubtotalPaise: z.number().int().positive(),
});

export const subscribeMembershipSchema = z.object({
  tier: z.enum(['FREE', 'CLEAN_DINE_CLUB']),
  durationMonths: z.number().int().min(1).max(12).default(3),
});

// DTO Mappers
export function toCampaignDto(record: CampaignRecord): CampaignDto {
  return {
    campaignId: record.campaignId,
    title: record.title,
    description: record.description,
    budgetCapPaise: record.budgetCapPaise,
    currentSpendPaise: record.currentSpendPaise,
    status: record.status,
    validFrom: record.validFrom.toISOString(),
    validUntil: record.validUntil.toISOString(),
  };
}

export function toCouponDto(record: PromotionCouponRecord): CouponDto {
  const platformPct = Math.round(record.platformShareBps / 100);
  const restaurantPct = Math.round(record.restaurantShareBps / 100);
  const fundingSummaryLabel =
    platformPct === 100
      ? '100% Platform Funded'
      : restaurantPct === 100
        ? '100% Restaurant Funded'
        : `${platformPct}% Platform / ${restaurantPct}% Restaurant Funded`;

  return {
    couponId: record.couponId,
    campaignId: record.campaignId,
    code: record.code,
    title: record.title,
    description: record.description,
    termsConditions: [...record.termsConditions],
    discountType: record.discountType,
    discountValue: record.discountValue,
    minOrderSubtotalPaise: record.minOrderSubtotalPaise,
    maxDiscountPaise: record.maxDiscountPaise,
    platformShareBps: record.platformShareBps,
    restaurantShareBps: record.restaurantShareBps,
    applicableZones: [...record.applicableZones],
    totalRedemptionLimit: record.totalRedemptionLimit,
    perUserRedemptionLimit: record.perUserRedemptionLimit,
    currentRedemptionCount: record.currentRedemptionCount,
    firstOrderOnly: record.firstOrderOnly,
    isActive: record.isActive,
    validFrom: record.validFrom.toISOString(),
    validUntil: record.validUntil.toISOString(),
    fundingSummaryLabel,
  };
}

export function toLoyaltyLedgerEntryDto(record: LoyaltyLedgerRecord): LoyaltyLedgerEntryDto {
  return {
    entryId: record.entryId,
    userId: record.userId,
    entryType: record.entryType,
    points: record.points,
    equivalentPaise: record.equivalentPaise,
    orderId: record.orderId,
    reason: record.reason,
    balanceAfter: record.balanceAfter,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toMembershipSubscriptionDto(
  record: MembershipSubscriptionRecord,
): MembershipSubscriptionDto {
  const benefits =
    record.tier === 'CLEAN_DINE_CLUB'
      ? [
          'Free delivery on orders above ₹299 from Verified Clean kitchens',
          'Priority courier dispatch and live temperature sensor access',
          'Double loyalty points (10 points per ₹100 spent)',
          'Exclusive festival chef specials & early table booking',
        ]
      : ['Standard Bhojora delivery', 'Earn 5 loyalty points per ₹100 spent'];

  return {
    subscriptionId: record.subscriptionId,
    userId: record.userId,
    tier: record.tier,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    expiresAt: record.expiresAt.toISOString(),
    benefits,
  };
}
