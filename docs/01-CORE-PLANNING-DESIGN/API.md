# API Specification

## 1. Contract

Base path `/api/v1`; HTTPS; JSON; publish OpenAPI 3.x. Use UTC ISO
timestamps, INR integer paise, cursor pagination, request IDs, standard
errors and role/resource authorization.

## 2. Authentication and profile

POST `/auth/register`, `/auth/login`, `/auth/otp/send`,
`/auth/otp/verify`, `/auth/logout`, `/auth/refresh`,
`/auth/forgot-password`. GET/PATCH `/users/me`. GET/POST/PATCH/DELETE
`/addresses`.

## 3. Discovery and catalog

GET `/restaurants`, `/restaurants/{id}`, `/outlets/{id}`,
`/outlets/{id}/menu`, `/search`, `/categories`. GET
`/safety/outlets/{id}` and `/safety/outlets/{id}/history`.

## 4. Cart and orders

GET `/cart`; POST `/cart/items`; PATCH/DELETE `/cart/items/{id}`. POST
`/checkout/quote`; POST `/orders`; GET `/orders`; GET `/orders/{id}`;
POST `/orders/{id}/cancel`; GET `/orders/{id}/tracking`.

## 5. Payments

POST `/payments/create`; POST `/payments/verify` (supplementary only);
POST `/webhooks/payments/{provider}`; GET `/payments/{id}`; POST
`/refunds`; GET `/refunds/{id}`; GET `/settlements`.

## 6. Restaurant

POST `/restaurant/applications`; GET `/restaurant/dashboard`; POST
`/restaurant/outlets`; POST `/restaurant/menu/items`; PATCH
`/restaurant/menu/items/{id}`; GET `/restaurant/orders`; PATCH
`/restaurant/orders/{id}/status`; GET `/restaurant/earnings`; GET
`/restaurant/compliance`.

## 7. Delivery

POST `/delivery/applications`; GET `/delivery/jobs/available`; POST
`/delivery/jobs/{id}/accept`; POST `/delivery/jobs/{id}/pickup`; POST
`/delivery/jobs/{id}/location`; POST `/delivery/jobs/{id}/complete`; GET
`/delivery/earnings`; POST `/delivery/incidents`.

## 8. Inspection and trust

POST `/inspections`; GET `/inspections/assigned`; GET
`/inspections/{id}`; POST `/inspections/{id}/evidence-upload-url`; PATCH
`/inspections/{id}/submit`; POST `/inspections/{id}/review`; POST
`/inspections/{id}/approve`; POST `/inspections/{id}/reinspect`; POST
`/safety/complaints`; POST `/safety/appeals`.

## 9. Administration

`/admin/users`, `/admin/restaurants`, `/admin/outlets`,
`/admin/delivery-partners`, `/admin/orders`, `/admin/inspections`,
`/admin/verification`, `/admin/complaints`, `/admin/refunds`,
`/admin/settlements`, `/admin/analytics`, `/admin/audit-logs`,
`/admin/settings`.

## 10. API rules

-   Use Idempotency-Key on order/payment/refund/payout mutations.
-   Verify signed webhooks, timestamp and replay protection.
-   Recalculate price server-side; ignore client totals.
-   Enforce resource ownership and permission scopes.
-   Never expose private evidence via public endpoints.
-   Return 404/403 consistently to avoid resource enumeration where
    appropriate.
-   Document request/response and error schemas in OpenAPI.
