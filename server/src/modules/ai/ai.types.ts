import { z } from 'zod';
import type {
  AiTaskType,
  AiProposalStatus,
  AiSuggestedOutput,
  AiModelInfo,
  HumanReviewAudit,
  AiProposalDto,
  GenerateAiProposalRequestDto,
  ReviewAiProposalRequestDto,
  AiEvaluationMetricsDto,
  ComplaintClassificationSuggestion,
  DemandForecastSuggestion,
  ImageRiskFlagSuggestion,
  RecommendationSuggestion,
  ReportSummarySuggestion,
} from '@bhojora/shared';

export const AI_TASK_TYPES = [
  'RECOMMENDATION_BASELINE',
  'COMPLAINT_CLASSIFICATION',
  'REPORT_SUMMARY',
  'IMAGE_RISK_FLAG',
  'DEMAND_FORECAST',
] as const satisfies readonly AiTaskType[];

export const AI_PROPOSAL_STATUSES = [
  'PENDING_HUMAN_REVIEW',
  'APPROVED',
  'REJECTED',
] as const satisfies readonly AiProposalStatus[];

export const generateAiProposalSchema = z.object({
  taskType: z.enum(AI_TASK_TYPES),
  targetEntity: z.string().trim().min(1, 'targetEntity must not be empty'),
  targetId: z.string().trim().min(1, 'targetId must not be empty'),
  inputPayload: z.record(z.string(), z.unknown()),
});

export type GenerateAiProposalInput = z.infer<typeof generateAiProposalSchema>;

export const reviewAiProposalSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  feedback: z.string().trim().max(1000).optional(),
  appliedChanges: z.record(z.string(), z.unknown()).optional(),
});

export type ReviewAiProposalInput = z.infer<typeof reviewAiProposalSchema>;

export const aiProposalQuerySchema = z.object({
  taskType: z.enum(AI_TASK_TYPES).optional(),
  status: z.enum(AI_PROPOSAL_STATUSES).optional(),
  targetId: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type AiProposalQuery = z.infer<typeof aiProposalQuerySchema>;

export interface AiGenerationResult {
  output: AiSuggestedOutput;
  confidenceScore: number;
  explainabilityNotes: string[];
  modelInfo: AiModelInfo;
  latencyMs: number;
}

export type {
  AiTaskType,
  AiProposalStatus,
  AiSuggestedOutput,
  AiModelInfo,
  HumanReviewAudit,
  AiProposalDto,
  GenerateAiProposalRequestDto,
  ReviewAiProposalRequestDto,
  AiEvaluationMetricsDto,
  ComplaintClassificationSuggestion,
  DemandForecastSuggestion,
  ImageRiskFlagSuggestion,
  RecommendationSuggestion,
  ReportSummarySuggestion,
};
