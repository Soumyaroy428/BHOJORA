import type { Connection, Model } from 'mongoose';
import { Schema, model, models } from 'mongoose';
import type { PlatformConfigRecord, ConfigChangeProposalRecord } from './governance.types';
import type { ProposalStatus } from '@bhojora/shared';

export interface GovernanceStore {
  getPlatformConfig(): Promise<PlatformConfigRecord>;
  updatePlatformConfig(
    updates: Partial<
      Omit<PlatformConfigRecord, 'configId' | 'updatedByUserId' | 'updatedAt' | 'version'>
    >,
    updatedByUserId: string,
    now: Date,
  ): Promise<PlatformConfigRecord>;
  createProposal(proposal: ConfigChangeProposalRecord): Promise<ConfigChangeProposalRecord>;
  getProposalById(proposalId: string): Promise<ConfigChangeProposalRecord | null>;
  listProposals(status?: ProposalStatus): Promise<ConfigChangeProposalRecord[]>;
  updateProposal(
    proposalId: string,
    patch: Partial<ConfigChangeProposalRecord>,
  ): Promise<ConfigChangeProposalRecord | null>;
}

const DEFAULT_PLATFORM_CONFIG: PlatformConfigRecord = {
  configId: 'global_config',
  maintenanceMode: false,
  emergencySurgeLock: false,
  monsoonWaterloggingMode: false,
  maxUnassignedOrderAgeMinutes: 10,
  instantRefundCapPaise: 50000, // ₹500.00
  platformFeePaise: 500, // ₹5.00
  activeZones: [
    'park_street',
    'salt_lake',
    'new_town',
    'ballygunge',
    'behala',
    'howrah',
    'jadavpur',
    'dum_dum',
    'gariahat',
    'shyambazar',
  ],
  updatedByUserId: 'system_bootstrap',
  updatedAt: new Date(),
  version: 1,
};

export class InMemoryGovernanceStore implements GovernanceStore {
  private config: PlatformConfigRecord = structuredClone(DEFAULT_PLATFORM_CONFIG);
  private readonly proposals = new Map<string, ConfigChangeProposalRecord>();

  async getPlatformConfig(): Promise<PlatformConfigRecord> {
    return structuredClone(this.config);
  }

  async updatePlatformConfig(
    updates: Partial<
      Omit<PlatformConfigRecord, 'configId' | 'updatedByUserId' | 'updatedAt' | 'version'>
    >,
    updatedByUserId: string,
    now: Date,
  ): Promise<PlatformConfigRecord> {
    this.config = {
      ...this.config,
      ...updates,
      updatedByUserId,
      updatedAt: now,
      version: this.config.version + 1,
    };
    return structuredClone(this.config);
  }

  async createProposal(proposal: ConfigChangeProposalRecord): Promise<ConfigChangeProposalRecord> {
    const copy = structuredClone(proposal);
    this.proposals.set(copy.proposalId, copy);
    return structuredClone(copy);
  }

  async getProposalById(proposalId: string): Promise<ConfigChangeProposalRecord | null> {
    const existing = this.proposals.get(proposalId);
    return existing ? structuredClone(existing) : null;
  }

  async listProposals(status?: ProposalStatus): Promise<ConfigChangeProposalRecord[]> {
    return Array.from(this.proposals.values())
      .filter((p) => (status ? p.status === status : true))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((p) => structuredClone(p));
  }

  async updateProposal(
    proposalId: string,
    patch: Partial<ConfigChangeProposalRecord>,
  ): Promise<ConfigChangeProposalRecord | null> {
    const existing = this.proposals.get(proposalId);
    if (!existing) {
      return null;
    }
    const updated = {
      ...existing,
      ...patch,
    };
    this.proposals.set(proposalId, updated);
    return structuredClone(updated);
  }
}

const platformConfigSchema = new Schema(
  {
    configId: { type: String, required: true, unique: true },
    maintenanceMode: { type: Boolean, required: true, default: false },
    emergencySurgeLock: { type: Boolean, required: true, default: false },
    monsoonWaterloggingMode: { type: Boolean, required: true, default: false },
    maxUnassignedOrderAgeMinutes: { type: Number, required: true, default: 10 },
    instantRefundCapPaise: { type: Number, required: true, default: 50000 },
    platformFeePaise: { type: Number, required: true, default: 500 },
    activeZones: { type: [String], required: true, default: [] },
    updatedByUserId: { type: String, required: true },
    updatedAt: { type: Date, required: true, default: Date.now },
    version: { type: Number, required: true, default: 1 },
  },
  { collection: 'platform_configs' },
);

const configChangeProposalSchema = new Schema(
  {
    proposalId: { type: String, required: true, unique: true },
    proposerUserId: { type: String, required: true },
    proposerRole: { type: String, required: true },
    proposedChanges: { type: Schema.Types.Mixed, required: true },
    reason: { type: String, required: true },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED'], required: true },
    reviewedByUserId: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewReason: { type: String, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'config_change_proposals' },
);

type PlatformConfigDocument = PlatformConfigRecord & { _id?: unknown };
type ConfigProposalDocument = ConfigChangeProposalRecord & { _id?: unknown };

export class MongooseGovernanceStore implements GovernanceStore {
  private readonly configModel: Model<PlatformConfigDocument>;
  private readonly proposalModel: Model<ConfigProposalDocument>;

  constructor(_connection: Connection) {
    this.configModel =
      (models.PlatformConfig as Model<PlatformConfigDocument> | undefined) ??
      model<PlatformConfigDocument>('PlatformConfig', platformConfigSchema);
    this.proposalModel =
      (models.ConfigProposal as Model<ConfigProposalDocument> | undefined) ??
      model<ConfigProposalDocument>('ConfigProposal', configChangeProposalSchema);
  }

  async getPlatformConfig(): Promise<PlatformConfigRecord> {
    const found = await this.configModel.findOne({ configId: 'global_config' }).lean();
    const doc: PlatformConfigRecord = found
      ? (found as PlatformConfigRecord)
      : ((await this.configModel
          .create(DEFAULT_PLATFORM_CONFIG)
          .then((c) => c.toObject())) as PlatformConfigRecord);
    return {
      configId: doc.configId,
      maintenanceMode: doc.maintenanceMode,
      emergencySurgeLock: doc.emergencySurgeLock,
      monsoonWaterloggingMode: doc.monsoonWaterloggingMode,
      maxUnassignedOrderAgeMinutes: doc.maxUnassignedOrderAgeMinutes,
      instantRefundCapPaise: doc.instantRefundCapPaise,
      platformFeePaise: doc.platformFeePaise,
      activeZones: [...doc.activeZones],
      updatedByUserId: doc.updatedByUserId,
      updatedAt: doc.updatedAt,
      version: doc.version,
    };
  }

  async updatePlatformConfig(
    updates: Partial<
      Omit<PlatformConfigRecord, 'configId' | 'updatedByUserId' | 'updatedAt' | 'version'>
    >,
    updatedByUserId: string,
    now: Date,
  ): Promise<PlatformConfigRecord> {
    const doc = await this.configModel
      .findOneAndUpdate(
        { configId: 'global_config' },
        {
          $set: {
            ...updates,
            updatedByUserId,
            updatedAt: now,
          },
          $inc: { version: 1 },
        },
        { upsert: true, new: true, runValidators: true },
      )
      .lean();

    if (!doc) {
      throw new Error('Failed to update platform config');
    }

    return {
      configId: doc.configId,
      maintenanceMode: doc.maintenanceMode,
      emergencySurgeLock: doc.emergencySurgeLock,
      monsoonWaterloggingMode: doc.monsoonWaterloggingMode,
      maxUnassignedOrderAgeMinutes: doc.maxUnassignedOrderAgeMinutes,
      instantRefundCapPaise: doc.instantRefundCapPaise,
      platformFeePaise: doc.platformFeePaise,
      activeZones: [...doc.activeZones],
      updatedByUserId: doc.updatedByUserId,
      updatedAt: doc.updatedAt,
      version: doc.version,
    };
  }

  async createProposal(proposal: ConfigChangeProposalRecord): Promise<ConfigChangeProposalRecord> {
    const created = await this.proposalModel.create(proposal);
    const doc = created.toObject() as ConfigProposalDocument;
    return {
      proposalId: doc.proposalId,
      proposerUserId: doc.proposerUserId,
      proposerRole: doc.proposerRole,
      proposedChanges: { ...doc.proposedChanges },
      reason: doc.reason,
      status: doc.status,
      reviewedByUserId: doc.reviewedByUserId,
      reviewedAt: doc.reviewedAt,
      reviewReason: doc.reviewReason,
      createdAt: doc.createdAt,
    };
  }

  async getProposalById(proposalId: string): Promise<ConfigChangeProposalRecord | null> {
    const doc = await this.proposalModel.findOne({ proposalId }).lean();
    if (!doc) {
      return null;
    }
    return {
      proposalId: doc.proposalId,
      proposerUserId: doc.proposerUserId,
      proposerRole: doc.proposerRole,
      proposedChanges: { ...doc.proposedChanges },
      reason: doc.reason,
      status: doc.status,
      reviewedByUserId: doc.reviewedByUserId,
      reviewedAt: doc.reviewedAt,
      reviewReason: doc.reviewReason,
      createdAt: doc.createdAt,
    };
  }

  async listProposals(status?: ProposalStatus): Promise<ConfigChangeProposalRecord[]> {
    const filter = status ? { status } : {};
    const docs = await this.proposalModel.find(filter).sort({ createdAt: -1 }).lean();
    return docs.map((doc) => ({
      proposalId: doc.proposalId,
      proposerUserId: doc.proposerUserId,
      proposerRole: doc.proposerRole,
      proposedChanges: { ...doc.proposedChanges },
      reason: doc.reason,
      status: doc.status,
      reviewedByUserId: doc.reviewedByUserId,
      reviewedAt: doc.reviewedAt,
      reviewReason: doc.reviewReason,
      createdAt: doc.createdAt,
    }));
  }

  async updateProposal(
    proposalId: string,
    patch: Partial<ConfigChangeProposalRecord>,
  ): Promise<ConfigChangeProposalRecord | null> {
    const doc = await this.proposalModel
      .findOneAndUpdate({ proposalId }, { $set: patch }, { new: true })
      .lean();
    if (!doc) {
      return null;
    }
    return {
      proposalId: doc.proposalId,
      proposerUserId: doc.proposerUserId,
      proposerRole: doc.proposerRole,
      proposedChanges: { ...doc.proposedChanges },
      reason: doc.reason,
      status: doc.status,
      reviewedByUserId: doc.reviewedByUserId,
      reviewedAt: doc.reviewedAt,
      reviewReason: doc.reviewReason,
      createdAt: doc.createdAt,
    };
  }
}
