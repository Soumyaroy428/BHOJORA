import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendError, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { UserRole } from '../identity/identity.types';
import type { PilotService } from './pilot.service';
import { emergencyRollbackSchema, joinPilotCohortSchema } from './pilot.types';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

const PILOT_ADMIN_ROLES: readonly UserRole[] = ['SUPER_ADMIN', 'OPS_ADMIN'];

export interface CreatePilotRouterParams {
  identityService: IdentityService;
  pilotService: PilotService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createPilotRouter(params: CreatePilotRouterParams): Router {
  const { identityService, pilotService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  function requireAdminScope(req: Request, res: Response): void {
    const ctx = resolveRbacRequestContext(req, res);
    const hasAdmin = ctx.roles.some((role) => PILOT_ADMIN_ROLES.includes(role));
    if (!hasAdmin) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Administrative role required to control pilot operations or trigger emergency kill switch',
      );
    }
  }

  // 1. Live status of the Kolkata pilot
  router.get(
    '/pilot/status',
    wrapAsync(async (req: Request, res: Response) => {
      const status = await pilotService.getLiveStatus();
      sendSuccess(res, 200, status);
    }),
  );

  // 2. Acceptance criteria and SLA thresholds evaluation
  router.get(
    '/pilot/thresholds',
    wrapAsync(async (req: Request, res: Response) => {
      const thresholds = pilotService.evaluateThresholds();
      sendSuccess(res, 200, thresholds);
    }),
  );

  // 3. User joins pilot cohort with invite code
  router.post(
    '/pilot/cohort/join',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const parsed = joinPilotCohortSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message ?? 'Invalid pilot cohort input',
        );
        return;
      }
      const ctx = resolveRbacRequestContext(req, res);
      const member = await pilotService.joinCohort(ctx.userId, parsed.data);
      sendSuccess(res, 201, member);
    }),
  );

  // 4. Verify current user's cohort membership
  router.get(
    '/pilot/cohort/verify',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const ctx = resolveRbacRequestContext(req, res);
      const member = await pilotService.verifyCohortMembership(ctx.userId);
      sendSuccess(res, 200, {
        isCohortMember: member !== null && member.status === 'ACTIVE',
        member,
      });
    }),
  );

  // 5. Admin triggers emergency kill-switch / rollback
  router.post(
    '/pilot/admin/emergency-kill',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const parsed = emergencyRollbackSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message ?? 'Invalid rollback payload',
        );
        return;
      }
      const ctx = resolveRbacRequestContext(req, res);
      const updatedStatus = await pilotService.triggerEmergencyRollback(parsed.data, ctx.userId);
      sendSuccess(res, 200, updatedStatus);
    }),
  );

  // 6. Admin resumes pilot after safety review
  router.post(
    '/pilot/admin/resume',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const ctx = resolveRbacRequestContext(req, res);
      const zoneCode = req.body?.zoneCode;
      const updatedStatus = await pilotService.resumePilot(ctx.userId, zoneCode);
      sendSuccess(res, 200, updatedStatus);
    }),
  );

  return router;
}
