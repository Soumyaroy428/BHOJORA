export type DataSubjectRequestType = 'ACCESS_EXPORT' | 'ERASURE_FORGET_ME' | 'CONSENT_REVOCATION';

export type DataSubjectRequestStatus = 'SUBMITTED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED';

export interface DataSubjectRequestDto {
  id: string;
  userId: string;
  requestType: DataSubjectRequestType;
  status: DataSubjectRequestStatus;
  requestedAt: string;
  completedAt?: string;
  exportData?: Record<string, unknown>;
  rejectionReason?: string;
  complianceStandard: 'DPDP_ACT_2023';
}

export interface CreateDataSubjectRequestDto {
  requestType: DataSubjectRequestType;
  reason?: string;
}

export interface UserConsentDto {
  userId: string;
  essentialService: true; // Mandatory for order processing
  orderTrackingGps: boolean;
  marketingSmsEmail: boolean;
  analyticsCookies: boolean;
  updatedAt: string;
}

export interface UpdateConsentDto {
  orderTrackingGps?: boolean;
  marketingSmsEmail?: boolean;
  analyticsCookies?: boolean;
}

export interface RetentionPolicyDto {
  dataCategory: 'EPHEMERAL_GPS' | 'TRANSACTION_RECORDS' | 'AUDIT_LOGS' | 'INSPECTION_PHOTOS';
  retentionDays: number;
  statutoryBasis: string;
  purgeFrequency: 'DAILY' | 'MONTHLY';
}

export interface SecurityIncidentDto {
  id: string;
  severity: 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_LOW';
  title: string;
  summary: string;
  affectedScope: string[];
  certInReportRequired: boolean;
  detectedAt: string;
  containedAt?: string;
  resolvedAt?: string;
  status: 'OPEN' | 'CONTAINED' | 'RESOLVED';
  loggedByUserId: string;
}
