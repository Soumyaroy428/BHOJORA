# Debugging and Incident Handling

## 1. Bug report template

-   Summary
-   Environment and app version
-   User role and permission scope (no sensitive identifiers)
-   Steps to reproduce
-   Expected result
-   Actual result
-   Request/correlation ID
-   Sanitized logs
-   Frequency and impact
-   Screenshot/video if safe
-   Recent changes

## 2. Debugging rules

-   Reproduce before changing code.
-   Read full stack trace and identify first application frame.
-   Check environment variables and provider sandbox status without
    exposing secrets.
-   Verify network request, status, response and request ID.
-   Check database indexes and query plans for slow queries.
-   Check queue retry/dead-letter status.
-   Check provider webhook delivery and signature verification.
-   Never disable auth, validation or signature checks to make a test
    pass.
-   Never use production PII in local debugging.

## 3. Severity

P0: safety, data breach, payment corruption or platform-wide outage. P1:
major ordering/payment/delivery or trust workflow blocked. P2: degraded
feature with workaround. P3: cosmetic/minor issue.

## 4. Incident workflow

Detect -\> triage -\> contain -\> preserve evidence -\> communicate -\>
remediate -\> test -\> deploy with approval -\> monitor -\> postmortem.

## 5. Payment incident

Do not retry blindly. Query provider by reference, inspect webhook
events and reconcile before changing payment/order state.

## 6. Trust incident

Freeze publication if report integrity is questioned. Preserve
versions/evidence and audit logs. Restrict access, conduct independent
review and publish corrections transparently where warranted.

## 7. Postmortem

Record timeline, impact, root cause, detection gap, remediation, owner
and due date. Blameless review; do not erase audit history.
