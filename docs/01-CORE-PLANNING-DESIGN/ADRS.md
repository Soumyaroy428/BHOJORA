# BHOJORA — Architecture Decision Records (ADRs)

This document contains the authoritative Architecture Decision Records (ADRs) governing the technical foundation, boundary isolation, data integrity, and security policies of the BHOJORA ecosystem.

---

## ADR-001: Modular Monolith Architecture over Premature Microservices

### Status: ACCEPTED (Locked Baseline)

### Context
Building a multi-sided food delivery platform with 6 client applications (Customer Web, Customer Mobile, Restaurant Web, Delivery Mobile, Inspector Mobile, Admin Web) requires rapid feature cohesion, transactional data consistency, and low operational overhead during the initial Kolkata launch. Introducing distributed microservices prematurely creates operational complexity (distributed tracing, network latency, saga transactions, eventual consistency failures in cart/checkout, high cloud costs).

### Decision
We adopt a **Modular Monolith** architecture for the core backend:
1. **Single Deployable Unit:** All 13 business domains are housed in `server/src/modules/` within a single codebase.
2. **Strict Module Encapsulation:** Modules interact **only** through exported domain service interfaces or asynchronous domain events. Direct database queries across module boundaries are strictly forbidden.
3. **Dedicated Process Decoupling:** Background worker queues (`BullMQ` on `Redis`) and real-time WebSocket gateways (`Socket.IO`) can be scaled as separate Node.js processes using the exact same codebase and module definitions.

### Consequences
- **Positive:** Maximum developer velocity, simplified local development, zero inter-service network latency for synchronous business flows, straightforward ACID transactions via MongoDB where required.
- **Negative:** Shared database infrastructure requires disciplined index management; high-traffic domains (e.g., location tracking) must be monitored closely to avoid CPU/memory starvation on web threads.

---

## ADR-002: MongoDB + Mongoose as Exclusive Persistence Engine

### Status: ACCEPTED (Locked Baseline)

### Context
Food delivery catalogs require dynamic nested schemas (modifiers, allergen tags, add-on groups, variable pricing). Inspection checklists require versioned hierarchical question trees and cryptographically hashed evidence arrays. Furthermore, Kolkata delivery zone serviceability demands high-performance geospatial queries (`2dsphere` polygon intersections).

### Decision
We standardize strictly on **MongoDB + Mongoose**:
1. **No Dual ORM:** Mongoose is the sole persistence tool. Dual usage of Prisma and Mongoose is strictly prohibited without explicit founder approval.
2. **Geospatial Indexing:** Every outlet and delivery zone utilizes standard GeoJSON `Point` and `Polygon` schemas indexed with `2dsphere`.
3. **Normalized vs. Embedded Data Boundary:**
   - *Normalized (References):* Independently managed entities (Users, Outlets, Menus, Orders, Inspection Reports).
   - *Embedded (Documents):* Bounded sub-entities modified only in tandem with the parent (Order Items in Order, Customization Options in Menu Item, Checklist Answers in Inspection).

### Consequences
- **Positive:** Flexible catalog modeling, native GeoJSON geospatial operators, efficient read performance for public menus and audit histories.
- **Negative:** Requires disciplined schema validation via Mongoose middleware and Zod boundary checks to prevent data drift.

---

## ADR-003: Currency Stored Strictly as Integer Paise (INR)

### Status: ACCEPTED (Locked Baseline)

### Context
Floating-point arithmetic in software (`0.1 + 0.2 = 0.30000000000000004`) introduces rounding errors in tax calculations, restaurant commission payouts, partner delivery incentives, and payment gateway reconciliation.

### Decision
All financial quantities in BHOJORA are stored, calculated, and transmitted as **integer paise** (`1 INR = 100 paise`):
1. **Database Schema:** Money fields use `Number` typed as integers (e.g., `itemPricePaise: 35000` for ₹350.00). Floating-point values in financial fields are rejected at the database validation layer.
2. **Server-Side Authoritative Quotes:** The client never computes prices, taxes, or discounts. The server generates an authoritative quote (`quoteId`) valid for 10 minutes.
3. **Display Formatting:** Conversion to rupees with decimal formatting (`₹350.00`) occurs solely at the UI presentation boundary via shared `PriceDisplay` components.

### Consequences
- **Positive:** Zero financial rounding drift; 100% exact reconciliation against payment gateway settlements down to the single paisa.
- **Negative:** Developers must consistently remember that all monetary API fields and calculation functions operate in integer paise.

---

## ADR-004: Outbox Pattern & Asynchronous Event Processing

### Status: ACCEPTED (Locked Baseline)

### Context
Critical state transitions (e.g., order payment confirmed) require secondary side-effects: dispatching job offers to delivery partners, triggering audio chimes on restaurant kitchen boards, notifying customers via FCM/SMS, and updating analytics counters. Executing these synchronously in the HTTP request lifecycle slows response times and risks partial failures if an external provider (e.g., SMS gateway) is down.

### Decision
We implement the **Transactional Outbox Pattern** with **BullMQ on Redis**:
1. When a state mutation occurs (e.g., `Order.state -> CONFIRMED`), an event record is written within the same database transaction to the `outbox_events` collection.
2. A lightweight background poller/worker dispatches events to Redis queues (`orders.events`, `dispatch.events`, `notifications.events`).
3. Workers consume events with exponential backoff retries and Dead Letter Queue (DLQ) support. All consumers must be strictly **idempotent**.

### Consequences
- **Positive:** P95 response times under 150ms for mutating APIs; zero lost events during third-party notification outages.
- **Negative:** Requires Redis operational health monitoring and idempotency checks in all worker handlers.

---

## ADR-005: Independent Inspection Governance & Tamper-Evident Evidence

### Status: ACCEPTED (Locked Baseline)

### Context
Consumer trust in BHOJORA hinges on the integrity of the kitchen verification engine. If restaurant owners can purchase scores, if inspectors can approve their own reports, or if audit photos can be tampered with, the platform loses its differentiated value proposition.

### Decision
1. **Separation of Duties:** Inspectors can **never** self-approve inspection reports. All submitted reports enter the `Bhojora Control` Reviewer Queue, requiring sign-off from an independent reviewer.
2. **Critical Violation Override:** Critical hygiene violations (e.g., active pest infestation in cooking zone, raw meat cross-contamination, non-potable water) immediately trigger a `CRITICAL_VIOLATION_OVERRIDE`, setting the score to 0 and suspending the outlet regardless of other category scores.
3. **Tamper-Evident Hashing:** The inspector mobile app computes SHA-256 hashes of all audit photos on-device alongside GPS coordinates ($\le 50\text{m}$ geofence) and UTC timestamps before uploading to S3 storage.
4. **Statutory Non-Representation:** All trust profiles explicitly state that platform assessments are independent private evaluations and **never** statutory FSSAI government certifications.

### Consequences
- **Positive:** Incorruptible, legally sound, evidence-backed trust profiles that consumers and regulators can rely on.
- **Negative:** Slightly longer turnaround for publishing audit scores due to the mandatory human reviewer gate.

---

## ADR-006: Idempotent Webhooks & Replay Protection

### Status: ACCEPTED (Locked Baseline)

### Context
Indian payment gateways (Razorpay, Cashfree, PayU) and SMS delivery aggregators utilize asynchronous webhooks. Networks inevitably deliver duplicate webhooks or deliver them out-of-order, risking duplicate order confirmations or double refunds.

### Decision
1. **Idempotency Key Verification:** All payment and financial mutation endpoints require a unique `Idempotency-Key` header or verify provider transaction IDs against the `idempotency_keys` collection.
2. **HMAC Signature Validation:** Webhooks without valid cryptographic HMAC SHA-256 signatures matching the configured gateway secret are immediately rejected with HTTP 401.
3. **State Machine Locking:** State transitions are guarded by atomic MongoDB conditional updates (e.g., update from `AWAITING_PAYMENT` to `CONFIRMED` succeeds exactly once; subsequent updates return HTTP 200 without re-executing business logic).

### Consequences
- **Positive:** 100% protection against financial double-credits and duplicate order creation.
- **Negative:** Requires disciplined payload caching and signature verification middleware for every external webhook endpoint.

---

## ADR-007: Four-Tier Data Classification & Privacy Architecture

### Status: ACCEPTED (Locked Baseline)

### Context
To ensure strict compliance with India's Digital Personal Data Protection (DPDP) Act and protect customer privacy, data must be classified and handled according to its sensitivity level.

### Decision
We establish a **Four-Tier Data Classification Model**:
- **Tier 1 (Public Transparency Data):** Restaurant profiles, published inspection scores, public kitchen photos, menu titles, prices. Accessible without authentication; cached on CDN.
- **Tier 2 (Internal Operational Data):** Order metadata, dispatch logs, internal staff task lists, anonymized delivery route coordinates. Scoped via RBAC.
- **Tier 3 (Protected PII):** Customer phone numbers, delivery addresses, inspector personal identity details, delivery partner KYC. Encrypted at rest; masked in logs and phone call proxies (rider sees masked virtual number, not customer's personal mobile).
- **Tier 4 (Restricted Financial & Auth Credentials):** Password hashes (Argon2id), session tokens, bank account details for settlement, webhook secret salts. Zero storage of raw credit/debit card numbers (delegated entirely to RBI-authorized payment aggregator tokenization).

### Consequences
- **Positive:** Complete compliance with Indian privacy laws and minimization of customer PII exposure.
- **Negative:** Requires strict logging sanitation filters and virtual proxy numbers for delivery communications.

---

## ADR-008: Pinned Node 22 LTS Runtime, npm Workspaces & Automated CI Pipeline

### Status: ACCEPTED (Locked Baseline — Checkpoint 04)

### Context
Multiple web apps, Expo mobile apps, shared contracts, and modular monolith backend services require deterministic local tooling, strict type checking, formatting, linting, automated secret scanning, and continuous integration without prematurely bundling heavy framework dependencies before their assigned checkpoints.

### Decision
1. **Pinned Runtime & Package Manager:** Standardize on **Node.js `22.21.0` LTS** (`.nvmrc`, `.node-version`) and **npm `11.12.1`** (`packageManager` + `engines` in `package.json`), utilizing `npm ci` in GitHub Actions.
2. **Strict Quality Tooling:** Enforce `tsconfig.base.json` (`strict: true`, `noUncheckedIndexedAccess: true`), ESLint flat config (`eslint.config.mjs`), and Prettier (`.prettierrc.json`) across shared packages and backend code.
3. **Zero Premature Runtime Bloat:** Install only checkpoint-scoped tooling dependencies during Checkpoint 04; forbid Express, Mongoose, Next.js, Redis, or React runtime installation until their respective checkpoints.
4. **Automated Secret Scanning:** Enforce repo-level forbidden file and credential pattern detection (`npm run security:secrets`) alongside `npm audit --audit-level=high` on every PR and push to `main`.

### Consequences
- **Positive:** Reproducible builds across Windows developer workstations and Linux CI runners; early detection of type drift and accidental credential commits.
- **Negative:** Requires updating workspace lists and ESLint overrides explicitly as new web/mobile apps bootstrap in later checkpoints.

---

## ADR-009: Express API Bootstrap, Fail-Fast Zod Config & Structured Tier-Safe Logging

### Status: ACCEPTED (Locked Baseline — Checkpoint 05)

### Context
Starting Checkpoint 05, the backend API foundation requires HTTP request correlation, strict environment validation, standardized error envelopes matching OpenAPI 3.1.0, liveness/readiness probes for container orchestrators, and logging compliant with DPDP Tier 3 PII masking and Tier 4 secret protection (`ADR-007`).

### Decision
1. **Fail-Fast Zod Config (`server/src/config/env.ts`):** Validate all required environment variables (`MONGODB_URI`, `REDIS_URL`, distinct `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` >= 32 chars, valid IANA timezone, production placeholder & CORS checks) via `Zod` at startup, throwing `ConfigValidationError` without printing secret values.
2. **Modular Express App Factory (`server/src/app.ts`):** Separate Express pipeline assembly (`createApp`) from TCP port binding (`server/src/index.ts`) so HTTP integration tests bind isolated ephemeral loopback ports cleanly without external runtime frameworks.
3. **Request Correlation & Tier-Safe JSON Logging (`server/src/middleware/request-context.ts`, `server/src/config/logger.ts`):** Validate inbound `X-Request-Id` or generate UUID v4, emit UTC JSON logs with recursive redaction of sensitive keys (`password`, `token`, `otp`, `secret`, `phone`, `email`, URI credentials), and suppress stack traces in HTTP error payloads (`server/src/middleware/error-handler.ts`).
4. **Health & Readiness Split (`server/src/modules/health/`):** Expose `/api/v1/health` (liveness) and `/api/v1/ready` (async dependency & graceful-shutdown readiness returning HTTP `503 SERVICE_UNAVAILABLE` when degraded).

### Consequences
- **Positive:** Safe zero-leak startup failures, deterministic HTTP error contracts matching `ErrorResponse`, and test-ready graceful shutdown handling prior to Checkpoint 06 database wiring.
- **Negative:** Dependent downstream checkpoints (MongoDB, Redis) must register readiness probes into `createApp({ readinessProbes })` during bootstrap.

---

## ADR-010: Mongoose Connection Resilience, Schema Conventions & Idempotent Index/Seed Strategy

### Status: ACCEPTED (Locked Baseline — Checkpoint 06)

### Context
Checkpoint 06 introduces MongoDB persistence via Mongoose (`ADR-002`) across an ecosystem that stores integer paise (`ADR-003`), GeoJSON delivery polygons, immutable safety/payment events, and sensitive connection credentials (`ADR-007`).

### Decision
1. **Isolated Connection Lifecycle (`server/src/database/connection.ts`):** Manage MongoDB connectivity through `mongoose.createConnection()` with bounded timeouts, retry backoff, sanitized URI logging (`sanitizeMongoUri`), graceful shutdown disconnect hooks, and a live `/api/v1/ready` `mongodb` readiness probe (`503 SERVICE_UNAVAILABLE` on disconnect or failed ping).
2. **Enforced Schema Conventions (`server/src/database/conventions.ts`):** Standardize UTC timestamps, `strict: true`, integer `paiseField`, GeoJSON `Point`/`Polygon` validation, and Mongoose middleware blocking `updateOne`/`deleteOne` on append-only collections.
3. **Repository & Transaction Boundary (`server/src/database/repository.ts`):** Expose typed `BaseRepository` with cursor pagination (`_id` lookahead `limit + 1`), atomic conditional updates (`findOneAndUpdate`), and `withTransaction` session lifecycle helpers.
4. **Declarative Indexes & Synthetic Seeds (`server/src/database/indexes.ts`, `server/src/database/seed.ts`):** Disable `autoIndex` in `production`, manage repeatable indexes through idempotent `createIndexes` specs, and guard `$setOnInsert` seeds against destructive production runs or PII inclusion.

### Consequences
- **Positive:** Repeatable multi-environment index builds, deterministic failure behavior when MongoDB is unreachable, and consistent domain isolation across future feature modules.
- **Negative:** Production deployments must run `npm run db:indexes --workspace=server` cleanly during release automation before enabling traffic.

---

## ADR-011: Identity Cryptography (`scrypt`), Rotating Refresh Tokens, Origin-Bound OTP & Immediate Session Revocation

### Status: ACCEPTED (Locked Baseline — Checkpoint 07)

### Context
Checkpoint 07 establishes identity, session lifecycle, OTP verification, and password recovery (`AUTH.md`) in a Windows/Linux TypeScript workspace constrained against unverified native addons and required to enforce immediate session revocation, brute-force resistance, CSRF protection for cookie transports, and zero credential/OTP logging.

### Decision
1. **PHC `scrypt` Password Hashing (`server/src/modules/identity/identity.crypto.ts`):** Hash passwords using Node.js built-in `crypto.scrypt` (`N=16384`, `r=8`, `p=1`, `keyLen=64`) encoded as PHC strings (`$scrypt$n=16384,r=8,p=1$<salt>$<hash>`) with timing-safe verification and dummy verification against timing-based user enumeration.
2. **HS256 JWT Access Tokens with Live Session Revocation (`server/src/modules/identity/identity.service.ts`, `server/src/middleware/auth.ts`):** Issue short-lived (`900s`) HS256 JWTs carrying `sub` and `sid`, verified on every protected request against persistent session state (`revokedAt == null && expiresAt > now`) so logout, `logout-all`, session deletion, and password reset invalidate access immediately.
3. **Rotating Refresh Tokens & Reuse Family Revocation:** Persist hashed opaque refresh tokens on `user_sessions` alongside `previousRefreshTokenHash` and atomic conditional rotation; replaying a prior refresh token immediately revokes the session (`REFRESH_TOKEN_REPLAY_DETECTED`) and returns `401 UNAUTHORIZED`.
4. **Origin-Bound Pluggable OTP Adapter (`server/src/modules/identity/otp.adapter.ts`):** Store OTP and recovery secrets strictly as keyed hashes in `auth_challenges`, throttle sends/attempts in `auth_rate_limits`, bind SMS bodies with WebOTP final line `@<appOriginHost> #<otp>`, and prohibit plaintext OTPs or phone numbers from logs (`SafeLogOtpSenderAdapter` + `logger.ts` redaction).
5. **Cookie + CSRF Dual Transport (`server/src/middleware/auth.ts`):** Support Bearer token headers cleanly for mobile/API clients and `HttpOnly`, `SameSite=Lax`, `Secure` cookies paired with double-submit `bhojora_csrf` + `X-Csrf-Token` header verification for mutating cookie-authenticated requests.

### Consequences
- **Positive:** Zero external C++ native-build dependencies, deterministic time-controlled verification tests (`Clock` injection), and immediate revocation guarantees across all clients.
- **Negative:** Protected endpoints incur one indexed session lookup per authenticated request (or future read-through cache backed by session revocation events in later scalability phases).

---

## ADR-012: Role-Based Access Control, Multi-Tenant Outlet Isolation & Privileged Step-Up MFA

### Status: ACCEPTED (Locked Baseline — Checkpoint 08)

### Context
Checkpoint 08 requires least-privilege RBAC across 12 platform/partner/customer roles (`AUTH.md`), strict restaurant/outlet tenant isolation preventing cross-outlet data leaks, IDOR defense on customer and rider records, strict segregation of duties across Trust vs. Finance vs. Inspection Review workflows, and mandatory MFA verification on privileged operations.

### Decision
1. **Shared Permission Matrix (`client/shared/contracts/rbac.ts`, `server/src/modules/rbac/rbac.policy.ts`):** Define 28 explicit permissions and bind each of the 12 `USER_ROLES` to an immutable least-privilege matrix; `FINANCE_ADMIN` excludes `safety:score:publish`, `TRUST_ADMIN` excludes `finance:settlement:read`/`finance:refund:approve`, and `INSPECTOR` excludes `inspection:approve`.
2. **Explicit Active Role Context (`server/src/middleware/rbac.ts`):** Resolve optional `X-Bhojora-Active-Role` strictly against `user.roles` persisted on the database user record (`403 FORBIDDEN` on unassigned claims), ensuring multi-role accounts operate within an explicit authorization boundary.
3. **Session-Bound Step-Up MFA Policy (`POST /auth/mfa/send`, `POST /auth/mfa/verify`):** Bind MFA assurance to `user_sessions.mfaVerifiedAt` rather than permanent user flags; requests acting under any privileged role (`INSPECTION_REVIEWER`, `OPS_ADMIN`, `TRUST_ADMIN`, `FINANCE_ADMIN`, `SUPER_ADMIN`) without verified session MFA are rejected with `403 FORBIDDEN` (`MFA_REQUIRED`).
4. **Tenant Memberships & Resource Ownership Guards:** Scope partner access against `restaurant_staff` memberships (`restaurantId` + `outletId` / wildcard `'*'`), block cross-customer (`IDOR`) and cross-rider reads, forbid `SELF_APPROVAL_PROHIBITED` when an inspection reviewer authored the report, and record authorization decisions in append-only `audit_logs`.

### Consequences
- **Positive:** Eliminates horizontal IDOR, cross-outlet leaks, privilege escalation, and unverified privileged mutations behind composable Express middleware and testable pure policy guards.
- **Negative:** Privileged operators must verify a second-factor session OTP after initial password login before executing administrative mutations.

---

## ADR-013: Customer Profile Ownership, Privacy-First Location UX & Deletion/Retention Lifecycle

### Status: ACCEPTED (Locked Baseline — Checkpoint 09)

### Context
Checkpoint 09 introduces persistent customer profiles (`customer_profiles`), saved Kolkata landmark addresses with GeoJSON coordinates (`addresses`), granular notification/location consents (`consent_records`), and self-service data rights (`export`, `deletion-request`), while ensuring zero cross-customer IDOR leaks and transparent Indian tax vs. DPDP privacy retention rules.

### Decision
1. **Strict JWT-Derived Customer Ownership (`server/src/modules/customer/`):** Derive target `userId` exclusively from the authenticated session (`auth.userId`) and enforce `address.userId === auth.userId` on every `/addresses/:addressId` read, update, default toggle, and deletion (`403 FORBIDDEN` + `audit_logs` `DENIED` event on cross-customer access attempts).
2. **Append-Only Consent Ledger (`consent_records` via `IdentityStore`):** Keep `consent_records` append-only (`applyBaseSchemaConventions({ appendOnly: true })`) for both initial registration terms and ongoing notification/location consent opt-in or withdrawal, avoiding duplicate Mongoose model ownership across modules (`ADR-001`).
3. **30-Day Account Deletion & Statutory Retention Contract:** Transition accounts requesting erasure to `DELETION_REQUESTED`, immediately revoke all `user_sessions`, return `Clear-Site-Data: "cookies", "storage"`, schedule PII anonymization 30 days post-request, and document pseudonymous GST/order ledger retention alongside 24-hour live delivery GPS retention (`AUTH.md` §9).
4. **Accessible Pre-Consented Customer Web UX (`client/customer-web`):** Implement WCAG AA / `modern-web-guidance` address autofill (`street-address`, `postal-code`, Unicode Bengali/English support), pre-interaction `aria-invalid` / polite live-region announcements, pre-prompt geolocation purpose disclosure with `ST-06` denied fallback, and self-service JSON export + `DELETE` confirmation modal.

### Consequences
- **Positive:** Eliminates horizontal customer IDOR, preserves verifiable proof of consent/withdrawal, and provides complete client + database parity ready for Phase 10+ discovery and checkout flows.
- **Negative:** Automated purge worker scheduling must execute queued `PENDING_RETENTION` anonymization jobs once downstream order/payment tables exist in later checkpoints.

---

## ADR-014: Restaurant Onboarding, Private Compliance Documents & Statutory FSSAI Separation

### Status: ACCEPTED (Locked Baseline — Checkpoint 10)

### Context
Checkpoint 10 introduces restaurant partner onboarding, legal KYC + settlement payout capture, private compliance document upload, and an MFA-verified admin review queue, while preserving the non-negotiable business rule that statutory FSSAI verification is legally and operationally distinct from Bhojora's independent hygiene inspection (`NOT_INSPECTED` until physical audit approval).

### Decision
1. **Dedicated Restaurant Module (`server/src/modules/restaurant/`) Within `ADR-001` Boundaries:** Own `BhojoraRestaurant` (`restaurants`), `BhojoraRestaurantOutlet` (`restaurant_outlets`), and `BhojoraRestaurantDocument` (`restaurant_documents`) while reusing `RbacStore` (`restaurant_staff`, `audit_logs`) and `IdentityStore` (`users`) instead of duplicating staff or audit models.
2. **Private-Only Compliance Documents (`PRIVATE_COMPLIANCE`, `isPublic: false`):** Enforce schema validation (`isPublic === false`), HMAC-SHA256 single-use upload intents (`900s` TTL), `docId` replay prevention, path-traversal filename sanitization, and `120s` audited read grants (`Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`) on `/api/v1/restaurant/documents/:documentId/access` exclusively for the owning applicant or an MFA-verified administrator. Public `/api/v1/restaurants` never returns document keys, PAN, bank account numbers, or owner contact PII.
3. **PAN & Settlement Bank Masking + HMAC Digesting:** Never return raw PAN or full bank account numbers after submission; store masked display strings (`AB******4F`, `******1234`) alongside keyed HMAC-SHA256 digests using the server secret.
4. **Immutable Separation of Statutory FSSAI vs. Bhojora Field Inspection:** Admin onboarding approval verifies documents and statutory `fssaiVerificationStatus` independently, promotes the applicant into `RESTAURANT_OWNER` + `ACTIVE` outlet membership, and explicitly initializes `platformInspectionStatus = 'NOT_INSPECTED'` and `publishedSafetyScore = null` — never inferring hygiene clearance from an approved FSSAI certificate.
5. **Accessible Onboarding & MFA Governance Portals (`client/restaurant-web`, `client/admin-web`):** Follow `modern-web-guidance` fieldsets, `autocomplete` attributes, above-field hints, post-interaction validation (`:user-invalid`, touched `aria-invalid`), and audited review tables with explicit reason entry (`>= 8` chars) and self-review prohibition.

### Consequences
- **Positive:** Prevents sensitive KYC leakage, eliminates self-review or unverified privilege promotion, and upholds Bhojora's core trust invariant separating FSSAI legal registration from independent field inspection.
- **Negative:** Approved outlets remain `NOT_INSPECTED` (`publishedSafetyScore: null`) until field inspection workflows run in subsequent checkpoints.

---

## ADR-015: Outlet Map Pins, GeoJSON Serviceability Zones & Asia/Kolkata Operating Hours

### Status: ACCEPTED (Locked Baseline — Checkpoint 11)

### Context
Checkpoint 11 establishes multi-branch outlet management, GeoJSON `[longitude, latitude]` map-pin validation, Kolkata Polygon delivery zones, and server-authoritative serviceability + `Asia/Kolkata` operating-hours evaluation without duplicating the canonical `restaurant_outlets` collection (`ADR-001`).

### Decision
1. **Zero-Duplication Outlet & Location Boundary (`server/src/modules/outlet/`):** Own `BhojoraDeliveryZone` (`delivery_zones`) and `BhojoraOutletHours` (`outlet_hours`) while consuming `RestaurantStore` (`restaurant_outlets`, `restaurants`) and `RbacStore` (`restaurant_staff`, `audit_logs`) via dependency injection instead of duplicating `restaurant_outlets`.
2. **Strict GeoJSON Coordinate & Ring-Order Validation:** Reject non-finite values, `[latitude, longitude]` swaps in Kolkata coordinate ranges, out-of-Kolkata outlet map pins, unclosed Polygon rings, degenerate zero-area polygons, and non-RFC-7946 exterior/interior ring winding orders (`400 VALIDATION_ERROR`).
3. **Server-Authoritative Serviceability & `Asia/Kolkata` Live Schedule Evaluation:** Never trust client-reported distance, delivery fees, or "open" status. Compute active polygon containment (`isPointInPolygon`), Haversine distance against outlet `deliveryRadiusMeters`, and `Asia/Kolkata` IST operating slots + special closures (`Intl.DateTimeFormat` UTC+05:30) exclusively on the server (`GET /api/v1/serviceability`, `POST /api/v1/serviceability/check`, `GET /api/v1/outlets/:outletId`, `GET /api/v1/restaurants?lng=&lat=&openNow=true`).
4. **Tenant Isolation & Trust Separation Preserved:** Partner branch creation (`POST /api/v1/restaurant/outlets`), map-pin updates (`PATCH /api/v1/restaurant/outlets/:outletId`), and schedule updates (`PUT /api/v1/restaurant/outlets/:outletId/hours`) require active tenant membership (`403 FORBIDDEN` + `audit_logs` on IDOR), use strict schemas rejecting any client mutation of `platformInspectionStatus` / `publishedSafetyScore`, and initialize new branch outlets strictly as `NOT_INSPECTED` (`publishedSafetyScore: null`). Admin zone governance (`POST/PATCH /api/v1/admin/zones*`) requires MFA-verified `ops:outlet:manage`.

### Consequences
- **Positive:** Guarantees consistent Kolkata geospatial behavior across MongoDB `2dsphere` queries and circuit-breaker ray-casting fallbacks (`ARCHITECTURE.md` §5.3) with zero client-trust leakage.
- **Negative:** External polygon zones covering regions outside `[88.1..88.7, 22.3..22.85]` require explicit bounds expansion when onboarding cities beyond the Kolkata pilot.

---

## ADR-016: Catalog & Menu Management, Integer Paise Pricing, Declared Allergens & Audited Mutations

### Status: ACCEPTED (Locked Baseline — Checkpoint 12)

### Context
Checkpoint 12 establishes multi-outlet catalog management (`menu_categories`, `menu_items`, `item_customizations`, `inventory_records`), variants and add-on groups, public customer menu discovery, dietary classification (`PURE_VEG` / `NON_VEG` / `EGG`), explicit allergen labeling, and audit trails for all price, allergen, and stock changes while enforcing `ADR-003` (integer paise) and `ADR-007` (public Tier-1 cleanliness).

### Decision
1. **Dedicated Catalog Domain (`server/src/modules/catalog/`):** Own `BhojoraMenuCategory` (`menu_categories`), `BhojoraMenuItem` (`menu_items`), `BhojoraItemCustomization` (`item_customizations`), and `BhojoraInventoryRecord` (`inventory_records`) while reading outlet/tenant metadata via injected `RestaurantStore` and `RbacStore` (`ADR-001`).
2. **Strict Integer Paise Across Monetary Fields (`paiseField()` + Zod `.int().min(0)`):** Item `pricePaise`, variant `priceDeltaPaise`, and add-on `pricePaise` reject floats, negative numbers, and unvalidated currency strings across both Zod schemas and Mongoose schemas (`ADR-003`).
3. **Mandatory Allergen Disclosure & Non-Color-Only Dietary Badges:** Every dish requires `allergenDisclosureConfirmed: true` alongside canonical `ALLERGEN_CODES` (`DAIRY`, `EGG`, `GLUTEN`, `PEANUTS`, `TREE_NUTS`, `SOY`, `FISH`, `SHELLFISH`, `SESAME`, `MUSTARD`, `SULPHITES`) mapped to explicit customer labels (`Contains Dairy`, etc.) and paired with text-and-symbol `DietaryBadge` badges (`● Pure Veg`, `▲ Non-Veg`, `● Contains Egg`).
4. **Role Segregation, Safe Media URLs & Append-Only Menu Audits:** Mutations require `restaurant:menu:manage` (`RESTAURANT_OWNER` / `RESTAURANT_MANAGER` only; `KITCHEN_STAFF` denied `403`) plus active outlet membership (`DENIED` attempts audited). Public `imageUrl` validates safe `https://` or `./assets/` paths only (never `private/compliance` or inline scripts), and every category, price, allergen, or availability mutation appends an audit record to `audit_logs`.

### Consequences
- **Positive:** Prevents floating-point rupee rounding errors, guarantees explicit allergen transparency for customers, and provides an immutable audit trail on every catalog edit prior to Checkpoint 13 cart and checkout work.
- **Negative:** Partners must explicitly confirm declared allergens when creating dishes even when no major allergens apply.

---

## ADR-017: Discovery Search, Keyset Cursor Pagination, Index Pushdown & Truthful Safety Badges

### Status: ACCEPTED (Locked Baseline — Checkpoint 13)

### Context
Checkpoint 13 delivers restaurant, cuisine, dish, dietary, and allergen search across Kolkata corridors (`GET /api/v1/search`, `GET /api/v1/restaurants`, `GET /api/v1/categories`), requiring deterministic multi-mode sorting without sponsored safety placement, bounded keyset cursor pagination backed by MongoDB compound indexes, abuse rate controls, and strict guarantees against misleading verified claims.

### Decision
1. **Dedicated Discovery Read Module (`server/src/modules/discovery/`) Within `ADR-001` Boundaries:** Consume injected `RestaurantStore`, `OutletStore`, `OutletService` (`listDeliveryZones`, `getClock`), and `CatalogStore` (`listPublicItemsForOutlets` batch lookup to eliminate N+1 queries) to join live IST open status, Haversine distance/ETA, menu dishes, and trust badges cleanly.
2. **Compound Discovery Indexes (`server/src/database/indexes.ts`):** Provision `idx_outlets_discovery_zone_safety` (`status + zoneId + platformInspectionStatus + publishedSafetyScore`), `idx_outlets_discovery_status_cuisine` (`status + cuisines + brandName`), `idx_menu_items_discovery_avail_diet_price` (`outletId + isAvailable + dietaryType + pricePaise`), and `idx_menu_items_available_title` (`isAvailable + title`).
3. **Deterministic Keyset Cursor Pagination & ReDoS-Free Query Hardening:** Cap `limit` (`1..25`) and `q` (`<= 80` chars), disallow control characters, tokenize text without unescaped dynamic `RegExp` execution, encode query-bound keyset tuples (`primarySort`, `secondarySort`, `outletId`) in Base64url cursors validated against active filter hashes (`400 VALIDATION_ERROR` on mismatch/tampering), and protect public search endpoints with an IP sliding-window rate limiter (`429 RATE_LIMITED`).
4. **Non-Misleading Trust Badges & Anti-Sponsored Ranking:** Enforce `buildDiscoveryTrustBadge()` so `isVerified` is `true` strictly when `status === 'ACTIVE' && platformInspectionStatus === 'VERIFIED_CLEAN' && publishedSafetyScore > 0`; `NOT_INSPECTED`, `SCHEDULED`, `ACTION_REQUIRED`, and `EXPIRED` never claim `VERIFIED` or emit fabricated scores, `SUSPENDED` outlets are excluded, and `rankingDisclosure` confirms search rank never sells discovery placement.

### Consequences
- **Positive:** Prevents N+1 query amplification, ReDoS abuse, duplicate/skipped pagination items, and deceptive "Verified" marketing badges across both API payloads and `customer-web` React cards/map pins.
- **Negative:** Changing search filters invalidates active pagination cursors (`400 VALIDATION_ERROR`), requiring clients to start from page 1 whenever filters or sort order change.

---

## ADR-018: Single-Outlet Cart Policy, Authoritative Paise Quote, Coupons & HMAC Signing

### Status: ACCEPTED (Locked Baseline — Checkpoint 14)

### Context
Checkpoint 14 governs customer cart management and checkout pricing (`/cart*`, `/coupons/available`, `/checkout/quote*`). Food ordering platforms suffer critical revenue-loss and tax-compliance risks if client payloads can supply prices/totals, if carts mix items across multiple outlets in one dispatch, if coupons omit platform/restaurant funding attribution, or if stale checkout totals silently fluctuate at payment time.

### Decision
1. **Single-Outlet Cart Policy & Authoritative Catalog Pricing (`server/src/modules/cart/`):** Persist one cart per authenticated `customerId` (`idx_carts_customer_unique`). Adding an item from outlet B while items from outlet A remain returns `409 CONFLICT` (`SINGLE_OUTLET_CONFLICT`) unless `replaceOutlet: true` is explicitly confirmed by the customer. Line prices are computed strictly from server `CatalogStore` base prices plus validated variant and add-on selections.
2. **Strict Anti-Tampering Input Rejections:** Reject any request to `/cart/items*` or `/checkout/quote` containing client monetary keys (`pricePaise`, `unitPricePaise`, `totalPayablePaise`, `discountPaise`, `gstTaxPaise`, `deliveryFeePaise`, `signature`, etc.) with `400 VALIDATION_ERROR` and log server warnings.
3. **Deterministic Integer Paise Calculation & Transparent Tax/Funding Split (`server/src/modules/pricing/pricing.math.ts`):** Compute all amounts as safe integers in paise (`ADR-003`): delivery base fee + ₹6/km distance fee (`DELIVERY_PER_KM_PAISE = 600`), capped packaging (`PACKAGING_PER_UNIT_PAISE = 1000`, `PACKAGING_MAX_PAISE = 4000`), `PLATFORM_FEE_PAISE = 500`, GST by item slab (`5%` restaurant / `18%` bakery / `0%` exempt, split evenly into CGST + SGST), promotional discount attributed cleanly via `platformShareBps + restaurantShareBps = 10000` (e.g., `BHOJORA100` ₹100 off at 60% Platform / 40% Restaurant), and **untaxed** 100% pass-through rider `tipPaise` (`<= 50000`).
4. **600-Second HMAC-SHA256 Signed Quote & Price-Drift Detection:** Sign the immutable quote breakdown (`quoteId`, `customerId`, `outletId`, `expiresAt`, `totalPayablePaise`, item/tax/discount subtotals) with HMAC-SHA256 for `QUOTE_TTL_SECONDS = 600`. Flag catalog price changes since add-to-cart (`priceDriftDetected`, `priceDriftWarnings`) and verify ownership (`403` cross-customer IDOR rejection), integrity (`403` tampered signature), and `600s` expiration (`409 CONFLICT`) prior to order creation.

### Consequences
- **Positive:** Eliminates floating-point rounding drift, client-side price tampering, ambiguous GST allocation, and silent checkout price surprises.
- **Negative:** Carts cannot span multiple restaurants in a single order; quotes older than 600 seconds require explicit customer regeneration before payment capture.

---

## ADR-019: Sandbox Payment Gateway Adapter, Webhook Replay Defense & Unknown-Status Reconciliation

### Status: ACCEPTED (Locked Baseline — Checkpoint 15)

### Context
Checkpoint 15 establishes the sandbox payment layer (`/payments/create`, `/payments/:paymentId`, `/payments/verify`, `/payments/:paymentId/reconcile`, `/webhooks/payments/:provider`, `/admin/payments/reconciliations`). Digital payments must never accept or persist raw PAN/CVV card details, must prevent duplicate charges across retries, and must resolve out-of-order, replayed, or delayed gateway notifications alongside indeterminate `UNKNOWN` gateway timeouts cleanly.

### Decision
1. **Zero Raw Card Data Storage (`ZERO_RAW_CARD_DATA_POLICY`):** Reject requests containing raw card fields (`cardNumber`, `pan`, `cvv`, `cvc`, `expiry`, `cardExpiry`, `pin`, `trackData`) or 13–19 digit PAN-shaped strings with `400 VALIDATION_ERROR`. Persist only tokenized gateway references and masked summaries (`upiVpaMasked`, `cardNetwork`, `cardLast4`, `bankCode`, `tokenReference`).
2. **Idempotent Attempt Creation Tied to Verified Quote (`server/src/modules/payments/`):** Require an `Idempotency-Key` header on `POST /payments/create` scoped to `(operation, key)` with canonical SHA-256 request hashing (`409 IDEMPOTENCY_CONFLICT` on mismatched payload/actor, `200` cached replay on identical retry). Bind authorized `amountPaise` strictly from `PricingService.verifyQuoteForCheckout` (`ADR-003`).
3. **Signed Webhook Verification, Replay Cutoff & Atomic Deduplication:** Require HMAC-SHA256 signatures checked via constant-time `crypto.timingSafeEqual` plus `X-Webhook-Timestamp` within `WEBHOOK_REPLAY_WINDOW_SECONDS` (`300s` default; `401 UNAUTHORIZED` otherwise). Record `(provider, eventId)` atomically in append-only `integration_webhook_events` so duplicate webhook deliveries return `200 { deduplicated: true }` without mutating state or appending duplicate ledger entries.
4. **Late Webhook & Unknown-Status Reconciliation:** Never downgrade a terminal `CAPTURED` payment upon a late `payment.failed` notification (`LATE_WEBHOOK_IGNORED`). Reconcile `UNKNOWN` or timed-out attempts deterministically via late signed `payment.captured` webhooks (`LATE_WEBHOOK_APPLIED`) or `POST /payments/:paymentId/reconcile` polling `SandboxPaymentGatewayAdapter.fetchPaymentStatus()`, writing immutable `payment_events` and `reconciliation_records` (`finance:settlement:read` MFA queue for operations).

### Consequences
- **Positive:** Eliminates PCI raw-card exposure, double-capture on webhook retries, and stale-state corruption from out-of-order gateway events.
- **Negative:** Live Razorpay/Cashfree SDK credentials remain intentionally stubbed behind `SandboxPaymentGatewayAdapter` until production merchant onboarding in a later milestone.
