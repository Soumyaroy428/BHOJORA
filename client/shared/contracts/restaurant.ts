import type { UserRole } from './auth';
import type { GeoJsonPointDto, KolkataZoneId } from './customer';

export const ONBOARDING_APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'CHANGES_REQUESTED',
  'APPROVED',
  'REJECTED',
] as const;

export type OnboardingApplicationStatus = (typeof ONBOARDING_APPLICATION_STATUSES)[number];

export const FSSAI_VERIFICATION_STATUSES = [
  'NOT_SUBMITTED',
  'PENDING_REVIEW',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
] as const;

export type FssaiVerificationStatus = (typeof FSSAI_VERIFICATION_STATUSES)[number];

export const PLATFORM_INSPECTION_STATUSES = [
  'NOT_INSPECTED',
  'SCHEDULED',
  'VERIFIED_CLEAN',
  'ACTION_REQUIRED',
  'SUSPENDED',
  'EXPIRED',
] as const;

export type PlatformInspectionStatus = (typeof PLATFORM_INSPECTION_STATUSES)[number];

export const RESTAURANT_DOCUMENT_TYPES = [
  'FSSAI_CERTIFICATE',
  'PAN_CARD',
  'GSTIN_CERTIFICATE',
  'BANK_CANCELLED_CHEQUE',
  'MUNICIPAL_TRADE_LICENSE',
  'KITCHEN_PREMISES_PROOF',
] as const;

export type RestaurantDocumentType = (typeof RESTAURANT_DOCUMENT_TYPES)[number];

export const MANDATORY_ONBOARDING_DOCUMENT_TYPES = [
  'FSSAI_CERTIFICATE',
  'PAN_CARD',
  'BANK_CANCELLED_CHEQUE',
] as const satisfies readonly RestaurantDocumentType[];

export const DOCUMENT_VERIFICATION_STATUSES = ['PENDING_REVIEW', 'VERIFIED', 'REJECTED'] as const;
export type DocumentVerificationStatus = (typeof DOCUMENT_VERIFICATION_STATUSES)[number];

export const DOCUMENT_ACCESS_CLASSIFICATIONS = ['PRIVATE_COMPLIANCE'] as const;
export type DocumentAccessClassification = (typeof DOCUMENT_ACCESS_CLASSIFICATIONS)[number];

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedDocumentMimeType = (typeof ALLOWED_DOCUMENT_MIME_TYPES)[number];

export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const ONBOARDING_REVIEW_DECISIONS = ['APPROVE', 'REQUEST_CHANGES', 'REJECT'] as const;
export type OnboardingReviewDecision = (typeof ONBOARDING_REVIEW_DECISIONS)[number];

export const OPERATING_DAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type OperatingDayCode = (typeof OPERATING_DAY_CODES)[number];

export const FSSAI_SEPARATION_NOTICE =
  'Statutory FSSAI license verification only confirms legal registration; independent Bhojora kitchen hygiene inspection remains separate (NOT_INSPECTED until physical audit approval).' as const;

export interface OperatingSlotDto {
  dayOfWeek: OperatingDayCode;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface RestaurantLegalEntityDto {
  legalBusinessName: string;
  ownerFullName: string;
  ownerPhoneMasked: string;
  ownerBusinessEmail: string;
  panMasked: string;
  gstin: string | null;
  fssaiLicenseNumber: string;
  fssaiExpiresOn: string;
  fssaiVerificationStatus: FssaiVerificationStatus;
  fssaiVerifiedNote: string | null;
  fssaiVerifiedAt: string | null;
}

export interface OutletSetupDto {
  brandName: string;
  outletName: string;
  slug: string;
  streetAddress: string;
  landmark: string;
  locality: string;
  wardOrBorough: string;
  city: string;
  postalCode: string;
  zoneId: KolkataZoneId;
  location: GeoJsonPointDto;
  cuisines: string[];
  prepTimeMinutes: number;
  operatingSlots: OperatingSlotDto[];
}

export interface BankPayoutSummaryDto {
  accountHolderName: string;
  bankAccountMasked: string;
  ifscCode: string;
  payoutMode: 'NEFT_IMPS';
}

export interface RestaurantDocumentDto {
  documentId: string;
  applicationId: string;
  restaurantId: string;
  documentType: RestaurantDocumentType;
  fileName: string;
  mimeType: AllowedDocumentMimeType;
  sizeBytes: number;
  sha256Checksum: string;
  accessClassification: DocumentAccessClassification;
  isPublic: false;
  verificationStatus: DocumentVerificationStatus;
  reviewNote: string | null;
  uploadedAt: string;
}

export interface DocumentUploadIntentDto {
  uploadToken: string;
  storageKey: string;
  accessClassification: DocumentAccessClassification;
  expiresAt: string;
  maxSizeBytes: number;
  allowedMimeTypes: readonly string[];
}

export interface DocumentSignedAccessDto {
  documentId: string;
  storageKey: string;
  signedAccessUrl: string;
  accessClassification: DocumentAccessClassification;
  expiresAt: string;
  cacheControl: 'no-store';
}

export interface OnboardingReviewEntryDto {
  reviewId: string;
  reviewerUserId: string;
  reviewerRole: UserRole;
  decision: OnboardingReviewDecision;
  fssaiDecision: FssaiVerificationStatus;
  reason: string;
  reviewedAt: string;
}

export interface RestaurantApplicationDto {
  applicationId: string;
  restaurantId: string;
  outletId: string;
  ownerUserId: string;
  status: OnboardingApplicationStatus;
  fssaiVerificationStatus: FssaiVerificationStatus;
  platformInspectionStatus: PlatformInspectionStatus;
  publishedSafetyScore: number | null;
  fssaiSeparationNotice: string;
  legalEntity: RestaurantLegalEntityDto;
  outletSetup: OutletSetupDto;
  bankPayout: BankPayoutSummaryDto;
  documents: RestaurantDocumentDto[];
  reviewHistory: OnboardingReviewEntryDto[];
  submittedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicRestaurantSummaryDto {
  restaurantId: string;
  outletId: string;
  brandName: string;
  outletName: string;
  slug: string;
  zoneId: KolkataZoneId;
  wardOrBorough: string;
  cuisines: string[];
  fssaiLicenseNumber: string;
  fssaiExpiresOn: string;
  fssaiVerificationStatus: FssaiVerificationStatus;
  platformInspectionStatus: PlatformInspectionStatus;
  publishedSafetyScore: number | null;
  fssaiSeparationNotice: string;
}
