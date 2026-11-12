# Database Design

## 1. Database strategy

MongoDB + Mongoose. Use references for independently managed entities;
embed only bounded data read and updated with its parent. Store money as
integer paise. Use UTC timestamps.

## 2. Collections by domain

Identity: users, user_sessions, roles, permissions, consent_records,
addresses, customer_profiles. Restaurant: restaurants,
restaurant_outlets, restaurant_staff, restaurant_documents,
outlet_hours. Catalog: menus, menu_categories, menu_items,
item_customizations, inventory_records. Commerce: carts, orders,
order_items, order_events, pricing_quotes, coupons. Payments: payments,
payment_events, refunds, settlements, reconciliation_records,
idempotency_keys. Delivery: delivery_partners, delivery_assignments,
delivery_location_events, delivery_incidents. Trust: inspectors,
inspector_authorizations, inspection_assignments, inspections,
checklist_templates, checklist_results, inspection_evidence,
inspection_reviews, safety_scores, safety_events, corrective_actions,
appeals. Engagement: reviews, complaints, support_tickets,
notifications, loyalty_ledger. Governance: audit_logs, feature_flags,
policy_versions, integration_webhook_events.

## 3. Core document fields

User: normalized email/phone, password hash or external identity, roles,
status, timestamps. Outlet: restaurantId, name, GeoJSON Point
\[longitude, latitude\], address, operating hours, service status. Menu
item: outletId, categoryId, title, description, pricePaise, tax
classification, dietary tags, declared allergens, availability and media
refs. Order: customerId, outletId, state, currency, price snapshot,
address snapshot, payment reference, timestamps. Order item: menuItemId,
title/price/tax/customization snapshots and quantity. Payment: orderId,
provider, provider references, amountPaise, currency, status,
idempotency key. Inspection: outletId, inspectorId, assessmentType,
checklistVersion, scope, findings, evidence refs, status, reportVersion,
reviewerId, approvedAt. Safety score: outletId, inspectionId,
policyVersion, categoryScores, total, critical status, validity period,
publication status.

## 4. Indexes

-   unique normalized email/phone where present
-   `2dsphere` on outlet location
-   outletId + availability + categoryId on menu items
-   customerId + createdAt and outletId + status + createdAt on orders
-   unique provider + providerPaymentId
-   unique providerEventId
-   partnerId + status on assignments
-   outletId + inspectionDate and inspectorId + status
-   outletId + publishedAt on public safety projections
-   actorId + createdAt and resourceType + resourceId + createdAt on
    audit logs
-   unique operation + idempotency key
-   unique `applicationId` and `restaurantId`, `ownerUserId + updatedAt`, and `onboardingStatus + submittedAt` on `restaurants`
-   unique `outletId` and `2dsphere` location on `restaurant_outlets`
-   compound discovery indexes on `restaurant_outlets`: `status + zoneId + platformInspectionStatus + publishedSafetyScore` and `status + cuisines + brandName`
-   compound dish search indexes on `menu_items`: `outletId + isAvailable + dietaryType + pricePaise` and `isAvailable + title`
-   unique `cityCode + zoneCode` and `2dsphere` boundary on `delivery_zones`
-   unique `outletId` and `restaurantId` on `outlet_hours`
-   unique `documentId` and `restaurantId + documentType + uploadedAt` on `restaurant_documents`

## 5. Integrity and retention

-   Use MongoDB transactions for supported multi-document critical
    operations.
-   Payment events are append-only.
-   Approved inspections are immutable; amendments create a new version.
-   Evidence files are private object storage objects; database stores
    metadata, checksum and access classification.
-   GPS records have short, justified retention.
-   Apply TTL only after legal/business retention approval.
-   Back up and test restore.
-   Use schema validation and migration/index scripts.

## 6. Safety scoring

Suggested policy: 25% cleanliness, 20% storage, 20% employee hygiene,
15% pest control, 20% food handling. Scores are provisional until
reviewed by qualified food-safety professionals. Critical findings
trigger separate status/escalation; they cannot be averaged away.
Persist policy version and evidence.

## 7. Example documents

### Order

``` json
{
  "customerId": "ObjectId",
  "outletId": "ObjectId",
  "status": "PAYMENT_PENDING",
  "currency": "INR",
  "totalPaise": 49900,
  "itemsSnapshot": [],
  "addressSnapshot": {},
  "createdAt": "Date"
}
```

### Inspection

``` json
{
  "outletId": "ObjectId",
  "inspectorId": "ObjectId",
  "assessmentType": "INDEPENDENT",
  "status": "SUBMITTED",
  "checklistVersion": 1,
  "evidenceIds": [],
  "criticalFindings": [],
  "reviewerId": null,
  "reportVersion": 1
}
```

## 8. Model conventions (Checkpoint 06)

-   All domain schemas call `applyBaseSchemaConventions()` (`server/src/database/conventions.ts`), enforcing `timestamps: true` (UTC), `strict: true`, `versionKey: false`, and string `id` JSON serialization.
-   Monetary fields must use `paiseField()` (non-negative safe integers per ADR-003).
-   Spatial coordinates use `createGeoPointSubSchema()` and `createGeoPolygonSubSchema()` (`[longitude, latitude]` GeoJSON standard).
-   Append-only audit and ledger collections (`payment_events`, `order_events`, `safety_events`, `audit_logs`) enable `{ appendOnly: true }` to block in-place `updateOne`/`deleteOne` mutations at the Mongoose layer.

## 9. Repeatable index and seed strategy

-   `MONGODB_AUTO_INDEX=false` is enforced by default in `production`; indexes are provisioned declaratively via `npm run db:indexes --workspace=server` (`server/src/database/indexes.ts`) using idempotent `createIndexes` definitions matching Section 4.
-   Starter market and policy configuration (`KOLKATA` launch city record, sample Kolkata `Polygon` zones, and initial independent inspection policy template `v1.0.0`) is seeded idempotently via `npm run db:seed --workspace=server` using `$setOnInsert` upserts. Seeds never insert production credentials, real PII, or live financial records, and refuse to run in `production` without `ALLOW_PRODUCTION_BOOTSTRAP_SEED=true`.

## 10. Backup, retention and restore notes

-   **Automated backups:** Managed MongoDB cluster runs continuous oplog/point-in-time snapshots plus encrypted daily snapshots stored in a private `ap-south-1` object-storage vault isolated from application write keys.
-   **Local hygiene:** Never copy production dumps containing Tier 3 PII or Tier 4 tokens onto developer workstations or commit database archives into Git.
-   **Customer PII & Deletion Retention (Checkpoint 09):** `customer_profiles` (`userId` unique index + `deletionRequest.status`/`scheduledPurgeAt` schedule index) and `addresses` (`addressId` unique, `userId + isDefault`, `location: 2dsphere`) isolate customer PII cleanly from immutable `consent_records` and financial/order ledgers so 30-day self-service erasure requests anonymize personal fields without corrupting statutory tax records (`AUTH.md` §9).
-   **Restaurant Onboarding & Private KYC Vault (Checkpoint 10):** `restaurants`, `restaurant_outlets`, and `restaurant_documents` enforce `isPublic: false` (`PRIVATE_COMPLIANCE`) on uploaded compliance metadata, mask/HMAC-hash PAN and settlement bank numbers, and isolate statutory `fssaiVerificationStatus` from independent `platformInspectionStatus` (`NOT_INSPECTED` until field audit).
-   **Discovery & Search Index Coverage (Checkpoint 13):** `restaurant_outlets` (`idx_outlets_discovery_zone_safety`, `idx_outlets_discovery_status_cuisine`) and `menu_items` (`idx_menu_items_discovery_avail_diet_price`, `idx_menu_items_available_title`) back bounded `limit <= 25` keyset cursor pagination without N+1 queries or misleading verified claims.
-   **Single-Outlet Cart, Signed Quotes & Coupons (Checkpoint 14):** `carts` (`idx_carts_customer_unique`), `pricing_quotes` (`idx_pricing_quotes_id_unique`, `idx_pricing_quotes_customer_issued_desc`, and 86,400-second TTL `idx_pricing_quotes_expires_ttl`), and `coupons` (`idx_coupons_code_unique`, `idx_coupons_active_valid_until`) isolate customer carts strictly by authenticated owner, retain short-lived signed quotes, and enforce coupon validity and per-user redemption limits.
-   **Payment Sandbox, Idempotency & Webhook Reconciliation (Checkpoint 15):** `payments` (`idx_payments_id_unique`, `idx_payments_provider_payment_unique`, `idx_payments_customer_created_desc`, `idx_payments_quote_created_desc`, `idx_payments_reconciliation_queue`), append-only `payment_events` (`idx_payment_events_id_unique`, `idx_payment_events_payment_occurred`, partial unique `idx_payment_events_provider_event_unique`), append-only `integration_webhook_events` (`idx_webhook_events_provider_event_unique`), `idempotency_keys` (`idx_idempotency_operation_key_unique`, TTL `idx_idempotency_expires_ttl`), and `reconciliation_records` (`idx_reconciliation_records_id_unique`, `idx_reconciliation_records_payment_created_desc`, `idx_reconciliation_records_status_created_desc`) guarantee zero raw card PAN/CVV storage, replay-safe event deduplication, and full unknown-status auditability.
-   **Idempotent Order Lifecycle, Optimistic Locking & Outbox Events (Checkpoint 16):** `orders` (`idx_orders_id_unique`, unique `idx_orders_quote_unique`, `idx_orders_customer_created_desc`, `idx_orders_outlet_status_created_desc`), `order_items` (`idx_order_items_id_unique`, `idx_order_items_order_id`), append-only `order_events` (`idx_order_events_id_unique`, `idx_order_events_order_occurred`), and append-only `outbox_events` (`idx_outbox_events_id_unique`, `idx_outbox_events_status_occurred`) enforce single-order-per-quote uniqueness, optimistic version CAS concurrency locks against race conditions, and immutable audit trails.
-   **Restore drills:** Verify snapshot restoration into a disposable non-production database quarterly, re-running `db:indexes` verification and verifying financial/inspection immutability invariants prior to sign-off.
