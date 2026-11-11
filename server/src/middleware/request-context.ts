import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../config/logger';

const SAFE_REQUEST_ID_PATTERN = /^[a-zA-Z0-9._-]{8,64}$/;

export function resolveRequestId(rawHeader: string | string[] | undefined): string {
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (SAFE_REQUEST_ID_PATTERN.test(trimmed)) {
      return trimmed;
    }
  }
  return crypto.randomUUID();
}

export function createRequestContextMiddleware(logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    const startNs = process.hrtime.bigint();

    res.locals['requestId'] = requestId;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startNs) / 1_000_000;
      logger.info('http.request.completed', {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      });
    });

    next();
  };
}
