import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendError, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { UserRole } from '../identity/identity.types';
import type { ExpansionService } from './expansion.service';
import { founderApprovalSchema } from './expansion.types';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

const EXPANSION_ADMIN_ROLES: readonly UserRole[] = ['SUPER_ADMIN'];

export interface CreateExpansionRouterParams {
  identityService: IdentityService;
  expansionService: ExpansionService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createExpansionRouter(params: CreateExpansionRouterParams): Router {
  const { identityService, expansionService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  function requireSuperAdminScope(req: Request, res: Response): void {
    const ctx = resolveRbacRequestContext(req, res);
    const hasSuperAdmin = ctx.roles.some((role) => EXPANSION_ADMIN_ROLES.includes(role));
    if (!hasSuperAdmin) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Founder / Super Admin authorization required to sign off on commercial city expansion',
      );
    }
  }

  // 1. Comprehensive Pilot Evaluation Report
  router.get(
    '/expansion/evaluation',
    wrapAsync(async (req: Request, res: Response) => {
      const report = await expansionService.getPilotEvaluationReport();
      sendSuccess(res, 200, report);
    }),
  );

  // 2. Go / No-Go Decision Status
  router.get(
    '/expansion/decision',
    wrapAsync(async (req: Request, res: Response) => {
      const decision = await expansionService.evaluateGoNoGoDecision();
      sendSuccess(res, 200, decision);
    }),
  );

  // 3. Next-City Expansion Candidates Roadmap
  router.get(
    '/expansion/next-city-plan',
    wrapAsync(async (req: Request, res: Response) => {
      const plan = await expansionService.getNextCityPlan();
      sendSuccess(res, 200, plan);
    }),
  );

  // 4. Founder executive sign-off for expansion
  router.post(
    '/expansion/founder-approval',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireSuperAdminScope(req, res);
      const parsed = founderApprovalSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message ?? 'Invalid founder sign-off payload',
        );
        return;
      }
      const updatedDecision = await expansionService.submitFounderSignOff(parsed.data);
      sendSuccess(res, 200, updatedDecision);
    }),
  );

  return router;
}
