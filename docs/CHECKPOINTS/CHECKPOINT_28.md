# Checkpoint 28 --- Admin governance

## Objective

Admin dashboards, user/restaurant/partner management, configuration
approvals, audit search.

## Deliverables

Admin console.

## Acceptance criteria

Least privilege and reason capture; sensitive actions audited.

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

-   Implemented: Admin governance dashboard, user/restaurant/partner status lifecycle management with mandatory justification reason (>= 8 chars), self-suspension prohibition, platform configuration proposal and two-person review rule, and immutable audit search query engine.
-   Files changed:
    - `client/shared/contracts/governance.ts`
    - `client/shared/contracts/index.ts`
    - `server/src/modules/identity/identity.types.ts`
    - `server/src/modules/identity/identity.models.ts`
    - `server/src/modules/restaurant/restaurant.types.ts`
    - `server/src/modules/restaurant/restaurant.store.ts`
    - `server/src/modules/rbac/rbac.store.ts`
    - `server/src/modules/governance/governance.types.ts`
    - `server/src/modules/governance/governance.store.ts`
    - `server/src/modules/governance/governance.service.ts`
    - `server/src/modules/governance/governance.routes.ts`
    - `server/src/app.ts`
    - `client/admin-web/src/components/AdminGovernanceDashboard.tsx`
    - `client/admin-web/src/App.tsx`
    - `server/tests/verify-checkpoint-28.test.js`
    - `server/package.json`
    - `docs/01-CORE-PLANNING-DESIGN/ADRS.md`
-   Dependencies added and rationale: None (reused existing Zod, Express 5, React, Mongoose).
-   Database/API changes:
    - Added collections: `platform_configs`, `config_change_proposals`.
    - Endpoints mounted at `/api/v1/admin/*`:
      - `GET /admin/overview`
      - `GET /admin/users`
      - `PATCH /admin/users/:userId/status`
      - `GET /admin/outlets`
      - `PATCH /admin/outlets/:outletId/status`
      - `GET /admin/partners`
      - `PATCH /admin/partners/:partnerId/status`
      - `GET /admin/audit-logs`
      - `GET /admin/config`
      - `POST /admin/config/proposals`
      - `GET /admin/config/proposals`
      - `POST /admin/config/proposals/:proposalId/review`
-   Tests run and results:
    - `server/tests/verify-checkpoint-28.test.js`: 10/10 checks passed.
    - Full test suite: 29/29 suites passed (CP00 through CP28).
-   Security/privacy impact:
    - Least privilege enforced with RBAC and step-up MFA.
    - Two-person rule prevents single administrator from unilateral emergency config shifts.
    - Self-suspension prohibition guarantees administrative oversight cannot be deadlocked.
    - All governance actions append immutable records to `audit_logs`.
-   Known issues: None.
-   Staging URL/screenshots: Local verification running at `http://127.0.0.1:4028`; admin console integrated in `client/admin-web`.
-   Git branch/commit: `main`
-   Deployment and smoke-test status: Verified locally, CI pipeline passing.
-   Approval requested: Approved by founder to commit, push, and verify live redeployment.
