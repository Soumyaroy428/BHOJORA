# Threat Model, Privacy Hardening & Security Sign-Off

## 1. Executive Summary & Security Sign-Off

This document constitutes the formal **Security and Privacy Sign-Off** for the BHOJORA platform, fulfilling the requirements of **Checkpoint 34**.

- **Sign-off Date:** 2026-11-14
- **Lead Security Evaluator:** Soumya Roy (Lead Platform Engineer & Architect)
- **Status:** **APPROVED & SIGNED OFF**
- **Unresolved Critical Vulnerabilities:** **0**
- **Unresolved High Vulnerabilities:** **0**
- **Compliance Standard:** Digital Personal Data Protection Act (DPDP Act 2023) & RBI Guidelines for Payment Aggregators

---

## 2. STRIDE Threat Model

| STRIDE Threat Category | Threat Scenario | Mitigation Architecture in BHOJORA | Verification Status |
| :--- | :--- | :--- | :--- |
| **Spoofing Identity** | Attacker impersonates an inspector or platform operator. | Cryptographically signed JWT tokens, Argon2id password hashing, mandatory Step-up MFA for all privileged roles (`SUPER_ADMIN`, `OPS_ADMIN`, `TRUST_ADMIN`). | VERIFIED (Zero bypass) |
| **Tampering with Data** | Attacker tampers with inspection scores or modifies order prices in transit. | Server is strictly authoritative for quote calculations. Approved inspection reports are immutable; any correction generates a new versioned entry. SHA-256 evidence hashing. | VERIFIED (State invariant enforced) |
| **Repudiation** | Operator denies approving a suspended restaurant or refunding an order. | Append-only immutable audit logs tracking `userId`, `role`, `timestamp`, `action`, and `ipAddress` across all mutations. | VERIFIED (Audit trail intact) |
| **Information Disclosure** | Leak of customer phone numbers or exact residential delivery coordinates. | PII minimization: masked customer phones (`+9198300****23`), generalized street addresses in analytics, tokenized payment references, zero raw PAN storage. | VERIFIED (DPDP compliant) |
| **Denial of Service** | Volumetric brute-force on OTP endpoints or DoS on routing APIs. | Tiered IP and account rate limiting, strict JSON body size ceilings (100kb), circuit breakers on external integrations, offline fallback routing. | VERIFIED (Rate limiters active) |
| **Elevation of Privilege** | Normal customer attempts to approve an AI proposal or review delivery onboarding. | Centralized RBAC middleware with strict `assertMfaSatisfiedForRole` and role-permission matrix validation. | VERIFIED (403 Forbidden verified) |

---

## 3. Data Protection & Privacy Rights (DPDP Act 2023)

BHOJORA enforces compliance with the Digital Personal Data Protection Act, 2023:

### 3.1 Right to Access and Data Portability
- End users can request a complete export of their personal profile, order history, and preferences via `POST /api/v1/privacy/requests` (`requestType: ACCESS_EXPORT`).
- Sensitive authentication credentials (`passwordHash`, `salt`, `sessionTokens`) are automatically redacted prior to export generation.

### 3.2 Right to Erasure ("Forget Me")
- End users can request account deletion via `POST /api/v1/privacy/requests` (`requestType: ERASURE_FORGET_ME`).
- Upon verification, the user's name is anonymized to `Deleted User`, telephone numbers and email addresses are cryptographically scrubbed, account state is shifted to `SUSPENDED`, and all active JWT sessions are revoked.
- Statutory financial records (GST tax invoices, reconciliation ledgers) are preserved in anonymized form as required by Indian commercial law.

### 3.3 Explicit Consent Management
- Granular consent controls (`orderTrackingGps`, `marketingSmsEmail`, `analyticsCookies`) are captured with audit timestamps.
- Users can revoke non-essential consent at any time via `POST /api/v1/privacy/consent`.

### 3.4 Data Retention & Purge Schedules
- **Ephemeral GPS Telemetry:** Retained for 30 days for transit validation, then purged.
- **Temporary OTPs & Rate Limits:** Purged upon expiry (10 minutes).
- **Financial & Order Ledgers:** Retained for 7 years per statutory tax requirements.

---

## 4. Security Incident Response Playbook

### 4.1 Severity Classifications
- **P0 (Critical):** Data breach involving personal data, complete service outage, unauthorized admin elevation.
  - **Action:** Immediate containment, session invalidation, forensic snapshot, and **mandatory notification to CERT-In (Indian Computer Emergency Response Team) within 6 hours** of confirmation.
- **P1 (High):** Circuit breaker trip on payment gateway, localized DDoS, isolated partner account compromise.
- **P2 (Medium):** Non-critical third-party API degradation, false-positive security scanner alert.
- **P3 (Low):** Minor UI styling defect, cosmetic telemetry bug.

### 4.2 Logging & Audit
- All security incidents are recorded in the incident ledger with root cause, affected scope, and resolution timestamp via `POST /api/v1/privacy/admin/incident`.
