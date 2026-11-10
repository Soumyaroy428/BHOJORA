# BHOJORA — Key Screen Wireframe & Layout Specifications

This document details the architectural layout, typography, visual hierarchy, and component placements for the primary high-fidelity screens across the BHOJORA web and mobile applications.

---

## Screen 01: Customer Discovery Feed (`client/customer-web` & `customer-mobile`)

### Layout Architecture
```text
+-----------------------------------------------------------------------------------+
|  [LOGO: BHOJORA]    [📍 Salt Lake, Sector V ▼]    [🔍 Search dishes, kitchens...]  |  [CART (2)]  [PROFILE]  |
+-----------------------------------------------------------------------------------+
|  PROMO BANNER: "Kolkata Food Festival: Verified Biryani & Kebabs • Flat ₹100 OFF" |
+-----------------------------------------------------------------------------------+
|  FILTERS:  [ 🛡️ Verified Score ≥ 90 ]  [ 🟢 Pure Veg ]  [ ⭐ Rating 4.0+ ]  [ ⏱️ Under 30 mins ]
+-----------------------------------------------------------------------------------+
|  TOP VERIFIED KITCHENS IN BIDHANNAGAR                                             |
|                                                                                   |
|  +------------------------------+  +------------------------------+               |
|  | [IMAGE: Arsalan Biryani]     |  | [IMAGE: Peter Cat Sizzlers]  |               |
|  | [🛡️ VERIFIED CLEAN • 94/100] |  | [🛡️ VERIFIED CLEAN • 91/100] |               |
|  |                              |  |                              |               |
|  | Arsalan — Park Circus        |  | Peter Cat — Park Street      |               |
|  | Mughlai, Biryani, Kebabs     |  | Continental, North Indian    |               |
|  | ★ 4.5 (2.4k) • 25 mins • ₹₹  |  | ★ 4.6 (4.1k) • 35 mins • ₹₹₹ |               |
|  +------------------------------+  +------------------------------+               |
+-----------------------------------------------------------------------------------+
```

---

## Screen 02: Kitchen Safety Transparency Drawer (`TrustProfileDrawer`)

### Layout Architecture
```text
+-----------------------------------------------------------------------------------+
|  BHOJORA TRUST PROFILE                                                      [ ✕ ] |
|  Outlet: Arsalan (Park Circus, Kolkata - 700017)                                  |
|  FSSAI Lic. No: 12821008000491 (Valid till Dec 2027)                              |
+-----------------------------------------------------------------------------------+
|  CURRENT ASSESSMENT STATUS                                                        |
|  [ 🛡️ VERIFIED CLEAN — Overall Score: 94 / 100 ]                                  |
|  Audit Date: 14 October 2026  •  Valid Until: 14 April 2027 (Policy v2.1-Kolkata)  |
|  Assigned Independent Inspector: INS-WB-049 (Bhojora Authorized)                  |
+-----------------------------------------------------------------------------------+
|  CATEGORY SCORE BREAKDOWN                                                         |
|  1. Food Storage & Cold Chain (25%): [====================] 96% (Fridge: 3.2°C)   |
|  2. Personal Hygiene & Gear   (20%): [=================== ] 92% (Hairnets/Gloves) |
|  3. Sanitation & Pest Control (25%): [====================] 95% (No Pests Found)  |
|  4. Water & Raw Material Qual (15%): [=================== ] 90% (RO Tested Clean) |
|  5. Waste Management          (10%): [====================] 98% (Segregated Bins) |
+-----------------------------------------------------------------------------------+
|  AUDIT PHOTO EVIDENCE (Cryptographically Hashed SHA-256)                          |
|  [ Photo 1: Walk-in Cooler ]   [ Photo 2: Prep Counter ]   [ Photo 3: Waste Area ]|
|  Hash: a3f8...e912 (14:32 IST) Hash: c19b...4421 (14:41 IST) Hash: f47d...0192  |
+-----------------------------------------------------------------------------------+
|  ⚠️ STATUTORY NOTICE:                                                             |
|  This independent platform assessment reflects physical observations made on the   |
|  inspection date under Bhojora Audit Protocol. It is NOT an FSSAI government      |
|  statutory certification and does not guarantee that every future meal is safe.   |
+-----------------------------------------------------------------------------------+
```

---

## Screen 03: Live Kitchen Prep Kanban (`client/restaurant-web`)

### Layout Architecture
```text
+-----------------------------------------------------------------------------------+
|  BHOJORA PARTNER  |  Outlet: Mocambo Park Street  |  Status: 🟢 KITCHEN OPEN      |
+-----------------------------------------------------------------------------------+
|  INCOMING (1)             |  IN PREPARATION (2)         |  READY FOR PICKUP (1)   |
|  -------------------------+-----------------------------+-------------------------|
|  #BHJ-9042 (2 mins ago)   |  #BHJ-9038 (12 mins left)   |  #BHJ-9031              |
|  1x Devilled Crab         |  2x Chicken Stroganoff      |  1x Mixed Grill Sizzler |
|  1x Fish Florentine       |  Rider Assigned: Rahul D.   |  Rider Arrived: Amit K. |
|                           |                             |                         |
|  [ ACCEPT (20m) ] [REJECT]|  [ EXTEND +5m ] [READY]     |  [ HANDOVER (Enter OTP) ]
+-----------------------------------------------------------------------------------+
```

---

## Screen 04: Inspector Audit Checklist (`client/inspector-mobile`)

### Layout Architecture
```text
+-----------------------------------------------------------------------------------+
|  [ ← Back ]    BHOJORA INSPECT — ONSITE AUDIT                     [ GPS: 5m ± Lock ]|
|  Outlet: Peter Cat, 18A Park Street, Kolkata                                      |
+-----------------------------------------------------------------------------------+
|  CATEGORY 3 OF 6: SANITATION & PEST CONTROL                                       |
|                                                                                   |
|  [✓] Pest control agency contract valid within 90 days?                [ YES / NO ]|
|  [✓] Absence of rodent droppings or cockroach activity in food storage?[ YES / NO ]|
|                                                                                   |
|  CRITICAL VIOLATION CHECK:                                                        |
|  "Is there active live pest activity inside the hot food cooking area?"           |
|  [ ( ) NO  — Normal Checklist ]    [ (X) YES — FLAG CRITICAL VIOLATION ]          |
|                                                                                   |
|  *WARNING: Flagging YES will immediately trigger an emergency store suspension.   |
|                                                                                   |
|  EVIDENCE CAPTURE:                                                                |
|  [ 📷 CAPTURE PHOTO (Min 2 required) ]                                            |
|  - Captured: kitchen_grease_trap_01.jpg (Hash: e741...9802, GPS Lat: 22.5512°)   |
|                                                                                   |
|  [ NEXT CATEGORY: WATER QUALITY → ]                                               |
+-----------------------------------------------------------------------------------+
```
