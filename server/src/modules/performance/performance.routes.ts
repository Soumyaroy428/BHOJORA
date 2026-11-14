import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendError, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { UserRole } from '../identity/identity.types';
import type { PerformanceService } from './performance.service';
import { runLoadDrillSchema, runRecoveryDrillSchema } from './performance.types';

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

export interface CreatePerformanceRouterParams {
  identityService: IdentityService;
  performanceService: PerformanceService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createPerformanceRouter(params: CreatePerformanceRouterParams): Router {
  const { identityService, performanceService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  function requireAdminScope(req: Request, res: Response): void {
    const ctx = resolveRbacRequestContext(req, res);
    const hasAdminRole = ctx.roles.some((r) => ADMIN_ROLES.includes(r));
    if (!hasAdminRole) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Administrative privileges required to execute load drills and disaster recovery tests',
      );
    }
  }

  // 1. Live Runtime Performance & Memory Metrics
  router.get(
    '/performance/metrics',
    wrapAsync(async (_req: Request, res: Response) => {
      const metrics = performanceService.getPerformanceMetrics();
      sendSuccess(res, 200, metrics);
    }),
  );

  // 2. Automated Concurrent Load Test Drill
  router.post(
    '/performance/load-drill',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const parsed = runLoadDrillSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid load drill configuration',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        );
        return;
      }

      const report = await performanceService.runLoadDrill(parsed.data);
      sendSuccess(res, 200, report);
    }),
  );

  // 3. Disaster Recovery and Restore Drill
  router.post(
    '/performance/recovery-drill',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const parsed = runRecoveryDrillSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid recovery drill payload',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        );
        return;
      }

      const report = await performanceService.runRecoveryDrill(parsed.data);
      sendSuccess(res, 200, report);
    }),
  );

  return router;
}
