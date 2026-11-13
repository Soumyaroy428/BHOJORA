import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import { applyBaseSchemaConventions, COLLECTION_NAMES } from '../../database/conventions';
import { KOLKATA_ZONE_IDS, type KolkataZoneId } from '../customer/customer.types';
import {
  DELIVERY_ASSIGNMENT_STATUSES_RUNTIME,
  DELIVERY_DOCUMENT_TYPES_RUNTIME,
  DELIVERY_PARTNER_STATUSES_RUNTIME,
  DELIVERY_SHIFT_STATUSES_RUNTIME,
  VEHICLE_TYPES_RUNTIME,
  type DeliveryOfferRecord,
  type DeliveryPartnerRecord,
} from './delivery.types';
import type { DeliveryPartnerStatus } from '@bhojora/shared';

export interface DeliveryStore {
  createPartner(record: DeliveryPartnerRecord): Promise<DeliveryPartnerRecord>;
  getPartnerById(partnerId: string): Promise<DeliveryPartnerRecord | null>;
  getPartnerByUserId(userId: string): Promise<DeliveryPartnerRecord | null>;
  updatePartner(
    partnerId: string,
    patch: Partial<DeliveryPartnerRecord>,
  ): Promise<DeliveryPartnerRecord | null>;
  listApplications(options?: {
    status?: DeliveryPartnerStatus;
    limit?: number;
    skip?: number;
  }): Promise<{ applications: DeliveryPartnerRecord[]; totalCount: number }>;

  // Checkpoint 19 dispatch engine additions:
  findEligiblePartners(options: {
    zoneId?: KolkataZoneId;
    outletCoordinates?: [number, number];
    excludePartnerIds?: string[];
  }): Promise<DeliveryPartnerRecord[]>;
  createOffer(record: DeliveryOfferRecord): Promise<DeliveryOfferRecord>;
  getOfferById(offerId: string): Promise<DeliveryOfferRecord | null>;
  getActiveOffersForPartner(partnerId: string, now: Date): Promise<DeliveryOfferRecord[]>;
  getActiveAssignmentForPartner(partnerId: string): Promise<DeliveryOfferRecord | null>;
  getActiveAssignmentForOrder(orderId: string): Promise<DeliveryOfferRecord | null>;
  getOffersForOrder(orderId: string): Promise<DeliveryOfferRecord[]>;
  acceptOfferAtomic(options: {
    offerId: string;
    partnerId: string;
    expectedVersion: number;
    now: Date;
  }): Promise<{
    success: boolean;
    updatedOffer: DeliveryOfferRecord | null;
    failureReason?: string;
  }>;
  updateOffer(
    offerId: string,
    patch: Partial<DeliveryOfferRecord>,
  ): Promise<DeliveryOfferRecord | null>;
}

export class InMemoryDeliveryStore implements DeliveryStore {
  private readonly partners = new Map<string, DeliveryPartnerRecord>();
  private readonly offers = new Map<string, DeliveryOfferRecord>();

  private clonePartner(p: DeliveryPartnerRecord): DeliveryPartnerRecord {
    return JSON.parse(JSON.stringify(p), (key, value) => {
      if (
        key === 'createdAt' ||
        key === 'updatedAt' ||
        key === 'submittedAt' ||
        key === 'reviewedAt' ||
        key === 'approvedAt' ||
        key === 'uploadedAt' ||
        key === 'verifiedAt' ||
        key === 'lastLocationAt'
      ) {
        return value ? new Date(value) : null;
      }
      return value;
    });
  }

  private cloneOffer(o: DeliveryOfferRecord): DeliveryOfferRecord {
    return JSON.parse(JSON.stringify(o), (key, value) => {
      if (
        key === 'createdAt' ||
        key === 'updatedAt' ||
        key === 'offeredAt' ||
        key === 'expiresAt' ||
        key === 'acceptedAt' ||
        key === 'declinedAt'
      ) {
        return value ? new Date(value) : null;
      }
      return value;
    });
  }

  async createPartner(record: DeliveryPartnerRecord): Promise<DeliveryPartnerRecord> {
    const clone = this.clonePartner(record);
    this.partners.set(clone.partnerId, clone);
    return this.clonePartner(clone);
  }

  async getPartnerById(partnerId: string): Promise<DeliveryPartnerRecord | null> {
    const found = this.partners.get(partnerId);
    if (!found) return null;
    return this.clonePartner(found);
  }

  async getPartnerByUserId(userId: string): Promise<DeliveryPartnerRecord | null> {
    for (const record of this.partners.values()) {
      if (record.userId === userId) {
        return this.getPartnerById(record.partnerId);
      }
    }
    return null;
  }

  async updatePartner(
    partnerId: string,
    patch: Partial<DeliveryPartnerRecord>,
  ): Promise<DeliveryPartnerRecord | null> {
    const existing = this.partners.get(partnerId);
    if (!existing) return null;
    const updated: DeliveryPartnerRecord = {
      ...existing,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date(),
    };
    this.partners.set(partnerId, updated);
    return this.getPartnerById(partnerId);
  }

  async listApplications(options?: {
    status?: DeliveryPartnerStatus;
    limit?: number;
    skip?: number;
  }): Promise<{ applications: DeliveryPartnerRecord[]; totalCount: number }> {
    const all = Array.from(this.partners.values());
    const filtered = options?.status ? all.filter((p) => p.status === options.status) : all;
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const skip = options?.skip ?? 0;
    const limit = options?.limit ?? 50;
    const paged = filtered.slice(skip, skip + limit);
    return {
      applications: paged.map((p) => this.clonePartner(p)),
      totalCount: filtered.length,
    };
  }

  async findEligiblePartners(options: {
    zoneId?: KolkataZoneId;
    outletCoordinates?: [number, number];
    excludePartnerIds?: string[];
  }): Promise<DeliveryPartnerRecord[]> {
    const excludes = new Set(options.excludePartnerIds ?? []);
    const eligible: DeliveryPartnerRecord[] = [];

    for (const partner of this.partners.values()) {
      if (partner.status !== 'APPROVED') continue;
      if (partner.shiftStatus !== 'ONLINE') continue;
      if (excludes.has(partner.partnerId)) continue;
      if (options.zoneId && !partner.preferredZones.includes(options.zoneId)) continue;

      eligible.push(this.clonePartner(partner));
    }

    // Proximity and fairness: partners with fewer deliveries or closer to outlet come first
    eligible.sort((a, b) => {
      if (options.outletCoordinates && a.lastCoordinates && b.lastCoordinates) {
        const [lon1, lat1] = a.lastCoordinates;
        const [lon2, lat2] = b.lastCoordinates;
        const [oLon, oLat] = options.outletCoordinates;
        const distA = Math.hypot(lon1 - oLon, lat1 - oLat);
        const distB = Math.hypot(lon2 - oLon, lat2 - oLat);
        if (Math.abs(distA - distB) > 0.03) {
          return distA - distB;
        }
      }
      return a.totalDeliveries - b.totalDeliveries;
    });

    return eligible;
  }

  async createOffer(record: DeliveryOfferRecord): Promise<DeliveryOfferRecord> {
    const clone = this.cloneOffer(record);
    this.offers.set(clone.offerId, clone);
    return this.cloneOffer(clone);
  }

  async getOfferById(offerId: string): Promise<DeliveryOfferRecord | null> {
    const offer = this.offers.get(offerId);
    return offer ? this.cloneOffer(offer) : null;
  }

  async getActiveOffersForPartner(partnerId: string, now: Date): Promise<DeliveryOfferRecord[]> {
    const results: DeliveryOfferRecord[] = [];
    for (const offer of this.offers.values()) {
      if (
        offer.offeredToPartnerId === partnerId &&
        offer.status === 'OFFERED' &&
        offer.expiresAt.getTime() >= now.getTime()
      ) {
        results.push(this.cloneOffer(offer));
      }
    }
    results.sort((a, b) => b.offeredAt.getTime() - a.offeredAt.getTime());
    return results;
  }

  async getActiveAssignmentForPartner(partnerId: string): Promise<DeliveryOfferRecord | null> {
    for (const offer of this.offers.values()) {
      if (offer.partnerId === partnerId && offer.status === 'ACCEPTED') {
        return this.cloneOffer(offer);
      }
    }
    return null;
  }

  async getActiveAssignmentForOrder(orderId: string): Promise<DeliveryOfferRecord | null> {
    for (const offer of this.offers.values()) {
      if (offer.orderId === orderId && offer.status === 'ACCEPTED') {
        return this.cloneOffer(offer);
      }
    }
    return null;
  }

  async getOffersForOrder(orderId: string): Promise<DeliveryOfferRecord[]> {
    const list: DeliveryOfferRecord[] = [];
    for (const offer of this.offers.values()) {
      if (offer.orderId === orderId) {
        list.push(this.cloneOffer(offer));
      }
    }
    list.sort((a, b) => b.offeredAt.getTime() - a.offeredAt.getTime());
    return list;
  }

  async acceptOfferAtomic(options: {
    offerId: string;
    partnerId: string;
    expectedVersion: number;
    now: Date;
  }): Promise<{
    success: boolean;
    updatedOffer: DeliveryOfferRecord | null;
    failureReason?: string;
  }> {
    const offer = this.offers.get(options.offerId);
    if (!offer) {
      return { success: false, updatedOffer: null, failureReason: 'OFFER_NOT_FOUND' };
    }
    if (offer.offeredToPartnerId !== options.partnerId) {
      return { success: false, updatedOffer: null, failureReason: 'OFFER_NOT_ASSIGNED_TO_CALLER' };
    }
    if (offer.status !== 'OFFERED') {
      return { success: false, updatedOffer: null, failureReason: 'OFFER_NO_LONGER_AVAILABLE' };
    }
    if (offer.expiresAt.getTime() < options.now.getTime()) {
      return { success: false, updatedOffer: null, failureReason: 'OFFER_EXPIRED' };
    }
    if (offer.version !== options.expectedVersion) {
      return { success: false, updatedOffer: null, failureReason: 'CONCURRENT_UPDATE_CONFLICT' };
    }

    offer.status = 'ACCEPTED';
    offer.partnerId = options.partnerId;
    offer.acceptedAt = options.now;
    offer.version += 1;
    offer.updatedAt = options.now;
    return { success: true, updatedOffer: this.cloneOffer(offer) };
  }

  async updateOffer(
    offerId: string,
    patch: Partial<DeliveryOfferRecord>,
  ): Promise<DeliveryOfferRecord | null> {
    const existing = this.offers.get(offerId);
    if (!existing) return null;
    const updated: DeliveryOfferRecord = {
      ...existing,
      ...patch,
      version: existing.version + 1,
      updatedAt: patch.updatedAt ?? new Date(),
    };
    this.offers.set(offerId, updated);
    return this.cloneOffer(updated);
  }
}

const vehicleSubSchema = new Schema(
  {
    vehicleType: { type: String, enum: VEHICLE_TYPES_RUNTIME, required: true },
    model: { type: String, required: true, trim: true, maxlength: 100 },
    registrationNumberMasked: { type: String, required: false, default: null, maxlength: 30 },
    registrationNumberHash: { type: String, required: false, default: null, maxlength: 64 },
  },
  { _id: false },
);

const deliveryDocumentSubSchema = new Schema(
  {
    documentId: { type: String, required: true, trim: true },
    type: { type: String, enum: DELIVERY_DOCUMENT_TYPES_RUNTIME, required: true },
    documentNumberMasked: { type: String, required: true, trim: true, maxlength: 32 },
    documentNumberHash: { type: String, required: true, trim: true, maxlength: 64 },
    fileUrl: { type: String, required: true, trim: true, maxlength: 500 },
    mimeType: { type: String, required: true, trim: true, maxlength: 64 },
    isPublic: { type: Boolean, required: true, default: false },
    verificationStatus: {
      type: String,
      enum: ['PENDING_REVIEW', 'VERIFIED', 'REJECTED'],
      required: true,
      default: 'PENDING_REVIEW',
    },
    rejectionReason: { type: String, required: false, default: null, maxlength: 240 },
    uploadedAt: { type: Date, required: true, default: Date.now },
    verifiedAt: { type: Date, required: false, default: null },
  },
  { _id: false },
);

const bankPayoutSubSchema = new Schema(
  {
    accountHolderName: { type: String, required: true, trim: true, maxlength: 120 },
    accountNumberMasked: { type: String, required: true, trim: true, maxlength: 30 },
    accountNumberHash: { type: String, required: true, trim: true, maxlength: 64 },
    ifscCode: { type: String, required: true, trim: true, maxlength: 15 },
    bankName: { type: String, required: true, trim: true, maxlength: 100 },
  },
  { _id: false },
);

const emergencyContactSubSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phoneMasked: { type: String, required: true, trim: true, maxlength: 30 },
    relationship: { type: String, required: true, trim: true, maxlength: 60 },
  },
  { _id: false },
);

const deliveryPartnerSchema = new Schema<DeliveryPartnerRecord>(
  {
    partnerId: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, unique: true, index: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phoneMasked: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    city: { type: String, required: true, default: 'Kolkata', enum: ['Kolkata'] },
    preferredZones: [{ type: String, enum: KOLKATA_ZONE_IDS, required: true }],
    vehicle: { type: vehicleSubSchema, required: true },
    status: {
      type: String,
      enum: DELIVERY_PARTNER_STATUSES_RUNTIME,
      required: true,
      default: 'DRAFT',
      index: true,
    },
    shiftStatus: {
      type: String,
      enum: DELIVERY_SHIFT_STATUSES_RUNTIME,
      required: true,
      default: 'OFFLINE',
      index: true,
    },
    documents: [deliveryDocumentSubSchema],
    bankPayout: { type: bankPayoutSubSchema, required: false, default: null },
    emergencyContact: { type: emergencyContactSubSchema, required: false, default: null },
    rejectionReason: { type: String, required: false, default: null, maxlength: 240 },
    rating: { type: Number, required: true, default: 5.0, min: 1.0, max: 5.0 },
    totalDeliveries: { type: Number, required: true, default: 0, min: 0 },
    submittedAt: { type: Date, required: false, default: null },
    reviewedAt: { type: Date, required: false, default: null },
    reviewedByUserId: { type: String, required: false, default: null },
    approvedAt: { type: Date, required: false, default: null },
    lastCoordinates: { type: [Number], required: false, default: null },
    lastLocationAt: { type: Date, required: false, default: null },
  },
  {
    collection: COLLECTION_NAMES.deliveryPartners,
  },
);

applyBaseSchemaConventions(deliveryPartnerSchema);

deliveryPartnerSchema.index({ status: 1, createdAt: -1 });
deliveryPartnerSchema.index({ shiftStatus: 1, status: 1 });

const deliveryOfferLocationSubSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    addressLine: { type: String, required: true, trim: true, maxlength: 300 },
    landmark: { type: String, required: false, default: null, maxlength: 150 },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const deliveryOfferSchema = new Schema<DeliveryOfferRecord>(
  {
    offerId: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, required: true, index: true },
    outletId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: DELIVERY_ASSIGNMENT_STATUSES_RUNTIME,
      required: true,
      default: 'OFFERED',
      index: true,
    },
    offeredToPartnerId: { type: String, required: true, index: true },
    partnerId: { type: String, required: false, default: null, index: true },
    pickupLocation: { type: deliveryOfferLocationSubSchema, required: true },
    dropLocation: { type: deliveryOfferLocationSubSchema, required: true },
    estimatedDistanceKm: { type: Number, required: true },
    estimatedDurationMinutes: { type: Number, required: true },
    guaranteedPayoutPaise: { type: Number, required: true },
    offeredAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true, index: true },
    acceptedAt: { type: Date, required: false, default: null },
    declinedAt: { type: Date, required: false, default: null },
    declineReason: { type: String, required: false, default: null, maxlength: 240 },
    reassignedFromOfferId: { type: String, required: false, default: null },
    version: { type: Number, required: true, default: 1 },
  },
  {
    collection: COLLECTION_NAMES.deliveryAssignments,
  },
);

applyBaseSchemaConventions(deliveryOfferSchema);

deliveryOfferSchema.index({ orderId: 1, status: 1 });
deliveryOfferSchema.index({ offeredToPartnerId: 1, status: 1, expiresAt: 1 });
deliveryOfferSchema.index({ partnerId: 1, status: 1 });

export class MongooseDeliveryStore implements DeliveryStore {
  private readonly model: Model<DeliveryPartnerRecord>;
  private readonly offerModel: Model<DeliveryOfferRecord>;

  constructor(connection: Connection) {
    this.model =
      (connection.models.BhojoraDeliveryPartner as Model<DeliveryPartnerRecord>) ||
      connection.model<DeliveryPartnerRecord>('BhojoraDeliveryPartner', deliveryPartnerSchema);
    this.offerModel =
      (connection.models.BhojoraDeliveryAssignment as Model<DeliveryOfferRecord>) ||
      connection.model<DeliveryOfferRecord>('BhojoraDeliveryAssignment', deliveryOfferSchema);
  }

  async createPartner(record: DeliveryPartnerRecord): Promise<DeliveryPartnerRecord> {
    const created = await this.model.create(record);
    return created.toObject();
  }

  async getPartnerById(partnerId: string): Promise<DeliveryPartnerRecord | null> {
    const doc = await this.model.findOne({ partnerId }).lean<DeliveryPartnerRecord>().exec();
    return doc ?? null;
  }

  async getPartnerByUserId(userId: string): Promise<DeliveryPartnerRecord | null> {
    const doc = await this.model.findOne({ userId }).lean<DeliveryPartnerRecord>().exec();
    return doc ?? null;
  }

  async updatePartner(
    partnerId: string,
    patch: Partial<DeliveryPartnerRecord>,
  ): Promise<DeliveryPartnerRecord | null> {
    const updated = await this.model
      .findOneAndUpdate(
        { partnerId },
        { $set: { ...patch, updatedAt: patch.updatedAt ?? new Date() } },
        { new: true },
      )
      .lean<DeliveryPartnerRecord>()
      .exec();
    return updated ?? null;
  }

  async listApplications(options?: {
    status?: DeliveryPartnerStatus;
    limit?: number;
    skip?: number;
  }): Promise<{ applications: DeliveryPartnerRecord[]; totalCount: number }> {
    const filter: Record<string, unknown> = {};
    if (options?.status) {
      filter.status = options.status;
    }
    const [docs, totalCount] = await Promise.all([
      this.model
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(options?.skip ?? 0)
        .limit(options?.limit ?? 50)
        .lean<DeliveryPartnerRecord[]>()
        .exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return {
      applications: docs,
      totalCount,
    };
  }

  async findEligiblePartners(options: {
    zoneId?: KolkataZoneId;
    outletCoordinates?: [number, number];
    excludePartnerIds?: string[];
  }): Promise<DeliveryPartnerRecord[]> {
    const filter: Record<string, unknown> = {
      status: 'APPROVED',
      shiftStatus: 'ONLINE',
    };
    if (options.excludePartnerIds && options.excludePartnerIds.length > 0) {
      filter.partnerId = { $nin: options.excludePartnerIds };
    }
    if (options.zoneId) {
      filter.preferredZones = options.zoneId;
    }

    const docs = await this.model.find(filter).lean<DeliveryPartnerRecord[]>().exec();

    docs.sort((a, b) => {
      if (options.outletCoordinates && a.lastCoordinates && b.lastCoordinates) {
        const [lon1, lat1] = a.lastCoordinates;
        const [lon2, lat2] = b.lastCoordinates;
        const [oLon, oLat] = options.outletCoordinates;
        const distA = Math.hypot(lon1 - oLon, lat1 - oLat);
        const distB = Math.hypot(lon2 - oLon, lat2 - oLat);
        if (Math.abs(distA - distB) > 0.03) {
          return distA - distB;
        }
      }
      return a.totalDeliveries - b.totalDeliveries;
    });

    return docs;
  }

  async createOffer(record: DeliveryOfferRecord): Promise<DeliveryOfferRecord> {
    const created = await this.offerModel.create(record);
    return created.toObject();
  }

  async getOfferById(offerId: string): Promise<DeliveryOfferRecord | null> {
    const doc = await this.offerModel.findOne({ offerId }).lean<DeliveryOfferRecord>().exec();
    return doc ?? null;
  }

  async getActiveOffersForPartner(partnerId: string, now: Date): Promise<DeliveryOfferRecord[]> {
    return this.offerModel
      .find({
        offeredToPartnerId: partnerId,
        status: 'OFFERED',
        expiresAt: { $gte: now },
      })
      .sort({ offeredAt: -1 })
      .lean<DeliveryOfferRecord[]>()
      .exec();
  }

  async getActiveAssignmentForPartner(partnerId: string): Promise<DeliveryOfferRecord | null> {
    const doc = await this.offerModel
      .findOne({
        partnerId,
        status: 'ACCEPTED',
      })
      .lean<DeliveryOfferRecord>()
      .exec();
    return doc ?? null;
  }

  async getActiveAssignmentForOrder(orderId: string): Promise<DeliveryOfferRecord | null> {
    const doc = await this.offerModel
      .findOne({
        orderId,
        status: 'ACCEPTED',
      })
      .lean<DeliveryOfferRecord>()
      .exec();
    return doc ?? null;
  }

  async getOffersForOrder(orderId: string): Promise<DeliveryOfferRecord[]> {
    return this.offerModel
      .find({ orderId })
      .sort({ offeredAt: -1 })
      .lean<DeliveryOfferRecord[]>()
      .exec();
  }

  async acceptOfferAtomic(options: {
    offerId: string;
    partnerId: string;
    expectedVersion: number;
    now: Date;
  }): Promise<{
    success: boolean;
    updatedOffer: DeliveryOfferRecord | null;
    failureReason?: string;
  }> {
    const existing = await this.offerModel
      .findOne({ offerId: options.offerId })
      .lean<DeliveryOfferRecord>()
      .exec();
    if (!existing) {
      return { success: false, updatedOffer: null, failureReason: 'OFFER_NOT_FOUND' };
    }
    if (existing.offeredToPartnerId !== options.partnerId) {
      return { success: false, updatedOffer: null, failureReason: 'OFFER_NOT_ASSIGNED_TO_CALLER' };
    }
    if (existing.status !== 'OFFERED') {
      return { success: false, updatedOffer: null, failureReason: 'OFFER_NO_LONGER_AVAILABLE' };
    }
    if (existing.expiresAt.getTime() < options.now.getTime()) {
      return { success: false, updatedOffer: null, failureReason: 'OFFER_EXPIRED' };
    }

    const updated = await this.offerModel
      .findOneAndUpdate(
        {
          offerId: options.offerId,
          offeredToPartnerId: options.partnerId,
          status: 'OFFERED',
          expiresAt: { $gte: options.now },
          version: options.expectedVersion,
        },
        {
          $set: {
            status: 'ACCEPTED',
            partnerId: options.partnerId,
            acceptedAt: options.now,
            updatedAt: options.now,
          },
          $inc: { version: 1 },
        },
        { new: true },
      )
      .lean<DeliveryOfferRecord>()
      .exec();

    if (!updated) {
      return { success: false, updatedOffer: null, failureReason: 'CONCURRENT_UPDATE_CONFLICT' };
    }

    return { success: true, updatedOffer: updated };
  }

  async updateOffer(
    offerId: string,
    patch: Partial<DeliveryOfferRecord>,
  ): Promise<DeliveryOfferRecord | null> {
    const updated = await this.offerModel
      .findOneAndUpdate(
        { offerId },
        {
          $set: { ...patch, updatedAt: patch.updatedAt ?? new Date() },
          $inc: { version: 1 },
        },
        { new: true },
      )
      .lean<DeliveryOfferRecord>()
      .exec();
    return updated ?? null;
  }
}
