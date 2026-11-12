import type {
  CheckoutPricingBreakdownDto,
  CouponDiscountType,
  CouponFundingSplitDto,
  GstTaxSlab,
  PlatformInspectionStatus,
  PriceDriftWarningDto,
  QuoteAddressSnapshotDto,
  QuoteLifecycleStatus,
  QuoteLineItemDto,
} from '@bhojora/shared';
import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import {
  applyBaseSchemaConventions,
  COLLECTION_NAMES,
  paiseField,
} from '../../database/conventions';
import { GST_TAX_SLABS } from '../catalog/catalog.types';
import { KOLKATA_ZONE_IDS, type KolkataZoneId } from '../customer/customer.types';
import type { CouponRecord, PricingQuoteRecord, PricingStore } from './pricing.types';

const couponRedemptionSchema = new Schema(
  {
    userId: { type: String, required: true, trim: true, maxlength: 80 },
    count: { type: Number, required: true, min: 0 },
    lastRedeemedAt: { type: Date, required: true },
  },
  { _id: false },
);

const couponSchema = applyBaseSchemaConventions(
  new Schema({
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 32 },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: true, trim: true, maxlength: 300 },
    discountType: { type: String, enum: ['FLAT_PAISE', 'PERCENT_BPS'], required: true },
    discountValue: paiseField(),
    maxDiscountPaise: paiseField(),
    minOrderSubtotalPaise: paiseField(),
    platformShareBps: { type: Number, required: true, min: 0, max: 10000 },
    restaurantShareBps: { type: Number, required: true, min: 0, max: 10000 },
    maxRedemptionsPerUser: { type: Number, required: true, min: 1 },
    maxGlobalRedemptions: { type: Number, required: true, min: 1 },
    totalRedemptions: { type: Number, required: true, min: 0, default: 0 },
    userRedemptions: { type: [couponRedemptionSchema], required: true, default: [] },
    isActive: { type: Boolean, required: true, default: true },
    validFrom: { type: Date, required: true },
    validUntil: { type: Date, required: true },
  }),
);

const quoteLineItemSchema = new Schema(
  {
    cartItemId: { type: String, required: true, trim: true, maxlength: 80 },
    menuItemId: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    quantity: { type: Number, required: true, min: 1 },
    gstTaxSlab: { type: String, enum: GST_TAX_SLABS, required: true },
    unitPricePaise: paiseField(),
    lineSubtotalPaise: paiseField(),
    gstTaxPaise: paiseField(),
  },
  { _id: false },
);

const pricingQuoteSchema = applyBaseSchemaConventions(
  new Schema({
    quoteId: { type: String, required: true, trim: true, maxlength: 80 },
    customerId: { type: String, required: true, trim: true, maxlength: 80 },
    outletId: { type: String, required: true, trim: true, maxlength: 80 },
    outletName: { type: String, required: true, trim: true, maxlength: 160 },
    brandName: { type: String, required: true, trim: true, maxlength: 160 },
    outletInspectionStatus: { type: String, required: true, maxlength: 32 },
    outletSafetyScore: { type: Number, required: false, default: null },
    status: { type: String, enum: ['ACTIVE', 'EXPIRED', 'CONSUMED'], required: true },
    ttlSeconds: { type: Number, required: true, default: 600 },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    signatureAlgorithm: { type: String, required: true, default: 'HMAC-SHA256' },
    signature: { type: String, required: true, maxlength: 128 },
    distanceMeters: { type: Number, required: true, min: 0 },
    estimatedDeliveryMinutes: { type: Number, required: true, min: 1 },
    addressSnapshot: {
      addressId: { type: String, required: false, default: null },
      label: { type: String, required: true, maxlength: 80 },
      streetAddress: { type: String, required: true, maxlength: 240 },
      locality: { type: String, required: true, maxlength: 120 },
      city: { type: String, required: true, maxlength: 80 },
      zoneId: { type: String, enum: KOLKATA_ZONE_IDS, required: false, default: null },
      coordinates: { type: [Number], required: true },
    },
    lineItems: { type: [quoteLineItemSchema], required: true },
    priceDriftDetected: { type: Boolean, required: true, default: false },
    priceDriftWarnings: { type: [Schema.Types.Mixed], required: true, default: [] },
    pricingBreakdown: {
      itemsSubtotalPaise: paiseField(),
      discountPaise: paiseField(),
      discountedSubtotalPaise: paiseField(),
      packagingChargePaise: paiseField(),
      deliveryBaseFeePaise: paiseField(),
      deliveryDistanceFeePaise: paiseField(),
      deliveryFeePaise: paiseField(),
      platformFeePaise: paiseField(),
      taxableSubtotalPaise: paiseField(),
      gstTaxPaise: paiseField(),
      cgstPaise: paiseField(),
      sgstPaise: paiseField(),
      tipPaise: paiseField(),
      totalPayablePaise: paiseField(),
      formattedTotalPayableInr: { type: String, required: true, maxlength: 40 },
    },
    couponAllocation: { type: Schema.Types.Mixed, required: false, default: null },
  }),
);

export function getDefaultPilotCouponsSeed(now = new Date()): CouponRecord[] {
  const validFrom = new Date('2026-01-01T00:00:00.000Z');
  const validUntil = new Date('2028-12-31T23:59:59.000Z');
  return [
    {
      code: 'BHOJORA100',
      title: '₹100 Off Kolkata Welcome Offer',
      description: 'Flat ₹100 off on orders ₹400 and above (60% platform, 40% restaurant funded).',
      discountType: 'FLAT_PAISE',
      discountValue: 10000,
      maxDiscountPaise: 10000,
      minOrderSubtotalPaise: 40000,
      platformShareBps: 6000,
      restaurantShareBps: 4000,
      maxRedemptionsPerUser: 1,
      maxGlobalRedemptions: 10000,
      totalRedemptions: 0,
      userRedemptions: [],
      isActive: true,
      validFrom,
      validUntil,
      createdAt: now,
      updatedAt: now,
    },
    {
      code: 'KOLKATA20',
      title: '20% Off Up To ₹80',
      description:
        '20% savings up to ₹80 on orders ₹250 and above (50% platform, 50% restaurant funded).',
      discountType: 'PERCENT_BPS',
      discountValue: 2000,
      maxDiscountPaise: 8000,
      minOrderSubtotalPaise: 25000,
      platformShareBps: 5000,
      restaurantShareBps: 5000,
      maxRedemptionsPerUser: 3,
      maxGlobalRedemptions: 10000,
      totalRedemptions: 0,
      userRedemptions: [],
      isActive: true,
      validFrom,
      validUntil,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function mapPlainCoupon(doc: Record<string, unknown>): CouponRecord {
  const rawUserRedemptions = Array.isArray(doc['userRedemptions']) ? doc['userRedemptions'] : [];
  return {
    code: String(doc['code'] ?? ''),
    title: String(doc['title'] ?? ''),
    description: String(doc['description'] ?? ''),
    discountType: doc['discountType'] as CouponDiscountType,
    discountValue: Number(doc['discountValue'] ?? 0),
    maxDiscountPaise: Number(doc['maxDiscountPaise'] ?? 0),
    minOrderSubtotalPaise: Number(doc['minOrderSubtotalPaise'] ?? 0),
    platformShareBps: Number(doc['platformShareBps'] ?? 0),
    restaurantShareBps: Number(doc['restaurantShareBps'] ?? 0),
    maxRedemptionsPerUser: Number(doc['maxRedemptionsPerUser'] ?? 1),
    maxGlobalRedemptions: Number(doc['maxGlobalRedemptions'] ?? 1),
    totalRedemptions: Number(doc['totalRedemptions'] ?? 0),
    userRedemptions: rawUserRedemptions.map((entry) => {
      const rec = entry as Record<string, unknown>;
      return {
        userId: String(rec['userId'] ?? ''),
        count: Number(rec['count'] ?? 0),
        lastRedeemedAt: rec['lastRedeemedAt'] instanceof Date ? rec['lastRedeemedAt'] : new Date(),
      };
    }),
    isActive: Boolean(doc['isActive']),
    validFrom: doc['validFrom'] instanceof Date ? doc['validFrom'] : new Date(),
    validUntil: doc['validUntil'] instanceof Date ? doc['validUntil'] : new Date(),
    createdAt: doc['createdAt'] instanceof Date ? doc['createdAt'] : new Date(),
    updatedAt: doc['updatedAt'] instanceof Date ? doc['updatedAt'] : new Date(),
  };
}

function cloneCouponRecord(record: CouponRecord): CouponRecord {
  return {
    ...record,
    userRedemptions: record.userRedemptions.map((u) => ({
      ...u,
      lastRedeemedAt: new Date(u.lastRedeemedAt.getTime()),
    })),
    validFrom: new Date(record.validFrom.getTime()),
    validUntil: new Date(record.validUntil.getTime()),
    createdAt: new Date(record.createdAt.getTime()),
    updatedAt: new Date(record.updatedAt.getTime()),
  };
}

function mapPlainQuote(doc: Record<string, unknown>): PricingQuoteRecord {
  const addr = (doc['addressSnapshot'] ?? {}) as Record<string, unknown>;
  const coordsRaw = Array.isArray(addr['coordinates']) ? addr['coordinates'] : [88.3639, 22.5726];
  const addressSnapshot: QuoteAddressSnapshotDto = {
    addressId: typeof addr['addressId'] === 'string' ? addr['addressId'] : null,
    label: String(addr['label'] ?? 'Kolkata'),
    streetAddress: String(addr['streetAddress'] ?? ''),
    locality: String(addr['locality'] ?? ''),
    city: String(addr['city'] ?? 'Kolkata'),
    zoneId: typeof addr['zoneId'] === 'string' ? (addr['zoneId'] as KolkataZoneId) : null,
    coordinates: [Number(coordsRaw[0] ?? 88.3639), Number(coordsRaw[1] ?? 22.5726)],
  };

  const rawLines = Array.isArray(doc['lineItems']) ? doc['lineItems'] : [];
  const lineItems: QuoteLineItemDto[] = rawLines.map((entry) => {
    const rec = entry as Record<string, unknown>;
    return {
      cartItemId: String(rec['cartItemId'] ?? ''),
      menuItemId: String(rec['menuItemId'] ?? ''),
      title: String(rec['title'] ?? ''),
      quantity: Number(rec['quantity'] ?? 1),
      gstTaxSlab: (rec['gstTaxSlab'] as GstTaxSlab) ?? 'RESTAURANT_5_PCT',
      unitPricePaise: Number(rec['unitPricePaise'] ?? 0),
      lineSubtotalPaise: Number(rec['lineSubtotalPaise'] ?? 0),
      gstTaxPaise: Number(rec['gstTaxPaise'] ?? 0),
    };
  });

  const bd = (doc['pricingBreakdown'] ?? {}) as Record<string, unknown>;
  const pricingBreakdown: CheckoutPricingBreakdownDto = {
    itemsSubtotalPaise: Number(bd['itemsSubtotalPaise'] ?? 0),
    discountPaise: Number(bd['discountPaise'] ?? 0),
    discountedSubtotalPaise: Number(bd['discountedSubtotalPaise'] ?? 0),
    packagingChargePaise: Number(bd['packagingChargePaise'] ?? 0),
    deliveryBaseFeePaise: Number(bd['deliveryBaseFeePaise'] ?? 0),
    deliveryDistanceFeePaise: Number(bd['deliveryDistanceFeePaise'] ?? 0),
    deliveryFeePaise: Number(bd['deliveryFeePaise'] ?? 0),
    platformFeePaise: Number(bd['platformFeePaise'] ?? 0),
    taxableSubtotalPaise: Number(bd['taxableSubtotalPaise'] ?? 0),
    gstTaxPaise: Number(bd['gstTaxPaise'] ?? 0),
    cgstPaise: Number(bd['cgstPaise'] ?? 0),
    sgstPaise: Number(bd['sgstPaise'] ?? 0),
    tipPaise: Number(bd['tipPaise'] ?? 0),
    totalPayablePaise: Number(bd['totalPayablePaise'] ?? 0),
    formattedTotalPayableInr: String(bd['formattedTotalPayableInr'] ?? '₹0'),
  };

  return {
    quoteId: String(doc['quoteId'] ?? ''),
    customerId: String(doc['customerId'] ?? ''),
    outletId: String(doc['outletId'] ?? ''),
    outletName: String(doc['outletName'] ?? ''),
    brandName: String(doc['brandName'] ?? ''),
    outletInspectionStatus: doc['outletInspectionStatus'] as PlatformInspectionStatus,
    outletSafetyScore:
      typeof doc['outletSafetyScore'] === 'number' ? doc['outletSafetyScore'] : null,
    status: (doc['status'] as QuoteLifecycleStatus) ?? 'ACTIVE',
    ttlSeconds: Number(doc['ttlSeconds'] ?? 600),
    issuedAt: doc['issuedAt'] instanceof Date ? doc['issuedAt'] : new Date(),
    expiresAt: doc['expiresAt'] instanceof Date ? doc['expiresAt'] : new Date(),
    signatureAlgorithm: 'HMAC-SHA256',
    signature: String(doc['signature'] ?? ''),
    distanceMeters: Number(doc['distanceMeters'] ?? 0),
    estimatedDeliveryMinutes: Number(doc['estimatedDeliveryMinutes'] ?? 25),
    addressSnapshot,
    lineItems,
    priceDriftDetected: Boolean(doc['priceDriftDetected']),
    priceDriftWarnings: Array.isArray(doc['priceDriftWarnings'])
      ? (doc['priceDriftWarnings'] as PriceDriftWarningDto[])
      : [],
    pricingBreakdown,
    couponAllocation: (doc['couponAllocation'] as CouponFundingSplitDto | null) ?? null,
    createdAt: doc['createdAt'] instanceof Date ? doc['createdAt'] : new Date(),
    updatedAt: doc['updatedAt'] instanceof Date ? doc['updatedAt'] : new Date(),
  };
}

function cloneQuoteRecord(record: PricingQuoteRecord): PricingQuoteRecord {
  return {
    ...record,
    issuedAt: new Date(record.issuedAt.getTime()),
    expiresAt: new Date(record.expiresAt.getTime()),
    createdAt: new Date(record.createdAt.getTime()),
    updatedAt: new Date(record.updatedAt.getTime()),
    addressSnapshot: {
      ...record.addressSnapshot,
      coordinates: [record.addressSnapshot.coordinates[0], record.addressSnapshot.coordinates[1]],
    },
    lineItems: record.lineItems.map((line) => ({ ...line })),
    priceDriftWarnings: record.priceDriftWarnings.map((warn) => ({ ...warn })),
    pricingBreakdown: { ...record.pricingBreakdown },
    couponAllocation: record.couponAllocation ? { ...record.couponAllocation } : null,
  };
}

export class MongoosePricingStore implements PricingStore {
  private readonly couponModel: Model<Record<string, unknown>>;
  private readonly quoteModel: Model<Record<string, unknown>>;

  constructor(connection: Connection) {
    this.couponModel =
      (connection.models['BhojoraCoupon'] as Model<Record<string, unknown>> | undefined) ??
      connection.model<Record<string, unknown>>(
        'BhojoraCoupon',
        couponSchema,
        COLLECTION_NAMES.coupons,
      );
    this.quoteModel =
      (connection.models['BhojoraPricingQuote'] as Model<Record<string, unknown>> | undefined) ??
      connection.model<Record<string, unknown>>(
        'BhojoraPricingQuote',
        pricingQuoteSchema,
        COLLECTION_NAMES.pricingQuotes,
      );
  }

  async upsertCoupon(record: CouponRecord): Promise<CouponRecord> {
    const normalizedCode = record.code.trim().toUpperCase();
    const doc = await this.couponModel
      .findOneAndUpdate(
        { code: normalizedCode },
        {
          $set: {
            code: normalizedCode,
            title: record.title,
            description: record.description,
            discountType: record.discountType,
            discountValue: record.discountValue,
            maxDiscountPaise: record.maxDiscountPaise,
            minOrderSubtotalPaise: record.minOrderSubtotalPaise,
            platformShareBps: record.platformShareBps,
            restaurantShareBps: record.restaurantShareBps,
            maxRedemptionsPerUser: record.maxRedemptionsPerUser,
            maxGlobalRedemptions: record.maxGlobalRedemptions,
            totalRedemptions: record.totalRedemptions,
            userRedemptions: record.userRedemptions,
            isActive: record.isActive,
            validFrom: record.validFrom,
            validUntil: record.validUntil,
            updatedAt: record.updatedAt,
          },
          $setOnInsert: {
            createdAt: record.createdAt,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean<Record<string, unknown>>()
      .exec();
    return doc ? mapPlainCoupon(doc) : cloneCouponRecord(record);
  }

  async getCouponByCode(code: string): Promise<CouponRecord | null> {
    const doc = await this.couponModel
      .findOne({ code: code.trim().toUpperCase() })
      .lean<Record<string, unknown>>()
      .exec();
    return doc ? mapPlainCoupon(doc) : null;
  }

  async listActiveCoupons(now: Date): Promise<CouponRecord[]> {
    const docs = await this.couponModel
      .find({
        isActive: true,
        validFrom: { $lte: now },
        validUntil: { $gte: now },
      })
      .sort({ minOrderSubtotalPaise: 1, code: 1 })
      .lean<Record<string, unknown>[]>()
      .exec();
    return docs.map(mapPlainCoupon);
  }

  async saveQuote(record: PricingQuoteRecord): Promise<PricingQuoteRecord> {
    const doc = await this.quoteModel
      .findOneAndUpdate(
        { quoteId: record.quoteId },
        {
          $set: {
            quoteId: record.quoteId,
            customerId: record.customerId,
            outletId: record.outletId,
            outletName: record.outletName,
            brandName: record.brandName,
            outletInspectionStatus: record.outletInspectionStatus,
            outletSafetyScore: record.outletSafetyScore,
            status: record.status,
            ttlSeconds: record.ttlSeconds,
            issuedAt: record.issuedAt,
            expiresAt: record.expiresAt,
            signatureAlgorithm: record.signatureAlgorithm,
            signature: record.signature,
            distanceMeters: record.distanceMeters,
            estimatedDeliveryMinutes: record.estimatedDeliveryMinutes,
            addressSnapshot: record.addressSnapshot,
            lineItems: record.lineItems,
            priceDriftDetected: record.priceDriftDetected,
            priceDriftWarnings: record.priceDriftWarnings,
            pricingBreakdown: record.pricingBreakdown,
            couponAllocation: record.couponAllocation,
            updatedAt: record.updatedAt,
          },
          $setOnInsert: { createdAt: record.createdAt },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean<Record<string, unknown>>()
      .exec();
    return doc ? mapPlainQuote(doc) : cloneQuoteRecord(record);
  }

  async getQuoteById(quoteId: string): Promise<PricingQuoteRecord | null> {
    const doc = await this.quoteModel.findOne({ quoteId }).lean<Record<string, unknown>>().exec();
    return doc ? mapPlainQuote(doc) : null;
  }

  async updateQuoteStatus(
    quoteId: string,
    status: QuoteLifecycleStatus,
    updatedAt: Date,
  ): Promise<PricingQuoteRecord | null> {
    const doc = await this.quoteModel
      .findOneAndUpdate({ quoteId }, { $set: { status, updatedAt } }, { new: true })
      .lean<Record<string, unknown>>()
      .exec();
    return doc ? mapPlainQuote(doc) : null;
  }
}

export class InMemoryPricingStore implements PricingStore {
  private readonly coupons = new Map<string, CouponRecord>();
  private readonly quotes = new Map<string, PricingQuoteRecord>();

  async upsertCoupon(record: CouponRecord): Promise<CouponRecord> {
    const copy = cloneCouponRecord({
      ...record,
      code: record.code.trim().toUpperCase(),
    });
    this.coupons.set(copy.code, copy);
    return cloneCouponRecord(copy);
  }

  async getCouponByCode(code: string): Promise<CouponRecord | null> {
    const found = this.coupons.get(code.trim().toUpperCase());
    return found ? cloneCouponRecord(found) : null;
  }

  async listActiveCoupons(now: Date): Promise<CouponRecord[]> {
    const nowMs = now.getTime();
    return Array.from(this.coupons.values())
      .filter(
        (c) => c.isActive && c.validFrom.getTime() <= nowMs && c.validUntil.getTime() >= nowMs,
      )
      .sort((a, b) => a.minOrderSubtotalPaise - b.minOrderSubtotalPaise)
      .map(cloneCouponRecord);
  }

  async saveQuote(record: PricingQuoteRecord): Promise<PricingQuoteRecord> {
    const copy = cloneQuoteRecord(record);
    this.quotes.set(copy.quoteId, copy);
    return cloneQuoteRecord(copy);
  }

  async getQuoteById(quoteId: string): Promise<PricingQuoteRecord | null> {
    const found = this.quotes.get(quoteId);
    return found ? cloneQuoteRecord(found) : null;
  }

  async updateQuoteStatus(
    quoteId: string,
    status: QuoteLifecycleStatus,
    updatedAt: Date,
  ): Promise<PricingQuoteRecord | null> {
    const existing = this.quotes.get(quoteId);
    if (!existing) {
      return null;
    }
    const next = { ...existing, status, updatedAt };
    this.quotes.set(quoteId, next);
    return cloneQuoteRecord(next);
  }
}
