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
const { SandboxPaymentGatewayAdapter } = require('../dist/modules/payments/payments.adapter.js');
const { InMemoryPaymentStore } = require('../dist/modules/payments/payments.store.js');
const { PaymentService } = require('../dist/modules/payments/payments.service.js');
const { InMemoryOrderStore } = require('../dist/modules/orders/orders.store.js');
const { OrderService } = require('../dist/modules/orders/orders.service.js');
const {
  ORDER_STATUSES_RUNTIME,
  ORDER_CANCEL_REASONS_RUNTIME,
  ORDER_EVENT_TYPES_RUNTIME,
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
      PORT: '4017',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp17_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long-cp17',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long-cp17',
      PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-minimum-32-characters-long-cp17',
      WEBHOOK_REPLAY_WINDOW_SECONDS: '300',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:4173',
    },
    { serviceName: 'bhojora-api-cp17-test', serviceVersion: '0.1.0' },
  );
}

function startTestServer(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Server address unavailable'));
        return;
      }
      resolve({ server, baseUrl: `http://127.0.0.1:${address.port}/api/v1` });
    });
  });
}

function closeTestServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function apiJson(baseUrl, pathUrl, options = {}) {
  const method = options.method || 'GET';
  const headers = {
    Accept: 'application/json',
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {}),
  };
  let bodyStr;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(options.body);
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

async function addItemAndCreateQuote(baseUrl, token) {
  const addRes = await apiJson(baseUrl, '/cart/items', {
    method: 'POST',
    token,
    body: {
      outletId: 'out_arsalan',
      menuItemId: 'item_mutton_biryani',
      quantity: 1,
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
    },
  });
  assert.ok(
    quoteRes.status === 200 || quoteRes.status === 201,
    `Quote create failed: ${JSON.stringify(quoteRes.json)}`,
  );
  return quoteRes.json.data.quote;
}

async function runCheckpoint17Verification() {
  console.log('--- Starting Checkpoint 17 Restaurant Operations & KDS Verification Suite ---');

  // [Test 1] Baseline constants, shared contracts, and documentation parity
  console.log('[Test 1] Validating baseline constants, shared contracts, and documentation...');
  assert.ok(Number(SERVER_BASELINE.checkpoint) >= 17, 'SERVER_BASELINE.checkpoint must be >= 17');
  assert.equal(SERVER_BASELINE.timezone, 'Asia/Kolkata');
  assert.equal(SERVER_BASELINE.currencyUnit, 'paise');

  const sharedContractsPath = path.resolve(REPO_ROOT, 'client/shared/dist/contracts/orders.js');
  const sharedOrders = await import(pathToFileURL(sharedContractsPath).href);
  assert.ok(sharedOrders.ORDER_EVENT_TYPES.includes('PREP_TIME_UPDATED'));
  assert.ok(ORDER_EVENT_TYPES_RUNTIME.includes('PREP_TIME_UPDATED'));
  assert.ok(ORDER_STATUSES_RUNTIME.includes('PREPARING'));
  assert.ok(ORDER_CANCEL_REASONS_RUNTIME.includes('OUTLET_OUT_OF_STOCK'));

  const openapiRaw = fs.readFileSync(
    path.resolve(REPO_ROOT, 'docs/01-CORE-PLANNING-DESIGN/openapi.json'),
    'utf8',
  );
  assert.ok(openapiRaw.includes('/restaurant/orders/{id}/prep-time'));
  assert.ok(openapiRaw.includes('/restaurant/orders/{id}/reject'));

  const adrsRaw = fs.readFileSync(
    path.resolve(REPO_ROOT, 'docs/01-CORE-PLANNING-DESIGN/ADRS.md'),
    'utf8',
  );
  assert.ok(adrsRaw.includes('## ADR-021: Restaurant Operations, Kitchen Prep Board'));

  const dbRaw = fs.readFileSync(
    path.resolve(REPO_ROOT, 'docs/01-CORE-PLANNING-DESIGN/DATABASE.md'),
    'utf8',
  );
  assert.ok(dbRaw.includes('Checkpoint 17'));

  const authRaw = fs.readFileSync(
    path.resolve(REPO_ROOT, 'docs/03-SECURITY-QUALITY/AUTH.md'),
    'utf8',
  );
  assert.ok(
    authRaw.includes(
      '## 14. Restaurant Operations, Kitchen Display System & Staff Permission Governance',
    ),
  );

  // [Test 2] Initialize services & stores
  console.log('[Test 2] Setting up multi-tenant stores, outlets, and catalog items...');
  const testClock = new MutableTestClock('2026-11-13T10:00:00.000Z');
  const config = createTestConfig();
  const logger = createLogger(config);

  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({
    config,
    logger,
    store: identityStore,
    otpAdapter,
    clock: testClock,
  });

  const rbacStore = new InMemoryRbacStore();
  const customerStore = new InMemoryCustomerStore();
  const customerService = new CustomerService({
    config,
    logger,
    customerStore,
    identityStore,
    clock: testClock,
  });

  const restaurantStore = new InMemoryRestaurantStore();
  const outletStore = new InMemoryOutletStore();
  const outletService = new OutletService({
    config,
    logger,
    outletStore,
    restaurantStore,
    rbacStore,
    clock: testClock,
  });

  const catalogStore = new InMemoryCatalogStore();
  const cartStore = new InMemoryCartStore();
  const pricingStore = new InMemoryPricingStore();
  const paymentStore = new InMemoryPaymentStore();
  const orderStore = new InMemoryOrderStore();

  const cartService = new CartService({
    cartStore,
    restaurantStore,
    catalogStore,
    logger,
    clock: testClock,
  });

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

  // Seed Outlet A (Arsalan - Park Circus)
  await restaurantStore.upsertOutlet({
    outletId: 'out_arsalan',
    restaurantId: 'rest_arsalan',
    ownerUserId: 'usr_owner_arsalan',
    brandName: 'Arsalan',
    name: 'Park Circus Flagship',
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
    prepTimeMinutes: 20,
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

  // Seed Outlet B (Balaram Mullick - Ballygunge)
  await restaurantStore.upsertOutlet({
    outletId: 'out_balaram',
    restaurantId: 'rest_balaram',
    ownerUserId: 'usr_owner_balaram',
    brandName: 'Balaram Mullick',
    name: 'Ballygunge Sweet Hub',
    slug: 'balaram-out-balaram',
    zoneId: 'south',
    wardOrBorough: 'Ballygunge Ward',
    streetAddress: '2 Ashutosh Mukherjee Road',
    landmark: 'Near Forum Mall',
    locality: 'Ballygunge',
    city: 'Kolkata',
    postalCode: '700020',
    location: { type: 'Point', coordinates: [88.347, 22.531] },
    cuisines: ['Bengali', 'Mishti'],
    prepTimeMinutes: 15,
    deliveryRadiusMeters: 8000,
    operatingSlots: DEFAULT_OUTLET_OPERATING_SLOTS,
    status: 'ACTIVE',
    fssaiLicenseNumber: '12826019000888',
    fssaiExpiresOn: '2028-12-31',
    fssaiVerificationStatus: 'VERIFIED',
    platformInspectionStatus: 'VERIFIED_CLEAN',
    publishedSafetyScore: 96,
    createdAt: now,
    updatedAt: now,
  });

  // Seed Menu Item for Outlet A
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
    // Register users
    const alice = await registerCustomer(
      baseUrl,
      'alice.cp17@example.com',
      '+919830222001',
      'Alice Chatterjee',
    );

    const chefA = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'chef.arsalan@example.com',
      phone: '+919830222002',
      name: 'Chef Subir (Outlet A)',
      role: 'KITCHEN_STAFF',
      mfaVerified: false,
    });
    await rbacStore.upsertMembership({
      userId: chefA.userId,
      restaurantId: 'rest_arsalan',
      outletId: 'out_arsalan',
      role: 'KITCHEN_STAFF',
      status: 'ACTIVE',
      assignedBy: 'SYSTEM',
    });

    const managerA = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'mgr.arsalan@example.com',
      phone: '+919830222003',
      name: 'Manager Rahul (Outlet A)',
      role: 'RESTAURANT_MANAGER',
      mfaVerified: true,
    });
    await rbacStore.upsertMembership({
      userId: managerA.userId,
      restaurantId: 'rest_arsalan',
      outletId: 'out_arsalan',
      role: 'RESTAURANT_MANAGER',
      status: 'ACTIVE',
      assignedBy: 'SYSTEM',
    });

    const chefB = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'chef.balaram@example.com',
      phone: '+919830222004',
      name: 'Chef Bikram (Outlet B)',
      role: 'KITCHEN_STAFF',
      mfaVerified: false,
    });
    await rbacStore.upsertMembership({
      userId: chefB.userId,
      restaurantId: 'rest_balaram',
      outletId: 'out_balaram',
      role: 'KITCHEN_STAFF',
      status: 'ACTIVE',
      assignedBy: 'SYSTEM',
    });

    const rider = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'rider.cp17@example.com',
      phone: '+919830222005',
      name: 'Rider Rajesh',
      role: 'DELIVERY_PARTNER',
      mfaVerified: false,
    });

    // Helper: Alice places confirmed order
    async function createConfirmedOrder(idemKey) {
      const quote = await addItemAndCreateQuote(baseUrl, alice.token);
      const payInit = await apiJson(baseUrl, '/payments/create', {
        method: 'POST',
        token: alice.token,
        headers: { 'Idempotency-Key': `pay_${idemKey}` },
        body: {
          quoteId: quote.quoteId,
          method: 'UPI',
          upiHandleHint: 'alice@okhdfcbank',
          sandboxScenario: 'AUTO_CAPTURE',
        },
      });
      assert.equal(payInit.status, 201);
      const paymentId = payInit.json.data.payment.paymentId;

      const verifyRes = await apiJson(baseUrl, '/payments/verify', {
        method: 'POST',
        token: alice.token,
        body: { paymentId },
      });
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.json.data.payment.status, 'CAPTURED');

      const orderRes = await apiJson(baseUrl, '/orders', {
        method: 'POST',
        token: alice.token,
        headers: { 'Idempotency-Key': `ord_${idemKey}` },
        body: {
          quoteId: quote.quoteId,
          paymentId,
          specialInstructions: 'Make dum biryani extra aromatic',
        },
      });
      assert.equal(orderRes.status, 201);
      return orderRes.json.data.order;
    }

    // [Test 3] Order Creation & Outlet Order Inbox Listing
    console.log('[Test 3] Alice places confirmed order; Chef A inspects outlet inbox...');
    const order1 = await createConfirmedOrder('idem_cp17_001');
    assert.equal(order1.status, 'CONFIRMED');
    assert.equal(order1.outletId, 'out_arsalan');

    const inboxA = await apiJson(baseUrl, '/restaurant/orders?outletId=out_arsalan', {
      token: chefA.token,
    });
    assert.equal(inboxA.status, 200);
    assert.equal(inboxA.json.data.orders.length, 1);
    assert.equal(inboxA.json.data.orders[0].orderId, order1.orderId);
    assert.equal(inboxA.json.data.orders[0].items.length, 1);
    assert.equal(inboxA.json.data.orders[0].items[0].title, 'Special Mutton Biryani');

    // Filter by status
    const confirmedFilter = await apiJson(
      baseUrl,
      '/restaurant/orders?outletId=out_arsalan&status=CONFIRMED',
      {
        token: chefA.token,
      },
    );
    assert.equal(confirmedFilter.status, 200);
    assert.equal(confirmedFilter.json.data.orders.length, 1);

    const preparingFilter = await apiJson(
      baseUrl,
      '/restaurant/orders?outletId=out_arsalan&status=PREPARING',
      {
        token: chefA.token,
      },
    );
    assert.equal(preparingFilter.status, 200);
    assert.equal(preparingFilter.json.data.orders.length, 0);

    // [Test 4] Multi-Tenant Outlet Isolation & Cross-Outlet IDOR Defense
    console.log('[Test 4] Verifying cross-outlet IDOR rejection and audit logs...');
    // Chef B (Outlet B) queries Outlet A orders -> 403 FORBIDDEN
    const crossListRes = await apiJson(baseUrl, '/restaurant/orders?outletId=out_arsalan', {
      token: chefB.token,
    });
    assert.equal(crossListRes.status, 403, 'Cross-outlet list must return 403');
    assert.equal(crossListRes.json.error.code, 'FORBIDDEN');

    // Chef B attempts to transition Outlet A order -> 403 FORBIDDEN
    const crossTransitionRes = await apiJson(
      baseUrl,
      `/restaurant/orders/${order1.orderId}/status`,
      {
        method: 'PATCH',
        token: chefB.token,
        body: { status: 'PREPARING' },
      },
    );
    assert.equal(crossTransitionRes.status, 403, 'Cross-outlet transition must return 403');

    // Chef B attempts to update prep time on Outlet A order -> 403 FORBIDDEN
    const crossPrepRes = await apiJson(baseUrl, `/restaurant/orders/${order1.orderId}/prep-time`, {
      method: 'PATCH',
      token: chefB.token,
      body: { prepTimeMinutes: 30 },
    });
    assert.equal(crossPrepRes.status, 403, 'Cross-outlet prep time update must return 403');

    // Chef B attempts to reject Outlet A order -> 403 FORBIDDEN
    const crossRejectRes = await apiJson(baseUrl, `/restaurant/orders/${order1.orderId}/reject`, {
      method: 'POST',
      token: chefB.token,
      body: { reasonCode: 'OUTLET_OUT_OF_STOCK' },
    });
    assert.equal(crossRejectRes.status, 403, 'Cross-outlet rejection must return 403');

    // Customer Alice attempts to call restaurant order endpoint -> 403 FORBIDDEN
    const customerRestaurantRes = await apiJson(
      baseUrl,
      '/restaurant/orders?outletId=out_arsalan',
      {
        token: alice.token,
      },
    );
    assert.equal(customerRestaurantRes.status, 403);

    // Delivery Partner Rajesh attempts to accept kitchen order -> 403 FORBIDDEN
    const riderKitchenRes = await apiJson(baseUrl, `/restaurant/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: rider.token,
      body: { status: 'PREPARING' },
    });
    assert.equal(riderKitchenRes.status, 403);

    // Verify DENIED audit logs recorded for Chef B
    const allAuditLogs = await rbacStore.listAuditLogs(100);
    const deniedLogs = allAuditLogs.filter(
      (entry) => entry.actorId === chefB.userId && entry.outcome === 'DENIED',
    );
    assert.ok(
      deniedLogs.length >= 4,
      `Chef B must have recorded at least 4 DENIED audit entries, got ${deniedLogs.length}`,
    );

    // [Test 5] Kitchen Accepts Order with Prep Time
    console.log('[Test 5] Kitchen Chef A accepts order with target prep time (25 mins)...');
    testClock.advanceSeconds(10);
    const acceptRes = await apiJson(baseUrl, `/restaurant/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: chefA.token,
      body: {
        status: 'PREPARING',
        prepTimeMinutes: 25,
        note: 'Biryani pot put on dum; 25m prep',
      },
    });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.json.data.order.status, 'PREPARING');
    assert.equal(acceptRes.json.data.order.prepTimeMinutes, 25);
    assert.ok(acceptRes.json.data.order.preparingAt);

    // Customer self-cancellation MUST now be blocked with 409 CONFLICT
    const cancelBlocked = await apiJson(baseUrl, `/orders/${order1.orderId}/cancel`, {
      method: 'POST',
      token: alice.token,
      body: { reasonCode: 'CUSTOMER_CHANGED_MIND' },
    });
    assert.equal(cancelBlocked.status, 409);

    // [Test 6] Dynamic Prep Time Adjustment during Preparation
    console.log('[Test 6] Kitchen Manager A adjusts prep buffer (+10 mins for rush surge)...');
    testClock.advanceSeconds(15);
    const adjustRes = await apiJson(baseUrl, `/restaurant/orders/${order1.orderId}/prep-time`, {
      method: 'PATCH',
      token: managerA.token,
      body: {
        prepTimeMinutes: 35,
        note: 'Heavy evening surge: extended prep buffer to 35m',
      },
    });
    assert.equal(adjustRes.status, 200);
    assert.equal(adjustRes.json.data.order.prepTimeMinutes, 35);

    // Verify PREP_TIME_UPDATED event is recorded
    const eventsOrder1 = await orderStore.listOrderEvents(order1.orderId);
    const prepEvent = eventsOrder1.find((e) => e.eventType === 'PREP_TIME_UPDATED');
    assert.ok(prepEvent, 'PREP_TIME_UPDATED event must be recorded');
    assert.equal(prepEvent.actorRole, 'RESTAURANT_MANAGER');

    // Invalid prep times (< 5 or > 180) rejected with 400
    const invalidPrepLow = await apiJson(
      baseUrl,
      `/restaurant/orders/${order1.orderId}/prep-time`,
      {
        method: 'PATCH',
        token: managerA.token,
        body: { prepTimeMinutes: 2 },
      },
    );
    assert.equal(invalidPrepLow.status, 400);

    const invalidPrepHigh = await apiJson(
      baseUrl,
      `/restaurant/orders/${order1.orderId}/prep-time`,
      {
        method: 'PATCH',
        token: managerA.token,
        body: { prepTimeMinutes: 300 },
      },
    );
    assert.equal(invalidPrepHigh.status, 400);

    // [Test 7] Kitchen Order Rejection & Automatic Refund Flow
    console.log(
      '[Test 7] Testing kitchen rejection due to stock exhaustion (OUTLET_OUT_OF_STOCK)...',
    );
    const order2 = await createConfirmedOrder('idem_cp17_002');
    assert.equal(order2.status, 'CONFIRMED');

    testClock.advanceSeconds(5);
    const rejectRes = await apiJson(baseUrl, `/restaurant/orders/${order2.orderId}/reject`, {
      method: 'POST',
      token: chefA.token,
      body: {
        reasonCode: 'OUTLET_OUT_OF_STOCK',
        note: 'Evening Mutton handi sold out completely',
      },
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.json.data.order.status, 'CANCELLED');
    assert.equal(rejectRes.json.data.order.cancellation.reasonCode, 'OUTLET_OUT_OF_STOCK');
    assert.equal(rejectRes.json.data.order.cancellation.refundStatus, 'QUEUED_FULL_REFUND');
    assert.equal(
      rejectRes.json.data.order.cancellation.refundAmountPaise,
      order2.pricingBreakdown.totalPayablePaise,
    );

    // Outbox event ORDER_CANCELLED must be queued
    const outboxOrder2 = await orderStore.listOutboxEventsForAggregate(order2.orderId);
    assert.ok(outboxOrder2.some((e) => e.eventType === 'ORDER_CANCELLED'));

    // [Test 8] Food Marked Ready for Pickup (Handover Verification)
    console.log('[Test 8] Marking order 1 ready for pickup and verifying outbox event...');
    testClock.advanceSeconds(30);
    const readyRes = await apiJson(baseUrl, `/restaurant/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: chefA.token,
      body: {
        status: 'READY_FOR_PICKUP',
        note: 'Order packaged in insulated thermal bag with raita sealed',
      },
    });
    assert.equal(readyRes.status, 200);
    assert.equal(readyRes.json.data.order.status, 'READY_FOR_PICKUP');
    assert.ok(readyRes.json.data.order.readyForPickupAt);

    // Attempting prep time update when READY_FOR_PICKUP must fail with 409 CONFLICT
    const prepBlockedOnReady = await apiJson(
      baseUrl,
      `/restaurant/orders/${order1.orderId}/prep-time`,
      {
        method: 'PATCH',
        token: chefA.token,
        body: { prepTimeMinutes: 40 },
      },
    );
    assert.equal(prepBlockedOnReady.status, 409, 'Prep time cannot be updated once ready');

    // Attempting backward transition READY_FOR_PICKUP -> PREPARING must fail with 409 CONFLICT
    const backwardPrep = await apiJson(baseUrl, `/restaurant/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: chefA.token,
      body: { status: 'PREPARING' },
    });
    assert.equal(backwardPrep.status, 409, 'Backward transition to PREPARING must be rejected');

    // Outbox event ORDER_READY_FOR_PICKUP must be queued
    const outboxOrder1 = await orderStore.listOutboxEventsForAggregate(order1.orderId);
    assert.ok(outboxOrder1.some((e) => e.eventType === 'ORDER_READY_FOR_PICKUP'));

    // [Test 9] Rider Dispatch and Terminal State Immutability
    console.log('[Test 9] Rider dispatches and delivers order; verifying terminal immutability...');
    testClock.advanceSeconds(10);
    const dispatchRes = await apiJson(baseUrl, `/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: rider.token,
      body: { status: 'OUT_FOR_DELIVERY' },
    });
    assert.equal(dispatchRes.status, 200);

    testClock.advanceSeconds(20);
    const deliveredRes = await apiJson(baseUrl, `/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: rider.token,
      body: { status: 'DELIVERED' },
    });
    assert.equal(deliveredRes.status, 200);
    assert.equal(deliveredRes.json.data.order.status, 'DELIVERED');

    // Terminal order cannot be mutated by kitchen staff
    const terminalMutate = await apiJson(baseUrl, `/restaurant/orders/${order1.orderId}/status`, {
      method: 'PATCH',
      token: chefA.token,
      body: { status: 'PREPARING' },
    });
    assert.equal(terminalMutate.status, 409, 'Terminal order cannot be transitioned');

    console.log(
      'Checkpoint 17 verification passed: KDS order inbox, accept/reject, dynamic prep buffers, and staff RBAC verified.',
    );
  } finally {
    await closeTestServer(server);
  }
}

runCheckpoint17Verification().catch((err) => {
  console.error('Checkpoint 17 verification failed:', err);
  process.exit(1);
});
