export type ExpansionDecisionStatus = 'GO_EXPANSION' | 'NO_GO_HOLD' | 'CONDITIONAL_REVISION';

export interface UnitEconomicsMetrics {
  averageOrderValueInr: number;
  grossMerchandiseValueInr: number;
  netPlatformTakeRatePercent: number; // e.g., 16.5%
  averageCommissionPerOrderInr: number;
  deliveryFeeCollectedPerOrderInr: number;
  deliveryFleetCostPerOrderInr: number;
  paymentGatewayFeePerOrderInr: number;
  contributionMarginPerOrderInr: number; // positive unit economics
  isContributionMarginPositive: boolean;
}

export interface RetentionMetrics {
  sevenDayRepeatOrderRatePercent: number;
  fourteenDayRepeatOrderRatePercent: number;
  activeCustomerCount: number;
  activeRestaurantCount: number;
  restaurantChurnRatePercent: number;
  netPromoterScore: number;
}

export interface InspectionIntegrityMetrics {
  completedHygieneAudits: number;
  onTimeReAuditRatePercent: number;
  zeroTamperingReportsConfirmed: boolean;
  criticalComplaintsCount: number;
  averageHygieneRatingAcrossCohort: number;
}

export interface NextCityCandidate {
  cityCode: string;
  cityName: string;
  state: string;
  proximityToKolkataKm: number;
  targetLaunchQuarter: string;
  readinessScorePercent: number;
  estimatedInitialMerchantCount: number;
  keyCulinaryHubs: string[];
  strategicRationale: string;
}

export interface GoNoGoDecision {
  status: ExpansionDecisionStatus;
  overallScorePercent: number;
  unitEconomicsSatisfied: boolean;
  retentionSatisfied: boolean;
  safetySatisfied: boolean;
  founderApproved: boolean;
  founderSignOff?: {
    founderName: string;
    approvedAt: string;
    comments: string;
    auditSignature: string;
  };
  correctiveActionsRequired: string[];
}

export interface PilotEvaluationReport {
  cityCode: 'KOLKATA';
  evaluatedAt: string;
  unitEconomics: UnitEconomicsMetrics;
  retention: RetentionMetrics;
  inspectionIntegrity: InspectionIntegrityMetrics;
  decision: GoNoGoDecision;
  nextCityPlan: NextCityCandidate[];
}

export interface FounderApprovalRequest {
  founderName: string;
  approvalDecision: ExpansionDecisionStatus;
  comments: string;
}
