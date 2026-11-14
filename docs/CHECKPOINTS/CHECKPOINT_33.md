# Checkpoint 33 --- Integration hardening

## Objective

Maps quotas/fallback, provider timeouts, queue retries, storage
scanning, webhook observability and optional ONDC feasibility.

## Deliverables

Resilient integration layer.

## Acceptance criteria

Provider failure tests; no false success; integration exit plans
documented.

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

-   **Implemented:**
    - Resilient circuit breaker mechanism (`CircuitBreaker`) governing all external providers (`CLOSED` -> `OPEN` -> `HALF_OPEN`) with fast-failing guards preventing false success.
    - Retry queue (`ResilientRetryQueue`) supporting exponential backoff with randomized jitter and Dead Letter Queue (DLQ) state transitions.
    - Maps resilience service (`MapsResilienceService`) tracking Google Maps API quotas and automatically failing over to an offline mathematical Haversine routing model calibrated for Kolkata urban transit.
    - Pre-upload storage validation and security scanner (`StorageScannerService`) validating MIME magic byte signatures (JPEG, PNG, PDF, WebP), rejecting empty or oversized files, filtering executable binary headers (Windows MZ PE, Linux ELF), detecting script tags (`<script>`, `javascript:`), and generating SHA-256 tamper-evident checksums.
    - Webhook observability and replay protection service (`WebhookObservabilityService`) with HMAC SHA-256 signature verification using constant-time comparison and idempotency deduplication.
    - Provider health and control REST API endpoints:
      - `GET /api/v1/integrations/health`: Circuit breaker states, quotas, fallback status, and DLQ summaries across all 6 providers.
      - `POST /api/v1/integrations/circuit-breaker/:provider/reset`: Admin control endpoint to reset tripped circuit breakers.
      - `POST /api/v1/integrations/maps/route`: Resilient routing with automatic offline fallback.
      - `POST /api/v1/integrations/storage/scan`: File security validation endpoint.
      - `GET /api/v1/integrations/dlq` & `POST /api/v1/integrations/dlq/:jobId/retry`: Dead letter queue inspection and reprocessing.
    - Comprehensive provider exit plans and ONDC Beckn protocol architecture feasibility study documented in `docs/03-SECURITY-QUALITY/INTEGRATION_EXIT_PLANS.md`.
-   **Files changed:**
    - `client/shared/contracts/integrations.ts`
    - `client/shared/contracts/index.ts`
    - `server/src/modules/integrations/circuit-breaker.ts`
    - `server/src/modules/integrations/retry-queue.ts`
    - `server/src/modules/integrations/maps-resilience.ts`
    - `server/src/modules/integrations/storage-scanner.ts`
    - `server/src/modules/integrations/webhook-observability.ts`
    - `server/src/modules/integrations/integrations.service.ts`
    - `server/src/modules/integrations/integrations.routes.ts`
    - `server/src/app.ts`
    - `server/package.json`
    - `server/tests/verify-checkpoint-33.test.js`
    - `docs/03-SECURITY-QUALITY/INTEGRATION_EXIT_PLANS.md`
    - `docs/CHECKPOINTS/CHECKPOINT_33.md`
-   **Dependencies added and rationale:** None (standard Node.js `crypto`, existing `zod`, `express`).
-   **Database/API changes:** New API endpoints mounted under `/api/v1/integrations/*`.
-   **Tests run and results:**
    - Unit & Integration verification suite (`verify-checkpoint-33.test.js`): 11/11 tests passed.
    - Full regression test suite (`npm test`): 34/34 test suites passed (CP00 through CP33).
    - Code quality checks: `npm run format:check` (100% Prettier compliant), `npm run lint` (0 errors), `npm run typecheck` (0 errors), `npm run build` (0 errors across 7 workspaces), `npm run security:secrets` (0 secrets detected across 370 files).
-   **Security/privacy impact:** Strict HMAC signature verification, constant-time comparisons, executable payload blocking, and zero vendor lock-in exit plans.
-   **Known issues:** None.
-   **Staging URL/screenshots:**
    - Admin Web: `https://bhojora-admin.vercel.app`
    - Partner Web: `https://restaurant-web-liard-seven.vercel.app`
    - Customer Web: `https://customer-web-phi-ten.vercel.app`
-   **Git branch/commit:** `main` / pending push.
-   **Deployment and smoke-test status:** Verified locally, ready for atomic commit and push.
-   **Approval requested:** Ready to commit and push Checkpoint 33 to `origin/main`.
