# BHOJORA — Food You Love. Trust You Deserve.

> **Kolkata's Independent Food Discovery & Verified Kitchen Trust Platform**  
> An ethical, transparent, and hygiene-certified food delivery ecosystem connecting conscious diners, culinary kitchens, delivery partners, and accredited food safety inspectors.

[![Platform Status](https://img.shields.io/badge/Platform%20Status-Production%20Ready-success?style=flat-square)](https://github.com/Soumyaroy428/BHOJORA)
[![Architecture](https://img.shields.io/badge/Architecture-Modular%20Monolith-blue?style=flat-square)](docs/01-CORE-PLANNING-DESIGN/ARCHITECTURE.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x%20Strict-blue?style=flat-square)](tsconfig.base.json)
[![Security Sign-Off](https://img.shields.io/badge/Security-STRIDE%20Verified%20%7C%200%20Vulns-green?style=flat-square)](docs/03-SECURITY-QUALITY/THREAT_MODEL_AND_SECURITY_SIGN_OFF.md)
[![Compliance](https://img.shields.io/badge/Compliance-DPDP%202023%20%7C%20FSSAI%20%7C%20RBI%20Escrow-orange?style=flat-square)](docs/03-SECURITY-QUALITY/LAUNCH_READINESS_DOSSIER.md)

---

## 1. Executive Overview

In the modern urban food landscape, standard food delivery apps have prioritized hyper-growth over diner health and merchant sustainability. Diners routinely order from uninspected "ghost kitchens" with no visibility into kitchen hygiene, while facing hidden "platform fees", rain surges, and marked-up menu prices. Simultaneously, restaurant margins are decimated by 30%+ aggregator commissions, and delivery riders navigate arbitrary payouts with ambiguous tip deductions.

**BHOJORA** changes this equation. We fuse on-demand culinary convenience with an **independent, physical kitchen verification and trust transparency engine**. Every participating restaurant is physically audited across water purity, food handling, and kitchen sanitation before earning a public, tamper-evident safety rating.

---

## 2. Why BHOJORA is Different from Zomato and Swiggy

| Dimension                            | Typical Aggregators (Zomato / Swiggy)                                                                                                                                      | BHOJORA Trust Platform                                                                                                                                                                         |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Kitchen Food Safety**              | Self-declared FSSAI number (often outdated/unverified). No public kitchen photos or sanitation audits. Unverified dark/cloud kitchens proliferate freely.                  | **Physical, on-site audits** conducted by accredited food safety inspectors. Objective 100-point hygiene rating, audit date, and prep area photos published directly on every restaurant card. |
| **Pricing & Fee Transparency**       | **Drip pricing & hidden fees:** Arbitrary "platform fees" (₹6–₹10), delivery fees, packaging fees, and dynamic rain/peak surge charges added at the final checkout screen. | **Zero platform fees & zero drip pricing.** Complete upfront bill breakdown with no surprise checkout charges. Delivery charges are strictly distance-based and transparently displayed.       |
| **Menu Pricing Parity**              | Menu prices are typically inflated by 20%–40% over dine-in rates to compensate for heavy platform commissions.                                                             | **Strict price parity guarantee.** Menu items reflect true outlet pricing with verified single-outlet cart billing.                                                                            |
| **Restaurant Commissions**           | Aggressive **25% to 35%+ platform commission**, plus forced discount schemes that severely erode kitchen profitability.                                                    | **Sustainable 16.5% flat take rate**, with zero mandatory discounting mandates, enabling restaurants to focus on ingredient quality.                                                           |
| **Search & Discovery Ethics**        | Algorithmic ranking heavily favors restaurants that pay for "promoted" ads and sponsored keyword bidding over kitchen quality.                                             | **Ethical meritocracy.** Ranking is determined purely by verified hygiene rating, culinary specialization, consumer reviews, and physical proximity. Paid placement is prohibited.             |
| **Delivery Radius & Food Freshness** | Multi-order batching across long 12–15 km delivery radiuses, resulting in soggy, lukewarm food delivered after 60+ minutes.                                                | **Strict 5.5–6.0 km corridor bounds.** Hot-chain food integrity is preserved with single-outlet delivery focus, guaranteeing fresh delivery within 25–35 minutes.                              |
| **Delivery Rider Welfare**           | Fluctuating delivery incentives, opaque tip pools, and lack of shift accident protection.                                                                                  | **Guaranteed distance-based floor pay, 100% direct customer tip pass-through** (zero platform cut), and active Group Personal Accident insurance on every shift.                               |
| **Data Privacy & User Rights**       | Pervasive cross-app ad tracking, profiling, and permanent telemetry storage.                                                                                               | **Built for India's DPDP Act 2023.** Granular consent management, automated PII export, self-service Right to Erasure, and automated 30-day GPS telemetry purge.                               |

---

## 3. How BHOJORA Works: The End-to-End Journey

Bhojora operates through a synchronized 5-step operational workflow:

```
[ 1. Discovery & Verification ] ──> [ 2. Transparent Cart & Quote ] ──> [ 3. Live Kitchen Display ]
           │                                                                    │
           ▼                                                                    ▼
[ 5. Independent Audit Loop ]   <── [ 4. Corridor Dispatch & OTP Delivery ] <───┘
```

### 1. Discovery with Verifiable Trust

- Diners explore verified restaurants via an interactive live map or corridor selector (e.g., Salt Lake Sector V, Park Street / Bhowanipore).
- Every restaurant card displays a prominent **Hygiene Badge (e.g., "94/100 • Audited Oct 2026")**.
- Diners can tap to view the full **Kitchen Trust Dossier**, inspecting photos of food preparation zones, refrigerator temperature logs, and pest-control certifications.

### 2. Clean Cart & Authoritative Price Quotes

- The single-outlet cart validates items in real time.
- The server generates an authoritative price quote calculating exact items, verified restaurant GST (under Section 9(5) CGST Act), and distance-based logistics.
- The price you see is the price you pay: zero unexpected convenience fees or platform surcharges.

### 3. Kitchen Display System (KDS) & Tamper-Proof Packaging

- Once paid via tokenized Indian payment gateways (Razorpay / UPI), orders stream instantly to the merchant's live kitchen operations board.
- Kitchens prepare dishes within measured preparation windows and seal orders with tamper-evident hygiene labels.

### 4. Bounded-Corridor Dispatch & OTP Delivery

- Proximity-based dispatch pairs the order with a dedicated delivery partner within the 5.5–6.0 km corridor.
- Diners track rider GPS telemetry in real-time.
- Delivery is finalized via a secure, single-use **4-digit customer delivery OTP**, guaranteeing safe handoff and releasing rider payout.

### 5. Governed Inspection & Peer-Review Loop

- Independent food safety inspectors conduct periodic physical evaluations using a standardized 100-point rubric.
- Photo and video evidence is cryptographically hashed with SHA-256 to prevent tampering.
- **Enforced Separation of Duties:** Inspectors cannot self-approve reports; a secondary compliance officer must verify the findings before scores update publicly.
- Critical health non-conformances trigger immediate, automated restaurant suspension.

---

## 4. How BHOJORA Helps Every Stakeholder

### 🍽️ Conscious Diners

- **Peace of Mind:** Know exactly what happens behind the kitchen doors before you order.
- **Honest Value:** Save ₹50–₹120 per order by avoiding inflated menu prices and surprise platform fees.
- **Piping Hot Meals:** Food is delivered fresh within short urban radii rather than languishing across multi-stop cross-city routes.

### 🍳 Honest Restaurateurs & Cloud Kitchens

- **Direct ROI on Cleanliness:** Good food and high hygiene standards directly drive top discovery ranking without spending thousands on platform ads.
- **Healthy Margins:** Retain over 83.5% of order revenue, preserving business viability.
- **Operational Clarity:** Real-time stock management, prep time throttling, and next-day automated escrow settlements.

### 🛵 Delivery Fleet Partners

- **Fair & Predictable Livelihood:** Transparent base pay per kilometer with zero unexpected deductions.
- **Tips Belong to You:** 100% of customer tips are remitted directly to the partner's wallet.
- **Dignity & Safety:** Accidental disability coverage and realistic delivery timeframes that do not force reckless driving.

### 🏛️ Municipalities & Health Authorities

- **Digital Compliance Infrastructure:** Elevates urban food safety by providing open, transparent audit trails aligned with FSSAI regulations.
- **Rapid Outbreak Response:** Critical food safety alerts trigger automated restaurant lockdown in under 15 minutes.

---

## 5. Technology Stack & Monorepo Architecture

BHOJORA is built as an enterprise-grade modular monolith written in **100% strict TypeScript**:

```
BHOJORA/
├── docs/                   # Architectural ADRs, PRD, security models, & compliance dossiers
│   ├── 01-CORE-PLANNING-DESIGN/
│   ├── 02-EXECUTION-AGENTS/
│   ├── 03-SECURITY-QUALITY/
│   └── CHECKPOINTS/
├── client/                 # User interfaces and shared design systems
│   ├── customer-web/       # Next.js / React responsive web application
│   ├── restaurant-web/     # Next.js / React kitchen operations dashboard
│   ├── admin-web/          # Next.js / React multi-tenant RBAC governance console
│   ├── customer-mobile/    # React Native / Expo iOS & Android client
│   ├── delivery-mobile/    # React Native / Expo fleet delivery app
│   ├── inspector-mobile/   # React Native / Expo offline-first field inspection app
│   └── shared/             # Shared contracts, Zod schemas, and design tokens
└── server/                 # Modular monolith backend API
    ├── src/
    │   ├── config/         # Validated environment configuration and Winston logger
    │   ├── database/       # MongoDB schemas, indexing scripts, and seed files
    │   ├── middleware/     # Auth, RBAC context, rate limiting, and RFC 7807 error envelopes
    │   └── modules/        # Domain modules (identity, catalog, orders, pilot, etc.)
    └── tests/              # 39 Automated verification test suites
```

### Core Technologies

- **Runtime:** Node.js `22.21.0` LTS with npm `11.12.1`.
- **Languages:** TypeScript 5.x across all client, shared, and server packages.
- **Frontend Frameworks:** React 19, Next.js 15, Vite, and Tailwind CSS calibrated with Bhojora's design tokens (Terracotta `#8D352A`, Warm Cream `#F7F1E6`, Trust Green `#344B3E`, Saffron `#E4A746`).
- **Backend Framework:** Express 5.x, Mongoose 9.x, Zod 4.x validation schemas.
- **Database & Cache:** MongoDB with `2dsphere` geospatial indexing and Redis for rate-limiting and idempotency replay guards.
- **Authentication & Security:** PHC `scrypt` password hashing, dual JWT rotation with replay revocation, constant-time HMAC-SHA256 signature verification.
- **Resilience Engineering:** Tri-state circuit breakers (`CLOSED`, `OPEN`, `HALF_OPEN`), exponential backoff retry queues with Dead Letter Queues (DLQ), and offline Haversine routing fallback.

---

## 6. Live Staging Deployments & Useful Links

### 🌐 Live Staging Applications

- **Customer Web Application:** [https://customer-web-phi-ten.vercel.app](https://customer-web-phi-ten.vercel.app)
- **Admin Governance Console:** [https://bhojora-admin.vercel.app](https://bhojora-admin.vercel.app)
- **Restaurant Partner Portal:** [https://restaurant-web-liard-seven.vercel.app](https://restaurant-web-liard-seven.vercel.app)

### 📖 Architectural & Compliance Documentation

- [OpenAPI 3.1.0 Contract Specification](docs/01-CORE-PLANNING-DESIGN/openapi.json)
- [Architecture Decision Records (ADRs 001–007)](docs/01-CORE-PLANNING-DESIGN/ADRS.md)
- [Brand Design Tokens & Visual Guide](docs/01-CORE-PLANNING-DESIGN/BRAND.md)
- [STRIDE Threat Model & Security Sign-Off](docs/03-SECURITY-QUALITY/THREAT_MODEL_AND_SECURITY_SIGN_OFF.md)
- [Performance & Recovery Drill Evidence](docs/03-SECURITY-QUALITY/PERFORMANCE_AND_RECOVERY_REPORT.md)
- [Statutory Compliance & Launch Readiness Dossier](docs/03-SECURITY-QUALITY/LAUNCH_READINESS_DOSSIER.md)
- [Kolkata Commercial Pilot Report](docs/03-SECURITY-QUALITY/KOLKATA_PILOT_REPORT.md)
- [Pilot Evaluation & Multi-City Expansion Roadmap](docs/03-SECURITY-QUALITY/PILOT_EVALUATION_AND_EXPANSION_DECISION.md)

---

## 7. Developer Quickstart

### Prerequisites

- Node.js `22.21.0` LTS (`nvm use`)
- npm `11.12.1` or higher
- Running MongoDB instance (or automated in-memory test fallback)

### Installation & Verification

```bash
# Clone the repository
git clone https://github.com/Soumyaroy428/BHOJORA.git
cd BHOJORA

# Install dependencies across all monorepo workspaces
npm ci

# Run static checks (Formatting, Linting, Typecheck)
npm run format:check
npm run lint
npm run typecheck

# Execute complete automated regression test suite
npm run test

# Build all packages
npm run build
```

### Running the API Server Locally

```bash
# Copy development environment template
cp server/.env.example server/.env

# Start the server API
npm run start --workspace=server
# Health check available at: http://localhost:4000/api/v1/health
```

---

## 8. Intellectual Property & Legal Notice

© 2026 Bhojora Platform Ltd. All rights reserved.  
Registered office: 14 Park Street, Kolkata, West Bengal 700016, India.  
_Bhojora, the Bhojora logo, and "Food You Love. Trust You Deserve." are proprietary trademarks of Bhojora Platform Ltd._
