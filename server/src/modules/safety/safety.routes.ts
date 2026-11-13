import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendSuccess } from '../../contracts/api';
import type { SafetyService } from './safety.service';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

export interface CreateSafetyRouterParams {
  safetyService: SafetyService;
}

export function createSafetyRouter(params: CreateSafetyRouterParams): Router {
  const { safetyService } = params;
  const router = Router();

  // 1. Fetch canonical public Bhojora Trust profile for an outlet
  router.get(
    '/safety/outlets/:id',
    wrapAsync(async (req, res) => {
      const profile = await safetyService.getPublicTrustProfile(req.params['id'] as string);
      sendSuccess(res, 200, { profile });
    }),
  );

  // 2. Fetch immutable historical audit versions for an outlet
  router.get(
    '/safety/outlets/:id/history',
    wrapAsync(async (req, res) => {
      const historyResult = await safetyService.getPublicTrustHistory(req.params['id'] as string);
      sendSuccess(res, 200, historyResult);
    }),
  );

  // 3. Fetch canonical QR badge payload for an outlet
  router.get(
    '/safety/outlets/:id/qr',
    wrapAsync(async (req, res) => {
      const qr = await safetyService.getOutletQrCode(req.params['id'] as string);
      sendSuccess(res, 200, { qr });
    }),
  );

  // 4. Resolve QR code scan token (supports browser 302 redirect or JSON API response)
  router.get(
    '/safety/qr/:code',
    wrapAsync(async (req, res) => {
      const profile = await safetyService.resolveQrCode(req.params['code'] as string);
      const acceptHeader = req.headers['accept'] || '';
      if (acceptHeader.includes('text/html')) {
        res.redirect(302, profile.verificationUrl);
        return;
      }
      sendSuccess(res, 200, { profile });
    }),
  );

  return router;
}
