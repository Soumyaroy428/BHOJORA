import type { Connection, Model } from 'mongoose';
import { Schema, model, models } from 'mongoose';
import type {
  CampaignRecord,
  PromotionCouponRecord,
  ReferralRecord,
  LoyaltyLedgerRecord,
  MembershipSubscriptionRecord,
  CouponUserRedemption,
} from './promotions.types';

export interface PromotionsStore {
  createCampaign(campaign: CampaignRecord): Promise<CampaignRecord>;
  getCampaignById(campaignId: string): Promise<CampaignRecord | null>;
  listActiveCampaigns(now: Date): Promise<CampaignRecord[]>;
  updateCampaignSpend(campaignId: string, addSpendPaise: number): Promise<CampaignRecord | null>;
  upsertCoupon(coupon: PromotionCouponRecord): Promise<PromotionCouponRecord>;
  getCouponByCode(code: string): Promise<PromotionCouponRecord | null>;
  listActiveCoupons(now: Date): Promise<PromotionCouponRecord[]>;
  recordCouponRedemption(
    code: string,
    redemption: CouponUserRedemption,
  ): Promise<PromotionCouponRecord | null>;
  createReferral(referral: ReferralRecord): Promise<ReferralRecord>;
  getReferralByCode(referralCode: string): Promise<ReferralRecord | null>;
  getReferralsByReferrer(referrerUserId: string): Promise<ReferralRecord[]>;
  getReferralForReferee(refereeUserId: string): Promise<ReferralRecord | null>;
  registerUserReferralCode(userId: string, code: string): Promise<void>;
  getUserIdByReferralCode(code: string): Promise<string | null>;
  updateReferralStatus(
    referralId: string,
    status: 'QUALIFIED' | 'REWARDED',
    orderId?: string,
  ): Promise<ReferralRecord | null>;
  appendLoyaltyEntry(entry: LoyaltyLedgerRecord): Promise<LoyaltyLedgerRecord>;
  getLoyaltyBalance(userId: string): Promise<number>;
  getLoyaltyLedger(userId: string, limit?: number): Promise<LoyaltyLedgerRecord[]>;
  getMembershipSubscription(userId: string): Promise<MembershipSubscriptionRecord | null>;
  saveMembershipSubscription(
    subscription: MembershipSubscriptionRecord,
  ): Promise<MembershipSubscriptionRecord>;
}

export class InMemoryPromotionsStore implements PromotionsStore {
  private readonly campaigns = new Map<string, CampaignRecord>();
  private readonly coupons = new Map<string, PromotionCouponRecord>();
  private readonly referrals = new Map<string, ReferralRecord>();
  private readonly userReferralCodes = new Map<string, string>();
  private readonly loyaltyLedgers: LoyaltyLedgerRecord[] = [];
  private readonly memberships = new Map<string, MembershipSubscriptionRecord>();

  async createCampaign(campaign: CampaignRecord): Promise<CampaignRecord> {
    const copy = structuredClone(campaign);
    this.campaigns.set(copy.campaignId, copy);
    return structuredClone(copy);
  }

  async getCampaignById(campaignId: string): Promise<CampaignRecord | null> {
    const found = this.campaigns.get(campaignId);
    return found ? structuredClone(found) : null;
  }

  async listActiveCampaigns(now: Date): Promise<CampaignRecord[]> {
    return Array.from(this.campaigns.values())
      .filter((c) => c.status === 'ACTIVE' && now >= c.validFrom && now <= c.validUntil)
      .map((c) => structuredClone(c));
  }

  async updateCampaignSpend(
    campaignId: string,
    addSpendPaise: number,
  ): Promise<CampaignRecord | null> {
    const found = this.campaigns.get(campaignId);
    if (!found) return null;

    found.currentSpendPaise += addSpendPaise;
    if (found.currentSpendPaise >= found.budgetCapPaise) {
      found.status = 'EXHAUSTED';
    }
    found.updatedAt = new Date();
    return structuredClone(found);
  }

  async upsertCoupon(coupon: PromotionCouponRecord): Promise<PromotionCouponRecord> {
    const copy = structuredClone(coupon);
    this.coupons.set(copy.code.toUpperCase(), copy);
    return structuredClone(copy);
  }

  async getCouponByCode(code: string): Promise<PromotionCouponRecord | null> {
    const found = this.coupons.get(code.toUpperCase());
    return found ? structuredClone(found) : null;
  }

  async listActiveCoupons(now: Date): Promise<PromotionCouponRecord[]> {
    return Array.from(this.coupons.values())
      .filter((c) => c.isActive && now >= c.validFrom && now <= c.validUntil)
      .map((c) => structuredClone(c));
  }

  async recordCouponRedemption(
    code: string,
    redemption: CouponUserRedemption,
  ): Promise<PromotionCouponRecord | null> {
    const found = this.coupons.get(code.toUpperCase());
    if (!found) return null;

    found.userRedemptions.push(structuredClone(redemption));
    found.currentRedemptionCount++;
    found.updatedAt = new Date();

    if (found.campaignId) {
      await this.updateCampaignSpend(found.campaignId, redemption.discountPaise);
    }

    return structuredClone(found);
  }

  async createReferral(referral: ReferralRecord): Promise<ReferralRecord> {
    const copy = structuredClone(referral);
    this.referrals.set(copy.referralId, copy);
    return structuredClone(copy);
  }

  async getReferralByCode(referralCode: string): Promise<ReferralRecord | null> {
    const upper = referralCode.toUpperCase();
    const found = Array.from(this.referrals.values()).find((r) => r.referralCode === upper);
    return found ? structuredClone(found) : null;
  }

  async getReferralsByReferrer(referrerUserId: string): Promise<ReferralRecord[]> {
    return Array.from(this.referrals.values())
      .filter((r) => r.referrerUserId === referrerUserId)
      .map((r) => structuredClone(r));
  }

  async getReferralForReferee(refereeUserId: string): Promise<ReferralRecord | null> {
    const found = Array.from(this.referrals.values()).find(
      (r) => r.refereeUserId === refereeUserId,
    );
    return found ? structuredClone(found) : null;
  }

  async registerUserReferralCode(userId: string, code: string): Promise<void> {
    this.userReferralCodes.set(code.toUpperCase(), userId);
  }

  async getUserIdByReferralCode(code: string): Promise<string | null> {
    return this.userReferralCodes.get(code.toUpperCase()) ?? null;
  }

  async updateReferralStatus(
    referralId: string,
    status: 'QUALIFIED' | 'REWARDED',
    orderId?: string,
  ): Promise<ReferralRecord | null> {
    const found = this.referrals.get(referralId);
    if (!found) return null;

    found.status = status;
    if (orderId) found.qualifyingOrderId = orderId;
    if (status === 'QUALIFIED' || status === 'REWARDED') {
      found.qualifiedAt = new Date();
    }
    return structuredClone(found);
  }

  async appendLoyaltyEntry(entry: LoyaltyLedgerRecord): Promise<LoyaltyLedgerRecord> {
    const copy = structuredClone(entry);
    this.loyaltyLedgers.push(copy);
    return structuredClone(copy);
  }

  async getLoyaltyBalance(userId: string): Promise<number> {
    const entries = this.loyaltyLedgers.filter((l) => l.userId === userId);
    return entries.reduce((acc, entry) => {
      if (entry.entryType === 'EARN' || entry.entryType === 'REFERRAL_BONUS') {
        return acc + entry.points;
      }
      if (entry.entryType === 'REDEEM' || entry.entryType === 'EXPIRE') {
        return Math.max(0, acc - entry.points);
      }
      return acc + entry.points;
    }, 0);
  }

  async getLoyaltyLedger(userId: string, limit = 50): Promise<LoyaltyLedgerRecord[]> {
    return this.loyaltyLedgers
      .filter((l) => l.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((l) => structuredClone(l));
  }

  async getMembershipSubscription(userId: string): Promise<MembershipSubscriptionRecord | null> {
    const found = this.memberships.get(userId);
    return found ? structuredClone(found) : null;
  }

  async saveMembershipSubscription(
    subscription: MembershipSubscriptionRecord,
  ): Promise<MembershipSubscriptionRecord> {
    const copy = structuredClone(subscription);
    this.memberships.set(copy.userId, copy);
    return structuredClone(copy);
  }
}

// Mongoose Schemas & Store
const campaignSchema = new Schema(
  {
    campaignId: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    budgetCapPaise: { type: Number, required: true },
    currentSpendPaise: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      enum: ['DRAFT', 'ACTIVE', 'PAUSED', 'EXHAUSTED', 'EXPIRED'],
      required: true,
      default: 'ACTIVE',
    },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'campaigns' },
);

const couponUserRedemptionSchema = new Schema(
  {
    userId: { type: String, required: true },
    orderId: { type: String, required: true },
    discountPaise: { type: Number, required: true },
    redeemedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const promotionCouponSchema = new Schema(
  {
    couponId: { type: String, required: true, unique: true },
    campaignId: { type: String, default: null },
    code: { type: String, required: true, unique: true, uppercase: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    termsConditions: { type: [String], required: true, default: [] },
    discountType: { type: String, enum: ['FLAT_PAISE', 'PERCENT_BPS'], required: true },
    discountValue: { type: Number, required: true },
    minOrderSubtotalPaise: { type: Number, required: true, default: 0 },
    maxDiscountPaise: { type: Number, required: true },
    platformShareBps: { type: Number, required: true, default: 10000 },
    restaurantShareBps: { type: Number, required: true, default: 0 },
    applicableZones: { type: [String], default: [] },
    totalRedemptionLimit: { type: Number, required: true, default: 10000 },
    perUserRedemptionLimit: { type: Number, required: true, default: 1 },
    currentRedemptionCount: { type: Number, required: true, default: 0 },
    firstOrderOnly: { type: Boolean, required: true, default: false },
    isActive: { type: Boolean, required: true, default: true },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
    userRedemptions: { type: [couponUserRedemptionSchema], default: [] },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'coupons' },
);

const referralSchema = new Schema(
  {
    referralId: { type: String, required: true, unique: true },
    referrerUserId: { type: String, required: true, index: true },
    refereeUserId: { type: String, required: true, index: true },
    referralCode: { type: String, required: true, uppercase: true, index: true },
    status: { type: String, enum: ['PENDING', 'QUALIFIED', 'REWARDED'], required: true },
    rewardPoints: { type: Number, required: true, default: 100 },
    rewardPaise: { type: Number, required: true, default: 5000 }, // ₹50.00
    qualifyingOrderId: { type: String, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
    qualifiedAt: { type: Date, default: null },
  },
  { collection: 'referrals' },
);

const loyaltyLedgerSchema = new Schema(
  {
    entryId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    entryType: {
      type: String,
      enum: ['EARN', 'REDEEM', 'EXPIRE', 'ADJUSTMENT', 'REFERRAL_BONUS'],
      required: true,
    },
    points: { type: Number, required: true },
    equivalentPaise: { type: Number, required: true },
    orderId: { type: String, default: null },
    reason: { type: String, required: true },
    balanceAfter: { type: Number, required: true },
    createdAt: { type: Date, required: true, default: Date.now, index: true },
  },
  { collection: 'loyalty_ledger' },
);

const membershipSubscriptionSchema = new Schema(
  {
    subscriptionId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, unique: true, index: true },
    tier: { type: String, enum: ['FREE', 'CLEAN_DINE_CLUB'], required: true },
    status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'CANCELLED'], required: true },
    startedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
    autoRenew: { type: Boolean, required: true, default: true },
    createdAt: { type: Date, required: true, default: Date.now },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'membership_subscriptions' },
);

type CampaignDocument = CampaignRecord & { _id?: unknown };
type PromotionCouponDocument = PromotionCouponRecord & { _id?: unknown };
type ReferralDocument = ReferralRecord & { _id?: unknown };
type LoyaltyLedgerDocument = LoyaltyLedgerRecord & { _id?: unknown };
type MembershipDocument = MembershipSubscriptionRecord & { _id?: unknown };

export class MongoosePromotionsStore implements PromotionsStore {
  private readonly campaignModel: Model<CampaignDocument>;
  private readonly couponModel: Model<PromotionCouponDocument>;
  private readonly referralModel: Model<ReferralDocument>;
  private readonly loyaltyModel: Model<LoyaltyLedgerDocument>;
  private readonly membershipModel: Model<MembershipDocument>;
  private readonly userReferralCodesCache = new Map<string, string>();

  constructor(_connection: Connection) {
    this.campaignModel =
      (models.Campaign as Model<CampaignDocument> | undefined) ??
      model<CampaignDocument>('Campaign', campaignSchema);
    this.couponModel =
      (models.PromotionCoupon as Model<PromotionCouponDocument> | undefined) ??
      model<PromotionCouponDocument>('PromotionCoupon', promotionCouponSchema);
    this.referralModel =
      (models.Referral as Model<ReferralDocument> | undefined) ??
      model<ReferralDocument>('Referral', referralSchema);
    this.loyaltyModel =
      (models.LoyaltyLedger as Model<LoyaltyLedgerDocument> | undefined) ??
      model<LoyaltyLedgerDocument>('LoyaltyLedger', loyaltyLedgerSchema);
    this.membershipModel =
      (models.MembershipSubscription as Model<MembershipDocument> | undefined) ??
      model<MembershipDocument>('MembershipSubscription', membershipSubscriptionSchema);
  }

  async createCampaign(campaign: CampaignRecord): Promise<CampaignRecord> {
    const doc = await this.campaignModel.create(campaign);
    return doc.toObject() as CampaignRecord;
  }

  async getCampaignById(campaignId: string): Promise<CampaignRecord | null> {
    const found = await this.campaignModel.findOne({ campaignId }).lean();
    return found ? (found as CampaignRecord) : null;
  }

  async listActiveCampaigns(now: Date): Promise<CampaignRecord[]> {
    const docs = await this.campaignModel
      .find({
        status: 'ACTIVE',
        validFrom: { $lte: now },
        validUntil: { $gte: now },
      })
      .lean();
    return docs as CampaignRecord[];
  }

  async updateCampaignSpend(
    campaignId: string,
    addSpendPaise: number,
  ): Promise<CampaignRecord | null> {
    const campaign = await this.getCampaignById(campaignId);
    if (!campaign) return null;

    const newSpend = campaign.currentSpendPaise + addSpendPaise;
    const isExhausted = newSpend >= campaign.budgetCapPaise;

    const updated = await this.campaignModel
      .findOneAndUpdate(
        { campaignId },
        {
          $inc: { currentSpendPaise: addSpendPaise },
          $set: {
            status: isExhausted ? 'EXHAUSTED' : campaign.status,
            updatedAt: new Date(),
          },
        },
        { new: true },
      )
      .lean();
    return updated ? (updated as CampaignRecord) : null;
  }

  async upsertCoupon(coupon: PromotionCouponRecord): Promise<PromotionCouponRecord> {
    const updated = await this.couponModel
      .findOneAndUpdate(
        { code: coupon.code.toUpperCase() },
        { $set: coupon },
        { new: true, upsert: true },
      )
      .lean();
    return updated as PromotionCouponRecord;
  }

  async getCouponByCode(code: string): Promise<PromotionCouponRecord | null> {
    const found = await this.couponModel.findOne({ code: code.toUpperCase() }).lean();
    return found ? (found as PromotionCouponRecord) : null;
  }

  async listActiveCoupons(now: Date): Promise<PromotionCouponRecord[]> {
    const docs = await this.couponModel
      .find({
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
      })
      .lean();
    return docs as PromotionCouponRecord[];
  }

  async recordCouponRedemption(
    code: string,
    redemption: CouponUserRedemption,
  ): Promise<PromotionCouponRecord | null> {
    const updated = await this.couponModel
      .findOneAndUpdate(
        { code: code.toUpperCase() },
        {
          $push: { userRedemptions: redemption },
          $inc: { currentRedemptionCount: 1 },
          $set: { updatedAt: new Date() },
        },
        { new: true },
      )
      .lean();

    if (updated?.campaignId) {
      await this.updateCampaignSpend(updated.campaignId, redemption.discountPaise);
    }

    return updated ? (updated as PromotionCouponRecord) : null;
  }

  async createReferral(referral: ReferralRecord): Promise<ReferralRecord> {
    const doc = await this.referralModel.create(referral);
    return doc.toObject() as ReferralRecord;
  }

  async getReferralByCode(referralCode: string): Promise<ReferralRecord | null> {
    const found = await this.referralModel
      .findOne({ referralCode: referralCode.toUpperCase() })
      .lean();
    return found ? (found as ReferralRecord) : null;
  }

  async getReferralsByReferrer(referrerUserId: string): Promise<ReferralRecord[]> {
    const docs = await this.referralModel.find({ referrerUserId }).lean();
    return docs as ReferralRecord[];
  }

  async getReferralForReferee(refereeUserId: string): Promise<ReferralRecord | null> {
    const found = await this.referralModel.findOne({ refereeUserId }).lean();
    return found ? (found as ReferralRecord) : null;
  }

  async registerUserReferralCode(userId: string, code: string): Promise<void> {
    this.userReferralCodesCache.set(code.toUpperCase(), userId);
  }

  async getUserIdByReferralCode(code: string): Promise<string | null> {
    return this.userReferralCodesCache.get(code.toUpperCase()) ?? null;
  }

  async updateReferralStatus(
    referralId: string,
    status: 'QUALIFIED' | 'REWARDED',
    orderId?: string,
  ): Promise<ReferralRecord | null> {
    const patch: Record<string, unknown> = {
      status,
      qualifiedAt: new Date(),
    };
    if (orderId) patch.qualifyingOrderId = orderId;

    const updated = await this.referralModel
      .findOneAndUpdate({ referralId }, { $set: patch }, { new: true })
      .lean();
    return updated ? (updated as ReferralRecord) : null;
  }

  async appendLoyaltyEntry(entry: LoyaltyLedgerRecord): Promise<LoyaltyLedgerRecord> {
    const doc = await this.loyaltyModel.create(entry);
    return doc.toObject() as LoyaltyLedgerRecord;
  }

  async getLoyaltyBalance(userId: string): Promise<number> {
    const docs = await this.loyaltyModel.find({ userId }).lean();
    return docs.reduce((acc, entry) => {
      if (entry.entryType === 'EARN' || entry.entryType === 'REFERRAL_BONUS') {
        return acc + entry.points;
      }
      if (entry.entryType === 'REDEEM' || entry.entryType === 'EXPIRE') {
        return Math.max(0, acc - entry.points);
      }
      return acc + entry.points;
    }, 0);
  }

  async getLoyaltyLedger(userId: string, limit = 50): Promise<LoyaltyLedgerRecord[]> {
    const docs = await this.loyaltyModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs as LoyaltyLedgerRecord[];
  }

  async getMembershipSubscription(userId: string): Promise<MembershipSubscriptionRecord | null> {
    const found = await this.membershipModel.findOne({ userId }).lean();
    return found ? (found as MembershipSubscriptionRecord) : null;
  }

  async saveMembershipSubscription(
    subscription: MembershipSubscriptionRecord,
  ): Promise<MembershipSubscriptionRecord> {
    const updated = await this.membershipModel
      .findOneAndUpdate(
        { userId: subscription.userId },
        { $set: subscription },
        { new: true, upsert: true },
      )
      .lean();
    return updated as MembershipSubscriptionRecord;
  }
}
