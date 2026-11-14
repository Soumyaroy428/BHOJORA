import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendError, sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { AppError } from '../../middleware/error-handler';
import { resolveRbacRequestContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { UserRole } from '../identity/identity.types';
import type { RbacStore } from '../rbac/rbac.store';
import type { AiService } from './ai.service';
import {
  aiProposalQuerySchema,
  generateAiProposalSchema,
  reviewAiProposalSchema,
} from './ai.types';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

const ADMIN_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'OPS_ADMIN',
  'FINANCE_ADMIN',
  'TRUST_ADMIN',
];

const HUMAN_REVIEWER_ROLES: readonly UserRole[] = [
  'SUPER_ADMIN',
  'OPS_ADMIN',
  'TRUST_ADMIN',
  'INSPECTOR',
  'SUPPORT_AGENT',
  'RESTAURANT_OWNER',
  'RESTAURANT_MANAGER',
];

export interface CreateAiRouterParams {
  identityService: IdentityService;
  aiService: AiService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createAiRouter(params: CreateAiRouterParams): Router {
  const { identityService, aiService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  function requireAdminScope(req: Request, res: Response): void {
    const ctx = resolveRbacRequestContext(req, res);
    const hasAdminRole = ctx.roles.some((r) => ADMIN_ROLES.includes(r));
    if (!hasAdminRole) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Administrative privileges required to access AI metrics and configuration',
      );
    }
  }

  function requireReviewerScope(req: Request, res: Response): void {
    const ctx = resolveRbacRequestContext(req, res);
    const hasReviewerRole = ctx.roles.some((r) => HUMAN_REVIEWER_ROLES.includes(r));
    if (!hasReviewerRole) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Only authorized human personnel may approve or reject AI-generated proposals',
      );
    }
  }

  // 1. Generate an AI proposal (Assistive only - enters queue as PENDING_HUMAN_REVIEW)
  router.post(
    '/ai/generate',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const parsed = generateAiProposalSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid AI generation request',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        );
        return;
      }

      const ctx = resolveRbacRequestContext(req, res);
      const proposal = await aiService.generateProposal(parsed.data, ctx.userId);
      sendSuccess(res, 201, proposal);
    }),
  );

  // 2. Query AI proposals (filterable by taskType, status, targetId)
  router.get(
    '/ai/proposals',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const parsed = aiProposalQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid query parameters',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        );
        return;
      }

      const result = await aiService.listProposals(parsed.data);
      sendSuccess(res, 200, result);
    }),
  );

  // 3. Get aggregate evaluation metrics (accessible via /ai/metrics and /ai/evaluation-metrics)
  router.get(
    ['/ai/metrics', '/ai/evaluation-metrics'],
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireAdminScope(req, res);
      const metrics = await aiService.getEvaluationMetrics();
      sendSuccess(res, 200, metrics);
    }),
  );

  // 4. Get single AI proposal by ID
  router.get(
    '/ai/proposals/:proposalId',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      const proposalId = String(req.params.proposalId);
      const proposal = await aiService.getProposalById(proposalId);
      sendSuccess(res, 200, proposal);
    }),
  );

  // 5. Human-in-the-loop review (Approve or Reject with audit record)
  router.post(
    '/ai/proposals/:proposalId/review',
    requireAuth,
    wrapAsync(async (req: Request, res: Response) => {
      requireReviewerScope(req, res);
      const parsed = reviewAiProposalSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Invalid review payload',
          parsed.error.issues.map((i) => ({ field: i.path.join('.'), issue: i.message })),
        );
        return;
      }

      const ctx = resolveRbacRequestContext(req, res);
      const reviewerRole = ctx.activeRole || ctx.roles[0] || 'SUPER_ADMIN';
      const proposalId = String(req.params.proposalId);

      const updated = await aiService.reviewProposal(proposalId, parsed.data, {
        userId: ctx.userId,
        role: reviewerRole,
      });

      sendSuccess(res, 200, updated);
    }),
  );

  return router;
}
