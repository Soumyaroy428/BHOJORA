# BHOJORA — Sitemap, Screen Inventory & State Specifications

This document defines the complete sitemaps, route hierarchies, screen inventories, and UI states across all **six application surfaces** of the BHOJORA ecosystem.

---

## The Six Application Surfaces

1. **Surface 01: Customer Website (`client/customer-web`)** — Next.js (SSR/SSG, Responsive Desktop & Mobile Web)
2. **Surface 02: Customer Mobile App (`client/customer-mobile`)** — React Native + Expo (iOS & Android)
3. **Surface 03: Restaurant Partner Dashboard (`client/restaurant-web`)** — Next.js (Desktop & Tablet)
4. **Surface 04: Delivery Partner App (`client/delivery-mobile`)** — React Native + Expo (Android-First Mobile)
5. **Surface 05: Independent Inspector App (`client/inspector-mobile`)** — React Native + Expo (Mobile Tablet & Phone)
6. **Surface 06: Admin & Governance Console (`client/admin-web`)** — Next.js (Desktop Operations Portal)

---

## Universal UI State Contract

Every screen across all surfaces must explicitly handle these **nine standard UI states**:

| State Code | State Name | Visual & Behavioral Requirement |
| :--- | :--- | :--- |
| **ST-01** | `Loading` | Content-shaped animated skeleton loaders (never generic spinning wheels). |
| **ST-02** | `Empty` | Warm illustration + contextual copy + primary actionable button. |
| **ST-03** | `Success` | Clear visual feedback, accessible toast notification, or confirmation state. |
| **ST-04** | `Error` | User-friendly explanation + distinct error reference ID + "Try Again" CTA. |
| **ST-05** | `Offline` | Persistent, non-blocking banner: *"You are offline. Showing cached items."* |
| **ST-06** | `Permission Denied` | Explanatory modal with instructions on how to enable in OS settings. |
| **ST-07** | `Expired / Suspended` | Neutral/Alert banner explaining audit expiry or account restriction. |
| **ST-08** | `Pending Review` | Informative progress tracker with SLA estimate. |
| **ST-09** | `Disabled / Inactive` | Visual dimming (60% opacity) + descriptive tooltip explaining the restriction. |

---

## Surface 01: Customer Website (`client/customer-web`)

### Route Hierarchy & Sitemap
```text
/ (Home / Discovery)
├── /location (Address & Kolkata Zone Selector)
├── /search (Geospatial Search & Filtering)
├── /restaurants
│   └── /[restaurantSlug] (Outlet Landing, Catalog & Hygiene Summary)
│       └── /trust (Public Bhojora Trust Profile & Audit History)
│       └── /reviews (Verified Customer Reviews)
├── /cart (Authoritative Quote & Item Customization)
├── /checkout (Address, Instructions & Payment Gateway Integration)
├── /orders
│   ├── / (Order History & Active Orders)
│   └── /[orderId] (Live Order State, Map Tracking & Receipt)
│       ├── /review (3-Dimensional Rating Submission)
│       └── /complaint (Food Safety & Service Dispute Form)
├── /trust (Bhojora Trust Hub: Public Methodology, Inspector Code & Verification)
├── /account
│   ├── /profile (Name, Phone, Email, Bengali/English Language Toggle)
│   ├── /addresses (Saved Kolkata Addresses & Landmarks)
│   └── /help (Customer Support & Ticket Status)
└── /auth
    ├── /login (Phone / OTP & Password)
    └── /register (New User Onboarding)
```

### Screen Inventory & Key States

| Screen ID | Route / View | Primary Actions | Key States Handled |
| :--- | :--- | :--- | :--- |
| `CW-SCR-01` | `/` | Browse banners, cuisines, top-rated & verified kitchens | `Loading` (Skeletons), `Empty` (No serviceable outlets), `Error` |
| `CW-SCR-02` | `/location` | Auto-detect GPS, pick Kolkata zone/landmark, save tag | `Permission Denied` (Location block), `Loading` (Geocoding) |
| `CW-SCR-03` | `/search` | Search dishes, filter by Trust Score (≥90, ≥80), Veg/Non-Veg | `Empty` (Zero results with cuisine suggestions), `Offline` |
| `CW-SCR-04` | `/restaurants/[slug]`| Browse categories, select portion/add-ons, view trust badge | `Loading`, `Disabled` (Outlet closed / out of service hours) |
| `CW-SCR-05` | `/restaurants/[slug]/trust` | View audit score, photo evidence, inspection date, FSSAI | `Expired` (Assessment overdue), `Pending Review` |
| `CW-SCR-06` | `/cart` | Adjust quantities, view breakdown (paise), enter coupon | `Empty` (Empty cart illustration), `Error` (Price delta detected) |
| `CW-SCR-07` | `/checkout` | Select saved address, select payment method, submit order | `Loading` (Quote calculation), `Error` (Payment failed modal) |
| `CW-SCR-08` | `/orders/[id]` | Real-time tracking (prep ➔ pickup ➔ transit ➔ delivery OTP) | `Success` (Order placed), `Offline` (Polling fallback) |

---

## Surface 02: Customer Mobile App (`client/customer-mobile`)

### Navigation Tree (React Native + Expo)
```text
RootNavigator
├── AuthStack
│   ├── WelcomeScreen
│   ├── PhoneOtpScreen
│   └── ProfileSetupScreen
└── MainBottomTabs
    ├── TabHome (HomeScreen ➔ RestaurantDetailScreen ➔ TrustProfileModal)
    ├── TabSearch (SearchScreen ➔ FilterModal ➔ SearchResultsScreen)
    ├── TabCart (CartScreen ➔ CheckoutScreen ➔ PaymentWebView)
    ├── TabOrders (OrderHistoryScreen ➔ LiveTrackingScreen ➔ ReviewModal)
    └── TabAccount (ProfileScreen ➔ SavedAddressesScreen ➔ LanguageSelector)
```

### Mobile Screen Inventory & Native Features

| Screen ID | Screen Name | Native Hardware / OS Features Used | Key States Handled |
| :--- | :--- | :--- | :--- |
| `CM-SCR-01` | `HomeScreen` | Pull-to-refresh, smooth scroll, haptic feedback | `Loading` (Shimmer), `Offline` (Cached banners) |
| `CM-SCR-02` | `RestaurantDetailScreen`| Floating cart bar, sticky category header, share deep link | `Disabled` (Temporarily unavailable) |
| `CM-SCR-03` | `TrustProfileModal` | Pinch-to-zoom for audit photo evidence, PDF report export | `Loading`, `Success` |
| `CM-SCR-04` | `CheckoutScreen` | Native payment sheet (UPI deep linking, Google Pay, PhonePe)| `Loading` (SDK init), `Error` (Transaction failed) |
| `CM-SCR-05` | `LiveTrackingScreen` | Interactive Google Map, driver marker animation, call proxy | `Offline` (Reconnecting indicator), `Success` |
| `CM-SCR-06` | `LanguageSelector` | Bengali (`বাংলা`) / English toggle with instant string reload | `Success` |

---

## Surface 03: Restaurant Dashboard (`client/restaurant-web`)

### Route Hierarchy & Sitemap
```text
/partner (Bhojora Partner Portal)
├── /dashboard (Daily Summary: Orders, Revenue in Paise, Avg Prep Time)
├── /orders (Live Kitchen Prep Kanban Board)
│   ├── /active (Incoming, Preparing, Food Ready)
│   └── /history (Delivered, Cancelled, Disputed)
├── /menu (Catalog & Menu Management)
│   ├── /categories (Category Ordering & Visibility)
│   ├── /items (Dish creation, variants, add-ons, pricing in paise)
│   └── /stock (Quick Stock Out toggles & Turnaround Buffer)
├── /outlet (Outlet Configuration)
│   ├── /profile (Name, Address, Geo Pin, Kolkata Borough)
│   ├── /timings (Slot-based operating hours & holidays)
│   └── /staff (Manager & Chef sub-accounts, permissions)
├── /hygiene (Bhojora Kitchen Hygiene Hub)
│   ├── /audit-history (Past inspection reports, scores & findings)
│   ├── /corrective-actions (Upload rectification evidence for open CAPs)
│   └── /daily-checklist (Internal cleaning logs, fridge temperature logs)
├── /finances (Settlements & Payouts)
│   ├── /payouts (Weekly/Daily settlement records, bank statement match)
│   └── /invoices (GST invoice download, platform fee commissions)
└── /support (Partner Helpdesk & Ticket Escalation)
```

### Key Screen States for Restaurant Web

| Screen ID | Route | Primary Purpose | Key States Handled |
| :--- | :--- | :--- | :--- |
| `RW-SCR-01` | `/partner/orders/active` | Live kitchen Kanban, continuous audio alert for new orders | `Empty` (No active orders), `Success` (Order moved) |
| `RW-SCR-02` | `/partner/menu/items` | Add/edit dishes, allergens (Nuts, Dairy), integer paise price| `Loading`, `Error` (Validation failure) |
| `RW-SCR-03` | `/partner/hygiene/corrective-actions` | Upload photo proof of fixed hygiene violations | `Pending Review` (Reviewer examining proof), `Success` |
| `RW-SCR-04` | `/partner/finances/payouts` | Review net payout after commission and GST deductions | `Loading`, `Empty` (No settlements yet) |

---

## Surface 04: Delivery Partner App (`client/delivery-mobile`)

### Navigation Tree (React Native + Expo)
```text
DeliveryRootNavigator
├── AuthStack (LoginScreen, OnboardingKycScreen, VehicleDetailsScreen)
└── MainDeliveryFlow
    ├── ShiftScreen (Go Online / Offline toggle, Zone heatmaps, Battery guard)
    ├── JobOfferModal (Sound alert, 45-second accept/reject countdown)
    ├── ActiveJobFlow
    │   ├── PickupNavigationScreen (Route to Restaurant, Contact Outlet)
    │   ├── OrderPickupVerificationScreen (Item check, Order ID validation)
    │   ├── CustomerNavigationScreen (Route to Customer, Customer call proxy)
    │   └── DropOffVerificationScreen (Enter 4-Digit Delivery OTP)
    ├── EarningsScreen (Daily order payouts in paise, tips, incentives)
    └── PartnerProfileScreen (Documents, ratings, SOS emergency button)
```

### Screen Inventory & Key States

| Screen ID | Screen Name | Native Features & Key Flow | Key States Handled |
| :--- | :--- | :--- | :--- |
| `DM-SCR-01` | `ShiftScreen` | Background geolocation tracker, battery level monitor | `Offline` (No network), `Disabled` (Battery < 15%) |
| `DM-SCR-02` | `JobOfferModal` | Loud custom audio ringtone, 45s countdown timer | `Expired` (Offer timed out), `Success` (Accepted) |
| `DM-SCR-03` | `PickupNavigationScreen`| Embedded Google Maps navigation, "Arrived at Outlet" button | `Loading`, `Error` (Route calculation failure) |
| `DM-SCR-04` | `DropOffVerificationScreen`| 4-digit OTP input keypad, cash collected confirm (if COD) | `Error` (Invalid OTP), `Success` (Delivery complete) |
| `DM-SCR-05` | `SosEmergencyModal` | One-tap emergency call to Bhojora Safety Desk + 112 trigger | `Success` (Alert dispatched with GPS coordinates) |

---

## Surface 05: Independent Inspector App (`client/inspector-mobile`)

### Navigation Tree (React Native + Expo)
```text
InspectorRootNavigator
├── AuthStack (InspectorLoginScreen, CredentialVerificationScreen)
└── MainInspectorFlow
    ├── AssignedAuditsScreen (Upcoming, Today's Scheduled Visits, Completed)
    ├── OutletCheckInScreen (Geofenced GPS validation ≤ 50m of outlet)
    ├── AuditChecklistScreen (6 Standardized Hygiene Categories)
    │   ├── CategoryStorageScreen (Cold storage temperature & probe photo)
    │   ├── CategoryHygieneScreen (Staff gear, handwash stations)
    │   ├── CategorySanitationScreen (Pest control & critical violation flag)
    │   ├── CategoryWaterQualityScreen (Filter status, potability log)
    │   ├── CategoryWasteScreen (Segregated bins, drainage flow)
    │   └── CategoryStatutoryScreen (FSSAI display, medical fitness records)
    ├── EvidenceReviewScreen (SHA-256 hash list, tamper-evident metadata)
    └── AuditSubmissionScreen (Dual digital signature: Inspector + Kitchen Manager)
```

### Screen Inventory & Security Features

| Screen ID | Screen Name | Core Action & Security Constraints | Key States Handled |
| :--- | :--- | :--- | :--- |
| `IM-SCR-01` | `OutletCheckInScreen` | Validates device GPS is within 50m of outlet; unlocks audit | `Permission Denied` (GPS blocked), `Error` (Outside geofence)|
| `IM-SCR-02` | `AuditChecklistScreen` | Standardized checklist with weighted scores and photo upload | `Offline` (Saves to encrypted local SQLite storage) |
| `IM-SCR-03` | `CategorySanitationScreen` | *Critical Violation Toggle:* Immediately warns of store closure | `Success` (Flag logged), `Error` |
| `IM-SCR-04` | `EvidenceReviewScreen` | Calculates device-side SHA-256 hash for every photo captured | `Loading` (Hashing), `Success` |
| `IM-SCR-05` | `AuditSubmissionScreen` | Submits report to Independent Reviewer queue; *NO self-approval* | `Pending Review` (Transferred to Admin review queue) |

---

## Surface 06: Admin & Governance Console (`client/admin-web`)

### Route Hierarchy & Sitemap
```text
/admin (Bhojora Control)
├── /overview (Marketplace KPIs: Orders, Active Outlets, Kolkata Delivery Heatmaps)
├── /inspections (Trust & Safety Engine)
│   ├── /reviews-queue (Pending inspection reports awaiting verification)
│   ├── /reports/[reportId] (Detailed evidence audit, photos, hash verification)
│   ├── /inspectors (Inspector credentials, conflict-of-interest declarations)
│   └── /corrective-actions (Reviewing restaurant proof of remediation)
├── /operations (Marketplace Operations)
│   ├── /live-dispatch (Real-time Kolkata map, stuck order reassignments)
│   ├── /outlets (Approve, reject, or suspend restaurant outlets)
│   └── /riders (Delivery partner onboardings, KYC approvals, suspensions)
├── /support (Disputes & Allegations)
│   ├── /food-safety-cases (Food poisoning / contamination complaint investigations)
│   └── /tickets (Customer, partner, and rider support tickets)
├── /finance (Financial Reconciliation)
│   ├── /reconciliation (Payment gateway batches vs. order records)
│   ├── /refunds (Refund approval queue & audit logs)
│   └── /settlements (Weekly payout run generator & bank payout batches)
└── /settings (System Configuration)
    ├── /zones (Kolkata delivery zone polygons, service fees, surge settings)
    ├── /roles (RBAC permission matrices)
    └── /audit-logs (Immutable system audit trail of all administrative actions)
```

### Key Screen States for Admin Web

| Screen ID | Route | Primary Purpose | Key States Handled |
| :--- | :--- | :--- | :--- |
| `AW-SCR-01` | `/admin/inspections/reviews-queue` | List submitted inspection reports requiring reviewer sign-off | `Empty` (Queue clear), `Loading`, `Success` |
| `AW-SCR-02` | `/admin/inspections/reports/[id]` | Inspect evidence hashes, approve/reject/return inspection report | `Success` (Published to public profile), `Error` |
| `AW-SCR-03` | `/admin/support/food-safety-cases` | Investigate customer hygiene allegations with evidence | `Pending Review`, `Success` (Case closed with notice) |
| `AW-SCR-04` | `/admin/finance/reconciliation` | Reconcile captured payment gateway events with bank payouts | `Loading`, `Empty`, `Error` (Flagged discrepancy) |
| `AW-SCR-05` | `/admin/settings/zones` | Configure Kolkata delivery polygons and active service zones | `Loading`, `Success` (Zone polygon saved) |
