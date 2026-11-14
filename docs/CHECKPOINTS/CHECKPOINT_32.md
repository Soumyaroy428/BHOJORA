# Checkpoint 32 --- AI assistance

## Objective

Recommendation baseline, complaint classification, report summaries,
image risk flags and human review.

## Deliverables

AI adapter and review UI.

## Acceptance criteria

Model outputs labelled; human approval mandatory for safety findings;
evaluation recorded.

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
    - Shared contracts for AI assistive operations (`AiTaskType`, `AiProposalStatus`, `AiModelInfo`, `HumanReviewAudit`, `AiProposalDto`, `GenerateAiProposalRequestDto`, `ReviewAiProposalRequestDto`, `AiEvaluationMetricsDto`).
    - AI provider adapter layer with `DeterministicAiAdapter` (handling `RECOMMENDATION_BASELINE`, `COMPLAINT_CLASSIFICATION`, `REPORT_SUMMARY`, `IMAGE_RISK_FLAG`, `DEMAND_FORECAST`) and `FallbackAiAdapter` providing local resilience fallback upon upstream failure.
    - Full implementation of Story F13.1: computer vision hygiene pattern risk detection for kitchen photos (`OPEN_CONTAINER`, `MISSING_PPE`, `SURFACE_GREASE`) with mandatory human review and confidence scoring.
    - AI proposal persistent stores: `InMemoryAiStore` and `MongooseAiStore` mapping to `ai_proposals` MongoDB collection.
    - Service layer enforcing strict Human-in-the-Loop invariant: all AI generations start strictly in `PENDING_HUMAN_REVIEW` status and cannot self-certify or mutate safety scores directly.
    - REST API endpoints:
      - `POST /api/v1/ai/generate`: Assistive generation with prompt hashing and model provenance.
      - `GET /api/v1/ai/proposals`: Filterable queue of proposals.
      - `GET /api/v1/ai/proposals/:proposalId`: Proposal detail inspection.
      - `POST /api/v1/ai/proposals/:proposalId/review`: Human approval / rejection gate recording reviewer ID, role, and audit notes.
      - `GET /api/v1/ai/metrics`: Evaluation metrics tracking acceptance rates and task breakdowns.
    - Admin Web UI: `AiReviewDashboard` component integrated into the control plane with model labeling, confidence chips, review actions, and evaluation metrics.
-   **Files changed:**
    - `client/shared/contracts/ai.ts`
    - `client/shared/contracts/index.ts`
    - `client/admin-web/src/components/AiReviewDashboard.tsx`
    - `client/admin-web/src/App.tsx`
    - `server/src/modules/ai/ai.types.ts`
    - `server/src/modules/ai/ai.adapter.ts`
    - `server/src/modules/ai/ai.store.ts`
    - `server/src/modules/ai/ai.service.ts`
    - `server/src/modules/ai/ai.routes.ts`
    - `server/src/app.ts`
    - `server/package.json`
    - `server/tests/verify-checkpoint-32.test.js`
    - `docs/CHECKPOINTS/CHECKPOINT_32.md`
-   **Dependencies added and rationale:** None (standard Node.js `crypto`, existing `zod`, `express`, `mongoose`).
-   **Database/API changes:** New collection `ai_proposals` and API endpoints under `/api/v1/ai/*`.
-   **Tests run and results:**
    - Unit & Integration verification suite (`verify-checkpoint-32.test.js`): 11/11 tests passed.
    - Full regression test suite (`npm test`): 33/33 test suites passed (CP00 through CP32).
    - Code quality checks: `npm run format:check` (100% Prettier compliant), `npm run lint` (0 errors), `npm run typecheck` (0 errors), `npm run build` (0 errors across 7 workspaces), `npm run security:secrets` (0 secrets detected).
-   **Security/privacy impact:** Strict RBAC enforcement; AI outputs can never execute state mutations or modify safety scores without human verification.
-   **Known issues:** None.
-   **Staging URL/screenshots:**
    - Admin Web: `https://bhojora-admin.vercel.app`
    - Partner Web: `https://restaurant-web-liard-seven.vercel.app`
    - Customer Web: `https://customer-web-phi-ten.vercel.app`
-   **Git branch/commit:** `main` / pending push.
-   **Deployment and smoke-test status:** Verified locally, ready for atomic commit and push.
-   **Approval requested:** Ready to commit and push Checkpoint 32 to `origin/main`.
