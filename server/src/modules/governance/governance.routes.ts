import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware } from '../../middleware/auth';
import { createRequirePermissionMiddleware, getRbacContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { UserRole, AccountStatus } from '../identity/identity.types';
import type { ProposalStatus } from '@bhojora/shared';
import type { Permission } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { GovernanceService } from './governance.service';
import {
  updateEntityStatusSchema,
  proposeConfigChangeSchema,
  reviewConfigProposalSchema,
  auditSearchQuerySchema,
  toPlatformConfigDto,
  toConfigChangeProposalDto,
} from './governance.types';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

export interface CreateGovernanceRouterParams {
  identityService: IdentityService;
  governanceService: GovernanceService;
  rbacStore: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createGovernanceRouter(params: CreateGovernanceRouterParams): Router {
  const { identityService, governanceService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  // 1. Admin Dashboard Overview KPIs
  router.get(
    '/admin/overview',
    requireAuth,
    requirePerm('audit:log:read'),
    wrapAsync(async (_req, res) => {
      const overview = await governanceService.getDashboardOverview();
      sendSuccess(res, 200, overview);
    }),
  );

  // 2. User Account Governance
  router.get(
    '/admin/users',
    requireAuth,
    requirePerm('audit:log:read'),
    wrapAsync(async (req, res) => {
      const role = typeof req.query.role === 'string' ? (req.query.role as UserRole) : undefined;
      const status =
        typeof req.query.status === 'string' ? (req.query.status as AccountStatus) : undefined;
      const search = req.query.search as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;
      const result = await governanceService.listUsers({ role, status, search, limit, offset });
      sendSuccess(res, 200, result);
    }),
  );

  router.patch(
    '/admin/users/:userId/status',
    requireAuth,
    requirePerm('system:admin:override'),
    wrapAsync(async (req, res) => {
      const body = updateEntityStatusSchema.parse(req.body);
      const rbac = getRbacContext(res);
      const updated = await governanceService.setUserStatus({
        actorId: rbac.userId,
        actorRole: rbac.activeRole,
        targetUserId: req.params['userId'] as string,
        status: body.status,
        reason: body.reason,
        requestId: req.header('x-request-id') ?? undefined,
      });
      sendSuccess(res, 200, { user: updated });
    }),
  );

  // 3. Restaurant Outlet Governance
  router.get(
    '/admin/outlets',
    requireAuth,
    requirePerm('ops:outlet:manage'),
    wrapAsync(async (req, res) => {
      const status = req.query.status as string | undefined;
      const zoneId = req.query.zoneId as string | undefined;
      const result = await governanceService.listOutlets({ status, zoneId });
      sendSuccess(res, 200, result);
    }),
  );

  router.patch(
    '/admin/outlets/:outletId/status',
    requireAuth,
    requirePerm('ops:outlet:manage'),
    wrapAsync(async (req, res) => {
      const body = updateEntityStatusSchema.parse(req.body);
      const rbac = getRbacContext(res);
      const updated = await governanceService.setOutletStatus({
        actorId: rbac.userId,
        actorRole: rbac.activeRole,
        outletId: req.params['outletId'] as string,
        status: body.status,
        reason: body.reason,
        requestId: req.header('x-request-id') ?? undefined,
      });
      sendSuccess(res, 200, { outlet: updated });
    }),
  );

  // 4. Delivery Partner Governance
  router.get(
    '/admin/partners',
    requireAuth,
    requirePerm('ops:outlet:manage'),
    wrapAsync(async (req, res) => {
      const status = req.query.status as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const skip = req.query.skip ? Number(req.query.skip) : undefined;
      const result = await governanceService.listPartners({ status, limit, skip });
      sendSuccess(res, 200, result);
    }),
  );

  router.patch(
    '/admin/partners/:partnerId/status',
    requireAuth,
    requirePerm('ops:outlet:manage'),
    wrapAsync(async (req, res) => {
      const body = updateEntityStatusSchema.parse(req.body);
      const rbac = getRbacContext(res);
      const updated = await governanceService.setPartnerStatus({
        actorId: rbac.userId,
        actorRole: rbac.activeRole,
        partnerId: req.params['partnerId'] as string,
        status: body.status,
        reason: body.reason,
        requestId: req.header('x-request-id') ?? undefined,
      });
      sendSuccess(res, 200, { partner: updated });
    }),
  );

  // 5. Audit Search & Log Explorer
  router.get(
    '/admin/audit-logs',
    requireAuth,
    requirePerm('audit:log:read'),
    wrapAsync(async (req, res) => {
      const query = auditSearchQuerySchema.parse(req.query);
      const result = await governanceService.searchAuditLogs(query);
      sendSuccess(res, 200, result);
    }),
  );

  // 6. Platform Configuration & Two-Person Approval
  router.get(
    '/admin/config',
    requireAuth,
    requirePerm('audit:log:read'),
    wrapAsync(async (_req, res) => {
      const configRecord = await governanceService.getPlatformConfig();
      sendSuccess(res, 200, { config: toPlatformConfigDto(configRecord) });
    }),
  );

  router.post(
    '/admin/config/proposals',
    requireAuth,
    requirePerm('ops:outlet:manage'),
    wrapAsync(async (req, res) => {
      const body = proposeConfigChangeSchema.parse(req.body);
      const rbac = getRbacContext(res);
      const proposal = await governanceService.proposeConfigChange({
        actorId: rbac.userId,
        actorRole: rbac.activeRole,
        proposedChanges: body.proposedChanges,
        reason: body.reason,
        requestId: req.header('x-request-id') ?? undefined,
      });
      sendSuccess(res, 201, { proposal: toConfigChangeProposalDto(proposal) });
    }),
  );

  router.get(
    '/admin/config/proposals',
    requireAuth,
    requirePerm('audit:log:read'),
    wrapAsync(async (req, res) => {
      const status =
        typeof req.query.status === 'string' ? (req.query.status as ProposalStatus) : undefined;
      const proposals = await governanceService.listConfigProposals(status);
      sendSuccess(res, 200, {
        proposals: proposals.map((p) => toConfigChangeProposalDto(p)),
      });
    }),
  );

  router.post(
    '/admin/config/proposals/:proposalId/review',
    requireAuth,
    requirePerm('system:admin:override'),
    wrapAsync(async (req, res) => {
      const body = reviewConfigProposalSchema.parse(req.body);
      const rbac = getRbacContext(res);
      const result = await governanceService.reviewConfigProposal({
        actorId: rbac.userId,
        actorRole: rbac.activeRole,
        proposalId: req.params['proposalId'] as string,
        decision: body.decision,
        reason: body.reason,
        requestId: req.header('x-request-id') ?? undefined,
      });
      sendSuccess(res, 200, {
        proposal: toConfigChangeProposalDto(result.proposal),
        config: result.config ? toPlatformConfigDto(result.config) : undefined,
      });
    }),
  );

  return router;
}
