# BHOJORA — Official Brand Identity & Design Contract

## 1. Brand Identity Overview

- **Brand Name:** BHOJORA
- **Tagline:** Food You Love. Trust You Deserve.
- **Brand Direction:** Indian warmth + premium technology.
- **Brand Positioning:** An Indian food-tech platform connecting customers with restaurants and food businesses while providing accessible, truthful information about kitchen assessments and food-safety practices.
- **Mission:** Make discovering and ordering food convenient while helping customers make better-informed choices through transparency.
- **Vision:** Become one of India's most trusted food discovery and delivery platforms.
- **Core Values:** Trust, Transparency, Taste, Convenience, Accountability, Innovation.
- **Brand Promise:** Delicious choices. Transparent information. Better-informed decisions.

---

## 2. Brand Architecture

| Sub-Brand | Product Surface | Purpose | Audience |
| :--- | :--- | :--- | :--- |
| **Bhojora** | `client/customer-web` | Public food discovery, menu browsing, ordering, and trust profiles | Consumers |
| **Bhojora Mobile** | `client/customer-mobile` | Native iOS & Android consumer ordering, live delivery tracking | Consumers on the go |
| **Bhojora Partner** | `client/restaurant-web` | Restaurant onboarding, catalog management, live kitchen prep board, settlements | Restaurant owners, managers, kitchen staff |
| **Bhojora Delivery** | `client/delivery-mobile` | Order acceptance, navigation, pickup/delivery OTP verification, earnings | Delivery partners |
| **Bhojora Inspect** | `client/inspector-mobile` | Scheduled kitchen audits, structured checklists, tamper-evident evidence capture | Authorized independent inspectors |
| **Bhojora Trust** | `client/customer-web/trust` | Public kitchen safety audit reports, history, QR profile verification | Public, food safety advocates, regulators |
| **Bhojora Control** | `client/admin-web` | Multi-tenant RBAC, financial reconciliation, safety governance, dispute resolution | Support, finance, trust & safety admins, super admins |

---

## 3. Visual Design System & Palette

### Primary Color Palette

```css
:root {
  /* Brand Core Palette */
  --color-bhojora-terracotta: #8D352A; /* Primary brand tone: Indian warmth, appetite, grounding */
  --color-bhojora-cream: #F7F1E6;      /* Background & card canvas: soft, warm, unbleached */
  --color-bhojora-trust-green: #344B3E; /* Trust & verification: restrained, factual, disciplined */
  --color-bhojora-saffron: #E4A746;    /* Accent: golden celebrations, highlights, active states */

  /* Neutral Spectrum (OKLCH-tinted to avoid lifeless pure #000000 or #ffffff) */
  --color-neutral-900: #1C1917;        /* Primary text */
  --color-neutral-700: #44403C;        /* Secondary text / labels */
  --color-neutral-500: #78716C;        /* Muted captions / icons */
  --color-neutral-300: #D6D3D1;        /* Borders / dividers */
  --color-neutral-100: #F5F5F4;        /* Surface secondary */

  /* Semantic State Palette */
  --color-status-success: #2E7D32;     /* Verified / compliant */
  --color-status-warning: #ED6C02;     /* Corrective action pending / expiring */
  --color-status-critical: #D32F2F;    /* Critical safety violation / suspended */
  --color-status-info: #0288D1;        /* General operational info */
}
```

### Typography Hierarchy

- **Headings & Display:** `Manrope` (Weights: 600 SemiBold, 700 Bold, 800 ExtraBold) — geometric, confident, friendly yet authoritative.
- **Body & Data Tables:** `Inter` (Weights: 400 Regular, 500 Medium) — maximum legibility for dietary details, ingredients, timestamps, and addresses.
- **Buttons & Interactive CTAs:** `Manrope SemiBold` (`font-weight: 600`, tracking: 0.01em).

---

## 4. Logo & Iconography Direction

- **Plate & Stamp Geometry:** A circular plate silhouette embracing a subtle, balanced verification mark.
- **Multi-Format Adaptation:** Designed to scale seamlessly across monochrome receipts, packaging seals, mobile app icons, high-density web headers, and printed inspection QR certificates.
- **Icon Style:** 2px stroke weight, rounded caps and corners, matching the geometry of Manrope.

---

## 5. Trust & Safety Communication Rules (Non-Negotiable)

1. **Clear Distinction from Government Bodies:** Independent platform kitchen assessments must NEVER be described as government inspections or FSSAI statutory certifications.
2. **Mandatory Metadata Display:** All public trust profiles must display assessment date, audit scope, checklist methodology version, validity window, and known limitations.
3. **No Safety Guarantees:** Never claim or imply that every single meal prepared by a verified kitchen is 100% risk-free.
4. **Anti-Corruption Rule:** Restaurants cannot purchase higher safety scores, buy sponsored placement disguised as safety badges, or hide critical violations through subscriptions.
5. **Transparency on Status:** Clearly render `NOT_INSPECTED`, `PENDING_REVIEW`, `VERIFIED`, `CORRECTIVE_ACTION_REQUIRED`, `SUSPENDED`, and `EXPIRED` with unambiguous visual markers.

---

## 6. Legal Notice

*BHOJORA is a proposed working brand pending trademark, MCA incorporation, domain registration, and social handle clearance. Do not represent the brand as registered until legal verification is formalized.*
