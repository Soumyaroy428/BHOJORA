import type { OrderStatus } from '@bhojora/shared';
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
import type { OrderService } from './orders.service';
import { ORDER_STATUSES_RUNTIME } from './orders.types';

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

export function createOrdersRouter(params: {
  identityService: IdentityService;
  orderService: OrderService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}): Router {
  const { identityService, orderService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  const requireOrderParticipantOrStaff = (requiredPermissions: readonly Permission[]) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const ctx = resolveRbacRequestContext(req, res);
        const allowed = requiredPermissions.some((perm) =>
          hasPermissionForRole(ctx.activeRole, perm),
        );
        if (!allowed) {
          if (rbacStore) {
            await rbacStore.appendAuditLog({
              actorId: ctx.userId,
              actorRole: ctx.activeRole,
              action: 'permission.check.orders',
              resourceType: 'route',
              resourceId: req.originalUrl,
              outcome: 'DENIED',
              reason: `Role ${ctx.activeRole} lacks any of [${requiredPermissions.join(', ')}]`,
              requestId: getRequestIdFromResponse(res),
            });
          }
          throw new AppError(
            403,
            'FORBIDDEN',
            `Role ${ctx.activeRole} cannot access order resource`,
          );
        }
        assertMfaSatisfiedForRole(ctx.activeRole, ctx.mfaVerified);
        next();
      } catch (error) {
        next(error);
      }
    };
  };

  router.post(
    '/orders',
    requireAuth,
    requirePerm('order:own:create'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const { httpStatus, result } = await orderService.createOrder(
        ctx.userId,
        req.headers['idempotency-key'],
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, httpStatus, result);
    }),
  );

  router.get(
    '/orders',
    requireAuth,
    requirePerm('order:own:read'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const limitRaw =
        typeof req.query['limit'] === 'string' ? Number(req.query['limit']) : undefined;
      const limit =
        limitRaw !== undefined && Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : undefined;
      const cursor = typeof req.query['cursor'] === 'string' ? req.query['cursor'] : undefined;
      const list = await orderService.listOrdersForCustomer(ctx.userId, { limit, cursor });
      sendSuccess(res, 200, list);
    }),
  );

  router.get(
    '/orders/:orderId',
    requireAuth,
    requireOrderParticipantOrStaff([
      'order:own:read',
      'restaurant:order:manage',
      'delivery:job:update',
      'support:ticket:read',
      'ops:outlet:manage',
    ]),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const data = await orderService.getOrderForActor(
        paramString(req.params['orderId']),
        ctx.userId,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, data);
    }),
  );

  router.get(
    '/orders/:orderId/tracking',
    requireAuth,
    requireOrderParticipantOrStaff([
      'order:own:read',
      'restaurant:order:manage',
      'delivery:job:update',
      'support:ticket:read',
      'ops:outlet:manage',
    ]),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const tracking = await orderService.getOrderTracking(
        paramString(req.params['orderId']),
        ctx.userId,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, tracking);
    }),
  );

  router.post(
    '/orders/:orderId/cancel',
    requireAuth,
    requireOrderParticipantOrStaff([
      'order:own:create',
      'restaurant:order:manage',
      'support:ticket:resolve',
      'ops:outlet:manage',
    ]),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const result = await orderService.cancelOrder(
        paramString(req.params['orderId']),
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  router.patch(
    '/orders/:orderId/status',
    requireAuth,
    requireOrderParticipantOrStaff([
      'restaurant:order:manage',
      'delivery:job:update',
      'ops:outlet:manage',
      'system:admin:override',
    ]),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const result = await orderService.transitionOrderStatus(
        paramString(req.params['orderId']),
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  router.get(
    '/restaurant/orders',
    requireAuth,
    requirePerm('restaurant:order:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const outletId =
        typeof req.query['outletId'] === 'string' ? req.query['outletId'].trim() : '';
      if (!outletId) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Query parameter outletId is required');
      }
      const statusParam =
        typeof req.query['status'] === 'string' ? req.query['status'].trim() : undefined;
      const status =
        statusParam && ORDER_STATUSES_RUNTIME.includes(statusParam as OrderStatus)
          ? (statusParam as OrderStatus)
          : undefined;
      const orders = await orderService.listOrdersForOutlet(
        outletId,
        ctx.userId,
        ctx.activeRole,
        { status },
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { outletId, orders });
    }),
  );

  router.patch(
    '/restaurant/orders/:orderId/status',
    requireAuth,
    requirePerm('restaurant:order:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const result = await orderService.transitionOrderStatus(
        paramString(req.params['orderId']),
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  router.patch(
    '/restaurant/orders/:orderId/prep-time',
    requireAuth,
    requirePerm('restaurant:order:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const result = await orderService.updatePrepTime(
        paramString(req.params['orderId']),
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  router.post(
    '/restaurant/orders/:orderId/reject',
    requireAuth,
    requirePerm('restaurant:order:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const result = await orderService.rejectOrder(
        paramString(req.params['orderId']),
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  return router;
}
