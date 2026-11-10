# Agent and Contributor Instructions

## 1. Mission

AI agents and human contributors must implement the approved product
scope in small, verifiable checkpoints without silently changing
architecture or business rules.

## 2. Mandatory reading

Before coding read: README.md, PRD.md, DESIGN.md, ARCHITECTURE.md,
DATABASE.md, API.md, PLAN.md, FEATURES.md, AUTH.md, MCP.md,
INTEGRATIONS.md, TESTING.md, DEBUGGING.md and current checkpoint file.

## 3. Scope control

-   Work only on the active checkpoint.
-   Do not implement future features "for convenience".
-   Do not invent credentials, legal approvals, provider capabilities or
    inspection authority.
-   Ask before changing a business rule, schema contract, root folder
    structure or dependency family.
-   Update docs when a contract changes.

## 4. Code rules

-   TypeScript strict mode.
-   Zod at all untrusted boundaries.
-   Services contain business logic.
-   Controllers handle transport only.
-   Repository layer owns persistence.
-   No direct database access from UI.
-   Use integer paise.
-   Use idempotency for financial and order actions.
-   Add tests with every feature.
-   No secrets in source control.
-   Use Mongoose consistently; do not introduce Prisma without explicit
    approval.

## 5. Safety and trust rules

-   AI cannot approve or certify a kitchen.
-   Independent assessment is not a government inspection.
-   Inspector cannot approve own report.
-   Approved reports are immutable and versioned.
-   Critical findings are not hidden by weighted averages.
-   Restaurant payments cannot influence safety results.

## 6. Checkpoint completion protocol

Run format, lint, typecheck, unit tests, integration tests relevant to
scope and production build. Report exact commands and outcomes, changed
files, migrations, dependencies, known issues and security impact. Show
screenshots or staging URL where relevant.

Stop and ask founder approval before GitHub push and deployment. Never
claim a push/deployment succeeded without checking it. After verified
push/deployment, request checkpoint acceptance before moving on.
