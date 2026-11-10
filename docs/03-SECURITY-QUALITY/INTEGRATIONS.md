# External Integrations

## 1. Integration principles

-   Wrap every provider behind an internal adapter.
-   Keep provider credentials server-side.
-   Use sandbox first.
-   Add timeout, retry, circuit breaker and fallback.
-   Persist provider request/event references.
-   Verify signatures on webhooks.
-   Never let provider failure silently corrupt business state.

## 2. Maps and location

Google Maps Platform or equivalent for geocoding, place discovery,
directions and maps. Use appropriate API key restrictions, billing
controls, quotas and privacy notices. Do not treat a Google listing as
food-safety verification.

## 3. Payments

Select an Indian provider that contractually supports the required
marketplace payment and payout model. Verify current RBI authorization
and provider terms. Implement hosted/SDK payment, signed webhooks,
idempotency, refunds, settlement and reconciliation. Do not store raw
card data.

## 4. Notifications

FCM for push; approved SMS/email/WhatsApp providers for transactional
notifications. Obtain required consent, template approvals and opt-out
controls. Queue and retry safely.

## 5. File storage

Private bucket for identity documents, inspection evidence and complaint
attachments. Public/CDN bucket only for approved menu media. Signed
upload/download URLs, MIME/size validation, malware scanning, hashes and
access logs.

## 6. AI providers

Use provider adapters and data minimization. Do not send unnecessary PII
or confidential evidence. Record model/version and prompt template for
audit. AI safety observations remain suggestions requiring human review.

## 7. IoT

Authenticate device identity, validate timestamps and units, track
calibration/health, reject stale or anomalous sensor data and preserve
provenance.

## 8. ONDC

Treat as a later integration. Complete participant-role, protocol,
operational and legal feasibility before implementation.

## 9. Provider selection checklist

Commercial terms, authorization, marketplace capability, data processing
terms, uptime, support, sandbox, webhook quality, refunds, settlement
reporting, security and exit/migration plan.
