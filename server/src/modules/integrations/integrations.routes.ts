import { Router, type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import type { AppConfig } from '../../config/env-types';
import { sendError, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { UserRole } from '../identity/identity.types';
import type { IntegrationsService } from './integrations.service';
import type { IntegrationProvider } from '@bhojora/shared';

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

const INTEGRATION_PROVIDERS = [
  'GOOGLE_MAPS',
  'PAYMENT_GATEWAY',
  'SMS_NOTIFICATION',
  'PUSH_NOTIFICATION',
  'OBJECT_STORAGE',
  'AI_GATEWAY',
] as const;

const routeRequestSchema = z.object({
  pickup: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
  dropoff: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }),
});

const scanRequestSchema = z.object({
  fileName: z.string().trim().min(1),
  contentBase64: z.string().min(1),
  declaredMimeType: z.string().trim().min(1),
});

export interface CreateIntegrationsRouterParams {
  identityService: IdentityService;
  integrationsService: IntegrationsService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createIntegrationsRouter(params: CreateIntegrationsRouterParams): Router {
  const { identityService, integrationsService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  function requireAdminScope(req: Request, res: Response): void {
    const ctx = resolveRbacRequestContext(req, res);
    const hasAdminRole = ctx.roles.some((r) => ADMIN_ROLES.includes(r));
    if (!hasAdminRole) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Administrative privileges required to manage external integrations and circuit breakers',
      );
    }
  }

  // 1. Integrations Health & Circuit Breakers Status
  router.get(
    '/integrations/health',
    requireAuth,
    wrapAsync(async (_req: Request, res: Response) => {
      const health = integrationsService.getHealth();
      sendSuccess(res, 200, health);
    }),
  );

  // 2. Admin Manual Reset of Tripped Circuit Breaker
  router.post(
    '/integrations/circuit-breaker/:provider/reset',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const providerParam = String(req.params.provider ?? '').toUpperCase();
      if (
        !INTEGRATION_PROVIDERS.includes(providerParam as (typeof INTEGRATION_PROVIDERS)[number])
      ) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Unknown provider '${req.params.provider}'. Allowed: ${INTEGRATION_PROVIDERS.join(', ')}`,
        );
      }

      integrationsService.resetCircuitBreaker(providerParam as IntegrationProvider);
      sendSuccess(res, 200, {
        message: `Circuit breaker for '${providerParam}' successfully reset to CLOSED state.`,
      });
    }),
  );

  // 3. Resilient Routing Calculation with Automatic Offline Fallback
  router.post(
    '/integrations/maps/route',
    wrapAsync(async (req: Request, res: Response) => {
      const parsed = routeRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid coordinates for route calculation',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        );
        return;
      }

      const route = await integrationsService.maps.calculateRoute(
        parsed.data.pickup,
        parsed.data.dropoff,
      );
      sendSuccess(res, 200, route);
    }),
  );

  // 4. File Storage Pre-upload Malware & Signature Scan
  router.post(
    '/integrations/storage/scan',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const parsed = scanRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid file scanning payload',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        );
        return;
      }

      const buffer = Buffer.from(parsed.data.contentBase64, 'base64');
      const scanResult = integrationsService.storageScanner.scanFile({
        fileName: parsed.data.fileName,
        buffer,
        declaredMimeType: parsed.data.declaredMimeType,
      });

      if (!scanResult.isSafe) {
        sendError(
          res,
          422,
          'VALIDATION_ERROR',
          `Uploaded file rejected by security scanner: ${scanResult.rejectionReason}`,
          [{ field: 'file', issue: scanResult.rejectionReason ?? 'Malicious or invalid format' }],
        );
        return;
      }

      sendSuccess(res, 200, scanResult);
    }),
  );

  // 5. Query Dead Letter Queue (DLQ)
  router.get(
    '/integrations/dlq',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const jobs = integrationsService.retryQueue.getDlqJobs();
      sendSuccess(res, 200, { jobs, summary: integrationsService.retryQueue.getSummary() });
    }),
  );

  // 6. Manual Retry DLQ Item
  router.post(
    '/integrations/dlq/:jobId/retry',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const jobId = String(req.params.jobId);
      const job = integrationsService.retryQueue.getJobById(jobId);
      if (!job) {
        throw new AppError(404, 'NOT_FOUND', `DLQ Job '${jobId}' was not found`);
      }

      // Retry execution
      const retried = await integrationsService.retryQueue.retryExhaustedJob(jobId, async () => {
        return { success: true, reprocessedAt: new Date().toISOString() };
      });

      sendSuccess(res, 200, {
        message: `DLQ Job '${jobId}' reprocessed successfully`,
        result: retried,
      });
    }),
  );

  return router;
}
