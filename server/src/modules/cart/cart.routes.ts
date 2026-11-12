import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { createRequirePermissionMiddleware, getRbacContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { Permission } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { CartService } from './cart.service';

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

export function createCartRouter(params: {
  identityService: IdentityService;
  cartService: CartService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}): Router {
  const { identityService, cartService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  router.get(
    '/cart',
    requireAuth,
    requirePerm('order:own:read'),
    wrapAsync(async (_req, res) => {
      const ctx = getRbacContext(res);
      const cart = await cartService.getCart(ctx.userId);
      sendSuccess(res, 200, { cart });
    }),
  );

  router.post(
    '/cart/items',
    requireAuth,
    requirePerm('order:own:create'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const cart = await cartService.addOrIncrementItem(ctx.userId, req.body);
      sendSuccess(res, 200, { cart });
    }),
  );

  router.patch(
    '/cart/items/:cartItemId',
    requireAuth,
    requirePerm('order:own:create'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const cart = await cartService.updateCartItem(
        ctx.userId,
        paramString(req.params['cartItemId']),
        req.body,
      );
      sendSuccess(res, 200, { cart });
    }),
  );

  router.delete(
    '/cart/items/:cartItemId',
    requireAuth,
    requirePerm('order:own:create'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const cart = await cartService.removeCartItem(
        ctx.userId,
        paramString(req.params['cartItemId']),
      );
      sendSuccess(res, 200, { cart });
    }),
  );

  router.delete(
    '/cart',
    requireAuth,
    requirePerm('order:own:create'),
    wrapAsync(async (_req, res) => {
      const ctx = getRbacContext(res);
      const cart = await cartService.clearCart(ctx.userId);
      sendSuccess(res, 200, { cart });
    }),
  );

  return router;
}
