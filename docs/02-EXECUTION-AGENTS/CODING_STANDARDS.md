# BHOJORA — Coding Standards & Engineering Rules

This specification defines mandatory coding conventions enforced automatically via ESLint, Prettier, TypeScript (`strict: true`), and CI gates starting at Checkpoint 04.

---

## 1. Runtime & Package Management Baseline

- **Node.js Runtime:** Pinned at `22.21.0` LTS (`.nvmrc`, `.node-version`, and `package.json` `engines.node`).
- **Package Manager:** `npm` `11.12.1` (`packageManager: "npm@11.12.1"`). All CI runs use `npm ci` with locked dependency trees (`package-lock.json`).
- **Dependency Discipline:** Per `docs/02-EXECUTION-AGENTS/SETUP.md`, install **only** packages required for the active checkpoint. Never introduce premature runtime frameworks before their checkpoint.

---

## 2. TypeScript Rules (`tsconfig.base.json`)

1. **Strict Compiler Flags:** `strict: true`, `noUncheckedIndexedAccess: true`, `noImplicitOverride: true`, `noFallthroughCasesInSwitch: true`, and `noImplicitReturns: true` are mandatory.
2. **No Implicit `any`:** Every exported API handler, domain service, repository, and contract type must have explicit TypeScript types (`client/shared/contracts/`).
3. **Runtime Schema Validation:** Validate all untrusted HTTP inputs, query parameters, webhook payloads, and environment variables with **Zod** at module/transport boundaries (Checkpoint 05+).
4. **Module Encapsulation:** Backend domain modules (`server/src/modules/*`) must never import another module's Mongoose models directly; communicate strictly via exported domain service interfaces or outbox events (`ADR-001`).

---

## 3. Financial, Trust & Localization Invariants

- **INR Integer Paise (`ADR-003`):** Never use floating-point INR rupees (`number` with decimals) in arithmetic, persistence, or API payloads. Suffix money variables/fields with `Paise` (e.g., `itemPricePaise: 35000`).
- **Kolkata Timezone & UTC:** Persist all database timestamps in ISO 8601 UTC; localize presentation explicitly to `Asia/Kolkata` while keeping city/zone rules data-driven.
- **Separation of Inspection Duties (`ADR-005`):** An inspector account can never approve its own kitchen inspection report, and AI logic may never assign final hygiene certifications or scores.
- **Static & Web Security:** Validate webhook signatures via HMAC (`ADR-006`), never interpolate untrusted text into `innerHTML`, and enforce `ErrorResponse` envelopes with request IDs.

---

## 4. Formatting & Static Linting

- **Prettier (`.prettierrc.json`):** Single quotes (`'`), semicolons required, 2-space indentation, `100` character print width, LF line endings (`.editorconfig`).
- **ESLint (`eslint.config.mjs`):**
  - Enforces strict equality (`===` / `!==`), `const` by default, zero `var`, zero `eval()` / `new Function()`, and zero unused variables (prefix intentional unused parameters with `_`).
  - TypeScript source modules forbid CommonJS `require()` imports (`@typescript-eslint/no-require-imports`).
- **Tests:** Every new domain rule, invariant, or bug fix requires deterministic automated tests in `server/tests/` before marking a checkpoint ready.

---

## 5. Secrets & Privacy Hygiene (DPDP Tier 3 & Tier 4)

- **Zero Secrets in Git:** Never commit `.env`, `.env.local`, `.pem`, `.key`, API keys, webhook secrets, or real Kolkata customer/rider PII.
- **Mandatory Scans:** `npm run security:secrets` (`server/tests/secret-scan.js`) and `npm audit --audit-level=high` run automatically in CI and must pass with zero findings.
