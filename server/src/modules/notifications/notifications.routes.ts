import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware, getAuthContext } from '../../middleware/auth';
import { createRequirePermissionMiddleware } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { Permission } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { NotificationService } from './notifications.service';
import {
  dispatchNotificationSchema,
  updateNotificationPreferencesSchema,
  notificationOptOutSchema,
  deliveryLogQuerySchema,
} from './notifications.types';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

export interface CreateNotificationRouterParams {
  identityService: IdentityService;
  notificationService: NotificationService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createNotificationRouter(params: CreateNotificationRouterParams): Router {
  const { identityService, notificationService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  // 1. Dispatch Multi-Channel Notification
  // Can be called by internal services, or authorized roles
  router.post(
    '/notifications/dispatch',
    wrapAsync(async (req, res) => {
      const validated = dispatchNotificationSchema.parse(req.body);
      const result = await notificationService.dispatch(validated);
      sendSuccess(res, 201, result);
    }),
  );

  // 2. Customer / Partner In-App Notification Inbox
  router.get(
    '/notifications/me',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const unreadOnly = req.query['unreadOnly'] === 'true';
      const limit = req.query['limit'] ? Number(req.query['limit']) : 50;

      const notifications = await notificationService.getUserNotifications(auth.userId, {
        unreadOnly,
        limit,
      });
      sendSuccess(res, 200, { notifications });
    }),
  );

  // 3. Mark Notification as Read
  router.patch(
    '/notifications/:id/read',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const rawId = req.params['id'];
      const notificationId = typeof rawId === 'string' ? rawId : (rawId?.[0] ?? '');
      const marked = await notificationService.markAsRead(notificationId, auth.userId);
      sendSuccess(res, 200, { success: marked, notificationId });
    }),
  );

  // 4. Get Notification Preferences
  router.get(
    '/notifications/preferences',
    requireAuth,
    wrapAsync(async (_req, res) => {
      const auth = getAuthContext(res);
      const preferences = await notificationService.getPreferences(auth.userId);
      sendSuccess(res, 200, { preferences });
    }),
  );

  // 5. Update Notification Preferences (Channel Toggles & Language)
  router.patch(
    '/notifications/preferences',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const validated = updateNotificationPreferencesSchema.parse(req.body);
      const preferences = await notificationService.updatePreferences(auth.userId, validated);
      sendSuccess(res, 200, { preferences });
    }),
  );

  // 6. Direct Promotional Opt-Out (1-click unsubscribe)
  router.post(
    '/notifications/opt-out',
    wrapAsync(async (req, res) => {
      const validated = notificationOptOutSchema.parse(req.body);
      const result = await notificationService.optOut(validated.userId, validated.reason);
      sendSuccess(res, 200, result);
    }),
  );

  // 7. Admin / Governance Delivery Logs & Audit
  router.get(
    '/notifications/logs',
    requireAuth,
    requirePerm('audit:log:read'),
    wrapAsync(async (req, res) => {
      const validated = deliveryLogQuerySchema.parse(req.query);
      const logs = await notificationService.getDeliveryLogs(validated);
      sendSuccess(res, 200, { logs, count: logs.length });
    }),
  );

  // 8. Admin / System Retry Failed Notification
  router.post(
    '/notifications/logs/:id/retry',
    requireAuth,
    requirePerm('audit:log:read'),
    wrapAsync(async (req, res) => {
      const rawId = req.params['id'];
      const notificationId = typeof rawId === 'string' ? rawId : (rawId?.[0] ?? '');
      const retried = await notificationService.retry(notificationId);
      sendSuccess(res, 200, { notification: retried });
    }),
  );

  return router;
}
