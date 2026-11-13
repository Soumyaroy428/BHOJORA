import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { InspectorService } from '../inspector/inspector.service';
import type { InspectionService } from './inspection.service';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

export interface CreateInspectionRouterParams {
  identityService: IdentityService;
  inspectorService: InspectorService;
  inspectionService: InspectionService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createInspectionRouter(params: CreateInspectionRouterParams): Router {
  const { identityService, inspectorService, inspectionService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  // Helper to resolve the authenticated user's inspector profile ID
  async function resolveInspectorId(userId: string): Promise<string> {
    const profile = await inspectorService.getOwnProfile(userId);
    return profile.id;
  }

  // 1. Start / Schedule a new Inspection audit
  router.post(
    '/inspections',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const inspectorId = await resolveInspectorId(ctx.userId);
      const inspection = await inspectionService.createInspection(inspectorId, req.body);
      sendSuccess(res, 201, { inspection });
    }),
  );

  // 2. Fetch assigned inspections for authenticated inspector
  router.get(
    '/inspections/assigned',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const inspectorId = await resolveInspectorId(ctx.userId);
      const inspections = await inspectionService.getAssignedInspections(inspectorId);
      sendSuccess(res, 200, { inspections });
    }),
  );

  // 3. Get single inspection details (enforces privacy boundary)
  router.get(
    '/inspections/:id',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      let inspectorId = '';
      try {
        inspectorId = await resolveInspectorId(ctx.userId);
      } catch {
        // May be an admin or reviewer without an inspector profile
      }
      const inspection = await inspectionService.getInspection(
        inspectorId,
        req.params['id'] as string,
        ctx.roles,
      );
      sendSuccess(res, 200, { inspection });
    }),
  );

  // 4. Save offline / incremental draft findings
  router.patch(
    '/inspections/:id/draft',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const inspectorId = await resolveInspectorId(ctx.userId);
      const inspection = await inspectionService.saveDraft(
        inspectorId,
        req.params['id'] as string,
        req.body,
      );
      sendSuccess(res, 200, { inspection });
    }),
  );

  // 5. Upload evidence with SHA-256 integrity hash
  router.post(
    '/inspections/:id/evidence',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const inspectorId = await resolveInspectorId(ctx.userId);
      const evidence = await inspectionService.uploadEvidence(
        inspectorId,
        req.params['id'] as string,
        req.body,
      );
      sendSuccess(res, 201, { evidence });
    }),
  );

  // 6. Private evidence retrieval
  router.get(
    '/inspections/:id/evidence/:evidenceId',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      let inspectorId = '';
      try {
        inspectorId = await resolveInspectorId(ctx.userId);
      } catch {
        // Admin or reviewer
      }
      const evidence = await inspectionService.getEvidence(
        inspectorId,
        req.params['id'] as string,
        req.params['evidenceId'] as string,
        ctx.roles,
      );
      sendSuccess(res, 200, { evidence });
    }),
  );

  // 7. Submit completed inspection to reviewer queue (validates required evidence)
  router.post(
    '/inspections/:id/submit',
    requireAuth,
    wrapAsync(async (req, res) => {
      const ctx = resolveRbacRequestContext(req, res);
      const inspectorId = await resolveInspectorId(ctx.userId);
      const inspection = await inspectionService.submitInspection(
        inspectorId,
        req.params['id'] as string,
        req.body,
      );
      sendSuccess(res, 200, { inspection });
    }),
  );

  return router;
}
