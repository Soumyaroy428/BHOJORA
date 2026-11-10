# Design System and UX Specification

## 1. Experience principles

-   Trustworthy, calm, transparent and easy to scan.
-   Food photography may be expressive; safety information must remain
    factual and restrained.
-   Do not use green badges to imply safety when an assessment is
    pending or expired.
-   Make prices, fees, taxes, cancellation rules and delivery estimates
    understandable.
-   Never hide sponsored placement or paid promotion.
-   Design for variable network quality and mid-range Android devices
    common in the launch market.

## 2. Visual system

Create design tokens for: - Brand primary, secondary, accent and neutral
colors. - Semantic success, warning, danger and informational colors. -
Typography scale, line height and font weights. - Spacing scale, radius,
borders, elevation and focus ring. - Light theme first; dark theme only
after accessibility review. - Status colors must always be accompanied
by text and icons.

## 3. Navigation

Customer web/mobile: Home, Search, Orders, Saved, Account. Restaurant:
Overview, Orders, Menu, Outlets, Team, Earnings, Compliance, Support.
Delivery: Availability, Jobs, Active delivery, Earnings, Help, Profile.
Inspector: Assignments, Schedule, Draft inspections, Submitted reports,
Training, Profile. Admin: Overview, Users, Restaurants, Orders,
Delivery, Inspections, Safety cases, Finance, Analytics, Audit,
Settings.

## 4. Required screens

-   Authentication and onboarding
-   Location permission and address selection
-   Home/discovery and search/filter
-   Restaurant profile and menu
-   Public safety profile and inspection history
-   Cart, checkout and payment result
-   Order detail and live tracking
-   Review and complaint form
-   Restaurant application and outlet setup
-   Menu editor and order kitchen board
-   Delivery job list and active navigation
-   Inspector checklist, evidence capture and report review
-   Admin tables, detail views, approval queues and audit history

## 5. Trust UX

Every public assessment must show: - Status label (not inspected,
pending review, verified, corrective action required, suspended,
expired). - Assessment type: independent platform assessment or official
record. - Assessment date, scope, method and policy version. -
Validity/review date and limitations. - Critical warning when
applicable. - Link to accessible report summary. - Explanation that
assessment is not a guarantee of every meal's safety.

## 6. Accessibility and localization

-   WCAG 2.2 AA target.
-   Keyboard navigation and visible focus.
-   Screen reader labels and logical headings.
-   Sufficient contrast; do not rely on color alone.
-   Large touch targets.
-   English and Bengali-ready content architecture; add language
    switching.
-   Currency INR formatting and Asia/Kolkata display timezone.
-   Address entry supports local landmarks and postal codes.

## 7. Responsive breakpoints

Define and test mobile, tablet and desktop layouts. Restaurant and admin
tables should become usable cards or horizontally scrollable tables on
small screens.

## 8. Design handoff

Each screen needs states: loading, empty, success, error, offline,
permission denied, expired, pending and disabled. Deliver reusable
components, tokens, interaction specs and annotated responsive layouts
before implementation.
