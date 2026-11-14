import { randomUUID } from 'node:crypto';
import { AppError } from '../../middleware/error-handler';
import type {
  CampaignDto,
  CouponDto,
  CouponValidationResultDto,
  ReferralInfoDto,
  LoyaltyAccountDto,
  LoyaltyLedgerEntryDto,
  MembershipSubscriptionDto,
  MembershipTier,
} from '@bhojora/shared';
import type { PromotionsStore } from './promotions.store';
import {
  type CampaignRecord,
  type PromotionCouponRecord,
  type ReferralRecord,
  type LoyaltyLedgerRecord,
  type MembershipSubscriptionRecord,
  toCampaignDto,
  toCouponDto,
  toLoyaltyLedgerEntryDto,
  toMembershipSubscriptionDto,
} from './promotions.types';

export interface PromotionsServiceOptions {
  promotionsStore: PromotionsStore;
  clock?: { now(): Date };
}

export class PromotionsService {
  private readonly store: PromotionsStore;
  private readonly clock: { now(): Date };

  constructor(options: PromotionsServiceOptions) {
    this.store = options.promotionsStore;
    this.clock = options.clock ?? { now: () => new Date() };
  }

  // 1. Campaign Management
  async createCampaign(input: {
    title: string;
    description: string;
    budgetCapPaise: number;
    validFrom: Date;
    validUntil: Date;
  }): Promise<CampaignDto> {
    const now = this.clock.now();
    const campaignId = `camp_${randomUUID()}`;
    const record: CampaignRecord = {
      campaignId,
      title: input.title,
      description: input.description,
      budgetCapPaise: input.budgetCapPaise,
      currentSpendPaise: 0,
      status: 'ACTIVE',
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.store.createCampaign(record);
    return toCampaignDto(saved);
  }

  // 2. Coupon Management
  async createCoupon(input: {
    campaignId?: string;
    code: string;
    title: string;
    description: string;
    termsConditions: string[];
    discountType: 'FLAT_PAISE' | 'PERCENT_BPS';
    discountValue: number;
    minOrderSubtotalPaise?: number;
    maxDiscountPaise: number;
    platformShareBps?: number;
    restaurantShareBps?: number;
    applicableZones?: string[];
    totalRedemptionLimit?: number;
    perUserRedemptionLimit?: number;
    firstOrderOnly?: boolean;
    validFrom: Date;
    validUntil: Date;
  }): Promise<CouponDto> {
    const now = this.clock.now();
    const couponId = `coup_${randomUUID()}`;
    const platformBps = input.platformShareBps ?? 10000;
    const restaurantBps = input.restaurantShareBps ?? 10000 - platformBps;

    const record: PromotionCouponRecord = {
      couponId,
      campaignId: input.campaignId ?? null,
      code: input.code.trim().toUpperCase(),
      title: input.title,
      description: input.description,
      termsConditions: input.termsConditions,
      discountType: input.discountType,
      discountValue: input.discountValue,
      minOrderSubtotalPaise: input.minOrderSubtotalPaise ?? 0,
      maxDiscountPaise: input.maxDiscountPaise,
      platformShareBps: platformBps,
      restaurantShareBps: restaurantBps,
      applicableZones: input.applicableZones ?? [],
      totalRedemptionLimit: input.totalRedemptionLimit ?? 10000,
      perUserRedemptionLimit: input.perUserRedemptionLimit ?? 1,
      currentRedemptionCount: 0,
      firstOrderOnly: input.firstOrderOnly ?? false,
      isActive: true,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      userRedemptions: [],
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.store.upsertCoupon(record);
    return toCouponDto(saved);
  }

  async listPublicCoupons(): Promise<CouponDto[]> {
    const now = this.clock.now();
    const coupons = await this.store.listActiveCoupons(now);
    return coupons.map(toCouponDto);
  }

  // 3. Coupon Validation (Eligibility, Budget & Abuse Controls)
  async validateCoupon(params: {
    code: string;
    userId: string;
    subtotalPaise: number;
    zoneId?: string;
    isFirstOrder?: boolean;
  }): Promise<CouponValidationResultDto> {
    const now = this.clock.now();
    const coupon = await this.store.getCouponByCode(params.code);

    if (!coupon || !coupon.isActive) {
      return {
        valid: false,
        discountPaise: 0,
        platformDiscountPaise: 0,
        restaurantDiscountPaise: 0,
        fundingSummary: 'Invalid or inactive coupon code',
        reason: 'Coupon does not exist or has been deactivated',
      };
    }

    // Expiry check
    if (now < coupon.validFrom || now > coupon.validUntil) {
      return {
        valid: false,
        discountPaise: 0,
        platformDiscountPaise: 0,
        restaurantDiscountPaise: 0,
        fundingSummary: 'Expired coupon code',
        reason: 'Coupon is outside its valid operational timeframe',
      };
    }

    // Minimum order check
    if (params.subtotalPaise < coupon.minOrderSubtotalPaise) {
      const neededInr = (coupon.minOrderSubtotalPaise / 100).toFixed(2);
      return {
        valid: false,
        discountPaise: 0,
        platformDiscountPaise: 0,
        restaurantDiscountPaise: 0,
        fundingSummary: `Minimum cart value of ₹${neededInr} required`,
        reason: `Cart subtotal is below minimum order requirement of ₹${neededInr}`,
      };
    }

    // First order eligibility check
    if (coupon.firstOrderOnly && !params.isFirstOrder) {
      return {
        valid: false,
        discountPaise: 0,
        platformDiscountPaise: 0,
        restaurantDiscountPaise: 0,
        fundingSummary: 'Valid for new customers only',
        reason: 'This promotion is strictly limited to first-time Bhojora orders',
      };
    }

    // Zone serviceability check
    if (
      coupon.applicableZones.length > 0 &&
      params.zoneId &&
      !coupon.applicableZones.includes(params.zoneId)
    ) {
      return {
        valid: false,
        discountPaise: 0,
        platformDiscountPaise: 0,
        restaurantDiscountPaise: 0,
        fundingSummary: `Applicable only in: ${coupon.applicableZones.join(', ')}`,
        reason: 'Coupon is not valid in selected delivery corridor',
      };
    }

    // Global redemption limit
    if (coupon.currentRedemptionCount >= coupon.totalRedemptionLimit) {
      return {
        valid: false,
        discountPaise: 0,
        platformDiscountPaise: 0,
        restaurantDiscountPaise: 0,
        fundingSummary: 'Offer exhausted',
        reason: 'Total campaign redemptions have reached the maximum ceiling',
      };
    }

    // Per-user abuse control
    const userRedemptionsCount = coupon.userRedemptions.filter(
      (r) => r.userId === params.userId,
    ).length;
    if (userRedemptionsCount >= coupon.perUserRedemptionLimit) {
      return {
        valid: false,
        discountPaise: 0,
        platformDiscountPaise: 0,
        restaurantDiscountPaise: 0,
        fundingSummary: `Used maximum ${coupon.perUserRedemptionLimit} time(s)`,
        reason: `You have already redeemed this promotion the maximum allowed ${coupon.perUserRedemptionLimit} time(s)`,
      };
    }

    // Calculate discount amount
    const rawDiscount =
      coupon.discountType === 'FLAT_PAISE'
        ? coupon.discountValue
        : Math.round((params.subtotalPaise * coupon.discountValue) / 10000);

    const discountPaise = Math.min(params.subtotalPaise, coupon.maxDiscountPaise, rawDiscount);

    // Campaign budget check
    if (coupon.campaignId) {
      const campaign = await this.store.getCampaignById(coupon.campaignId);
      if (campaign && campaign.currentSpendPaise + discountPaise > campaign.budgetCapPaise) {
        return {
          valid: false,
          discountPaise: 0,
          platformDiscountPaise: 0,
          restaurantDiscountPaise: 0,
          fundingSummary: 'Campaign budget reached',
          reason: 'Promotional budget for this campaign has been fully consumed',
        };
      }
    }

    // Transparent funding calculation
    const platformDiscountPaise = Math.round((discountPaise * coupon.platformShareBps) / 10000);
    const restaurantDiscountPaise = discountPaise - platformDiscountPaise;

    const couponDto = toCouponDto(coupon);

    return {
      valid: true,
      coupon: couponDto,
      discountPaise,
      platformDiscountPaise,
      restaurantDiscountPaise,
      fundingSummary: couponDto.fundingSummaryLabel,
    };
  }

  async recordRedemption(params: {
    code: string;
    userId: string;
    orderId: string;
    discountPaise: number;
  }): Promise<boolean> {
    const res = await this.store.recordCouponRedemption(params.code, {
      userId: params.userId,
      orderId: params.orderId,
      discountPaise: params.discountPaise,
      redeemedAt: this.clock.now(),
    });
    return res !== null;
  }

  // 4. Referral Program
  async getReferralInfo(userId: string): Promise<ReferralInfoDto> {
    const code = `BHOJ-${userId.slice(0, 4).toUpperCase()}-${userId.slice(-3).toUpperCase()}`;
    await this.store.registerUserReferralCode(userId, code);
    const referrals = await this.store.getReferralsByReferrer(userId);
    const successful = referrals.filter((r) => r.status === 'QUALIFIED' || r.status === 'REWARDED');

    const earnedPoints = successful.reduce((sum, r) => sum + r.rewardPoints, 0);
    const earnedPaise = successful.reduce((sum, r) => sum + r.rewardPaise, 0);

    return {
      referralCode: code,
      totalReferrals: referrals.length,
      successfulReferrals: successful.length,
      earnedPoints,
      earnedPaise,
      shareMessage: `Use my invite code ${code} on Bhojora for ₹50 off your first Kolkata food delivery from Verified Clean kitchens!`,
    };
  }

  async applyReferralCode(
    refereeUserId: string,
    referralCode: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedCode = referralCode.trim().toUpperCase();

    // Prevent self-referral
    const ownInfo = await this.getReferralInfo(refereeUserId);
    if (ownInfo.referralCode === normalizedCode) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Self-referral is prohibited: you cannot apply your own referral code',
      );
    }

    // Check if referee already applied a referral
    const existing = await this.store.getReferralForReferee(refereeUserId);
    if (existing) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'You have already applied a referral invite code on this account',
      );
    }

    const referralId = `ref_${randomUUID()}`;
    // Extract referrer identity or fallback
    const registeredReferrerId = await this.store.getUserIdByReferralCode(normalizedCode);
    const referrerUserId =
      registeredReferrerId ?? `user_${normalizedCode.replace(/[^A-Z0-9]/g, '').toLowerCase()}`;

    const record: ReferralRecord = {
      referralId,
      referrerUserId,
      refereeUserId,
      referralCode: normalizedCode,
      status: 'PENDING',
      rewardPoints: 100, // 100 points = ₹50
      rewardPaise: 5000,
      qualifyingOrderId: null,
      createdAt: this.clock.now(),
      qualifiedAt: null,
    };

    await this.store.createReferral(record);

    return {
      success: true,
      message:
        'Referral code applied! You will receive ₹50 in reward points upon completing your first order.',
    };
  }

  async qualifyReferral(refereeUserId: string, orderId: string): Promise<boolean> {
    const referral = await this.store.getReferralForReferee(refereeUserId);
    if (!referral || referral.status !== 'PENDING') return false;

    await this.store.updateReferralStatus(referral.referralId, 'QUALIFIED', orderId);

    // Credit referrer
    await this.creditLoyaltyPoints(
      referral.referrerUserId,
      referral.rewardPoints,
      'REFERRAL_BONUS',
      `Referral bonus for invitee completing first order #${orderId}`,
      orderId,
    );

    // Credit referee welcome bonus
    await this.creditLoyaltyPoints(
      refereeUserId,
      50, // 50 points = ₹25
      'REFERRAL_BONUS',
      `Welcome bonus for joining Bhojora via referral code ${referral.referralCode}`,
      orderId,
    );

    return true;
  }

  // 5. Loyalty Points Ledger (Double-Entry Ledger)
  async getLoyaltyAccount(userId: string): Promise<LoyaltyAccountDto> {
    const balance = await this.store.getLoyaltyBalance(userId);
    const ledger = await this.store.getLoyaltyLedger(userId, 10);
    const membership = await this.store.getMembershipSubscription(userId);

    const tier: MembershipTier =
      membership && membership.status === 'ACTIVE' ? membership.tier : 'FREE';

    return {
      userId,
      pointsBalance: balance,
      equivalentPaise: balance * 50, // 1 point = 50 paise (₹0.50)
      tier,
      memberSince:
        ledger.length > 0
          ? ledger[ledger.length - 1]!.createdAt.toISOString()
          : this.clock.now().toISOString(),
      recentEntries: ledger.map(toLoyaltyLedgerEntryDto),
    };
  }

  async earnOrderPoints(userId: string, orderId: string, subtotalPaise: number): Promise<number> {
    const membership = await this.store.getMembershipSubscription(userId);
    const isClub =
      membership && membership.status === 'ACTIVE' && membership.tier === 'CLEAN_DINE_CLUB';

    // Free tier: 5 points per ₹100 spent (5%). Clean Dine Club: 10 points per ₹100 (10%).
    const rate = isClub ? 10 : 5;
    const points = Math.max(1, Math.floor((subtotalPaise / 10000) * rate));

    await this.creditLoyaltyPoints(
      userId,
      points,
      'EARN',
      `Loyalty points earned on order #${orderId} (${isClub ? 'Club 2x Boost' : 'Standard'})`,
      orderId,
    );

    return points;
  }

  async redeemPoints(
    userId: string,
    pointsToRedeem: number,
    cartSubtotalPaise: number,
  ): Promise<{ pointsDeducted: number; discountPaise: number; balanceAfter: number }> {
    const currentBalance = await this.store.getLoyaltyBalance(userId);
    if (pointsToRedeem > currentBalance) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Insufficient loyalty points. Balance: ${currentBalance}, requested: ${pointsToRedeem}`,
      );
    }

    // Abuse control: Maximum 20% of cart subtotal can be settled via loyalty points
    const maxDiscountAllowedPaise = Math.round(cartSubtotalPaise * 0.2);
    const requestedPaise = pointsToRedeem * 50; // 1 point = 50 paise

    if (requestedPaise > maxDiscountAllowedPaise) {
      const maxPoints = Math.floor(maxDiscountAllowedPaise / 50);
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Loyalty point redemption capped at 20% of order subtotal (max ${maxPoints} points = ₹${(maxDiscountAllowedPaise / 100).toFixed(2)})`,
      );
    }

    const now = this.clock.now();
    const balanceAfter = currentBalance - pointsToRedeem;
    const entryId = `ledg_${randomUUID()}`;

    const record: LoyaltyLedgerRecord = {
      entryId,
      userId,
      entryType: 'REDEEM',
      points: pointsToRedeem,
      equivalentPaise: requestedPaise,
      orderId: null,
      reason: `Redeemed ${pointsToRedeem} loyalty points on checkout`,
      balanceAfter,
      createdAt: now,
    };

    await this.store.appendLoyaltyEntry(record);

    return {
      pointsDeducted: pointsToRedeem,
      discountPaise: requestedPaise,
      balanceAfter,
    };
  }

  private async creditLoyaltyPoints(
    userId: string,
    points: number,
    entryType: 'EARN' | 'REFERRAL_BONUS' | 'ADJUSTMENT',
    reason: string,
    orderId?: string,
  ): Promise<LoyaltyLedgerEntryDto> {
    const currentBalance = await this.store.getLoyaltyBalance(userId);
    const balanceAfter = currentBalance + points;
    const now = this.clock.now();
    const entryId = `ledg_${randomUUID()}`;

    const record: LoyaltyLedgerRecord = {
      entryId,
      userId,
      entryType,
      points,
      equivalentPaise: points * 50,
      orderId: orderId ?? null,
      reason,
      balanceAfter,
      createdAt: now,
    };

    const saved = await this.store.appendLoyaltyEntry(record);
    return toLoyaltyLedgerEntryDto(saved);
  }

  // 6. Membership Foundations (Clean Dine Club)
  async getMembership(userId: string): Promise<MembershipSubscriptionDto> {
    const subscription = await this.store.getMembershipSubscription(userId);
    if (!subscription) {
      return {
        subscriptionId: `free_${userId}`,
        userId,
        tier: 'FREE',
        status: 'ACTIVE',
        startedAt: this.clock.now().toISOString(),
        expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(),
        benefits: ['Standard Bhojora delivery', 'Earn 5 loyalty points per ₹100 spent'],
      };
    }
    return toMembershipSubscriptionDto(subscription);
  }

  async subscribeMembership(
    userId: string,
    tier: MembershipTier,
    durationMonths = 3,
  ): Promise<MembershipSubscriptionDto> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + durationMonths * 30 * 86400000);
    const subscriptionId = `sub_${randomUUID()}`;

    const record: MembershipSubscriptionRecord = {
      subscriptionId,
      userId,
      tier,
      status: 'ACTIVE',
      startedAt: now,
      expiresAt,
      autoRenew: true,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.store.saveMembershipSubscription(record);
    return toMembershipSubscriptionDto(saved);
  }
}
