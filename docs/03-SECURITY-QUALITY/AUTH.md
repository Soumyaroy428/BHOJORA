# Authentication and Authorization (AUTH)

## 1. Identity model

Use one identity system with role assignments and scoped memberships. A
user may hold more than one role, but active context and permissions
must be explicit.

## 2. Authentication

-   Phone/email verification with expiring OTP
-   Password hashing with Argon2id or secure equivalent
-   Optional Google/Apple OAuth
-   Secure session cookies for web where appropriate
-   Short-lived access credentials and refresh rotation for mobile/API
-   Logout, session revocation and account recovery
-   MFA for privileged admins, reviewers and finance users

## 3. Authorization

Use RBAC plus resource-level checks: - Customer can access own
profile/orders/addresses. - Restaurant staff can access assigned
restaurant/outlets only. - Delivery partner can access assigned jobs and
own earnings. - Inspector can access assigned inspection records. -
Reviewer cannot approve a report they authored. - Finance admin cannot
change safety scores. - Trust admin cannot alter payment provider
events. - Super admin actions require reason and audit.

## 4. Security controls

-   OTP send/verify throttling
-   Login attempt limits and suspicious activity controls
-   Password reset token single-use and expiry
-   Session/device listing and revoke
-   CSRF protection for cookie sessions
-   CORS allowlist
-   Secure, HttpOnly, SameSite cookies where used
-   Secure token storage on mobile
-   No secrets or OTPs in logs
-   Authorization tests for every protected route

## 5. Account lifecycle

PENDING_VERIFICATION, ACTIVE, SUSPENDED, LOCKED, DEACTIVATED,
DELETION_REQUESTED. Define permitted transitions and user notices.

## 6. Test matrix

Test unauthenticated access, wrong role, wrong tenant/outlet, expired
token, revoked session, IDOR, privilege escalation, replayed OTP, brute
force and reviewer self-approval.

## 7. Implementation Contract (Checkpoint 07 Baseline)

- **Hashing & Secrets:** Passwords use Node `crypto.scrypt` PHC format (`$scrypt$n=16384,r=8,p=1$...`); OTP codes, refresh tokens, and recovery tokens are hashed before persistence (`auth_challenges`, `user_sessions`).
- **Session Revocation:** Access tokens are HS256 JWTs (`900s` default TTL) validated on every request against `user_sessions` (`revokedAt === null`), making `logout`, `logout-all`, `DELETE /auth/sessions/:sessionId`, and password reset immediate.
- **Refresh Reuse Detection:** Refresh rotation atomically rotates `refreshTokenHash` and preserves `previousRefreshTokenHash`; presenting a consumed refresh token revokes the session (`REFRESH_TOKEN_REPLAY_DETECTED`) and rejects the request.
- **Transport & CSRF:** API/mobile callers use `Authorization: Bearer`; browser cookie sessions (`X-Bhojora-Session-Mode: cookie`) issue `HttpOnly`, `SameSite=Lax`, `Secure` auth cookies paired with `bhojora_csrf` + `X-Csrf-Token` verification on cookie-authenticated mutations.
- **Public Registration Hardening:** `/auth/register` always assigns `CUSTOMER` role regardless of caller payload; privileged role assignment and RBAC enforcement matrices are layered in Checkpoint 08.

## 8. Implementation Contract (Checkpoint 08 Baseline)

- **Permission Matrix & Role Context:** All 12 `USER_ROLES` map to explicit least-privilege permissions (`client/shared/contracts/rbac.ts`, `server/src/modules/rbac/rbac.policy.ts`). Multi-role callers may select an active role via `X-Bhojora-Active-Role`, rejected with `403 FORBIDDEN` if not assigned to that account.
- **Session-Bound Step-Up MFA:** `INSPECTION_REVIEWER`, `OPS_ADMIN`, `TRUST_ADMIN`, `FINANCE_ADMIN`, and `SUPER_ADMIN` require `mfaVerified: true` on the active session (`POST /api/v1/auth/mfa/send` + `POST /api/v1/auth/mfa/verify`), rejecting unverified privileged access with `403 FORBIDDEN` (`code: 'MFA_REQUIRED'`).
- **Tenant & Resource Isolation:** Partner outlet routes check `ACTIVE` memberships in `restaurant_staff` (`restaurantId` + `outletId`); customer and delivery endpoints enforce ownership; inspection approval rejects self-approval with `403 SELF_APPROVAL_PROHIBITED`; all privileged role updates and access denials write append-only records to `audit_logs`.

## 9. Customer Data Isolation, Deletion & Retention Flow (Checkpoint 09 Baseline)

- **Strict Customer Ownership Isolation:** Customer profile (`/api/v1/customer/profile`), saved Kolkata delivery addresses (`/api/v1/addresses`, `/api/v1/addresses/:addressId`), append-only consent history (`/api/v1/customer/consents`), privacy export (`/api/v1/customer/privacy/export`), and deletion requests (`/api/v1/customer/account/deletion-request`) resolve the actor strictly from the verified JWT `sub` (`auth.userId`). Accessing or mutating another user's saved `addressId` fails with `403 FORBIDDEN` and records `address.ownership.denied` in `audit_logs`.
- **Consent & Location Privacy:** Optional marketing (`MARKETING_PROMOTIONS`) defaults to `false`. Browser geolocation (`locationPermissionState`) requires explicit pre-prompt purpose disclosure and handles `granted`, `denied` (`ST-06`), and `manual` Kolkata corridor fallback without background tracking. Granular consent opt-in/withdrawal writes immutable events into `consent_records`.
- **Account Deletion & Statutory Retention Lifecycle:**
  1. Customer confirms self-service deletion (`POST /api/v1/customer/account/deletion-request` with `confirmText: "DELETE"`).
  2. Server transitions `users.status` from `ACTIVE` to terminal `DELETION_REQUESTED`, revokes all `user_sessions` immediately, records `deletionRequest.status = "PENDING_RETENTION"` with `scheduledPurgeAt = requestedAt + 30 days` on `customer_profiles`, logs an `ACCOUNT_DELETION` consent/audit entry, and returns `Clear-Site-Data: "cookies", "storage"`.
  3. Re-authentication, OTP login, token refresh, and password recovery are blocked immediately while in `DELETION_REQUESTED`.
  4. After the **30-day statutory retention window**, automated erasure anonymizes Tier 3 PII (`name`, phone, email, saved street addresses, landmarks), while pseudonymous order, refund, and GST financial ledgers remain under Indian statutory tax retention (`ADR-007`, `DATABASE.md` §5). Active delivery GPS events retain for up to **24 hours** post-delivery unless linked to an open safety incident.

## 10. Restaurant Onboarding Isolation, Private Documents & Review Governance (Checkpoint 10 Baseline)

- **Applicant Ownership & Masking:** `/api/v1/restaurant/applications*` derives `ownerUserId` solely from `auth.userId`. Cross-applicant reads/mutations return `403 FORBIDDEN` and write `DENIED` events into `audit_logs`. PAN numbers and settlement bank account numbers are masked (`panMasked`, `bankAccountMasked`) and stored with HMAC-SHA256 digests (`panHash`, `bankAccountHash`).
- **Private Compliance Documents (`PRIVATE_COMPLIANCE`, `isPublic: false`):** Compliance files (FSSAI certificate, PAN card, cancelled cheque, trade license, premises proof) are registered through single-use HMAC-signed upload tokens (`/documents/upload-url` -> `/documents`), sanitized against path traversal, and strictly omitted from `/api/v1/restaurants`. Signed read grants (`GET /api/v1/restaurant/documents/:documentId/access`) return `Cache-Control: no-store`, expire in `120` seconds, permit ONLY the owning applicant or an MFA-verified admin (`ops:outlet:manage`), and log every grant or denial in `audit_logs`.
- **MFA-Enforced Admin Review & Self-Review Prohibition:** `/api/v1/admin/restaurant-applications*` requires `ops:outlet:manage` plus `mfaVerified: true`. Reviewers cannot review their own application (`SELF_REVIEW_PROHIBITED`), must provide an explicit audit reason (`>= 8` chars), and statutory `fssaiVerificationStatus` never grants or alters `platformInspectionStatus` (`NOT_INSPECTED` / `publishedSafetyScore: null`).
- **Tenant-Isolated Outlet Operations & GeoJSON Pin Governance (Checkpoint 11):** `/api/v1/restaurant/outlets*` checks active tenant membership (`hasOutletMembership` across `restaurantId` & `outletId`), logs `DENIED` audit events on cross-tenant attempts (`403 FORBIDDEN`), uses `.strict()` schemas so partners cannot modify `platformInspectionStatus`, `publishedSafetyScore`, or FSSAI state, validates `[longitude, latitude]` GeoJSON coordinate order (rejecting swapped `[lat, lng]`), and restricts Kolkata zone Polygon mutations (`/api/v1/admin/zones*`) to MFA-verified `ops:outlet:manage` operators.
- **Catalog, Menu & Audited Paise Governance (Checkpoint 12):** `/api/v1/restaurant/menu/*` enforces `restaurant:menu:manage` (denying `KITCHEN_STAFF` with `403 FORBIDDEN`) plus active outlet membership across `restaurantId` and `outletId`, writes append-only `audit_logs` on every category/item/price/allergen/availability mutation and cross-tenant denial, validates integer INR paise bounds, and blocks non-`https://` or `private/compliance` image URLs from public `/api/v1/outlets/:id/menu`.
- **Public Discovery Abuse Controls & Truth-in-Claims Invariant (Checkpoint 13):** `/api/v1/search`, `/api/v1/restaurants`, and `/api/v1/categories` cap `q <= 80` chars and `limit` (`1..25`), strip/block control characters and execute ReDoS-safe token matching, validate Base64url pagination cursors against an active query-parameter hash (`400 VALIDATION_ERROR` on mismatch), apply sliding-window per-IP rate limiting (`429 RATE_LIMITED` + `Retry-After`), exclude `SUSPENDED` kitchens, and guarantee via `buildDiscoveryTrustBadge()` that only `ACTIVE` outlets with `platformInspectionStatus === 'VERIFIED_CLEAN'` and numeric `publishedSafetyScore > 0` ever display `Verified Clean` badges or scores (keeping FSSAI registration strictly separated).

## 11. Single-Outlet Cart Isolation & Anti-Tampering Pricing Controls (Checkpoint 14 Baseline)

- **Authenticated Cart & Quote Isolation:** `/api/v1/cart*` and `/api/v1/checkout/quote*` require `order:own:read` or `order:own:create` permissions (`401`/`403` enforced) and scope all carts and signed quotes strictly to `auth.userId`. Cross-customer quote reads or verification attempts (`/checkout/quotes/:quoteId*`) fail closed with `403 FORBIDDEN`.
- **Prohibited Client Monetary Overrides:** Requests attempting to inject `pricePaise`, `unitPricePaise`, `totalPayablePaise`, `discountPaise`, `gstTaxPaise`, `deliveryFeePaise`, or `signature` are rejected outright (`400 VALIDATION_ERROR`); pricing derives solely from authoritative server `CatalogStore`, outlet fee/radius configuration, and `PricingStore` coupon rules in integer paise (`ADR-018`).
- **Cryptographic Quote Binding & 600s Expiry:** Each generated quote carries an HMAC-SHA256 signature binding `quoteId`, `customerId`, `outletId`, `expiresAt`, itemized/fee/tax/discount integers, and `totalPayablePaise`, expiring after `600` seconds (`409 CONFLICT` once expired; `403 FORBIDDEN` if stored amounts/signature are altered).

## 12. Zero Raw Card Storage, Webhook Replay Cutoff & Payment State Locking (Checkpoint 15 Baseline)

- **Zero Raw Card PAN/CVV Persistence (`ADR-007`, `ADR-019`):** `/api/v1/payments/*` rejects raw card fields (`cardNumber`, `pan`, `cvv`, `cvc`, `expiry`, `cardExpiry`, `pin`, `trackData`) and PAN-length digit sequences (`400 VALIDATION_ERROR`) and stores only masked UPI VPAs, last-4 card metadata, and sandbox token references across `payments`, `payment_events`, and logs.
- **Idempotency & Cross-Customer Isolation:** `POST /api/v1/payments/create` requires an `Idempotency-Key` header checked against SHA-256 request hashes (`409 IDEMPOTENCY_CONFLICT` on mismatched payload reuse) and binds integer `amountPaise` exclusively from `PricingService.verifyQuoteForCheckout()`. `/payments/:paymentId` and `/payments/:paymentId/reconcile` enforce customer ownership or MFA-verified `finance:settlement:read`, auditing cross-customer `403 FORBIDDEN` denials.
- **Signed Webhook Replay Window, Deduplication & Terminal Protection:** `/api/v1/webhooks/payments/:provider` enforces HMAC-SHA256 constant-time verification and `X-Webhook-Timestamp` within `300` seconds (`401 UNAUTHORIZED` for forged signatures or expired timestamps), deduplicates `(provider, eventId)` atomically in `integration_webhook_events`, ignores out-of-order failure webhooks once `CAPTURED` (`LATE_WEBHOOK_IGNORED`), and permits deterministic `UNKNOWN` reconciliation via late verified webhooks or sandbox polling (`reconciliation_records`).

## 13. Order State Machine Isolation, Idempotency & Cancellation Boundaries (Checkpoint 16 Baseline)

- **Server-Derived Order Creation & Cross-Customer / Cross-Outlet Isolation:** `POST /api/v1/orders` rejects client-injected status, price, discount, tax, or total fields (`400 VALIDATION_ERROR`), binds totals from verified HMAC-SHA256 checkout quotes, and enforces `customerId === auth.userId` on `/orders*` plus tenant outlet membership (`hasOutletMembership`) on `/restaurant/orders*`, logging cross-tenant denials (`403 FORBIDDEN`) to immutable `audit_logs`.
- **Optimistic Version CAS Locks & Terminal Immutability:** Concurrent order cancellations and kitchen/delivery transitions compete atomically on `(orderId, expectedStatuses, version)`, ensuring exactly one winner succeeds and losers deterministically receive `409 CONFLICT` without corrupting `DELIVERED` or `CANCELLED` terminal records or `order_events` append-only history.
- **Role-Based Cancellation Matrix:** Customer self-service cancellation is strictly gated to `AWAITING_PAYMENT` and `CONFIRMED` (`409 CONFLICT` once `PREPARING+`); customers cannot advance order fulfillment states directly (`403 FORBIDDEN`), relying on verified `PaymentService` capture callbacks (`AWAITING_PAYMENT -> CONFIRMED`) and outlet/delivery RBAC permissions downstream.
