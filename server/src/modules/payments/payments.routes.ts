import { Router, type NextFunction, type Request, type Response } from 'express';
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
import {
  assertMfaSatisfiedForRole,
  hasPermissionForRole,
  type Permission,
} from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { PaymentService } from './payments.service';

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

export function createPaymentsRouter(params: {
  identityService: IdentityService;
  paymentService: PaymentService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}): Router {
  const { identityService, paymentService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);
  const requirePaymentReadOrFinance = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ctx = resolveRbacRequestContext(req, res);
      const allowed =
        hasPermissionForRole(ctx.activeRole, 'order:own:read') ||
        hasPermissionForRole(ctx.activeRole, 'finance:settlement:read');
      if (!allowed) {
        if (rbacStore) {
          await rbacStore.appendAuditLog({
            actorId: ctx.userId,
            actorRole: ctx.activeRole,
            action: 'permission.check.payments.read',
            resourceType: 'route',
            resourceId: req.originalUrl,
            outcome: 'DENIED',
            reason: `Role ${ctx.activeRole} lacks order:own:read or finance:settlement:read`,
            requestId: getRequestIdFromResponse(res),
          });
        }
        throw new AppError(
          403,
          'FORBIDDEN',
          `Role ${ctx.activeRole} cannot access payment records`,
        );
      }
      assertMfaSatisfiedForRole(ctx.activeRole, ctx.mfaVerified);
      next();
    } catch (error) {
      next(error);
    }
  };

  router.post(
    '/payments/create',
    requireAuth,
    requirePerm('order:own:create'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const { httpStatus, result } = await paymentService.createPaymentAttempt(
        ctx.userId,
        req.headers['idempotency-key'],
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, httpStatus, result);
    }),
  );

  router.get(
    '/payments',
    requireAuth,
    requirePerm('order:own:read'),
    wrapAsync(async (_req, res) => {
      const ctx = getRbacContext(res);
      const payments = await paymentService.listPaymentsForCustomer(ctx.userId);
      sendSuccess(res, 200, { payments });
    }),
  );

  router.get(
    '/payments/:paymentId',
    requireAuth,
    requirePaymentReadOrFinance,
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const detail = await paymentService.getPaymentForActor(
        paramString(req.params['paymentId']),
        ctx.userId,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, detail);
    }),
  );

  router.post(
    '/payments/verify',
    requireAuth,
    requirePerm('order:own:create'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const result = await paymentService.verifyPaymentWithSandbox(ctx.userId, req.body);
      sendSuccess(res, 200, result);
    }),
  );

  router.post(
    '/payments/:paymentId/reconcile',
    requireAuth,
    requirePaymentReadOrFinance,
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const result = await paymentService.reconcilePayment(
        paramString(req.params['paymentId']),
        ctx.userId,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  router.get(
    '/admin/payments/reconciliations',
    requireAuth,
    requirePerm('finance:settlement:read'),
    wrapAsync(async (_req, res) => {
      const queue = await paymentService.listReconciliationQueue();
      sendSuccess(res, 200, queue);
    }),
  );

  // Public signed webhook ingestion endpoint authenticated strictly via HMAC-SHA256 + timestamp replay cutoff
  router.post(
    '/webhooks/payments/:provider',
    wrapAsync(async (req, res) => {
      const result = await paymentService.processSignedWebhook(
        paramString(req.params['provider']),
        req.headers,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  return router;
}
