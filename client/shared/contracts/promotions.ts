/**
 * BHOJORA — Promotions, Loyalty & Memberships Domain Contracts (Checkpoint 30)
 * Coupons, campaigns, referrals, points ledger, and membership club foundations.
 * Enforces strict budget caps, eligibility criteria, and transparent funding terms.
 */

import type { CouponDiscountType } from './cart-pricing';

export type CampaignStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'EXHAUSTED' | 'EXPIRED';

export interface CampaignDto {
  campaignId: string;
  title: string;
  description: string;
  budgetCapPaise: number;
  currentSpendPaise: number;
  status: CampaignStatus;
  validFrom: string;
  validUntil: string;
}

export interface CouponDto {
  couponId: string;
  campaignId?: string | null;
  code: string;
  title: string;
  description: string;
  termsConditions: string[];
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderSubtotalPaise: number;
  maxDiscountPaise: number;
  platformShareBps: number;
  restaurantShareBps: number;
  applicableZones: string[];
  totalRedemptionLimit: number;
  perUserRedemptionLimit: number;
  currentRedemptionCount: number;
  firstOrderOnly: boolean;
  isActive: boolean;
  validFrom: string;
  validUntil: string;
  fundingSummaryLabel: string;
}

export interface CouponValidationResultDto {
  valid: boolean;
  coupon?: CouponDto;
  discountPaise: number;
  platformDiscountPaise: number;
  restaurantDiscountPaise: number;
  fundingSummary: string;
  reason?: string;
}

export interface ReferralInfoDto {
  referralCode: string;
  totalReferrals: number;
  successfulReferrals: number;
  earnedPoints: number;
  earnedPaise: number;
  shareMessage: string;
}

export type LoyaltyLedgerEntryType = 'EARN' | 'REDEEM' | 'EXPIRE' | 'ADJUSTMENT' | 'REFERRAL_BONUS';

export interface LoyaltyLedgerEntryDto {
  entryId: string;
  userId: string;
  entryType: LoyaltyLedgerEntryType;
  points: number;
  equivalentPaise: number;
  orderId?: string | null;
  reason: string;
  balanceAfter: number;
  createdAt: string;
}

export type MembershipTier = 'FREE' | 'CLEAN_DINE_CLUB';

export interface LoyaltyAccountDto {
  userId: string;
  pointsBalance: number;
  equivalentPaise: number;
  tier: MembershipTier;
  memberSince: string;
  recentEntries: LoyaltyLedgerEntryDto[];
}

export interface MembershipSubscriptionDto {
  subscriptionId: string;
  userId: string;
  tier: MembershipTier;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  startedAt: string;
  expiresAt: string;
  benefits: string[];
}
