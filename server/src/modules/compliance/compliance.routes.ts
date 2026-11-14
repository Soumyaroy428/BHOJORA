import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendError, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { UserRole } from '../identity/identity.types';
import type { ComplianceService } from './compliance.service';
import { fssaiVerifySchema, gstinVerifySchema, signOffSchema } from './compliance.types';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

const COMPLIANCE_ADMIN_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'OPS_ADMIN',
  'FINANCE_ADMIN',
  'TRUST_ADMIN',
];

export interface CreateComplianceRouterParams {
  identityService: IdentityService;
  complianceService: ComplianceService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createComplianceRouter(params: CreateComplianceRouterParams): Router {
  const { identityService, complianceService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  function requireAdminScope(req: Request, res: Response): void {
    const ctx = resolveRbacRequestContext(req, res);
    const hasAdmin = ctx.roles.some((role) => COMPLIANCE_ADMIN_ROLES.includes(role));
    if (!hasAdmin) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Administrative role required to record compliance certifications or mutate dossier',
      );
    }
  }

  // 1. Get full launch readiness dossier (Authenticated users: operators, partners, inspectors)
  router.get(
    '/compliance/dossier',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const dossier = await complianceService.getLaunchReadinessDossier();
      sendSuccess(res, 200, dossier);
    }),
  );

  // 2. High-level readiness status check (Publicly observable health/readiness probe)
  router.get(
    '/compliance/readiness',
    wrapAsync(async (req: Request, res: Response) => {
      const dossier = await complianceService.getLaunchReadinessDossier();
      sendSuccess(res, 200, {
        status: dossier.status,
        readinessScorePercent: dossier.readinessScorePercent,
        mandatoryDomainsCovered: dossier.mandatoryDomainsCovered,
        totalMandatoryDomains: dossier.totalMandatoryDomains,
        blockersCount: dossier.blockers.length,
        blockers: dossier.blockers,
      });
    }),
  );

  // 3. Verify FSSAI 14-digit registration number
  router.post(
    '/compliance/verify/fssai',
    wrapAsync(async (req: Request, res: Response) => {
      const parsed = fssaiVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message ?? 'Invalid FSSAI payload',
        );
        return;
      }
      const result = complianceService.verifyFssai(parsed.data);
      sendSuccess(res, 200, result);
    }),
  );

  // 4. Verify Indian GSTIN tax identification
  router.post(
    '/compliance/verify/gstin',
    wrapAsync(async (req: Request, res: Response) => {
      const parsed = gstinVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message ?? 'Invalid GSTIN payload',
        );
        return;
      }
      const result = complianceService.verifyGstin(parsed.data);
      sendSuccess(res, 200, result);
    }),
  );

  // 5. Submit qualified professional adviser sign-off (Admin only)
  router.post(
    '/compliance/sign-offs',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const parsed = signOffSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message ?? 'Invalid sign-off payload',
        );
        return;
      }
      const signOff = await complianceService.recordAdviserSignOff(parsed.data);
      sendSuccess(res, 201, signOff);
    }),
  );

  // 6. Admin seed pilot certifications (Super Admin only)
  router.post(
    '/compliance/admin/seed-pilot-certifications',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const dossier = await complianceService.seedCertifiedPilotDossier();
      sendSuccess(res, 200, dossier);
    }),
  );

  return router;
}
