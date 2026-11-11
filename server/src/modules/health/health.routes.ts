import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '../../contracts/api';
import type { HealthService } from './health.service';

export function createHealthRouter(healthService: HealthService): Router {
  const router = Router();

  router.get('/health', (_req: Request, res: Response) => {
    sendSuccess(res, 200, healthService.getLiveness());
  });

  router.get('/ready', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const readiness = await healthService.getReadiness();
      if (readiness.ready) {
        sendSuccess(res, 200, readiness);
        return;
      }

      const details = readiness.checks
        .filter((check) => check.status === 'fail')
        .map((check) => ({
          field: check.name,
          issue: check.detail ?? 'Dependency check failed',
          code: 'READINESS_CHECK_FAILED',
        }));

      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Service is not ready to accept traffic', details);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
