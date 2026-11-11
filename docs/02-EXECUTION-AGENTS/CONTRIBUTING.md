# Contributing to BHOJORA

BHOJORA follows a strict **checkpoint-by-checkpoint delivery model** (`docs/CHECKPOINTS/CHECKPOINT_INDEX.md`). All human contributors and AI agents must obey these engineering workflows.

---

## 1. Local Environment Prerequisites

- **Node.js:** `22.21.0` LTS (run `nvm use` or install Node `22.21.0`)
- **Package Manager:** `npm` `11.x` (bundled with Node 22 LTS)
- **Git:** Standard clone with LF line-ending handling (`.editorconfig`)

```bash
# Install locked dev tooling cleanly
npm ci

# Inspect active environment template (never commit real .env files)
cp .env.example .env
```

---

## 2. Standard Verification Commands

Run the full quality gate locally before requesting review or pushing:

```bash
# Individual checks
npm run format:check      # Prettier formatting check
npm run lint              # ESLint static checks
npm run typecheck         # TypeScript strict checks across workspaces
npm run build             # Emit build checks across workspaces
npm run security:secrets  # Repo secret & forbidden-file scanner
npm test                  # Repository & checkpoint verification suites

# Full single-command CI equivalent
npm run ci
```

---

## 3. Checkpoint Workflow

1. **Read First:** Review the active checkpoint spec under `docs/CHECKPOINTS/CHECKPOINT_XX.md` plus referenced specs (`PRD.md`, `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `AUTH.md`, `CODING_STANDARDS.md`).
2. **Smallest Vertical Slice:** Implement only what the active checkpoint specifies. Keep root folders strictly limited to `docs/`, `client/`, and `server/` (with `.github/` reserved exclusively for CI workflows).
3. **Verify Before Reporting:** All `npm run ci` gates must exit `0` after the final edit. Record exact package additions, file paths, security notes, and test outputs in the checkpoint completion report.
4. **Conventional Commits:** Use atomic commits formatted as:
   - `feat(checkpoint-<NN>): <concise summary>`
   - `fix(checkpoint-<NN>): <bug fix summary>`
   - `docs(checkpoint-<NN>): <documentation update>`
5. **Approval Before Push & Deploy:** Wait for explicit founder approval before pushing to `main` or deploying staging/production environments.

---

## 4. Security & Privacy Rules for PRs

- Never commit secrets, personal phone numbers, Aadhaar/FSSAI scan files, or live payment sandbox credentials.
- Never bypass failing lint, typecheck, test, or secret-scan checks.
- Report security-sensitive bugs (payment idempotency, RBAC isolation, safety score tampering) using `docs/03-SECURITY-QUALITY/DEBUGGING.md`.
