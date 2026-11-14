import type { Connection, Model } from 'mongoose';
import { Schema, model, models } from 'mongoose';
import type { DataSubjectRequestDto, SecurityIncidentDto, UserConsentDto } from './privacy.types';

export interface PrivacyStore {
  createDsr(dsr: DataSubjectRequestDto): Promise<DataSubjectRequestDto>;
  findDsrById(id: string): Promise<DataSubjectRequestDto | null>;
  findDsrsByUserId(userId: string): Promise<DataSubjectRequestDto[]>;
  updateDsr(
    id: string,
    patch: Partial<DataSubjectRequestDto>,
  ): Promise<DataSubjectRequestDto | null>;
  getConsent(userId: string): Promise<UserConsentDto | null>;
  upsertConsent(consent: UserConsentDto): Promise<UserConsentDto>;
  createIncident(incident: SecurityIncidentDto): Promise<SecurityIncidentDto>;
  listIncidents(): Promise<SecurityIncidentDto[]>;
}

export class InMemoryPrivacyStore implements PrivacyStore {
  private dsrs: Map<string, DataSubjectRequestDto> = new Map();
  private consents: Map<string, UserConsentDto> = new Map();
  private incidents: Map<string, SecurityIncidentDto> = new Map();

  public async createDsr(dsr: DataSubjectRequestDto): Promise<DataSubjectRequestDto> {
    const copy = structuredClone(dsr);
    this.dsrs.set(copy.id, copy);
    return copy;
  }

  public async findDsrById(id: string): Promise<DataSubjectRequestDto | null> {
    const found = this.dsrs.get(id);
    return found ? structuredClone(found) : null;
  }

  public async findDsrsByUserId(userId: string): Promise<DataSubjectRequestDto[]> {
    return Array.from(this.dsrs.values())
      .filter((d) => d.userId === userId)
      .map((d) => structuredClone(d));
  }

  public async updateDsr(
    id: string,
    patch: Partial<DataSubjectRequestDto>,
  ): Promise<DataSubjectRequestDto | null> {
    const existing = this.dsrs.get(id);
    if (!existing) {
      return null;
    }
    const updated = { ...existing, ...patch };
    this.dsrs.set(id, updated);
    return structuredClone(updated);
  }

  public async getConsent(userId: string): Promise<UserConsentDto | null> {
    const found = this.consents.get(userId);
    return found ? structuredClone(found) : null;
  }

  public async upsertConsent(consent: UserConsentDto): Promise<UserConsentDto> {
    const copy = structuredClone(consent);
    this.consents.set(copy.userId, copy);
    return copy;
  }

  public async createIncident(incident: SecurityIncidentDto): Promise<SecurityIncidentDto> {
    const copy = structuredClone(incident);
    this.incidents.set(copy.id, copy);
    return copy;
  }

  public async listIncidents(): Promise<SecurityIncidentDto[]> {
    return Array.from(this.incidents.values()).map((i) => structuredClone(i));
  }
}

interface DsrDocument {
  id: string;
  userId: string;
  requestType: string;
  status: string;
  requestedAt: string;
  completedAt?: string;
  exportData?: Record<string, unknown>;
  rejectionReason?: string;
  complianceStandard: string;
}

const dsrSchema = new Schema<DsrDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    requestType: { type: String, required: true },
    status: { type: String, required: true, index: true },
    requestedAt: { type: String, required: true },
    completedAt: { type: String },
    exportData: { type: Schema.Types.Mixed },
    rejectionReason: { type: String },
    complianceStandard: { type: String, default: 'DPDP_ACT_2023' },
  },
  { collection: 'data_subject_requests', versionKey: false },
);

export class MongoosePrivacyStore implements PrivacyStore {
  private dsrModel: Model<DsrDocument>;
  private memoryFallback: InMemoryPrivacyStore = new InMemoryPrivacyStore();

  constructor(connection?: Connection) {
    if (connection) {
      this.dsrModel =
        (connection.models.Dsr as Model<DsrDocument>) ||
        connection.model<DsrDocument>('Dsr', dsrSchema);
    } else {
      this.dsrModel = (models.Dsr as Model<DsrDocument>) || model<DsrDocument>('Dsr', dsrSchema);
    }
  }

  public async createDsr(dsr: DataSubjectRequestDto): Promise<DataSubjectRequestDto> {
    const doc = await this.dsrModel.create({
      ...dsr,
      exportData: dsr.exportData as Record<string, unknown> | undefined,
    });
    return this.mapDoc(doc);
  }

  public async findDsrById(id: string): Promise<DataSubjectRequestDto | null> {
    const doc = await this.dsrModel.findOne({ id }).lean<DsrDocument | null>();
    return doc ? this.mapDoc(doc) : null;
  }

  public async findDsrsByUserId(userId: string): Promise<DataSubjectRequestDto[]> {
    const docs = await this.dsrModel.find({ userId }).lean<DsrDocument[]>();
    return docs.map((d) => this.mapDoc(d));
  }

  public async updateDsr(
    id: string,
    patch: Partial<DataSubjectRequestDto>,
  ): Promise<DataSubjectRequestDto | null> {
    const doc = await this.dsrModel
      .findOneAndUpdate({ id }, { ...patch }, { new: true })
      .lean<DsrDocument | null>();
    return doc ? this.mapDoc(doc) : null;
  }

  public async getConsent(userId: string): Promise<UserConsentDto | null> {
    return this.memoryFallback.getConsent(userId);
  }

  public async upsertConsent(consent: UserConsentDto): Promise<UserConsentDto> {
    return this.memoryFallback.upsertConsent(consent);
  }

  public async createIncident(incident: SecurityIncidentDto): Promise<SecurityIncidentDto> {
    return this.memoryFallback.createIncident(incident);
  }

  public async listIncidents(): Promise<SecurityIncidentDto[]> {
    return this.memoryFallback.listIncidents();
  }

  private mapDoc(doc: DsrDocument): DataSubjectRequestDto {
    return {
      id: doc.id,
      userId: doc.userId,
      requestType: doc.requestType as DataSubjectRequestDto['requestType'],
      status: doc.status as DataSubjectRequestDto['status'],
      requestedAt: doc.requestedAt,
      completedAt: doc.completedAt,
      exportData: doc.exportData as Record<string, unknown> | undefined,
      rejectionReason: doc.rejectionReason,
      complianceStandard: 'DPDP_ACT_2023',
    };
  }
}
