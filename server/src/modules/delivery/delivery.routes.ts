import { Router, type NextFunction, type Request, type Response } from 'express';
import type { DeliveryPartnerStatus } from '@bhojora/shared';
import type { AppConfig } from '../../config/env-types';
import { getRequestIdFromResponse, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware, getAuthContext } from '../../middleware/auth';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { IdentityStore } from '../identity/identity.types';
import type { DeliveryService } from './delivery.service';

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

export interface CreateDeliveryRouterParams {
  identityService: IdentityService;
  identityStore: IdentityStore;
  deliveryService: DeliveryService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createDeliveryRouter(params: CreateDeliveryRouterParams): Router {
  const { identityService, identityStore, deliveryService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  router.post(
    '/delivery/applications',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const user = await identityStore.findUserById(auth.userId);
      const email = user?.emailNormalized ?? '';
      const phone = user?.phoneNormalized ?? '';
      const application = await deliveryService.createApplication(
        auth.userId,
        email,
        phone,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 201, { application });
    }),
  );

  router.get(
    '/delivery/profile/me',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const profile = await deliveryService.getOwnProfile(ctx.userId);
      sendSuccess(res, 200, { profile });
    }),
  );

  router.put(
    '/delivery/profile/me',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const profile = await deliveryService.updateOwnProfile(
        ctx.userId,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { profile });
    }),
  );

  router.post(
    '/delivery/profile/me/documents',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const profile = await deliveryService.uploadDocument(
        ctx.userId,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { profile });
    }),
  );

  router.post(
    '/delivery/profile/me/submit',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const profile = await deliveryService.submitApplication(
        ctx.userId,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { profile });
    }),
  );

  router.patch(
    '/delivery/profile/me/availability',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const profile = await deliveryService.updateAvailability(
        ctx.userId,
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { profile });
    }),
  );

  router.get(
    '/delivery/admin/applications',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const status = req.query['status'] as DeliveryPartnerStatus | undefined;
      const limit = req.query['limit'] ? parseInt(req.query['limit'] as string, 10) : undefined;
      const skip = req.query['skip'] ? parseInt(req.query['skip'] as string, 10) : undefined;
      const result = await deliveryService.listAdminApplications(
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        { status, limit, skip },
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  router.get(
    '/delivery/admin/applications/:partnerId',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const application = await deliveryService.getAdminApplication(
        ctx.userId,
        ctx.activeRole,
        paramString(req.params['partnerId']),
        ctx.mfaVerified,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { application });
    }),
  );

  router.post(
    '/delivery/admin/applications/:partnerId/review',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const application = await deliveryService.reviewApplication(
        ctx.userId,
        ctx.activeRole,
        paramString(req.params['partnerId']),
        req.body,
        ctx.mfaVerified,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { application });
    }),
  );

  // --- Checkpoint 19: Delivery assignment, dispatch engine & job inbox routes ---

  router.get(
    '/delivery/jobs/inbox',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const inbox = await deliveryService.getJobInbox(ctx.userId);
      sendSuccess(res, 200, { inbox });
    }),
  );

  router.post(
    '/delivery/jobs/:offerId/accept',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const offer = await deliveryService.acceptOffer(
        ctx.userId,
        paramString(req.params['offerId']),
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { offer });
    }),
  );

  router.post(
    '/delivery/jobs/:offerId/decline',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const result = await deliveryService.declineOffer(
        ctx.userId,
        paramString(req.params['offerId']),
        req.body,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  router.get(
    '/delivery/assignments/active',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const assignment = await deliveryService.getActiveAssignment(ctx.userId);
      sendSuccess(res, 200, { assignment });
    }),
  );

  router.post(
    '/delivery/dispatch/trigger',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const result = await deliveryService.triggerDispatch(
        req.body,
        ctx.activeRole,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 201, result);
    }),
  );

  // --- Checkpoint 20: Tracking, execution & incident routes ---

  router.post(
    '/delivery/assignments/:assignmentId/location',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const event = await deliveryService.recordLocationPing(
        ctx.userId,
        paramString(req.params['assignmentId']),
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 201, { event });
    }),
  );

  router.post(
    '/delivery/assignments/:assignmentId/arrive-pickup',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const assignment = await deliveryService.advanceExecutionStep(
        ctx.userId,
        paramString(req.params['assignmentId']),
        'ARRIVED_AT_PICKUP',
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { assignment });
    }),
  );

  router.post(
    '/delivery/assignments/:assignmentId/confirm-pickup',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const assignment = await deliveryService.advanceExecutionStep(
        ctx.userId,
        paramString(req.params['assignmentId']),
        'CONFIRMED_PICKUP',
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { assignment });
    }),
  );

  router.post(
    '/delivery/assignments/:assignmentId/arrive-drop',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const assignment = await deliveryService.advanceExecutionStep(
        ctx.userId,
        paramString(req.params['assignmentId']),
        'ARRIVED_AT_DROP',
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, { assignment });
    }),
  );

  router.post(
    '/delivery/assignments/:assignmentId/complete',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const result = await deliveryService.completeDelivery(
        ctx.userId,
        paramString(req.params['assignmentId']),
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  router.post(
    '/delivery/assignments/:assignmentId/incidents',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const incident = await deliveryService.reportIncident(
        ctx.userId,
        paramString(req.params['assignmentId']),
        req.body,
        getRequestIdFromResponse(res),
      );
      sendSuccess(res, 201, { incident });
    }),
  );

  router.get(
    '/delivery/assignments/:assignmentId/incidents',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const incidents = await deliveryService.getIncidentsForAssignment(
        ctx.userId,
        paramString(req.params['assignmentId']),
      );
      sendSuccess(res, 200, { incidents });
    }),
  );

  router.get(
    '/delivery/orders/:orderId/live-tracking',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const tracking = await deliveryService.getOrderLiveTracking(
        paramString(req.params['orderId']),
        ctx.userId,
        ctx.activeRole,
      );
      sendSuccess(res, 200, { tracking });
    }),
  );

  return router;
}
