# Checkpoint Index --- Granular Delivery Plan

## Mandatory operating rule

One checkpoint at a time. Implement -\> test -\> review -\> report -\>
request explicit approval -\> push to GitHub -\> deploy to the agreed
environment -\> verify -\> obtain acceptance -\> next checkpoint.

Do not push or deploy without approval. A deployment is not complete
until health checks and a smoke test pass. Use staging until launch
readiness.

## Checkpoints

  ID   Scope                                  Main deliverable
  ---- -------------------------------------- ----------------------------
  00   Product decisions and repo skeleton    Approved baseline
  01   UX research and journeys               Journey maps
  02   Design tokens and components           Design system
  03   Architecture and contracts             ADRs and module boundaries
  04   CI and developer tooling               Quality pipeline
  05   Backend bootstrap                      Running API
  06   Database foundation                    Models/index scripts
  07   Identity and sessions                  Auth foundation
  08   RBAC and tenant isolation              Permission system
  09   Customer profile and address           Customer domain
  10   Restaurant onboarding                  Restaurant application
  11   Outlet and service zones               Geospatial serviceability
  12   Catalog and menu                       Menu management
  13   Discovery and search                   Restaurant discovery
  14   Cart and pricing                       Authoritative quote
  15   Payment sandbox                        Verified payment flow
  16   Order lifecycle                        Order state machine
  17   Restaurant operations                  Order dashboard
  18   Delivery partner onboarding            Partner domain
  19   Delivery assignment                    Dispatch engine
  20   Tracking and proof                     Delivery completion
  21   Inspector onboarding                   Inspector access
  22   Inspection checklist/evidence          Digital assessment
  23   Review and scoring                     Governed assessment
  24   Public safety profile and QR           Trust transparency
  25   Reviews and complaints                 Customer feedback
  26   Support operations                     Ticketing and escalation
  27   Refunds and settlements                Finance operations
  28   Admin governance                       Admin console
  29   Notifications                          Multi-channel messaging
  30   Promotions and loyalty                 Engagement
  31   Analytics and reporting                KPI dashboards
  32   AI assistance                          Human-reviewed AI features
  33   Integrations hardening                 Provider resilience
  34   Security and privacy hardening         Security sign-off
  35   Performance and recovery               Load/restore evidence
  36   Compliance and operational readiness   Launch checklist
  37   Kolkata pilot                          Controlled launch
  38   Pilot evaluation                       Go/no-go for expansion

## Checkpoint report template

1.  Scope and acceptance criteria
2.  Implementation summary
3.  Files/modules changed
4.  Dependencies added and rationale
5.  Database/index/migration impact
6.  Tests and exact results
7.  Security/privacy impact
8.  Known issues and deferred work
9.  Screenshots/staging URL
10. Git branch/commit status
11. Deployment status and smoke-test result
12. Request explicit approval for push/deploy and next checkpoint
