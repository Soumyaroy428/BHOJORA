# Complete Feature Catalogue --- 13 Domains

This file is the feature source of truth. Each feature must have user
stories, permissions, validation, failure states, analytics events and
acceptance tests before implementation.

## F01 Identity, profiles and access

-   Email/phone registration, OTP, password login/recovery, optional
    OAuth
-   Sessions, logout-all, device/session list, account status
-   Customer profile, saved addresses, language, notification
    preferences
-   Role and permission administration, staff invitations
-   Consent and privacy request records
-   Account deletion/deactivation subject to retention law
-   Abuse controls: OTP throttling, login lockouts, suspicious-session
    alerts

## F02 Discovery, location and search

-   GPS permission only when needed; manual address and landmark entry
-   Service zones, outlet geospatial search and open/closed status
-   Restaurant, cuisine, dish and ingredient search
-   Filters: price, delivery ETA, distance, dietary labels, offers and
    assessment status
-   Sorting: relevance, distance, delivery estimate, price, customer
    rating
-   Safety filter must explain status and assessment date
-   Map/list view, recent searches and saved restaurants
-   Search indexing, pagination and abuse/rate controls

## F03 Restaurant, outlet and catalog

-   Restaurant application and business profile
-   Outlet/branch creation, address, map pin, operating hours and
    service radius
-   Document upload and review status
-   Staff roles and outlet-scoped permissions
-   Menus, categories, items, variants, add-ons and combo definitions
-   Images, descriptions, prices, tax configuration and availability
-   Dietary tags and declared allergen/ingredient data
-   Menu preview, publish/unpublish and audit trail
-   Inventory availability and out-of-stock controls

## F04 Cart, checkout, pricing and ordering

-   Add/update/remove items and customizations
-   Initial policy: one outlet per cart
-   Server-side validation and quote expiry
-   Item subtotal, discount, delivery fee, platform fee, tax and tip
-   Address snapshot, delivery instructions and contact preferences
-   Order creation, acceptance, preparation, ready, pickup, delivery and
    exception states
-   Cancellation eligibility and reason codes
-   Reorder from historical snapshot with current availability/prices
-   Scheduled orders only after real-time operations are proven

## F05 Payments, refunds and settlements

-   Provider order creation and hosted/SDK payment
-   Signed webhook validation, event deduplication and replay protection
-   Payment attempt and status history
-   Failed/unknown payment reconciliation
-   Refund request, partial/full refund and provider status
-   Restaurant commission and payable calculation
-   Delivery partner earnings calculation
-   Settlement batches and reconciliation
-   Financial ledger/audit trail
-   No unapproved stored-value wallet or escrow
-   Gift/reward credits only after legal and accounting review

## F06 Delivery partner and logistics

-   Partner application and document review
-   Availability, service zones and working preferences
-   Assignment offer, timeout, accept/decline and reassignment
-   Pickup OTP/status, navigation and customer contact
-   Active-delivery location updates with explicit disclosure
-   Drop OTP/proof, failed delivery and exception workflow
-   Multiple orders only after batching logic validated
-   Earnings, incentives, payout status and support
-   SOS, incident and accident reporting
-   Partner welfare and working-time policy

## F07 Independent kitchen inspection

-   Inspector application, identity, qualifications/training and
    authorization
-   Conflict-of-interest declaration and assignment rotation
-   Schedule, visit checklist and offline draft
-   Evidence capture, file hash, timestamp and location metadata
-   Checklist templates with policy version and severity definitions
-   Findings, critical issue escalation and corrective actions
-   Report submit, reviewer queue, approve/reject/return
-   Inspector cannot approve own report
-   Reinspection, appeal and amendment version
-   Inspector audit and quality sampling

## F08 Trust profile, score and traceability

-   Public safety profile for each assessed outlet
-   Status: not inspected, pending review, verified, corrective action
    required, suspended, expired
-   Scope, method, date, policy version, validity and limitations
-   Category scores and critical override
-   Assessment history and correction history
-   QR code resolving to canonical public profile
-   Separate FSSAI document/license status and independent assessment
-   Supplier/batch/expiry traceability only when evidence exists
-   Optional IoT temperature feeds with sensor health and provenance
-   Public warning and profile correction workflow

## F09 Reviews, complaints and support

-   Verified-order rating and review
-   Food, restaurant and delivery dimensions separated
-   Review moderation, report and restaurant response
-   Support tickets, queues, SLA, assignment and escalation
-   Food-safety complaint with severity and evidence
-   Allegation versus confirmed finding distinction
-   Restaurant response, investigator findings and corrective action
-   Appeal and case closure
-   Authority escalation when legally/operationally required
-   Customer notifications and satisfaction feedback

## F10 Promotions, loyalty and membership

-   Coupon creation, eligibility, limits and expiry
-   Restaurant/platform-funded discount allocation
-   Campaign scheduling and analytics
-   Referral attribution and abuse prevention
-   Points ledger, earning and redemption rules
-   Membership tiers and benefits
-   Renewal/cancellation and refund rules
-   Clear price disclosures and sponsored placement labels

## F11 Restaurant operations and analytics

-   Live order queue and preparation board
-   Accept/reject and prep-time updates
-   Kitchen staff task assignment
-   Cleaning checklist and maintenance log
-   Inventory/availability and expiry record
-   Sales, AOV, order mix, cancellation and repeat customer metrics
-   Settlement and commission reports
-   Compliance tasks and inspection timeline
-   Branch comparison for chains
-   CSV exports with permission and audit

## F12 Administration, finance and governance

-   Role-scoped admin dashboard
-   User/restaurant/outlet/partner approval and suspension
-   Order lookup and controlled operational intervention
-   Payment, refund and settlement reconciliation
-   Inspector authorization, assignment and quality audit
-   Inspection review and policy version management
-   Complaint escalation and safety notice
-   Coupon/commission/fee configuration with change approvals
-   Audit logs, access review and security incidents
-   Platform KPIs and city/zone configuration
-   No silent edits to financial or inspection history

## F13 AI, automation and integrations

-   Food/restaurant recommendations with explainable factors
-   Search ranking assistance without paid safety manipulation
-   Complaint categorization and summarization
-   Inspection report summarization for reviewer
-   Image model flags possible visible issues for human review only
-   Demand and inventory forecasting
-   Delivery assignment/route suggestions
-   AI support assistant with safe escalation
-   Google Maps/Places, payment provider, SMS/email/push, storage
-   IoT sensors with provenance
-   Optional ONDC integration after legal/technical feasibility
-   AI evaluation, human override, audit and model/version tracking

## Cross-cutting acceptance requirements

For every feature define: actor, permission, happy path, validation,
error/empty/offline states, audit events, privacy classification,
analytics events, unit tests, integration tests and acceptance criteria.
