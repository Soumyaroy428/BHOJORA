# Checkpoint 20 --- Tracking and proof

## Objective

Active delivery GPS, customer map, pickup/drop OTP, proof, exception and
incident flows.

## Deliverables

Live tracking and delivery completion.

## Acceptance criteria

Location only during disclosed active delivery; spoof/invalid OTP cases
tested.

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

- **Implemented:**
  1. Active delivery GPS streaming with strict privacy boundaries: Location pings (`POST /delivery/assignments/:id/location`) permitted *only* during active disclosed delivery (`shiftStatus === 'ON_DELIVERY'` and `status === 'ACCEPTED'`). Offline or unassigned pings reject with 403 Forbidden.
  2. Geographic service boundary validation locking coordinates to Kolkata limits (`[88.0..88.6, 22.3..22.8]`).
  3. Trip execution state machine transitions (`ACCEPTED -> ARRIVED_AT_PICKUP -> CONFIRMED_PICKUP -> ARRIVED_AT_DROP -> COMPLETED`) with 409 conflict detection on out-of-order calls.
  4. Automatic Order status sync: `CONFIRMED_PICKUP` transitions order to `OUT_FOR_DELIVERY`.
  5. 4-Digit Handover OTP verification: Invalid OTPs reject with 400 Validation Error; exceeding 5 failed attempts triggers an automated anti-spoof rate-limit lockout (`429 RATE_LIMITED`).
  6. Successful OTP verification: Transitions Order to `DELIVERED`, Assignment to `COMPLETED`, returns Rider to `ONLINE`, increments `totalDeliveries`, and credits guaranteed payout.
  7. Exception & Incident Reporting (`POST /delivery/assignments/:id/incidents`) for `CUSTOMER_UNREACHABLE`, `ADDRESS_INCORRECT`, `RESTAURANT_DELAY`, `VEHICLE_BREAKDOWN`, `ACCIDENT`, `ORDER_SPILLAGE`.
  8. Customer Live Tracking endpoint (`GET /delivery/orders/:id/live-tracking`) streaming pickup/drop, active rider coordinates, and customer delivery OTP; stops coordinate streaming once delivered/cancelled.
  9. Mobile Delivery app UI with active trip controls, step buttons, 4-digit OTP input, incident modal, and GPS privacy indicators (`client/delivery-mobile/src/App.tsx`).
  10. Full verification suite with 10 passing tests (`server/tests/verify-checkpoint-20.test.js`).
- **Files changed:**
  - `client/shared/contracts/delivery.ts`
  - `server/src/modules/delivery/delivery.types.ts`
  - `server/src/modules/delivery/delivery.store.ts`
  - `server/src/modules/delivery/delivery.service.ts`
  - `server/src/modules/delivery/delivery.routes.ts`
  - `server/src/app.ts`
  - `client/delivery-mobile/src/App.tsx`
  - `server/package.json`
  - `server/tests/verify-checkpoint-20.test.js`
  - `docs/01-CORE-PLANNING-DESIGN/ADRS.md`
  - `docs/01-CORE-PLANNING-DESIGN/openapi.json`
  - `docs/03-SECURITY-QUALITY/AUTH.md`
  - `docs/CHECKPOINTS/CHECKPOINT_20.md`
- **Dependencies added and rationale:** None. All models and libraries built upon native modular monolith primitives.
- **Database/API changes:**
  - Added `delivery_location_events` collection with `eventId`, `assignmentId`, `orderId`, `partnerId`, `coordinates`, `speedKmph`, `headingDegrees`, `recordedAt`.
  - Added `delivery_incidents` collection with `incidentId`, `assignmentId`, `orderId`, `partnerId`, `incidentType`, `description`, `coordinates`, `status`, `reportedAt`.
  - Endpoints added:
    - `POST /api/v1/delivery/assignments/:assignmentId/location`
    - `POST /api/v1/delivery/assignments/:assignmentId/arrive-pickup`
    - `POST /api/v1/delivery/assignments/:assignmentId/confirm-pickup`
    - `POST /api/v1/delivery/assignments/:assignmentId/arrive-drop`
    - `POST /api/v1/delivery/assignments/:assignmentId/complete`
    - `POST /api/v1/delivery/assignments/:assignmentId/incidents`
    - `GET /api/v1/delivery/assignments/:assignmentId/incidents`
    - `GET /api/v1/delivery/orders/:orderId/live-tracking`
- **Tests run and results:**
  - `server/tests/verify-checkpoint-20.test.js`: 10/10 tests passed (100% success).
  - All checkpoint test suites (CP01 - CP20): All 21 test suites passed.
- **Security/privacy impact:** Strict location streaming boundary (only while on an active disclosed delivery, stopped post-delivery), anti-spoof OTP lockout (5 failed attempts maximum), and encrypted/sanitized exception logs.
- **Known issues:** None.
- **Staging URL/screenshots:** Customer Web (`https://customer-web-phi-ten.vercel.app`), Restaurant Web (`https://restaurant-web-liard-seven.vercel.app`), Admin Web (`https://bhojora-admin.vercel.app`).
- **Git branch/commit:** `main`
- **Deployment and smoke-test status:** Verified locally with full suite; ready for push and redeploy.
- **Approval requested:** Yes.
