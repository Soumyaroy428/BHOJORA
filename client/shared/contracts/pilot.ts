export type PilotZoneCode = 'SALT_LAKE_SEC_V' | 'PARK_STREET_BHOWANIPORE';

export type PilotOperationalStatus =
  'ACTIVE_PILOT' | 'PAUSED_MAINTENANCE' | 'EMERGENCY_KILL_SWITCH' | 'ROLLBACK_TRIGGERED';

export type PilotCohortType = 'CUSTOMER' | 'RESTAURANT' | 'DELIVERY_RIDER' | 'INSPECTOR';

export interface PilotZoneConfig {
  zoneCode: PilotZoneCode;
  zoneName: string;
  maxActiveOrdersPerHour: number;
  maxDeliveryRadiusKm: number;
  minHygieneRatingThreshold: number;
  operationalStatus: PilotOperationalStatus;
  leadInspectorName: string;
}

export interface PilotThresholdsEvaluation {
  onTimeDeliveryRatePercent: number; // Target >= 92%
  onTimeThresholdMet: boolean;
  foodSafetyIncidentCount: number; // Target === 0
  safetyThresholdMet: boolean;
  paymentSettlementRatePercent: number; // Target >= 99%
  paymentThresholdMet: boolean;
  orderCompletionRatePercent: number; // Target >= 95%
  completionThresholdMet: boolean;
  customerSatisfactionScore: number; // Target >= 4.5 / 5.0
  satisfactionThresholdMet: boolean;
  allThresholdsSatisfied: boolean;
}

export interface PilotCohortMember {
  id: string;
  userId: string;
  cohortType: PilotCohortType;
  inviteCode: string;
  zoneCode: PilotZoneCode;
  enrolledAt: string;
  status: 'ACTIVE' | 'REVOKED';
  metadata?: Record<string, unknown>;
}

export interface PilotLiveStatus {
  status: PilotOperationalStatus;
  cityCode: 'KOLKATA';
  zones: PilotZoneConfig[];
  totalCohortMembers: number;
  activeOrdersInFlight: number;
  completedOrdersCount: number;
  evaluatedAt: string;
  thresholds: PilotThresholdsEvaluation;
  killSwitchActive: boolean;
  killSwitchReason?: string;
  lastUpdatedBy?: string;
}

export interface JoinPilotCohortRequest {
  inviteCode: string;
  zoneCode: PilotZoneCode;
  cohortType: PilotCohortType;
}

export interface EmergencyRollbackRequest {
  reason: string;
  zoneCode?: PilotZoneCode;
}
