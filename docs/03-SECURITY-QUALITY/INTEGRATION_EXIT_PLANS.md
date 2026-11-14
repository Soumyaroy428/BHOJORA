# Integration Hardening, Exit Plans & ONDC Feasibility

## 1. Provider Exit and Migration Plans

In accordance with BHOJORA architectural invariants, no external third-party provider is tightly coupled to core domain business logic. Every external dependency is isolated behind an internal adapter interface, monitored by a circuit breaker, and governed by an explicit exit/migration plan.

### 1.1 Maps & Location (Google Maps Platform)
- **Primary Role:** Forward/reverse geocoding, autocomplete, and routing estimates.
- **Circuit Breaker & Fallback:** If Google Maps API errors, times out (>2500ms), or exceeds allocated quota thresholds, the system automatically falls back to an offline Haversine distance engine calibrated for Kolkata urban density (1.38x road curvature multiplier, 17 km/h default urban transit speed).
- **Exit Strategy:**
  - Standard GeoJSON coordinates and OpenStreetMap (OSM) / Mapbox compatibility.
  - Zero proprietary geocoding data storage. All stored restaurant and delivery addresses contain canonical latitude and longitude floats.
  - Migration trigger: Unannounced pricing changes or SLA breach (>99.9% requirement).
  - Alternative providers: Mapbox, LocationIQ, OpenRouteService, or self-hosted Valhalla OSM routing engine.

### 1.2 Payments (Razorpay / RBI-Authorized Indian Gateways)
- **Primary Role:** Customer payments, refunds, nodal account escrow, and automated partner settlements.
- **Circuit Breaker & Fallback:** Webhook signatures are cryptographically verified with HMAC SHA-256 and idempotency caches prevent double-settlement replay. If API fails, payment intents are queued with exponential backoff and jitter.
- **Exit Strategy:**
  - Tokenized transactions only (no raw PAN / CVV stored).
  - Webhooks adhere to standard financial event semantics (`payment.captured`, `payment.failed`, `refund.processed`).
  - Alternative providers: Cashfree, PayU, Juspay, or direct bank payment aggregators via RBI-regulated PA/PG frameworks.
  - Migration path: Dual-gateway routing via abstract `PaymentGatewayAdapter` with zero schema refactor.

### 1.3 Notifications (FCM / Transactional SMS / Email)
- **Primary Role:** Critical order status updates, OTPs, and trust safety alerts.
- **Circuit Breaker & Fallback:** Multi-channel failover hierarchy: if Push fails or device is offline, SMS triggers; if SMS gateway throttles, critical alerts queue in DLQ.
- **Exit Strategy:**
  - Notification templates are provider-agnostic.
  - SMS gateway integration adheres to Indian DLT (Distributed Ledger Technology) template IDs.
  - Alternative providers: Gupshup, Twilio, Kaleyra, AWS SNS/SES.

### 1.4 Object Storage & Evidence Vault
- **Primary Role:** Inspection photos, food safety audit logs, and KYC documents.
- **Circuit Breaker & Fallback:** Pre-upload scanning checks MIME magic bytes, size limits, and script injection. Checksums (SHA-256) ensure tamper-evidence.
- **Exit Strategy:**
  - S3-compatible API standard.
  - Objects stored with standard metadata tags (`outletId`, `inspectionId`, `sha256`).
  - Alternative providers: AWS S3, Cloudflare R2, MinIO self-hosted.

### 1.5 Artificial Intelligence & Vision Assistance
- **Primary Role:** Assistive kitchen photo hazard tagging, complaint classification, and demand prediction.
- **Circuit Breaker & Fallback:** Assistive outputs are strictly non-authoritative (`PENDING_HUMAN_REVIEW`). If Gemini API times out, `FallbackAiAdapter` engages local rule-based heuristics.
- **Exit Strategy:**
  - Standard prompt format and structured JSON schema outputs.
  - Alternative providers: Claude 3.5 Sonnet, OpenAI GPT-4o, or self-hosted open-weights vision models (Llama 3.2 Vision) on dedicated GPU infrastructure.

---

## 2. ONDC (Open Network for Digital Commerce) Feasibility Study

### 2.1 Overview & Opportunity
The Open Network for Digital Commerce (ONDC) is an initiative by the Department for Promotion of Industry and Internal Trade (DPIIT), Government of India, to democratize digital commerce by unbundling search, ordering, and fulfillment across open network participants.

### 2.2 Protocol Mapping (Beckn Protocol)
ONDC utilizes the open-source Beckn protocol (JSON-RPC over HTTP with Ed25519 digital signatures and registry lookups). BHOJORA's domain architecture maps to Beckn transactions:

| BHOJORA Internal Domain | Beckn Protocol API | Description |
| :--- | :--- | :--- |
| `discovery` | `/search` & `/on_search` | Broadcast catalog & restaurant discovery with trust badges |
| `cart` & `pricing` | `/select` & `/on_select` | Item selection, quantity validation, authoritative quote |
| `orders` | `/init` & `/on_init` | Delivery address verification, quote finalization |
| `payments` & `orders` | `/confirm` & `/on_confirm` | Order placement upon payment authorization |
| `delivery` | `/status` & `/on_status` | Real-time GPS location and delivery milestone tracking |
| `support` & `finance` | `/cancel` & `/update` | Order cancellation, refund initiation, and return flows |

### 2.3 Network Participant Roles
1. **Seller Network Participant (SNP):**
   - BHOJORA onboarded restaurants can be exposed to third-party buyer apps (Paytm, Magicpin, Ola) while preserving BHOJORA's verified hygiene standards.
2. **Buyer Network Participant (BNP):**
   - The BHOJORA customer app can allow users to discover external food sellers, with BHOJORA displaying distinct "Verified Hygiene Certified" badges for its partner outlets.

### 2.4 Legal, Technical & Operational Prerequisites
- **Ed25519 Cryptographic Key Pairs:** Required for request/response signing and verification via the ONDC staging registry.
- **Beckn Gateway Sandbox:** Verification against ONDC staging certification test suites (F&B domain).
- **Reconciliation & Settlement:** BAP/BPP contract agreement on network commission and instant cancellation policy.
- **Phased Rollout:** BHOJORA will pilot internal operations in Kolkata first (Checkpoints 36–38) before opening the live ONDC network gateway.
