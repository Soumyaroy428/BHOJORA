import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendError, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { UserRole } from '../identity/identity.types';
import type { RbacStore } from '../rbac/rbac.store';
import type { AnalyticsService } from './analytics.service';
import { exportReportRequestSchema, analyticsQuerySchema } from './analytics.types';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

const ADMIN_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'OPS_ADMIN',
  'FINANCE_ADMIN',
  'TRUST_ADMIN',
];

export interface CreateAnalyticsRouterParams {
  identityService: IdentityService;
  analyticsService: AnalyticsService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createAnalyticsRouter(params: CreateAnalyticsRouterParams): Router {
  const { identityService, analyticsService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  function requireAdminScope(req: Request, res: Response): void {
    const ctx = resolveRbacRequestContext(req, res);
    const hasAdminRole = ctx.roles.some((r) => ADMIN_ROLES.includes(r));
    if (!hasAdminRole) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Administrative privileges required to access platform analytics',
      );
    }
  }

  async function assertRestaurantOutletAccess(
    req: Request,
    res: Response,
    outletId: string,
  ): Promise<void> {
    const ctx = resolveRbacRequestContext(req, res);
    const hasAdminRole = ctx.roles.some((r) => ADMIN_ROLES.includes(r));
    if (hasAdminRole) {
      return;
    }

    const isRestaurantStaff = ctx.roles.some(
      (r) => r === 'RESTAURANT_OWNER' || r === 'RESTAURANT_MANAGER',
    );
    if (!isRestaurantStaff) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Access denied: restaurant owner or admin credentials required',
      );
    }

    if (rbacStore) {
      const memberships = await rbacStore.listMembershipsForUser(ctx.userId);
      const hasOutlet = memberships.some(
        (m) =>
          m.outletId === outletId &&
          m.status === 'ACTIVE' &&
          (m.role === 'RESTAURANT_OWNER' || m.role === 'RESTAURANT_MANAGER'),
      );
      if (!hasOutlet) {
        throw new AppError(
          403,
          'FORBIDDEN',
          `Tenant isolation violation: user does not have access to outlet ${outletId}`,
        );
      }
    }
  }

  // 1. GET /analytics/overview (Marketplace KPIs)
  router.get(
    '/analytics/overview',
    requireAuth,
    wrapAsync(async (req, res) => {
      requireAdminScope(req, res);
      const parseResult = analyticsQuerySchema.safeParse({
        timeframe: req.query['timeframe'],
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
      });
      if (!parseResult.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parseResult.error.issues[0]?.message || 'Invalid query',
        );
        return;
      }
      const kpis = await analyticsService.getMarketplaceKpis(parseResult.data);
      sendSuccess(res, 200, kpis);
    }),
  );

  // 2. GET /analytics/restaurant/:outletId (Restaurant Scoped KPIs)
  router.get(
    '/analytics/restaurant/:outletId',
    requireAuth,
    wrapAsync(async (req, res) => {
      const outletId = req.params['outletId'] as string;
      await assertRestaurantOutletAccess(req, res, outletId);

      const parseResult = analyticsQuerySchema.safeParse({
        timeframe: req.query['timeframe'],
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
      });
      if (!parseResult.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parseResult.error.issues[0]?.message || 'Invalid query',
        );
        return;
      }
      const kpis = await analyticsService.getRestaurantKpis(outletId, parseResult.data);
      sendSuccess(res, 200, kpis);
    }),
  );

  // 3. GET /analytics/delivery (Delivery Fleet KPIs)
  router.get(
    '/analytics/delivery',
    requireAuth,
    wrapAsync(async (req, res) => {
      requireAdminScope(req, res);
      const parseResult = analyticsQuerySchema.safeParse({
        timeframe: req.query['timeframe'],
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
      });
      if (!parseResult.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parseResult.error.issues[0]?.message || 'Invalid query',
        );
        return;
      }
      const kpis = await analyticsService.getDeliveryFleetKpis(parseResult.data);
      sendSuccess(res, 200, kpis);
    }),
  );

  // 4. GET /analytics/finance (Finance & Reconciliation KPIs)
  router.get(
    '/analytics/finance',
    requireAuth,
    wrapAsync(async (req, res) => {
      requireAdminScope(req, res);
      const parseResult = analyticsQuerySchema.safeParse({
        timeframe: req.query['timeframe'],
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
      });
      if (!parseResult.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parseResult.error.issues[0]?.message || 'Invalid query',
        );
        return;
      }
      const kpis = await analyticsService.getFinanceKpis(parseResult.data);
      sendSuccess(res, 200, kpis);
    }),
  );

  // 5. GET /analytics/trust (Trust & Safety KPIs)
  router.get(
    '/analytics/trust',
    requireAuth,
    wrapAsync(async (req, res) => {
      requireAdminScope(req, res);
      const parseResult = analyticsQuerySchema.safeParse({
        timeframe: req.query['timeframe'],
        startDate: req.query['startDate'],
        endDate: req.query['endDate'],
      });
      if (!parseResult.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parseResult.error.issues[0]?.message || 'Invalid query',
        );
        return;
      }
      const kpis = await analyticsService.getTrustSafetyKpis(parseResult.data);
      sendSuccess(res, 200, kpis);
    }),
  );

  // 6. POST /analytics/export (PII-Sanitized Report Export)
  router.post(
    '/analytics/export',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const parseResult = exportReportRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parseResult.error.issues[0]?.message || 'Invalid body',
        );
        return;
      }

      const hasAdminRole = ctx.roles.some((r) => ADMIN_ROLES.includes(r));
      let resolvedOutletId = parseResult.data.outletId;

      if (!hasAdminRole) {
        const isRestaurantStaff = ctx.roles.some(
          (r) => r === 'RESTAURANT_OWNER' || r === 'RESTAURANT_MANAGER',
        );
        if (!isRestaurantStaff) {
          throw new AppError(403, 'FORBIDDEN', 'Permission denied: cannot export analytics');
        }
        if (parseResult.data.reportType !== 'RESTAURANT') {
          throw new AppError(
            403,
            'FORBIDDEN',
            'Restaurant staff may only export RESTAURANT operational reports',
          );
        }
        if (rbacStore) {
          const memberships = await rbacStore.listMembershipsForUser(ctx.userId);
          const active = memberships.find((m) => m.status === 'ACTIVE');
          if (!active) {
            throw new AppError(403, 'FORBIDDEN', 'No active restaurant membership found');
          }
          if (resolvedOutletId && resolvedOutletId !== active.outletId) {
            throw new AppError(403, 'FORBIDDEN', 'Cannot export data for other outlets');
          }
          resolvedOutletId = active.outletId;
        }
      }

      const exportResult = await analyticsService.generateReportExport(
        { ...parseResult.data, outletId: resolvedOutletId },
        {
          role: ctx.activeRole,
          outletId: resolvedOutletId,
          userId: ctx.userId,
        },
      );

      sendSuccess(res, 200, exportResult);
    }),
  );

  return router;
}
