import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import { applyBaseSchemaConventions, COLLECTION_NAMES } from '../../database/conventions';
import { KOLKATA_ZONE_IDS } from '../customer/customer.types';
import {
  DELIVERY_DOCUMENT_TYPES_RUNTIME,
  DELIVERY_PARTNER_STATUSES_RUNTIME,
  DELIVERY_SHIFT_STATUSES_RUNTIME,
  VEHICLE_TYPES_RUNTIME,
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
}

export class InMemoryDeliveryStore implements DeliveryStore {
  private readonly partners = new Map<string, DeliveryPartnerRecord>();

  async createPartner(record: DeliveryPartnerRecord): Promise<DeliveryPartnerRecord> {
    const clone: DeliveryPartnerRecord = JSON.parse(JSON.stringify(record), (key, value) => {
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
    this.partners.set(clone.partnerId, clone);
    return clone;
  }

  async getPartnerById(partnerId: string): Promise<DeliveryPartnerRecord | null> {
    const found = this.partners.get(partnerId);
    if (!found) return null;
    return JSON.parse(JSON.stringify(found), (key, value) => {
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
      applications: paged.map((p) =>
        JSON.parse(JSON.stringify(p), (key, value) => {
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
        }),
      ),
      totalCount: filtered.length,
    };
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

export class MongooseDeliveryStore implements DeliveryStore {
  private readonly model: Model<DeliveryPartnerRecord>;

  constructor(connection: Connection) {
    this.model =
      (connection.models.BhojoraDeliveryPartner as Model<DeliveryPartnerRecord>) ||
      connection.model<DeliveryPartnerRecord>('BhojoraDeliveryPartner', deliveryPartnerSchema);
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
}
