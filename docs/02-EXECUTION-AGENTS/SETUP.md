# Development Setup

## 1. Prerequisites

-   Git and GitHub account
-   Supported Node.js LTS version selected and pinned
-   npm or pnpm selected and pinned
-   MongoDB development database
-   Redis development instance when queue/cache checkpoint begins
-   Android Studio/Xcode only when mobile checkpoints begin
-   Payment provider sandbox only when payment checkpoint begins
-   Maps and notification provider sandbox credentials only when needed

## 2. Environment files

Create local `.env` files from documented `.env.example` files. Never
commit actual `.env` files. Validate required variables at startup. Keep
separate local, staging and production secrets.

## 3. Dependency installation policy

Install only dependencies required by the active checkpoint. Record
package, version, reason and security review in checkpoint report. Do
not install frontend, backend, mobile, queue, maps, AI and payment
dependencies in one step.

## 4. Local services

Use separate local MongoDB and Redis. Use provider sandbox credentials.
Use test email/SMS destinations. Use mock payment webhooks for automated
tests.

## 5. First setup sequence

1.  Read architecture and checkpoint 00.
2.  Create root folders only.
3.  Initialize Git and branch strategy.
4.  Add README and docs.
5.  Agree runtime/package manager versions.
6.  Add CI baseline.
7.  Ask approval to push initial repository.
8.  Continue to design checkpoint only after approval.

## 6. Troubleshooting

Record exact command, OS, runtime version, full error and reproduction
steps in DEBUGGING.md or issue tracker. Do not delete lockfiles or
change package managers as a first fix.
