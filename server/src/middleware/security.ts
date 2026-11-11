import type { NextFunction, Request, Response } from 'express';
import { sendError } from '../contracts/api';

export function createSecurityHeadersMiddleware(isProduction: boolean) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');

    if (isProduction) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}

export function createCorsMiddleware(allowedOrigins: readonly string[]) {
  const allowlist = new Set(allowedOrigins);

  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');

    const originAllowed = typeof origin === 'string' && allowlist.has(origin);
    if (originAllowed && origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type,Authorization,X-Request-Id,Idempotency-Key,X-Csrf-Token,X-Requested-With,X-Bhojora-Session-Mode,X-Device-Name',
      );
      res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id,X-Csrf-Token');
    }

    if (req.method === 'OPTIONS') {
      if (typeof origin === 'string' && !originAllowed) {
        sendError(res, 403, 'FORBIDDEN', 'Origin is not permitted by CORS policy');
        return;
      }
      res.status(204).end();
      return;
    }

    next();
  };
}
