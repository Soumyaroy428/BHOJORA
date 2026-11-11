import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { getRequestIdFromResponse, sendSuccess } from '../../contracts/api';
import {
  AUTH_COOKIE_NAMES,
  clearAuthCookies,
  createRequireAuthMiddleware,
  getAuthContext,
  parseCookies,
  setAuthCookies,
  verifyCookieCsrf,
} from '../../middleware/auth';
import type { IdentityService } from './identity.service';
import type { RequestMetadata } from './identity.types';

function extractRequestMeta(req: Request, res: Response): RequestMetadata {
  const deviceHeader = req.headers['x-device-name'];
  const uaHeader = req.headers['user-agent'];
  return {
    ipAddress: req.ip ?? req.socket.remoteAddress ?? '127.0.0.1',
    userAgent: typeof uaHeader === 'string' ? uaHeader : undefined,
    deviceName: typeof deviceHeader === 'string' ? deviceHeader : undefined,
    requestId: getRequestIdFromResponse(res),
  };
}

function shouldIssueSessionCookies(req: Request): boolean {
  const mode = req.headers['x-bhojora-session-mode'];
  if (mode === 'cookie') {
    return true;
  }
  const cookies = parseCookies(req.headers.cookie);
  return Boolean(cookies[AUTH_COOKIE_NAMES.refreshToken] || cookies[AUTH_COOKIE_NAMES.accessToken]);
}

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

export function createIdentityRouter(
  identityService: IdentityService,
  config: Pick<AppConfig, 'authCookieSecure' | 'corsAllowedOrigins'>,
): Router {
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  const deliverSession = (
    req: Request,
    res: Response,
    statusCode: number,
    payload: Awaited<ReturnType<IdentityService['login']>>,
  ): void => {
    if (shouldIssueSessionCookies(req)) {
      const csrfToken = setAuthCookies(res, payload.tokens, config);
      res.setHeader('X-Csrf-Token', csrfToken);
    }
    sendSuccess(res, statusCode, payload);
  };

  router.post(
    '/auth/register',
    wrapAsync(async (req, res) => {
      const payload = await identityService.register(req.body, extractRequestMeta(req, res));
      deliverSession(req, res, 201, payload);
    }),
  );

  router.post(
    '/auth/login',
    wrapAsync(async (req, res) => {
      const payload = await identityService.login(req.body, extractRequestMeta(req, res));
      deliverSession(req, res, 200, payload);
    }),
  );

  router.post(
    '/auth/otp/send',
    wrapAsync(async (req, res) => {
      const payload = await identityService.sendOtp(req.body, extractRequestMeta(req, res));
      sendSuccess(res, 200, payload);
    }),
  );

  router.post(
    '/auth/otp/verify',
    wrapAsync(async (req, res) => {
      const payload = await identityService.verifyOtp(req.body, extractRequestMeta(req, res));
      deliverSession(req, res, 200, payload);
    }),
  );

  router.post(
    '/auth/refresh',
    wrapAsync(async (req, res) => {
      const bodyToken =
        req.body && typeof req.body === 'object'
          ? (req.body as { refreshToken?: unknown }).refreshToken
          : undefined;
      let refreshToken = typeof bodyToken === 'string' ? bodyToken : undefined;

      if (!refreshToken) {
        const cookies = parseCookies(req.headers.cookie);
        const cookieRefresh = cookies[AUTH_COOKIE_NAMES.refreshToken];
        if (cookieRefresh) {
          verifyCookieCsrf(req, cookies, config.corsAllowedOrigins);
          refreshToken = cookieRefresh;
        }
      }

      const payload = await identityService.refreshSession(
        { refreshToken },
        extractRequestMeta(req, res),
      );
      deliverSession(req, res, 200, payload);
    }),
  );

  router.post(
    '/auth/logout',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      await identityService.logout(auth.sessionId);
      clearAuthCookies(res, config);
      sendSuccess(res, 200, { loggedOut: true, sessionId: auth.sessionId });
    }),
  );

  router.post(
    '/auth/logout-all',
    requireAuth,
    wrapAsync(async (_req, res) => {
      const auth = getAuthContext(res);
      const revokedCount = await identityService.logoutAll(auth.userId);
      clearAuthCookies(res, config);
      sendSuccess(res, 200, { loggedOutAll: true, revokedCount });
    }),
  );

  router.get(
    '/auth/sessions',
    requireAuth,
    wrapAsync(async (_req, res) => {
      const auth = getAuthContext(res);
      const sessions = await identityService.listSessions(auth.userId, auth.sessionId);
      sendSuccess(res, 200, { sessions });
    }),
  );

  router.delete(
    '/auth/sessions/:sessionId',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const sessionIdParam = req.params['sessionId'];
      const targetSessionId = Array.isArray(sessionIdParam)
        ? (sessionIdParam[0] ?? '')
        : (sessionIdParam ?? '');
      await identityService.revokeUserSession(auth.userId, targetSessionId);
      if (targetSessionId === auth.sessionId) {
        clearAuthCookies(res, config);
      }
      sendSuccess(res, 200, { revoked: true, sessionId: targetSessionId });
    }),
  );

  router.post(
    '/auth/forgot-password',
    wrapAsync(async (req, res) => {
      const payload = await identityService.forgotPassword(req.body, extractRequestMeta(req, res));
      sendSuccess(res, 200, payload);
    }),
  );

  router.post(
    '/auth/reset-password',
    wrapAsync(async (req, res) => {
      const payload = await identityService.resetPassword(req.body, extractRequestMeta(req, res));
      clearAuthCookies(res, config);
      sendSuccess(res, 200, payload);
    }),
  );

  router.get(
    '/users/me',
    requireAuth,
    wrapAsync(async (_req, res) => {
      const auth = getAuthContext(res);
      const profile = await identityService.getProfile(auth.userId);
      sendSuccess(res, 200, profile);
    }),
  );

  router.patch(
    '/users/me',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const profile = await identityService.updateProfile(auth.userId, req.body);
      sendSuccess(res, 200, profile);
    }),
  );

  router.post(
    '/auth/mfa/send',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const challenge = await identityService.sendSessionMfaChallenge(
        auth.userId,
        extractRequestMeta(req, res),
      );
      sendSuccess(res, 200, challenge);
    }),
  );

  router.post(
    '/auth/mfa/verify',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const result = await identityService.verifySessionMfa(
        auth.userId,
        auth.sessionId,
        req.body,
        extractRequestMeta(req, res),
      );
      sendSuccess(res, 200, result);
    }),
  );

  return router;
}
