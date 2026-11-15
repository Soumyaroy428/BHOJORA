# BHOJORA — Food You Love. Trust You Deserve.

> **Kolkata's Flagship Food Discovery & Verified Kitchen Trust Platform**  
> Built as a fully integrated, production-ready multi-sided ecosystem connecting conscious diners, culinary kitchens, delivery fleets, and accredited food safety inspectors.

[![CI Status](https://img.shields.io/badge/CI-Passing-success?style=flat-square)](https://github.com/Soumyaroy428/BHOJORA/actions)
[![Checkpoints](https://img.shields.io/badge/Checkpoints-39%2F39%20Delivered-blue?style=flat-square)](docs/CHECKPOINTS/CHECKPOINT_INDEX.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20Strict-blue?style=flat-square)](tsconfig.base.json)
[![Security](https://img.shields.io/badge/Security-STRIDE%20Verified%20%7C%200%20Vulns-green?style=flat-square)](docs/03-SECURITY-QUALITY/THREAT_MODEL_AND_SECURITY_SIGN_OFF.md)
[![Compliance](https://img.shields.io/badge/Compliance-DPDP%20%7C%20FSSAI%20%7C%20RBI%20Escrow-orange?style=flat-square)](docs/03-SECURITY-QUALITY/LAUNCH_READINESS_DOSSIER.md)

---

## 1. Executive Summary & Purpose

In modern urban food delivery, consumer trust has eroded due to unverified cloud kitchens, opaque pricing surges, hidden aggregator commissions, and vulnerable gig worker conditions.

**BHOJORA** redefines the food delivery paradigm by fusing commercial on-demand convenience with an **independent, evidence-backed kitchen verification and trust transparency engine**. Every participating restaurant is physically audited across hygiene, water quality, and ingredient cold-chains before earning a public, tamper-evident safety rating.

---

## 2. How Bhojora Helps: Core Value Proposition

### 🍽️ For Consumers (Diners)

- **Verifiable Kitchen Hygiene Ratings:** Inspect an objective 100-point hygiene rating, audit date, and photographic evidence for every kitchen—independent of commercial sponsorship or paid placement.
- **Transparent, No-Surge Pricing:** Complete upfront cost breakdown with zero hidden service fees, drip-pricing, or unannounced surge charges.
- **Strict Single-Outlet Cart & Live Route Telemetry:** Enforces hot-food integrity with GPS route tracking constrained to high-density 5.5–6.0 km delivery corridors.
- **Privacy First (DPDP Act 2023):** Built-in Data Subject Rights (DSR) allowing users to export their profile data or exercise the "Right to Erasure" with automated anonymization.

### 🍳 For Restaurant Partners

- **Fair, Sustainable Take-Rates:** A transparent 16.5% platform commission structure that eliminates predatory 30%+ aggregator margin squeeze.
- **Trust-Driven Customer Loyalty:** Verified kitchens receive verifiable QR trust badges and public safety profiles, translating verified cleanliness into direct customer growth.
- **Real-Time Operational Command:** Dedicated kitchen display board, instant stock toggles, allergen and preparation time management, and automated nodal escrow payouts.

### 🛵 For Delivery Fleet Partners

- **Guaranteed Fair Floor Earnings:** Minimum distance-based pay floor for every trip, shielding riders from fluctuating commission cuts.
- **100% Direct Tip Pass-Through:** Every rupee tipped by customers is disbursed directly to the rider with zero platform deduction.
- **Active Safety & Insurance Coverage:** Mandatory Group Personal Accident insurance active during all delivery shifts, coupled with reflective safety gear.

### 🛡️ For Food Safety Inspectors & Regulatory Bodies

- **Tamper-Proof Digital Audits:** Standardized NABL/FSSAI-aligned inspection rubric recorded with SHA-256 cryptographic hashes.
- **Separation of Duties:** Field inspectors cannot self-certify reports; independent administrative review prevents conflicts of interest.
- **Immediate Critical Safety Escalation:** Critical food safety non-conformances trigger instant 15-minute automated restaurant suspension.

---

## 3. Technology Stack & Architecture

BHOJORA is architected as a modular monolith following clean architecture boundaries and zero-drift design tokens:

```
BHOJORA/
├── docs/                   # Full architectural ADRs, PRD, security sign-offs & checkpoint dossiers
│   ├── 01-CORE-PLANNING-DESIGN/
│   ├── 02-EXECUTION-AGENTS/
│   ├── 03-SECURITY-QUALITY/
│   └── CHECKPOINTS/        # Granular delivery specifications (CP00 to CP38)
├── client/                 # Client user interfaces & shared design system
│   ├── customer-web/       # Next.js / React accessible customer ordering application
│   ├── restaurant-web/     # Next.js / React kitchen operations dashboard
│   ├── admin-web/          # Next.js / React multi-tenant RBAC governance console
│   ├── customer-mobile/    # React Native / Expo mobile application
│   ├── delivery-mobile/    # React Native / Expo driver logistics & proof-of-delivery
│   ├── inspector-mobile/   # React Native / Expo field audit & evidence collection
│   └── shared/             # Canonical TypeScript contracts, tokens, and schemas
└── server/                 # Modular monolith backend API
    ├── src/
    │   ├── config/         # Strongly-typed environment variables & Winston logger
    │   ├── database/       # MongoDB schemas, ensure-indexes scripts, and seeding
    │   ├── middleware/     # Strict authentication, RBAC scoping, rate limiting, and errors
    │   └── modules/        # 16 Isolated domain modules (identity, catalog, orders, pilot, etc.)
    └── tests/              # 39 Automated verification test suites (CP00 - CP38)
```

### Core Technologies

- **Runtime:** Node.js `22.21.0` LTS with npm `11.12.1`.
- **Languages:** TypeScript 5.x across all client, shared, and server packages.
- **Frontend Frameworks:** React 19, Next.js 15, Vite, Tailwind CSS with customized Bhojora design tokens.
- **Backend Framework:** Express 5.x, Mongoose 9.x, Zod 4.x validation schemas.
- **Database & Cache:** MongoDB with `2dsphere` geospatial indexing and Redis for rate-limiting and idempotency.
- **Authentication & Security:** PHC `scrypt` password hashing, dual JWT access/refresh token rotation with replay revocation, constant-time HMAC-SHA256 signature verification.
- **Resilience Engineering:** Tri-state circuit breakers (`CLOSED`, `OPEN`, `HALF_OPEN`), exponential backoff retry queues with Dead Letter Queues (DLQ), and offline Haversine routing fallback.

---

## 4. Useful Links & Production Deployments

### 🌐 Live Staging Applications

- **Customer Web Application:** [https://customer-web-phi-ten.vercel.app](https://customer-web-phi-ten.vercel.app)
- **Admin Governance Console:** [https://bhojora-admin.vercel.app](https://bhojora-admin.vercel.app)
- **Restaurant Partner Portal:** [https://restaurant-web-liard-seven.vercel.app](https://restaurant-web-liard-seven.vercel.app)

### 📚 Core Architectural & Governance Dossiers

- [OpenAPI 3.1.0 Contract Specification](docs/01-CORE-PLANNING-DESIGN/openapi.json)
- [Architecture Decision Records (ADRs 001–007)](docs/01-CORE-PLANNING-DESIGN/ADRS.md)
- [Brand Visual Tokens & Design System Specification](docs/01-CORE-PLANNING-DESIGN/BRAND.md)
- [STRIDE Threat Model & Security Sign-Off](docs/03-SECURITY-QUALITY/THREAT_MODEL_AND_SECURITY_SIGN_OFF.md)
- [Performance & Recovery Drill Report (SLO Targets)](docs/03-SECURITY-QUALITY/PERFORMANCE_AND_RECOVERY_REPORT.md)
- [Statutory Compliance & Launch Readiness Dossier](docs/03-SECURITY-QUALITY/LAUNCH_READINESS_DOSSIER.md)
- [Kolkata Commercial Pilot Report](docs/03-SECURITY-QUALITY/KOLKATA_PILOT_REPORT.md)
- [Pilot Evaluation & Multi-City Expansion Decision](docs/03-SECURITY-QUALITY/PILOT_EVALUATION_AND_EXPANSION_DECISION.md)

---

## 5. Checkpoint Delivery Matrix (00 through 38)

The entire platform was engineered sequentially with goal-backward test verification:

| Checkpoint | Scope                                  | Core Deliverable                                       | Verification Status |
| ---------- | -------------------------------------- | ------------------------------------------------------ | ------------------- |
| **CP00**   | Product decisions & repo skeleton      | 3-folder clean root, strict env guards                 | ✅ Verified         |
| **CP01**   | UX research & user journeys            | 13 feature domain journeys, screen inventories         | ✅ Verified         |
| **CP02**   | Design tokens & component contract     | Bhojora color palette, Manrope typography, WCAG AA     | ✅ Verified         |
| **CP03**   | Architecture & OpenAPI contracts       | 7 ADRs, modular monolith, OpenAPI 3.1.0                | ✅ Verified         |
| **CP04**   | Developer tooling & CI quality         | GitHub Actions CI, linting, secret scanning            | ✅ Verified         |
| **CP05**   | Backend bootstrap & server foundation  | Express app, RFC 7807 error envelopes                  | ✅ Verified         |
| **CP06**   | Database foundation & indexes          | MongoDB models, compound 2dsphere indexes              | ✅ Verified         |
| **CP07**   | Identity & secure sessions             | PHC scrypt, JWT rotation, OTP throttling               | ✅ Verified         |
| **CP08**   | RBAC & cross-tenant isolation          | Role hierarchy, IDOR guards, step-up MFA               | ✅ Verified         |
| **CP09**   | Customer profile & addresses           | Kolkata address validation, privacy consent            | ✅ Verified         |
| **CP10**   | Restaurant onboarding                  | FSSAI validation, business profile intake              | ✅ Verified         |
| **CP11**   | Outlet & service zones                 | Geospatial serviceability, Kolkata corridor bounds     | ✅ Verified         |
| **CP12**   | Catalog & menu management              | Menu items, modifiers, allergen disclosure             | ✅ Verified         |
| **CP13**   | Discovery & search                     | Geospatial kitchen search, dietary & trust filters     | ✅ Verified         |
| **CP14**   | Cart & authoritative pricing           | Single-outlet constraint, fee computation              | ✅ Verified         |
| **CP15**   | Payment gateway integration            | Razorpay webhook verification, idempotency             | ✅ Verified         |
| **CP16**   | Order lifecycle state machine          | State transitions, cancellation policies               | ✅ Verified         |
| **CP17**   | Restaurant kitchen operations          | Order fulfillment board, preparation timers            | ✅ Verified         |
| **CP18**   | Delivery partner onboarding            | Document compliance, shift management                  | ✅ Verified         |
| **CP19**   | Delivery dispatch engine               | Proximity matching, batching, SLA monitoring           | ✅ Verified         |
| **CP20**   | Live tracking & proof of delivery      | Secure OTP delivery verification, GPS points           | ✅ Verified         |
| **CP21**   | Inspector onboarding & credentialing   | Inspector vetting, jurisdictional assignment           | ✅ Verified         |
| **CP22**   | Inspection checklist & evidence        | 100-point rubric, SHA-256 media hashing                | ✅ Verified         |
| **CP23**   | Review & score calculation             | Governed scoring algorithm, violation overrides        | ✅ Verified         |
| **CP24**   | Public trust profile & QR badges       | Public kitchen score cards, verification badges        | ✅ Verified         |
| **CP25**   | Verified reviews & complaints          | Order-verified reviews, food poisoning triage          | ✅ Verified         |
| **CP26**   | Support operations & ticketing         | Priority ticketing, escalation SLAs                    | ✅ Verified         |
| **CP27**   | Financial settlements & reconciliation | Nodal escrow settlements, refund processing            | ✅ Verified         |
| **CP28**   | Platform administration & governance   | Super admin console, platform kill-switches            | ✅ Verified         |
| **CP29**   | Multi-channel notifications            | SMS, email, and push notification adapters             | ✅ Verified         |
| **CP30**   | Promotions, discounts & loyalty        | Coupon validation engine, referral tracking            | ✅ Verified         |
| **CP31**   | Analytics & KPI dashboards             | Metric aggregations, PII-sanitized exports             | ✅ Verified         |
| **CP32**   | AI assistance & review queue           | Human-in-the-loop review queue for AI proposals        | ✅ Verified         |
| **CP33**   | Integrations & provider resilience     | Tri-state circuit breakers, retry DLQ, maps fallback   | ✅ Verified         |
| **CP34**   | Security & privacy hardening           | DPDP DSR workflows, retention purge, CERT-In timers    | ✅ Verified         |
| **CP35**   | Performance benchmarks & recovery      | p95 latency targets, point-in-time restore drill       | ✅ Verified         |
| **CP36**   | Statutory compliance & legal readiness | FSSAI, Consumer Protection, RBI PA/PG sign-offs        | ✅ Verified         |
| **CP37**   | Kolkata commercial pilot               | Controlled micro-zones, cohort access, safety tracking | ✅ Verified         |
| **CP38**   | Pilot evaluation & expansion decision  | Unit economics (+₹41.44 margin), founder sign-off      | ✅ Verified         |

---

## 6. Local Development & Operational Quickstart

### Prerequisites

- Node.js `22.21.0` LTS (`nvm use`)
- npm `11.12.1` or higher
- Running MongoDB instance (or automated in-memory test fallback)

### Installation & Test Execution

```bash
# Clone the repository
git clone https://github.com/Soumyaroy428/BHOJORA.git
cd BHOJORA

# Install dependencies across all monorepo workspaces
npm ci

# Execute complete verification suite (CP00 through CP38)
npm run test

# Run code style, static linting, and typecheck
npm run format:check
npm run lint
npm run typecheck

# Build all packages
npm run build
```

### Running the API Server

```bash
# Copy development environment template
cp server/.env.example server/.env

# Start the server API
npm run start --workspace=server
# Health endpoints available at: http://localhost:4000/api/v1/health
```

---

## 7. Intellectual Property & Legal Notice

© 2026 Bhojora Platform Ltd. All rights reserved.  
Registered office: 14 Park Street, Kolkata, West Bengal 700016, India.  
_Bhojora, the Bhojora logo, and "Food You Love. Trust You Deserve." are proprietary trademarks of Bhojora Platform Ltd._
