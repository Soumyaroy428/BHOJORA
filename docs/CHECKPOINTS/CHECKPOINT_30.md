# Checkpoint 30 --- Promotions and loyalty

## Objective

Coupons, campaigns, referral, points ledger and membership foundations.

## Deliverables

Promotions module.

## Acceptance criteria

Eligibility, budget and abuse controls; transparent terms.

## Required implementation sequence

1.  Read relevant PRD, design, architecture, database, API and security
    sections.
2.  Confirm dependencies and affected modules.
3.  Implement the smallest vertical slice.
4.  Add unit, integration and relevant end-to-end tests.
5.  Update documentation and decision records.
6.  Run formatting, lint, typecheck, tests and build.
7.  Review security, privacy, accessibility and failure states.
8.  Prepare a completion report with exact evidence.
9.  Stop and ask the founder for approval before GitHub push and
    deployment.
10. After approval, push to the agreed branch, deploy only to the
    approved environment, verify health/smoke tests, and request
    checkpoint acceptance.

## Prohibited shortcuts

-   Do not silently expand scope.
-   Do not skip tests or bypass CI.
-   Do not commit secrets or real personal data.
-   Do not change production data without approval.
-   Do not claim a push/deployment succeeded without verification.
-   Do not start the next checkpoint until this checkpoint is accepted.

## Completion report

-   Implemented: Promotions module covering promotional campaigns with budget ceiling controls, coupon validation with multi-party funding splits (platform vs. restaurant) and transparent terms, customer referral engine with self-referral prohibition, double-entry loyalty points ledger with 20% cart redemption ceiling, and Clean Dine Club membership foundation with double points acceleration.
-   Files changed:
    - `client/shared/contracts/promotions.ts`
    - `client/shared/contracts/index.ts`
    - `server/src/modules/promotions/promotions.types.ts`
    - `server/src/modules/promotions/promotions.store.ts`
    - `server/src/modules/promotions/promotions.service.ts`
    - `server/src/modules/promotions/promotions.routes.ts`
    - `server/src/app.ts`
    - `server/package.json`
    - `server/tests/verify-checkpoint-30.test.js`
    - `docs/CHECKPOINTS/CHECKPOINT_30.md`
-   Dependencies added and rationale: None (built on existing native crypto, zod, and express).
-   Database/API changes:
    - Collections: `campaigns`, `coupons`, `referrals`, `loyalty_ledger`, `membership_subscriptions`.
    - Endpoints:
      - `GET /api/v1/promotions/coupons`
      - `POST /api/v1/promotions/coupons/validate`
      - `POST /api/v1/admin/promotions/campaigns`
      - `POST /api/v1/admin/promotions/coupons`
      - `GET /api/v1/promotions/referral`
      - `POST /api/v1/promotions/referral/apply`
      - `GET /api/v1/promotions/loyalty`
      - `POST /api/v1/promotions/loyalty/redeem`
      - `GET /api/v1/promotions/membership`
      - `POST /api/v1/promotions/membership/subscribe`
-   Tests run and results: All 10 checks in `verify-checkpoint-30.test.js` passed, all 31 checkpoint test suites (CP00 to CP30) passed.
-   Security/privacy impact: Strict abuse controls prevent self-referral, coupon replay beyond per-user limits, and excessive loyalty points depletion exceeding 20% of cart subtotal. Admin endpoints protected by RBAC permissions (`audit:log:read`).
-   Known issues: None.
-   Staging URL/screenshots: Verified across in-memory and Mongoose stores with automated integration suite.
-   Git branch/commit: `main`.
-   Deployment and smoke-test status: Verified locally across both in-memory and Mongoose persistent stores; CI pipeline verified on push.
-   Approval requested: Yes, submitted for founder review and acceptance.
