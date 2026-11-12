import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AllergenCode, DietaryType } from '@bhojora/shared';
import type { AppConfig } from '../../config/env-types';
import { getRequestIdFromResponse, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import {
  createRequirePermissionMiddleware,
  resolveRbacRequestContext,
} from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { Permission } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { CatalogService } from './catalog.service';
import { ALLERGEN_CODES, DIETARY_TYPES } from './catalog.types';

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

function parsePublicMenuFilters(query: Request['query']): {
  dietaryType?: DietaryType;
  availableOnly?: boolean;
  excludeAllergens?: AllergenCode[];
} {
  let dietaryType: DietaryType | undefined;
  const rawDietary = query['dietary'];
  if (typeof rawDietary === 'string' && rawDietary.trim() !== '') {
    const normalized = rawDietary.trim().toUpperCase();
    if (!(DIETARY_TYPES as readonly string[]).includes(normalized)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Invalid dietary filter "${rawDietary}". Expected PURE_VEG, NON_VEG, or EGG`,
      );
    }
    dietaryType = normalized as DietaryType;
  }

  let excludeAllergens: AllergenCode[] | undefined;
  const rawExclude = query['excludeAllergen'];
  if (typeof rawExclude === 'string' && rawExclude.trim() !== '') {
    const parsed = rawExclude
      .split(',')
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean);
    for (const code of parsed) {
      if (!(ALLERGEN_CODES as readonly string[]).includes(code)) {
        throw new AppError(400, 'VALIDATION_ERROR', `Unknown allergen code "${code}"`);
      }
    }
    excludeAllergens = parsed as AllergenCode[];
  }

  return {
    ...(dietaryType ? { dietaryType } : {}),
    ...(query['availableOnly'] === 'true' ? { availableOnly: true } : {}),
    ...(excludeAllergens ? { excludeAllergens } : {}),
  };
}

export function createCatalogRouter(params: {
  identityService: IdentityService;
  catalogService: CatalogService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}): Router {
  const { identityService, catalogService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  router.get(
    '/outlets/:id/menu',
    wrapAsync(async (req, res) => {
      const filters = parsePublicMenuFilters(req.query);
      const catalog = await catalogService.getPublicOutletMenu(
        paramString(req.params['id']),
        filters,
      );
      sendSuccess(res, 200, { catalog });
    }),
  );

  router.get(
    '/restaurant/outlets/:outletId/menu',
    requireAuth,
    requirePerm('restaurant:outlet:read'),
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const result = await catalogService.listPartnerOutletCatalog({
        actorUserId: ctx.userId,
        actorRole: ctx.activeRole,
        mfaVerified: ctx.mfaVerified,
        outletId: paramString(req.params['outletId']),
        requestId: getRequestIdFromResponse(res),
      });
      sendSuccess(res, 200, result);
    }),
  );

  router.post(
    '/restaurant/menu/categories',
    requireAuth,
    requirePerm('restaurant:menu:manage'),
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const category = await catalogService.createCategory({
        actorUserId: ctx.userId,
        actorRole: ctx.activeRole,
        mfaVerified: ctx.mfaVerified,
        rawBody: req.body,
        requestId: getRequestIdFromResponse(res),
      });
      sendSuccess(res, 201, { category });
    }),
  );

  router.patch(
    '/restaurant/menu/categories/:categoryId',
    requireAuth,
    requirePerm('restaurant:menu:manage'),
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const category = await catalogService.updateCategory({
        categoryId: paramString(req.params['categoryId']),
        actorUserId: ctx.userId,
        actorRole: ctx.activeRole,
        mfaVerified: ctx.mfaVerified,
        rawBody: req.body,
        requestId: getRequestIdFromResponse(res),
      });
      sendSuccess(res, 200, { category });
    }),
  );

  router.post(
    '/restaurant/menu/items',
    requireAuth,
    requirePerm('restaurant:menu:manage'),
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const item = await catalogService.createMenuItem({
        actorUserId: ctx.userId,
        actorRole: ctx.activeRole,
        mfaVerified: ctx.mfaVerified,
        rawBody: req.body,
        requestId: getRequestIdFromResponse(res),
      });
      sendSuccess(res, 201, { item });
    }),
  );

  router.patch(
    '/restaurant/menu/items/:itemId',
    requireAuth,
    requirePerm('restaurant:menu:manage'),
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const item = await catalogService.updateMenuItem({
        itemId: paramString(req.params['itemId']),
        actorUserId: ctx.userId,
        actorRole: ctx.activeRole,
        mfaVerified: ctx.mfaVerified,
        rawBody: req.body,
        requestId: getRequestIdFromResponse(res),
      });
      sendSuccess(res, 200, { item });
    }),
  );

  router.patch(
    '/restaurant/menu/items/:itemId/availability',
    requireAuth,
    requirePerm('restaurant:menu:manage'),
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const item = await catalogService.updateItemAvailability({
        itemId: paramString(req.params['itemId']),
        actorUserId: ctx.userId,
        actorRole: ctx.activeRole,
        mfaVerified: ctx.mfaVerified,
        rawBody: req.body,
        requestId: getRequestIdFromResponse(res),
      });
      sendSuccess(res, 200, { item });
    }),
  );

  return router;
}
