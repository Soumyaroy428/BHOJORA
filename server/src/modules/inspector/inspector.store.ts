import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import { applyBaseSchemaConventions, COLLECTION_NAMES } from '../../database/conventions';
import {
  CERTIFICATE_TYPES_RUNTIME,
  CONFLICT_TYPES_RUNTIME,
  INSPECTOR_STATUSES_RUNTIME,
  type InspectorRecord,
} from './inspector.types';
import type { InspectorStatus } from '@bhojora/shared';

export interface InspectorStore {
  createInspector(record: InspectorRecord): Promise<InspectorRecord>;
  getInspectorById(id: string): Promise<InspectorRecord | null>;
  getInspectorByUserId(userId: string): Promise<InspectorRecord | null>;
  getInspectorByBadgeNumber(badge: string): Promise<InspectorRecord | null>;
  updateInspector(id: string, patch: Partial<InspectorRecord>): Promise<InspectorRecord | null>;
  listInspectors(options?: {
    status?: InspectorStatus;
    cityCode?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ inspectors: InspectorRecord[]; totalCount: number }>;
}

export class InMemoryInspectorStore implements InspectorStore {
  private readonly inspectors = new Map<string, InspectorRecord>();

  async createInspector(record: InspectorRecord): Promise<InspectorRecord> {
    const clone: InspectorRecord = {
      ...record,
      certifications: record.certifications.map((c) => ({ ...c })),
      trainings: record.trainings.map((t) => ({ ...t })),
      conflicts: record.conflicts.map((conf) => ({ ...conf })),
    };
    this.inspectors.set(record.id, clone);
    return clone;
  }

  async getInspectorById(id: string): Promise<InspectorRecord | null> {
    const found = this.inspectors.get(id);
    return found ? { ...found } : null;
  }

  async getInspectorByUserId(userId: string): Promise<InspectorRecord | null> {
    for (const record of this.inspectors.values()) {
      if (record.userId === userId) {
        return { ...record };
      }
    }
    return null;
  }

  async getInspectorByBadgeNumber(badge: string): Promise<InspectorRecord | null> {
    for (const record of this.inspectors.values()) {
      if (record.badgeNumber === badge) {
        return { ...record };
      }
    }
    return null;
  }

  async updateInspector(
    id: string,
    patch: Partial<InspectorRecord>,
  ): Promise<InspectorRecord | null> {
    const existing = this.inspectors.get(id);
    if (!existing) {
      return null;
    }
    const updated: InspectorRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.inspectors.set(id, updated);
    return { ...updated };
  }

  async listInspectors(options?: {
    status?: InspectorStatus;
    cityCode?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ inspectors: InspectorRecord[]; totalCount: number }> {
    let list = Array.from(this.inspectors.values());
    if (options?.status) {
      list = list.filter((i) => i.status === options.status);
    }
    if (options?.cityCode) {
      list = list.filter((i) => i.cityCode === options.cityCode);
    }
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const totalCount = list.length;
    const skip = options?.skip ?? 0;
    const limit = options?.limit ?? 50;
    const paginated = list.slice(skip, skip + limit);
    return { inspectors: paginated.map((r) => ({ ...r })), totalCount };
  }
}

const ConflictSchema = new Schema(
  {
    restaurantId: { type: String, required: true },
    outletId: { type: String, required: false },
    conflictType: { type: String, enum: CONFLICT_TYPES_RUNTIME, required: true },
    description: { type: String, required: true },
    declaredAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const CertificationSchema = new Schema(
  {
    certificateType: { type: String, enum: CERTIFICATE_TYPES_RUNTIME, required: true },
    certificateNumber: { type: String, required: true },
    issuingAuthority: { type: String, required: true },
    issuedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
  },
  { _id: false },
);

const TrainingSchema = new Schema(
  {
    moduleName: { type: String, required: true },
    completedAt: { type: Date, required: true },
    scorePercent: { type: Number, required: true },
    validUntil: { type: Date, required: true },
  },
  { _id: false },
);

const InspectorMongooseSchema = new Schema<InspectorRecord>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, unique: true },
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    badgeNumber: { type: String, required: true, unique: true },
    status: { type: String, enum: INSPECTOR_STATUSES_RUNTIME, required: true, default: 'APPLIED' },
    cityCode: { type: String, required: true, default: 'KOLKATA' },
    certifications: { type: [CertificationSchema], default: [] },
    trainings: { type: [TrainingSchema], default: [] },
    conflicts: { type: [ConflictSchema], default: [] },
    approvedByAdminId: { type: String, required: false },
    approvedAt: { type: Date, required: false },
    rejectionReason: { type: String, required: false },
    suspendedReason: { type: String, required: false },
  },
  { timestamps: true },
);

applyBaseSchemaConventions(InspectorMongooseSchema);
InspectorMongooseSchema.index({ status: 1, cityCode: 1 });
InspectorMongooseSchema.index({ userId: 1 }, { unique: true });
InspectorMongooseSchema.index({ badgeNumber: 1 }, { unique: true });

export class MongooseInspectorStore implements InspectorStore {
  private readonly model: Model<InspectorRecord>;

  constructor(connection: Connection) {
    this.model =
      (connection.models[COLLECTION_NAMES.inspectors] as Model<InspectorRecord> | undefined) ??
      connection.model<InspectorRecord>(COLLECTION_NAMES.inspectors, InspectorMongooseSchema);
  }

  async createInspector(record: InspectorRecord): Promise<InspectorRecord> {
    const doc = await this.model.create(record);
    return doc.toObject();
  }

  async getInspectorById(id: string): Promise<InspectorRecord | null> {
    const doc = await this.model.findOne({ id }).lean<InspectorRecord | null>().exec();
    return doc ?? null;
  }

  async getInspectorByUserId(userId: string): Promise<InspectorRecord | null> {
    const doc = await this.model.findOne({ userId }).lean<InspectorRecord | null>().exec();
    return doc ?? null;
  }

  async getInspectorByBadgeNumber(badge: string): Promise<InspectorRecord | null> {
    const doc = await this.model
      .findOne({ badgeNumber: badge })
      .lean<InspectorRecord | null>()
      .exec();
    return doc ?? null;
  }

  async updateInspector(
    id: string,
    patch: Partial<InspectorRecord>,
  ): Promise<InspectorRecord | null> {
    const doc = await this.model
      .findOneAndUpdate({ id }, { $set: { ...patch, updatedAt: new Date() } }, { new: true })
      .lean<InspectorRecord | null>()
      .exec();
    return doc ?? null;
  }

  async listInspectors(options?: {
    status?: InspectorStatus;
    cityCode?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ inspectors: InspectorRecord[]; totalCount: number }> {
    const query: Record<string, unknown> = {};
    if (options?.status) {
      query.status = options.status;
    }
    if (options?.cityCode) {
      query.cityCode = options.cityCode;
    }
    const totalCount = await this.model.countDocuments(query).exec();
    const limit = options?.limit ?? 50;
    const skip = options?.skip ?? 0;
    const docs = await this.model
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<InspectorRecord[]>()
      .exec();
    return { inspectors: docs, totalCount };
  }
}
