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
