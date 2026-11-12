import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { getRequestIdFromResponse, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import {
  createRequirePermissionMiddleware,
  getRbacContext,
  resolveRbacRequestContext,
} from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { Permission } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { OutletService } from './outlet.service';

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

export function parseOptionalCoordinatesQuery(
  rawLng: unknown,
  rawLat: unknown,
): [number, number] | undefined {
  const hasLng = typeof rawLng === 'string' && rawLng.trim() !== '';
  const hasLat = typeof rawLat === 'string' && rawLat.trim() !== '';
  if (!hasLng && !hasLat) {
    return undefined;
  }
  if (!hasLng || !hasLat) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Both lng and lat query parameters must be supplied together in GeoJSON [longitude, latitude] order',
    );
  }
  const lng = Number(rawLng);
  const lat = Number(rawLat);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'lng and lat query parameters must be finite numbers',
    );
  }
  return [lng, lat];
}

export function createOutletRouter(params: {
  identityService: IdentityService;
  outletService: OutletService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}): Router {
  const { identityService, outletService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  router.get(
    '/zones',
    wrapAsync(async (req, res) => {
      const includeInactive = req.query['includeInactive'] === 'true';
      const zones = await outletService.listDeliveryZones({ includeInactive });
      sendSuccess(res, 200, { zones });
    }),
  );

  router.get(
    '/serviceability',
    wrapAsync(async (req, res) => {
      const coords = parseOptionalCoordinatesQuery(req.query['lng'], req.query['lat']);
      if (!coords) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          'Query parameters lng and lat are required in GeoJSON [longitude, latitude] order',
        );
      }
      const outletId =
        typeof req.query['outletId'] === 'string' && req.query['outletId'].trim() !== ''
          ? req.query['outletId'].trim()
          : undefined;
      const serviceability = await outletService.checkServiceability({
        coordinates: coords,
        ...(outletId ? { outletId } : {}),
      });
      sendSuccess(res, 200, { serviceability });
    }),
  );

  router.post(
    '/serviceability/check',
    wrapAsync(async (req, res) => {
      const serviceability = await outletService.checkServiceability(req.body);
      sendSuccess(res, 200, { serviceability });
    }),
  );

  router.get(
    '/outlets/:outletId',
    wrapAsync(async (req, res) => {
      const coords = parseOptionalCoordinatesQuery(req.query['lng'], req.query['lat']);
      const outlet = await outletService.getPublicOutletDetail(
        paramString(req.params['outletId']),
        coords,
      );
      sendSuccess(res, 200, { outlet });
    }),
  );

  router.get(
    '/restaurant/outlets',
    requireAuth,
    requirePerm('restaurant:outlet:read'),
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const outlets = await outletService.listPartnerOutlets(
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
      );
      sendSuccess(res, 200, { outlets });
    }),
  );

  router.post(
    '/restaurant/outlets',
    requireAuth,
    requirePerm('restaurant:outlet:write'),
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const outlet = await outletService.createBranchOutlet(
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 201, { outlet });
    }),
  );

  router.patch(
    '/restaurant/outlets/:outletId',
    requireAuth,
    requirePerm('restaurant:outlet:write'),
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const outlet = await outletService.updateOutletOperations(
        paramString(req.params['outletId']),
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { outlet });
    }),
  );

  router.put(
    '/restaurant/outlets/:outletId/hours',
    requireAuth,
    requirePerm('restaurant:outlet:write'),
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const result = await outletService.updateOutletHours(
        paramString(req.params['outletId']),
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  router.post(
    '/admin/zones',
    requireAuth,
    requirePerm('ops:outlet:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const zone = await outletService.upsertDeliveryZone(
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 201, { zone });
    }),
  );

  router.patch(
    '/admin/zones/:zoneCode',
    requireAuth,
    requirePerm('ops:outlet:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const zone = await outletService.updateDeliveryZone(
        paramString(req.params['zoneCode']),
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { zone });
    }),
  );

  return router;
}
