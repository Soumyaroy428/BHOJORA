# BHOJORA — Component Inventory & Prop Specifications

This document defines the complete catalog of reusable UI components shared across the web and mobile applications of the BHOJORA ecosystem.

---

## 1. Atoms

### 1.1 `BhojoraButton`
- **Purpose:** Primary, secondary, outline, and ghost action buttons.
- **Touch Target:** **Minimum 48px height** on mobile/tablet screens.
- **Props Interface:**
  ```typescript
  interface BhojoraButtonProps {
    variant: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
    size: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    loading?: boolean;
    leadingIcon?: React.ReactNode;
    trailingIcon?: React.ReactNode;
    children: React.ReactNode;
    onClick?: () => void;
    ariaLabel?: string;
  }
  ```
- **Accessibility:**
  - `role="button"`
  - `aria-busy={loading}`
  - `aria-disabled={disabled}`
  - Focus Ring: `focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2`.

---

### 1.2 `TrustBadge` (Safety & Hygiene Status)
- **Purpose:** Non-negotiable trust indicator. Renders score, status, icon, and label. **Never color-only**.
- **Props Interface:**
  ```typescript
  interface TrustBadgeProps {
    status: 'verifiedClean' | 'actionRequired' | 'suspended' | 'expired' | 'notInspected';
    score?: number; // 0 to 100
    inspectionDate?: string; // ISO 8601
    size?: 'sm' | 'md' | 'lg';
    interactive?: boolean; // opens Trust Drawer when clicked
    onPress?: () => void;
  }
  ```
- **Visual Anatomy:**
  - `verifiedClean`: `[🛡️ ShieldCheck] VERIFIED CLEAN (Score 92/100)`
  - `actionRequired`: `[⚠️ AlertTriangle] ACTION REQUIRED (Score 74/100)`
  - `suspended`: `[⛔ ShieldAlert] SUSPENDED (Critical Violation)`
  - `expired`: `[⏱️ ClockHistory] AUDIT OVERDUE (Renewing)`
  - `notInspected`: `[ℹ️ HelpCircle] NOT INSPECTED`

---

### 1.3 `DietaryBadge`
- **Purpose:** Clear vegetarian/non-vegetarian/egg classification complying with Indian packaged food standards.
- **Props Interface:**
  ```typescript
  interface DietaryBadgeProps {
    type: 'PURE_VEG' | 'NON_VEG' | 'EGG';
    showLabel?: boolean;
    size?: 'sm' | 'md';
  }
  ```
- **Accessibility:**
  - `aria-label={type === 'PURE_VEG' ? 'Pure Vegetarian Dish' : type === 'NON_VEG' ? 'Non-Vegetarian Dish' : 'Contains Egg'}`

---

### 1.4 `PriceDisplay`
- **Purpose:** Formats integer paise into clean INR currency representation (`₹`).
- **Props Interface:**
  ```typescript
  interface PriceDisplayProps {
    amountInPaise: number; // e.g. 38000
    originalAmountInPaise?: number; // for discounted strike-through pricing
    size?: 'sm' | 'md' | 'lg';
  }
  ```
- **Behavior:**
  - 38000 paise ➔ renders as `₹380.00` (or `₹380` when decimals are `.00`).

---

## 2. Molecules

### 2.1 `SearchBarWithLandmark`
- **Purpose:** Primary discovery bar combining keyword search with current Kolkata zone/landmark tag.
- **Props Interface:**
  ```typescript
  interface SearchBarProps {
    currentZone: string; // e.g., "Salt Lake, Sector V"
    placeholder?: string;
    onSearch: (query: string) => void;
    onZoneClick: () => void;
  }
  ```

---

### 2.2 `InspectionCategoryScoreBar`
- **Purpose:** Renders the 5 category score bars (0–100%) inside the kitchen safety profile.
- **Props Interface:**
  ```typescript
  interface InspectionCategoryScoreBarProps {
    categoryName: string; // "Food Storage & Temp Control"
    score: number; // 0 to 100
    weightPercentage: number; // 25
    hasCriticalViolation: boolean;
  }
  ```
- **Behavior:** If `hasCriticalViolation` is true, the bar displays a prominent red warning pill `CRITICAL FAIL` regardless of the numerical percentage.

---

### 2.3 `OtpInputField`
- **Purpose:** 6-box segmented OTP entry with automatic focus advancement, paste support, and backspace retreat.
- **Props Interface:**
  ```typescript
  interface OtpInputFieldProps {
    length?: number; // default: 6
    value: string;
    onChange: (otp: string) => void;
    onComplete?: (otp: string) => void;
    hasError?: boolean;
  }
  ```

---

## 3. Organisms

### 3.1 `RestaurantCard`
- **Purpose:** Primary listing card in discovery feeds.
- **Anatomy:**
  1. 16:9 Image with lazy-load blur-hash.
  2. Overlay top-right: `TrustBadge`.
  3. Overlay bottom-left: Promotional tag (e.g., "₹100 OFF above ₹400").
  4. Restaurant Title (Manrope SemiBold 18px).
  5. Cuisines (Inter Regular 14px muted).
  6. Rating & ETA metadata row (`★ 4.4 (1.2k) • 25–35 mins • ₹₹`).

---

### 3.2 `KitchenPrepKanbanCard` (Bhojora Partner)
- **Purpose:** Order preparation card on the restaurant live kitchen board.
- **Anatomy:**
  1. Order ID (e.g., `#BHJ-8921`) + countdown timer bar.
  2. Customer Name & Delivery Partner Status.
  3. Itemized list with customization details (e.g., "2x Chicken Biryani [Extra Aloo]").
  4. Actions: "Accept (15m)", "Food Ready", or "Print Receipt".

---

### 3.3 `TrustAuditSummaryDrawer`
- **Purpose:** Detailed modal/drawer displaying the full transparent kitchen audit history.
- **Anatomy:**
  1. Header: Outlet Name + FSSAI Registration number + Current Safety Status.
  2. Audit Date, Validity Window, Policy Version (e.g., `v2.1-Kolkata`).
  3. Category score breakdown with probe temperature logs.
  4. Timestamped & hashed kitchen photographs with zoom capability.
  5. Legal disclaimer separating independent platform assessment from statutory certifications.
