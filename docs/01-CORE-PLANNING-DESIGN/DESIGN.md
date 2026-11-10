# BHOJORA — Comprehensive Design System & UI Specification

> **Visual Source of Truth**: This document serves as the immutable design contract for all frontend code across customer, restaurant, delivery, inspector, and admin interfaces, adhering to the VoltAgent/awesome-design-md and Impeccable frontend craft standards.

---

## 1. Design Concept & Philosophy

- **Brand Archetype:** *Indian warmth + premium technology.*
- **Mood & Personality:** Welcoming, trustworthy, appetising, disciplined, transparent.
- **Core Visual Contrast:**
  - *Food Delivery surfaces:* Warm, mouth-watering, sensory, engaging.
  - *Trust & Safety surfaces:* Restrained, factual, evidence-backed, calm, non-sensationalist.
- **Strict Anti-Slop Rules:**
  - No generic default Inter everywhere: `Manrope` for display/headings/buttons, `Inter` for body copy/data tables.
  - No washed-out gray-on-gray text: All body text meets or exceeds **WCAG AA (≥ 4.5:1 contrast)**.
  - No generic purple/indigo gradients: Rooted in authentic Terracotta (`#8D352A`), Warm Cream (`#F7F1E6`), Trust Green (`#344B3E`), and Saffron Gold (`#E4A746`).
  - No uncalibrated glassmorphism or floating rounded-box clichés.
  - **Non-Negotiable Safety Rule:** Safety statuses must **never rely on color alone**. Every status requires an explicit icon + clear text label + numerical context.

---

## 2. Color Palette & Design Tokens

### 2.1 Brand Core Palette

```css
:root {
  /* Brand Core */
  --bhojora-terracotta: #8D352A;       /* Primary Brand: Indian warmth, spice, appetite anchor */
  --bhojora-terracotta-dark: #6D271E;  /* Active/Pressed state for buttons */
  --bhojora-terracotta-light: #FBEFEF; /* Subtle badge & pill background */

  --bhojora-cream: #F7F1E6;            /* Background canvas: Warm, soft unbleached parchment */
  --bhojora-cream-card: #FFFFFF;       /* Elevated card surface */
  --bhojora-cream-alt: #EFE8DC;        /* Secondary surface / border tint */

  --bhojora-trust-green: #344B3E;      /* Trust & Verification: Forest deep, authoritative */
  --bhojora-trust-green-light: #EDF3EF;/* Background for verified kitchen cards */
  --bhojora-trust-green-text: #1E3025; /* High contrast text for trust badges */

  --bhojora-saffron: #E4A746;          /* Accent Gold: Celebrations, primary offers, star ratings */
  --bhojora-saffron-dark: #C68B2C;     /* Hover state for gold accents */
  --bhojora-saffron-light: #FCF5E8;    /* Background for promo banners */
}
```

### 2.2 Tinted Neutrals Spectrum (OKLCH-Anchored)
Neutrals are subtly warmed toward the terracotta brand hue (hue ~25°) rather than sterile pure blacks or cold grays:

| Token Name | Hex Code | Semantic Role | Contrast on Cream (`#F7F1E6`) |
| :--- | :--- | :--- | :--- |
| `--neutral-950` | `#171412` | Headings, hero titles, primary numbers | **15.8:1 (AAA)** |
| `--neutral-800` | `#3A3430` | Primary body text, table data, active icons | **10.2:1 (AAA)** |
| `--neutral-600` | `#635B55` | Secondary labels, timestamps, dietary notes | **5.4:1 (AA)** |
| `--neutral-400` | `#9E938B` | Muted captions, inactive icons, disabled text | *Non-text UI only* |
| `--neutral-200` | `#DDD5CD` | Borders, card dividers, input outlines | *UI stroke* |
| `--neutral-100` | `#F2ECE4` | Input fill, subtle zebra striping | *Surface fill* |

### 2.3 Semantic Safety & Operational Status Tokens
*Strict Rule: Status colors are always paired with distinctive SVG icons and explicit text.*

| Status Name | Background | Border / Accent | Text | Mandatory Icon | Visual Meaning |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`VERIFIED_CLEAN`** | `#EDF3EF` | `#344B3E` | `#1E3025` | `ShieldCheck` (🛡️) | Passed independent audit (Score ≥ 80, 0 criticals) |
| **`ACTION_REQUIRED`**| `#FFF4E5` | `#ED6C02` | `#663C00` | `AlertTriangle` (⚠️) | Minor/major violations; 14-day rectification active |
| **`SUSPENDED`** | `#FDEAEA` | `#D32F2F` | `#5F2120` | `ShieldAlert` (⛔) | Critical violation found; outlet blocked from orders |
| **`EXPIRED`** | `#F5F5F4` | `#78716C` | `#44403C` | `ClockHistory` (⏱️) | > 6 months since last audit; renewal required |
| **`NOT_INSPECTED`** | `#F8F8F8` | `#A8A29E` | `#57534E` | `HelpCircle` (ℹ️) | New outlet; independent audit pending schedule |

---

## 3. Typography Scale & Font Hierarchy

### 3.1 Type Pairing
- **Headings & Display:** `Manrope` (Weights: 600 SemiBold, 700 Bold, 800 ExtraBold).
- **Body & Data Tables:** `Inter` (Weights: 400 Regular, 500 Medium, 600 SemiBold).
- **Buttons & Interactive CTAs:** `Manrope SemiBold` (600, letter-spacing: +0.01em).

### 3.2 Modular Scale (1.250 — Major Third)

| Scale Step | Font Size | Line Height | Weight | Tracking | Primary Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display-2xl`| `48px` (3.0rem) | `56px` (1.16) | `800` | `-0.02em` | Marketing landing hero headlines |
| `display-xl` | `36px` (2.25rem)| `44px` (1.22) | `700` | `-0.02em` | Desktop section titles, modal headers |
| `heading-lg` | `28px` (1.75rem)| `36px` (1.28) | `700` | `-0.01em` | Restaurant names, Trust Score big stat |
| `heading-md` | `22px` (1.375rem)|`28px` (1.27) | `600` | `-0.01em` | Menu category headers, card titles |
| `heading-sm` | `18px` (1.125rem)|`24px` (1.33) | `600` | `0` | Dish titles, sub-card section titles |
| `body-lg` | `16px` (1.0rem) | `24px` (1.50) | `400 / 500`| `0` | Main body paragraphs, quote summary |
| `body-md` | `14px` (0.875rem)|`20px` (1.43) | `400 / 500`| `0` | Dish descriptions, table body rows |
| `body-sm` | `12px` (0.75rem) | `16px` (1.33) | `500` | `+0.01em` | Allergen tags, delivery fees, timestamps |
| `caption` | `11px` (0.687rem)|`14px` (1.27) | `600` | `+0.02em` | Micro-badges, legal disclaimers, FSSAI |

---

## 4. Spacing, Elevation & Component Anatomy

### 4.1 Spacing Scale (4px Base Grid)
`4px` (`sp-1`), `8px` (`sp-2`), `12px` (`sp-3`), `16px` (`sp-4`), `20px` (`sp-5`), `24px` (`sp-6`), `32px` (`sp-8`), `40px` (`sp-10`), `48px` (`sp-12`), `64px` (`sp-16`).

### 4.2 Radii Scale
- `rounded-sm`: `4px` (Micro tags, dietary squares)
- `rounded-md`: `8px` (Buttons, inputs, dropdown menus)
- `rounded-lg`: `12px` (Dish cards, modal dialogs, trust callouts)
- `rounded-xl`: `16px` (Restaurant cards, prep board containers)
- `rounded-full`: `9999px` (Pills, badges, circular avatars)

### 4.3 Elevation & Shadows (Crisp & Directional, No Blurry Slop)
- `shadow-subtle`: `0 1px 2px 0 rgba(23, 20, 18, 0.05)` (Cards resting on cream canvas)
- `shadow-elevated`: `0 4px 6px -1px rgba(23, 20, 18, 0.08), 0 2px 4px -2px rgba(23, 20, 18, 0.04)` (Hovered cards, popovers)
- `shadow-modal`: `0 20px 25px -5px rgba(23, 20, 18, 0.12), 0 8px 10px -6px rgba(23, 20, 18, 0.04)` (Dialogs, drawers)

---

## 5. Reusable Component Specifications

### 5.1 Primary Button (`BhojoraButton`)
- **Visuals:** Background `--bhojora-terracotta` (`#8D352A`), Text `#FFFFFF`, Font `Manrope SemiBold` (`font-weight: 600`), Border Radius `8px`.
- **States:**
  - *Default:* `#8D352A`
  - *Hover:* `#6D271E` (Darkens by 10%)
  - *Active:* `#541E17` + subtle scale `0.98`
  - *Focus-Visible:* `outline: 2px solid #8D352A; outline-offset: 2px;`
  - *Disabled:* Background `--neutral-200` (`#DDD5CD`), Text `--neutral-400` (`#9E938B`), `cursor: not-allowed`.
  - *Loading:* Spinner icon replaces leading icon; text changes to active verb (e.g., "Placing Order...").
- **Touch Target:** **Minimum 48px height** for mobile/tablet screens to guarantee finger accessibility.

### 5.2 Trust Safety Score Badge (`TrustBadge`)
- **Structure:**
  ```text
  +-----------------------------------------------------+
  | [🛡️ ShieldCheck]  VERIFIED CLEAN  •  Score 92/100    |
  +-----------------------------------------------------+
  ```
- **Specs:**
  - Container: Background `#EDF3EF`, Border `1px solid #344B3E`, Radius `9999px` (pill), Padding `6px 12px`.
  - Content: 16px SVG `ShieldCheck` icon (color `#344B3E`) + 12px `Manrope Bold` text "VERIFIED CLEAN" + bullet separator + 12px `Inter Medium` "Score 92/100".
  - Interactive: Hover lifts pill by 1px with `cursor: pointer`; clicking opens `Bhojora Trust Modal`.

### 5.3 Dietary Classification Badges (`DietaryBadge`)
- Standard Indian statutory food categorization:
  - **`PURE_VEG`:** Square border `#0E8345` (16x16px) containing solid filled green circle (8px diameter).
  - **`NON_VEG`:** Square border `#9E3B2E` (16x16px) containing solid filled brown triangle.
  - **`EGG`:** Square border `#D97706` (16x16px) containing solid filled yellow circle.

### 5.4 Restaurant Card (`RestaurantCard`)
- **Aspect Ratio:** Card container on cream background, 16px radius, `1px solid #DDD5CD`.
- **Top Image:** 16:9 ratio, lazy-loaded with blur-hash placeholder.
- **Floating Badge:** Trust Badge rendered top-right of image with semi-transparent frosted backdrop (`rgba(255,255,255,0.92)`).
- **Body:** Restaurant Name (Manrope SemiBold 18px), Cuisine tags, Distance/ETA in minutes, Pricing tier (`₹₹` in paise), and Customer Star Rating.

---

## 6. Accessibility & Ergonomics Checklist (WCAG 2.2 AA)

1. **Contrast Ratios:**
   - Body text against canvas `#F7F1E6`: Minimum **4.5:1** (Actual `--neutral-800` is **10.2:1**).
   - Button text `#FFFFFF` against Terracotta `#8D352A`: **5.1:1** (Exceeds AA standard).
   - Trust badge text `#1E3025` against `#EDF3EF`: **8.7:1** (Exceeds AAA standard).
2. **Focus Visibility:**
   - Universal keyboard focus ring: `ring-2 ring-terracotta ring-offset-2`. No invisible focus outlines.
3. **Touch Targets:**
   - All interactive elements (buttons, quantity toggles, chips, checkboxes) are $\ge 44 \times 44\text{px}$ on mobile viewports.
4. **Color Independence:**
   - Red/Yellow/Green indicators are never used without corresponding text labels and unique icons.
5. **Localization Ergonomics:**
   - Container padding and flexboxes account for Bengali text expansion (~15–20% wider than English words).

---

## 7. Responsive Breakpoint Standards

```css
/* Mobile-first breakpoint definitions */
--breakpoint-xs: 375px;   /* Compact mobile devices */
--breakpoint-sm: 640px;   /* Large mobile / phablets */
--breakpoint-md: 768px;   /* Tablets / iPad portrait */
--breakpoint-lg: 1024px;  /* Desktop / iPad landscape / Kitchen Prep displays */
--breakpoint-xl: 1280px;  /* Wide desktop screens */
--breakpoint-2xl: 1536px; /* High-res admin analytics monitors */
```
