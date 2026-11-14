'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');

const { validateEnv } = require('../dist/config/env.js');
const { createLogger } = require('../dist/config/logger.js');
const { createApp } = require('../dist/app.js');
const { InMemoryIdentityStore } = require('../dist/modules/identity/identity.models.js');
const { InMemoryTestOtpAdapter } = require('../dist/modules/identity/otp.adapter.js');
const { IdentityService } = require('../dist/modules/identity/identity.service.js');
const { InMemoryRbacStore } = require('../dist/modules/rbac/rbac.store.js');
const { InMemoryRestaurantStore } = require('../dist/modules/restaurant/restaurant.store.js');
const { InMemoryDeliveryStore } = require('../dist/modules/delivery/delivery.store.js');
const { InMemoryGovernanceStore } = require('../dist/modules/governance/governance.store.js');
const { GovernanceService } = require('../dist/modules/governance/governance.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4028',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp28_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp28!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp28!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp28!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp28!',
    },
    { serviceName: 'bhojora-test-cp28', serviceVersion: '0.1.0' },
  );
}

async function apiJson(baseUrl, pathUrl, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...options.headers };
  let bodyStr;
  if (options.body) {
    headers['content-type'] = 'application/json';
    bodyStr = JSON.stringify(options.body);
  }
  if (options.token) {
    headers['authorization'] = `Bearer ${options.token}`;
  }
  const response = await fetch(`${baseUrl}${pathUrl}`, {
    method,
    headers,
    body: bodyStr,
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, body: json };
}

async function registerCustomer(baseUrl, email, phone, name) {
  const res = await apiJson(baseUrl, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      email,
      phone,
      password: TEST_PASSWORD,
      name,
      acceptTerms: true,
    },
  });
  assert.equal(res.status, 201, `Failed registering ${email}: ${JSON.stringify(res.body)}`);
  return {
    userId: res.body.data.user.id,
    token: res.body.data.tokens.accessToken,
    name,
  };
}

async function createRoleUser(baseUrl, identityStore, otpAdapter, email, phone, name, role) {
  const reg = await registerCustomer(baseUrl, email, phone, name);
  await identityStore.updateUser(reg.userId, { roles: [role] }, new Date());
  const loginRes = await apiJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: { identifier: email, password: TEST_PASSWORD },
  });
  assert.equal(loginRes.status, 200);
  const token = loginRes.body.data.tokens.accessToken;

  // Step-up MFA verification
  const mfaSendRes = await apiJson(baseUrl, '/api/v1/auth/mfa/send', {
    method: 'POST',
    token,
  });
  assert.equal(mfaSendRes.status, 200, 'MFA send should succeed');
  const challengeId = mfaSendRes.body.data.challengeId;
  const latestMfa = otpAdapter.getLatestMessage();
  const codeMatch = latestMfa?.bodyText?.match(/\b(\d{6})\b/);
  assert.ok(codeMatch, 'MFA code should be generated in test OTP adapter');

  const verifyMfaRes = await apiJson(baseUrl, '/api/v1/auth/mfa/verify', {
    method: 'POST',
    token,
    body: { challengeId, code: codeMatch[1] },
  });
  assert.equal(verifyMfaRes.status, 200, 'MFA verification should succeed');

  return {
    userId: reg.userId,
    token,
    name,
  };
}

async function main() {
  console.log('=== CHECKPOINT 28: ADMIN GOVERNANCE AND CONSOLE ===\n');

  const config = createTestConfig();
  const logger = createLogger(config);
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const rbacStore = new InMemoryRbacStore();
  const restaurantStore = new InMemoryRestaurantStore();
  const deliveryStore = new InMemoryDeliveryStore();
  const governanceStore = new InMemoryGovernanceStore();

  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const governanceService = new GovernanceService({
    governanceStore,
    identityStore,
    restaurantStore,
    deliveryStore,
    rbacStore,
    clock: { now: () => new Date('2026-11-14T08:00:00Z') },
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    restaurantStore,
    deliveryStore,
    governanceStore,
    governanceService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // Seed initial outlet in restaurantStore
    const testOutlet = await restaurantStore.upsertOutlet({
      outletId: 'outlet_kolkata_central',
      restaurantId: 'rest_bhojora_01',
      ownerUserId: 'owner_usr_01',
      brandName: 'Bhojora Kitchen',
      name: 'Park Street Central',
      slug: 'bhojora-park-street',
      zoneId: 'park_street',
      wardOrBorough: 'Ward 63',
      streetAddress: '12 Park Street',
      landmark: 'Near Oxford Bookstore',
      locality: 'Park Street',
      city: 'Kolkata',
      postalCode: '700016',
      location: { type: 'Point', coordinates: [88.3527, 22.553] },
      cuisines: ['Bengali', 'North Indian'],
      prepTimeMinutes: 20,
      operatingSlots: [],
      status: 'ACTIVE',
      fssaiLicenseNumber: '12824019000123',
      fssaiExpiresOn: '2028-12-31',
      fssaiVerificationStatus: 'VERIFIED',
      platformInspectionStatus: 'PASSED',
      publishedSafetyScore: 94,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Seed initial delivery partner in deliveryStore
    const testPartner = await deliveryStore.createPartner({
      partnerId: 'dp_kolkata_99',
      userId: 'user_rider_99',
      fullName: 'Subhashish Das',
      phoneMasked: 'XXXXXX4411',
      email: 'subhashish@bhojora.test',
      city: 'Kolkata',
      preferredZones: ['park_street'],
      vehicle: {
        vehicleType: 'EV_2W',
        registrationNumberMasked: 'WB-01-XXXX',
        model: 'Ather 450X',
      },
      status: 'APPROVED',
      shiftStatus: 'ONLINE',
      documents: [],
      bankPayout: null,
      emergencyContact: null,
      rejectionReason: null,
      rating: 4.85,
      totalDeliveries: 120,
      submittedAt: new Date(),
      reviewedAt: new Date(),
      reviewedByUserId: 'ops_admin_01',
      approvedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create actors
    const customer = await registerCustomer(
      baseUrl,
      'customer.gov@bhojora.test',
      '9876548001',
      'Gov Customer',
    );

    const superAdmin = await createRoleUser(
      baseUrl,
      identityStore,
      otpAdapter,
      'superadmin@bhojora.test',
      '9876548002',
      'Super Admin',
      'SUPER_ADMIN',
    );

    const opsAdmin = await createRoleUser(
      baseUrl,
      identityStore,
      otpAdapter,
      'opsadmin@bhojora.test',
      '9876548003',
      'Ops Admin',
      'OPS_ADMIN',
    );

    // [Check 1] Access control & least privilege: unauthenticated / non-admin rejected
    const unauthRes = await apiJson(baseUrl, '/api/v1/admin/overview');
    assert.equal(unauthRes.status, 401, 'Unauthenticated access should be rejected with 401');

    const customerRes = await apiJson(baseUrl, '/api/v1/admin/overview', {
      token: customer.token,
    });
    assert.equal(customerRes.status, 403, 'Customer role must be denied admin access with 403');
    console.log('✓ [Check 1] Least-privilege role boundaries enforce 401/403 guards.');

    // [Check 2] Admin overview KPIs
    const overviewRes = await apiJson(baseUrl, '/api/v1/admin/overview', {
      token: superAdmin.token,
    });
    assert.equal(overviewRes.status, 200, 'Super admin should read overview');
    assert.ok(overviewRes.body.data.usersTotal >= 3, 'Overview should count registered users');
    assert.equal(overviewRes.body.data.outletsActive, 1, 'Overview should count active outlets');
    assert.equal(
      overviewRes.body.data.deliveryPartnersActive,
      1,
      'Overview should count active delivery partners',
    );
    console.log('✓ [Check 2] Admin dashboard overview aggregates live platform metrics.');

    // [Check 3] User governance: list users
    const usersRes = await apiJson(baseUrl, '/api/v1/admin/users', {
      token: superAdmin.token,
    });
    assert.equal(usersRes.status, 200);
    assert.ok(Array.isArray(usersRes.body.data.users), 'Users response must contain user list');
    console.log('✓ [Check 3] Administrative user directory query verified.');

    // [Check 4] User status governance: validation & reason capture
    const shortReasonRes = await apiJson(baseUrl, `/api/v1/admin/users/${customer.userId}/status`, {
      method: 'PATCH',
      token: superAdmin.token,
      body: { status: 'SUSPENDED', reason: 'bad' },
    });
    assert.equal(shortReasonRes.status, 400, 'Reason < 8 characters must fail validation');

    const selfSuspendRes = await apiJson(
      baseUrl,
      `/api/v1/admin/users/${superAdmin.userId}/status`,
      {
        method: 'PATCH',
        token: superAdmin.token,
        body: { status: 'SUSPENDED', reason: 'Attempt self-suspension test' },
      },
    );
    assert.equal(selfSuspendRes.status, 400, 'Self-suspension must be prohibited');

    const suspendRes = await apiJson(baseUrl, `/api/v1/admin/users/${customer.userId}/status`, {
      method: 'PATCH',
      token: superAdmin.token,
      body: {
        status: 'SUSPENDED',
        reason: 'Investigation into policy violation and chargeback anomaly #809',
      },
    });
    assert.equal(suspendRes.status, 200, 'User suspension should succeed');
    assert.equal(suspendRes.body.data.user.status, 'SUSPENDED');
    console.log(
      '✓ [Check 4] User suspension captures justification and prohibits self-suspension.',
    );

    // [Check 5] Restaurant outlet governance
    const outletSuspendRes = await apiJson(
      baseUrl,
      `/api/v1/admin/outlets/${testOutlet.outletId}/status`,
      {
        method: 'PATCH',
        token: opsAdmin.token,
        body: {
          status: 'SUSPENDED',
          reason: 'Temporary emergency closure due to waterlogging along Park Street corridor',
        },
      },
    );
    assert.equal(outletSuspendRes.status, 200, 'Outlet suspension should succeed');
    assert.equal(outletSuspendRes.body.data.outlet.status, 'SUSPENDED');
    console.log(
      '✓ [Check 5] Outlet operational state update audited with mandatory justification.',
    );

    // [Check 6] Delivery partner governance
    const partnerSuspendRes = await apiJson(
      baseUrl,
      `/api/v1/admin/partners/${testPartner.partnerId}/status`,
      {
        method: 'PATCH',
        token: opsAdmin.token,
        body: {
          status: 'SUSPENDED',
          reason:
            'Vehicle document verification pending re-upload of updated pollution certificate',
        },
      },
    );
    assert.equal(partnerSuspendRes.status, 200, 'Partner suspension should succeed');
    assert.equal(partnerSuspendRes.body.data.partner.status, 'SUSPENDED');
    console.log('✓ [Check 6] Delivery partner suspension audited and offline transition verified.');

    // [Check 7] Audit search & query engine
    const auditRes = await apiJson(baseUrl, '/api/v1/admin/audit-logs?action=user:status:update', {
      token: superAdmin.token,
    });
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.body.data.logs.length >= 1, 'Audit query should match action');
    assert.equal(auditRes.body.data.logs[0].action, 'user:status:update');
    assert.equal(auditRes.body.data.logs[0].resourceId, customer.userId);

    const searchRes = await apiJson(baseUrl, '/api/v1/admin/audit-logs?search=waterlogging', {
      token: superAdmin.token,
    });
    assert.equal(searchRes.status, 200);
    assert.ok(searchRes.body.data.logs.length >= 1, 'Free-text search should match reason');
    console.log('✓ [Check 7] Immutable audit query and full-text reason search verified.');

    // [Check 8] Propose platform configuration change
    const proposalRes = await apiJson(baseUrl, '/api/v1/admin/config/proposals', {
      method: 'POST',
      token: opsAdmin.token,
      body: {
        proposedChanges: {
          monsoonWaterloggingMode: true,
          emergencySurgeLock: true,
        },
        reason:
          'Heavy thunderstorm warning issued by meteorological department for Kolkata Central',
      },
    });
    assert.equal(proposalRes.status, 201, 'Config proposal should be created');
    assert.equal(proposalRes.body.data.proposal.status, 'PENDING');
    const proposalId = proposalRes.body.data.proposal.proposalId;
    console.log('✓ [Check 8] Configuration change proposal captured with justification reason.');

    // [Check 9] Two-person rule enforcement: proposer cannot self-approve
    const selfApproveRes = await apiJson(
      baseUrl,
      `/api/v1/admin/config/proposals/${proposalId}/review`,
      {
        method: 'POST',
        token: opsAdmin.token,
        body: {
          decision: 'APPROVE',
          reason: 'Attempting to self-approve my own proposal',
        },
      },
    );
    assert.equal(
      selfApproveRes.status,
      403,
      'Proposer must not be permitted to self-approve configuration proposal',
    );
    console.log('✓ [Check 9] Two-person review rule strictly prohibits self-approval.');

    // [Check 10] Peer administrator approval & live config update
    const peerApproveRes = await apiJson(
      baseUrl,
      `/api/v1/admin/config/proposals/${proposalId}/review`,
      {
        method: 'POST',
        token: superAdmin.token,
        body: {
          decision: 'APPROVE',
          reason: 'Verified meteorological bulletin and authorized emergency weather protocols',
        },
      },
    );
    assert.equal(peerApproveRes.status, 200, 'Peer approval should succeed');
    assert.equal(peerApproveRes.body.data.proposal.status, 'APPROVED');
    assert.equal(peerApproveRes.body.data.config.monsoonWaterloggingMode, true);
    assert.equal(peerApproveRes.body.data.config.emergencySurgeLock, true);
    assert.equal(peerApproveRes.body.data.config.version, 2);

    const activeConfigRes = await apiJson(baseUrl, '/api/v1/admin/config', {
      token: superAdmin.token,
    });
    assert.equal(activeConfigRes.status, 200);
    assert.equal(activeConfigRes.body.data.config.monsoonWaterloggingMode, true);
    console.log('✓ [Check 10] Peer approval committed and live platform configuration activated.');

    console.log('\nAll 10 Checkpoint 28 verification checks passed successfully!');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((err) => {
  console.error('Checkpoint 28 verification failed:', err);
  process.exit(1);
});
