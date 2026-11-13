import crypto from 'node:crypto';
import type {
  InspectorApplicationDto,
  InspectorConflictUpdateDto,
  InspectorEligibilityCheckDto,
  InspectorEligibilityCheckResult,
  InspectorProfile,
  InspectorReviewDecisionDto,
  InspectorStatus,
} from '@bhojora/shared';
import { AppError } from '../../middleware/error-handler';
import type { IdentityStore } from '../identity/identity.types';
import type { RbacStore } from '../rbac/rbac.store';
import type { InspectorStore } from './inspector.store';
import {
  conflictDeclarationSchema,
  inspectorApplicationSchema,
  inspectorEligibilityCheckSchema,
  inspectorReviewDecisionSchema,
  toInspectorProfile,
  type InspectorCertificationRecord,
  type InspectorConflictRecord,
  type InspectorRecord,
} from './inspector.types';

export interface InspectorServiceOptions {
  inspectorStore: InspectorStore;
  identityStore: IdentityStore;
  rbacStore: RbacStore;
}

export class InspectorService {
  private readonly inspectorStore: InspectorStore;
  private readonly identityStore: IdentityStore;
  private readonly rbacStore: RbacStore;

  constructor(options: InspectorServiceOptions) {
    this.inspectorStore = options.inspectorStore;
    this.identityStore = options.identityStore;
    this.rbacStore = options.rbacStore;
  }

  async apply(userId: string, input: InspectorApplicationDto): Promise<InspectorProfile> {
    const user = await this.identityStore.findUserById(userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User identity not found');
    }

    const existing = await this.inspectorStore.getInspectorByUserId(userId);
    if (existing) {
      throw new AppError(
        409,
        'CONFLICT',
        `Inspector application already exists for this user (Status: ${existing.status})`,
      );
    }

    const parsed = inspectorApplicationSchema.parse(input);

    const now = new Date();
    const certifications: InspectorCertificationRecord[] = parsed.certifications.map((c) => ({
      certificateType: c.certificateType,
      certificateNumber: c.certificateNumber,
      issuingAuthority: c.issuingAuthority,
      issuedAt: new Date(c.issuedAt),
      expiresAt: new Date(c.expiresAt),
    }));

    const conflicts: InspectorConflictRecord[] = (parsed.conflicts ?? []).map((conf) => ({
      restaurantId: conf.restaurantId,
      outletId: conf.outletId,
      conflictType: conf.conflictType,
      description: conf.description,
      declaredAt: conf.declaredAt ? new Date(conf.declaredAt) : now,
    }));

    const badgeSuffix = Math.floor(100 + Math.random() * 900);
    const badgeNumber = `INS-WB-${badgeSuffix}`;

    const record: InspectorRecord = {
      id: `ins_${crypto.randomUUID()}`,
      userId,
      fullName: parsed.fullName,
      email: user.emailNormalized ?? `${user.phoneNormalized}@bhojora.internal`,
      phone: parsed.phone,
      badgeNumber,
      status: 'APPLIED',
      cityCode: parsed.cityCode ?? 'KOLKATA',
      certifications,
      trainings: [
        {
          moduleName: 'BHOJORA Kolkata Food Safety Standard v1.0',
          completedAt: now,
          scorePercent: 100,
          validUntil: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000),
        },
      ],
      conflicts,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.inspectorStore.createInspector(record);
    return toInspectorProfile(saved);
  }

  async getOwnProfile(userId: string): Promise<InspectorProfile> {
    const found = await this.inspectorStore.getInspectorByUserId(userId);
    if (!found) {
      throw new AppError(404, 'NOT_FOUND', 'No inspector profile found for user');
    }
    return toInspectorProfile(found);
  }

  async getInspectorById(id: string): Promise<InspectorProfile> {
    const found = await this.inspectorStore.getInspectorById(id);
    if (!found) {
      throw new AppError(404, 'NOT_FOUND', `Inspector ${id} not found`);
    }
    return toInspectorProfile(found);
  }

  async updateConflicts(
    userId: string,
    dto: InspectorConflictUpdateDto,
  ): Promise<InspectorProfile> {
    const inspector = await this.inspectorStore.getInspectorByUserId(userId);
    if (!inspector) {
      throw new AppError(404, 'NOT_FOUND', 'Inspector profile not found');
    }

    if (!Array.isArray(dto.conflicts)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'conflicts must be an array');
    }

    const validatedConflicts: InspectorConflictRecord[] = dto.conflicts.map((c) => {
      const parsed = conflictDeclarationSchema.parse(c);
      return {
        restaurantId: parsed.restaurantId,
        outletId: parsed.outletId,
        conflictType: parsed.conflictType,
        description: parsed.description,
        declaredAt: parsed.declaredAt ? new Date(parsed.declaredAt) : new Date(),
      };
    });

    const updated = await this.inspectorStore.updateInspector(inspector.id, {
      conflicts: validatedConflicts,
    });
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Inspector profile could not be updated');
    }
    return toInspectorProfile(updated);
  }

  async listInspectors(options?: {
    status?: InspectorStatus;
    cityCode?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ inspectors: InspectorProfile[]; totalCount: number }> {
    const { inspectors, totalCount } = await this.inspectorStore.listInspectors(options);
    return {
      inspectors: inspectors.map(toInspectorProfile),
      totalCount,
    };
  }

  async reviewInspector(
    adminUserId: string,
    inspectorId: string,
    input: InspectorReviewDecisionDto,
  ): Promise<InspectorProfile> {
    const parsed = inspectorReviewDecisionSchema.parse(input);
    const inspector = await this.inspectorStore.getInspectorById(inspectorId);
    if (!inspector) {
      throw new AppError(404, 'NOT_FOUND', `Inspector ${inspectorId} not found`);
    }

    // Strict Anti-Self-Review rule (ADR-005): Admin cannot approve or review their own application
    if (adminUserId === inspector.userId) {
      throw new AppError(
        403,
        'SELF_REVIEW_PROHIBITED',
        'Administrators cannot review or approve their own inspector application',
      );
    }

    const now = new Date();

    if (parsed.decision === 'APPROVE') {
      // Must have at least one valid non-expired certificate
      const hasValidCert = inspector.certifications.some((c) => c.expiresAt > now);
      if (!hasValidCert) {
        throw new AppError(
          422,
          'VALIDATION_ERROR',
          'Cannot approve inspector without at least one valid, unexpired certification',
        );
      }

      const updated = await this.inspectorStore.updateInspector(inspectorId, {
        status: 'APPROVED',
        approvedByAdminId: adminUserId,
        approvedAt: now,
      });

      // Grant INSPECTOR role to user
      const user = await this.identityStore.findUserById(inspector.userId);
      if (user && !user.roles.includes('INSPECTOR')) {
        await this.identityStore.updateUser(
          inspector.userId,
          { roles: [...user.roles, 'INSPECTOR'] },
          now,
        );
      }

      return toInspectorProfile(updated!);
    }

    if (parsed.decision === 'REJECT') {
      const updated = await this.inspectorStore.updateInspector(inspectorId, {
        status: 'REJECTED',
        rejectionReason: parsed.reason ?? 'Application does not meet platform criteria',
      });
      return toInspectorProfile(updated!);
    }

    if (parsed.decision === 'SUSPEND') {
      const updated = await this.inspectorStore.updateInspector(inspectorId, {
        status: 'SUSPENDED',
        suspendedReason: parsed.reason ?? 'Inspector suspended pending compliance audit',
      });
      return toInspectorProfile(updated!);
    }

    throw new AppError(400, 'VALIDATION_ERROR', 'Unsupported review decision');
  }

  async checkEligibility(
    inspectorId: string,
    input: InspectorEligibilityCheckDto,
  ): Promise<InspectorEligibilityCheckResult> {
    const parsed = inspectorEligibilityCheckSchema.parse(input);
    const inspector = await this.inspectorStore.getInspectorById(inspectorId);
    if (!inspector) {
      throw new AppError(404, 'NOT_FOUND', `Inspector ${inspectorId} not found`);
    }

    const reasons: string[] = [];
    const now = new Date();

    // 1. Status Check
    if (inspector.status !== 'APPROVED') {
      reasons.push(`INSPECTOR_NOT_APPROVED: Inspector status is ${inspector.status}`);
    }

    // 2. Training / Certification Check
    const activeCert = inspector.certifications.find((c) => c.expiresAt > now);
    if (!activeCert) {
      reasons.push(
        'CERTIFICATIONS_EXPIRED: All submitted qualifications/certifications have expired',
      );
    }

    // 3. Conflict of Interest Check
    const matchingConflict = inspector.conflicts.find((conf) => {
      if (parsed.restaurantId && conf.restaurantId === parsed.restaurantId) {
        return true;
      }
      if (conf.outletId && conf.outletId === parsed.outletId) {
        return true;
      }
      return false;
    });

    if (matchingConflict) {
      reasons.push(
        `CONFLICT_OF_INTEREST_DECLARED: Inspector declared a ${matchingConflict.conflictType} conflict with target outlet/restaurant (${matchingConflict.description})`,
      );
    }

    const eligible = reasons.length === 0;

    return {
      eligible,
      inspectorId,
      outletId: parsed.outletId,
      restaurantId: parsed.restaurantId,
      reasons,
    };
  }
}
