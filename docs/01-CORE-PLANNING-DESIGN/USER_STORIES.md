# BHOJORA — Comprehensive User Stories & Acceptance Criteria

This document details the exhaustive user stories and test-verifiable acceptance criteria covering all **13 Feature Domains (F01–F13)** across all roles in the BHOJORA ecosystem.

---

## Domain F01: Identity, Profiles & Access

### Story F01.1: Mobile OTP Registration & Bengali/English Preference
**As a** Kolkata food consumer,  
**I want to** register using my mobile phone number with an SMS OTP and choose between Bengali (`বাংলা`) and English,  
**So that** I can create an account securely in my preferred language.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Successful phone registration with language selection
    Given I am an unauthenticated user on the Bhojora mobile app or web
    When I enter a valid 10-digit Indian mobile number ("9830012345") and tap "Send OTP"
    Then the server dispatches a 6-digit expiring OTP (valid for 5 minutes) via SMS
    And the UI displays a 60-second countdown before allowing a resend
    When I enter the correct 6-digit OTP and select language "বাংলা"
    Then my account is created with default status ACTIVE
    And my language preference is saved as "bn-IN"
    And an authenticated session is established with JWT access and rotating refresh tokens
  ```

- **Edge Cases & Failure Modes:**
  - *OTP Throttling:* If >3 OTP requests are made from the same IP or phone number within 10 minutes, the system blocks requests for 15 minutes with HTTP `429 Too Many Requests`.
  - *Invalid OTP:* Entering an incorrect OTP 3 consecutive times invalidates the OTP and requires a new request.

---

### Story F01.2: Restaurant Staff Role-Based Access Control
**As an** outlet manager,  
**I want to** log in with role-scoped credentials,  
**So that** I can only view and manage orders and menus for my assigned Kolkata outlet, without access to other outlets or platform settings.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Outlet manager cannot access other outlets or global finances
    Given I am authenticated as an Outlet Manager for "Bhojora Partner - Salt Lake Outlet"
    When I attempt to query orders for "Park Street Outlet" via "GET /api/v1/partner/outlets/out_park_st/orders"
    Then the server responds with HTTP 403 Forbidden
    And an audit log entry is recorded with actor ID, target resource, and IP
  ```

---

## Domain F02: Discovery, Location & Search

### Story F02.1: Kolkata Landmark & Geospatial Restaurant Discovery
**As a** customer in Kolkata,  
**I want to** find serviceable restaurants by selecting my landmark (e.g., "Near Karunamoyee, Salt Lake") or enabling GPS,  
**So that** I only see restaurants that deliver hot food to my exact location.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Geospatial serviceability query in Kolkata
    Given a customer with delivery coordinates within Salt Lake Sector V (22.5800° N, 88.4370° E)
    When the customer opens the discovery home screen
    Then the backend executes a MongoDB GeoJSON "$geoIntersects" or "$nearSphere" query
    And returns only outlets whose polygon service radius covers the customer's coordinates
    And each restaurant card indicates the estimated road delivery time (e.g., "25–35 mins")
    And restaurants outside the service polygon are omitted from the main feed
  ```

---

### Story F02.2: Kitchen Safety Score Filtering
**As a** health-conscious customer,  
**I want to** filter discovery results by Bhojora Trust Score (e.g., "Verified Clean — Score 85+"),  
**So that** I can prioritize restaurants with proven kitchen hygiene.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Filtering restaurants by independent safety score
    Given multiple active restaurants in the customer's delivery zone
    When the customer activates the filter "Trust Score >= 85"
    Then the listing filters to only show outlets with an active "VERIFIED" inspection status and score >= 85
    And each card renders the Trust Green shield badge displaying the exact score and audit date
    And restaurants with expired inspections or pending corrective actions are excluded from this filtered view
  ```

---

## Domain F03: Restaurant, Outlet & Catalog Management

### Story F03.1: Menu Item Customizations & Allergen Declarations
**As a** restaurant chef/manager,  
**I want to** configure dishes with portion options, mandatory add-ons, and declared allergens,  
**So that** customers with dietary restrictions can make safe and informed choices.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Adding a menu item with allergens and add-on groups
    Given I am an authorized restaurant manager in Bhojora Partner
    When I create a new item "Kolkata Mutton Biryani"
    And set base price as 38000 paise (₹380.00)
    And attach allergen tags ["DAIRY", "EGG"]
    And create an add-on group "Extra Piece" with options: "Aloo (+₹20)", "Boiled Egg (+₹15)"
    Then the menu item is validated via Zod schema on the backend
    And stored in MongoDB with integer paise pricing and allergen arrays
    And rendered with unambiguous dietary badges (Non-Veg brown square, allergen warnings)
  ```

---

## Domain F04: Cart, Checkout, Pricing & Ordering

### Story F04.1: Authoritative Real-Time Quote & Single-Outlet Cart Policy
**As a** customer checking out,  
**I want to** receive an authoritative server-calculated price quote with tax and delivery fee,  
**So that** the price I pay is completely transparent, accurate, and cannot be manipulated by client-side scripts.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Server-side authoritative checkout quote generation
    Given a customer has 2 items in their cart from "Arsalan Park Circus"
    When the customer initiates checkout
    Then the client requests "POST /api/v1/checkout/quote"
    And the server calculates:
      | Field            | Value Calculation                                |
      | Items Subtotal   | Sum of (quantity * itemPricePaise)               |
      | Packaging Charge | Outlet packaging fee in paise                    |
      | Delivery Fee     | Base fee + (distanceInKm * perKmRateInPaise)     |
      | Taxes (GST)      | 5% restaurant service GST in paise               |
      | Platform Fee     | Fixed platform service fee (e.g., 500 paise)     |
      | Total Payable    | Total integer sum in paise                       |
    And the server generates a cryptographically signed "quoteId" valid for 600 seconds
    And any client attempt to alter prices locally is rejected with HTTP 400
  ```

- **Edge Case (Price Drift):**
  - If a restaurant updates an item's price while a customer is building their cart, generating the quote re-evaluates current prices and warns the user: *"Item 'Chicken Tikka' price changed from ₹220 to ₹240. Do you accept the updated total?"*

---

## Domain F05: Payments, Refunds & Settlements

### Story F05.1: Idempotent Webhook Payment Processing
**As the** financial backend service,  
**I want to** verify payment provider webhook signatures and deduplicate events using idempotency keys,  
**So that** an order is never credited twice, even if the payment gateway sends repeated webhooks.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Deduplicated payment gateway webhook handling
    Given an order in state "AWAITING_PAYMENT" with quoteId "quote_123"
    When the payment gateway sends an HTTP POST webhook with event "payment.captured"
    And the payload contains header "X-Razorpay-Signature"
    Then the backend verifies HMAC SHA-256 signature using the secret webhook salt
    And checks the "idempotency_keys" collection
    When the key is processed for the first time
    Then the order state transitions to "CONFIRMED"
    And a receipt is generated in the payment ledger
    When the payment gateway replays the exact same webhook 30 seconds later
    Then the server detects the existing idempotency key
    And immediately returns HTTP 200 OK without re-triggering order confirmation or notification events
  ```

---

## Domain F06: Delivery Partner & Logistics

### Story F06.1: Automated Dispatch & Turnaround Countdown
**As a** delivery partner in Kolkata,  
**I want to** receive clear job offers with pickup/drop locations, estimated distance, and guaranteed payout in paise,  
**So that** I can accept deliveries that fit my current location and working preferences.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Dispatch job offer acceptance
    Given a delivery partner is "ONLINE" in the "South Kolkata" zone
    When an order transitions to "PREPARING" at an outlet 1.2 km away
    Then the dispatch algorithm sends a push notification and WebSocket offer to the partner's device
    And the app displays a modal with:
      - Restaurant Name & Landmark
      - Drop Landmark & Distance (km)
      - Guaranteed Earning (e.g., "₹55.00")
      - 45-second countdown timer
    When the partner taps "Accept Job" within 45 seconds
    Then the job is locked to the partner
    And the partner transitions to "EN_ROUTE_TO_PICKUP"
    And the customer's live tracking view updates with the partner's name and bike marker
  ```

---

### Story F06.2: Delivery OTP Handover Verification
**As a** customer and delivery partner,  
**I want to** use a 4-digit Delivery OTP to confirm food handover,  
**So that** orders cannot be falsely marked as delivered by a courier without handing over the package.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Secure delivery handover with OTP
    Given the delivery partner has arrived at the customer's delivery location
    And the customer app displays a unique 4-digit OTP generated by the server
    When the partner asks for and enters the 4-digit OTP in the Bhojora Delivery App
    Then the backend validates the OTP against the hashed order OTP
    And upon match, marks the order state as "DELIVERED"
    And triggers the customer review notification
    And credits the delivery earning immediately to the partner's earnings ledger
  ```

---

## Domain F07: Independent Kitchen Inspection

### Story F07.1: Geofenced On-Site Audit & Photo Hash Integrity
**As an** authorized independent inspector,  
**I want to** conduct an inspection only after GPS verifies I am physically at the restaurant, and capture photos that are locally hashed,  
**So that** no inspection can be faked remotely or evidence tampered with.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Geofenced audit initiation and tamper-evident evidence capture
    Given an authorized inspector with an assigned audit for "Mocambo, Park Street"
    When the inspector arrives on site and taps "Check In & Start Audit"
    Then the app reads the device GPS coordinates
    And verifies the distance to the outlet geocache is <= 50 meters
    And unlocks the 6-category hygiene checklist
    When the inspector photographs the raw meat refrigeration unit
    Then the app captures the image and computes its SHA-256 hash locally
    And embeds EXIF metadata: exact UTC timestamp, latitude, longitude, and device ID
    And uploads the image and hash to S3-compatible storage
  ```

---

### Story F07.2: Critical Violation Override & Prohibition of Self-Approval
**As the** Bhojora Trust Engine,  
**I want to** immediately override numerical scores if a critical violation is detected, and prevent inspectors from approving their own reports,  
**So that** hygiene scoring integrity is mathematically and procedurally incorruptible.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Critical violation forces audit failure regardless of other scores
    Given an inspector scores an outlet 95% across 5 categories
    But marks "Active cockroach infestation in primary prep area" as TRUE under Pest Control
    When the report is compiled
    Then the system flags a "CRITICAL_VIOLATION_OVERRIDE"
    And sets overall safety status to "SUSPENDED" (Score: 0 / Failed)
    And prevents the inspector from approving or publishing the report
    And automatically submits the report into the Admin Reviewer queue
  ```

---

## Domain F08: Trust Profile, Score & Traceability

### Story F08.1: Public Kitchen Safety Profile & Canonical QR Resolution
**As a** customer or curious diner,  
**I want to** scan a QR code at the restaurant counter or tap the Trust Shield in the app,  
**So that** I can view the verified kitchen audit date, category breakdown, photo evidence, and statutory disclaimers.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Viewing public trust profile via QR scan
    Given an outlet with an approved inspection report from an independent reviewer
    When a customer scans the outlet's physical Bhojora Trust QR code
    Then the browser opens "https://bhojora.in/restaurants/[slug]/trust"
    And displays:
      - Current Safety Status ("VERIFIED CLEAN")
      - Numerical Score (e.g., "92/100")
      - Last Inspection Date & Expiry Date (6 months validity)
      - Category breakdown bars (Storage, Hygiene, Sanitation, Water, Waste)
      - Verified kitchen photos with timestamps
      - Explicit Disclaimer: "Independent Bhojora Assessment. Not an FSSAI Statutory Certificate."
  ```

---

## Domain F09: Reviews, Complaints & Support

### Story F09.1: Food Safety Allegation Quarantine & Investigation
**As a** customer who experienced a hygiene issue,  
**I want to** submit a food safety complaint with photographic evidence,  
**So that** the platform can investigate and hold the kitchen accountable.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Submitting a critical food safety complaint
    Given a customer with a delivered order from outlet "XYZ" within the last 24 hours
    When the customer submits a complaint selecting "Foreign Object in Food"
    And attaches a clear photograph and narrative
    Then a high-priority ticket is created in Bhojora Control
    And an automated incident notice is sent to the restaurant requesting an explanation within 12 hours
    And the restaurant's Trust Profile indicates "1 Active Safety Investigation in Progress"
  ```

---

## Domain F10: Promotions, Loyalty & Memberships

### Story F10.1: Transparent Coupon Discount Allocation
**As a** customer applying a promo code,  
**I want to** see exactly how much discount is applied and who funds it (restaurant vs. platform),  
**So that** pricing is completely transparent without hidden fee clawbacks.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Applying a valid promotional coupon
    Given a cart subtotal of 50000 paise (₹500.00)
    When the customer applies coupon "BHOJORA100" (₹100 off on orders >= ₹400)
    Then the server validates user redemption limit (max 1 per user) and expiry
    And deducts 10000 paise from the payable subtotal
    And records financial ledger allocation: 60% funded by platform, 40% funded by restaurant
  ```

---

## Domain F11: Restaurant Operations & Analytics

### Story F11.1: Live Kitchen Kanban & Turnaround Buffer
**As a** kitchen chef,  
**I want to** hear an audible sound alert when a new order arrives and move cards between "Incoming", "Cooking", and "Ready",  
**So that** food is prepared freshly and handed over without delay.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Moving order from incoming to ready
    Given an incoming order is placed and confirmed
    When the kitchen board receives the WebSocket event "order.created"
    Then the browser plays a continuous distinct audio chime until acknowledged
    When the chef taps "Accept (20 Mins)"
    Then the order moves to "IN_PREPARATION" column and starts countdown
    When the chef taps "Ready for Pickup"
    Then the order moves to "READY" and signals the arrived delivery rider
  ```

---

## Domain F12: Administration, Finance & Governance

### Story F12.1: Payment Gateway Batch Reconciliation
**As a** finance admin,  
**I want to** upload or fetch daily payment gateway capture reports and compare them against Bhojora order records,  
**So that** every rupee is reconciled with zero financial leakage before merchant settlements are released.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: Automated daily reconciliation
    Given a set of 1,500 orders marked as "DELIVERED" in the last 24 hours
    When the finance reconciliation job runs at 02:00 AM IST
    Then it fetches transaction settlement batches from the Payment Gateway API
    And matches every orderId, paymentTransactionId, and integer paise amount
    And flags any discrepancy > 0 paise into the "Finance Discrepancy Queue" for human review
    And marks clean orders as "RECONCILED_READY_FOR_SETTLEMENT"
  ```

---

## Domain F13: AI, Automation & External Integrations

### Story F13.1: Human-Supervised AI Evidence Flagging
**As an** inspection reviewer,  
**I want** an AI vision model to highlight potential hygiene anomalies in submitted kitchen photos,  
**So that** I can focus my human review on high-risk areas without the AI making final certification decisions.

- **Acceptance Criteria (Gherkin):**
  ```gherkin
  Scenario: AI assistive risk tagging in inspection review
    Given an inspector has submitted 12 photos for an outlet audit
    When the report enters the Admin Reviewer queue
    Then an asynchronous AI analysis job scans photos for known hygiene risk patterns (e.g., unsealed food tubs, missing hairnets, grease buildup)
    And flags photo #4 with an advisory note: "Possible unlabelled open food container detected (Confidence: 82%)"
    Then the human reviewer is presented with the advisory note
    And must manually click "Accept Finding" or "Dismiss as False Positive"
    And the AI cannot certify or change the official safety score independently
  ```
