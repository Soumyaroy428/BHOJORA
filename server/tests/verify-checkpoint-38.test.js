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
const { InMemoryExpansionStore } = require('../dist/modules/expansion/expansion.store.js');
const { ExpansionService } = require('../dist/modules/expansion/expansion.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4038',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp38_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp38!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp38!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp38!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp38!',
    },
    { serviceName: 'bhojora-test-cp38', serviceVersion: '0.1.0' },
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
  const data = await response.json();
  return { status: response.status, ok: response.ok, data };
}

async function registerAndLogin(baseUrl, identityStore, rbacStore, phone, role = 'CUSTOMER') {
  const email = `${role.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}@test.bhojora.in`;
  const registerRes = await apiJson(baseUrl, '/auth/register', {
    method: 'POST',
    body: {
      phone,
      name: `User ${phone}`,
      email,
      password: TEST_PASSWORD,
      acceptTerms: true,
    },
  });
  assert.equal(
    registerRes.status,
    201,
    `Failed to register user: ${JSON.stringify(registerRes.data)}`,
  );

  const userId = registerRes.data.data.user.id;
  if (role && role !== 'CUSTOMER') {
    await identityStore.updateUser(userId, { roles: [role] }, new Date());
  }

  await rbacStore.upsertMembership({
    userId,
    tenantType: 'PLATFORM',
    tenantId: 'platform_global',
    roles: [role],
    status: 'ACTIVE',
    permissions: [],
    grantedAt: new Date().toISOString(),
  });

  const loginRes = await apiJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: {
      identifier: phone,
      password: TEST_PASSWORD,
    },
  });
  assert.equal(loginRes.status, 200, `Failed to login: ${JSON.stringify(loginRes.data)}`);
  return {
    token: loginRes.data.data.tokens.accessToken,
    userId,
  };
}

async function run() {
  console.log(
    '--- Starting Checkpoint 38 Pilot Evaluation & Expansion Decision Verification Suite ---',
  );

  const config = createTestConfig();
  const logger = createLogger({
    level: 'error',
    service: 'cp38-test',
    environment: 'test',
  });

  const identityStore = new InMemoryIdentityStore();
  const rbacStore = new InMemoryRbacStore();
  const expansionStore = new InMemoryExpansionStore();
  const expansionService = new ExpansionService(expansionStore);

  const identityService = new IdentityService({
    config,
    store: identityStore,
    otpAdapter: new InMemoryTestOtpAdapter(),
    logger,
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    expansionStore,
    expansionService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

  try {
    const adminAuth = await registerAndLogin(
      baseUrl,
      identityStore,
      rbacStore,
      '+919900038001',
      'SUPER_ADMIN',
    );
    const customerAuth = await registerAndLogin(
      baseUrl,
      identityStore,
      rbacStore,
      '+919900038002',
      'CUSTOMER',
    );

    // Test 1: GET /api/v1/expansion/evaluation returns full evaluation report for Kolkata pilot
    console.log(
      'Test 1: GET /api/v1/expansion/evaluation returns full evaluation report for Kolkata pilot',
    );
    const reportRes = await apiJson(baseUrl, '/expansion/evaluation');
    assert.equal(reportRes.status, 200);
    assert.equal(reportRes.data.data.cityCode, 'KOLKATA');
    assert.ok(reportRes.data.data.unitEconomics);
    assert.ok(reportRes.data.data.retention);
    assert.ok(reportRes.data.data.inspectionIntegrity);
    assert.ok(reportRes.data.data.decision);
    assert.ok(reportRes.data.data.nextCityPlan.length >= 3);

    // Test 2: Unit economics confirms positive contribution margin and sustainable take rate
    console.log(
      'Test 2: Unit economics confirms positive contribution margin and sustainable take rate',
    );
    const u = reportRes.data.data.unitEconomics;
    assert.equal(u.isContributionMarginPositive, true);
    assert.ok(u.contributionMarginPerOrderInr > 0);
    assert.ok(u.netPlatformTakeRatePercent >= 15.0);
    assert.equal(u.averageOrderValueInr, 642.5);

    // Test 3: Customer retention confirms healthy 14-day repeat rate and strong NPS
    console.log('Test 3: Customer retention confirms healthy 14-day repeat rate and strong NPS');
    const r = reportRes.data.data.retention;
    assert.ok(r.fourteenDayRepeatOrderRatePercent >= 50.0);
    assert.ok(r.netPromoterScore >= 50);
    assert.equal(r.restaurantChurnRatePercent, 0.0);

    // Test 4: Inspection integrity verifies 100% on-time re-audits and zero critical complaints
    console.log(
      'Test 4: Inspection integrity verifies 100% on-time re-audits and zero critical complaints',
    );
    const i = reportRes.data.data.inspectionIntegrity;
    assert.equal(i.onTimeReAuditRatePercent, 100.0);
    assert.equal(i.zeroTamperingReportsConfirmed, true);
    assert.equal(i.criticalComplaintsCount, 0);

    // Test 5: Go/No-Go decision defaults to CONDITIONAL_REVISION prior to founder approval
    console.log(
      'Test 5: Go/No-Go decision defaults to CONDITIONAL_REVISION prior to founder approval',
    );
    const initialDecisionRes = await apiJson(baseUrl, '/expansion/decision');
    assert.equal(initialDecisionRes.status, 200);
    assert.equal(initialDecisionRes.data.data.status, 'CONDITIONAL_REVISION');
    assert.equal(initialDecisionRes.data.data.founderApproved, false);
    assert.ok(
      initialDecisionRes.data.data.correctiveActionsRequired.some((c) => c.includes('founder')),
    );

    // Test 6: Non-founder / non-super-admin is blocked (403 FORBIDDEN) from submitting expansion approval
    console.log(
      'Test 6: Non-founder / non-super-admin is blocked (403 FORBIDDEN) from submitting expansion approval',
    );
    const unauthorizedApprovalRes = await apiJson(baseUrl, '/expansion/founder-approval', {
      method: 'POST',
      token: customerAuth.token,
      body: {
        founderName: 'Unauthorized User',
        approvalDecision: 'GO_EXPANSION',
        comments: 'Attempting to bypass founder authorization',
      },
    });
    assert.equal(unauthorizedApprovalRes.status, 403);
    assert.equal(unauthorizedApprovalRes.data.success, false);

    // Test 7: Super Admin submits formal founder approval with SHA-256 audit signature
    console.log('Test 7: Super Admin submits formal founder approval with SHA-256 audit signature');
    const approvalRes = await apiJson(baseUrl, '/expansion/founder-approval', {
      method: 'POST',
      token: adminAuth.token,
      body: {
        founderName: 'Soumya Roy',
        approvalDecision: 'GO_EXPANSION',
        comments:
          'Kolkata pilot exceeded all unit economic, retention, and food hygiene benchmarks. Approved for Phase 2 expansion.',
      },
    });
    assert.equal(approvalRes.status, 200);
    assert.equal(approvalRes.data.data.founderApproved, true);
    assert.equal(approvalRes.data.data.founderSignOff.founderName, 'Soumya Roy');
    assert.ok(typeof approvalRes.data.data.founderSignOff.auditSignature === 'string');
    assert.equal(approvalRes.data.data.founderSignOff.auditSignature.length, 64); // SHA-256

    // Test 8: Expansion decision status transitions to GO_EXPANSION with 100% readiness score
    console.log(
      'Test 8: Expansion decision status transitions to GO_EXPANSION with 100% readiness score',
    );
    const finalDecisionRes = await apiJson(baseUrl, '/expansion/decision');
    assert.equal(finalDecisionRes.status, 200);
    assert.equal(finalDecisionRes.data.data.status, 'GO_EXPANSION');
    assert.equal(finalDecisionRes.data.data.overallScorePercent, 100.0);
    assert.equal(finalDecisionRes.data.data.correctiveActionsRequired.length, 0);

    // Test 9: GET /api/v1/expansion/next-city-plan returns ranked regional candidates
    console.log('Test 9: GET /api/v1/expansion/next-city-plan returns ranked regional candidates');
    const nextCityRes = await apiJson(baseUrl, '/expansion/next-city-plan');
    assert.equal(nextCityRes.status, 200);
    const candidates = nextCityRes.data.data;
    assert.ok(candidates.length >= 3);
    const howrah = candidates.find((c) => c.cityCode === 'HOWRAH');
    assert.ok(howrah);
    assert.equal(howrah.targetLaunchQuarter, 'Q1 2027');
    assert.ok(howrah.readinessScorePercent >= 90.0);

    const siliguri = candidates.find((c) => c.cityCode === 'SILIGURI');
    assert.ok(siliguri);
    assert.equal(siliguri.targetLaunchQuarter, 'Q2 2027');

    // Test 10: Malformed founder approval payloads are rejected with 400 VALIDATION_ERROR
    console.log(
      'Test 10: Malformed founder approval payloads are rejected with 400 VALIDATION_ERROR',
    );
    const badPayloadRes = await apiJson(baseUrl, '/expansion/founder-approval', {
      method: 'POST',
      token: adminAuth.token,
      body: {
        founderName: 'S', // Too short
        approvalDecision: 'INVALID_STATUS',
        comments: 'Short', // Too short
      },
    });
    assert.equal(badPayloadRes.status, 400);
    assert.equal(badPayloadRes.data.success, false);

    console.log('--- All 10 Checkpoint 38 Verification Tests Passed Successfully! ---');
  } finally {
    server.close();
  }
}

run().catch((error) => {
  console.error('Checkpoint 38 verification failed:', error);
  process.exit(1);
});
