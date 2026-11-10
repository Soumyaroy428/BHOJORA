# BHOJORA — Food You Love. Trust You Deserve.

> A full-scale food delivery and trust transparency platform launching in Kolkata, West Bengal, India.

---

## 1. Executive Overview

**BHOJORA** combines the on-demand convenience and commercial capabilities of modern food delivery platforms with an **independent, evidence-backed kitchen verification and food safety transparency engine**.

Consumers can discover restaurants, order meals with real-time delivery tracking, and inspect verifiable kitchen audit reports. Restaurants manage orders, catalogs, and hygiene compliance. Delivery partners receive optimized dispatch offers with fair earnings. Independent inspectors record cryptographically verifiable audit trails.

---

## 2. Four Locked Product Decisions

1. **Platform: BOTH Web & Mobile**
   - **Customer Web**: Next.js (SSR/SSG, SEO-optimized, accessible).
   - **Customer Mobile**: React Native + Expo (cross-platform iOS & Android).
   - **Restaurant Dashboard**: Next.js (desktop/tablet order management).
   - **Delivery Partner App**: React Native + Expo (battery-conscious live GPS tracking).
   - **Inspector App**: React Native + Expo (offline-first evidence collection & hashing).
   - **Admin & Governance Console**: Next.js (multi-tenant RBAC, financial settlement, safety audits).
2. **Initial Launch: Kolkata, West Bengal, India**
   - Launch delivery zones across Kolkata (Salt Lake, New Town, Park Street, South Kolkata, etc.).
   - Asia/Kolkata timezone (`UTC+05:30`), INR currency (integer paise), Bengali & English localization ready.
   - Configurable delivery zones for scalable multi-city expansion.
3. **Kitchen Verification: Independent & Governed**
   - Independent inspectors conduct on-site physical audits with photo/video evidence hashing.
   - Separation of duties: Inspectors cannot approve their own reports; independent reviewers verify submissions.
   - Critical safety violations override numerical weighted scores.
   - Scores cannot be purchased, sponsored, or altered by platform subscriptions.
   - Distinct from statutory FSSAI licenses (never misrepresented as government certifications).
4. **Development Target: FULL (All 13 Feature Domains)**
   - Complete multi-sided ecosystem built incrementally across 39 verifiable checkpoints.

---

## 3. Brand Identity & Visual Tokens

- **Primary Terracotta (`#8D352A`):** Indian warmth, appetite, grounding brand identity.
- **Warm Cream (`#F7F1E6`):** Soft, unbleached canvas neutral for cards and backgrounds.
- **Trust Green (`#344B3E`):** Restrained, factual indicator for verified kitchen hygiene.
- **Saffron Gold (`#E4A746`):** Celebratory accent, special offers, and primary highlights.
- **Typography:** `Manrope` (Headings, Buttons, Display) and `Inter` (Body, Tables, Dietary details).

---

## 4. Repository Structure

Per architectural governance, the root directory strictly contains **ONLY three folders**:

```text
BHOJORA/
├── docs/                   # Complete architecture, PRD, security, database & checkpoint roadmaps
│   ├── 01-CORE-PLANNING-DESIGN/
│   ├── 02-EXECUTION-AGENTS/
│   ├── 03-SECURITY-QUALITY/
│   ├── CHECKPOINTS/
│   ├── BRAND.md
│   └── INDEX.md
├── client/                 # All web and mobile user interfaces
│   ├── customer-web/       # Bhojora customer web (Next.js)
│   ├── restaurant-web/     # Bhojora Partner dashboard (Next.js)
│   ├── admin-web/          # Bhojora Control console (Next.js)
│   ├── customer-mobile/    # Bhojora Customer mobile app (React Native / Expo)
│   ├── delivery-mobile/    # Bhojora Delivery partner app (React Native / Expo)
│   ├── inspector-mobile/   # Bhojora Inspect mobile app (React Native / Expo)
│   └── shared/             # Design tokens, UI components, shared TypeScript types
└── server/                 # Modular monolith backend API & services
    ├── src/
    │   ├── config/         # Environment, database, and service configs
    │   ├── middleware/     # Auth, RBAC, Zod validation, rate limiting
    │   └── modules/        # Domain modules (identity, catalog, orders, safety, etc.)
    └── tests/              # Unit, integration, and contract test suites
```

---

## 5. The 13 Mandatory Feature Domains

- **F01 — Identity, Profiles & Access:** Unified auth, OTP verification, RBAC, tenant isolation.
- **F02 — Discovery, Location & Search:** Geospatial discovery, Kolkata zones, dietary & safety filters.
- **F03 — Restaurant, Outlet & Catalog:** Outlets, menus, variants, allergens, operating hours.
- **F04 — Cart, Checkout, Pricing & Ordering:** Authoritative price quote, single-outlet cart, state transitions.
- **F05 — Payments, Refunds & Settlements:** Indian payment gateway, idempotency, webhook deduplication.
- **F06 — Delivery Partner & Logistics:** Partner onboarding, dispatch engine, OTP proof of delivery.
- **F07 — Independent Kitchen Inspection:** Digital audit checklist, tamper-evident evidence capture.
- **F08 — Trust Profile, Score & Traceability:** Public safety score, QR code profiles, critical violation alerts.
- **F09 — Reviews, Complaints & Support:** Verified-order feedback, food safety complaint triage.
- **F10 — Promotions, Loyalty & Memberships:** Coupons, referral attribution, loyalty ledger.
- **F11 — Restaurant Operations & Analytics:** Live kitchen board, stock toggles, cleaning logs, sales metrics.
- **F12 — Administration, Finance & Governance:** Platform-wide oversight, financial reconciliation, safety audit.
- **F13 — AI, Automation & External Integrations:** Human-supervised AI recommendations, risk detection, forecasting.

---

## 6. Development & Deployment Workflow

### Checkpoint-Driven Execution
Development follows 39 granular checkpoints (`CHECKPOINT_00.md` to `CHECKPOINT_38.md`). Each checkpoint follows the strict cycle:
`Understand` ➔ `Plan` ➔ `Implement` ➔ `Test` ➔ `Review` ➔ `Report` ➔ `Founder Approval` ➔ `GitHub Push` ➔ `Deployment & Verification` ➔ `Acceptance`.

### Deployment Targets
- **Web Applications (`client/customer-web`, `client/restaurant-web`, `client/admin-web`):** Vercel with dedicated domain/subdomain routing.
- **Mobile Applications (`client/*-mobile`):** Expo Application Services (EAS) for Android and iOS builds.
- **Backend API & Real-time Services (`server`):** Containerized Node.js services with managed MongoDB and Redis.

---

## 7. License & Notice

*BHOJORA is a proprietary platform. All intellectual property, trademarks, and documentation are reserved.*
