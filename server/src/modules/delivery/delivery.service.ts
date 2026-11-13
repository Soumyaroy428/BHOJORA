import crypto from 'node:crypto';
import { z } from 'zod';
import type { DeliveryPartnerDto, DeliveryPartnerStatus } from '@bhojora/shared';
import { AppError } from '../../middleware/error-handler';
import { KOLKATA_ZONE_IDS } from '../customer/customer.types';
import type { Clock, IdentityStore, UserRole } from '../identity/identity.types';
import { maskPhone, normalizeIndianPhone } from '../identity/identity.crypto';
import { assertValidGeoJsonPoint } from '../outlet/outlet.geo';
import { assertMfaSatisfiedForRole } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { DeliveryStore } from './delivery.store';
import {
  DELIVERY_DOCUMENT_TYPES_RUNTIME,
  DELIVERY_SHIFT_STATUSES_RUNTIME,
  hmacDigest,
  maskBankAccount,
  maskDocumentNumber,
  maskRegistrationNumber,
  toDeliveryPartnerDto,
  VEHICLE_TYPES_RUNTIME,
  type DeliveryDocumentRecord,
  type DeliveryPartnerRecord,
} from './delivery.types';

const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const createApplicationSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name must have at least 2 characters').max(120),
  preferredZones: z
    .array(z.enum(KOLKATA_ZONE_IDS))
    .min(1, 'Select at least one preferred delivery zone in Kolkata'),
  vehicleType: z.enum(VEHICLE_TYPES_RUNTIME),
  vehicleModel: z.string().trim().min(1, 'Vehicle model is required').max(100),
  vehicleRegistrationNumber: z.string().trim().max(30).optional(),
  emergencyContactName: z.string().trim().max(120).optional(),
  emergencyContactPhone: z.string().trim().max(30).optional(),
  emergencyContactRelationship: z.string().trim().max(60).optional(),
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  preferredZones: z.array(z.enum(KOLKATA_ZONE_IDS)).min(1).optional(),
  vehicleType: z.enum(VEHICLE_TYPES_RUNTIME).optional(),
  vehicleModel: z.string().trim().min(1).max(100).optional(),
  vehicleRegistrationNumber: z.string().trim().max(30).optional(),
  bankAccountHolderName: z.string().trim().min(2).max(120).optional(),
  bankAccountNumber: z.string().trim().min(8).max(30).optional(),
  bankIfscCode: z.string().trim().regex(ifscRegex, 'Invalid IFSC code format').optional(),
  bankName: z.string().trim().min(2).max(100).optional(),
  emergencyContactName: z.string().trim().min(2).max(120).optional(),
  emergencyContactPhone: z.string().trim().max(30).optional(),
  emergencyContactRelationship: z.string().trim().min(2).max(60).optional(),
});

const uploadDocumentSchema = z.object({
  type: z.enum(DELIVERY_DOCUMENT_TYPES_RUNTIME),
  documentNumber: z
    .string()
    .trim()
    .min(4, 'Document number must have at least 4 characters')
    .max(32),
  fileUrl: z.string().trim().url('File URL must be a valid URL').max(500),
  mimeType: z.string().trim().min(1).max(64),
});

const updateAvailabilitySchema = z.object({
  shiftStatus: z.enum(DELIVERY_SHIFT_STATUSES_RUNTIME),
  coordinates: z.tuple([z.number(), z.number()]).optional(),
});

const reviewApplicationSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  reason: z.string().trim().max(240).optional(),
});

export interface DeliveryServiceOptions {
  deliveryStore: DeliveryStore;
  identityStore: IdentityStore;
  rbacStore: RbacStore;
  signingSecret: string;
  clock?: Clock;
}

export class DeliveryService {
  private readonly deliveryStore: DeliveryStore;
  private readonly identityStore: IdentityStore;
  private readonly rbacStore: RbacStore;
  private readonly signingSecret: string;
  private readonly clock?: Clock;

  constructor(options: DeliveryServiceOptions) {
    this.deliveryStore = options.deliveryStore;
    this.identityStore = options.identityStore;
    this.rbacStore = options.rbacStore;
    this.signingSecret = options.signingSecret;
    this.clock = options.clock;
  }

  private now(): Date {
    return this.clock?.now() ?? new Date();
  }

  async createApplication(
    actorUserId: string,
    actorEmail: string,
    actorPhone: string,
    rawBody: unknown,
    requestId?: string,
  ): Promise<DeliveryPartnerDto> {
    const existing = await this.deliveryStore.getPartnerByUserId(actorUserId);
    if (existing) {
      throw new AppError(
        409,
        'CONFLICT',
        'A delivery partner application already exists for this account',
      );
    }

    const input = createApplicationSchema.parse(rawBody);
    const now = this.now();
    const partnerId = `del_${crypto.randomUUID().slice(0, 12)}`;

    const normalized = normalizeIndianPhone(actorPhone);
    const normalizedPhone = normalized ?? actorPhone.trim();
    const maskedPhone = maskPhone(normalizedPhone);

    if (input.vehicleType !== 'BICYCLE' && !input.vehicleRegistrationNumber) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Vehicle registration number is required for motorized vehicles',
      );
    }

    const record: DeliveryPartnerRecord = {
      partnerId,
      userId: actorUserId,
      fullName: input.fullName,
      phoneMasked: maskedPhone,
      email: actorEmail.toLowerCase().trim(),
      city: 'Kolkata',
      preferredZones: [...input.preferredZones],
      vehicle: {
        vehicleType: input.vehicleType,
        model: input.vehicleModel,
        registrationNumberMasked: input.vehicleRegistrationNumber
          ? maskRegistrationNumber(input.vehicleRegistrationNumber)
          : null,
        registrationNumberHash: input.vehicleRegistrationNumber
          ? hmacDigest(
              input.vehicleRegistrationNumber.toUpperCase().replace(/\s+/g, ''),
              this.signingSecret,
            )
          : null,
      },
      status: 'DRAFT',
      shiftStatus: 'OFFLINE',
      documents: [],
      bankPayout: null,
      emergencyContact:
        input.emergencyContactName && input.emergencyContactPhone
          ? {
              name: input.emergencyContactName,
              phoneMasked: maskPhone(input.emergencyContactPhone),
              relationship: input.emergencyContactRelationship || 'Other',
            }
          : null,
      rejectionReason: null,
      rating: 5.0,
      totalDeliveries: 0,
      submittedAt: null,
      reviewedAt: null,
      reviewedByUserId: null,
      approvedAt: null,
      lastCoordinates: null,
      lastLocationAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.deliveryStore.createPartner(record);

    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole: 'CUSTOMER',
      action: 'delivery_partner.application.created',
      resourceType: 'delivery_partner',
      resourceId: partnerId,
      outcome: 'ALLOWED',
      reason: 'Delivery partner onboarding application created in DRAFT state',
      requestId: requestId ?? null,
      now,
    });

    return toDeliveryPartnerDto(saved);
  }

  async getOwnProfile(actorUserId: string): Promise<DeliveryPartnerDto> {
    const partner = await this.deliveryStore.getPartnerByUserId(actorUserId);
    if (!partner) {
      throw new AppError(404, 'NOT_FOUND', 'Delivery partner profile not found');
    }
    return toDeliveryPartnerDto(partner);
  }

  async updateOwnProfile(
    actorUserId: string,
    rawBody: unknown,
    _requestId?: string,
  ): Promise<DeliveryPartnerDto> {
    const partner = await this.deliveryStore.getPartnerByUserId(actorUserId);
    if (!partner) {
      throw new AppError(404, 'NOT_FOUND', 'Delivery partner profile not found');
    }

    if (partner.status === 'UNDER_REVIEW' || partner.status === 'SUBMITTED') {
      throw new AppError(
        409,
        'CONFLICT',
        'Cannot modify profile while application is under review',
      );
    }

    const input = updateProfileSchema.parse(rawBody);
    const now = this.now();
    const patch: Partial<DeliveryPartnerRecord> = { updatedAt: now };

    if (input.fullName) patch.fullName = input.fullName;
    if (input.preferredZones) patch.preferredZones = [...input.preferredZones];

    if (input.vehicleType || input.vehicleModel || input.vehicleRegistrationNumber !== undefined) {
      const vType = input.vehicleType ?? partner.vehicle.vehicleType;
      const vModel = input.vehicleModel ?? partner.vehicle.model;
      const regRaw =
        input.vehicleRegistrationNumber !== undefined
          ? input.vehicleRegistrationNumber
          : partner.vehicle.registrationNumberMasked;

      patch.vehicle = {
        vehicleType: vType,
        model: vModel,
        registrationNumberMasked: regRaw ? maskRegistrationNumber(regRaw) : null,
        registrationNumberHash: regRaw
          ? hmacDigest(regRaw.toUpperCase().replace(/\s+/g, ''), this.signingSecret)
          : null,
      };
    }

    if (
      input.bankAccountHolderName &&
      input.bankAccountNumber &&
      input.bankIfscCode &&
      input.bankName
    ) {
      patch.bankPayout = {
        accountHolderName: input.bankAccountHolderName,
        accountNumberMasked: maskBankAccount(input.bankAccountNumber),
        accountNumberHash: hmacDigest(
          input.bankAccountNumber.replace(/\s+/g, ''),
          this.signingSecret,
        ),
        ifscCode: input.bankIfscCode.toUpperCase().trim(),
        bankName: input.bankName,
      };
    }

    if (input.emergencyContactName && input.emergencyContactPhone) {
      patch.emergencyContact = {
        name: input.emergencyContactName,
        phoneMasked: maskPhone(input.emergencyContactPhone),
        relationship: input.emergencyContactRelationship || 'Other',
      };
    }

    const updated = await this.deliveryStore.updatePartner(partner.partnerId, patch);
    if (!updated) {
      throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Failed to update delivery partner profile');
    }

    return toDeliveryPartnerDto(updated);
  }

  async uploadDocument(
    actorUserId: string,
    rawBody: unknown,
    _requestId?: string,
  ): Promise<DeliveryPartnerDto> {
    const partner = await this.deliveryStore.getPartnerByUserId(actorUserId);
    if (!partner) {
      throw new AppError(404, 'NOT_FOUND', 'Delivery partner profile not found');
    }

    if (partner.status === 'UNDER_REVIEW' || partner.status === 'SUBMITTED') {
      throw new AppError(
        409,
        'CONFLICT',
        'Cannot upload documents while application is under review',
      );
    }

    const input = uploadDocumentSchema.parse(rawBody);
    const now = this.now();
    const documentId = `doc_${crypto.randomUUID().slice(0, 12)}`;

    const newDoc: DeliveryDocumentRecord = {
      documentId,
      type: input.type,
      documentNumberMasked: maskDocumentNumber(input.documentNumber),
      documentNumberHash: hmacDigest(
        input.documentNumber.toUpperCase().replace(/\s+/g, ''),
        this.signingSecret,
      ),
      fileUrl: input.fileUrl,
      mimeType: input.mimeType,
      isPublic: false,
      verificationStatus: 'PENDING_REVIEW',
      rejectionReason: null,
      uploadedAt: now,
      verifiedAt: null,
    };

    const docs = partner.documents.filter((d) => d.type !== input.type);
    docs.push(newDoc);

    const updated = await this.deliveryStore.updatePartner(partner.partnerId, {
      documents: docs,
      updatedAt: now,
    });
    if (!updated) {
      throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Failed to save document');
    }

    return toDeliveryPartnerDto(updated);
  }

  async submitApplication(actorUserId: string, requestId?: string): Promise<DeliveryPartnerDto> {
    const partner = await this.deliveryStore.getPartnerByUserId(actorUserId);
    if (!partner) {
      throw new AppError(404, 'NOT_FOUND', 'Delivery partner profile not found');
    }

    if (partner.status === 'APPROVED') {
      throw new AppError(409, 'CONFLICT', 'Application is already approved');
    }
    if (partner.status === 'UNDER_REVIEW' || partner.status === 'SUBMITTED') {
      throw new AppError(409, 'CONFLICT', 'Application is already under review');
    }

    if (partner.vehicle.vehicleType !== 'BICYCLE') {
      const hasDL = partner.documents.some((d) => d.type === 'DRIVING_LICENSE');
      const hasRC = partner.documents.some((d) => d.type === 'VEHICLE_RC');
      if (!hasDL || !hasRC) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Driving License and Vehicle RC are required for motorized delivery vehicles',
        );
      }
    } else {
      const hasGovtId = partner.documents.some(
        (d) => d.type === 'GOVERNMENT_ID' || d.type === 'PAN_CARD',
      );
      if (!hasGovtId) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Government ID or PAN Card is required for bicycle onboarding',
        );
      }
    }

    if (!partner.bankPayout) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Bank payout details are required before submission',
      );
    }
    if (!partner.emergencyContact) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Emergency contact details are required before submission',
      );
    }

    const now = this.now();
    const updated = await this.deliveryStore.updatePartner(partner.partnerId, {
      status: 'UNDER_REVIEW',
      submittedAt: now,
      rejectionReason: null,
      updatedAt: now,
    });
    if (!updated) {
      throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Failed to submit application');
    }

    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole: 'CUSTOMER',
      action: 'delivery_partner.application.submitted',
      resourceType: 'delivery_partner',
      resourceId: partner.partnerId,
      outcome: 'ALLOWED',
      reason: 'Delivery partner submitted application for compliance review',
      requestId: requestId ?? null,
      now,
    });

    return toDeliveryPartnerDto(updated);
  }

  async updateAvailability(
    actorUserId: string,
    rawBody: unknown,
    _requestId?: string,
  ): Promise<DeliveryPartnerDto> {
    const partner = await this.deliveryStore.getPartnerByUserId(actorUserId);
    if (!partner) {
      throw new AppError(404, 'NOT_FOUND', 'Delivery partner profile not found');
    }

    if (partner.status !== 'APPROVED') {
      throw new AppError(
        409,
        'CONFLICT',
        'Delivery partner is not approved to accept shifts or change availability',
      );
    }

    const input = updateAvailabilitySchema.parse(rawBody);
    const now = this.now();
    const patch: Partial<DeliveryPartnerRecord> = {
      shiftStatus: input.shiftStatus,
      updatedAt: now,
    };

    if (input.coordinates) {
      const validPoint = assertValidGeoJsonPoint(input.coordinates, {
        requireKolkataBounds: true,
        label: 'Shift coordinates',
      });
      patch.lastCoordinates = validPoint;
      patch.lastLocationAt = now;
    }

    const updated = await this.deliveryStore.updatePartner(partner.partnerId, patch);
    if (!updated) {
      throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Failed to update availability status');
    }

    return toDeliveryPartnerDto(updated);
  }

  async listAdminApplications(
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
    options?: { status?: DeliveryPartnerStatus; limit?: number; skip?: number },
    requestId?: string,
  ): Promise<{ applications: DeliveryPartnerDto[]; totalCount: number }> {
    const isPrivileged =
      actorRole === 'OPS_ADMIN' || actorRole === 'TRUST_ADMIN' || actorRole === 'SUPER_ADMIN';
    if (!isPrivileged) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Privileged reviewer role required to access delivery review queue',
      );
    }
    assertMfaSatisfiedForRole(actorRole, mfaVerified);

    const result = await this.deliveryStore.listApplications(options);

    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole,
      action: 'admin.delivery_partner.queue_viewed',
      resourceType: 'delivery_partner',
      resourceId: 'queue',
      outcome: 'ALLOWED',
      reason: `Viewed delivery application queue (${result.totalCount} record(s))`,
      requestId: requestId ?? null,
      now: this.now(),
    });

    return {
      applications: result.applications.map(toDeliveryPartnerDto),
      totalCount: result.totalCount,
    };
  }

  async getAdminApplication(
    actorUserId: string,
    actorRole: UserRole,
    partnerId: string,
    mfaVerified: boolean,
    _requestId?: string,
  ): Promise<DeliveryPartnerDto> {
    const isPrivileged =
      actorRole === 'OPS_ADMIN' || actorRole === 'TRUST_ADMIN' || actorRole === 'SUPER_ADMIN';
    if (!isPrivileged) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Privileged reviewer role required to view delivery application',
      );
    }
    assertMfaSatisfiedForRole(actorRole, mfaVerified);

    const partner = await this.deliveryStore.getPartnerById(partnerId);
    if (!partner) {
      throw new AppError(404, 'NOT_FOUND', 'Delivery partner application not found');
    }

    return toDeliveryPartnerDto(partner);
  }

  async reviewApplication(
    reviewerUserId: string,
    reviewerRole: UserRole,
    partnerId: string,
    rawBody: unknown,
    mfaVerified: boolean,
    requestId?: string,
  ): Promise<DeliveryPartnerDto> {
    const isPrivileged =
      reviewerRole === 'OPS_ADMIN' ||
      reviewerRole === 'TRUST_ADMIN' ||
      reviewerRole === 'SUPER_ADMIN';
    if (!isPrivileged) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Privileged reviewer role required to review delivery applications',
      );
    }
    assertMfaSatisfiedForRole(reviewerRole, mfaVerified);

    const input = reviewApplicationSchema.parse(rawBody);
    const now = this.now();

    const partner = await this.deliveryStore.getPartnerById(partnerId);
    if (!partner) {
      throw new AppError(404, 'NOT_FOUND', 'Delivery partner application not found');
    }

    if (partner.userId === reviewerUserId) {
      await this.rbacStore.appendAuditLog({
        actorId: reviewerUserId,
        actorRole: reviewerRole,
        action: 'admin.delivery_partner.reviewed',
        resourceType: 'delivery_partner',
        resourceId: partnerId,
        outcome: 'DENIED',
        reason: 'Self-review of own delivery onboarding application is forbidden',
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
            issue: 'Self-review of own delivery onboarding application is forbidden',
          },
        ],
      );
    }

    if (input.action === 'REJECT') {
      if (!input.reason || input.reason.trim().length < 8) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Rejection requires an explicit reason (minimum 8 characters)',
        );
      }

      const updatedDocs = partner.documents.map((d) => ({
        ...d,
        verificationStatus: 'REJECTED' as const,
        rejectionReason: input.reason ?? null,
      }));

      const updated = await this.deliveryStore.updatePartner(partnerId, {
        status: 'REJECTED',
        rejectionReason: input.reason.trim(),
        reviewedAt: now,
        reviewedByUserId: reviewerUserId,
        documents: updatedDocs,
        updatedAt: now,
      });
      if (!updated) {
        throw new AppError(
          500,
          'INTERNAL_SERVER_ERROR',
          'Failed to update application review state',
        );
      }

      await this.rbacStore.appendAuditLog({
        actorId: reviewerUserId,
        actorRole: reviewerRole,
        action: 'admin.delivery_partner.reviewed',
        resourceType: 'delivery_partner',
        resourceId: partnerId,
        outcome: 'ALLOWED',
        reason: `Application rejected by ops: ${input.reason.trim()}`,
        requestId: requestId ?? null,
        now,
      });

      return toDeliveryPartnerDto(updated);
    }

    const verifiedDocs = partner.documents.map((d) => ({
      ...d,
      verificationStatus: 'VERIFIED' as const,
      verifiedAt: now,
      rejectionReason: null,
    }));

    const updated = await this.deliveryStore.updatePartner(partnerId, {
      status: 'APPROVED',
      approvedAt: now,
      reviewedAt: now,
      reviewedByUserId: reviewerUserId,
      rejectionReason: null,
      documents: verifiedDocs,
      updatedAt: now,
    });
    if (!updated) {
      throw new AppError(
        500,
        'INTERNAL_SERVER_ERROR',
        'Failed to update application approval state',
      );
    }

    const user = await this.identityStore.findUserById(partner.userId);
    if (user && !user.roles.includes('DELIVERY_PARTNER')) {
      const newRoles = [...user.roles, 'DELIVERY_PARTNER' as UserRole];
      await this.identityStore.updateUser(partner.userId, { roles: newRoles }, now);
    }

    await this.rbacStore.appendAuditLog({
      actorId: reviewerUserId,
      actorRole: reviewerRole,
      action: 'admin.delivery_partner.reviewed',
      resourceType: 'delivery_partner',
      resourceId: partnerId,
      outcome: 'ALLOWED',
      reason: `Application approved by ops reviewer ${reviewerUserId}`,
      requestId: requestId ?? null,
      now,
    });

    return toDeliveryPartnerDto(updated);
  }
}
