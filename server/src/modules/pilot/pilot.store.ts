import mongoose, { type Document, type Model, Schema } from 'mongoose';
import type {
  PilotCohortMember,
  PilotCohortType,
  PilotOperationalStatus,
  PilotZoneCode,
  PilotZoneConfig,
} from '@bhojora/shared';

export interface PilotStore {
  getZoneConfig(zoneCode: PilotZoneCode): Promise<PilotZoneConfig | null>;
  listZoneConfigs(): Promise<PilotZoneConfig[]>;
  updateZoneStatus(
    zoneCode: PilotZoneCode,
    status: PilotOperationalStatus,
  ): Promise<PilotZoneConfig | null>;
  addCohortMember(member: PilotCohortMember): Promise<PilotCohortMember>;
  findCohortMember(userId: string): Promise<PilotCohortMember | null>;
  listCohortMembers(zoneCode?: PilotZoneCode): Promise<PilotCohortMember[]>;
  getGlobalKillSwitch(): Promise<{ active: boolean; reason?: string; lastUpdatedBy?: string }>;
  setGlobalKillSwitch(active: boolean, reason?: string, updatedBy?: string): Promise<void>;
}

export const INITIAL_PILOT_ZONES: PilotZoneConfig[] = [
  {
    zoneCode: 'SALT_LAKE_SEC_V',
    zoneName: 'Salt Lake Sector V (Tech & Business Corridor)',
    maxActiveOrdersPerHour: 100,
    maxDeliveryRadiusKm: 5.5,
    minHygieneRatingThreshold: 90,
    operationalStatus: 'ACTIVE_PILOT',
    leadInspectorName: 'Dr. Debabrata Banerjee',
  },
  {
    zoneCode: 'PARK_STREET_BHOWANIPORE',
    zoneName: 'Central Kolkata Culinary Belt (Park Street / Bhowanipore)',
    maxActiveOrdersPerHour: 120,
    maxDeliveryRadiusKm: 6.0,
    minHygieneRatingThreshold: 90,
    operationalStatus: 'ACTIVE_PILOT',
    leadInspectorName: 'Inspector Subhashish Ghosh',
  },
];

export class InMemoryPilotStore implements PilotStore {
  private zones = new Map<PilotZoneCode, PilotZoneConfig>();
  private cohort = new Map<string, PilotCohortMember>(); // key: userId
  private killSwitch = {
    active: false,
    reason: undefined as string | undefined,
    lastUpdatedBy: undefined as string | undefined,
  };

  constructor() {
    for (const z of INITIAL_PILOT_ZONES) {
      this.zones.set(z.zoneCode, { ...z });
    }
  }

  async getZoneConfig(zoneCode: PilotZoneCode): Promise<PilotZoneConfig | null> {
    const found = this.zones.get(zoneCode);
    return found ? { ...found } : null;
  }

  async listZoneConfigs(): Promise<PilotZoneConfig[]> {
    return Array.from(this.zones.values()).map((z) => ({ ...z }));
  }

  async updateZoneStatus(
    zoneCode: PilotZoneCode,
    status: PilotOperationalStatus,
  ): Promise<PilotZoneConfig | null> {
    const existing = this.zones.get(zoneCode);
    if (!existing) return null;
    const updated = { ...existing, operationalStatus: status };
    this.zones.set(zoneCode, updated);
    return { ...updated };
  }

  async addCohortMember(member: PilotCohortMember): Promise<PilotCohortMember> {
    const clone = { ...member };
    this.cohort.set(member.userId, clone);
    return clone;
  }

  async findCohortMember(userId: string): Promise<PilotCohortMember | null> {
    const found = this.cohort.get(userId);
    return found ? { ...found } : null;
  }

  async listCohortMembers(zoneCode?: PilotZoneCode): Promise<PilotCohortMember[]> {
    const all = Array.from(this.cohort.values());
    if (zoneCode) {
      return all.filter((m) => m.zoneCode === zoneCode);
    }
    return all.map((m) => ({ ...m }));
  }

  async getGlobalKillSwitch(): Promise<{
    active: boolean;
    reason?: string;
    lastUpdatedBy?: string;
  }> {
    return { ...this.killSwitch };
  }

  async setGlobalKillSwitch(active: boolean, reason?: string, updatedBy?: string): Promise<void> {
    this.killSwitch = { active, reason, lastUpdatedBy: updatedBy };
  }
}

interface PilotCohortDoc extends Document {
  memberId: string;
  userId: string;
  cohortType: string;
  inviteCode: string;
  zoneCode: string;
  enrolledAt: Date;
  status: string;
}

const PilotCohortSchema = new Schema<PilotCohortDoc>(
  {
    memberId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, unique: true },
    cohortType: { type: String, required: true },
    inviteCode: { type: String, required: true },
    zoneCode: { type: String, required: true },
    enrolledAt: { type: Date, required: true },
    status: { type: String, required: true, default: 'ACTIVE' },
  },
  { timestamps: true },
);

export class MongoosePilotStore implements PilotStore {
  private fallback = new InMemoryPilotStore();
  private model: Model<PilotCohortDoc>;

  constructor() {
    this.model =
      (mongoose.models.PilotCohortMember as Model<PilotCohortDoc>) ||
      mongoose.model<PilotCohortDoc>('PilotCohortMember', PilotCohortSchema);
  }

  private isConnected(): boolean {
    return mongoose.connection.readyState === 1;
  }

  async getZoneConfig(zoneCode: PilotZoneCode): Promise<PilotZoneConfig | null> {
    return this.fallback.getZoneConfig(zoneCode);
  }

  async listZoneConfigs(): Promise<PilotZoneConfig[]> {
    return this.fallback.listZoneConfigs();
  }

  async updateZoneStatus(
    zoneCode: PilotZoneCode,
    status: PilotOperationalStatus,
  ): Promise<PilotZoneConfig | null> {
    return this.fallback.updateZoneStatus(zoneCode, status);
  }

  async addCohortMember(member: PilotCohortMember): Promise<PilotCohortMember> {
    if (!this.isConnected()) {
      return this.fallback.addCohortMember(member);
    }
    await this.model.findOneAndUpdate(
      { userId: member.userId },
      {
        memberId: member.id,
        userId: member.userId,
        cohortType: member.cohortType,
        inviteCode: member.inviteCode,
        zoneCode: member.zoneCode,
        enrolledAt: new Date(member.enrolledAt),
        status: member.status,
      },
      { upsert: true, new: true },
    );
    return member;
  }

  async findCohortMember(userId: string): Promise<PilotCohortMember | null> {
    if (!this.isConnected()) {
      return this.fallback.findCohortMember(userId);
    }
    const doc = await this.model.findOne({ userId }).lean();
    if (!doc) return null;
    return {
      id: doc.memberId,
      userId: doc.userId,
      cohortType: doc.cohortType as PilotCohortType,
      inviteCode: doc.inviteCode,
      zoneCode: doc.zoneCode as PilotZoneCode,
      enrolledAt: doc.enrolledAt.toISOString(),
      status: doc.status as 'ACTIVE' | 'REVOKED',
    };
  }

  async listCohortMembers(zoneCode?: PilotZoneCode): Promise<PilotCohortMember[]> {
    if (!this.isConnected()) {
      return this.fallback.listCohortMembers(zoneCode);
    }
    const query = zoneCode ? { zoneCode } : {};
    const docs = await this.model.find(query).lean();
    return docs.map((doc) => ({
      id: doc.memberId,
      userId: doc.userId,
      cohortType: doc.cohortType as PilotCohortType,
      inviteCode: doc.inviteCode,
      zoneCode: doc.zoneCode as PilotZoneCode,
      enrolledAt: doc.enrolledAt.toISOString(),
      status: doc.status as 'ACTIVE' | 'REVOKED',
    }));
  }

  async getGlobalKillSwitch(): Promise<{
    active: boolean;
    reason?: string;
    lastUpdatedBy?: string;
  }> {
    return this.fallback.getGlobalKillSwitch();
  }

  async setGlobalKillSwitch(active: boolean, reason?: string, updatedBy?: string): Promise<void> {
    return this.fallback.setGlobalKillSwitch(active, reason, updatedBy);
  }
}
