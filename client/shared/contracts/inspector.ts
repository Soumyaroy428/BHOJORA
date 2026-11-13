export type InspectorStatus = 'APPLIED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';

export type ConflictType =
  'FINANCIAL_INTEREST' | 'PREVIOUS_EMPLOYMENT' | 'FAMILY_RELATION' | 'OWNERSHIP' | 'OTHER';

export type CertificateType =
  'FSSAI_FOSTAC' | 'FOOD_SAFETY_AUDITOR' | 'HACCP_LEAD_AUDITOR' | 'ISO_22000' | 'OTHER';

export interface InspectorConflictDeclaration {
  restaurantId: string;
  outletId?: string;
  conflictType: ConflictType;
  description: string;
  declaredAt: string;
}

export interface InspectorCertification {
  certificateType: CertificateType;
  certificateNumber: string;
  issuingAuthority: string;
  issuedAt: string;
  expiresAt: string;
}

export interface InspectorTrainingRecord {
  moduleName: string;
  completedAt: string;
  scorePercent: number;
  validUntil: string;
}

export interface InspectorProfile {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  badgeNumber: string;
  status: InspectorStatus;
  cityCode: string;
  certifications: InspectorCertification[];
  trainings: InspectorTrainingRecord[];
  conflicts: InspectorConflictDeclaration[];
  approvedByAdminId?: string;
  approvedAt?: string;
  rejectionReason?: string;
  suspendedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InspectorApplicationDto {
  fullName: string;
  phone: string;
  cityCode?: string;
  certifications: InspectorCertification[];
  conflicts?: InspectorConflictDeclaration[];
}

export interface InspectorReviewDecisionDto {
  decision: 'APPROVE' | 'REJECT' | 'SUSPEND';
  reason?: string;
}

export interface InspectorConflictUpdateDto {
  conflicts: InspectorConflictDeclaration[];
}

export interface InspectorEligibilityCheckDto {
  outletId: string;
  restaurantId?: string;
}

export interface InspectorEligibilityCheckResult {
  eligible: boolean;
  inspectorId: string;
  outletId: string;
  restaurantId?: string;
  reasons: string[];
}
