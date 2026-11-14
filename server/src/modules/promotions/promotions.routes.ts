import { Router, type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from '../../config/env-types';
import { sendSuccess } from '../../contracts/api';
import { createRequireAuthMiddleware, getAuthContext } from '../../middleware/auth';
import { createRequirePermissionMiddleware } from '../../middleware/rbac';
import type { IdentityService } from '../identity/identity.service';
import type { Permission } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { PromotionsService } from './promotions.service';
import {
  createCampaignSchema,
  createPromotionCouponSchema,
  validateCouponSchema,
  applyReferralSchema,
  redeemPointsSchema,
  subscribeMembershipSchema,
} from './promotions.types';

function wrapAsync(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void handler(req, res).catch(next);
  };
}

export interface CreatePromotionsRouterParams {
  identityService: IdentityService;
  promotionsService: PromotionsService;
  rbacStore?: RbacStore;
  config: Pick<AppConfig, 'corsAllowedOrigins'>;
}

export function createPromotionsRouter(params: CreatePromotionsRouterParams): Router {
  const { identityService, promotionsService, rbacStore, config } = params;
  const router = Router();
  const requireAuth = createRequireAuthMiddleware(identityService, config.corsAllowedOrigins);
  const requirePerm = (perm: Permission) => createRequirePermissionMiddleware(perm, rbacStore);

  // 1. List Public Available Coupons (Transparent Terms)
  router.get(
    '/promotions/coupons',
    wrapAsync(async (_req, res) => {
      const coupons = await promotionsService.listPublicCoupons();
      sendSuccess(res, 200, { coupons });
    }),
  );

  // 2. Validate Coupon for Cart Subtotal (Budget, Eligibility & Abuse Controls)
  router.post(
    '/promotions/coupons/validate',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const validated = validateCouponSchema.parse(req.body);

      const result = await promotionsService.validateCoupon({
        code: validated.code,
        userId: auth.userId,
        subtotalPaise: validated.subtotalPaise,
        zoneId: validated.zoneId,
        isFirstOrder: validated.isFirstOrder,
      });

      sendSuccess(res, 200, result);
    }),
  );

  // 3. Admin Create Promotional Campaign
  router.post(
    '/admin/promotions/campaigns',
    requireAuth,
    requirePerm('audit:log:read'),
    wrapAsync(async (req, res) => {
      const validated = createCampaignSchema.parse(req.body);
      const campaign = await promotionsService.createCampaign(validated);
      sendSuccess(res, 201, { campaign });
    }),
  );

  // 4. Admin Create Promotional Coupon with Transparent Funding Terms
  router.post(
    '/admin/promotions/coupons',
    requireAuth,
    requirePerm('audit:log:read'),
    wrapAsync(async (req, res) => {
      const validated = createPromotionCouponSchema.parse(req.body);
      const coupon = await promotionsService.createCoupon(validated);
      sendSuccess(res, 201, { coupon });
    }),
  );

  // 5. Customer Referral Dashboard & Share Invite Code
  router.get(
    '/promotions/referral',
    requireAuth,
    wrapAsync(async (_req, res) => {
      const auth = getAuthContext(res);
      const referral = await promotionsService.getReferralInfo(auth.userId);
      sendSuccess(res, 200, { referral });
    }),
  );

  // 6. Referee Apply Invite Code (Abuse Protected)
  router.post(
    '/promotions/referral/apply',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const validated = applyReferralSchema.parse(req.body);
      const result = await promotionsService.applyReferralCode(auth.userId, validated.referralCode);
      sendSuccess(res, 200, result);
    }),
  );

  // 7. Customer Loyalty Account & Ledger
  router.get(
    '/promotions/loyalty',
    requireAuth,
    wrapAsync(async (_req, res) => {
      const auth = getAuthContext(res);
      const loyalty = await promotionsService.getLoyaltyAccount(auth.userId);
      sendSuccess(res, 200, { loyalty });
    }),
  );

  // 8. Redeem Loyalty Points on Checkout
  router.post(
    '/promotions/loyalty/redeem',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const validated = redeemPointsSchema.parse(req.body);
      const result = await promotionsService.redeemPoints(
        auth.userId,
        validated.pointsToRedeem,
        validated.cartSubtotalPaise,
      );
      sendSuccess(res, 200, result);
    }),
  );

  // 9. Customer Membership Club Status
  router.get(
    '/promotions/membership',
    requireAuth,
    wrapAsync(async (_req, res) => {
      const auth = getAuthContext(res);
      const membership = await promotionsService.getMembership(auth.userId);
      sendSuccess(res, 200, { membership });
    }),
  );

  // 10. Subscribe to Clean Dine Club Membership
  router.post(
    '/promotions/membership/subscribe',
    requireAuth,
    wrapAsync(async (req, res) => {
      const auth = getAuthContext(res);
      const validated = subscribeMembershipSchema.parse(req.body);
      const subscription = await promotionsService.subscribeMembership(
        auth.userId,
        validated.tier,
        validated.durationMonths,
      );
      sendSuccess(res, 201, { subscription });
    }),
  );

  return router;
}
