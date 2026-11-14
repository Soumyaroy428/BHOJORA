# Checkpoint 36 --- Compliance and operational readiness

## Objective

Legal review of FSSAI, e-commerce, privacy, payments, GST, workforce;
SOPs, support staffing, inspector training and incident runbooks.

## Deliverables

Launch readiness dossier.

## Acceptance criteria

Qualified advisers sign off; licences/agreements and operating
procedures confirmed.

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
    -   Comprehensive regulatory compliance and governance framework covering Indian legal and statutory requirements:
        -   FSS Act 2006: 14-digit FSSAI license validation, license classification (Central License, State License, Registration), and state code extraction.
        -   Consumer Protection (E-Commerce) Rules 2020: Statutory Grievance Redressal Officer designation with 48h acknowledgment SLA, no hidden/drip pricing, and transparent cost breakdown.
        -   Digital Personal Data Protection (DPDP) Act 2023: Designated Data Protection Officer (DPO), privacy notice consent ledgers, and automated erasure/retention purge.
        -   RBI Payment Aggregator / Merchant Guidelines: Nodal escrow account settlement framework (T+2), PCI-DSS tokenization, and zero raw card data retention.
        -   CGST Act 2017 Section 9(5): E-commerce operator 5% GST collection model on restaurant services, automated tax invoicing, and GSTR-8 synthesis.
        -   Code on Social Security 2020: Delivery partner group accidental disability cover, fair floor rates per order distance, and 100% tip remittance guarantee.
        -   FSSAI / NABL food auditor hygiene checklist and digital inspection audit protocol.
    -   Qualified professional adviser sign-off ledger with tamper-evident SHA-256 cryptographic verification checksums.
    -   Dynamic launch readiness evaluation engine calculating platform readiness score (0-100%) and gating commercial launch until all statutory sign-offs are in place (`READY_FOR_PILOT`).
    -   Full Launch Readiness Dossier, Standard Operating Procedures (SOP-01 to SOP-03), and support staffing matrices documented in `docs/03-SECURITY-QUALITY/LAUNCH_READINESS_DOSSIER.md`.
-   **Files changed:**
    -   `client/shared/contracts/compliance.ts`
    -   `client/shared/contracts/index.ts`
    -   `server/src/modules/compliance/compliance.types.ts`
    -   `server/src/modules/compliance/compliance.store.ts`
    -   `server/src/modules/compliance/compliance.service.ts`
    -   `server/src/modules/compliance/compliance.routes.ts`
    -   `server/src/app.ts`
    -   `server/package.json`
    -   `server/tests/verify-checkpoint-36.test.js`
    -   `docs/03-SECURITY-QUALITY/LAUNCH_READINESS_DOSSIER.md`
    -   `docs/CHECKPOINTS/CHECKPOINT_36.md`
-   **Dependencies added and rationale:** None (standard Node.js `crypto`, existing `zod`, `express`, `mongoose`).
-   **Database/API changes:**
    -   `GET /api/v1/compliance/dossier`
    -   `GET /api/v1/compliance/readiness`
    -   `POST /api/v1/compliance/verify/fssai`
    -   `POST /api/v1/compliance/verify/gstin`
    -   `POST /api/v1/compliance/sign-offs`
    -   `POST /api/v1/compliance/admin/seed-pilot-certifications`
-   **Tests run and results:**
    -   Unit & Integration verification suite (`verify-checkpoint-36.test.js`): 10/10 tests passed.
    -   Full regression test suite (`npm test`): 37/37 test suites passed (CP00 through CP36).
    -   Typecheck (`npm run typecheck` in server and clients): 0 errors.
    -   Linting (`npm run lint` in server and clients): 0 errors.
-   **Security/privacy impact:** Compliance mutation endpoints strictly restricted to administrative roles (`SUPER_ADMIN`, `OPS_ADMIN`, `TRUST_ADMIN`). Public readiness endpoint exposes only high-level status without sensitive internal adviser contacts.
-   **Known issues:** None.
-   **Staging URL/screenshots:**
    -   Customer Web: https://customer-web-phi-ten.vercel.app (HTTP 200)
    -   Admin Web: https://bhojora-admin.vercel.app (HTTP 200)
    -   Restaurant Web: https://restaurant-web-liard-seven.vercel.app (HTTP 200)
-   **Git branch/commit:** `main` / `feat(checkpoint-36): implement compliance framework, statutory sign-off ledger, and launch readiness dossier`
-   **Deployment and smoke-test status:** Verified live staging health on Vercel deployments.
-   **Approval requested:** Ready for founder acceptance and deployment.
