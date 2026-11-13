import type { PlatformInspectionStatus } from './restaurant';
import type { AuditGrade, AuditOutcome, ChecklistCategory } from './inspection';

export interface CategoryScoreBreakdownDto {
  category: ChecklistCategory;
  categoryLabel: string;
  rawScore: number;
  maxScore: number;
  percentage: number;
}

export interface PublicEvidencePhotoDto {
  id: string;
  itemId?: string;
  evidenceType: string;
  sha256Hash: string;
  mimeType: string;
  capturedAt: string;
  caption?: string;
}

export interface PublicTrustProfileDto {
  outletId: string;
  restaurantId: string;
  brandName: string;
  outletName: string;
  slug: string;
  locality: string;
  zoneId: string;
  fssaiLicenseNumber: string;
  fssaiStatus: string;
  status: PlatformInspectionStatus;
  statusLabel: string;
  statusExplanation: string;
  isVerified: boolean;
  currentScore: number | null;
  grade: AuditGrade | null;
  outcome: AuditOutcome | null;
  inspectedAt: string | null;
  validUntil: string | null;
  isExpired: boolean;
  daysRemaining: number | null;
  categoryBreakdown: CategoryScoreBreakdownDto[];
  publicEvidence: PublicEvidencePhotoDto[];
  hasActiveSafetyInvestigation: boolean;
  statutoryDisclaimer: string;
  qrCode: string;
  verificationUrl: string;
}

export interface TrustHistoryItemDto {
  inspectionId: string;
  checklistVersion: string;
  assessmentType: string;
  reviewedAt: string;
  scorePercent: number;
  outcome: AuditOutcome;
  grade: AuditGrade;
  validUntil: string;
  isExpired: boolean;
  categoryBreakdown: CategoryScoreBreakdownDto[];
  evidenceCount: number;
}

export interface TrustHistoryResponseDto {
  outletId: string;
  totalAudits: number;
  history: TrustHistoryItemDto[];
}

export interface TrustQrCodeDto {
  qrCode: string;
  outletId: string;
  outletName: string;
  verificationUrl: string;
  status: PlatformInspectionStatus;
  score: number | null;
  grade: AuditGrade | null;
  validUntil: string | null;
  isExpired: boolean;
  hmacSignature: string;
  qrSvgDataUri: string;
}
