import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '../config/env-types';
import { AppError } from './error-handler';
import type { AuthenticatedContext, IdentityService } from '../modules/identity/identity.service';

export const AUTH_COOKIE_NAMES = {
  accessToken: 'bhojora_access',
  refreshToken: 'bhojora_refresh',
  csrfToken: 'bhojora_csrf',
} as const;

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }
  const parsed: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const rawValue = part.slice(idx + 1).trim();
    if (!key) {
      continue;
    }
    try {
      parsed[key] = decodeURIComponent(rawValue);
    } catch {
      parsed[key] = rawValue;
    }
  }
  return parsed;
}

export function setAuthCookies(
  res: Response,
  tokens: {
    accessToken: string;
    refreshToken: string;
    accessExpiresInSeconds: number;
    refreshExpiresInSeconds: number;
  },
  config: Pick<AppConfig, 'authCookieSecure'>,
): string {
  const csrfToken = crypto.randomBytes(24).toString('base64url');
  const secure = config.authCookieSecure;

  res.cookie(AUTH_COOKIE_NAMES.accessToken, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/v1',
    maxAge: tokens.accessExpiresInSeconds * 1000,
  });

  res.cookie(AUTH_COOKIE_NAMES.refreshToken, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
    maxAge: tokens.refreshExpiresInSeconds * 1000,
  });

  res.cookie(AUTH_COOKIE_NAMES.csrfToken, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: tokens.refreshExpiresInSeconds * 1000,
  });

  return csrfToken;
}

export function clearAuthCookies(res: Response, config: Pick<AppConfig, 'authCookieSecure'>): void {
  const secure = config.authCookieSecure;
  res.clearCookie(AUTH_COOKIE_NAMES.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/v1',
  });
  res.clearCookie(AUTH_COOKIE_NAMES.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/v1/auth',
  });
  res.clearCookie(AUTH_COOKIE_NAMES.csrfToken, {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
  });
}

export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }
  const [scheme, token] = authorizationHeader.split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token;
}

export function verifyCookieCsrf(
  req: Request,
  cookies: Record<string, string>,
  allowedOrigins: readonly string[],
): void {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return;
  }

  const origin = req.headers.origin;
  if (typeof origin === 'string' && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
    throw new AppError(403, 'FORBIDDEN', 'Origin rejected by CSRF policy');
  }

  const cookieCsrf = cookies[AUTH_COOKIE_NAMES.csrfToken];
  const headerCsrf = req.headers['x-csrf-token'];
  const normalizedHeader = Array.isArray(headerCsrf) ? headerCsrf[0] : headerCsrf;
  if (
    !cookieCsrf ||
    typeof normalizedHeader !== 'string' ||
    cookieCsrf.length !== normalizedHeader.length ||
    !crypto.timingSafeEqual(Buffer.from(cookieCsrf, 'utf8'), Buffer.from(normalizedHeader, 'utf8'))
  ) {
    throw new AppError(403, 'FORBIDDEN', 'Invalid or missing CSRF token for cookie session');
  }
}

export function getAuthContext(res: Response): AuthenticatedContext {
  const context = res.locals['auth'] as AuthenticatedContext | undefined;
  if (!context) {
    throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  }
  return context;
}

export function createRequireAuthMiddleware(
  identityService: IdentityService,
  allowedOrigins: readonly string[],
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const bearer = extractBearerToken(req.headers.authorization);
      if (bearer) {
        res.locals['auth'] = await identityService.verifyAccessToken(bearer);
        next();
        return;
      }

      const cookies = parseCookies(req.headers.cookie);
      const cookieToken = cookies[AUTH_COOKIE_NAMES.accessToken];
      if (!cookieToken) {
        throw new AppError(401, 'UNAUTHORIZED', 'Authentication token is required');
      }

      verifyCookieCsrf(req, cookies, allowedOrigins);
      res.locals['auth'] = await identityService.verifyAccessToken(cookieToken);
      next();
    } catch (error) {
      next(error);
    }
  };
}
