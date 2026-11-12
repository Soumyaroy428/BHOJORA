import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { createRequirePermissionMiddleware, getRbacContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { Permission } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { PricingService } from './pricing.service';

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
}

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

export function createPricingRouter(params: {
  identityService: IdentityService;
  pricingService: PricingService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}): Router {
  const { identityService, pricingService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  router.get(
    '/coupons/available',
    wrapAsync(async (_req, res) => {
      const coupons = await pricingService.listPublicAvailableCoupons();
      sendSuccess(res, 200, { coupons });
    }),
  );

  router.post(
    '/checkout/quote',
    requireAuth,
    requirePerm('order:own:create'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const quote = await pricingService.generateCheckoutQuote(
        ctx.userId,
        req.body,
        ctx.activeRole,
      );
      sendSuccess(res, 200, { quote });
    }),
  );

  router.get(
    '/checkout/quotes/:quoteId',
    requireAuth,
    requirePerm('order:own:read'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const quote = await pricingService.getCheckoutQuote(
        ctx.userId,
        paramString(req.params['quoteId']),
      );
      sendSuccess(res, 200, { quote });
    }),
  );

  router.post(
    '/checkout/quotes/:quoteId/verify',
    requireAuth,
    requirePerm('order:own:read'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const result = await pricingService.verifyQuoteForCheckout(
        ctx.userId,
        paramString(req.params['quoteId']),
        req.body,
      );
      sendSuccess(res, 200, result);
    }),
  );

  return router;
}
