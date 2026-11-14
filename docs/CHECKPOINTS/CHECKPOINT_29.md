# Checkpoint 29 --- Notifications

## Objective

Push, email, SMS adapters, templates, consent, preferences, retries and
delivery logs.

## Deliverables

Notification service.

## Acceptance criteria

Retries idempotent; opt-out respected; no sensitive data in notification
body.

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

-   Implemented: Multi-channel notification service (SMS, Email, Push, In-App), localized templates (en-IN & bn-IN), strict PII sanitizer (masking cards, CVVs, passwords, auth tokens, bank accounts), user consent and opt-out preferences, idempotent retries with exponential backoff and Dead Letter Queue, in-app notification center with read states, and admin delivery logs.
-   Files changed:
    - `client/shared/contracts/notifications.ts`
    - `client/shared/contracts/index.ts`
    - `server/src/modules/notifications/notifications.types.ts`
    - `server/src/modules/notifications/notifications.adapters.ts`
    - `server/src/modules/notifications/notifications.store.ts`
    - `server/src/modules/notifications/notifications.service.ts`
    - `server/src/modules/notifications/notifications.routes.ts`
    - `server/src/app.ts`
    - `server/package.json`
    - `server/tests/verify-checkpoint-29.test.js`
    - `docs/CHECKPOINTS/CHECKPOINT_29.md`
-   Dependencies added and rationale: None (built on native crypto, zod, and express).
-   Database/API changes:
    - Collections: `notifications` and `notification_preferences`.
    - Endpoints:
      - `POST /api/v1/notifications/dispatch`
      - `GET /api/v1/notifications/me`
      - `PATCH /api/v1/notifications/:id/read`
      - `GET /api/v1/notifications/preferences`
      - `PATCH /api/v1/notifications/preferences`
      - `POST /api/v1/notifications/opt-out`
      - `GET /api/v1/notifications/logs`
      - `POST /api/v1/notifications/logs/:id/retry`
-   Tests run and results: All 10 checks in `verify-checkpoint-29.test.js` passed with 100% success; full test suite passing.
-   Security/privacy impact: Automatic PII sanitization prevents credentials, financial numbers, or tokens from reaching notification bodies. RBAC enforces least-privilege on admin delivery logs (`audit:log:read`).
-   Known issues: None.
-   Staging URL/screenshots: Staging test harness verified with simulated multi-channel adapters.
-   Git branch/commit: `main`.
-   Deployment and smoke-test status: Verified locally across in-memory and Mongoose stores; CI will run automated tests on push.
-   Approval requested: Yes, submitted for founder review and acceptance.
