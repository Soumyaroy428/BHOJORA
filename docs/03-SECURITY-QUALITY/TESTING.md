# Testing and Quality Assurance

## 1. Test pyramid

-   Unit: business rules, validators, price calculations, state
    transitions and scoring policy.
-   Integration: database repositories, transactions, payment adapter,
    queues and storage.
-   Contract: OpenAPI schemas and provider webhook contracts.
-   End-to-end: customer order, restaurant processing, delivery,
    inspection and complaint flows.
-   Security: auth, IDOR, privilege escalation, injection, upload and
    webhook attacks.
-   Performance: search, menu, checkout, order tracking and admin
    reports.
-   Recovery: backups, restore and queue replay.

## 2. Required scenarios

### Commerce

-   Price changes after cart
-   Item becomes unavailable
-   Duplicate order submission
-   Payment timeout and late webhook
-   Duplicate/replayed webhook
-   Restaurant rejection
-   Cancellation race
-   Refund partial/full
-   Settlement mismatch

### Delivery

-   Partner declines/times out
-   Partner goes offline
-   Reassignment
-   GPS permission denied
-   Stale GPS
-   Invalid pickup/drop OTP
-   Failed delivery and incident

### Trust

-   Inspector unauthorized
-   Inspector self-approval attempt
-   Missing evidence
-   Critical violation
-   Report correction/version
-   Expired assessment
-   Score policy version change
-   Public/private evidence leakage
-   Appeal and reinspection

### Access and privacy

-   Cross-customer order access
-   Cross-outlet restaurant access
-   Cross-inspector assignment access
-   Admin permission boundary
-   Consent withdrawal
-   Data retention/deletion request

## 3. CI gates

Format, lint, typecheck, unit tests, integration tests, dependency scan,
secret scan and build must pass before merge.

## 4. Test data

Use synthetic users, restaurants, locations and inspection reports.
Never copy real customer PII or actual identity documents into test
fixtures.

## 5. Release quality

No unresolved critical/high security defect. Critical commerce and trust
flows must have automated regression tests. Record test evidence in
checkpoint report.
