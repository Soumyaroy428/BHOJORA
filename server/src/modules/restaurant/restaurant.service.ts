import crypto from 'node:crypto';
import { z } from 'zod';
import type { Logger } from '../../config/logger';
import { isValidGeoJsonPointCoordinates } from '../../database/conventions';
import { AppError } from '../../middleware/error-handler';
import { isLikelySwappedKolkataPoint } from '../outlet/outlet.geo';
import { KOLKATA_ZONE_IDS, type KolkataZoneId } from '../customer/customer.types';
import { maskPhone, normalizeIndianPhone } from '../identity/identity.crypto';
import {
  SYSTEM_CLOCK,
  type Clock,
  type IdentityStore,
  type UserRole,
} from '../identity/identity.types';
import { assertMfaSatisfiedForRole, hasOutletMembership } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_VERIFICATION_STATUSES,
  FSSAI_SEPARATION_NOTICE,
  FSSAI_VERIFICATION_STATUSES,
  MANDATORY_ONBOARDING_DOCUMENT_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  ONBOARDING_REVIEW_DECISIONS,
  OPERATING_DAY_CODES,
  RESTAURANT_DOCUMENT_TYPES,
  type AllowedDocumentMimeType,
  type DocumentVerificationStatus,
  type FssaiVerificationStatus,
  type OnboardingApplicationStatus,
  type OperatingDayCode,
  type OperatingSlotRecord,
  type RestaurantApplicationRecord,
  type RestaurantDocumentRecord,
  type RestaurantDocumentType,
  type RestaurantOutletRecord,
  type RestaurantStore,
} from './restaurant.types';

const ZONE_CENTERS: Readonly<Record<KolkataZoneId, readonly [number, number]>> = {
  'salt-lake': [88.4317, 22.5806],
  central: [88.3526, 22.5535],
  'new-town': [88.4655, 22.5922],
  south: [88.3665, 22.5262],
  north: [88.3735, 22.6012],
};

const DEFAULT_OPERATING_SLOTS: OperatingSlotRecord[] = OPERATING_DAY_CODES.map((dayOfWeek) => ({
  dayOfWeek,
  openTime: '11:00',
  closeTime: '23:00',
  isClosed: false,
}));

const UPLOAD_TOKEN_TTL_SECONDS = 900;
const SIGNED_ACCESS_TTL_SECONDS = 120;

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24h format');

const operatingSlotSchema = z
  .object({
    dayOfWeek: z.enum(OPERATING_DAY_CODES),
    openTime: timeStringSchema.default('11:00'),
    closeTime: timeStringSchema.default('23:00'),
    isClosed: z.boolean().default(false),
  })
  .refine((slot) => slot.isClosed || slot.openTime < slot.closeTime, {
    message: 'Closing time must be later than opening time',
  });

const createApplicationSchema = z.object({
  legalEntity: z.object({
    legalBusinessName: z.string().trim().min(2).max(140),
    ownerFullName: z.string().trim().min(2).max(120),
    ownerPhone: z.string().trim().min(10).max(24),
    ownerBusinessEmail: z.string().trim().email().max(140),
    panNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'Enter a valid 10-character Indian PAN'),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, 'Enter a valid 15-character GSTIN')
      .nullable()
      .optional(),
    fssaiLicenseNumber: z
      .string()
      .trim()
      .regex(/^\d{14}$/, 'FSSAI license number must be exactly 14 digits'),
    fssaiExpiresOn: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD expiry date format'),
  }),
  outletSetup: z.object({
    brandName: z.string().trim().min(2).max(120),
    outletName: z.string().trim().min(2).max(120),
    streetAddress: z.string().trim().min(5).max(240),
    landmark: z.string().trim().min(2).max(140),
    locality: z.string().trim().min(2).max(80),
    wardOrBorough: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(60).default('Kolkata'),
    postalCode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit Indian PIN code'),
    zoneId: z.enum(KOLKATA_ZONE_IDS),
    coordinates: z
      .tuple([z.number(), z.number()])
      .refine(
        (coords) => isValidGeoJsonPointCoordinates(coords) && !isLikelySwappedKolkataPoint(coords),
        {
          message: 'Coordinates must be finite [longitude, latitude] (not swapped [lat, lng])',
        },
      )
      .optional(),
    cuisines: z.array(z.string().trim().min(2).max(40)).min(1).max(6),
    prepTimeMinutes: z.number().int().min(10).max(90).default(30),
    operatingSlots: z.array(operatingSlotSchema).min(1).max(7).optional(),
  }),
  bankPayout: z.object({
    accountHolderName: z.string().trim().min(2).max(120),
    bankAccountNumber: z
      .string()
      .trim()
      .regex(/^\d{9,18}$/, 'Bank account number must contain 9 to 18 digits'),
    ifscCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid 11-character Indian IFSC code'),
  }),
});

const updateApplicationSchema = z
  .object({
    legalEntity: createApplicationSchema.shape.legalEntity.partial().optional(),
    outletSetup: createApplicationSchema.shape.outletSetup.partial().optional(),
    bankPayout: createApplicationSchema.shape.bankPayout.partial().optional(),
  })
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one onboarding section must be provided',
  });

const uploadIntentSchema = z.object({
  documentType: z.enum(RESTAURANT_DOCUMENT_TYPES),
  fileName: z.string().trim().min(3).max(160),
  mimeType: z.enum(ALLOWED_DOCUMENT_MIME_TYPES),
  sizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_SIZE_BYTES),
  sha256Checksum: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-f0-9]{64}$/, 'SHA-256 digest must be 64 lowercase hex characters'),
});

const confirmDocumentSchema = uploadIntentSchema.extend({
  uploadToken: z.string().trim().min(20).max(600),
  storageKey: z.string().trim().min(10).max(320),
});

const reviewApplicationSchema = z.object({
  decision: z.enum(ONBOARDING_REVIEW_DECISIONS),
  fssaiVerificationDecision: z.enum(FSSAI_VERIFICATION_STATUSES),
  reason: z.string().trim().min(8, 'Review decision requires an explicit audit reason').max(240),
  fssaiVerifiedNote: z.string().trim().max(240).nullable().optional(),
  documentReviews: z
    .array(
      z.object({
        documentId: z.string().trim().min(1),
        verificationStatus: z.enum(DOCUMENT_VERIFICATION_STATUSES),
        note: z.string().trim().max(240).nullable().optional(),
      }),
    )
    .optional(),
});

function maskPan(pan: string): string {
  const upper = pan.trim().toUpperCase();
  return `${upper.slice(0, 2)}*****${upper.slice(-2)}`;
}

function maskBankAccount(accountNumber: string): string {
  const clean = accountNumber.trim();
  const maskedLen = Math.max(4, clean.length - 4);
  return `${'X'.repeat(maskedLen)}${clean.slice(-4)}`;
}

function hmacDigest(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

function sanitizeFileName(rawName: string): string {
  if (rawName.includes('..') || rawName.includes('/') || rawName.includes('\\')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Unsafe path traversal characters in fileName');
  }
  const normalized = rawName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  if (!normalized || normalized.startsWith('.')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Provide a valid document file name');
  }
  return normalized;
}

function buildOutletSlug(brandName: string, outletName: string, idSuffix: string): string {
  const base = `${brandName}-${outletName}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${base || 'kolkata-kitchen'}-${idSuffix.slice(0, 6)}`;
}

function normalizeSlots(
  slots?: readonly z.infer<typeof operatingSlotSchema>[],
): OperatingSlotRecord[] {
  if (!slots || slots.length === 0) {
    return DEFAULT_OPERATING_SLOTS.map((slot) => ({ ...slot }));
  }
  const byDay = new Map<OperatingDayCode, OperatingSlotRecord>();
  for (const base of DEFAULT_OPERATING_SLOTS) {
    byDay.set(base.dayOfWeek, { ...base });
  }
  for (const item of slots) {
    byDay.set(item.dayOfWeek, {
      dayOfWeek: item.dayOfWeek,
      openTime: item.openTime,
      closeTime: item.closeTime,
      isClosed: item.isClosed,
    });
  }
  return OPERATING_DAY_CODES.map((day) => byDay.get(day)!);
}

function isFssaiExpiredOnDate(fssaiExpiresOn: string, now: Date): boolean {
  const todayIso = now.toISOString().slice(0, 10);
  return fssaiExpiresOn <= todayIso;
}

function toDocumentDto(doc: RestaurantDocumentRecord) {
  return {
    documentId: doc.documentId,
    applicationId: doc.applicationId,
    restaurantId: doc.restaurantId,
    documentType: doc.documentType,
    fileName: doc.fileName,
    mimeType: doc.mimeType,
    sizeBytes: doc.sizeBytes,
    sha256Checksum: doc.sha256Checksum,
    accessClassification: doc.accessClassification,
    isPublic: doc.isPublic,
    verificationStatus: doc.verificationStatus,
    reviewNote: doc.reviewNote,
    uploadedAt: doc.uploadedAt.toISOString(),
  };
}

function toApplicationDto(
  record: RestaurantApplicationRecord,
  documents: readonly RestaurantDocumentRecord[],
) {
  return {
    applicationId: record.applicationId,
    restaurantId: record.restaurantId,
    outletId: record.outletId,
    ownerUserId: record.ownerUserId,
    status: record.onboardingStatus,
    fssaiVerificationStatus: record.fssaiVerificationStatus,
    platformInspectionStatus: record.platformInspectionStatus,
    publishedSafetyScore: record.publishedSafetyScore,
    fssaiSeparationNotice: FSSAI_SEPARATION_NOTICE,
    legalEntity: {
      legalBusinessName: record.legalEntity.legalBusinessName,
      ownerFullName: record.legalEntity.ownerFullName,
      ownerPhoneMasked: record.legalEntity.ownerPhoneMasked,
      ownerBusinessEmail: record.legalEntity.ownerBusinessEmail,
      panMasked: record.legalEntity.panMasked,
      gstin: record.legalEntity.gstin,
      fssaiLicenseNumber: record.legalEntity.fssaiLicenseNumber,
      fssaiExpiresOn: record.legalEntity.fssaiExpiresOn,
      fssaiVerificationStatus: record.legalEntity.fssaiVerificationStatus,
      fssaiVerifiedNote: record.legalEntity.fssaiVerifiedNote,
      fssaiVerifiedAt: record.legalEntity.fssaiVerifiedAt
        ? record.legalEntity.fssaiVerifiedAt.toISOString()
        : null,
    },
    outletSetup: record.outletSetup,
    bankPayout: {
      accountHolderName: record.bankPayout.accountHolderName,
      bankAccountMasked: record.bankPayout.bankAccountMasked,
      ifscCode: record.bankPayout.ifscCode,
      payoutMode: record.bankPayout.payoutMode,
    },
    documents: documents.map(toDocumentDto),
    reviewHistory: record.reviewHistory.map((entry) => ({
      reviewId: entry.reviewId,
      reviewerUserId: entry.reviewerUserId,
      reviewerRole: entry.reviewerRole,
      decision: entry.decision,
      fssaiDecision: entry.fssaiDecision,
      reason: entry.reason,
      reviewedAt: entry.reviewedAt.toISOString(),
    })),
    submittedAt: record.submittedAt ? record.submittedAt.toISOString() : null,
    decidedAt: record.decidedAt ? record.decidedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toPublicSummaryDto(outlet: RestaurantOutletRecord) {
  return {
    restaurantId: outlet.restaurantId,
    outletId: outlet.outletId,
    brandName: outlet.brandName,
    outletName: outlet.name,
    slug: outlet.slug,
    zoneId: outlet.zoneId,
    wardOrBorough: outlet.wardOrBorough,
    cuisines: [...outlet.cuisines],
    fssaiLicenseNumber: outlet.fssaiLicenseNumber,
    fssaiExpiresOn: outlet.fssaiExpiresOn,
    fssaiVerificationStatus: outlet.fssaiVerificationStatus,
    platformInspectionStatus: outlet.platformInspectionStatus,
    publishedSafetyScore: outlet.publishedSafetyScore,
    fssaiSeparationNotice: FSSAI_SEPARATION_NOTICE,
  };
}

export interface RestaurantServiceOptions {
  restaurantStore: RestaurantStore;
  identityStore: IdentityStore;
  rbacStore: RbacStore;
  signingSecret: string;
  logger: Logger;
  clock?: Clock;
}

export class RestaurantService {
  private readonly restaurantStore: RestaurantStore;
  private readonly identityStore: IdentityStore;
  private readonly rbacStore: RbacStore;
  private readonly signingSecret: string;
  private readonly logger: Logger;
  private readonly clock: Clock;

  constructor(options: RestaurantServiceOptions) {
    this.restaurantStore = options.restaurantStore;
    this.identityStore = options.identityStore;
    this.rbacStore = options.rbacStore;
    this.signingSecret = options.signingSecret;
    this.logger = options.logger;
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  private signDocumentPayload(payload: Record<string, string | number>): string {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const sig = crypto.createHmac('sha256', this.signingSecret).update(encoded).digest('base64url');
    return `${encoded}.${sig}`;
  }

  private verifySignedToken(token: string): Record<string, string | number> {
    const parts = token.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new AppError(403, 'FORBIDDEN', 'Invalid signed compliance document token');
    }
    const [encoded, providedSig] = parts;
    const expectedSig = crypto
      .createHmac('sha256', this.signingSecret)
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(providedSig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new AppError(403, 'FORBIDDEN', 'Compliance document upload signature mismatch');
    }
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
      string,
      string | number
    >;
  }

  private async assertApplicationOwner(
    applicationId: string,
    actorUserId: string,
    actorRole: UserRole,
    action: string,
    requestId?: string,
  ): Promise<RestaurantApplicationRecord> {
    const existing = await this.restaurantStore.getApplicationById(applicationId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', 'Restaurant onboarding application not found');
    }
    if (existing.ownerUserId !== actorUserId) {
      await this.rbacStore.appendAuditLog({
        actorId: actorUserId,
        actorRole,
        action,
        resourceType: 'restaurant_application',
        resourceId: existing.applicationId,
        outcome: 'DENIED',
        reason: 'Cross-applicant access to restaurant onboarding record rejected',
        requestId: requestId ?? null,
      });
      throw new AppError(403, 'FORBIDDEN', 'You may only access your own onboarding application');
    }
    return existing;
  }

  async createApplication(
    ownerUserId: string,
    actorRole: UserRole,
    rawBody: unknown,
    requestId?: string,
  ) {
    const input = createApplicationSchema.parse(rawBody);
    const now = this.clock.now();
    const normalizedPhone = normalizeIndianPhone(input.legalEntity.ownerPhone);
    if (!normalizedPhone) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Enter a valid 10-digit Indian owner mobile number',
      );
    }
    const restaurantId = `rest_${crypto.randomUUID().slice(0, 12)}`;
    const applicationId = `app_${crypto.randomUUID().slice(0, 12)}`;
    const outletId = `outlet_${crypto.randomUUID().slice(0, 12)}`;
    const center = ZONE_CENTERS[input.outletSetup.zoneId];

    const record: RestaurantApplicationRecord = {
      applicationId,
      restaurantId,
      outletId,
      ownerUserId,
      onboardingStatus: 'DRAFT',
      fssaiVerificationStatus: 'NOT_SUBMITTED',
      platformInspectionStatus: 'NOT_INSPECTED',
      publishedSafetyScore: null,
      legalEntity: {
        legalBusinessName: input.legalEntity.legalBusinessName,
        ownerFullName: input.legalEntity.ownerFullName,
        ownerPhoneMasked: maskPhone(normalizedPhone),
        ownerBusinessEmail: input.legalEntity.ownerBusinessEmail.toLowerCase(),
        panMasked: maskPan(input.legalEntity.panNumber),
        panHash: hmacDigest(input.legalEntity.panNumber.toUpperCase(), this.signingSecret),
        gstin: input.legalEntity.gstin ? input.legalEntity.gstin.toUpperCase() : null,
        fssaiLicenseNumber: input.legalEntity.fssaiLicenseNumber,
        fssaiExpiresOn: input.legalEntity.fssaiExpiresOn,
        fssaiVerificationStatus: 'NOT_SUBMITTED',
        fssaiVerifiedNote: null,
        fssaiVerifiedAt: null,
      },
      outletSetup: {
        brandName: input.outletSetup.brandName,
        outletName: input.outletSetup.outletName,
        slug: buildOutletSlug(input.outletSetup.brandName, input.outletSetup.outletName, outletId),
        streetAddress: input.outletSetup.streetAddress,
        landmark: input.outletSetup.landmark,
        locality: input.outletSetup.locality,
        wardOrBorough: input.outletSetup.wardOrBorough,
        city: input.outletSetup.city,
        postalCode: input.outletSetup.postalCode,
        zoneId: input.outletSetup.zoneId,
        location: {
          type: 'Point',
          coordinates: input.outletSetup.coordinates
            ? [...input.outletSetup.coordinates]
            : [center[0], center[1]],
        },
        cuisines: input.outletSetup.cuisines,
        prepTimeMinutes: input.outletSetup.prepTimeMinutes,
        operatingSlots: normalizeSlots(input.outletSetup.operatingSlots),
      },
      bankPayout: {
        accountHolderName: input.bankPayout.accountHolderName,
        bankAccountMasked: maskBankAccount(input.bankPayout.bankAccountNumber),
        bankAccountHash: hmacDigest(input.bankPayout.bankAccountNumber, this.signingSecret),
        ifscCode: input.bankPayout.ifscCode.toUpperCase(),
        payoutMode: 'NEFT_IMPS',
      },
      reviewHistory: [],
      submittedAt: null,
      decidedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.restaurantStore.createApplication(record);
    await this.rbacStore.appendAuditLog({
      actorId: ownerUserId,
      actorRole,
      action: 'restaurant.application.created',
      resourceType: 'restaurant_application',
      resourceId: created.applicationId,
      outcome: 'ALLOWED',
      reason: `Onboarding draft initialized for ${created.outletSetup.outletName}`,
      requestId: requestId ?? null,
      now,
    });
    this.logger.info('restaurant.onboarding.draft_created', {
      applicationId: created.applicationId,
      restaurantId: created.restaurantId,
    });

    return toApplicationDto(created, []);
  }

  async listOwnApplications(ownerUserId: string) {
    const records = await this.restaurantStore.listApplicationsByOwner(ownerUserId);
    const bundles = await Promise.all(
      records.map(async (item) => {
        const docs = await this.restaurantStore.listDocumentsByRestaurant(item.restaurantId);
        return toApplicationDto(item, docs);
      }),
    );
    return bundles;
  }

  async getOwnApplication(
    applicationId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string,
  ) {
    const existing = await this.assertApplicationOwner(
      applicationId,
      actorUserId,
      actorRole,
      'restaurant.application.read',
      requestId,
    );
    const docs = await this.restaurantStore.listDocumentsByRestaurant(existing.restaurantId);
    return toApplicationDto(existing, docs);
  }

  async updateOwnApplication(
    applicationId: string,
    actorUserId: string,
    actorRole: UserRole,
    rawBody: unknown,
    requestId?: string,
  ) {
    const existing = await this.assertApplicationOwner(
      applicationId,
      actorUserId,
      actorRole,
      'restaurant.application.update',
      requestId,
    );
    if (
      existing.onboardingStatus !== 'DRAFT' &&
      existing.onboardingStatus !== 'CHANGES_REQUESTED'
    ) {
      throw new AppError(
        409,
        'CONFLICT',
        `Application cannot be edited while in ${existing.onboardingStatus} state`,
      );
    }

    const input = updateApplicationSchema.parse(rawBody);
    const now = this.clock.now();
    const legal = input.legalEntity;
    const outlet = input.outletSetup;
    const bank = input.bankPayout;
    const zoneId = outlet?.zoneId ?? existing.outletSetup.zoneId;
    const center = ZONE_CENTERS[zoneId];
    let updatedMaskedPhone: string | undefined;
    if (legal?.ownerPhone) {
      const normalized = normalizeIndianPhone(legal.ownerPhone);
      if (!normalized) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Enter a valid 10-digit Indian owner mobile number',
        );
      }
      updatedMaskedPhone = maskPhone(normalized);
    }

    const updatedRecord: RestaurantApplicationRecord = {
      ...existing,
      legalEntity: {
        ...existing.legalEntity,
        ...(legal?.legalBusinessName ? { legalBusinessName: legal.legalBusinessName } : {}),
        ...(legal?.ownerFullName ? { ownerFullName: legal.ownerFullName } : {}),
        ...(updatedMaskedPhone ? { ownerPhoneMasked: updatedMaskedPhone } : {}),
        ...(legal?.ownerBusinessEmail
          ? { ownerBusinessEmail: legal.ownerBusinessEmail.toLowerCase() }
          : {}),
        ...(legal?.panNumber
          ? {
              panMasked: maskPan(legal.panNumber),
              panHash: hmacDigest(legal.panNumber.toUpperCase(), this.signingSecret),
            }
          : {}),
        ...(legal?.gstin !== undefined
          ? { gstin: legal.gstin ? legal.gstin.toUpperCase() : null }
          : {}),
        ...(legal?.fssaiLicenseNumber ? { fssaiLicenseNumber: legal.fssaiLicenseNumber } : {}),
        ...(legal?.fssaiExpiresOn ? { fssaiExpiresOn: legal.fssaiExpiresOn } : {}),
      },
      outletSetup: {
        ...existing.outletSetup,
        ...(outlet?.brandName ? { brandName: outlet.brandName } : {}),
        ...(outlet?.outletName ? { outletName: outlet.outletName } : {}),
        ...(outlet?.streetAddress ? { streetAddress: outlet.streetAddress } : {}),
        ...(outlet?.landmark ? { landmark: outlet.landmark } : {}),
        ...(outlet?.locality ? { locality: outlet.locality } : {}),
        ...(outlet?.wardOrBorough ? { wardOrBorough: outlet.wardOrBorough } : {}),
        ...(outlet?.city ? { city: outlet.city } : {}),
        ...(outlet?.postalCode ? { postalCode: outlet.postalCode } : {}),
        zoneId,
        location: outlet?.coordinates
          ? { type: 'Point', coordinates: [...outlet.coordinates] }
          : outlet?.zoneId && outlet.zoneId !== existing.outletSetup.zoneId
            ? { type: 'Point', coordinates: [center[0], center[1]] }
            : existing.outletSetup.location,
        ...(outlet?.cuisines ? { cuisines: outlet.cuisines } : {}),
        ...(outlet?.prepTimeMinutes ? { prepTimeMinutes: outlet.prepTimeMinutes } : {}),
        ...(outlet?.operatingSlots
          ? { operatingSlots: normalizeSlots(outlet.operatingSlots) }
          : {}),
      },
      bankPayout: {
        ...existing.bankPayout,
        ...(bank?.accountHolderName ? { accountHolderName: bank.accountHolderName } : {}),
        ...(bank?.bankAccountNumber
          ? {
              bankAccountMasked: maskBankAccount(bank.bankAccountNumber),
              bankAccountHash: hmacDigest(bank.bankAccountNumber, this.signingSecret),
            }
          : {}),
        ...(bank?.ifscCode ? { ifscCode: bank.ifscCode.toUpperCase() } : {}),
      },
      updatedAt: now,
    };

    const saved = await this.restaurantStore.updateApplication(
      existing.restaurantId,
      updatedRecord,
    );
    if (!saved) {
      throw new AppError(404, 'NOT_FOUND', 'Restaurant onboarding application not found');
    }
    const docs = await this.restaurantStore.listDocumentsByRestaurant(saved.restaurantId);
    return toApplicationDto(saved, docs);
  }

  async issueDocumentUploadIntent(
    applicationId: string,
    actorUserId: string,
    actorRole: UserRole,
    rawBody: unknown,
    requestId?: string,
  ) {
    const application = await this.assertApplicationOwner(
      applicationId,
      actorUserId,
      actorRole,
      'restaurant.document.upload_intent',
      requestId,
    );
    if (
      application.onboardingStatus !== 'DRAFT' &&
      application.onboardingStatus !== 'CHANGES_REQUESTED'
    ) {
      throw new AppError(
        409,
        'CONFLICT',
        `Cannot upload onboarding documents in ${application.onboardingStatus} status`,
      );
    }

    const input = uploadIntentSchema.parse(rawBody);
    const safeName = sanitizeFileName(input.fileName);
    const now = this.clock.now();
    const expEpoch = Math.floor(now.getTime() / 1000) + UPLOAD_TOKEN_TTL_SECONDS;
    const documentId = `doc_${crypto.randomUUID().slice(0, 12)}`;
    const storageKey = `private/restaurants/${application.restaurantId}/${input.documentType}/${documentId}-${safeName}`;
    const uploadToken = this.signDocumentPayload({
      documentId,
      applicationId: application.applicationId,
      ownerUserId: actorUserId,
      documentType: input.documentType,
      sha256Checksum: input.sha256Checksum,
      storageKey,
      exp: expEpoch,
    });

    return {
      uploadToken,
      storageKey,
      accessClassification: 'PRIVATE_COMPLIANCE' as const,
      expiresAt: new Date(expEpoch * 1000).toISOString(),
      maxSizeBytes: MAX_DOCUMENT_SIZE_BYTES,
      allowedMimeTypes: [...ALLOWED_DOCUMENT_MIME_TYPES],
    };
  }

  async confirmDocumentUpload(
    applicationId: string,
    actorUserId: string,
    actorRole: UserRole,
    rawBody: unknown,
    requestId?: string,
  ) {
    const application = await this.assertApplicationOwner(
      applicationId,
      actorUserId,
      actorRole,
      'restaurant.document.upload_confirm',
      requestId,
    );
    if (
      application.onboardingStatus !== 'DRAFT' &&
      application.onboardingStatus !== 'CHANGES_REQUESTED'
    ) {
      throw new AppError(
        409,
        'CONFLICT',
        `Cannot attach documents while application is ${application.onboardingStatus}`,
      );
    }

    const input = confirmDocumentSchema.parse(rawBody);
    const safeName = sanitizeFileName(input.fileName);
    const claims = this.verifySignedToken(input.uploadToken);
    const now = this.clock.now();

    if (
      claims['applicationId'] !== application.applicationId ||
      claims['ownerUserId'] !== actorUserId ||
      claims['documentType'] !== input.documentType ||
      claims['sha256Checksum'] !== input.sha256Checksum ||
      claims['storageKey'] !== input.storageKey
    ) {
      await this.rbacStore.appendAuditLog({
        actorId: actorUserId,
        actorRole,
        action: 'restaurant.document.upload_confirm',
        resourceType: 'restaurant_document',
        resourceId: application.applicationId,
        outcome: 'DENIED',
        reason: 'Upload token claims mismatch',
        requestId: requestId ?? null,
        now,
      });
      throw new AppError(403, 'FORBIDDEN', 'Document upload token does not match payload');
    }

    if (Number(claims['exp'] ?? 0) < Math.floor(now.getTime() / 1000)) {
      throw new AppError(403, 'FORBIDDEN', 'Signed document upload token has expired');
    }

    const documentId = String(claims['documentId']);
    const existingDoc = await this.restaurantStore.getDocumentById(documentId);
    if (existingDoc) {
      throw new AppError(409, 'CONFLICT', 'Signed document upload token has already been consumed');
    }

    const createdDoc = await this.restaurantStore.createDocument({
      documentId,
      applicationId: application.applicationId,
      restaurantId: application.restaurantId,
      ownerUserId: actorUserId,
      documentType: input.documentType,
      fileName: safeName,
      mimeType: input.mimeType as AllowedDocumentMimeType,
      sizeBytes: input.sizeBytes,
      sha256Checksum: input.sha256Checksum,
      storageKey: input.storageKey,
      accessClassification: 'PRIVATE_COMPLIANCE',
      isPublic: false,
      verificationStatus: 'PENDING_REVIEW',
      reviewNote: null,
      uploadedAt: now,
      reviewedAt: null,
    });

    if (input.documentType === 'FSSAI_CERTIFICATE') {
      await this.restaurantStore.updateApplication(application.restaurantId, {
        ...application,
        fssaiVerificationStatus: 'PENDING_REVIEW',
        legalEntity: {
          ...application.legalEntity,
          fssaiVerificationStatus: 'PENDING_REVIEW',
        },
        updatedAt: now,
      });
    }

    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole,
      action: 'restaurant.document.uploaded',
      resourceType: 'restaurant_document',
      resourceId: createdDoc.documentId,
      outcome: 'ALLOWED',
      reason: `Private compliance upload recorded (${createdDoc.documentType})`,
      requestId: requestId ?? null,
      now,
    });

    return toDocumentDto(createdDoc);
  }

  async submitApplication(
    applicationId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string,
  ) {
    const application = await this.assertApplicationOwner(
      applicationId,
      actorUserId,
      actorRole,
      'restaurant.application.submit',
      requestId,
    );
    if (
      application.onboardingStatus !== 'DRAFT' &&
      application.onboardingStatus !== 'CHANGES_REQUESTED'
    ) {
      throw new AppError(
        409,
        'CONFLICT',
        `Application is already in ${application.onboardingStatus} status`,
      );
    }

    const now = this.clock.now();
    if (isFssaiExpiredOnDate(application.legalEntity.fssaiExpiresOn, now)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'FSSAI certificate expiry date must be in the future',
        [
          {
            field: 'legalEntity.fssaiExpiresOn',
            issue: 'FSSAI registration is expired',
          },
        ],
      );
    }

    const docs = await this.restaurantStore.listDocumentsByRestaurant(application.restaurantId);
    const attachedTypes = new Set<RestaurantDocumentType>(docs.map((doc) => doc.documentType));
    const missingTypes = MANDATORY_ONBOARDING_DOCUMENT_TYPES.filter(
      (docType) => !attachedTypes.has(docType),
    );
    if (missingTypes.length > 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Missing mandatory compliance documents: ${missingTypes.join(', ')}`,
        missingTypes.map((docType) => ({
          field: `documents.${docType}`,
          issue: `Private compliance upload for ${docType} is required before submission`,
        })),
      );
    }

    const submittedRecord: RestaurantApplicationRecord = {
      ...application,
      onboardingStatus: 'SUBMITTED',
      fssaiVerificationStatus: 'PENDING_REVIEW',
      platformInspectionStatus: 'NOT_INSPECTED',
      publishedSafetyScore: null,
      legalEntity: {
        ...application.legalEntity,
        fssaiVerificationStatus: 'PENDING_REVIEW',
      },
      submittedAt: now,
      updatedAt: now,
    };

    const saved = await this.restaurantStore.updateApplication(
      application.restaurantId,
      submittedRecord,
    );
    if (!saved) {
      throw new AppError(404, 'NOT_FOUND', 'Restaurant onboarding application not found');
    }

    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole,
      action: 'restaurant.application.submitted',
      resourceType: 'restaurant_application',
      resourceId: saved.applicationId,
      outcome: 'ALLOWED',
      reason: 'Onboarding application submitted to Bhojora Control review queue',
      requestId: requestId ?? null,
      now,
    });

    return toApplicationDto(saved, docs);
  }

  async getPrivateDocumentAccess(
    documentId: string,
    actorUserId: string,
    activeRole: UserRole,
    mfaVerified: boolean,
    requestId?: string,
  ) {
    const doc = await this.restaurantStore.getDocumentById(documentId);
    if (!doc) {
      throw new AppError(404, 'NOT_FOUND', 'Compliance document not found');
    }

    const isPrivilegedReviewerRole =
      activeRole === 'OPS_ADMIN' || activeRole === 'TRUST_ADMIN' || activeRole === 'SUPER_ADMIN';
    const isOwnerUser = doc.ownerUserId === actorUserId;
    const memberships = await this.rbacStore.listMembershipsForUser(actorUserId);
    const hasRestaurantMembership = hasOutletMembership(
      memberships,
      doc.restaurantId,
      '*',
      'RESTAURANT_OWNER',
    );

    if (isPrivilegedReviewerRole) {
      assertMfaSatisfiedForRole(activeRole, mfaVerified);
    } else if (!isOwnerUser && !hasRestaurantMembership) {
      await this.rbacStore.appendAuditLog({
        actorId: actorUserId,
        actorRole: activeRole,
        action: 'restaurant.document.access',
        resourceType: 'restaurant_document',
        resourceId: doc.documentId,
        outcome: 'DENIED',
        reason: 'Private compliance document access denied to unauthorized actor',
        requestId: requestId ?? null,
      });
      throw new AppError(
        403,
        'FORBIDDEN',
        'Private compliance documents may only be accessed by the restaurant owner or MFA-verified reviewer',
      );
    }

    const now = this.clock.now();
    const exp = Math.floor(now.getTime() / 1000) + SIGNED_ACCESS_TTL_SECONDS;
    const sigToken = this.signDocumentPayload({
      documentId: doc.documentId,
      actorUserId,
      storageKey: doc.storageKey,
      exp,
    });

    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole: activeRole,
      action: 'restaurant.document.access',
      resourceType: 'restaurant_document',
      resourceId: doc.documentId,
      outcome: 'ALLOWED',
      reason: `Issued ${SIGNED_ACCESS_TTL_SECONDS}s private compliance document grant (${doc.documentType})`,
      requestId: requestId ?? null,
      now,
    });

    return {
      documentId: doc.documentId,
      storageKey: doc.storageKey,
      signedAccessUrl: `/api/v1/restaurant/documents/signed/${encodeURIComponent(doc.documentId)}?grant=${encodeURIComponent(sigToken)}`,
      accessClassification: doc.accessClassification,
      expiresAt: new Date(exp * 1000).toISOString(),
      cacheControl: 'no-store' as const,
    };
  }

  async listAdminReviewQueue(
    statusFilter: OnboardingApplicationStatus | undefined,
    actorUserId: string,
    activeRole: UserRole,
    mfaVerified: boolean,
    requestId?: string,
  ) {
    assertMfaSatisfiedForRole(activeRole, mfaVerified);
    const records = await this.restaurantStore.listReviewQueue(statusFilter);
    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole: activeRole,
      action: 'admin.restaurant_queue.listed',
      resourceType: 'restaurant_application',
      resourceId: statusFilter ?? 'ALL_SUBMITTED',
      outcome: 'ALLOWED',
      reason: `Viewed onboarding review queue (${records.length} record(s))`,
      requestId: requestId ?? null,
    });

    return Promise.all(
      records.map(async (item) => {
        const docs = await this.restaurantStore.listDocumentsByRestaurant(item.restaurantId);
        return toApplicationDto(item, docs);
      }),
    );
  }

  async getAdminApplicationDetail(
    applicationId: string,
    actorUserId: string,
    activeRole: UserRole,
    mfaVerified: boolean,
    requestId?: string,
  ) {
    assertMfaSatisfiedForRole(activeRole, mfaVerified);
    const application = await this.restaurantStore.getApplicationById(applicationId);
    if (!application) {
      throw new AppError(404, 'NOT_FOUND', 'Restaurant onboarding application not found');
    }
    const docs = await this.restaurantStore.listDocumentsByRestaurant(application.restaurantId);
    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole: activeRole,
      action: 'admin.restaurant_application.viewed',
      resourceType: 'restaurant_application',
      resourceId: application.applicationId,
      outcome: 'ALLOWED',
      reason: 'Privileged reviewer opened onboarding KYC detail',
      requestId: requestId ?? null,
    });
    return toApplicationDto(application, docs);
  }

  async reviewApplication(
    applicationId: string,
    reviewerUserId: string,
    reviewerRole: UserRole,
    mfaVerified: boolean,
    rawBody: unknown,
    requestId?: string,
  ) {
    assertMfaSatisfiedForRole(reviewerRole, mfaVerified);
    const input = reviewApplicationSchema.parse(rawBody);
    const application = await this.restaurantStore.getApplicationById(applicationId);
    if (!application) {
      throw new AppError(404, 'NOT_FOUND', 'Restaurant onboarding application not found');
    }

    const now = this.clock.now();
    if (application.ownerUserId === reviewerUserId) {
      await this.rbacStore.appendAuditLog({
        actorId: reviewerUserId,
        actorRole: reviewerRole,
        action: 'admin.restaurant_application.reviewed',
        resourceType: 'restaurant_application',
        resourceId: application.applicationId,
        outcome: 'DENIED',
        reason: 'Self-review of own restaurant onboarding application is forbidden',
        requestId: requestId ?? null,
        now,
      });
      throw new AppError(
        403,
        'FORBIDDEN',
        'Reviewer cannot review their own onboarding application',
        [
          {
            code: 'SELF_REVIEW_PROHIBITED',
            field: 'reviewerUserId',
            issue: 'Self-review of own restaurant onboarding application is forbidden',
          },
        ],
      );
    }

    if (
      application.onboardingStatus !== 'SUBMITTED' &&
      application.onboardingStatus !== 'UNDER_REVIEW'
    ) {
      throw new AppError(
        409,
        'CONFLICT',
        `Application in ${application.onboardingStatus} state is not awaiting review`,
      );
    }

    const existingDocs = await this.restaurantStore.listDocumentsByRestaurant(
      application.restaurantId,
    );
    const docStatusMap = new Map<string, DocumentVerificationStatus>(
      existingDocs.map((d) => [d.documentId, d.verificationStatus]),
    );

    if (input.documentReviews) {
      for (const docReview of input.documentReviews) {
        const target = existingDocs.find((d) => d.documentId === docReview.documentId);
        if (!target) {
          throw new AppError(
            400,
            'VALIDATION_ERROR',
            `Document ${docReview.documentId} does not belong to this application`,
          );
        }
        await this.restaurantStore.updateDocumentReview(
          docReview.documentId,
          docReview.verificationStatus,
          docReview.note ?? null,
          now,
        );
        docStatusMap.set(docReview.documentId, docReview.verificationStatus);
      }
    }

    const refreshedDocs = await this.restaurantStore.listDocumentsByRestaurant(
      application.restaurantId,
    );

    if (input.decision === 'APPROVE') {
      if (input.fssaiVerificationDecision !== 'VERIFIED') {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Cannot approve onboarding without statutory FSSAI verification marked VERIFIED',
        );
      }
      if (isFssaiExpiredOnDate(application.legalEntity.fssaiExpiresOn, now)) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Cannot approve application with expired FSSAI license',
        );
      }
      const unverifiedMandatory = MANDATORY_ONBOARDING_DOCUMENT_TYPES.filter((requiredType) => {
        const matching = refreshedDocs.filter((d) => d.documentType === requiredType);
        return !matching.some((d) => docStatusMap.get(d.documentId) === 'VERIFIED');
      });
      if (unverifiedMandatory.length > 0) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Mandatory compliance documents must be verified before approval: ${unverifiedMandatory.join(', ')}`,
        );
      }
    }

    const nextOnboardingStatus: OnboardingApplicationStatus =
      input.decision === 'APPROVE'
        ? 'APPROVED'
        : input.decision === 'REQUEST_CHANGES'
          ? 'CHANGES_REQUESTED'
          : 'REJECTED';

    const nextFssaiStatus: FssaiVerificationStatus = input.fssaiVerificationDecision;
    const reviewEntry = {
      reviewId: `rev_${crypto.randomUUID().slice(0, 12)}`,
      reviewerUserId,
      reviewerRole,
      decision: input.decision,
      fssaiDecision: nextFssaiStatus,
      reason: input.reason,
      reviewedAt: now,
    };

    const updatedRecord: RestaurantApplicationRecord = {
      ...application,
      onboardingStatus: nextOnboardingStatus,
      fssaiVerificationStatus: nextFssaiStatus,
      // FSSAI license approval NEVER sets platformInspectionStatus to VERIFIED_CLEAN.
      platformInspectionStatus: 'NOT_INSPECTED',
      publishedSafetyScore: null,
      legalEntity: {
        ...application.legalEntity,
        fssaiVerificationStatus: nextFssaiStatus,
        fssaiVerifiedNote: input.fssaiVerifiedNote ?? application.legalEntity.fssaiVerifiedNote,
        fssaiVerifiedAt: nextFssaiStatus === 'VERIFIED' ? now : null,
      },
      reviewHistory: [...application.reviewHistory, reviewEntry],
      decidedAt: now,
      updatedAt: now,
    };

    const saved = await this.restaurantStore.updateApplication(
      application.restaurantId,
      updatedRecord,
    );
    if (!saved) {
      throw new AppError(404, 'NOT_FOUND', 'Restaurant onboarding application not found');
    }

    if (input.decision === 'APPROVE') {
      await this.restaurantStore.upsertOutlet({
        outletId: saved.outletId,
        restaurantId: saved.restaurantId,
        ownerUserId: saved.ownerUserId,
        brandName: saved.outletSetup.brandName,
        name: saved.outletSetup.outletName,
        slug: saved.outletSetup.slug,
        zoneId: saved.outletSetup.zoneId,
        wardOrBorough: saved.outletSetup.wardOrBorough,
        streetAddress: saved.outletSetup.streetAddress,
        landmark: saved.outletSetup.landmark,
        locality: saved.outletSetup.locality,
        city: saved.outletSetup.city,
        postalCode: saved.outletSetup.postalCode,
        location: saved.outletSetup.location,
        cuisines: saved.outletSetup.cuisines,
        prepTimeMinutes: saved.outletSetup.prepTimeMinutes,
        deliveryRadiusMeters: 5000,
        operatingSlots: saved.outletSetup.operatingSlots,
        status: 'ACTIVE',
        fssaiLicenseNumber: saved.legalEntity.fssaiLicenseNumber,
        fssaiExpiresOn: saved.legalEntity.fssaiExpiresOn,
        fssaiVerificationStatus: 'VERIFIED',
        platformInspectionStatus: 'NOT_INSPECTED',
        publishedSafetyScore: null,
        createdAt: saved.createdAt,
        updatedAt: now,
      });

      const ownerUser = await this.identityStore.findUserById(saved.ownerUserId);
      if (ownerUser && !ownerUser.roles.includes('RESTAURANT_OWNER')) {
        await this.identityStore.updateUser(
          ownerUser.id,
          { roles: [...ownerUser.roles, 'RESTAURANT_OWNER'] },
          now,
        );
      }

      await this.rbacStore.upsertMembership({
        userId: saved.ownerUserId,
        restaurantId: saved.restaurantId,
        outletId: saved.outletId,
        role: 'RESTAURANT_OWNER',
        status: 'ACTIVE',
        grantedByUserId: reviewerUserId,
        now,
      });

      await this.rbacStore.upsertOutlet({
        outletId: saved.outletId,
        restaurantId: saved.restaurantId,
        name: `${saved.outletSetup.brandName} — ${saved.outletSetup.outletName}`,
        zone: saved.outletSetup.wardOrBorough,
        safetyScore: 0,
      });
    }

    await this.rbacStore.appendAuditLog({
      actorId: reviewerUserId,
      actorRole: reviewerRole,
      action: 'admin.restaurant_application.reviewed',
      resourceType: 'restaurant_application',
      resourceId: saved.applicationId,
      outcome: 'ALLOWED',
      reason: `Decision=${input.decision}; FSSAI=${nextFssaiStatus}; PlatformInspection=NOT_INSPECTED; Reason=${input.reason}`,
      requestId: requestId ?? null,
      now,
    });

    return toApplicationDto(saved, refreshedDocs);
  }

  async listPublicRestaurants(zoneId?: KolkataZoneId) {
    const outlets = await this.restaurantStore.listPublicOutlets(zoneId);
    return outlets.map(toPublicSummaryDto);
  }
}
