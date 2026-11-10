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
