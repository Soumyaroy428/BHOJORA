import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware, getAuthContext } from '../../middleware/auth';
import type { IdentityService } from '../identity/identity.service';
import type { SupportService } from './support.service';
import type {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from './support.types';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

export interface CreateSupportRouterParams {
  identityService: IdentityService;
  supportService: SupportService;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createSupportRouter(params: CreateSupportRouterParams): Router {
  const { identityService, supportService, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);

  // Helper to extract customer display name
  const extractDisplayName = (req: Request): string => {
    const raw = req.body as Record<string, unknown> | undefined;
    if (
      raw &&
      typeof raw['customerDisplayName'] === 'string' &&
      raw['customerDisplayName'].trim()
    ) {
      return raw['customerDisplayName'].trim();
    }
    return 'Verified Diner';
  };

  const getPrimaryRole = (roles: string[]): string => {
    if (roles.includes('SUPER_ADMIN')) return 'SUPER_ADMIN';
    if (roles.includes('OPS_ADMIN')) return 'OPS_ADMIN';
    if (roles.includes('TRUST_ADMIN')) return 'TRUST_ADMIN';
    if (roles.includes('SUPPORT_AGENT')) return 'SUPPORT_AGENT';
    if (roles.includes('INSPECTION_REVIEWER')) return 'INSPECTION_REVIEWER';
    if (roles.includes('INSPECTOR')) return 'INSPECTOR';
    if (roles.includes('RESTAURANT_OWNER')) return 'RESTAURANT_OWNER';
    if (roles.includes('RESTAURANT_MANAGER')) return 'RESTAURANT_MANAGER';
    if (roles.includes('DELIVERY_PARTNER')) return 'DELIVERY_PARTNER';
    return roles[0] || 'CUSTOMER';
  };

  // ==========================================
  // REVIEWS ENDPOINTS
  // ==========================================

  // 1. Submit verified-order review (Customer only)
  router.post(
    '/support/reviews',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const displayName = extractDisplayName(req);
      const review = await supportService.submitOrderReview(auth.userId, displayName, req.body);
      sendSuccess(res, 201, { review });
    }),
  );

  // 2. Restaurant response to approved review (Restaurant owner only)
  router.post(
    '/support/reviews/:reviewId/response',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const review = await supportService.respondToReview(
        auth.userId,
        req.params['reviewId'] as string,
        req.body,
      );
      sendSuccess(res, 200, { review });
    }),
  );

  // 3. Moderate review (Admin only)
  router.patch(
    '/support/reviews/:reviewId/moderate',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const review = await supportService.moderateReview(
        auth.userId,
        req.params['reviewId'] as string,
        req.body,
      );
      sendSuccess(res, 200, { review });
    }),
  );

  // 4. Public outlet reviews summary & approved reviews list (Public, strictly privacy-safe)
  router.get(
    '/support/outlets/:outletId/reviews',
    wrapAsync(async (req, res) => {
      const limit = req.query['limit'] ? Number(req.query['limit']) : 50;
      const summary = await supportService.getPublicOutletReviewsSummary(
        req.params['outletId'] as string,
        limit,
      );
      sendSuccess(res, 200, { summary });
    }),
  );

  // ==========================================
  // FOOD SAFETY COMPLAINT ENDPOINTS
  // ==========================================

  const handleCreateSafetyComplaint = wrapAsync(async (req, res) => {
    const auth = getAuthContext(res);
    const displayName = extractDisplayName(req);
    const complaint = await supportService.submitSafetyComplaint(
      auth.userId,
      displayName,
      req.body,
    );
    sendSuccess(res, 201, { complaint });
  });

  // 5. Submit customer food safety complaint (Mapped on both /safety/complaints per OpenAPI and /support/complaints)
  router.post('/safety/complaints', requireAuth, handleCreateSafetyComplaint);
  router.post('/support/complaints', requireAuth, handleCreateSafetyComplaint);

  // 6. Submit restaurant explanation / corrective action (Restaurant owner only)
  router.post(
    '/support/complaints/:complaintId/explanation',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const complaint = await supportService.submitRestaurantComplaintExplanation(
        auth.userId,
        req.params['complaintId'] as string,
        req.body,
      );
      sendSuccess(res, 200, { complaint });
    }),
  );

  // 7. Restaurant outlet complaints view (Privacy-sanitized: customer PII stripped)
  router.get(
    '/support/outlets/:outletId/complaints',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const complaints = await supportService.getRestaurantComplaintsSanitized(
        auth.userId,
        req.params['outletId'] as string,
      );
      sendSuccess(res, 200, { complaints });
    }),
  );

  // 8. Customer's own filed complaints
  router.get(
    '/support/customer/complaints',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const complaints = await supportService.getCustomerComplaints(auth.userId);
      sendSuccess(res, 200, { complaints });
    }),
  );

  // 9. Admin resolve/dismiss safety complaint
  router.patch(
    '/support/complaints/:complaintId/resolve',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const complaint = await supportService.resolveComplaint(
        auth.userId,
        req.params['complaintId'] as string,
        req.body,
      );
      sendSuccess(res, 200, { complaint });
    }),
  );

  // 10. Outlet active safety investigation indicator (Public/Safe summary)
  router.get(
    '/support/outlets/:outletId/allegations/active',
    wrapAsync(async (req, res) => {
      const outletId = req.params['outletId'] as string;
      const hasActive = await supportService.hasActiveSafetyInvestigation(outletId);
      const activeCount = await supportService.getActiveAllegationCount(outletId);
      sendSuccess(res, 200, {
        outletId,
        hasActiveSafetyInvestigation: hasActive,
        activeSafetyInvestigationsCount: activeCount,
        disclaimer:
          'Customer allegations are unconfirmed until independent investigation is completed. Certified safety scores remain based on independent audit inspections.',
      });
    }),
  );

  // ==========================================
  // SUPPORT TICKETING & OPERATIONS (CP26)
  // ==========================================

  // 11. Canned response templates
  router.get(
    '/support/tickets/templates',
    requireAuth,
    wrapAsync(async (_req, res) => {
      const templates = supportService.getResponseTemplates();
      sendSuccess(res, 200, { templates });
    }),
  );

  // 12. Create support ticket
  router.post(
    '/support/tickets',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const displayName = extractDisplayName(req);
      const role = getPrimaryRole(auth.roles);
      const requester = {
        id: auth.userId,
        role,
        name: displayName,
      };
      const ticket = await supportService.createTicket(requester, req.body);
      sendSuccess(res, 201, { ticket });
    }),
  );

  // 13. List support tickets (with filters)
  router.get(
    '/support/tickets',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const role = getPrimaryRole(auth.roles);
      const filter = {
        status: req.query['status'] as SupportTicketStatus | undefined,
        priority: req.query['priority'] as SupportTicketPriority | undefined,
        category: req.query['category'] as SupportTicketCategory | undefined,
        isSafetyPriority:
          req.query['isSafetyPriority'] !== undefined
            ? req.query['isSafetyPriority'] === 'true'
            : undefined,
        assignedToAgentId: req.query['assignedToAgentId'] as string | undefined,
        requesterId: req.query['requesterId'] as string | undefined,
        outletId: req.query['outletId'] as string | undefined,
      };
      const tickets = await supportService.listTickets({ userId: auth.userId, role }, filter);
      sendSuccess(res, 200, { tickets, totalCount: tickets.length });
    }),
  );

  // 14. Get support ticket by ID
  router.get(
    '/support/tickets/:ticketId',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const role = getPrimaryRole(auth.roles);
      const ticket = await supportService.getTicketById(
        { userId: auth.userId, role },
        req.params['ticketId'] as string,
      );
      sendSuccess(res, 200, { ticket });
    }),
  );

  // 15. Assign support ticket
  router.post(
    '/support/tickets/:ticketId/assign',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const role = getPrimaryRole(auth.roles);
      const rawBody = req.body as Record<string, unknown> | undefined;
      const callerName =
        typeof rawBody?.['actorName'] === 'string' ? rawBody['actorName'] : 'Support Operator';
      const ticket = await supportService.assignTicket(
        { userId: auth.userId, role, name: callerName },
        req.params['ticketId'] as string,
        req.body,
      );
      sendSuccess(res, 200, { ticket });
    }),
  );

  // 16. Escalate support ticket
  router.post(
    '/support/tickets/:ticketId/escalate',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const role = getPrimaryRole(auth.roles);
      const rawBody = req.body as Record<string, unknown> | undefined;
      const callerName =
        typeof rawBody?.['actorName'] === 'string' ? rawBody['actorName'] : 'Support Operator';
      const ticket = await supportService.escalateTicket(
        { userId: auth.userId, role, name: callerName },
        req.params['ticketId'] as string,
        req.body,
      );
      sendSuccess(res, 200, { ticket });
    }),
  );

  // 17. Add ticket message or internal note
  router.post(
    '/support/tickets/:ticketId/messages',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const role = getPrimaryRole(auth.roles);
      const rawBody = req.body as Record<string, unknown> | undefined;
      const callerName =
        typeof rawBody?.['senderName'] === 'string'
          ? rawBody['senderName']
          : extractDisplayName(req);
      const ticket = await supportService.addTicketMessage(
        { userId: auth.userId, role, name: callerName },
        req.params['ticketId'] as string,
        req.body,
      );
      sendSuccess(res, 201, { ticket });
    }),
  );

  // 18. Resolve support ticket
  router.post(
    '/support/tickets/:ticketId/resolve',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const role = getPrimaryRole(auth.roles);
      const rawBody = req.body as Record<string, unknown> | undefined;
      const callerName =
        typeof rawBody?.['resolvedByName'] === 'string'
          ? rawBody['resolvedByName']
          : 'Support Specialist';
      const ticket = await supportService.resolveTicket(
        { userId: auth.userId, role, name: callerName },
        req.params['ticketId'] as string,
        req.body,
      );
      sendSuccess(res, 200, { ticket });
    }),
  );

  return router;
}
