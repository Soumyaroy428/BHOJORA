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
