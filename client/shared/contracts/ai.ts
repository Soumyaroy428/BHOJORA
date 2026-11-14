export type AiTaskType =
  | 'RECOMMENDATION_BASELINE'
  | 'COMPLAINT_CLASSIFICATION'
  | 'REPORT_SUMMARY'
  | 'IMAGE_RISK_FLAG'
  | 'DEMAND_FORECAST';

export type AiProposalStatus = 'PENDING_HUMAN_REVIEW' | 'APPROVED' | 'REJECTED';

export interface AiModelInfo {
  modelName: string;
  modelVersion: string;
  provider: string;
  promptHash: string;
  generatedAt: string;
}

export interface HumanReviewAudit {
  reviewerId: string;
  reviewerRole: string;
  decision: 'APPROVED' | 'REJECTED';
  feedback?: string;
  appliedChanges?: Record<string, unknown>;
  reviewedAt: string;
}

export interface RecommendationSuggestion {
  dishes: Array<{
    dishId: string;
    dishName: string;
    relevanceScore: number;
    reason: string;
  }>;
  restaurants: Array<{
    restaurantId: string;
    name: string;
    trustScore: number;
    matchReason: string;
  }>;
}

export interface ComplaintClassificationSuggestion {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  category: 'FOOD_SAFETY' | 'HYGIENE' | 'PACKAGING' | 'MISSING_ITEM' | 'LATE_DELIVERY' | 'OTHER';
  confidence: number;
  isHygieneRisk: boolean;
  recommendedAction: string;
  summary: string;
}

export interface ReportSummarySuggestion {
  executiveSummary: string;
  criticalIssues: string[];
  hygieneChecklistHighlights: {
    cleanliness: string;
    tempControl: string;
    pestControl: string;
    storageStandards: string;
  };
  suggestedActionItems: string[];
}

export interface ImageRiskFlagSuggestion {
  photoId: string;
  photoUrl?: string;
  detectedRisks: Array<{
    riskType:
      'OPEN_CONTAINER' | 'MISSING_PPE' | 'SURFACE_GREASE' | 'TEMPERATURE_ANOMALY' | 'PEST_TRACES';
    advisoryNote: string;
    confidence: number;
    boundingCoordinates?: { x: number; y: number; width: number; height: number };
  }>;
  requiresImmediateAction: boolean;
  humanReviewRequired: true;
}

export interface DemandForecastSuggestion {
  forecastDate: string;
  zone: string;
  outletId?: string;
  projectedOrderVolume: number;
  confidenceInterval: { min: number; max: number };
  factors: string[];
  prepRecommendations: string[];
}

export type AiSuggestedOutput =
  | RecommendationSuggestion
  | ComplaintClassificationSuggestion
  | ReportSummarySuggestion
  | ImageRiskFlagSuggestion
  | DemandForecastSuggestion
  | Record<string, unknown>;

export interface AiProposalDto<T = AiSuggestedOutput> {
  id: string;
  taskType: AiTaskType;
  targetEntity: string;
  targetId: string;
  modelInfo: AiModelInfo;
  confidenceScore: number;
  status: AiProposalStatus;
  suggestedOutput: T;
  explainabilityNotes: string[];
  humanReview?: HumanReviewAudit;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateAiProposalRequestDto {
  taskType: AiTaskType;
  targetEntity: string;
  targetId: string;
  inputPayload: Record<string, unknown>;
}

export interface ReviewAiProposalRequestDto {
  decision: 'APPROVED' | 'REJECTED';
  feedback?: string;
  appliedChanges?: Record<string, unknown>;
}

export interface AiEvaluationMetricsDto {
  totalProposals: number;
  pendingReview: number;
  approvedCount: number;
  rejectedCount: number;
  approvalRatePercentage: number;
  averageConfidence: number;
  averageLatencyMs: number;
  taskBreakdown: Record<
    AiTaskType,
    {
      count: number;
      approved: number;
      rejected: number;
      approvalRate: number;
    }
  >;
}
