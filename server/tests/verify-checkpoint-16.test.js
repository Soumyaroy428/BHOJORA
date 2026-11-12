'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { SERVER_BASELINE } = require('../dist/index.js');
const { validateEnv } = require('../dist/config/env.js');
const { createLogger } = require('../dist/config/logger.js');
const { createApp } = require('../dist/app.js');
const { INITIAL_DATABASE_INDEXES } = require('../dist/database/indexes.js');
const { InMemoryIdentityStore } = require('../dist/modules/identity/identity.models.js');
const { InMemoryTestOtpAdapter } = require('../dist/modules/identity/otp.adapter.js');
const { IdentityService } = require('../dist/modules/identity/identity.service.js');
const { InMemoryRbacStore } = require('../dist/modules/rbac/rbac.store.js');
const { InMemoryCustomerStore } = require('../dist/modules/customer/customer.store.js');
const { CustomerService } = require('../dist/modules/customer/customer.service.js');
const { InMemoryRestaurantStore } = require('../dist/modules/restaurant/restaurant.store.js');
const { InMemoryOutletStore } = require('../dist/modules/outlet/outlet.store.js');
const { DEFAULT_OUTLET_OPERATING_SLOTS } = require('../dist/modules/outlet/outlet.geo.js');
const { OutletService } = require('../dist/modules/outlet/outlet.service.js');
const { InMemoryCatalogStore } = require('../dist/modules/catalog/catalog.store.js');
const { InMemoryCartStore } = require('../dist/modules/cart/cart.store.js');
const { CartService } = require('../dist/modules/cart/cart.service.js');
const { InMemoryPricingStore } = require('../dist/modules/pricing/pricing.store.js');
const { PricingService } = require('../dist/modules/pricing/pricing.service.js');
const {
  SandboxPaymentGatewayAdapter,
  signSandboxWebhook,
} = require('../dist/modules/payments/payments.adapter.js');
const { InMemoryPaymentStore } = require('../dist/modules/payments/payments.store.js');
const { PaymentService } = require('../dist/modules/payments/payments.service.js');
const { InMemoryOrderStore } = require('../dist/modules/orders/orders.store.js');
const { OrderService } = require('../dist/modules/orders/orders.service.js');
const {
  ORDER_STATUSES_RUNTIME,
  ORDER_CANCEL_REASONS_RUNTIME,
  ORDER_EVENT_TYPES_RUNTIME,
  ORDER_VALID_TRANSITIONS_MAP,
} = require('../dist/modules/orders/orders.types.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TEST_PASSWORD = 'Bhojora#Orders2026';

class MutableTestClock {
  constructor(initialIso) {
    this.current = new Date(initialIso);
  }
  advanceSeconds(seconds) {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
  now() {
    return new Date(this.current.getTime());
  }
}

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4016',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp16_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long-cp16',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long-cp16',
      PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-minimum-32-characters-long-cp16',
      WEBHOOK_REPLAY_WINDOW_SECONDS: '300',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:4173',
    },
    { serviceName: 'bhojora-api-cp16-test', serviceVersion: '0.1.0' },
  );
}

async function startTestServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
  };
}

async function apiJson(baseUrl, routePath, { method = 'GET', token, headers = {}, body } = {}) {
  const res = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, headers: res.headers, json };
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
  const msg = otpAdapter.getLatestMessage();
  assert.ok(msg && /^\d{6}$/.test(msg.code), `Expected MFA OTP for ${email}`);
  const verifyRes = await apiJson(baseUrl, '/auth/mfa/verify', {
    method: 'POST',
    token: accessToken,
    body: { challengeId: sendRes.json.data.challengeId, code: msg.code },
  });
  assert.equal(verifyRes.status, 200);
  return {
    userId: reg.userId,
    token: verifyRes.json.data.tokens?.accessToken ?? accessToken,
  };
}

async function addItemAndCreateQuote(baseUrl, token, couponCode = undefined) {
  const addRes = await apiJson(baseUrl, '/cart/items', {
    method: 'POST',
    token,
    body: {
      outletId: 'out_arsalan',
      menuItemId: 'item_mutton_biryani',
      quantity: 2,
    },
  });
  assert.ok(
    addRes.status === 200 || addRes.status === 201,
    `Cart add failed: ${JSON.stringify(addRes.json)}`,
  );

  const quoteRes = await apiJson(baseUrl, '/checkout/quote', {
    method: 'POST',
    token,
    body: {
      coordinates: [88.3526, 22.5535],
      ...(couponCode ? { couponCode } : {}),
    },
  });
  assert.ok(
    quoteRes.status === 200 || quoteRes.status === 201,
    `Quote create failed: ${JSON.stringify(quoteRes.json)}`,
  );
  return quoteRes.json.data.quote;
}

async function run() {
  // 1. Baseline, shared contract parity, DB indexes, OpenAPI coverage
  assert.ok(Number(SERVER_BASELINE.checkpoint) >= 16, 'SERVER_BASELINE.checkpoint must be >= 16');

  const shared = await import(
    pathToFileURL(path.join(REPO_ROOT, 'client', 'shared', 'dist', 'contracts', 'orders.js')).href
  );
  assert.deepEqual([...ORDER_STATUSES_RUNTIME], [...shared.ORDER_STATUSES]);
  assert.deepEqual([...ORDER_CANCEL_REASONS_RUNTIME], [...shared.ORDER_CANCEL_REASONS]);
  assert.deepEqual([...ORDER_EVENT_TYPES_RUNTIME], [...shared.ORDER_EVENT_TYPES]);
  assert.deepEqual(ORDER_VALID_TRANSITIONS_MAP, shared.ORDER_VALID_TRANSITIONS);

  const indexNames = new Set(INITIAL_DATABASE_INDEXES.map((i) => i.options.name));
  for (const requiredIdx of [
    'idx_orders_id_unique',
    'idx_orders_quote_unique',
    'idx_orders_customer_created_desc',
    'idx_orders_outlet_status_created_desc',
    'idx_order_items_id_unique',
    'idx_order_items_order_id',
    'idx_order_events_id_unique',
    'idx_order_events_order_occurred',
    'idx_outbox_events_id_unique',
    'idx_outbox_events_status_occurred',
  ]) {
    assert.ok(indexNames.has(requiredIdx), `Missing required CP16 index ${requiredIdx}`);
  }

  const openapi = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, 'docs', '01-CORE-PLANNING-DESIGN', 'openapi.json'),
      'utf8',
    ),
  );
  for (const routePath of [
    '/orders',
    '/orders/{id}',
    '/orders/{id}/cancel',
    '/orders/{id}/status',
    '/orders/{id}/tracking',
    '/restaurant/orders',
    '/restaurant/orders/{id}/status',
  ]) {
    assert.ok(openapi.paths[routePath], `OpenAPI spec must document ${routePath}`);
  }

  // 2. Boot modular express server with InMemory stores + MutableTestClock
  const config = createTestConfig();
  const logger = createLogger({ level: 'error', service: 'cp16-test', environment: 'test' });
  const testClock = new MutableTestClock('2026-11-12T06:30:00Z');
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const rbacStore = new InMemoryRbacStore();
  const customerStore = new InMemoryCustomerStore();
  const customerService = new CustomerService({
    customerStore,
    identityStore,
    rbacStore,
    logger,
    clock: testClock,
  });
  const restaurantStore = new InMemoryRestaurantStore();
  const outletStore = new InMemoryOutletStore();
  const outletService = new OutletService({
    restaurantStore,
    outletStore,
    rbacStore,
    logger,
    clock: testClock,
  });
  const catalogStore = new InMemoryCatalogStore();
  const cartStore = new InMemoryCartStore();
  const cartService = new CartService({
    cartStore,
    restaurantStore,
    catalogStore,
    logger,
    clock: testClock,
  });
  const pricingStore = new InMemoryPricingStore();
  const pricingService = new PricingService({
    pricingStore,
    cartService,
    customerService,
    restaurantStore,
    outletService,
    catalogStore,
    signingSecret: config.jwtAccessSecret,
    logger,
    clock: testClock,
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
    clock: testClock,
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
    clock: testClock,
  });
  paymentService.setOnPaymentCapturedListener(async (payment) => {
    await orderService.confirmOrderFromPayment(payment);
  });
  paymentService.setCanPayConsumedQuote(async (customerId, quoteId) => {
    const existingOrder = await orderStore.getOrderByQuoteId(quoteId);
    return (
      existingOrder !== null &&
      existingOrder.customerId === customerId &&
      existingOrder.status === 'AWAITING_PAYMENT'
    );
  });

  const now = testClock.now();
  await restaurantStore.upsertOutlet({
    outletId: 'out_arsalan',
    restaurantId: 'rest_arsalan',
    ownerUserId: 'usr_owner_arsalan',
    brandName: 'Arsalan',
    name: 'Park Circus',
    slug: 'arsalan-out-arsalan',
    zoneId: 'central',
    wardOrBorough: 'Park Circus Ward',
    streetAddress: '191 Park Street',
    landmark: 'Near Park Circus 7-Point',
    locality: 'Park Circus',
    city: 'Kolkata',
    postalCode: '700017',
    location: { type: 'Point', coordinates: [88.366, 22.543] },
    cuisines: ['Mughlai', 'Biryani'],
    prepTimeMinutes: 25,
    deliveryRadiusMeters: 8000,
    operatingSlots: DEFAULT_OUTLET_OPERATING_SLOTS,
    status: 'ACTIVE',
    fssaiLicenseNumber: '12826019000999',
    fssaiExpiresOn: '2028-12-31',
    fssaiVerificationStatus: 'VERIFIED',
    platformInspectionStatus: 'VERIFIED_CLEAN',
    publishedSafetyScore: 94,
    createdAt: now,
    updatedAt: now,
  });

  await catalogStore.createCategory({
    categoryId: 'cat_biryani',
    outletId: 'out_arsalan',
    restaurantId: 'rest_arsalan',
    name: 'Signature Biryani',
    description: 'Slow-cooked Kolkata dum biryani',
    sortOrder: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  await catalogStore.createMenuItem({
    itemId: 'item_mutton_biryani',
    outletId: 'out_arsalan',
    restaurantId: 'rest_arsalan',
    categoryId: 'cat_biryani',
    title: 'Special Mutton Biryani',
    description: 'Saffron basmati, tender mutton & aloo',
    pricePaise: 42000,
    gstTaxSlab: 'RESTAURANT_5_PCT',
    dietaryType: 'NON_VEG',
    allergens: ['DAIRY'],
    allergenDisclosureConfirmed: true,
    imageUrl: 'https://images.bhojora.example/mutton-biryani.jpg',
    isAvailable: true,
    dailyStockRemaining: 20,
    prepTimeMinutes: 20,
    variants: [],
    addonGroups: [],
    createdByUserId: 'usr_owner_arsalan',
    updatedByUserId: 'usr_owner_arsalan',
    createdAt: now,
    updatedAt: now,
  });

  const app = createApp({
    config,
    logger,
    clock: testClock,
    identityService,
    identityStore,
    rbacStore,
    customerStore,
    customerService,
    restaurantStore,
    outletStore,
    outletService,
    catalogStore,
    cartStore,
    cartService,
    pricingStore,
    pricingService,
    paymentStore,
    paymentService,
    paymentGatewayAdapter,
    orderStore,
    orderService,
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const alice = await registerCustomer(
      baseUrl,
      'alice.orders@example.com',
      '+919830111001',
      'Alice Chatterjee',
    );
    const bob = await registerCustomer(
      baseUrl,
      'bob.orders@example.com',
      '+919830111002',
      'Bob Sen',
    );
    const kitchenStaff = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'kitchen.arsalan@example.com',
      phone: '+919830111003',
      name: 'Arsalan Kitchen Manager',
      role: 'RESTAURANT_MANAGER',
    });
    await rbacStore.upsertMembership({
      userId: kitchenStaff.userId,
      restaurantId: 'rest_arsalan',
      outletId: 'out_arsalan',
      role: 'RESTAURANT_MANAGER',
      status: 'ACTIVE',
      assignedBy: 'SYSTEM',
    });

    const rogueRestaurant = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'rogue.kitchen@example.com',
      phone: '+919830111004',
      name: 'Unrelated Partner',
      role: 'RESTAURANT_MANAGER',
    });

    const rider = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'rider.kolkata@example.com',
      phone: '+919830111005',
      name: 'Rohan Rider',
      role: 'DELIVERY_PARTNER',
    });

    // 3. Reject missing Idempotency-Key and client price/status overrides
    const quote1 = await addItemAndCreateQuote(baseUrl, alice.token, 'BHOJORA100');
    const missingKeyRes = await apiJson(baseUrl, '/orders', {
      method: 'POST',
      token: alice.token,
      body: { quoteId: quote1.quoteId },
    });
    assert.equal(missingKeyRes.status, 400);

    const tamperRes = await apiJson(baseUrl, '/orders', {
      method: 'POST',
      token: alice.token,
      headers: { 'Idempotency-Key': 'ord_tamper_test_key_0001' },
      body: { quoteId: quote1.quoteId, status: 'DELIVERED', totalPayablePaise: 100 },
    });
    assert.equal(tamperRes.status, 400);

    // 4. Duplicate submit & Idempotency-Key conflict + concurrent race test (two different keys on same quote)
    const idemKey1 = 'ord_idem_quote1_primary_001';
    const [raceA, raceB] = await Promise.all([
      apiJson(baseUrl, '/orders', {
        method: 'POST',
        token: alice.token,
        headers: { 'Idempotency-Key': idemKey1 },
        body: { quoteId: quote1.quoteId, specialInstructions: 'Extra masala' },
      }),
      apiJson(baseUrl, '/orders', {
        method: 'POST',
        token: alice.token,
        headers: { 'Idempotency-Key': 'ord_idem_quote1_duplicate_002' },
        body: { quoteId: quote1.quoteId, specialInstructions: 'Extra masala' },
      }),
    ]);

    const raceStatuses = [raceA.status, raceB.status].sort((a, b) => a - b);
    assert.deepEqual(
      raceStatuses,
      [201, 409],
      `Concurrent double-submit must yield strictly [201, 409], got [${raceA.status}, ${raceB.status}]`,
    );
    const winningOrderRes = raceA.status === 201 ? raceA : raceB;
    const winningIdemKey = raceA.status === 201 ? idemKey1 : 'ord_idem_quote1_duplicate_002';
    const order1 = winningOrderRes.json.data.order;
    assert.equal(order1.status, 'AWAITING_PAYMENT');
    assert.equal(order1.items.length, 1);
    assert.equal(
      order1.pricingBreakdown.totalPayablePaise,
      quote1.pricingBreakdown.totalPayablePaise,
    );

    // Identical Idempotency-Key retry returns 200 cached replay with exact orderId
    const replayRes = await apiJson(baseUrl, '/orders', {
      method: 'POST',
      token: alice.token,
      headers: { 'Idempotency-Key': winningIdemKey },
      body: { quoteId: quote1.quoteId, specialInstructions: 'Extra masala' },
    });
    assert.equal(replayRes.status, 200);
    assert.equal(replayRes.json.data.idempotentReplay, true);
    assert.equal(replayRes.json.data.order.orderId, order1.orderId);

    // Same Idempotency-Key with mismatched payload -> 409 IDEMPOTENCY_CONFLICT
    const mismatchRes = await apiJson(baseUrl, '/orders', {
      method: 'POST',
      token: alice.token,
      headers: { 'Idempotency-Key': winningIdemKey },
      body: { quoteId: quote1.quoteId, specialInstructions: 'Different payload' },
    });
    assert.equal(mismatchRes.status, 409);
    assert.equal(mismatchRes.json.error.code, 'IDEMPOTENCY_CONFLICT');

    // Cart was cleared when order1 was created
    const cartAfterOrder = await apiJson(baseUrl, '/cart', { token: alice.token });
    assert.equal(cartAfterOrder.status, 200);
    assert.equal(cartAfterOrder.json.data.cart.items.length, 0);

    // 5. Invalid transitions & RBAC IDOR protections on order1 (AWAITING_PAYMENT)
    const jumpDeliveredRes = await apiJson(baseUrl, `/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: kitchenStaff.token,
      body: { status: 'DELIVERED' },
    });
    assert.equal(jumpDeliveredRes.status, 403); // Restaurant manager cannot jump straight to DELIVERED or skip CONFIRMED

    const invalidJumpRes = await apiJson(baseUrl, `/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: kitchenStaff.token,
      body: { status: 'PREPARING' },
    });
    assert.equal(
      invalidJumpRes.status,
      409,
      'Must block AWAITING_PAYMENT -> PREPARING with 409 CONFLICT',
    );

    const customerForgeRes = await apiJson(baseUrl, `/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: alice.token,
      body: { status: 'DELIVERED' },
    });
    assert.equal(customerForgeRes.status, 403);

    const bobReadRes = await apiJson(baseUrl, `/orders/${order1.orderId}`, { token: bob.token });
    assert.equal(bobReadRes.status, 403);

    const rogueKitchenRes = await apiJson(baseUrl, `/restaurant/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: rogueRestaurant.token,
      body: { status: 'PREPARING' },
    });
    assert.equal(rogueKitchenRes.status, 403);

    // 6. Payment capture webhook transitions AWAITING_PAYMENT -> CONFIRMED automatically
    const payCreateRes = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: alice.token,
      headers: { 'Idempotency-Key': 'pay_cp16_for_order1_001' },
      body: {
        quoteId: quote1.quoteId,
        provider: 'SANDBOX_RAZORPAY',
        method: 'UPI',
        upiHandleHint: 'alice@okhdfcbank',
        sandboxScenario: 'PENDING_WEBHOOK',
      },
    });
    assert.equal(payCreateRes.status, 201);
    const payment1 = payCreateRes.json.data.payment;

    const tsSeconds = Math.floor(testClock.now().getTime() / 1000);
    const webhookBody = {
      eventId: 'wh_evt_cp16_capture_001',
      eventType: 'payment.captured',
      providerPaymentId: payment1.providerPaymentId,
      amountPaise: payment1.amountPaise,
    };
    const sig = signSandboxWebhook(tsSeconds, webhookBody, config.paymentWebhookSecret);
    const webhookRes = await apiJson(baseUrl, '/webhooks/payments/sandbox_razorpay', {
      method: 'POST',
      headers: {
        'x-bhojora-signature': sig,
        'x-webhook-timestamp': String(tsSeconds),
      },
      body: webhookBody,
    });
    assert.equal(webhookRes.status, 200);

    const orderAfterPay = await apiJson(baseUrl, `/orders/${order1.orderId}`, {
      token: alice.token,
    });
    assert.equal(orderAfterPay.status, 200);
    assert.equal(orderAfterPay.json.data.order.status, 'CONFIRMED');
    assert.equal(orderAfterPay.json.data.order.paymentId, payment1.paymentId);
    const outboxAfterPay = await orderStore.listOutboxEventsForAggregate(order1.orderId);
    assert.ok(outboxAfterPay.some((e) => e.eventType === 'ORDER_CONFIRMED'));

    // 7. Race condition test: simultaneous Customer Cancel vs Kitchen Accept PREPARING on CONFIRMED order1!
    const [cancelRace, prepRace] = await Promise.all([
      apiJson(baseUrl, `/orders/${order1.orderId}/cancel`, {
        method: 'POST',
        token: alice.token,
        body: { reasonCode: 'CUSTOMER_CHANGED_MIND', note: 'Ordered too spicy' },
      }),
      apiJson(baseUrl, `/restaurant/orders/${order1.orderId}/status`, {
        method: 'PATCH',
        token: kitchenStaff.token,
        body: { status: 'PREPARING', note: 'Kitchen started tandoor prep' },
      }),
    ]);

    const raceOutcome = [cancelRace.status, prepRace.status].sort((a, b) => a - b);
    assert.deepEqual(
      raceOutcome,
      [200, 409],
      `Concurrent cancel vs PREPARING must yield strictly [200, 409], got [${cancelRace.status}, ${prepRace.status}]`,
    );

    // 8. Verify deterministic full lifecycle & terminal immutability on a fresh order2
    const quote2 = await addItemAndCreateQuote(baseUrl, alice.token);
    const create2Res = await apiJson(baseUrl, '/orders', {
      method: 'POST',
      token: alice.token,
      headers: { 'Idempotency-Key': 'ord_idem_quote2_full_flow_001' },
      body: { quoteId: quote2.quoteId },
    });
    assert.equal(create2Res.status, 201);
    const order2Id = create2Res.json.data.order.orderId;

    // Customer free cancellation in AWAITING_PAYMENT -> NOT_REQUIRED refund, then terminal locked!
    const cancelOrder2Res = await apiJson(baseUrl, `/orders/${order2Id}/cancel`, {
      method: 'POST',
      token: alice.token,
      body: { reasonCode: 'ORDERED_BY_MISTAKE' },
    });
    assert.equal(cancelOrder2Res.status, 200);
    assert.equal(cancelOrder2Res.json.data.order.status, 'CANCELLED');
    assert.equal(cancelOrder2Res.json.data.order.cancellation.refundStatus, 'NOT_REQUIRED');

    const doubleCancelRes = await apiJson(baseUrl, `/orders/${order2Id}/cancel`, {
      method: 'POST',
      token: alice.token,
      body: { reasonCode: 'CUSTOMER_CHANGED_MIND' },
    });
    assert.equal(doubleCancelRes.status, 409);

    // 9. Fresh confirmed order3 through full kitchen -> rider -> DELIVERED pipeline + cancel blocked in PREPARING
    const quote3 = await addItemAndCreateQuote(baseUrl, bob.token);
    const pay3Create = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: bob.token,
      headers: { 'Idempotency-Key': 'pay_cp16_order3_001' },
      body: {
        quoteId: quote3.quoteId,
        provider: 'SANDBOX_CASHFREE',
        method: 'UPI',
        upiHandleHint: 'bob@okicici',
        sandboxScenario: 'AUTO_CAPTURE',
      },
    });
    assert.equal(pay3Create.status, 201);
    const pay3Verify = await apiJson(baseUrl, '/payments/verify', {
      method: 'POST',
      token: bob.token,
      body: { paymentId: pay3Create.json.data.payment.paymentId },
    });
    assert.equal(pay3Verify.status, 200);
    assert.equal(pay3Verify.json.data.payment.status, 'CAPTURED');

    const order3Res = await apiJson(baseUrl, '/orders', {
      method: 'POST',
      token: bob.token,
      headers: { 'Idempotency-Key': 'ord_idem_quote3_confirmed_001' },
      body: { quoteId: quote3.quoteId, paymentId: pay3Verify.json.data.payment.paymentId },
    });
    assert.equal(order3Res.status, 201);
    const order3 = order3Res.json.data.order;
    assert.equal(order3.status, 'CONFIRMED');

    // Kitchen starts preparing -> CONFIRMED -> PREPARING
    testClock.advanceSeconds(5);
    const prepRes = await apiJson(baseUrl, `/restaurant/orders/${order3.orderId}/status`, {
      method: 'PATCH',
      token: kitchenStaff.token,
      body: { status: 'PREPARING' },
    });
    assert.equal(prepRes.status, 200);
    assert.equal(prepRes.json.data.order.status, 'PREPARING');

    // Customer self-cancel MUST now fail with 409 CONFLICT
    const blockedCancelRes = await apiJson(baseUrl, `/orders/${order3.orderId}/cancel`, {
      method: 'POST',
      token: bob.token,
      body: { reasonCode: 'CUSTOMER_CHANGED_MIND' },
    });
    assert.equal(blockedCancelRes.status, 409);

    // Invalid jump PREPARING -> DELIVERED rejected with 409 CONFLICT
    const invalidPrepJumpRes = await apiJson(baseUrl, `/orders/${order3.orderId}/status`, {
      method: 'PATCH',
      token: rider.token,
      body: { status: 'DELIVERED' },
    });
    assert.equal(invalidPrepJumpRes.status, 409);

    // Restaurant order list & kitchen marks READY_FOR_PICKUP
    const outletQueueRes = await apiJson(
      baseUrl,
      '/restaurant/orders?outletId=out_arsalan&status=PREPARING',
      { token: kitchenStaff.token },
    );
    assert.equal(outletQueueRes.status, 200);
    assert.ok(outletQueueRes.json.data.orders.some((o) => o.orderId === order3.orderId));

    testClock.advanceSeconds(5);
    const readyRes = await apiJson(baseUrl, `/restaurant/orders/${order3.orderId}/status`, {
      method: 'PATCH',
      token: kitchenStaff.token,
      body: { status: 'READY_FOR_PICKUP' },
    });
    assert.equal(readyRes.status, 200);

    // Rider transitions OUT_FOR_DELIVERY -> DELIVERED
    testClock.advanceSeconds(5);
    const dispatchRes = await apiJson(baseUrl, `/orders/${order3.orderId}/status`, {
      method: 'PATCH',
      token: rider.token,
      body: { status: 'OUT_FOR_DELIVERY' },
    });
    assert.equal(dispatchRes.status, 200);

    testClock.advanceSeconds(5);
    const deliveredRes = await apiJson(baseUrl, `/orders/${order3.orderId}/status`, {
      method: 'PATCH',
      token: rider.token,
      body: { status: 'DELIVERED' },
    });
    assert.equal(deliveredRes.status, 200);
    assert.equal(deliveredRes.json.data.order.status, 'DELIVERED');

    // Terminal DELIVERED cannot be cancelled or moved backwards -> 409
    const postDeliveryCancel = await apiJson(baseUrl, `/orders/${order3.orderId}/cancel`, {
      method: 'POST',
      token: bob.token,
      body: { reasonCode: 'DELIVERY_DELAY' },
    });
    assert.equal(postDeliveryCancel.status, 409);

    const postDeliveryMove = await apiJson(baseUrl, `/orders/${order3.orderId}/status`, {
      method: 'PATCH',
      token: kitchenStaff.token,
      body: { status: 'PREPARING' },
    });
    assert.equal(postDeliveryMove.status, 409);

    // Tracking & customer order history verification
    const trackRes = await apiJson(baseUrl, `/orders/${order3.orderId}/tracking`, {
      token: bob.token,
    });
    assert.equal(trackRes.status, 200);
    assert.equal(trackRes.json.data.status, 'DELIVERED');
    assert.equal(trackRes.json.data.steps.length, 6);
    assert.ok(trackRes.json.data.steps.every((s) => s.state === 'completed'));
    assert.ok(trackRes.json.data.events.length >= 6);

    const historyRes = await apiJson(baseUrl, '/orders?limit=10', { token: alice.token });
    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.json.data.totalCount, 2);

    const outboxOrder3 = await orderStore.listOutboxEventsForAggregate(order3.orderId);
    assert.deepEqual(
      outboxOrder3.map((e) => e.eventType),
      ['ORDER_CONFIRMED', 'ORDER_READY_FOR_PICKUP', 'ORDER_DELIVERED'],
    );

    console.log(
      'Checkpoint 16 verification passed: idempotent orders, race locks, cancellation rules, and tracking verified.',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
