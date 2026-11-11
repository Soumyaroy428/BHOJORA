import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { getRequestIdFromResponse, sendSuccess } from '../../contracts/api';
import { clearAuthCookies, createRequireAuthMiddleware } from '../../middleware/auth';
import { createRequirePermissionMiddleware, getRbacContext } from '../../middleware/rbac';
import type { Permission } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { IdentityService } from '../identity/identity.service';
import type { CustomerService } from './customer.service';

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

export function createCustomerRouter(params: {
  identityService: IdentityService;
  customerService: CustomerService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'authCookieSecure' | 'corsAllowedOrigins'>;
}): Router {
  const { identityService, customerService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  router.get(
    '/customer/profile',
    requireAuth,
    requirePerm('profile:own:read'),
    wrapAsync(async (_req, res) => {
      const ctx = getRbacContext(res);
      const bundle = await customerService.getAccountBundle(ctx.userId);
      sendSuccess(res, 200, bundle);
    }),
  );

  router.patch(
    '/customer/profile',
    requireAuth,
    requirePerm('profile:own:write'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const bundle = await customerService.updateAccountBundle(
        ctx.userId,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, bundle);
    }),
  );

  router.get(
    '/addresses',
    requireAuth,
    requirePerm('address:own:manage'),
    wrapAsync(async (_req, res) => {
      const ctx = getRbacContext(res);
      const addresses = await customerService.listAddresses(ctx.userId);
      sendSuccess(res, 200, { addresses });
    }),
  );

  router.post(
    '/addresses',
    requireAuth,
    requirePerm('address:own:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const address = await customerService.createAddress(
        ctx.userId,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 201, { address });
    }),
  );

  router.get(
    '/addresses/:addressId',
    requireAuth,
    requirePerm('address:own:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const address = await customerService.getAddressById(
        paramString(req.params['addressId']),
        ctx.userId,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { address });
    }),
  );

  router.patch(
    '/addresses/:addressId',
    requireAuth,
    requirePerm('address:own:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const address = await customerService.updateAddress(
        paramString(req.params['addressId']),
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { address });
    }),
  );

  router.post(
    '/addresses/:addressId/default',
    requireAuth,
    requirePerm('address:own:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const address = await customerService.setDefaultAddress(
        paramString(req.params['addressId']),
        ctx.userId,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { address });
    }),
  );

  router.delete(
    '/addresses/:addressId',
    requireAuth,
    requirePerm('address:own:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const result = await customerService.deleteAddress(
        paramString(req.params['addressId']),
        ctx.userId,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  router.get(
    '/customer/consents',
    requireAuth,
    requirePerm('profile:own:read'),
    wrapAsync(async (_req, res) => {
      const ctx = getRbacContext(res);
      const consents = await customerService.listConsents(ctx.userId);
      sendSuccess(res, 200, { consents });
    }),
  );

  router.post(
    '/customer/consents',
    requireAuth,
    requirePerm('profile:own:write'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const consent = await customerService.recordConsent(
        ctx.userId,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 201, { consent });
    }),
  );

  router.get(
    '/customer/privacy/export',
    requireAuth,
    requirePerm('profile:own:read'),
    wrapAsync(async (_req, res) => {
      const ctx = getRbacContext(res);
      const exported = await customerService.exportPrivacyData(ctx.userId);
      sendSuccess(res, 200, exported);
    }),
  );

  router.post(
    '/customer/account/deletion-request',
    requireAuth,
    requirePerm('profile:own:write'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const result = await customerService.requestAccountDeletion(
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      clearAuthCookies(res, config);
      res.setHeader('Clear-Site-Data', '"cookies", "storage"');
      sendSuccess(res, 200, result);
    }),
  );

  return router;
}
