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
