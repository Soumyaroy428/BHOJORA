import { Router, type NextFunction, type Request, type Response } from 'express';
import { sendError, sendSuccess } from '../../contracts/api';
import { AppError } from '../../middleware/error-handler';
import { KOLKATA_ZONE_IDS, type KolkataZoneId } from '../customer/customer.types';
import { SYSTEM_CLOCK, type Clock } from '../identity/identity.types';
import type { DiscoveryService } from './discovery.service';
import { DEFAULT_DISCOVERY_RATE_LIMIT, type DiscoveryRateLimitOptions } from './discovery.types';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

function getQueryString(raw: unknown): string | undefined {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (Array.isArray(raw) && typeof raw[0] === 'string') {
    const trimmed = raw[0].trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  return undefined;
}

function parseOptionalNumberQuery(raw: unknown, fieldName: string): number | undefined {
  const str = getQueryString(raw);
  if (str === undefined) {
    return undefined;
  }
  const num = Number(str);
  if (!Number.isFinite(num)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Query parameter ${fieldName} must be a finite number`,
    );
  }
  return num;
}

function parseOptionalBooleanQuery(raw: unknown, fieldName: string): boolean | undefined {
  const str = getQueryString(raw);
  if (str === undefined) {
    return undefined;
  }
  if (str === 'true') {
    return true;
  }
  if (str === 'false') {
    return false;
  }
  throw new AppError(400, 'VALIDATION_ERROR', `Query parameter ${fieldName} must be true or false`);
}

function parseOptionalCsvList(raw: unknown): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const values = Array.isArray(raw) ? raw : [raw];
  const tokens: string[] = [];
  for (const entry of values) {
    if (typeof entry !== 'string') {
      continue;
    }
    for (const part of entry.split(',')) {
      const clean = part.trim().toUpperCase();
      if (clean.length > 0) {
        tokens.push(clean);
      }
    }
  }
  return tokens.length > 0 ? tokens : undefined;
}

export function parseDiscoveryHttpQuery(query: Request['query']): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const q = getQueryString(query['q']);
  if (q !== undefined) {
    payload['q'] = q;
  }
  const zoneId = getQueryString(query['zoneId']);
  if (zoneId !== undefined) {
    payload['zoneId'] = zoneId;
  }
  const lng = parseOptionalNumberQuery(query['lng'], 'lng');
  if (lng !== undefined) {
    payload['lng'] = lng;
  }
  const lat = parseOptionalNumberQuery(query['lat'], 'lat');
  if (lat !== undefined) {
    payload['lat'] = lat;
  }
  const dietary = getQueryString(query['dietary']);
  if (dietary !== undefined) {
    payload['dietary'] = dietary.toUpperCase();
  }
  const excludeAllergens = parseOptionalCsvList(query['excludeAllergens']);
  if (excludeAllergens !== undefined) {
    payload['excludeAllergens'] = excludeAllergens;
  }
  const openNow = parseOptionalBooleanQuery(query['openNow'], 'openNow');
  if (openNow !== undefined) {
    payload['openNow'] = openNow;
  }
  const verifiedOnly = parseOptionalBooleanQuery(query['verifiedOnly'], 'verifiedOnly');
  if (verifiedOnly !== undefined) {
    payload['verifiedOnly'] = verifiedOnly;
  }
  const safetyStatus = getQueryString(query['safetyStatus']);
  if (safetyStatus !== undefined) {
    payload['safetyStatus'] = safetyStatus.toUpperCase();
  }
  const minSafetyScore = parseOptionalNumberQuery(query['minSafetyScore'], 'minSafetyScore');
  if (minSafetyScore !== undefined) {
    payload['minSafetyScore'] = minSafetyScore;
  }
  const maxPricePaise = parseOptionalNumberQuery(query['maxPricePaise'], 'maxPricePaise');
  if (maxPricePaise !== undefined) {
    payload['maxPricePaise'] = maxPricePaise;
  }
  const maxEtaMinutes = parseOptionalNumberQuery(query['maxEtaMinutes'], 'maxEtaMinutes');
  if (maxEtaMinutes !== undefined) {
    payload['maxEtaMinutes'] = maxEtaMinutes;
  }
  const maxDistanceMeters = parseOptionalNumberQuery(
    query['maxDistanceMeters'],
    'maxDistanceMeters',
  );
  if (maxDistanceMeters !== undefined) {
    payload['maxDistanceMeters'] = maxDistanceMeters;
  }
  const sort = getQueryString(query['sort']);
  if (sort !== undefined) {
    payload['sort'] = sort.toLowerCase();
  }
  const cursor = getQueryString(query['cursor']);
  if (cursor !== undefined) {
    payload['cursor'] = cursor;
  }
  const limit = parseOptionalNumberQuery(query['limit'], 'limit');
  if (limit !== undefined) {
    payload['limit'] = limit;
  }
  return payload;
}

class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly clock: Clock;

  constructor(options: DiscoveryRateLimitOptions, clock: Clock) {
    this.maxRequests = options.maxRequests;
    this.windowMs = options.windowMs;
    this.clock = clock;
  }

  checkAndRecord(key: string): { allowed: boolean; remaining: number; retryAfterSeconds: number } {
    const nowMs = this.clock.now().getTime();
    const cutoff = nowMs - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((ts) => ts > cutoff);

    if (recent.length >= this.maxRequests) {
      const oldestMs = recent[0] ?? nowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestMs + this.windowMs - nowMs) / 1000));
      this.hits.set(key, recent);
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    recent.push(nowMs);
    this.hits.set(key, recent);
    if (this.hits.size > 1000) {
      for (const [entryKey, timestamps] of this.hits.entries()) {
        if (timestamps.every((ts) => ts <= cutoff)) {
          this.hits.delete(entryKey);
        }
      }
    }

    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - recent.length),
      retryAfterSeconds: 0,
    };
  }
}

export function createDiscoveryRouter(params: {
  discoveryService: DiscoveryService;
  rateLimit?: DiscoveryRateLimitOptions;
  clock?: Clock;
}): Router {
  const { discoveryService } = params;
  const rateLimitConfig = params.rateLimit ?? DEFAULT_DISCOVERY_RATE_LIMIT;
  const clock = params.clock ?? SYSTEM_CLOCK;
  const limiter = new SlidingWindowRateLimiter(rateLimitConfig, clock);
  const router = Router();

  const enforceDiscoveryRateLimit = (req: Request, res: Response, next: NextFunction): void => {
    const subjectKey = req.ip || 'anonymous-client';
    const check = limiter.checkAndRecord(subjectKey);
    res.setHeader('X-RateLimit-Limit', String(rateLimitConfig.maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(check.remaining));
    if (!check.allowed) {
      res.setHeader('Retry-After', String(check.retryAfterSeconds));
      sendError(
        res,
        429,
        'RATE_LIMITED',
        'Too many discovery requests. Please wait before querying again.',
      );
      return;
    }
    next();
  };

  router.get(
    '/search',
    enforceDiscoveryRateLimit,
    wrapAsync(async (req, res) => {
      const queryInput = parseDiscoveryHttpQuery(req.query);
      const { payload, meta } = await discoveryService.search(queryInput);
      res.setHeader('Cache-Control', 'public, max-age=15');
      sendSuccess(res, 200, payload, meta);
    }),
  );

  router.get(
    '/categories',
    enforceDiscoveryRateLimit,
    wrapAsync(async (req, res) => {
      const zoneParam = getQueryString(req.query['zoneId']);
      if (
        zoneParam &&
        zoneParam !== 'all' &&
        !(KOLKATA_ZONE_IDS as readonly string[]).includes(zoneParam)
      ) {
        throw new AppError(400, 'VALIDATION_ERROR', `Unknown Kolkata zoneId: ${zoneParam}`);
      }
      const zoneId = zoneParam && zoneParam !== 'all' ? (zoneParam as KolkataZoneId) : undefined;
      const categories = await discoveryService.listCategories(zoneId);
      res.setHeader('Cache-Control', 'public, max-age=30');
      sendSuccess(res, 200, { categories });
    }),
  );

  router.get(
    '/restaurants',
    enforceDiscoveryRateLimit,
    wrapAsync(async (req, res) => {
      const queryInput = parseDiscoveryHttpQuery(req.query);
      const { restaurants, meta } = await discoveryService.listPublicRestaurants(queryInput);
      res.setHeader('Cache-Control', 'public, max-age=15');
      sendSuccess(res, 200, { restaurants }, meta);
    }),
  );

  return router;
}
