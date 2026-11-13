import { Router, type NextFunction, type Request, type Response } from 'express';
import type { InspectorStatus } from '@bhojora/shared';
import type { AppConfig } from '../../config/env-types';
import { sendSuccess } from '../../contracts/api';
import { AppError } from '../../middleware/error-handler';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { InspectorService } from './inspector.service';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

const ADMIN_ROLES = new Set(['TRUST_ADMIN', 'OPS_ADMIN', 'SUPER_ADMIN']);

export interface CreateInspectorRouterParams {
  identityService: IdentityService;
  inspectorService: InspectorService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createInspectorRouter(params: CreateInspectorRouterParams): Router {
  const { identityService, inspectorService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  // 1. Submit Inspector Onboarding Application
  router.post(
    '/inspectors/apply',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const profile = await inspectorService.apply(ctx.userId, req.body);
      sendSuccess(res, 201, { profile });
    }),
  );

  // 2. Get own Inspector Profile
  router.get(
    '/inspectors/me',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const profile = await inspectorService.getOwnProfile(ctx.userId);
      sendSuccess(res, 200, { profile });
    }),
  );

  // 3. Update Conflict of Interest Declarations
  router.put(
    '/inspectors/me/conflicts',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const profile = await inspectorService.updateConflicts(ctx.userId, req.body);
      sendSuccess(res, 200, { profile });
    }),
  );

  // 4. Admin: List Inspector Applications
  router.get(
    '/admin/inspectors',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const hasAdmin = ctx.roles.some((r) => ADMIN_ROLES.has(r));
      if (!hasAdmin) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Admin access required to view inspector applications',
        );
      }

      const status = req.query['status'] as InspectorStatus | undefined;
      const cityCode = req.query['cityCode'] as string | undefined;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
      const skip = req.query['skip'] ? parseInt(req.query['skip'] as string, 10) : undefined;

      const result = await inspectorService.listInspectors({ status, cityCode, limit, skip });
      sendSuccess(res, 200, result);
    }),
  );

  // 5. Admin: Review Inspector Application
  router.post(
    '/admin/inspectors/:id/review',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const hasAdmin = ctx.roles.some((r) => ADMIN_ROLES.has(r));
      if (!hasAdmin) {
        throw new AppError(
          403,
          'FORBIDDEN',
          'Admin access required to review inspector applications',
        );
      }

      const id = req.params['id'] as string;
      const profile = await inspectorService.reviewInspector(ctx.userId, id, req.body);
      sendSuccess(res, 200, { profile });
    }),
  );

  // 6. Admin / Dispatch: Check Inspector Eligibility for Outlet
  router.post(
    '/admin/inspectors/:id/eligibility-check',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const hasAdminOrInspector =
        ctx.roles.some((r) => ADMIN_ROLES.has(r)) || ctx.roles.includes('INSPECTOR');
      if (!hasAdminOrInspector) {
        throw new AppError(403, 'FORBIDDEN', 'Permission denied');
      }

      const id = req.params['id'] as string;
      const result = await inspectorService.checkEligibility(id, req.body);
      sendSuccess(res, 200, result);
    }),
  );

  return router;
}
