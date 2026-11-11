import crypto from 'node:crypto';
import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import { applyBaseSchemaConventions, COLLECTION_NAMES } from '../../database/conventions';
import type { UserRole } from '../identity/identity.types';
import {
  TENANT_MEMBERSHIP_ROLES,
  TENANT_MEMBERSHIP_STATUSES,
  type TenantMembershipRecord,
  type TenantMembershipRole,
  type TenantMembershipStatus,
} from './rbac.policy';

export interface AuditLogEntryRecord {
  auditId: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: 'ALLOWED' | 'DENIED';
  reason?: string | null;
  requestId?: string | null;
  createdAt: Date;
}

export interface OutletScopeRecord {
  outletId: string;
  restaurantId: string;
  name: string;
  zone: string;
  safetyScore: number;
}

export interface DeliveryJobScopeRecord {
  jobId: string;
  partnerId: string;
  outletId: string;
  status: string;
  payoutPaise: number;
}

export interface InspectionScopeRecord {
  inspectionId: string;
  outletId: string;
  restaurantId: string;
  authoredByUserId: string;
  status: 'SUBMITTED' | 'APPROVED';
  reviewerId?: string | null;
  approvedAt?: Date | null;
}

export interface RbacStore {
  listMembershipsForUser(userId: string): Promise<TenantMembershipRecord[]>;
  upsertMembership(input: {
    userId: string;
    restaurantId: string;
    outletId: string;
    role: TenantMembershipRole;
    status: TenantMembershipStatus;
    grantedByUserId: string;
    now: Date;
  }): Promise<TenantMembershipRecord>;
  appendAuditLog(
    entry: Omit<AuditLogEntryRecord, 'auditId' | 'createdAt'> & { now?: Date },
  ): Promise<AuditLogEntryRecord>;
  listAuditLogs(limit?: number): Promise<AuditLogEntryRecord[]>;

  getOutlet(outletId: string): Promise<OutletScopeRecord | null>;
  upsertOutlet(outlet: OutletScopeRecord): Promise<OutletScopeRecord>;
  updateOutletSafetyScore(outletId: string, safetyScore: number): Promise<OutletScopeRecord | null>;

  getDeliveryJob(jobId: string): Promise<DeliveryJobScopeRecord | null>;
  upsertDeliveryJob(job: DeliveryJobScopeRecord): Promise<DeliveryJobScopeRecord>;

  getInspection(inspectionId: string): Promise<InspectionScopeRecord | null>;
  upsertInspection(inspection: InspectionScopeRecord): Promise<InspectionScopeRecord>;
  approveInspection(
    inspectionId: string,
    reviewerId: string,
    approvedAt: Date,
  ): Promise<InspectionScopeRecord | null>;
}

const restaurantStaffSchema = applyBaseSchemaConventions(
  new Schema({
    membershipId: { type: String, required: true },
    userId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    outletId: { type: String, required: true },
    role: { type: String, enum: TENANT_MEMBERSHIP_ROLES, required: true },
    status: { type: String, enum: TENANT_MEMBERSHIP_STATUSES, required: true, default: 'ACTIVE' },
    grantedByUserId: { type: String, required: true },
  }),
);

const auditLogSchema = applyBaseSchemaConventions(
  new Schema({
    auditId: { type: String, required: true },
    actorId: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    resourceType: { type: String, required: true },
    resourceId: { type: String, required: true },
    outcome: { type: String, enum: ['ALLOWED', 'DENIED'], required: true },
    reason: { type: String, required: false, default: null },
    requestId: { type: String, required: false, default: null },
  }),
  { appendOnly: true },
);

export interface MongooseRbacModels {
  RestaurantStaff: Model<Record<string, unknown>>;
  AuditLog: Model<Record<string, unknown>>;
}

export function createMongooseRbacModels(connection: Connection): MongooseRbacModels {
  const resolveModel = (name: string, schema: Schema, collectionName: string) => {
    const existing = connection.models[name] as Model<Record<string, unknown>> | undefined;
    return existing ?? connection.model<Record<string, unknown>>(name, schema, collectionName);
  };

  return {
    RestaurantStaff: resolveModel(
      'BhojoraRestaurantStaff',
      restaurantStaffSchema,
      COLLECTION_NAMES.restaurantStaff,
    ),
    AuditLog: resolveModel('BhojoraAuditLog', auditLogSchema, COLLECTION_NAMES.auditLogs),
  };
}

function toMembershipRecord(doc: Record<string, unknown>): TenantMembershipRecord {
  return {
    membershipId: String(doc['membershipId'] ?? doc['id'] ?? doc['_id']),
    userId: String(doc['userId']),
    restaurantId: String(doc['restaurantId']),
    outletId: String(doc['outletId']),
    role: doc['role'] as TenantMembershipRole,
    status: doc['status'] as TenantMembershipStatus,
    grantedByUserId: String(doc['grantedByUserId']),
    createdAt: doc['createdAt'] instanceof Date ? doc['createdAt'] : new Date(),
    updatedAt: doc['updatedAt'] instanceof Date ? doc['updatedAt'] : new Date(),
  };
}

function toAuditRecord(doc: Record<string, unknown>): AuditLogEntryRecord {
  return {
    auditId: String(doc['auditId'] ?? doc['id'] ?? doc['_id']),
    actorId: String(doc['actorId']),
    actorRole: doc['actorRole'] as UserRole,
    action: String(doc['action']),
    resourceType: String(doc['resourceType']),
    resourceId: String(doc['resourceId']),
    outcome: doc['outcome'] as 'ALLOWED' | 'DENIED',
    reason: typeof doc['reason'] === 'string' ? doc['reason'] : null,
    requestId: typeof doc['requestId'] === 'string' ? doc['requestId'] : null,
    createdAt: doc['createdAt'] instanceof Date ? doc['createdAt'] : new Date(),
  };
}

export class InMemoryRbacStore implements RbacStore {
  private readonly memberships = new Map<string, TenantMembershipRecord>();
  private readonly audits: AuditLogEntryRecord[] = [];
  private readonly outlets = new Map<string, OutletScopeRecord>([
    [
      'outlet_arsalan_pc',
      {
        outletId: 'outlet_arsalan_pc',
        restaurantId: 'rest_arsalan',
        name: 'Arsalan — Park Circus',
        zone: 'Park Circus',
        safetyScore: 94,
      },
    ],
    [
      'outlet_petercat_ps',
      {
        outletId: 'outlet_petercat_ps',
        restaurantId: 'rest_petercat',
        name: 'Peter Cat — Park Street',
        zone: 'Park Street',
        safetyScore: 92,
      },
    ],
  ]);
  private readonly deliveryJobs = new Map<string, DeliveryJobScopeRecord>();
  private readonly inspections = new Map<string, InspectionScopeRecord>();

  async listMembershipsForUser(userId: string): Promise<TenantMembershipRecord[]> {
    return Array.from(this.memberships.values()).filter((m) => m.userId === userId);
  }

  async upsertMembership(input: {
    userId: string;
    restaurantId: string;
    outletId: string;
    role: TenantMembershipRole;
    status: TenantMembershipStatus;
    grantedByUserId: string;
    now: Date;
  }): Promise<TenantMembershipRecord> {
    const key = `${input.userId}:${input.restaurantId}:${input.outletId}`;
    const existing = this.memberships.get(key);
    const record: TenantMembershipRecord = {
      membershipId: existing?.membershipId ?? crypto.randomUUID(),
      userId: input.userId,
      restaurantId: input.restaurantId,
      outletId: input.outletId,
      role: input.role,
      status: input.status,
      grantedByUserId: input.grantedByUserId,
      createdAt: existing?.createdAt ?? input.now,
      updatedAt: input.now,
    };
    this.memberships.set(key, record);
    return record;
  }

  async appendAuditLog(
    entry: Omit<AuditLogEntryRecord, 'auditId' | 'createdAt'> & { now?: Date },
  ): Promise<AuditLogEntryRecord> {
    const created: AuditLogEntryRecord = {
      auditId: crypto.randomUUID(),
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      outcome: entry.outcome,
      reason: entry.reason ?? null,
      requestId: entry.requestId ?? null,
      createdAt: entry.now ?? new Date(),
    };
    this.audits.unshift(created);
    return created;
  }

  async listAuditLogs(limit = 50): Promise<AuditLogEntryRecord[]> {
    return this.audits.slice(0, Math.min(Math.max(1, limit), 100));
  }

  async getOutlet(outletId: string): Promise<OutletScopeRecord | null> {
    return this.outlets.get(outletId) ?? null;
  }

  async upsertOutlet(outlet: OutletScopeRecord): Promise<OutletScopeRecord> {
    this.outlets.set(outlet.outletId, outlet);
    return outlet;
  }

  async updateOutletSafetyScore(
    outletId: string,
    safetyScore: number,
  ): Promise<OutletScopeRecord | null> {
    const existing = this.outlets.get(outletId);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, safetyScore };
    this.outlets.set(outletId, updated);
    return updated;
  }

  async getDeliveryJob(jobId: string): Promise<DeliveryJobScopeRecord | null> {
    return this.deliveryJobs.get(jobId) ?? null;
  }

  async upsertDeliveryJob(job: DeliveryJobScopeRecord): Promise<DeliveryJobScopeRecord> {
    this.deliveryJobs.set(job.jobId, job);
    return job;
  }

  async getInspection(inspectionId: string): Promise<InspectionScopeRecord | null> {
    return this.inspections.get(inspectionId) ?? null;
  }

  async upsertInspection(inspection: InspectionScopeRecord): Promise<InspectionScopeRecord> {
    this.inspections.set(inspection.inspectionId, inspection);
    return inspection;
  }

  async approveInspection(
    inspectionId: string,
    reviewerId: string,
    approvedAt: Date,
  ): Promise<InspectionScopeRecord | null> {
    const existing = this.inspections.get(inspectionId);
    if (!existing) {
      return null;
    }
    const updated: InspectionScopeRecord = {
      ...existing,
      status: 'APPROVED',
      reviewerId,
      approvedAt,
    };
    this.inspections.set(inspectionId, updated);
    return updated;
  }
}

export class MongooseRbacStore implements RbacStore {
  private readonly models: MongooseRbacModels;
  private readonly inMemoryResources = new InMemoryRbacStore();

  constructor(connection: Connection) {
    this.models = createMongooseRbacModels(connection);
  }

  getModels(): MongooseRbacModels {
    return this.models;
  }

  async listMembershipsForUser(userId: string): Promise<TenantMembershipRecord[]> {
    const docs = await this.models.RestaurantStaff.find({ userId });
    return docs.map((doc) => toMembershipRecord(doc.toObject() as Record<string, unknown>));
  }

  async upsertMembership(input: {
    userId: string;
    restaurantId: string;
    outletId: string;
    role: TenantMembershipRole;
    status: TenantMembershipStatus;
    grantedByUserId: string;
    now: Date;
  }): Promise<TenantMembershipRecord> {
    const doc = await this.models.RestaurantStaff.findOneAndUpdate(
      { userId: input.userId, restaurantId: input.restaurantId, outletId: input.outletId },
      {
        $set: {
          role: input.role,
          status: input.status,
          grantedByUserId: input.grantedByUserId,
        },
        $setOnInsert: {
          membershipId: crypto.randomUUID(),
        },
      },
      { upsert: true, new: true, runValidators: true },
    );
    if (!doc) {
      throw new Error('Failed to upsert restaurant membership');
    }
    return toMembershipRecord(doc.toObject() as Record<string, unknown>);
  }

  async appendAuditLog(
    entry: Omit<AuditLogEntryRecord, 'auditId' | 'createdAt'> & { now?: Date },
  ): Promise<AuditLogEntryRecord> {
    const [created] = await this.models.AuditLog.create([
      {
        auditId: crypto.randomUUID(),
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        outcome: entry.outcome,
        reason: entry.reason ?? null,
        requestId: entry.requestId ?? null,
      },
    ]);
    if (!created) {
      throw new Error('Failed to append audit log entry');
    }
    return toAuditRecord(created.toObject() as Record<string, unknown>);
  }

  async listAuditLogs(limit = 50): Promise<AuditLogEntryRecord[]> {
    const docs = await this.models.AuditLog.find({})
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(1, limit), 100));
    return docs.map((doc) => toAuditRecord(doc.toObject() as Record<string, unknown>));
  }

  getOutlet(outletId: string) {
    return this.inMemoryResources.getOutlet(outletId);
  }
  upsertOutlet(outlet: OutletScopeRecord) {
    return this.inMemoryResources.upsertOutlet(outlet);
  }
  updateOutletSafetyScore(outletId: string, safetyScore: number) {
    return this.inMemoryResources.updateOutletSafetyScore(outletId, safetyScore);
  }
  getDeliveryJob(jobId: string) {
    return this.inMemoryResources.getDeliveryJob(jobId);
  }
  upsertDeliveryJob(job: DeliveryJobScopeRecord) {
    return this.inMemoryResources.upsertDeliveryJob(job);
  }
  getInspection(inspectionId: string) {
    return this.inMemoryResources.getInspection(inspectionId);
  }
  upsertInspection(inspection: InspectionScopeRecord) {
    return this.inMemoryResources.upsertInspection(inspection);
  }
  approveInspection(inspectionId: string, reviewerId: string, approvedAt: Date) {
    return this.inMemoryResources.approveInspection(inspectionId, reviewerId, approvedAt);
  }
}
