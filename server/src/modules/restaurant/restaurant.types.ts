import type { KolkataZoneId } from '../customer/customer.types';
import type { UserRole } from '../identity/identity.types';

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

export const OUTLET_OPERATIONAL_STATUSES = [
  'PENDING_APPROVAL',
  'ACTIVE',
  'TEMPORARILY_CLOSED',
  'SUSPENDED',
] as const;

export type OutletOperationalStatus = (typeof OUTLET_OPERATIONAL_STATUSES)[number];

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

export interface OperatingSlotRecord {
  dayOfWeek: OperatingDayCode;
  openTime: string;
  closeTime: string;
  isClosed: boolean;
}

export interface RestaurantLegalEntityRecord {
  legalBusinessName: string;
  ownerFullName: string;
  ownerPhoneMasked: string;
  ownerBusinessEmail: string;
  panMasked: string;
  panHash: string;
  gstin: string | null;
  fssaiLicenseNumber: string;
  fssaiExpiresOn: string;
  fssaiVerificationStatus: FssaiVerificationStatus;
  fssaiVerifiedNote: string | null;
  fssaiVerifiedAt: Date | null;
}

export interface OutletSetupRecord {
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
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  cuisines: string[];
  prepTimeMinutes: number;
  operatingSlots: OperatingSlotRecord[];
}

export interface BankPayoutRecord {
  accountHolderName: string;
  bankAccountMasked: string;
  bankAccountHash: string;
  ifscCode: string;
  payoutMode: 'NEFT_IMPS';
}

export interface OnboardingReviewEntryRecord {
  reviewId: string;
  reviewerUserId: string;
  reviewerRole: UserRole;
  decision: OnboardingReviewDecision;
  fssaiDecision: FssaiVerificationStatus;
  reason: string;
  reviewedAt: Date;
}

export interface RestaurantApplicationRecord {
  applicationId: string;
  restaurantId: string;
  outletId: string;
  ownerUserId: string;
  onboardingStatus: OnboardingApplicationStatus;
  fssaiVerificationStatus: FssaiVerificationStatus;
  platformInspectionStatus: PlatformInspectionStatus;
  publishedSafetyScore: number | null;
  legalEntity: RestaurantLegalEntityRecord;
  outletSetup: OutletSetupRecord;
  bankPayout: BankPayoutRecord;
  reviewHistory: OnboardingReviewEntryRecord[];
  submittedAt: Date | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RestaurantOutletRecord {
  outletId: string;
  restaurantId: string;
  ownerUserId: string;
  brandName: string;
  name: string;
  slug: string;
  zoneId: KolkataZoneId;
  wardOrBorough: string;
  streetAddress: string;
  landmark: string;
  locality: string;
  city: string;
  postalCode: string;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  cuisines: string[];
  prepTimeMinutes: number;
  deliveryRadiusMeters?: number;
  operatingSlots: OperatingSlotRecord[];
  status: OutletOperationalStatus;
  fssaiLicenseNumber: string;
  fssaiExpiresOn: string;
  fssaiVerificationStatus: FssaiVerificationStatus;
  platformInspectionStatus: PlatformInspectionStatus;
  publishedSafetyScore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RestaurantDocumentRecord {
  documentId: string;
  applicationId: string;
  restaurantId: string;
  ownerUserId: string;
  documentType: RestaurantDocumentType;
  fileName: string;
  mimeType: AllowedDocumentMimeType;
  sizeBytes: number;
  sha256Checksum: string;
  storageKey: string;
  accessClassification: DocumentAccessClassification;
  isPublic: false;
  verificationStatus: DocumentVerificationStatus;
  reviewNote: string | null;
  uploadedAt: Date;
  reviewedAt: Date | null;
}

export interface RestaurantStore {
  createApplication(record: RestaurantApplicationRecord): Promise<RestaurantApplicationRecord>;
  getApplicationById(idOrApplicationId: string): Promise<RestaurantApplicationRecord | null>;
  updateApplication(
    restaurantId: string,
    record: RestaurantApplicationRecord,
  ): Promise<RestaurantApplicationRecord | null>;
  listApplicationsByOwner(ownerUserId: string): Promise<RestaurantApplicationRecord[]>;
  listReviewQueue(status?: OnboardingApplicationStatus): Promise<RestaurantApplicationRecord[]>;

  upsertOutlet(outlet: RestaurantOutletRecord): Promise<RestaurantOutletRecord>;
  getOutletById(outletId: string): Promise<RestaurantOutletRecord | null>;
  listPublicOutlets(zoneId?: KolkataZoneId): Promise<RestaurantOutletRecord[]>;
  listAllOutlets(options?: {
    zoneId?: KolkataZoneId;
    status?: OutletOperationalStatus;
  }): Promise<RestaurantOutletRecord[]>;

  createDocument(doc: RestaurantDocumentRecord): Promise<RestaurantDocumentRecord>;
  getDocumentById(documentId: string): Promise<RestaurantDocumentRecord | null>;
  listDocumentsByRestaurant(restaurantId: string): Promise<RestaurantDocumentRecord[]>;
  updateDocumentReview(
    documentId: string,
    verificationStatus: DocumentVerificationStatus,
    reviewNote: string | null,
    reviewedAt: Date,
  ): Promise<RestaurantDocumentRecord | null>;
}
