import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { getRequestIdFromResponse, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import {
  createRequirePermissionMiddleware,
  getRbacContext,
  resolveRbacRequestContext,
} from '../../middleware/rbac';
import { KOLKATA_ZONE_IDS, type KolkataZoneId } from '../customer/customer.types';
import type { IdentityService } from '../identity/identity.service';
import { parseOptionalCoordinatesQuery } from '../outlet/outlet.routes';
import type { OutletService } from '../outlet/outlet.service';
import type { Permission } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { RestaurantService } from './restaurant.service';
import {
  ONBOARDING_APPLICATION_STATUSES,
  type OnboardingApplicationStatus,
} from './restaurant.types';

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

export function createRestaurantRouter(params: {
  identityService: IdentityService;
  restaurantService: RestaurantService;
  outletService?: OutletService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}): Router {
  const { identityService, restaurantService, outletService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  router.get(
    '/restaurants',
    wrapAsync(async (req, res) => {
      const zoneParam = typeof req.query['zoneId'] === 'string' ? req.query['zoneId'] : undefined;
      const zoneId =
        zoneParam && (KOLKATA_ZONE_IDS as readonly string[]).includes(zoneParam)
          ? (zoneParam as KolkataZoneId)
          : undefined;
      const coordinates = parseOptionalCoordinatesQuery(req.query['lng'], req.query['lat']);
      const openNow = req.query['openNow'] === 'true';

      if (outletService && (coordinates || openNow)) {
        const restaurants = await outletService.listPublicRestaurants({
          zoneId,
          coordinates,
          openNow,
        });
        sendSuccess(res, 200, { restaurants });
        return;
      }

      const restaurants = await restaurantService.listPublicRestaurants(zoneId);
      sendSuccess(res, 200, { restaurants });
    }),
  );

  router.get(
    '/restaurant/applications',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const applications = await restaurantService.listOwnApplications(ctx.userId);
      sendSuccess(res, 200, { applications });
    }),
  );

  router.post(
    '/restaurant/applications',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const application = await restaurantService.createApplication(
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 201, { application });
    }),
  );

  router.get(
    '/restaurant/applications/:applicationId',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const application = await restaurantService.getOwnApplication(
        paramString(req.params['applicationId']),
        ctx.userId,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { application });
    }),
  );

  router.patch(
    '/restaurant/applications/:applicationId',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const application = await restaurantService.updateOwnApplication(
        paramString(req.params['applicationId']),
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { application });
    }),
  );

  router.post(
    '/restaurant/applications/:applicationId/documents/upload-url',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const uploadIntent = await restaurantService.issueDocumentUploadIntent(
        paramString(req.params['applicationId']),
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { uploadIntent });
    }),
  );

  router.post(
    '/restaurant/applications/:applicationId/documents',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const document = await restaurantService.confirmDocumentUpload(
        paramString(req.params['applicationId']),
        ctx.userId,
        ctx.activeRole,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 201, { document });
    }),
  );

  router.post(
    '/restaurant/applications/:applicationId/submit',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const application = await restaurantService.submitApplication(
        paramString(req.params['applicationId']),
        ctx.userId,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { application });
    }),
  );

  router.get(
    '/restaurant/documents/:documentId/access',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const access = await restaurantService.getPrivateDocumentAccess(
        paramString(req.params['documentId']),
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        getRequestIdFromResponse(res),
      );
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow');
      sendSuccess(res, 200, { access });
    }),
  );

  router.get(
    '/admin/restaurant-applications',
    requireAuth,
    requirePerm('ops:outlet:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const rawStatus = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
      const status =
        rawStatus && (ONBOARDING_APPLICATION_STATUSES as readonly string[]).includes(rawStatus)
          ? (rawStatus as OnboardingApplicationStatus)
          : undefined;
      const applications = await restaurantService.listAdminReviewQueue(
        status,
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { applications });
    }),
  );

  router.get(
    '/admin/restaurant-applications/:applicationId',
    requireAuth,
    requirePerm('ops:outlet:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const application = await restaurantService.getAdminApplicationDetail(
        paramString(req.params['applicationId']),
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { application });
    }),
  );

  router.post(
    '/admin/restaurant-applications/:applicationId/review',
    requireAuth,
    requirePerm('ops:outlet:manage'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const application = await restaurantService.reviewApplication(
        paramString(req.params['applicationId']),
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { application });
    }),
  );

  return router;
}
