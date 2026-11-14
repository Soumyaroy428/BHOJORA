import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware, getAuthContext } from '../../middleware/auth';
import { createRequirePermissionMiddleware, getRbacContext } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { Permission } from '../rbac/rbac.policy';
import type { FinanceService } from './finance.service';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

export interface CreateFinanceRouterParams {
  identityService: IdentityService;
  financeService: FinanceService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createFinanceRouter(params: CreateFinanceRouterParams): Router {
  const { identityService, financeService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm);

  router.get(
    '/finance/refunds',
    requireAuth,
    requirePerm('finance:settlement:read'),
    wrapAsync(async (_req, res) => {
      const refunds = await financeService.getRefunds();
      sendSuccess(res, 200, { refunds });
    }),
  );

  router.post(
    '/finance/refunds',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const refund = await financeService.createRefundRequest(auth.userId, req.body);
      sendSuccess(res, 201, { refund });
    }),
  );

  router.post(
    '/finance/refunds/:refundId/approve',
    requireAuth,
    requirePerm('finance:refund:approve'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const refund = await financeService.approveRefund(
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        req.params['refundId'] as string,
        req.body,
      );
      sendSuccess(res, 200, { refund });
    }),
  );

  router.get(
    '/finance/settlement-batches',
    requireAuth,
    requirePerm('finance:settlement:read'),
    wrapAsync(async (_req, res) => {
      const batches = await financeService.listSettlementBatches();
      sendSuccess(res, 200, { batches });
    }),
  );

  router.post(
    '/finance/settlement-batches',
    requireAuth,
    requirePerm('finance:settlement:read'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const batch = await financeService.createSettlementBatch(
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        req.body,
      );
      sendSuccess(res, 201, { batch });
    }),
  );

  router.post(
    '/finance/reconciliations',
    requireAuth,
    requirePerm('finance:settlement:read'),
    wrapAsync(async (req, res) => {
      const ctx = getRbacContext(res);
      const reconciliation = await financeService.createPayoutReconciliation(
        ctx.userId,
        ctx.activeRole,
        ctx.mfaVerified,
        req.body,
      );
      sendSuccess(res, 201, { reconciliation });
    }),
  );

  router.get(
    '/finance/ledger',
    requireAuth,
    requirePerm('finance:settlement:read'),
    wrapAsync(async (_req, res) => {
      const entries = await financeService.listLedgerEntries();
      sendSuccess(res, 200, { entries });
    }),
  );

  router.get(
    '/finance/summary',
    requireAuth,
    requirePerm('finance:settlement:read'),
    wrapAsync(async (_req, res) => {
      const [refunds, batches, entries] = await Promise.all([
        financeService.getRefunds(),
        financeService.listSettlementBatches(),
        financeService.listLedgerEntries(),
      ]);
      sendSuccess(res, 200, { refunds, batches, entries });
    }),
  );

  return router;
}
