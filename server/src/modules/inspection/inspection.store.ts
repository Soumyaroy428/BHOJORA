import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import { applyBaseSchemaConventions, COLLECTION_NAMES } from '../../database/conventions';
import {
  ASSESSMENT_TYPES_RUNTIME,
  CHECKLIST_CATEGORIES_RUNTIME,
  EVIDENCE_TYPES_RUNTIME,
  FINDING_SEVERITIES_RUNTIME,
  INSPECTION_STATUSES_RUNTIME,
  type InspectionEvidenceRecord,
  type InspectionRecord,
} from './inspection.types';

export interface InspectionStore {
  createInspection(record: InspectionRecord): Promise<InspectionRecord>;
  getInspectionById(id: string): Promise<InspectionRecord | null>;
  getInspectionsForInspector(inspectorId: string): Promise<InspectionRecord[]>;
  getInspectionsForOutlet(outletId: string): Promise<InspectionRecord[]>;
  updateInspection(id: string, patch: Partial<InspectionRecord>): Promise<InspectionRecord | null>;
  addEvidence(record: InspectionEvidenceRecord): Promise<InspectionEvidenceRecord>;
  getEvidenceById(id: string): Promise<InspectionEvidenceRecord | null>;
  getEvidenceForInspection(inspectionId: string): Promise<InspectionEvidenceRecord[]>;
}

export class InMemoryInspectionStore implements InspectionStore {
  private readonly inspections = new Map<string, InspectionRecord>();
  private readonly evidenceRecords = new Map<string, InspectionEvidenceRecord>();

  async createInspection(record: InspectionRecord): Promise<InspectionRecord> {
    const clone: InspectionRecord = {
      ...record,
      findings: record.findings.map((f) => ({ ...f, evidenceIds: [...f.evidenceIds] })),
      evidence: record.evidence.map((e) => ({
        ...e,
        capturedCoordinates: [...e.capturedCoordinates],
      })),
    };
    this.inspections.set(record.id, clone);
    return clone;
  }

  async getInspectionById(id: string): Promise<InspectionRecord | null> {
    const found = this.inspections.get(id);
    return found ? { ...found } : null;
  }

  async getInspectionsForInspector(inspectorId: string): Promise<InspectionRecord[]> {
    const results = Array.from(this.inspections.values())
      .filter((i) => i.inspectorId === inspectorId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return results.map((r) => ({ ...r }));
  }

  async getInspectionsForOutlet(outletId: string): Promise<InspectionRecord[]> {
    const results = Array.from(this.inspections.values())
      .filter((i) => i.outletId === outletId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return results.map((r) => ({ ...r }));
  }

  async updateInspection(
    id: string,
    patch: Partial<InspectionRecord>,
  ): Promise<InspectionRecord | null> {
    const existing = this.inspections.get(id);
    if (!existing) {
      return null;
    }
    const updated: InspectionRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.inspections.set(id, updated);
    return { ...updated };
  }

  async addEvidence(record: InspectionEvidenceRecord): Promise<InspectionEvidenceRecord> {
    const clone: InspectionEvidenceRecord = {
      ...record,
      capturedCoordinates: [record.capturedCoordinates[0], record.capturedCoordinates[1]],
    };
    this.evidenceRecords.set(record.id, clone);

    const inspection = this.inspections.get(record.inspectionId);
    if (inspection) {
      inspection.evidence.push(clone);
      inspection.updatedAt = new Date();
    }
    return clone;
  }

  async getEvidenceById(id: string): Promise<InspectionEvidenceRecord | null> {
    const found = this.evidenceRecords.get(id);
    return found ? { ...found } : null;
  }

  async getEvidenceForInspection(inspectionId: string): Promise<InspectionEvidenceRecord[]> {
    const results = Array.from(this.evidenceRecords.values())
      .filter((e) => e.inspectionId === inspectionId)
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    return results.map((r) => ({ ...r }));
  }
}

const EvidenceMongooseSchema = new Schema<InspectionEvidenceRecord>(
  {
    id: { type: String, required: true, unique: true },
    inspectionId: { type: String, required: true, index: true },
    itemId: { type: String, required: false },
    evidenceType: { type: String, enum: EVIDENCE_TYPES_RUNTIME, required: true },
    sha256Hash: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    capturedAt: { type: Date, required: true },
    capturedCoordinates: { type: [Number], required: true },
    storageKey: { type: String, required: true },
    caption: { type: String, required: false },
  },
  { timestamps: true },
);

applyBaseSchemaConventions(EvidenceMongooseSchema);

const FindingMongooseSchema = new Schema(
  {
    itemId: { type: String, required: true },
    category: { type: String, enum: CHECKLIST_CATEGORIES_RUNTIME, required: true },
    score: { type: Number, required: true },
    maxScore: { type: Number, required: true },
    severity: { type: String, enum: FINDING_SEVERITIES_RUNTIME, required: true },
    comments: { type: String, required: false },
    evidenceIds: { type: [String], default: [] },
  },
  { _id: false },
);

const InspectionMongooseSchema = new Schema<InspectionRecord>(
  {
    id: { type: String, required: true, unique: true },
    outletId: { type: String, required: true, index: true },
    restaurantId: { type: String, required: true, index: true },
    inspectorId: { type: String, required: true, index: true },
    assessmentType: {
      type: String,
      enum: ASSESSMENT_TYPES_RUNTIME,
      required: true,
      default: 'ROUTINE',
    },
    checklistVersion: { type: String, required: true, default: 'v1.0' },
    status: {
      type: String,
      enum: INSPECTION_STATUSES_RUNTIME,
      required: true,
      default: 'SCHEDULED',
    },
    startedAt: { type: Date, required: true, default: Date.now },
    submittedAt: { type: Date, required: false },
    clientDraftSavedAt: { type: Date, required: false },
    findings: { type: [FindingMongooseSchema], default: [] },
    evidence: { type: [EvidenceMongooseSchema], default: [] },
    hasCriticalViolation: { type: Boolean, default: false },
    managerSignedAt: { type: Date, required: false },
    managerName: { type: String, required: false },
    managerDesignation: { type: String, required: false },
  },
  { timestamps: true },
);

applyBaseSchemaConventions(InspectionMongooseSchema);
InspectionMongooseSchema.index({ outletId: 1, startedAt: -1 });
InspectionMongooseSchema.index({ inspectorId: 1, status: 1 });

export class MongooseInspectionStore implements InspectionStore {
  private readonly inspectionModel: Model<InspectionRecord>;
  private readonly evidenceModel: Model<InspectionEvidenceRecord>;

  constructor(connection: Connection) {
    this.inspectionModel =
      (connection.models[COLLECTION_NAMES.inspections] as Model<InspectionRecord> | undefined) ??
      connection.model<InspectionRecord>(COLLECTION_NAMES.inspections, InspectionMongooseSchema);
    this.evidenceModel =
      (connection.models[COLLECTION_NAMES.inspectionEvidence] as
        Model<InspectionEvidenceRecord> | undefined) ??
      connection.model<InspectionEvidenceRecord>(
        COLLECTION_NAMES.inspectionEvidence,
        EvidenceMongooseSchema,
      );
  }

  async createInspection(record: InspectionRecord): Promise<InspectionRecord> {
    const doc = await this.inspectionModel.create(record);
    return doc.toObject();
  }

  async getInspectionById(id: string): Promise<InspectionRecord | null> {
    const doc = await this.inspectionModel.findOne({ id }).lean<InspectionRecord | null>().exec();
    return doc ?? null;
  }

  async getInspectionsForInspector(inspectorId: string): Promise<InspectionRecord[]> {
    const docs = await this.inspectionModel
      .find({ inspectorId })
      .sort({ createdAt: -1 })
      .lean<InspectionRecord[]>()
      .exec();
    return docs;
  }

  async getInspectionsForOutlet(outletId: string): Promise<InspectionRecord[]> {
    const docs = await this.inspectionModel
      .find({ outletId })
      .sort({ createdAt: -1 })
      .lean<InspectionRecord[]>()
      .exec();
    return docs;
  }

  async updateInspection(
    id: string,
    patch: Partial<InspectionRecord>,
  ): Promise<InspectionRecord | null> {
    const doc = await this.inspectionModel
      .findOneAndUpdate({ id }, { $set: { ...patch, updatedAt: new Date() } }, { new: true })
      .lean<InspectionRecord | null>()
      .exec();
    return doc ?? null;
  }

  async addEvidence(record: InspectionEvidenceRecord): Promise<InspectionEvidenceRecord> {
    const doc = await this.evidenceModel.create(record);
    await this.inspectionModel.updateOne(
      { id: record.inspectionId },
      { $push: { evidence: record }, $set: { updatedAt: new Date() } },
    );
    return doc.toObject();
  }

  async getEvidenceById(id: string): Promise<InspectionEvidenceRecord | null> {
    const doc = await this.evidenceModel
      .findOne({ id })
      .lean<InspectionEvidenceRecord | null>()
      .exec();
    return doc ?? null;
  }

  async getEvidenceForInspection(inspectionId: string): Promise<InspectionEvidenceRecord[]> {
    const docs = await this.evidenceModel
      .find({ inspectionId })
      .sort({ capturedAt: 1 })
      .lean<InspectionEvidenceRecord[]>()
      .exec();
    return docs;
  }
}
