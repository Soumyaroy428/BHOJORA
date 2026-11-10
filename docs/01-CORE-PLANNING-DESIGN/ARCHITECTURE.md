# Architecture

## 1. Architecture decision

Use a modular monolith initially. One API deployment can host isolated
business modules. Run background workers and realtime gateway as
separately deployable processes when needed. Avoid premature
microservices.

## 2. Applications

-   customer-web
-   restaurant-web
-   admin-web
-   customer-mobile
-   delivery-mobile
-   inspector-mobile
-   shared UI/domain packages

## 3. Backend modules

identity, users, addresses, restaurants, outlets, staff, catalog,
discovery, cart, pricing, orders, payments, refunds, settlements,
delivery, inspections, evidence, safety-profile, complaints, reviews,
support, promotions, notifications, analytics, AI-assistance,
integrations and audit.

## 4. Layering

HTTP route -\> authentication -\> authorization -\> validation -\>
controller -\> domain service -\> repository/provider -\> response.
Controllers do not contain business logic. Frontends never access
MongoDB directly.

## 5. Domain ownership

Each module owns its models and repository. Cross-module operations use
explicit service interfaces and domain events. Use an outbox pattern for
reliable event publication when transaction boundaries require it.

## 6. Infrastructure

MongoDB Atlas, Redis, BullMQ, object storage, CDN, Socket.IO/managed
realtime, payment provider, Maps provider, SMS/email/push, monitoring,
CI/CD and secret manager.

## 7. Deployment

Vercel or equivalent for web; managed Node container for API; separate
worker; realtime service; managed MongoDB and Redis; private evidence
bucket; public CDN for approved menu media.

## 8. Scaling path

Measure first. Optimize indexes/cache/queries, then scale API and
workers, then extract only demonstrably high-load domains such as
discovery or delivery. City and zone must be first-class configuration
dimensions.

## 9. Key architecture diagrams

### Request flow

Client -\> API -\> identity -\> authorization -\> validation -\> domain
service -\> repository/provider -\> response.

### Event flow

Order service records state transition -\> outbox/event -\> worker -\>
notification/realtime update. Consumers must be idempotent.

### Trust flow

Inspector submits report -\> independent reviewer approves -\> policy
engine calculates score/status -\> public profile projection publishes
approved version.

## 10. Failure design

Provider outage must not corrupt internal order state. Queue retryable
work, expose operator alerts, use dead-letter queues and reconcile
payment status with provider records.
