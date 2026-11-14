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
const { InMemoryPilotStore } = require('../dist/modules/pilot/pilot.store.js');
const { PilotService } = require('../dist/modules/pilot/pilot.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4037',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp37_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp37!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp37!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp37!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp37!',
    },
    { serviceName: 'bhojora-test-cp37', serviceVersion: '0.1.0' },
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
  console.log('--- Starting Checkpoint 37 Kolkata Pilot Operational Verification Suite ---');

  const config = createTestConfig();
  const logger = createLogger({
    level: 'error',
    service: 'cp37-test',
    environment: 'test',
  });

  const identityStore = new InMemoryIdentityStore();
  const rbacStore = new InMemoryRbacStore();
  const pilotStore = new InMemoryPilotStore();
  const pilotService = new PilotService(pilotStore);

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
    pilotStore,
    pilotService,
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
      '+919900037001',
      'SUPER_ADMIN',
    );
    const customerAuth = await registerAndLogin(
      baseUrl,
      identityStore,
      rbacStore,
      '+919900037002',
      'CUSTOMER',
    );

    // Test 1: GET /api/v1/pilot/status returns Kolkata pilot zones and configuration
    console.log('Test 1: GET /api/v1/pilot/status returns Kolkata pilot zones and configuration');
    const statusRes = await apiJson(baseUrl, '/pilot/status');
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.data.data.cityCode, 'KOLKATA');
    assert.equal(statusRes.data.data.status, 'ACTIVE_PILOT');
    assert.ok(statusRes.data.data.zones.length >= 2);

    // Test 2: Pilot zones enforce minimum hygiene rating (>= 90) and radius boundaries
    console.log('Test 2: Pilot zones enforce minimum hygiene rating (>= 90) and radius boundaries');
    const saltLakeZone = statusRes.data.data.zones.find((z) => z.zoneCode === 'SALT_LAKE_SEC_V');
    assert.ok(saltLakeZone);
    assert.equal(saltLakeZone.minHygieneRatingThreshold, 90);
    assert.equal(saltLakeZone.maxDeliveryRadiusKm, 5.5);

    const parkStZone = statusRes.data.data.zones.find(
      (z) => z.zoneCode === 'PARK_STREET_BHOWANIPORE',
    );
    assert.ok(parkStZone);
    assert.equal(parkStZone.minHygieneRatingThreshold, 90);
    assert.equal(parkStZone.maxDeliveryRadiusKm, 6.0);

    // Test 3: Customer joins pilot cohort using valid invite code
    console.log('Test 3: Customer joins pilot cohort using valid invite code');
    const joinRes = await apiJson(baseUrl, '/pilot/cohort/join', {
      method: 'POST',
      token: customerAuth.token,
      body: {
        inviteCode: 'KOLKATA_PILOT_VIP',
        zoneCode: 'PARK_STREET_BHOWANIPORE',
        cohortType: 'CUSTOMER',
      },
    });
    assert.equal(joinRes.status, 201);
    assert.equal(joinRes.data.data.status, 'ACTIVE');
    assert.equal(joinRes.data.data.userId, customerAuth.userId);

    // Test 4: Invalid or unrecognized invite codes are rejected (400 VALIDATION_ERROR)
    console.log('Test 4: Invalid or unrecognized invite codes are rejected (400 VALIDATION_ERROR)');
    const badCodeRes = await apiJson(baseUrl, '/pilot/cohort/join', {
      method: 'POST',
      token: customerAuth.token,
      body: {
        inviteCode: 'INVALID_RANDOM_CODE',
        zoneCode: 'SALT_LAKE_SEC_V',
        cohortType: 'CUSTOMER',
      },
    });
    assert.equal(badCodeRes.status, 400);
    assert.equal(badCodeRes.data.success, false);

    // Test 5: GET /api/v1/pilot/cohort/verify returns active membership status
    console.log('Test 5: GET /api/v1/pilot/cohort/verify returns active membership status');
    const verifyRes = await apiJson(baseUrl, '/pilot/cohort/verify', {
      method: 'GET',
      token: customerAuth.token,
    });
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data.data.isCohortMember, true);
    assert.equal(verifyRes.data.data.member.zoneCode, 'PARK_STREET_BHOWANIPORE');

    // Test 6: Pilot thresholds evaluation satisfies all 5 acceptance targets
    console.log('Test 6: Pilot thresholds evaluation satisfies all 5 acceptance targets');
    const thresholdsRes = await apiJson(baseUrl, '/pilot/thresholds');
    assert.equal(thresholdsRes.status, 200);
    const t = thresholdsRes.data.data;
    assert.equal(t.onTimeThresholdMet, true); // 96.6% >= 92%
    assert.equal(t.safetyThresholdMet, true); // 0 incidents
    assert.equal(t.paymentThresholdMet, true); // 100% >= 99%
    assert.equal(t.completionThresholdMet, true); // 98.0% >= 95%
    assert.equal(t.satisfactionThresholdMet, true); // 4.8 >= 4.5
    assert.equal(t.allThresholdsSatisfied, true);

    // Test 7: Admin triggers emergency kill-switch and confirms status transitions to ROLLBACK_TRIGGERED
    console.log(
      'Test 7: Admin triggers emergency kill-switch and confirms status transitions to ROLLBACK_TRIGGERED',
    );
    const killRes = await apiJson(baseUrl, '/pilot/admin/emergency-kill', {
      method: 'POST',
      token: adminAuth.token,
      body: {
        reason: 'Emergency weather lockdown: Cyclone alert in Kolkata metropolitan area',
      },
    });
    assert.equal(killRes.status, 200);
    assert.equal(killRes.data.data.status, 'ROLLBACK_TRIGGERED');
    assert.equal(killRes.data.data.killSwitchActive, true);
    assert.ok(killRes.data.data.killSwitchReason.includes('Cyclone alert'));

    // Test 8: Non-admin users are blocked (403 FORBIDDEN) from emergency kill-switch control
    console.log(
      'Test 8: Non-admin users are blocked (403 FORBIDDEN) from emergency kill-switch control',
    );
    const unauthorizedKillRes = await apiJson(baseUrl, '/pilot/admin/emergency-kill', {
      method: 'POST',
      token: customerAuth.token,
      body: {
        reason: 'Unauthorized kill attempt',
      },
    });
    assert.equal(unauthorizedKillRes.status, 403);
    assert.equal(unauthorizedKillRes.data.success, false);

    // Test 9: Admin resumes pilot operations back to ACTIVE_PILOT
    console.log('Test 9: Admin resumes pilot operations back to ACTIVE_PILOT');
    const resumeRes = await apiJson(baseUrl, '/pilot/admin/resume', {
      method: 'POST',
      token: adminAuth.token,
    });
    assert.equal(resumeRes.status, 200);
    assert.equal(resumeRes.data.data.status, 'ACTIVE_PILOT');
    assert.equal(resumeRes.data.data.killSwitchActive, false);

    // Test 10: Zone-specific emergency kill-switch isolates affected zone while other zones remain operational
    console.log(
      'Test 10: Zone-specific emergency kill-switch isolates affected zone while other zones remain operational',
    );
    const zoneKillRes = await apiJson(baseUrl, '/pilot/admin/emergency-kill', {
      method: 'POST',
      token: adminAuth.token,
      body: {
        reason: 'Local water-logging in Salt Lake Sector V',
        zoneCode: 'SALT_LAKE_SEC_V',
      },
    });
    assert.equal(zoneKillRes.status, 200);
    const updatedZones = zoneKillRes.data.data.zones;
    const isolatedZone = updatedZones.find((z) => z.zoneCode === 'SALT_LAKE_SEC_V');
    const runningZone = updatedZones.find((z) => z.zoneCode === 'PARK_STREET_BHOWANIPORE');
    assert.equal(isolatedZone.operationalStatus, 'EMERGENCY_KILL_SWITCH');
    assert.equal(runningZone.operationalStatus, 'ACTIVE_PILOT');

    // Clean up: resume isolated zone
    await apiJson(baseUrl, '/pilot/admin/resume', {
      method: 'POST',
      token: adminAuth.token,
      body: { zoneCode: 'SALT_LAKE_SEC_V' },
    });

    console.log('--- All 10 Checkpoint 37 Verification Tests Passed Successfully! ---');
  } finally {
    server.close();
  }
}

run().catch((error) => {
  console.error('Checkpoint 37 verification failed:', error);
  process.exit(1);
});
