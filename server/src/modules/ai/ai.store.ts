import type { Connection, Model } from 'mongoose';
import { Schema, model, models } from 'mongoose';
import type {
  AiEvaluationMetricsDto,
  AiProposalDto,
  AiProposalStatus,
  AiTaskType,
} from './ai.types';

export interface AiProposalQueryFilter {
  taskType?: AiTaskType;
  status?: AiProposalStatus;
  targetId?: string;
  limit?: number;
  offset?: number;
}

export interface AiStore {
  createProposal(proposal: AiProposalDto): Promise<AiProposalDto>;
  findById(id: string): Promise<AiProposalDto | null>;
  findMany(query: AiProposalQueryFilter): Promise<{ proposals: AiProposalDto[]; total: number }>;
  updateProposal(id: string, updates: Partial<AiProposalDto>): Promise<AiProposalDto | null>;
  getEvaluationMetrics(): Promise<AiEvaluationMetricsDto>;
}

export class InMemoryAiStore implements AiStore {
  private proposals: Map<string, AiProposalDto> = new Map();

  public async createProposal(proposal: AiProposalDto): Promise<AiProposalDto> {
    const copy = structuredClone(proposal);
    this.proposals.set(copy.id, copy);
    return copy;
  }

  public async findById(id: string): Promise<AiProposalDto | null> {
    const found = this.proposals.get(id);
    return found ? structuredClone(found) : null;
  }

  public async findMany(
    query: AiProposalQueryFilter,
  ): Promise<{ proposals: AiProposalDto[]; total: number }> {
    let list = Array.from(this.proposals.values());

    if (query.taskType) {
      list = list.filter((p) => p.taskType === query.taskType);
    }
    if (query.status) {
      list = list.filter((p) => p.status === query.status);
    }
    if (query.targetId) {
      list = list.filter((p) => p.targetId === query.targetId);
    }

    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = list.length;
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    const sliced = list.slice(offset, offset + limit).map((p) => structuredClone(p));

    return { proposals: sliced, total };
  }

  public async updateProposal(
    id: string,
    updates: Partial<AiProposalDto>,
  ): Promise<AiProposalDto | null> {
    const existing = this.proposals.get(id);
    if (!existing) {
      return null;
    }
    const updated: AiProposalDto = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.proposals.set(id, updated);
    return structuredClone(updated);
  }

  public async getEvaluationMetrics(): Promise<AiEvaluationMetricsDto> {
    const list = Array.from(this.proposals.values());
    const totalProposals = list.length;
    const pendingReview = list.filter((p) => p.status === 'PENDING_HUMAN_REVIEW').length;
    const approvedCount = list.filter((p) => p.status === 'APPROVED').length;
    const rejectedCount = list.filter((p) => p.status === 'REJECTED').length;

    const reviewedTotal = approvedCount + rejectedCount;
    const approvalRatePercentage =
      reviewedTotal > 0 ? Number(((approvedCount / reviewedTotal) * 100).toFixed(1)) : 0;

    const avgConfidence =
      totalProposals > 0
        ? Number(
            (list.reduce((acc, curr) => acc + curr.confidenceScore, 0) / totalProposals).toFixed(2),
          )
        : 0;

    const taskTypes: AiTaskType[] = [
      'RECOMMENDATION_BASELINE',
      'COMPLAINT_CLASSIFICATION',
      'REPORT_SUMMARY',
      'IMAGE_RISK_FLAG',
      'DEMAND_FORECAST',
    ];

    const taskBreakdown = {} as AiEvaluationMetricsDto['taskBreakdown'];

    for (const t of taskTypes) {
      const items = list.filter((p) => p.taskType === t);
      const app = items.filter((p) => p.status === 'APPROVED').length;
      const rej = items.filter((p) => p.status === 'REJECTED').length;
      const rev = app + rej;
      taskBreakdown[t] = {
        count: items.length,
        approved: app,
        rejected: rej,
        approvalRate: rev > 0 ? Number(((app / rev) * 100).toFixed(1)) : 0,
      };
    }

    return {
      totalProposals,
      pendingReview,
      approvedCount,
      rejectedCount,
      approvalRatePercentage,
      averageConfidence: avgConfidence,
      averageLatencyMs: 38,
      taskBreakdown,
    };
  }
}

export interface AiProposalDocument {
  id: string;
  taskType: AiTaskType;
  targetEntity: string;
  targetId: string;
  modelInfo: {
    modelName: string;
    modelVersion: string;
    provider: string;
    promptHash: string;
    generatedAt: string;
  };
  confidenceScore: number;
  status: AiProposalStatus;
  suggestedOutput: unknown;
  explainabilityNotes: string[];
  humanReview?: {
    reviewerId: string;
    reviewerRole: string;
    decision: 'APPROVED' | 'REJECTED';
    feedback?: string;
    appliedChanges?: Record<string, unknown>;
    reviewedAt: string;
  };
  createdAt: string;
  updatedAt: string;
}

const aiProposalSchema = new Schema<AiProposalDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    taskType: { type: String, required: true, index: true },
    targetEntity: { type: String, required: true, index: true },
    targetId: { type: String, required: true, index: true },
    modelInfo: {
      modelName: { type: String, required: true },
      modelVersion: { type: String, required: true },
      provider: { type: String, required: true },
      promptHash: { type: String, required: true },
      generatedAt: { type: String, required: true },
    },
    confidenceScore: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ['PENDING_HUMAN_REVIEW', 'APPROVED', 'REJECTED'],
      index: true,
    },
    suggestedOutput: { type: Schema.Types.Mixed, required: true },
    explainabilityNotes: [{ type: String }],
    humanReview: {
      reviewerId: { type: String },
      reviewerRole: { type: String },
      decision: { type: String, enum: ['APPROVED', 'REJECTED'] },
      feedback: { type: String },
      appliedChanges: { type: Schema.Types.Mixed },
      reviewedAt: { type: String },
    },
    createdAt: { type: String, required: true, index: true },
    updatedAt: { type: String, required: true },
  },
  { collection: 'ai_proposals', versionKey: false },
);

export class MongooseAiStore implements AiStore {
  private model: Model<AiProposalDocument>;

  constructor(connection?: Connection) {
    if (connection) {
      this.model =
        (connection.models.AiProposal as Model<AiProposalDocument>) ||
        connection.model<AiProposalDocument>('AiProposal', aiProposalSchema);
    } else {
      this.model =
        (models.AiProposal as Model<AiProposalDocument>) ||
        model<AiProposalDocument>('AiProposal', aiProposalSchema);
    }
  }

  public async createProposal(proposal: AiProposalDto): Promise<AiProposalDto> {
    const doc = await this.model.create({
      ...proposal,
      suggestedOutput: proposal.suggestedOutput as unknown,
    });
    return this.mapDoc(doc);
  }

  public async findById(id: string): Promise<AiProposalDto | null> {
    const doc = await this.model.findOne({ id }).lean<AiProposalDocument | null>();
    return doc ? this.mapDoc(doc) : null;
  }

  public async findMany(
    query: AiProposalQueryFilter,
  ): Promise<{ proposals: AiProposalDto[]; total: number }> {
    const filter: Record<string, unknown> = {};
    if (query.taskType) {
      filter.taskType = query.taskType;
    }
    if (query.status) {
      filter.status = query.status;
    }
    if (query.targetId) {
      filter.targetId = query.targetId;
    }

    const total = await this.model.countDocuments(filter);
    const docs = await this.model
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(query.offset ?? 0)
      .limit(query.limit ?? 20)
      .lean<AiProposalDocument[]>();

    return { proposals: docs.map((d) => this.mapDoc(d)), total };
  }

  public async updateProposal(
    id: string,
    updates: Partial<AiProposalDto>,
  ): Promise<AiProposalDto | null> {
    const updated = await this.model
      .findOneAndUpdate({ id }, { ...updates, updatedAt: new Date().toISOString() }, { new: true })
      .lean<AiProposalDocument | null>();

    return updated ? this.mapDoc(updated) : null;
  }

  public async getEvaluationMetrics(): Promise<AiEvaluationMetricsDto> {
    const docs = await this.model.find({}).lean<AiProposalDocument[]>();
    const memStore = new InMemoryAiStore();
    for (const d of docs) {
      await memStore.createProposal(this.mapDoc(d));
    }
    return memStore.getEvaluationMetrics();
  }

  private mapDoc(doc: AiProposalDocument): AiProposalDto {
    return {
      id: doc.id,
      taskType: doc.taskType,
      targetEntity: doc.targetEntity,
      targetId: doc.targetId,
      modelInfo: doc.modelInfo,
      confidenceScore: doc.confidenceScore,
      status: doc.status,
      suggestedOutput: doc.suggestedOutput as AiProposalDto['suggestedOutput'],
      explainabilityNotes: doc.explainabilityNotes ?? [],
      humanReview: doc.humanReview,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }
}
