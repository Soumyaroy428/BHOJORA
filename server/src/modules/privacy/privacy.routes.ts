import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendError, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { UserRole } from '../identity/identity.types';
import type { PrivacyService } from './privacy.service';
import {
  createDataSubjectRequestSchema,
  securityIncidentSchema,
  updateConsentSchema,
} from './privacy.types';

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

export interface CreatePrivacyRouterParams {
  identityService: IdentityService;
  privacyService: PrivacyService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createPrivacyRouter(params: CreatePrivacyRouterParams): Router {
  const { identityService, privacyService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  function requireAdminScope(req: Request, res: Response): void {
    const ctx = resolveRbacRequestContext(req, res);
    const hasAdminRole = ctx.roles.some((r) => ADMIN_ROLES.includes(r));
    if (!hasAdminRole) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Administrative privileges required to access privacy governance and security controls',
      );
    }
  }

  // 1. Submit Data Subject Request (DSR: Export, Erasure, Revocation)
  router.post(
    '/privacy/requests',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const parsed = createDataSubjectRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid data subject request payload',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        );
        return;
      }

      const ctx = resolveRbacRequestContext(req, res);
      const dsr = await privacyService.submitDataSubjectRequest(ctx.userId, parsed.data);
      sendSuccess(res, 201, dsr);
    }),
  );

  // 2. Get User's DSR History
  router.get(
    '/privacy/requests/me',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const ctx = resolveRbacRequestContext(req, res);
      const dsrs = await privacyService.getDsrsByUserId(ctx.userId);
      sendSuccess(res, 200, { requests: dsrs });
    }),
  );

  // 3. Get User's Current Consent Settings
  router.get(
    '/privacy/consent/me',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const ctx = resolveRbacRequestContext(req, res);
      const consent = await privacyService.getConsent(ctx.userId);
      sendSuccess(res, 200, consent);
    }),
  );

  // 4. Update Consent Preferences
  router.post(
    '/privacy/consent',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const parsed = updateConsentSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid consent update payload',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        );
        return;
      }

      const ctx = resolveRbacRequestContext(req, res);
      const updated = await privacyService.updateConsent(ctx.userId, parsed.data);
      sendSuccess(res, 200, updated);
    }),
  );

  // 5. Admin Trigger Data Retention Purge
  router.post(
    '/privacy/admin/retention-purge',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const retentionDays = Number(req.body.retentionDays ?? 30);
      const result = await privacyService.executeRetentionPurge(retentionDays);
      sendSuccess(res, 200, result);
    }),
  );

  // 6. Admin Log Security Incident
  router.post(
    '/privacy/admin/incident',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const parsed = securityIncidentSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid incident payload',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        );
        return;
      }

      const ctx = resolveRbacRequestContext(req, res);
      const incident = await privacyService.logSecurityIncident(parsed.data, ctx.userId);
      sendSuccess(res, 201, incident);
    }),
  );

  // 7. Admin List Security Incidents
  router.get(
    '/privacy/admin/incidents',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const incidents = await privacyService.listSecurityIncidents();
      sendSuccess(res, 200, { incidents });
    }),
  );

  // 8. Admin Access & Permissions Review
  router.get(
    '/privacy/admin/access-review',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const review = await privacyService.performAccessReview();
      sendSuccess(res, 200, review);
    }),
  );

  return router;
}
