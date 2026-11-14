import { randomUUID } from 'crypto';
import { AppError } from '../../middleware/error-handler';
import type { AiProviderAdapter } from './ai.adapter';
import type { AiStore } from './ai.store';
import type {
  AiEvaluationMetricsDto,
  AiProposalDto,
  AiProposalQuery,
  GenerateAiProposalInput,
  HumanReviewAudit,
  ReviewAiProposalInput,
} from './ai.types';

export class AiService {
  constructor(
    private readonly store: AiStore,
    private readonly adapter: AiProviderAdapter,
  ) {}

  public async generateProposal(
    input: GenerateAiProposalInput,
    _requesterId: string,
  ): Promise<AiProposalDto> {
    const generation = await this.adapter.generate(input.taskType, input.inputPayload);

    const now = new Date().toISOString();
    const proposal: AiProposalDto = {
      id: `aip_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      taskType: input.taskType,
      targetEntity: input.targetEntity,
      targetId: input.targetId,
      modelInfo: generation.modelInfo,
      confidenceScore: generation.confidenceScore,
      // MANDATORY SAFETY RULE: AI suggestions are NEVER automatically applied.
      // They MUST always enter the queue as PENDING_HUMAN_REVIEW.
      status: 'PENDING_HUMAN_REVIEW',
      suggestedOutput: generation.output,
      explainabilityNotes: generation.explainabilityNotes,
      createdAt: now,
      updatedAt: now,
    };

    return await this.store.createProposal(proposal);
  }

  public async reviewProposal(
    proposalId: string,
    input: ReviewAiProposalInput,
    reviewer: { userId: string; role: string },
  ): Promise<AiProposalDto> {
    const proposal = await this.store.findById(proposalId);
    if (!proposal) {
      throw new AppError(404, 'NOT_FOUND', `AI proposal with ID '${proposalId}' was not found`);
    }

    if (proposal.status !== 'PENDING_HUMAN_REVIEW') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `AI proposal '${proposalId}' has already been reviewed with outcome '${proposal.status}'`,
      );
    }

    const now = new Date().toISOString();
    const reviewAudit: HumanReviewAudit = {
      reviewerId: reviewer.userId,
      reviewerRole: reviewer.role,
      decision: input.decision,
      feedback: input.feedback,
      appliedChanges: input.appliedChanges,
      reviewedAt: now,
    };

    const updated = await this.store.updateProposal(proposalId, {
      status: input.decision,
      humanReview: reviewAudit,
      suggestedOutput: input.appliedChanges
        ? { ...proposal.suggestedOutput, ...input.appliedChanges }
        : proposal.suggestedOutput,
    });

    if (!updated) {
      throw new AppError(
        500,
        'INTERNAL_SERVER_ERROR',
        'Failed to update AI proposal review status',
      );
    }

    return updated;
  }

  public async getProposalById(proposalId: string): Promise<AiProposalDto> {
    const proposal = await this.store.findById(proposalId);
    if (!proposal) {
      throw new AppError(404, 'NOT_FOUND', `AI proposal with ID '${proposalId}' was not found`);
    }
    return proposal;
  }

  public async listProposals(
    query: AiProposalQuery,
  ): Promise<{ proposals: AiProposalDto[]; total: number; limit: number; offset: number }> {
    const result = await this.store.findMany(query);
    return {
      proposals: result.proposals,
      total: result.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  public async getEvaluationMetrics(): Promise<AiEvaluationMetricsDto> {
    return await this.store.getEvaluationMetrics();
  }
}
