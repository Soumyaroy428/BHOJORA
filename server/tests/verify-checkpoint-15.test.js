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
const {
  PAYMENT_PROVIDERS_RUNTIME,
  PAYMENT_METHODS_RUNTIME,
  PAYMENT_STATUSES_RUNTIME,
  PAYMENT_EVENT_TYPES_RUNTIME,
  RECONCILIATION_STATUSES_RUNTIME,
} = require('../dist/modules/payments/payments.types.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TEST_PASSWORD = 'Bhojora#Payments2026';

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
      PORT: '4015',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp15_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long-cp15',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long-cp15',
      PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret-minimum-32-characters-long-cp15',
      WEBHOOK_REPLAY_WINDOW_SECONDS: '300',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:4173',
    },
    { serviceName: 'bhojora-api-cp15-test', serviceVersion: '0.1.0' },
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

async function run() {
  // 1. Baseline, shared contract parity, DB indexes, OpenAPI coverage
  assert.ok(Number(SERVER_BASELINE.checkpoint) >= 15, 'SERVER_BASELINE.checkpoint must be >= 15');

  const shared = await import(
    pathToFileURL(path.join(REPO_ROOT, 'client', 'shared', 'dist', 'contracts', 'payments.js')).href
  );
  assert.deepEqual([...PAYMENT_PROVIDERS_RUNTIME], [...shared.PAYMENT_PROVIDERS]);
  assert.deepEqual([...PAYMENT_METHODS_RUNTIME], [...shared.PAYMENT_METHODS]);
  assert.deepEqual([...PAYMENT_STATUSES_RUNTIME], [...shared.PAYMENT_STATUSES]);
  assert.deepEqual([...PAYMENT_EVENT_TYPES_RUNTIME], [...shared.PAYMENT_EVENT_TYPES]);
  assert.deepEqual([...RECONCILIATION_STATUSES_RUNTIME], [...shared.RECONCILIATION_STATUSES]);

  const indexNames = new Set(INITIAL_DATABASE_INDEXES.map((i) => i.options.name));
  for (const requiredIdx of [
    'idx_payments_id_unique',
    'idx_payments_provider_payment_unique',
    'idx_payments_customer_created_desc',
    'idx_payments_quote_created_desc',
    'idx_payments_reconciliation_queue',
    'idx_payment_events_id_unique',
    'idx_payment_events_payment_occurred',
    'idx_payment_events_provider_event_unique',
    'idx_webhook_events_provider_event_unique',
    'idx_reconciliation_records_id_unique',
    'idx_reconciliation_records_payment_created_desc',
    'idx_reconciliation_records_status_created_desc',
  ]) {
    assert.ok(indexNames.has(requiredIdx), `Missing required CP15 index ${requiredIdx}`);
  }

  const openapi = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, 'docs', '01-CORE-PLANNING-DESIGN', 'openapi.json'),
      'utf8',
    ),
  );
  for (const routePath of [
    '/payments/create',
    '/payments',
    '/payments/{paymentId}',
    '/payments/verify',
    '/payments/{paymentId}/reconcile',
    '/admin/payments/reconciliations',
    '/webhooks/payments/{provider}',
  ]) {
    assert.ok(openapi.paths[routePath], `OpenAPI spec must document ${routePath}`);
  }

  // 2. Boot modular express server with InMemory stores + MutableTestClock
  const config = createTestConfig();
  const logger = createLogger({ level: 'error', service: 'cp15-test', environment: 'test' });
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

  const now = testClock.now();
  await restaurantStore.upsertOutlet({
    outletId: 'out_arsalan',
    restaurantId: 'rest_arsalan',
    ownerUserId: 'usr_seed_owner',
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
    createdByUserId: 'usr_seed_owner',
    updatedByUserId: 'usr_seed_owner',
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
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    const cust1 = await registerCustomer(
      baseUrl,
      'ananya.pay@example.com',
      '+919830011223',
      'Ananya Sen',
    );
    const cust2 = await registerCustomer(
      baseUrl,
      'rohit.pay@example.com',
      '+919830044556',
      'Rohit Chatterjee',
    );
    const financeNoMfa = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'finance.nomfa@bhojora.in',
      phone: '+919830077881',
      name: 'Finance NoMFA',
      role: 'FINANCE_ADMIN',
      mfaVerified: false,
    });
    const financeMfa = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'finance.mfa@bhojora.in',
      phone: '+919830077882',
      name: 'Finance MFA',
      role: 'FINANCE_ADMIN',
      mfaVerified: true,
    });
    const trustMfa = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'trust.mfa@bhojora.in',
      phone: '+919830077883',
      name: 'Trust Reviewer',
      role: 'TRUST_ADMIN',
      mfaVerified: true,
    });

    const helperBuildQuote = async (token) => {
      const addRes = await apiJson(baseUrl, '/cart/items', {
        method: 'POST',
        token,
        body: { outletId: 'out_arsalan', menuItemId: 'item_mutton_biryani', quantity: 1 },
      });
      assert.equal(addRes.status, 200);
      const quoteRes = await apiJson(baseUrl, '/checkout/quote', {
        method: 'POST',
        token,
        body: { coordinates: [88.36, 22.548], tipPaise: 2000 },
      });
      assert.equal(quoteRes.status, 200);
      return quoteRes.json.data.quote;
    };

    const quote1 = await helperBuildQuote(cust1.token);
    const quote2 = await helperBuildQuote(cust2.token);

    // 3. Unauthenticated & RBAC checks
    const unauth = await apiJson(baseUrl, '/payments');
    assert.equal(unauth.status, 401);

    const financeQueueNoMfa = await apiJson(baseUrl, '/admin/payments/reconciliations', {
      token: financeNoMfa.token,
    });
    assert.equal(financeQueueNoMfa.status, 403, 'FINANCE_ADMIN without MFA must get 403');

    const trustQueue = await apiJson(baseUrl, '/admin/payments/reconciliations', {
      token: trustMfa.token,
    });
    assert.equal(
      trustQueue.status,
      403,
      'TRUST_ADMIN must never access payment reconciliation queue',
    );

    // 4. Zero raw card data storage & tamper override rejection
    const rawPanRejection = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: cust1.token,
      headers: { 'Idempotency-Key': 'idem-raw-card-001' },
      body: {
        quoteId: quote1.quoteId,
        method: 'CARD',
        cardNumber: '4111111111111111',
        cvv: '123',
        cardExpiry: '12/29',
      },
    });
    assert.equal(rawPanRejection.status, 400);
    assert.equal(rawPanRejection.json.error.code, 'VALIDATION_ERROR');

    const panPatternRejection = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: cust1.token,
      headers: { 'Idempotency-Key': 'idem-raw-pan-pattern-002' },
      body: {
        quoteId: quote1.quoteId,
        method: 'CARD',
        tokenReference: '4111111111111111',
      },
    });
    assert.equal(panPatternRejection.status, 400);

    const amountOverrideRejection = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: cust1.token,
      headers: { 'Idempotency-Key': 'idem-amount-override-003' },
      body: {
        quoteId: quote1.quoteId,
        method: 'UPI',
        amountPaise: 100,
      },
    });
    assert.equal(amountOverrideRejection.status, 400);

    const missingIdemKey = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: cust1.token,
      body: {
        quoteId: quote1.quoteId,
        method: 'UPI',
      },
    });
    assert.equal(missingIdemKey.status, 400);

    // 5. Idempotent payment creation + cross-customer IDOR protection
    const createPay1 = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: cust1.token,
      headers: { 'Idempotency-Key': 'idem-pay-capture-001' },
      body: {
        quoteId: quote1.quoteId,
        provider: 'SANDBOX_RAZORPAY',
        method: 'UPI',
        upiHandleHint: 'ananya.sen@okhdfcbank',
        sandboxScenario: 'PENDING_WEBHOOK',
      },
    });
    assert.equal(createPay1.status, 201);
    assert.equal(createPay1.json.data.idempotentReplay, false);
    const p1 = createPay1.json.data.payment;
    assert.equal(p1.status, 'PENDING');
    assert.equal(p1.amountPaise, quote1.pricingBreakdown.totalPayablePaise);
    assert.equal(p1.instrumentSummary.upiVpaMasked, 'an***@okhdfcbank');
    assert.ok(p1.instrumentSummary.tokenReference.startsWith('tok_sbx_'));

    // Exact retry with same Idempotency-Key returns cached attempt (HTTP 200)
    const createPay1Replay = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: cust1.token,
      headers: { 'Idempotency-Key': 'idem-pay-capture-001' },
      body: {
        quoteId: quote1.quoteId,
        provider: 'SANDBOX_RAZORPAY',
        method: 'UPI',
        upiHandleHint: 'ananya.sen@okhdfcbank',
        sandboxScenario: 'PENDING_WEBHOOK',
      },
    });
    assert.equal(createPay1Replay.status, 200);
    assert.equal(createPay1Replay.json.data.idempotentReplay, true);
    assert.equal(createPay1Replay.json.data.payment.paymentId, p1.paymentId);

    // Reuse of same Idempotency-Key with different payload -> 409 IDEMPOTENCY_CONFLICT
    const createPay1Conflict = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: cust1.token,
      headers: { 'Idempotency-Key': 'idem-pay-capture-001' },
      body: {
        quoteId: quote1.quoteId,
        provider: 'SANDBOX_CASHFREE',
        method: 'UPI',
        sandboxScenario: 'PENDING_WEBHOOK',
      },
    });
    assert.equal(createPay1Conflict.status, 409);
    assert.equal(createPay1Conflict.json.error.code, 'IDEMPOTENCY_CONFLICT');

    // Cross-customer IDOR read blocked with 403 + audit log entry
    const idorRead = await apiJson(baseUrl, `/payments/${p1.paymentId}`, {
      token: cust2.token,
    });
    assert.equal(idorRead.status, 403);
    const auditLogs = await rbacStore.listAuditLogs();
    assert.ok(
      auditLogs.some((a) => a.action === 'payments.read' && a.outcome === 'DENIED'),
      'Cross-customer payment IDOR read must be audited as DENIED',
    );

    // Browser redirect /verify while PENDING_WEBHOOK must NOT capture payment prematurely
    const prematureVerify = await apiJson(baseUrl, '/payments/verify', {
      method: 'POST',
      token: cust1.token,
      body: { paymentId: p1.paymentId },
    });
    assert.equal(prematureVerify.status, 200);
    assert.equal(prematureVerify.json.data.payment.status, 'PENDING');

    // 6. Webhook cryptographic signature, replay window, dedupe & late out-of-order safety
    const capturedPayload1 = {
      eventId: 'evt_rzp_cap_1001',
      eventType: 'payment.captured',
      providerPaymentId: p1.providerPaymentId,
      amountPaise: p1.amountPaise,
    };
    const ts1 = Math.floor(testClock.now().getTime() / 1000);
    const sig1 = signSandboxWebhook(ts1, capturedPayload1, config.paymentWebhookSecret);

    // Tampered signature -> 401
    const badSigRes = await apiJson(baseUrl, '/webhooks/payments/razorpay', {
      method: 'POST',
      headers: {
        'X-Razorpay-Signature': '0'.repeat(64),
        'X-Webhook-Timestamp': String(ts1),
      },
      body: capturedPayload1,
    });
    assert.equal(badSigRes.status, 401);

    // Expired timestamp beyond 300s replay window -> 401
    const staleTs = ts1 - 350;
    const staleSig = signSandboxWebhook(staleTs, capturedPayload1, config.paymentWebhookSecret);
    const staleRes = await apiJson(baseUrl, '/webhooks/payments/razorpay', {
      method: 'POST',
      headers: {
        'X-Razorpay-Signature': staleSig,
        'X-Webhook-Timestamp': String(staleTs),
      },
      body: capturedPayload1,
    });
    assert.equal(staleRes.status, 401);

    // Tampered webhook amount -> 409 CONFLICT
    const tamperedAmtPayload = { ...capturedPayload1, amountPaise: p1.amountPaise + 100 };
    const tamperedAmtSig = signSandboxWebhook(ts1, tamperedAmtPayload, config.paymentWebhookSecret);
    const tamperedAmtRes = await apiJson(baseUrl, '/webhooks/payments/razorpay', {
      method: 'POST',
      headers: {
        'X-Razorpay-Signature': tamperedAmtSig,
        'X-Webhook-Timestamp': String(ts1),
      },
      body: tamperedAmtPayload,
    });
    assert.equal(tamperedAmtRes.status, 409);

    // Valid signed capture webhook -> CAPTURED
    const captureRes = await apiJson(baseUrl, '/webhooks/payments/razorpay', {
      method: 'POST',
      headers: {
        'X-Razorpay-Signature': sig1,
        'X-Webhook-Timestamp': String(ts1),
      },
      body: capturedPayload1,
    });
    assert.equal(captureRes.status, 200);
    assert.equal(captureRes.json.data.deduplicated, false);
    assert.equal(captureRes.json.data.currentStatus, 'CAPTURED');

    // Replay same webhook 30s later -> HTTP 200 deduplicated: true, no double ledger write
    testClock.advanceSeconds(30);
    const tsReplay = Math.floor(testClock.now().getTime() / 1000);
    const sigReplay = signSandboxWebhook(tsReplay, capturedPayload1, config.paymentWebhookSecret);
    const replayRes = await apiJson(baseUrl, '/webhooks/payments/razorpay', {
      method: 'POST',
      headers: {
        'X-Razorpay-Signature': sigReplay,
        'X-Webhook-Timestamp': String(tsReplay),
      },
      body: capturedPayload1,
    });
    assert.equal(replayRes.status, 200);
    assert.equal(replayRes.json.data.deduplicated, true);
    assert.equal(replayRes.json.data.currentStatus, 'CAPTURED');

    // Out-of-order late failure webhook after terminal CAPTURED must be ignored safely
    const lateFailPayload = {
      eventId: 'evt_rzp_late_fail_1002',
      eventType: 'payment.failed',
      providerPaymentId: p1.providerPaymentId,
      amountPaise: p1.amountPaise,
      reason: 'Delayed timeout signal',
    };
    const lateFailSig = signSandboxWebhook(tsReplay, lateFailPayload, config.paymentWebhookSecret);
    const lateFailRes = await apiJson(baseUrl, '/webhooks/payments/razorpay', {
      method: 'POST',
      headers: {
        'X-Razorpay-Signature': lateFailSig,
        'X-Webhook-Timestamp': String(tsReplay),
      },
      body: lateFailPayload,
    });
    assert.equal(lateFailRes.status, 200);
    assert.equal(lateFailRes.json.data.lateEventAction, 'IGNORED_TERMINAL');
    assert.equal(lateFailRes.json.data.currentStatus, 'CAPTURED');

    const p1Detail = await apiJson(baseUrl, `/payments/${p1.paymentId}`, { token: cust1.token });
    assert.equal(p1Detail.status, 200);
    assert.equal(p1Detail.json.data.payment.status, 'CAPTURED');
    const capEvents = p1Detail.json.data.events.filter((e) => e.eventType === 'PAYMENT_CAPTURED');
    assert.equal(
      capEvents.length,
      1,
      'Duplicate webhook must create only 1 PAYMENT_CAPTURED event',
    );

    // 7. Unknown status reconciliation via late webhook AND polling endpoint
    const unknownLateWebhookCreate = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: cust2.token,
      headers: { 'Idempotency-Key': 'idem-pay-unknown-late-001' },
      body: {
        quoteId: quote2.quoteId,
        provider: 'SANDBOX_CASHFREE',
        method: 'CARD',
        cardNetwork: 'VISA',
        cardLast4Hint: '4242',
        sandboxScenario: 'UNKNOWN_RECOVER_CAPTURE',
      },
    });
    assert.equal(unknownLateWebhookCreate.status, 201);
    const p2 = unknownLateWebhookCreate.json.data.payment;
    assert.equal(p2.status, 'UNKNOWN');
    assert.equal(p2.reconciliationRequired, true);
    assert.equal(p2.instrumentSummary.cardLast4, '4242');

    // Finance MFA admin sees p2 in reconciliation queue
    const queueBefore = await apiJson(baseUrl, '/admin/payments/reconciliations', {
      token: financeMfa.token,
    });
    assert.equal(queueBefore.status, 200);
    assert.ok(
      queueBefore.json.data.pendingPayments.some((item) => item.paymentId === p2.paymentId),
    );

    // Late webhook arrives 60s later resolving UNKNOWN -> CAPTURED
    testClock.advanceSeconds(60);
    const tsLateCap = Math.floor(testClock.now().getTime() / 1000);
    const lateCapPayload = {
      eventId: 'evt_cf_late_cap_2001',
      eventType: 'payment.captured',
      providerPaymentId: p2.providerPaymentId,
      amountPaise: p2.amountPaise,
    };
    const lateCapSig = signSandboxWebhook(tsLateCap, lateCapPayload, config.paymentWebhookSecret);
    const lateCapRes = await apiJson(baseUrl, '/webhooks/payments/cashfree', {
      method: 'POST',
      headers: {
        'X-Bhojora-Signature': lateCapSig,
        'X-Webhook-Timestamp': String(tsLateCap),
      },
      body: lateCapPayload,
    });
    assert.equal(lateCapRes.status, 200);
    assert.equal(lateCapRes.json.data.lateEventAction, 'APPLIED');
    assert.equal(lateCapRes.json.data.currentStatus, 'CAPTURED');

    // Create a second quote & UNKNOWN payment for cust1 to verify active polling reconcile endpoint
    const quote3 = await helperBuildQuote(cust1.token);
    const unknownPollCreate = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: cust1.token,
      headers: { 'Idempotency-Key': 'idem-pay-unknown-poll-001' },
      body: {
        quoteId: quote3.quoteId,
        provider: 'SANDBOX_RAZORPAY',
        method: 'NETBANKING',
        bankCode: 'ICICI',
        sandboxScenario: 'UNKNOWN_RECOVER_FAIL',
      },
    });
    assert.equal(unknownPollCreate.status, 201);
    const p3 = unknownPollCreate.json.data.payment;
    assert.equal(p3.status, 'UNKNOWN');

    const reconcileRes = await apiJson(baseUrl, `/payments/${p3.paymentId}/reconcile`, {
      method: 'POST',
      token: financeMfa.token,
    });
    assert.equal(reconcileRes.status, 200);
    assert.equal(reconcileRes.json.data.payment.status, 'FAILED');
    assert.equal(reconcileRes.json.data.payment.reconciliationRequired, false);
    assert.equal(reconcileRes.json.data.reconciliation.status, 'RECONCILED_FAILED');

    // Also test AUTO_CAPTURE verification endpoint flow cleanly
    const autoCapCreate = await apiJson(baseUrl, '/payments/create', {
      method: 'POST',
      token: cust1.token,
      headers: { 'Idempotency-Key': 'idem-pay-autocap-001' },
      body: {
        quoteId: quote3.quoteId,
        provider: 'SANDBOX_RAZORPAY',
        method: 'UPI',
        sandboxScenario: 'AUTO_CAPTURE',
      },
    });
    assert.equal(autoCapCreate.status, 201);
    const p4 = autoCapCreate.json.data.payment;
    assert.equal(p4.attemptNumber, 2);

    const verifyAutoRes = await apiJson(baseUrl, '/payments/verify', {
      method: 'POST',
      token: cust1.token,
      body: { paymentId: p4.paymentId },
    });
    assert.equal(verifyAutoRes.status, 200);
    assert.equal(verifyAutoRes.json.data.payment.status, 'CAPTURED');

    // Final invariant: inspect every persisted payment record to ensure ZERO raw card data
    const allCustPayments = [
      ...(await paymentStore.listPaymentsByCustomer(cust1.userId)),
      ...(await paymentStore.listPaymentsByCustomer(cust2.userId)),
    ];
    for (const stored of allCustPayments) {
      const serialized = JSON.stringify(stored);
      assert.ok(!serialized.includes('4111111111111111'), 'Raw PAN must never exist in storage');
      assert.ok(!serialized.includes('"cvv"'), 'CVV must never exist in storage');
      assert.ok(!serialized.includes('"cardExpiry"'), 'Card expiry must never exist in storage');
    }

    console.log(
      'CHECKPOINT 15 VERIFICATION PASSED: Sandbox payments, zero raw card data, idempotency, signed webhook dedupe/replay/late handling & unknown-status reconciliation verified.',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

run().catch((err) => {
  console.error('CHECKPOINT 15 VERIFICATION FAILED:', err);
  process.exit(1);
});
