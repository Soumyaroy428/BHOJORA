'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { SERVER_BASELINE } = require('../dist/index.js');
const { validateEnv } = require('../dist/config/env.js');
const { createLogger } = require('../dist/config/logger.js');
const { createApp } = require('../dist/app.js');
const { InMemoryIdentityStore } = require('../dist/modules/identity/identity.models.js');
const { InMemoryTestOtpAdapter } = require('../dist/modules/identity/otp.adapter.js');
const { IdentityService } = require('../dist/modules/identity/identity.service.js');
const { InMemoryRbacStore } = require('../dist/modules/rbac/rbac.store.js');
const { InMemoryCustomerStore } = require('../dist/modules/customer/customer.store.js');
const { CustomerService } = require('../dist/modules/customer/customer.service.js');
const { InMemoryRestaurantStore } = require('../dist/modules/restaurant/restaurant.store.js');
const { InMemoryOutletStore } = require('../dist/modules/outlet/outlet.store.js');
const { OutletService } = require('../dist/modules/outlet/outlet.service.js');
const { InMemoryCatalogStore } = require('../dist/modules/catalog/catalog.store.js');
const { InMemoryCartStore } = require('../dist/modules/cart/cart.store.js');
const { CartService } = require('../dist/modules/cart/cart.service.js');
const { InMemoryPricingStore } = require('../dist/modules/pricing/pricing.store.js');
const { PricingService } = require('../dist/modules/pricing/pricing.service.js');
const { SandboxPaymentGatewayAdapter } = require('../dist/modules/payments/payments.adapter.js');
const { InMemoryPaymentStore } = require('../dist/modules/payments/payments.store.js');
const { PaymentService } = require('../dist/modules/payments/payments.service.js');
const { InMemoryOrderStore } = require('../dist/modules/orders/orders.store.js');
const { OrderService } = require('../dist/modules/orders/orders.service.js');
const { InMemoryDeliveryStore } = require('../dist/modules/delivery/delivery.store.js');
const { DeliveryService } = require('../dist/modules/delivery/delivery.service.js');
const {
  DELIVERY_ASSIGNMENT_STATUSES_RUNTIME,
  OFFER_COUNTDOWN_SECONDS,
  BASE_RIDER_PAYOUT_PAISE,
  PER_KM_RIDER_PAYOUT_PAISE,
  calculateRiderPayoutPaise,
} = require('../dist/modules/delivery/delivery.types.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TEST_PASSWORD = 'Bhojora#Rider2026';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4019',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp19_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp19!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp19!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp19!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp19!',
    },
    { serviceName: 'bhojora-api-test', serviceVersion: '0.1.0' },
  );
}

async function apiJson(baseUrl, pathUrl, options = {}) {
  const method = options.method ?? 'GET';
  const headers = { ...(options.headers ?? {}) };
  let bodyStr;
  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    bodyStr = JSON.stringify(options.body);
  }
  if (options.token) {
    headers['authorization'] = `Bearer ${options.token}`;
  }
  const url = `${baseUrl}${pathUrl}`;
  const response = await fetch(url, { method, headers, body: bodyStr });
  const rawText = await response.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    json = null;
  }
  return { status: response.status, json, rawText };
}

async function registerCustomer(baseUrl, email, phone, name) {
  const res = await apiJson(baseUrl, '/auth/register', {
    method: 'POST',
    body: {
      email,
      phone,
      password: TEST_PASSWORD,
      name,
      acceptTerms: true,
    },
  });
  assert.equal(
    res.status,
    201,
    `Failed registering customer ${email}: ${JSON.stringify(res.json)}`,
  );
  return {
    userId: res.json.data.user.id,
    token: res.json.data.tokens.accessToken,
    refreshToken: res.json.data.tokens.refreshToken,
  };
}

async function createAndVerifyPrivilegedUser({
  baseUrl,
  identityStore,
  otpAdapter,
  email,
  phone,
  name,
  role,
  mfaVerified = true,
}) {
  const reg = await registerCustomer(baseUrl, email, phone, name);
  await identityStore.updateUser(reg.userId, { roles: [role] }, new Date());
  const loginRes = await apiJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: { identifier: email, password: TEST_PASSWORD },
  });
  assert.equal(loginRes.status, 200);
  const accessToken = loginRes.json.data.tokens.accessToken;
  if (!mfaVerified) {
    return { userId: reg.userId, token: accessToken };
  }
  const sendRes = await apiJson(baseUrl, '/auth/mfa/send', {
    method: 'POST',
    token: accessToken,
  });
  assert.equal(sendRes.status, 200);
  const challengeId = sendRes.json.data.challengeId;
  const msg = otpAdapter.getLatestMessage();
  assert.ok(msg && /^\d{6}$/.test(msg.code), `Expected OTP code for ${phone}`);
  const verifyRes = await apiJson(baseUrl, '/auth/mfa/verify', {
    method: 'POST',
    token: accessToken,
    body: { challengeId, code: msg.code },
  });
  assert.equal(verifyRes.status, 200);
  return {
    userId: reg.userId,
    token: verifyRes.json.data.tokens?.accessToken ?? accessToken,
  };
}

async function runCheckpoint19Verification() {
  console.log(
    '--- Starting Checkpoint 19 Delivery Assignment & Dispatch Engine Verification Suite ---',
  );

  // Test 1: Baseline constants, shared contracts, and payout calculations
  console.log('Test 1: Baseline constants, shared contracts, and payout calculations...');
  assert.ok(SERVER_BASELINE, 'Server baseline must be defined');
  assert.deepEqual(DELIVERY_ASSIGNMENT_STATUSES_RUNTIME, [
    'OFFERED',
    'ACCEPTED',
    'DECLINED',
    'TIMEOUT',
    'CANCELLED',
    'COMPLETED',
  ]);
  assert.equal(OFFER_COUNTDOWN_SECONDS, 45, 'Offer countdown must strictly be 45s per Story F06.1');
  assert.equal(BASE_RIDER_PAYOUT_PAISE, 3500);
  assert.equal(PER_KM_RIDER_PAYOUT_PAISE, 1500);

  // Payout math: 3.5 km -> 3500 + round(3.5 * 1500) = 3500 + 5250 = 8750 paise (₹87.50)
  const calc1 = calculateRiderPayoutPaise(3.5);
  assert.equal(calc1, 8750);

  // OpenAPI check
  const openApiRaw = fs.readFileSync(
    path.join(REPO_ROOT, 'docs/01-CORE-PLANNING-DESIGN/openapi.json'),
    'utf8',
  );
  const openApi = JSON.parse(openApiRaw);
  assert.ok(openApi.paths['/delivery/jobs/inbox'], 'Missing /delivery/jobs/inbox in OpenAPI');
  assert.ok(
    openApi.paths['/delivery/jobs/{offerId}/accept'],
    'Missing /delivery/jobs/{offerId}/accept',
  );
  assert.ok(
    openApi.paths['/delivery/jobs/{offerId}/decline'],
    'Missing /delivery/jobs/{offerId}/decline',
  );
  assert.ok(openApi.paths['/delivery/assignments/active'], 'Missing /delivery/assignments/active');
  assert.ok(openApi.paths['/delivery/dispatch/trigger'], 'Missing /delivery/dispatch/trigger');
  console.log('✓ Test 1 passed.');

  // Initialize service stack
  const config = createTestConfig();
  const logger = createLogger({
    level: 'error',
    service: 'bhojora-test',
    environment: 'test',
    includeStack: false,
  });
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({
    config,
    logger,
    store: identityStore,
    otpAdapter,
  });
  const rbacStore = new InMemoryRbacStore();
  const customerStore = new InMemoryCustomerStore();
  const customerService = new CustomerService({
    config,
    logger,
    customerStore,
    identityStore,
    rbacStore,
  });
  const restaurantStore = new InMemoryRestaurantStore();
  const outletStore = new InMemoryOutletStore();
  const outletService = new OutletService({ outletStore, rbacStore });
  const catalogStore = new InMemoryCatalogStore();
  const cartStore = new InMemoryCartStore();
  const cartService = new CartService({ cartStore, catalogStore, outletStore });
  const pricingStore = new InMemoryPricingStore();
  const pricingService = new PricingService({
    pricingStore,
    catalogStore,
    outletStore,
    outletService,
    signingSecret: config.jwtAccessSecret,
  });
  const paymentStore = new InMemoryPaymentStore();
  const paymentGatewayAdapter = new SandboxPaymentGatewayAdapter();
  const paymentService = new PaymentService({
    paymentStore,
    pricingService,
    gatewayAdapter: paymentGatewayAdapter,
    rbacStore,
    webhookSecret: config.paymentWebhookSecret,
    webhookReplayWindowSeconds: config.webhookReplayWindowSeconds,
    logger,
  });
  const orderStore = new InMemoryOrderStore();
  const orderService = new OrderService({
    orderStore,
    pricingService,
    cartService,
    restaurantStore,
    paymentStore,
    rbacStore,
    logger,
  });
  const deliveryStore = new InMemoryDeliveryStore();
  const deliveryService = new DeliveryService({
    deliveryStore,
    identityStore,
    rbacStore,
    signingSecret: config.jwtAccessSecret,
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    customerService,
    restaurantStore,
    outletService,
    outletStore,
    catalogStore,
    cartService,
    cartStore,
    pricingService,
    pricingStore,
    paymentService,
    paymentStore,
    orderService,
    orderStore,
    deliveryService,
    deliveryStore,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // Setup Admin user with full MFA verification
    const opsAdmin = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'ops.cp19@bhojora.in',
      phone: '+919830099901',
      name: 'Operations Admin',
      role: 'OPS_ADMIN',
      mfaVerified: true,
    });

    // Setup Rider 1 (Salt Lake, APPROVED, ONLINE, totalDeliveries: 5)
    console.log('Test 2: Onboarding & approving candidate riders for dispatch testing...');
    const rider1User = await registerCustomer(
      baseUrl,
      'rider1.cp19@bhojora.in',
      '+919830011101',
      'Subhash Bose',
    );
    const r1App = await apiJson(baseUrl, '/delivery/applications', {
      method: 'POST',
      token: rider1User.token,
      body: {
        fullName: 'Subhash Bose',
        preferredZones: ['salt-lake'],
        vehicleType: 'MOTORCYCLE',
        vehicleModel: 'Hero Splendor',
        vehicleRegistrationNumber: 'WB-02-AB-1234',
      },
    });
    assert.equal(r1App.status, 201);
    const r1PartnerId = r1App.json.data.application.partnerId;

    // Upload DL, submit & approve Rider 1
    await apiJson(baseUrl, '/delivery/profile/me/documents', {
      method: 'POST',
      token: rider1User.token,
      body: {
        type: 'DRIVING_LICENSE',
        documentNumber: 'WB0220200001234',
        fileUrl: 'https://docs.bhojora.in/private/dl_1.pdf',
        mimeType: 'application/pdf',
      },
    });
    await apiJson(baseUrl, '/delivery/profile/me', {
      method: 'PUT',
      token: rider1User.token,
      body: {
        bankAccountHolderName: 'Subhash Bose',
        bankAccountNumber: '123456789012',
        bankIfscCode: 'HDFC0000128',
        bankName: 'HDFC Bank',
      },
    });
    await apiJson(baseUrl, '/delivery/profile/me/submit', {
      method: 'POST',
      token: rider1User.token,
    });
    await apiJson(baseUrl, `/delivery/admin/applications/${r1PartnerId}/review`, {
      method: 'POST',
      token: opsAdmin.token,
      body: { action: 'APPROVE' },
    });
    // Set Rider 1 ONLINE in Salt Lake (88.4370, 22.5800)
    await apiJson(baseUrl, '/delivery/profile/me/availability', {
      method: 'PATCH',
      token: rider1User.token,
      body: { shiftStatus: 'ONLINE', coordinates: [88.437, 22.58] },
    });
    await deliveryStore.updatePartner(r1PartnerId, { totalDeliveries: 5 });

    // Setup Rider 2 (Salt Lake, APPROVED, ONLINE, totalDeliveries: 2 - fewer deliveries for fairness)
    const rider2User = await registerCustomer(
      baseUrl,
      'rider2.cp19@bhojora.in',
      '+919830022202',
      'Pradip Sen',
    );
    const r2App = await apiJson(baseUrl, '/delivery/applications', {
      method: 'POST',
      token: rider2User.token,
      body: {
        fullName: 'Pradip Sen',
        preferredZones: ['salt-lake'],
        vehicleType: 'SCOOTER',
        vehicleModel: 'Honda Activa',
        vehicleRegistrationNumber: 'WB-02-CD-5678',
      },
    });
    const r2PartnerId = r2App.json.data.application.partnerId;
    await apiJson(baseUrl, '/delivery/profile/me/documents', {
      method: 'POST',
      token: rider2User.token,
      body: {
        type: 'DRIVING_LICENSE',
        documentNumber: 'WB0220200005678',
        fileUrl: 'https://docs.bhojora.in/private/dl_2.pdf',
        mimeType: 'application/pdf',
      },
    });
    await apiJson(baseUrl, '/delivery/profile/me', {
      method: 'PUT',
      token: rider2User.token,
      body: {
        bankAccountHolderName: 'Pradip Sen',
        bankAccountNumber: '987654321098',
        bankIfscCode: 'ICIC0000102',
        bankName: 'ICICI Bank',
      },
    });
    await apiJson(baseUrl, '/delivery/profile/me/submit', {
      method: 'POST',
      token: rider2User.token,
    });
    await apiJson(baseUrl, `/delivery/admin/applications/${r2PartnerId}/review`, {
      method: 'POST',
      token: opsAdmin.token,
      body: { action: 'APPROVE' },
    });
    // Set Rider 2 ONLINE in Salt Lake (88.4350, 22.5810)
    await apiJson(baseUrl, '/delivery/profile/me/availability', {
      method: 'PATCH',
      token: rider2User.token,
      body: { shiftStatus: 'ONLINE', coordinates: [88.435, 22.581] },
    });
    await deliveryStore.updatePartner(r2PartnerId, { totalDeliveries: 2 });

    // Setup Rider 3 (South Kolkata only, APPROVED, ONLINE)
    const rider3User = await registerCustomer(
      baseUrl,
      'rider3.cp19@bhojora.in',
      '+919830033303',
      'Debashis Roy',
    );
    const r3App = await apiJson(baseUrl, '/delivery/applications', {
      method: 'POST',
      token: rider3User.token,
      body: {
        fullName: 'Debashis Roy',
        preferredZones: ['south'],
        vehicleType: 'MOTORCYCLE',
        vehicleModel: 'Bajaj Pulsar',
        vehicleRegistrationNumber: 'WB-02-EF-9999',
      },
    });
    assert.equal(r3App.status, 201, `Failed to create application for Rider 3: ${r3App.rawText}`);
    const r3PartnerId = r3App.json.data.application.partnerId;
    await apiJson(baseUrl, '/delivery/profile/me/documents', {
      method: 'POST',
      token: rider3User.token,
      body: {
        type: 'DRIVING_LICENSE',
        documentNumber: 'WB0220200009999',
        fileUrl: 'https://docs.bhojora.in/private/dl_3.pdf',
        mimeType: 'application/pdf',
      },
    });
    await apiJson(baseUrl, '/delivery/profile/me', {
      method: 'PUT',
      token: rider3User.token,
      body: {
        bankAccountHolderName: 'Debashis Roy',
        bankAccountNumber: '555566667777',
        bankIfscCode: 'SBIN0000123',
        bankName: 'State Bank of India',
      },
    });
    await apiJson(baseUrl, '/delivery/profile/me/submit', {
      method: 'POST',
      token: rider3User.token,
    });
    await apiJson(baseUrl, `/delivery/admin/applications/${r3PartnerId}/review`, {
      method: 'POST',
      token: opsAdmin.token,
      body: { action: 'APPROVE' },
    });
    await apiJson(baseUrl, '/delivery/profile/me/availability', {
      method: 'PATCH',
      token: rider3User.token,
      body: { shiftStatus: 'ONLINE', coordinates: [88.3639, 22.512] },
    });
    console.log('✓ Test 2 passed.');

    // Test 3: Automated dispatch trigger & fairness candidate selection
    console.log('Test 3: Dispatch offer generation with 45-second TTL & payout calculation...');
    const dispatchRes = await apiJson(baseUrl, '/delivery/dispatch/trigger', {
      method: 'POST',
      token: opsAdmin.token,
      body: {
        orderId: 'ord_saltlake_001',
        outletId: 'out_saltlake_101',
        pickupLocation: {
          name: 'Oudh 1590 Salt Lake',
          addressLine: 'Block CD, Sector I, Salt Lake',
          landmark: 'City Centre 1',
          coordinates: [88.435, 22.581],
        },
        dropLocation: {
          name: 'Anupam Guha',
          addressLine: 'Sector V, Salt Lake',
          landmark: 'Technopolis',
          coordinates: [88.441, 22.585],
        },
        estimatedDistanceKm: 2.4,
        estimatedDurationMinutes: 18,
        deliveryFeePaise: 6500,
      },
    });
    assert.equal(dispatchRes.status, 201);
    assert.equal(dispatchRes.json.data.offered, true);
    const offer1 = dispatchRes.json.data.offer;
    assert.ok(offer1.offerId.startsWith('dlo_'));
    assert.equal(offer1.status, 'OFFERED');
    // Fairness verification: Rider 2 had 2 total deliveries vs Rider 1's 5 total deliveries -> Rider 2 picked!
    assert.equal(
      offer1.offeredToPartnerId,
      r2PartnerId,
      'Fairness rule must select rider with fewer total deliveries',
    );
    assert.ok(offer1.guaranteedPayoutPaise >= BASE_RIDER_PAYOUT_PAISE);

    // Verify 45-second expiration timestamp
    const offeredAt = new Date(offer1.offeredAt).getTime();
    const expiresAt = new Date(offer1.expiresAt).getTime();
    const diffSeconds = Math.round((expiresAt - offeredAt) / 1000);
    assert.equal(diffSeconds, 45, 'Offer expiration must be exactly 45 seconds');
    console.log('✓ Test 3 passed.');

    // Test 4: Job Inbox Isolation & Cross-Partner Access Control
    console.log('Test 4: Job Inbox Isolation & Cross-Partner Access Control...');
    // Rider 2 inspects inbox -> sees offer
    const r2Inbox = await apiJson(baseUrl, '/delivery/jobs/inbox', {
      token: rider2User.token,
    });
    assert.equal(r2Inbox.status, 200);
    assert.equal(r2Inbox.json.data.inbox.activeOffers.length, 1);
    assert.equal(r2Inbox.json.data.inbox.activeOffers[0].offerId, offer1.offerId);

    // Rider 1 inspects inbox -> empty (no offer addressed to them)
    const r1Inbox = await apiJson(baseUrl, '/delivery/jobs/inbox', {
      token: rider1User.token,
    });
    assert.equal(r1Inbox.status, 200);
    assert.equal(r1Inbox.json.data.inbox.activeOffers.length, 0);

    // Rider 1 attempts to accept Rider 2's offer -> 403 Forbidden
    const crossAcceptRes = await apiJson(baseUrl, `/delivery/jobs/${offer1.offerId}/accept`, {
      method: 'POST',
      token: rider1User.token,
    });
    assert.equal(crossAcceptRes.status, 403);
    assert.ok(crossAcceptRes.json.error.message.includes('not authorized'));
    console.log('✓ Test 4 passed.');

    // Test 5: Concurrency Safety (Acceptance Criteria: Concurrent acceptance safe)
    console.log('Test 5: Concurrency Safety (Simultaneous accept requests)...');
    // Simulate two parallel network requests hitting the accept endpoint concurrently
    const [acceptReq1, acceptReq2] = await Promise.all([
      apiJson(baseUrl, `/delivery/jobs/${offer1.offerId}/accept`, {
        method: 'POST',
        token: rider2User.token,
      }),
      apiJson(baseUrl, `/delivery/jobs/${offer1.offerId}/accept`, {
        method: 'POST',
        token: rider2User.token,
      }),
    ]);

    // Exactly one must succeed (200 OK) and the other must be rejected with 409 Conflict
    const has200 = acceptReq1.status === 200 || acceptReq2.status === 200;
    const has409 = acceptReq1.status === 409 || acceptReq2.status === 409;
    assert.ok(has200, 'At least one request must succeed');
    assert.ok(has409, 'Concurrent conflicting request must receive 409 Conflict');
    console.log('✓ Test 5 passed.');

    // Test 6: No duplicate active assignment & ON_DELIVERY shift status
    console.log('Test 6: No duplicate active assignment & ON_DELIVERY shift status...');
    const r2ProfileAfterAccept = await apiJson(baseUrl, '/delivery/profile/me', {
      token: rider2User.token,
    });
    assert.equal(r2ProfileAfterAccept.json.data.profile.shiftStatus, 'ON_DELIVERY');

    // Create a new Order 2 offer
    const dispatchRes2 = await apiJson(baseUrl, '/delivery/dispatch/trigger', {
      method: 'POST',
      token: opsAdmin.token,
      body: {
        orderId: 'ord_saltlake_002',
        outletId: 'out_saltlake_101',
        pickupLocation: {
          name: 'Oudh 1590',
          addressLine: 'Block CD, Sector I',
          coordinates: [88.435, 22.581],
        },
        dropLocation: {
          name: 'Rohan Sen',
          addressLine: 'Sector II',
          coordinates: [88.42, 22.58],
        },
        estimatedDistanceKm: 1.8,
        estimatedDurationMinutes: 12,
      },
    });
    assert.equal(dispatchRes2.status, 201);
    const offer2 = dispatchRes2.json.data.offer;
    // Rider 2 is ON_DELIVERY so offer2 is routed to Rider 1!
    assert.equal(offer2.offeredToPartnerId, r1PartnerId);

    // Rider 2 attempts to accept a second delivery while ON_DELIVERY -> 409 Conflict
    // Even if maliciously calling accept on offer2:
    const duplicateAcceptRes = await apiJson(baseUrl, `/delivery/jobs/${offer2.offerId}/accept`, {
      method: 'POST',
      token: rider2User.token,
    });
    assert.ok(duplicateAcceptRes.status === 403 || duplicateAcceptRes.status === 409);

    // Duplicate dispatch on already assigned Order 1 -> 409 Conflict
    const duplicateOrderDispatch = await apiJson(baseUrl, '/delivery/dispatch/trigger', {
      method: 'POST',
      token: opsAdmin.token,
      body: {
        orderId: 'ord_saltlake_001',
        outletId: 'out_saltlake_101',
        pickupLocation: { name: 'Oudh', addressLine: 'Block CD', coordinates: [88.435, 22.581] },
        dropLocation: { name: 'Anupam', addressLine: 'Sector V', coordinates: [88.441, 22.585] },
        estimatedDistanceKm: 2.4,
        estimatedDurationMinutes: 18,
      },
    });
    assert.equal(duplicateOrderDispatch.status, 409);
    console.log('✓ Test 6 passed.');

    // Test 7: Decline offer & immediate automated reassignment to next candidate
    console.log('Test 7: Decline offer & immediate automated reassignment...');
    // Rider 1 declines offer 2
    const declineRes = await apiJson(baseUrl, `/delivery/jobs/${offer2.offerId}/decline`, {
      method: 'POST',
      token: rider1User.token,
      body: { reason: 'Vehicle tire low pressure' },
    });
    assert.equal(declineRes.status, 200);
    assert.equal(declineRes.json.data.declined, true);
    assert.equal(declineRes.json.data.reassigned, true);
    assert.ok(declineRes.json.data.nextOfferId);

    // Verify next offer was reassigned to Rider 3 (the next available candidate)
    const nextOffer = await deliveryStore.getOfferById(declineRes.json.data.nextOfferId);
    assert.ok(nextOffer);
    assert.equal(nextOffer.reassignedFromOfferId, offer2.offerId);
    assert.equal(nextOffer.offeredToPartnerId, r3PartnerId);
    console.log('✓ Test 7 passed.');

    // Test 8: Offer Expiration / Timeout & Reassignment
    console.log('Test 8: Offer Expiration / Timeout...');
    // Create an offer with past expiration
    const expiredOffer = await deliveryStore.createOffer({
      offerId: 'dlo_expired_test_01',
      orderId: 'ord_saltlake_003',
      outletId: 'out_saltlake_101',
      status: 'OFFERED',
      offeredToPartnerId: r1PartnerId,
      partnerId: null,
      pickupLocation: {
        name: 'Oudh',
        addressLine: 'Block CD',
        landmark: null,
        coordinates: [88.435, 22.581],
      },
      dropLocation: {
        name: 'Client',
        addressLine: 'Sector V',
        landmark: null,
        coordinates: [88.441, 22.585],
      },
      estimatedDistanceKm: 3.0,
      estimatedDurationMinutes: 20,
      guaranteedPayoutPaise: 8000,
      offeredAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() - 15000), // expired 15 seconds ago
      acceptedAt: null,
      declinedAt: null,
      declineReason: null,
      reassignedFromOfferId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const expiredAcceptRes = await apiJson(
      baseUrl,
      `/delivery/jobs/${expiredOffer.offerId}/accept`,
      {
        method: 'POST',
        token: rider1User.token,
      },
    );
    assert.equal(expiredAcceptRes.status, 409);
    assert.ok(expiredAcceptRes.json.error.message.includes('expired'));
    const offerAfterExpiredAccept = await deliveryStore.getOfferById(expiredOffer.offerId);
    assert.equal(offerAfterExpiredAccept.status, 'TIMEOUT');

    // Create another expired offer and trigger timeoutOffer directly
    const expiredOffer2 = await deliveryStore.createOffer({
      offerId: 'dlo_expired_test_02',
      orderId: 'ord_saltlake_004',
      outletId: 'out_saltlake_101',
      status: 'OFFERED',
      offeredToPartnerId: r1PartnerId,
      partnerId: null,
      pickupLocation: {
        name: 'Oudh',
        addressLine: 'Block CD',
        landmark: null,
        coordinates: [88.435, 22.581],
      },
      dropLocation: {
        name: 'Client 2',
        addressLine: 'Sector V',
        landmark: null,
        coordinates: [88.441, 22.585],
      },
      estimatedDistanceKm: 2.5,
      estimatedDurationMinutes: 15,
      guaranteedPayoutPaise: 7500,
      offeredAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() - 10000),
      acceptedAt: null,
      declinedAt: null,
      declineReason: null,
      reassignedFromOfferId: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const timeoutRes = await deliveryService.timeoutOffer(expiredOffer2.offerId);
    assert.equal(timeoutRes.timedOut, true);
    console.log('✓ Test 8 passed.');

    // Test 9: Active Delivery Assignment Inspection
    console.log('Test 9: Active Delivery Assignment Inspection...');
    const r2ActiveRes = await apiJson(baseUrl, '/delivery/assignments/active', {
      token: rider2User.token,
    });
    assert.equal(r2ActiveRes.status, 200);
    assert.ok(r2ActiveRes.json.data.assignment);
    assert.equal(r2ActiveRes.json.data.assignment.orderId, 'ord_saltlake_001');
    assert.equal(r2ActiveRes.json.data.assignment.status, 'ACCEPTED');

    const r1ActiveRes = await apiJson(baseUrl, '/delivery/assignments/active', {
      token: rider1User.token,
    });
    assert.equal(r1ActiveRes.status, 200);
    assert.equal(r1ActiveRes.json.data.assignment, null);
    console.log('✓ Test 9 passed.');

    console.log('--- ALL CHECKPOINT 19 VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

void runCheckpoint19Verification().catch((err) => {
  console.error('FATAL Test failure in Checkpoint 19 verification:', err);
  process.exit(1);
});
