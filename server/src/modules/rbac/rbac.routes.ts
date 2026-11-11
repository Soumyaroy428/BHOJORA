import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../../config/env-types';
import { getRequestIdFromResponse, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import {
  createRequirePermissionMiddleware,
  getRbacContext,
  resolveRbacRequestContext,
} from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import { USER_ROLES, type IdentityStore, type UserRole } from '../identity/identity.types';
import {
  assertCustomerSelfOrSupport,
  assertDeliveryJobAccess,
  assertInspectionApprovalAllowed,
  assertMfaSatisfiedForRole,
  canAccessOutletScope,
  getPermissionsForRole,
  hasOutletMembership,
  PRIVILEGED_MFA_ROLES,
  ROLE_PERMISSION_MATRIX,
  TENANT_MEMBERSHIP_ROLES,
  TENANT_MEMBERSHIP_STATUSES,
  type Permission,
} from './rbac.policy';
import type { RbacStore } from './rbac.store';

const assignMembershipSchema = z.object({
  userId: z.string().trim().min(1),
  restaurantId: z.string().trim().min(1),
  outletId: z.string().trim().min(1),
  role: z.enum(TENANT_MEMBERSHIP_ROLES),
  status: z.enum(TENANT_MEMBERSHIP_STATUSES).default('ACTIVE'),
  reason: z.string().trim().max(240).optional(),
});

const assignUserRolesSchema = z.object({
  roles: z.array(z.enum(USER_ROLES)).min(1),
  reason: z
    .string()
    .trim()
    .min(8, 'Privileged role assignment requires an explicit audit reason')
    .max(240),
});

const safetyScoreUpdateSchema = z.object({
  safetyScore: z.number().int().min(0).max(100),
  reason: z.string().trim().min(5).max(240),
});

const paymentOverrideSchema = z.object({
  settlementNote: z.string().trim().min(5).max(240),
});

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

export function createRbacRouter(params: {
  identityService: IdentityService;
  identityStore: IdentityStore;
  rbacStore: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}): Router {
  const { identityService, identityStore, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  router.get(
    '/rbac/me',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const memberships = await rbacStore.listMembershipsForUser(ctx.userId);
      sendSuccess(res, 200, {
        userId: ctx.userId,
        roles: ctx.roles,
        activeRole: ctx.activeRole,
        mfaVerified: ctx.mfaVerified,
        mfaRequiredForActiveRole: ctx.mfaRequiredForActiveRole,
        permissions: [...getPermissionsForRole(ctx.activeRole)],
        memberships: memberships.map((m) => ({
          membershipId: m.membershipId,
          userId: m.userId,
          restaurantId: m.restaurantId,
          outletId: m.outletId,
          role: m.role,
          status: m.status,
          createdAt: m.createdAt.toISOString(),
        })),
      });
    }),
  );

  router.get(
    '/rbac/permissions',
    requireAuth,
    wrapAsync(async (_req, res) => {
      sendSuccess(res, 200, {
        privilegedMfaRoles: [...PRIVILEGED_MFA_ROLES],
        rolePermissions: ROLE_PERMISSION_MATRIX,
      });
    }),
  );

  router.post(
    '/rbac/memberships',
    requireAuth,
    requirePerm('rbac:membership:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const input = assignMembershipSchema.parse(req.body);
      const now = new Date();
      const requestId = getRequestIdFromResponse(res);

      if (ctx.activeRole === 'SUPER_ADMIN') {
        if (!input.reason || input.reason.trim().length < 8) {
          throw new AppError(
            400,
            'VALIDATION_ERROR',
            'SUPER_ADMIN actions require an explicit reason (>= 8 chars) for audit logging',
          );
        }
      } else if (ctx.activeRole === 'RESTAURANT_OWNER') {
        const actorMemberships = await rbacStore.listMembershipsForUser(ctx.userId);
        if (
          !hasOutletMembership(
            actorMemberships,
            input.restaurantId,
            input.outletId,
            'RESTAURANT_OWNER',
          )
        ) {
          await rbacStore.appendAuditLog({
            actorId: ctx.userId,
            actorRole: ctx.activeRole,
            action: 'membership.assign',
            resourceType: 'restaurant_outlet',
            resourceId: input.outletId,
            outcome: 'DENIED',
            reason: 'Cross-restaurant membership delegation forbidden',
            requestId,
          });
          throw new AppError(
            403,
            'FORBIDDEN',
            'Owners may only assign memberships within their own restaurant/outlets',
          );
        }
      }

      const targetUser = await identityStore.findUserById(input.userId);
      if (!targetUser) {
        throw new AppError(404, 'NOT_FOUND', 'Target user does not exist');
      }

      const membership = await rbacStore.upsertMembership({
        userId: input.userId,
        restaurantId: input.restaurantId,
        outletId: input.outletId,
        role: input.role,
        status: input.status,
        grantedByUserId: ctx.userId,
        now,
      });

      if (!targetUser.roles.includes(input.role)) {
        await identityStore.updateUser(
          targetUser.id,
          { roles: [...targetUser.roles, input.role] },
          now,
        );
      }

      await rbacStore.appendAuditLog({
        actorId: ctx.userId,
        actorRole: ctx.activeRole,
        action: 'membership.assign',
        resourceType: 'restaurant_outlet',
        resourceId: `${input.restaurantId}:${input.outletId}`,
        outcome: 'ALLOWED',
        reason: input.reason ?? `Assigned ${input.role}`,
        requestId,
        now,
      });

      sendSuccess(res, 200, {
        membershipId: membership.membershipId,
        userId: membership.userId,
        restaurantId: membership.restaurantId,
        outletId: membership.outletId,
        role: membership.role,
        status: membership.status,
        createdAt: membership.createdAt.toISOString(),
      });
    }),
  );

  router.post(
    '/rbac/users/:userId/roles',
    requireAuth,
    requirePerm('rbac:role:assign'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const targetUserId = paramString(req.params['userId']);
      const input = assignUserRolesSchema.parse(req.body);
      const now = new Date();
      const requestId = getRequestIdFromResponse(res);

      assertMfaSatisfiedForRole(ctx.activeRole, ctx.mfaVerified);
      if (targetUserId === ctx.userId) {
        await rbacStore.appendAuditLog({
          actorId: ctx.userId,
          actorRole: ctx.activeRole,
          action: 'rbac.role.assign',
          resourceType: 'user',
          resourceId: targetUserId,
          outcome: 'DENIED',
          reason: 'Self role mutation forbidden',
          requestId,
          now,
        });
        throw new AppError(403, 'FORBIDDEN', 'Self privilege escalation is forbidden');
      }

      const updated = await identityStore.updateUser(
        targetUserId,
        { roles: [...new Set(input.roles)] as UserRole[] },
        now,
      );
      if (!updated) {
        throw new AppError(404, 'NOT_FOUND', 'Target user not found');
      }

      await rbacStore.appendAuditLog({
        actorId: ctx.userId,
        actorRole: ctx.activeRole,
        action: 'rbac.role.assign',
        resourceType: 'user',
        resourceId: targetUserId,
        outcome: 'ALLOWED',
        reason: input.reason,
        requestId,
        now,
      });

      sendSuccess(res, 200, {
        userId: updated.id,
        roles: updated.roles,
      });
    }),
  );

  router.get(
    '/rbac/customers/:customerId/profile',
    requireAuth,
    requirePerm('profile:own:read'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const targetCustomerId = paramString(req.params['customerId']);
      const requestId = getRequestIdFromResponse(res);

      try {
        assertCustomerSelfOrSupport({
          activeRole: ctx.activeRole,
          actorUserId: ctx.userId,
          targetCustomerId,
        });
      } catch (error) {
        await rbacStore.appendAuditLog({
          actorId: ctx.userId,
          actorRole: ctx.activeRole,
          action: 'customer.profile.read',
          resourceType: 'user',
          resourceId: targetCustomerId,
          outcome: 'DENIED',
          reason: 'IDOR prevented',
          requestId,
        });
        throw error;
      }

      const profile = await identityService.getProfile(targetCustomerId);
      sendSuccess(res, 200, profile);
    }),
  );

  router.get(
    '/rbac/outlets/:outletId/workspace',
    requireAuth,
    requirePerm('restaurant:outlet:read'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const outletId = paramString(req.params['outletId']);
      const requestId = getRequestIdFromResponse(res);
      const outlet = await rbacStore.getOutlet(outletId);
      if (!outlet) {
        throw new AppError(404, 'NOT_FOUND', 'Outlet not found');
      }

      const memberships = await rbacStore.listMembershipsForUser(ctx.userId);
      if (
        !canAccessOutletScope({
          activeRole: ctx.activeRole,
          memberships,
          restaurantId: outlet.restaurantId,
          outletId: outlet.outletId,
        })
      ) {
        await rbacStore.appendAuditLog({
          actorId: ctx.userId,
          actorRole: ctx.activeRole,
          action: 'outlet.workspace.read',
          resourceType: 'restaurant_outlet',
          resourceId: outlet.outletId,
          outcome: 'DENIED',
          reason: 'Cross-outlet tenant access rejected',
          requestId,
        });
        throw new AppError(403, 'FORBIDDEN', 'Cross-outlet tenant access is forbidden');
      }

      sendSuccess(res, 200, {
        outlet,
        activeRole: ctx.activeRole,
        scopedPermissions: [...getPermissionsForRole(ctx.activeRole)],
      });
    }),
  );

  router.patch(
    '/rbac/outlets/:outletId/safety-score',
    requireAuth,
    requirePerm('safety:score:publish'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const outletId = paramString(req.params['outletId']);
      const input = safetyScoreUpdateSchema.parse(req.body);

      const updated = await rbacStore.updateOutletSafetyScore(outletId, input.safetyScore);
      if (!updated) {
        throw new AppError(404, 'NOT_FOUND', 'Outlet not found');
      }

      await rbacStore.appendAuditLog({
        actorId: ctx.userId,
        actorRole: ctx.activeRole,
        action: 'safety.score.update',
        resourceType: 'restaurant_outlet',
        resourceId: outletId,
        outcome: 'ALLOWED',
        reason: input.reason,
        requestId: getRequestIdFromResponse(res),
      });

      sendSuccess(res, 200, updated);
    }),
  );

  router.post(
    '/rbac/payments/:paymentEventId/override',
    requireAuth,
    requirePerm('finance:settlement:read'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const paymentEventId = paramString(req.params['paymentEventId']);
      const input = paymentOverrideSchema.parse(req.body);

      await rbacStore.appendAuditLog({
        actorId: ctx.userId,
        actorRole: ctx.activeRole,
        action: 'finance.settlement.note',
        resourceType: 'payment_event',
        resourceId: paymentEventId,
        outcome: 'ALLOWED',
        reason: input.settlementNote,
        requestId: getRequestIdFromResponse(res),
      });

      sendSuccess(res, 200, {
        paymentEventId,
        notedByRole: ctx.activeRole,
        settlementNote: input.settlementNote,
      });
    }),
  );

  router.get(
    '/rbac/delivery/jobs/:jobId',
    requireAuth,
    requirePerm('delivery:job:read'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const jobId = paramString(req.params['jobId']);
      const job = await rbacStore.getDeliveryJob(jobId);
      if (!job) {
        throw new AppError(404, 'NOT_FOUND', 'Delivery job not found');
      }

      assertDeliveryJobAccess({
        activeRole: ctx.activeRole,
        actorUserId: ctx.userId,
        assignedPartnerId: job.partnerId,
      });

      sendSuccess(res, 200, job);
    }),
  );

  router.post(
    '/rbac/inspections/:inspectionId/approve',
    requireAuth,
    requirePerm('inspection:approve'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const inspectionId = paramString(req.params['inspectionId']);
      const requestId = getRequestIdFromResponse(res);
      const inspection = await rbacStore.getInspection(inspectionId);
      if (!inspection) {
        throw new AppError(404, 'NOT_FOUND', 'Inspection report not found');
      }

      try {
        assertInspectionApprovalAllowed({
          activeRole: ctx.activeRole,
          actorUserId: ctx.userId,
          authoredByUserId: inspection.authoredByUserId,
        });
      } catch (error) {
        await rbacStore.appendAuditLog({
          actorId: ctx.userId,
          actorRole: ctx.activeRole,
          action: 'inspection.approve',
          resourceType: 'inspection',
          resourceId: inspectionId,
          outcome: 'DENIED',
          reason: 'Reviewer self-approval prevented',
          requestId,
        });
        throw error;
      }

      const now = new Date();
      const approved = await rbacStore.approveInspection(inspectionId, ctx.userId, now);
      await rbacStore.appendAuditLog({
        actorId: ctx.userId,
        actorRole: ctx.activeRole,
        action: 'inspection.approve',
        resourceType: 'inspection',
        resourceId: inspectionId,
        outcome: 'ALLOWED',
        reason: 'Independent inspection review approved',
        requestId,
        now,
      });

      sendSuccess(res, 200, approved);
    }),
  );

  router.get(
    '/rbac/admin/audit-logs',
    requireAuth,
    requirePerm('audit:log:read'),
    wrapAsync(async (_req, res) => {
      const logs = await rbacStore.listAuditLogs(50);
      sendSuccess(res, 200, {
        logs: logs.map((entry) => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
        })),
      });
    }),
  );

  return router;
}
