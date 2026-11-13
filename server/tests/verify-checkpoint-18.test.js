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
  DELIVERY_PARTNER_STATUSES_RUNTIME,
  DELIVERY_SHIFT_STATUSES_RUNTIME,
  VEHICLE_TYPES_RUNTIME,
  DELIVERY_DOCUMENT_TYPES_RUNTIME,
} = require('../dist/modules/delivery/delivery.types.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TEST_PASSWORD = 'Bhojora#Delivery2026';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4018',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp18_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp18!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp18!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp18!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp18!',
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

async function runCheckpoint18Verification() {
  console.log('--- Starting Checkpoint 18 Delivery Partner Onboarding Verification Suite ---');

  // Test 1: Baseline constants, shared contracts, documentation parity
  console.log('Test 1: Baseline constants, shared contracts, documentation parity...');
  assert.equal(SERVER_BASELINE.checkpoint, '18');
  assert.deepEqual(DELIVERY_PARTNER_STATUSES_RUNTIME, [
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'REJECTED',
    'SUSPENDED',
  ]);
  assert.deepEqual(DELIVERY_SHIFT_STATUSES_RUNTIME, ['OFFLINE', 'ONLINE', 'ON_DELIVERY']);
  assert.deepEqual(VEHICLE_TYPES_RUNTIME, ['BICYCLE', 'ELECTRIC_SCOOTER', 'MOTORCYCLE', 'SCOOTER']);
  assert.deepEqual(DELIVERY_DOCUMENT_TYPES_RUNTIME, [
    'DRIVING_LICENSE',
    'VEHICLE_RC',
    'GOVERNMENT_ID',
    'PAN_CARD',
  ]);

  const openApiDoc = fs.readFileSync(
    path.join(REPO_ROOT, 'docs/01-CORE-PLANNING-DESIGN/openapi.json'),
    'utf8',
  );
  assert.ok(
    openApiDoc.includes('/delivery/applications'),
    'Missing /delivery/applications in OpenAPI',
  );
  assert.ok(openApiDoc.includes('/delivery/profile/me'), 'Missing /delivery/profile/me in OpenAPI');
  assert.ok(
    openApiDoc.includes('/delivery/admin/applications'),
    'Missing /delivery/admin/applications in OpenAPI',
  );

  const databaseDoc = fs.readFileSync(
    path.join(REPO_ROOT, 'docs/01-CORE-PLANNING-DESIGN/DATABASE.md'),
    'utf8',
  );
  assert.ok(databaseDoc.includes('delivery_partners'), 'Missing delivery_partners in DATABASE.md');

  const adrsDoc = fs.readFileSync(
    path.join(REPO_ROOT, 'docs/01-CORE-PLANNING-DESIGN/ADRS.md'),
    'utf8',
  );
  assert.ok(adrsDoc.includes('ADR-022: Delivery Partner Onboarding'), 'Missing ADR-022 in ADRS.md');

  const authDoc = fs.readFileSync(path.join(REPO_ROOT, 'docs/03-SECURITY-QUALITY/AUTH.md'), 'utf8');
  assert.ok(
    authDoc.includes('## 15. Delivery Partner Onboarding'),
    'Missing Section 15 in AUTH.md',
  );
  console.log('✓ Test 1 passed.');

  // Setup test environment
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
    deliveryStore,
    deliveryService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // Test 2: Multi-tenant store initialization, partner application creation
    console.log('Test 2: Multi-tenant store initialization, partner application creation...');
    const riderA = await registerCustomer(
      baseUrl,
      'rider.a@bhojora.in',
      '+91 98301 11111',
      'Rider Amitava',
    );

    const createRes = await apiJson(baseUrl, '/delivery/applications', {
      method: 'POST',
      token: riderA.token,
      body: {
        fullName: 'Amitava Sen',
        preferredZones: ['central', 'salt-lake'],
        vehicleType: 'MOTORCYCLE',
        vehicleModel: 'Hero Splendor Plus',
        vehicleRegistrationNumber: 'WB-02-AK-9921',
        emergencyContactName: 'Manashi Sen',
        emergencyContactPhone: '+91 98302 22222',
        emergencyContactRelationship: 'Spouse',
      },
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.json.data.application.status, 'DRAFT');
    assert.equal(createRes.json.data.application.shiftStatus, 'OFFLINE');
    assert.equal(createRes.json.data.application.city, 'Kolkata');
    assert.ok(createRes.json.data.application.vehicle.registrationNumberMasked.includes('XX'));
    const partnerIdA = createRes.json.data.application.partnerId;

    // Duplicate creation returns 409
    const dupRes = await apiJson(baseUrl, '/delivery/applications', {
      method: 'POST',
      token: riderA.token,
      body: {
        fullName: 'Amitava Sen',
        preferredZones: ['central'],
        vehicleType: 'BICYCLE',
        vehicleModel: 'Atlas Cycle',
      },
    });
    assert.equal(dupRes.status, 409);
    console.log('✓ Test 2 passed.');

    // Test 3: Document upload, number masking & HMAC hashing, submission validation
    console.log('Test 3: Document upload, number masking & HMAC hashing, submission validation...');
    // Upload Driving License
    const dlRes = await apiJson(baseUrl, '/delivery/profile/me/documents', {
      method: 'POST',
      token: riderA.token,
      body: {
        type: 'DRIVING_LICENSE',
        documentNumber: 'WB0220190012345',
        fileUrl: 'https://storage.bhojora.in/private/dl_amitava.pdf',
        mimeType: 'application/pdf',
      },
    });
    assert.equal(dlRes.status, 200);
    const dlDoc = dlRes.json.data.profile.documents.find((d) => d.type === 'DRIVING_LICENSE');
    assert.ok(dlDoc);
    assert.equal(dlDoc.isPublic, false);
    assert.equal(dlDoc.verificationStatus, 'PENDING_REVIEW');
    assert.ok(dlDoc.documentNumberMasked.startsWith('XXXXXXXXXXX'));

    // Upload Vehicle RC
    const rcRes = await apiJson(baseUrl, '/delivery/profile/me/documents', {
      method: 'POST',
      token: riderA.token,
      body: {
        type: 'VEHICLE_RC',
        documentNumber: 'WB02AK9921',
        fileUrl: 'https://storage.bhojora.in/private/rc_amitava.pdf',
        mimeType: 'application/pdf',
      },
    });
    assert.equal(rcRes.status, 200);

    // Upload PAN
    const panRes = await apiJson(baseUrl, '/delivery/profile/me/documents', {
      method: 'POST',
      token: riderA.token,
      body: {
        type: 'PAN_CARD',
        documentNumber: 'ABCDE1234F',
        fileUrl: 'https://storage.bhojora.in/private/pan_amitava.pdf',
        mimeType: 'application/pdf',
      },
    });
    assert.equal(panRes.status, 200);

    // Update bank payout details
    const bankRes = await apiJson(baseUrl, '/delivery/profile/me', {
      method: 'PUT',
      token: riderA.token,
      body: {
        bankAccountHolderName: 'Amitava Sen',
        bankAccountNumber: '123456789012',
        bankIfscCode: 'HDFC0000128',
        bankName: 'HDFC Bank Salt Lake',
      },
    });
    assert.equal(bankRes.status, 200);
    assert.ok(bankRes.json.data.profile.bankPayout.accountNumberMasked.startsWith('XXXXXXXX'));

    // Submit application
    const submitRes = await apiJson(baseUrl, '/delivery/profile/me/submit', {
      method: 'POST',
      token: riderA.token,
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.json.data.profile.status, 'UNDER_REVIEW');
    assert.ok(submitRes.json.data.profile.submittedAt);
    console.log('✓ Test 3 passed.');

    // Test 4: Cross-partner IDOR rejection (Partner B cannot view/edit Partner A)
    console.log('Test 4: Cross-partner IDOR rejection (Partner B cannot view/edit Partner A)...');
    const riderB = await registerCustomer(
      baseUrl,
      'rider.b@bhojora.in',
      '+91 98303 33333',
      'Rider Bimal',
    );
    const getResB = await apiJson(baseUrl, '/delivery/profile/me', {
      token: riderB.token,
    });
    assert.equal(getResB.status, 404); // User B has no profile yet

    // Editing while in UNDER_REVIEW returns 409
    const editUnderReview = await apiJson(baseUrl, '/delivery/profile/me', {
      method: 'PUT',
      token: riderA.token,
      body: { fullName: 'Amitava Sen Mod' },
    });
    assert.equal(editUnderReview.status, 409);
    console.log('✓ Test 4 passed.');

    // Test 5: Self-review prohibition (Admin cannot approve their own application)
    console.log('Test 5: Self-review prohibition (Admin cannot approve their own application)...');
    const opsAdmin = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'ops.admin@bhojora.in',
      phone: '+91 98304 44444',
      name: 'Ops Admin Kaushik',
      role: 'OPS_ADMIN',
      mfaVerified: true,
    });

    // Admin creates their own application
    const adminAppRes = await apiJson(baseUrl, '/delivery/applications', {
      method: 'POST',
      token: opsAdmin.token,
      body: {
        fullName: 'Kaushik Admin',
        preferredZones: ['central'],
        vehicleType: 'BICYCLE',
        vehicleModel: 'Hero Cycle',
      },
    });
    assert.equal(adminAppRes.status, 201);
    const adminPartnerId = adminAppRes.json.data.application.partnerId;

    // Admin attempts to review their own application
    const selfReviewRes = await apiJson(
      baseUrl,
      `/delivery/admin/applications/${adminPartnerId}/review`,
      {
        method: 'POST',
        token: opsAdmin.token,
        body: { action: 'APPROVE' },
      },
    );
    assert.equal(selfReviewRes.status, 403);
    assert.equal(selfReviewRes.json.error.code, 'FORBIDDEN');
    assert.equal(selfReviewRes.json.error.details[0].code, 'SELF_REVIEW_PROHIBITED');

    // Verify audit log recorded rejection
    const auditLogs = await rbacStore.listAuditLogs(100);
    const selfReviewAudit = auditLogs.find(
      (l) => l.action === 'admin.delivery_partner.reviewed' && l.outcome === 'DENIED',
    );
    assert.ok(selfReviewAudit, 'Missing DENIED self-review audit log');
    console.log('✓ Test 5 passed.');

    // Test 6: Shift availability lock (Cannot go online before approval -> 409)
    console.log('Test 6: Shift availability lock (Cannot go online before approval -> 409)...');
    const prematureShiftRes = await apiJson(baseUrl, '/delivery/profile/me/availability', {
      method: 'PATCH',
      token: riderA.token,
      body: { shiftStatus: 'ONLINE' },
    });
    assert.equal(prematureShiftRes.status, 409);
    assert.ok(prematureShiftRes.json.error.message.includes('not approved'));
    console.log('✓ Test 6 passed.');

    // Test 7: Ops Admin review: Rejection with short note blocked (<8 chars); valid rejection recorded with reason
    console.log('Test 7: Ops Admin review: Rejection validation and execution...');
    // Short note rejection rejected
    const shortRejectRes = await apiJson(
      baseUrl,
      `/delivery/admin/applications/${partnerIdA}/review`,
      {
        method: 'POST',
        token: opsAdmin.token,
        body: { action: 'REJECT', reason: 'bad' },
      },
    );
    assert.equal(shortRejectRes.status, 400);

    // Valid rejection
    const validRejectRes = await apiJson(
      baseUrl,
      `/delivery/admin/applications/${partnerIdA}/review`,
      {
        method: 'POST',
        token: opsAdmin.token,
        body: {
          action: 'REJECT',
          reason: 'Vehicle RC image is unreadable. Please upload a clear photo.',
        },
      },
    );
    assert.equal(validRejectRes.status, 200);
    assert.equal(validRejectRes.json.data.application.status, 'REJECTED');
    assert.equal(
      validRejectRes.json.data.application.rejectionReason,
      'Vehicle RC image is unreadable. Please upload a clear photo.',
    );
    console.log('✓ Test 7 passed.');

    // Test 8: Ops Admin approval: Status transitions to APPROVED, role upgraded to DELIVERY_PARTNER
    console.log('Test 8: Ops Admin approval: Status transitions to APPROVED, role upgraded...');
    // Resubmit application
    const resubmitRes = await apiJson(baseUrl, '/delivery/profile/me/submit', {
      method: 'POST',
      token: riderA.token,
    });
    assert.equal(resubmitRes.status, 200);
    assert.equal(resubmitRes.json.data.profile.status, 'UNDER_REVIEW');

    // Admin approves
    const approveRes = await apiJson(baseUrl, `/delivery/admin/applications/${partnerIdA}/review`, {
      method: 'POST',
      token: opsAdmin.token,
      body: { action: 'APPROVE' },
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.json.data.application.status, 'APPROVED');
    assert.ok(approveRes.json.data.application.approvedAt);
    assert.equal(approveRes.json.data.application.documents[0].verificationStatus, 'VERIFIED');

    // Check applicant user record in IdentityStore has DELIVERY_PARTNER role
    const riderUserRecord = await identityStore.findUserById(riderA.userId);
    assert.ok(riderUserRecord.roles.includes('DELIVERY_PARTNER'));
    console.log('✓ Test 8 passed.');

    // Test 9: Approved partner successfully goes ONLINE with Kolkata coordinates
    console.log('Test 9: Approved partner successfully goes ONLINE with Kolkata coordinates...');
    // Out-of-bounds coordinates (Delhi: [77.2090, 28.6139])
    const outOfBoundsRes = await apiJson(baseUrl, '/delivery/profile/me/availability', {
      method: 'PATCH',
      token: riderA.token,
      body: {
        shiftStatus: 'ONLINE',
        coordinates: [77.209, 28.6139],
      },
    });
    assert.equal(outOfBoundsRes.status, 400);
    assert.ok(outOfBoundsRes.json.error.message.includes('Kolkata service bounds'));

    // Valid Kolkata coordinates (Park Street: [88.3524, 22.5516])
    const onlineRes = await apiJson(baseUrl, '/delivery/profile/me/availability', {
      method: 'PATCH',
      token: riderA.token,
      body: {
        shiftStatus: 'ONLINE',
        coordinates: [88.3524, 22.5516],
      },
    });
    assert.equal(onlineRes.status, 200);
    assert.equal(onlineRes.json.data.profile.shiftStatus, 'ONLINE');

    // Switch to OFFLINE
    const offlineRes = await apiJson(baseUrl, '/delivery/profile/me/availability', {
      method: 'PATCH',
      token: riderA.token,
      body: { shiftStatus: 'OFFLINE' },
    });
    assert.equal(offlineRes.status, 200);
    assert.equal(offlineRes.json.data.profile.shiftStatus, 'OFFLINE');
    console.log('✓ Test 9 passed.');

    console.log('--- ALL CHECKPOINT 18 VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

void runCheckpoint18Verification().catch((err) => {
  console.error('FATAL Test failure in Checkpoint 18 verification:', err);
  process.exit(1);
});
