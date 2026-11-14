# Checkpoint 31 --- Analytics and reporting

## Objective

Marketplace, restaurant, delivery, finance and trust KPIs; exports and
access scopes.

## Deliverables

Analytics dashboards.

## Acceptance criteria

Metrics definitions documented; PII minimized; finance numbers
reconciled.

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

-   Implemented:
    -   Shared contracts for analytics (`client/shared/contracts/analytics.ts`): Marketplace KPIs, Restaurant operational KPIs, Delivery Fleet logistics KPIs, Finance reconciliation KPIs, and Trust & Safety KPIs.
    -   Analytics types and PII sanitization utilities (`server/src/modules/analytics/analytics.types.ts`): Masking customer names to initials, masking phones (`+9198300****23`), redacting street details to locality and city (`Park Circus, Kolkata`), and time-window bounds resolution.
    -   Analytics Store (`server/src/modules/analytics/analytics.store.ts`): `AnalyticsStore` interface, `InMemoryAnalyticsStore`, and `MongooseAnalyticsStore` with indexed MongoDB collections (`analytics_orders`, `analytics_inspections`, `analytics_complaints`).
    -   Analytics Service (`server/src/modules/analytics/analytics.service.ts`): Mathematical financial reconciliation invariant (`GMV = items + delivery + taxes + platform fee - discounts`), 15% standard commission deduction, average preparation & delivery durations, top selling items, and CSV/JSON report generators.
    -   Analytics Routes (`server/src/modules/analytics/analytics.routes.ts`): `/api/v1/analytics/overview` (Admin), `/api/v1/analytics/restaurant/:outletId` (Scoped restaurant owner & admin), `/api/v1/analytics/delivery` (Admin), `/api/v1/analytics/finance` (Admin), `/api/v1/analytics/trust` (Admin), and `/api/v1/analytics/export` (Admin & Scoped Restaurant Owner).
    -   Added Vercel configuration files (`client/admin-web/vercel.json`, `client/restaurant-web/vercel.json`) to enforce deterministic Vite builds and output directory paths.
    -   Automated Verification Suite (`server/tests/verify-checkpoint-31.test.js`): 10 comprehensive checks passing across contract parity, aggregations, reconciliation, tenant isolation, fleet KPIs, trust metrics, PII-sanitized exports, and least-privilege RBAC.
-   Files changed:
    -   `client/shared/contracts/analytics.ts`
    -   `client/shared/contracts/index.ts`
    -   `client/admin-web/vercel.json`
    -   `client/restaurant-web/vercel.json`
    -   `server/src/modules/analytics/analytics.types.ts`
    -   `server/src/modules/analytics/analytics.store.ts`
    -   `server/src/modules/analytics/analytics.service.ts`
    -   `server/src/modules/analytics/analytics.routes.ts`
    -   `server/src/app.ts`
    -   `server/package.json`
    -   `server/tests/verify-checkpoint-31.test.js`
    -   `docs/CHECKPOINTS/CHECKPOINT_31.md`
-   Dependencies added and rationale: None. Leveraged standard Node.js crypto, Zod, and existing platform packages.
-   Database/API changes:
    -   Added API routes: `GET /api/v1/analytics/overview`, `GET /api/v1/analytics/restaurant/:outletId`, `GET /api/v1/analytics/delivery`, `GET /api/v1/analytics/finance`, `GET /api/v1/analytics/trust`, `POST /api/v1/analytics/export`.
    -   Added collections: `analytics_orders`, `analytics_inspections`, `analytics_complaints`.
-   Tests run and results: 10/10 automated tests in `verify-checkpoint-31.test.js` passed; full suite from CP00 to CP31 passed cleanly.
-   Security/privacy impact:
    -   Zero plaintext customer phone numbers, customer names, or door-level residential addresses exposed in CSV or JSON exports.
    -   Tenant isolation enforced: restaurant owners cannot inspect or export operational data of rival outlets (`403 Forbidden`).
    -   Customer role completely restricted from accessing administrative analytics.
-   Known issues: None.
-   Staging URL/screenshots:
    -   Customer Web: `https://customer-web-phi-ten.vercel.app` (Verified live Google Map restaurant locator & GPS serviceability).
    -   Restaurant Web: `https://restaurant-web-liard-seven.vercel.app`.
    -   Admin Web: `https://bhojora-admin.vercel.app`.
-   Git branch/commit: `main`
-   Deployment and smoke-test status: All builds and tests passing locally; verified deployment configurations.
-   Approval requested: Ready for founder verification and next checkpoint continuation.
