# Product Requirements Document (PRD)

## 1. Product overview

A multi-sided food delivery marketplace launching in Kolkata, West
Bengal. The product combines restaurant discovery, ordering, payments,
delivery logistics, restaurant operations, customer support, and an
independently operated kitchen-assessment and transparency layer.

**Product promise:** Customers can order food conveniently and see
clear, evidence-backed information about participating kitchens,
including assessment status, scope, date, findings and limitations.

**Important distinction:** The startup's independent kitchen assessment
is not a statutory government inspection, FSSAI certification or
guarantee that every meal is safe.

## 2. Vision, mission and outcomes

-   Build a trusted local food marketplace.
-   Give restaurants practical order and business-management tools.
-   Give delivery partners transparent assignments and earnings records.
-   Operate a consistent, independent kitchen assessment programme.
-   Make relevant food-safety information understandable to consumers.
-   Build modular foundations for later expansion beyond Kolkata.

## 3. Target users and roles

1.  Guest: browse public restaurant/menu/safety information.
2.  Customer: order, pay, track, review, save preferences and submit
    complaints.
3.  Restaurant owner: manage business, outlets, staff and financial
    views.
4.  Restaurant manager: manage assigned outlet operations.
5.  Kitchen staff: see preparation tasks and hygiene checklists.
6.  Delivery partner: manage availability, jobs, navigation and
    earnings.
7.  Inspector: perform assigned independent assessments and submit
    evidence.
8.  Inspection reviewer: independently review reports; cannot approve
    own report.
9.  Support agent: resolve customer/restaurant/partner tickets.
10. Operations admin: manage marketplace operations.
11. Trust and safety admin: investigate safety cases and appeals.
12. Finance admin: reconcile payments, refunds and settlements.
13. Super admin: manage global settings and access policies.

## 4. Product surfaces

-   Customer responsive website.
-   Customer mobile application (Android/iOS).
-   Restaurant web dashboard.
-   Delivery partner mobile application.
-   Inspector mobile application.
-   Admin and operations web dashboard.
-   Backend trust, payment, notification and AI services.

## 5. Thirteen product feature domains

### F01 --- Identity, profiles and access

Registration, login, OTP, password recovery, sessions, account settings,
role assignments, user status, consent records, device/session
management and secure account deletion workflows.

### F02 --- Discovery, location and search

Location selection, serviceability, map/list views, restaurant search,
dish search, cuisine, dietary filters, price, delivery ETA, opening
status, popularity and safety-status filters. Ranking must not secretly
sell safety placement.

### F03 --- Restaurant, outlet and catalog management

Restaurant onboarding, multiple outlets, business documents, operating
hours, menu categories, food items, images, customizations,
availability, ingredient declarations, allergen declarations, taxes and
menu publishing workflow.

### F04 --- Cart, checkout, pricing and ordering

Cart validation, single-outlet cart policy initially, server-side price
quote, coupons, delivery fee, platform fee, taxes, tip, scheduled order
(later), order creation, state transitions, cancellation and reorder.

### F05 --- Payments, refunds, wallet-like credits and settlements

Payment provider order creation, signed webhook processing, idempotency,
refund requests, reconciliation, restaurant payable calculations,
partner earnings and payout records. Do not build a regulated
stored-value wallet without specialist approval.

### F06 --- Delivery partner and logistics

Partner onboarding, document review, online/offline status, assignment,
accept/decline, pickup confirmation, route/navigation, live location
during active delivery, delivery OTP/proof, exceptions, earnings and
incident reporting.

### F07 --- Independent kitchen inspection

Inspector identity/training/authorization, conflict declarations,
assignment, scheduling, versioned checklist, physical visit, evidence
capture, timestamp, findings, report submission, independent review,
correction, appeal and reinspection.

### F08 --- Trust profile, score governance and traceability

Public outlet profile, assessment date/scope/method, category scores,
critical findings status, assessment expiry, report version, correction
history, QR profile, supplier/batch information where actually
documented, and optional sensor evidence. Keep license verification
separate from platform assessment.

### F09 --- Reviews, complaints, support and dispute resolution

Verified-order reviews, moderation, restaurant response, support
tickets, food-safety allegations, severity triage, evidence
preservation, investigation, corrective action, appeal, resolution and
authority escalation where appropriate.

### F10 --- Promotions, loyalty and memberships

Coupons, campaigns, referrals, reward ledger, membership plans,
eligibility, expiry, redemption limits and transparent promotion terms.
Phase after core commerce.

### F11 --- Restaurant operations and business analytics

Order queue, kitchen preparation board, staff permissions,
stock/availability, cleaning logs, daily sales, average order value,
cancellation, customer feedback, compliance tasks, settlement reports
and outlet comparisons.

### F12 --- Administration, finance, analytics and governance

User/restaurant/partner management, role permissions, moderation, order
intervention, payment reconciliation, refunds, settlement oversight,
inspector governance, score-policy versions, complaint escalation, audit
logs and operational KPIs.

### F13 --- AI, automation and external integrations

AI recommendations, complaint classification, report summarization,
image-based risk flags, demand forecasting, inventory suggestions,
delivery optimization, Maps, payment provider, SMS/email/push, object
storage, IoT and optional ONDC exploration. AI outputs are assistive and
require human review for safety decisions.

## 6. Core user journeys

-   Customer: location -\> discovery -\> restaurant/menu -\> safety
    profile -\> cart -\> quote -\> payment -\> restaurant acceptance -\>
    preparation -\> delivery -\> review/support.
-   Restaurant: application -\> document review -\> outlet setup -\>
    menu -\> order acceptance -\> preparation -\> handover -\>
    settlement.
-   Delivery: onboarding -\> availability -\> job offer -\> accept -\>
    pickup -\> route -\> proof of delivery -\> earnings.
-   Inspector: authorization -\> assignment -\> visit -\>
    checklist/evidence -\> submit -\> independent review -\> publish
    assessment -\> corrective action/reinspection.
-   Admin: authenticate -\> role-scoped dashboard -\> manage workflow
    -\> record reason -\> audit.

## 7. Business rules

-   Server is authoritative for price, tax, fee, availability,
    eligibility and state transitions.
-   Store money as integer paise with currency.
-   Order items, prices, taxes and delivery address are snapshotted at
    checkout.
-   Payment confirmation requires verified provider event; browser
    redirect is not authoritative.
-   Webhooks and financial mutations are idempotent.
-   Reviews require an eligible completed order.
-   Only authorized inspectors submit independent assessments.
-   Inspector cannot approve their own assessment.
-   Approved inspection reports are immutable; corrections create a new
    version.
-   Restaurant payment/subscription cannot influence score or review
    outcome.
-   A critical finding cannot be averaged away by a high numerical
    score.
-   Expired assessments must not display as current.
-   Customer allegation is not a confirmed violation until investigated.
-   Government license/inspection status and platform assessment status
    remain distinct.

## 8. Non-functional requirements

-   Initial availability objective: 99.5%, measured and reviewed.
-   Common API p95 target: under 500 ms for internal reads; provider
    calls excluded.
-   Secure authentication, authorization, encryption and auditability.
-   Accessible responsive interfaces.
-   Geospatial serviceability and city/zone configuration.
-   Observability, backups and tested recovery.
-   Data minimization and defined retention periods.
-   Modular, testable, documented code.

## 9. MVP acceptance

A customer can find an active outlet, view its menu and truthful safety
status, place/pay for an order and track delivery. A restaurant can
receive and process it. A delivery partner can complete it. An
authorized inspector can submit evidence; a separate reviewer can
approve it; the public profile displays current status and date. Admin
can investigate complaints and reconcile payment events.

## 10. Out of scope for first public pilot

Grocery, multi-city launch, multi-restaurant cart, complex corporate
meal plans, automated AI certification, public blockchain claims,
large-scale IoT, stored-value wallet and unvalidated subscription
economics.
