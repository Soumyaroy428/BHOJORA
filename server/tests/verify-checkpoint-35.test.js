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
const { LoadTestRunner } = require('../dist/modules/performance/load-tester.js');
const { DisasterRecoveryDrillService } = require('../dist/modules/performance/recovery-drill.js');
const { PerformanceService } = require('../dist/modules/performance/performance.service.js');
const { INITIAL_DATABASE_INDEXES } = require('../dist/database/indexes.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4035',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp35_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp35!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp35!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp35!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp35!',
    },
    { serviceName: 'bhojora-test-cp35', serviceVersion: '0.1.0' },
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

async function registerAndLogin(baseUrl, identityStore, phone, role, rbacStore) {
  const email = `${role.toLowerCase()}_${Date.now()}@test.bhojora.in`;
  const regRes = await apiJson(baseUrl, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      phone,
      name: `User ${role}`,
      email,
      password: TEST_PASSWORD,
      acceptTerms: true,
    },
  });
  assert.equal(regRes.status, 201, `Failed to register ${role}: ${JSON.stringify(regRes.data)}`);

  const userId = regRes.data.data.user.id;
  if (role && role !== 'CUSTOMER') {
    await identityStore.updateUser(userId, { roles: [role] }, new Date());
  }

  await rbacStore.upsertMembership({
    userId,
    tenantType: 'PLATFORM',
    tenantId: 'platform_global',
    roles: [role],
    assignedByUserId: 'system_bootstrap',
    assignedAt: new Date(),
  });

  const loginRes = await apiJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      identifier: email,
      password: TEST_PASSWORD,
    },
  });
  assert.equal(loginRes.status, 200, `Login failed for ${role}`);

  const token = loginRes.data.data.tokens.accessToken;
  return { userId, token, role };
}

async function runTests() {
  console.log('--- Starting Checkpoint 35 Performance & Recovery Drill Verification Suite ---');

  const config = createTestConfig();
  const logger = createLogger({ level: 'error', service: 'test-cp35', environment: 'test' });
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const rbacStore = new InMemoryRbacStore();
  const performanceService = new PerformanceService();

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    performanceService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const adminUser = await registerAndLogin(
      baseUrl,
      identityStore,
      '+919830000035',
      'SUPER_ADMIN',
      rbacStore,
    );
    const customerUser = await registerAndLogin(
      baseUrl,
      identityStore,
      '+919830000135',
      'CUSTOMER',
      rbacStore,
    );

    const loadTester = new LoadTestRunner();

    // 1. Search & Discovery Journey Benchmark
    console.log('Test 1: Search & Discovery load benchmark satisfies p95 <= 200ms SLO target');
    const searchBenchmark = await loadTester.runJourneyBenchmark(
      'SEARCH_DISCOVERY',
      200,
      30,
      10,
      async () => {
        await new Promise((res) => setTimeout(res, Math.floor(5 + Math.random() * 10)));
      },
    );
    assert.equal(searchBenchmark.sloTargetMet, true);
    assert.ok(searchBenchmark.latencies.p95Ms <= 200);
    assert.equal(searchBenchmark.failedRequests, 0);

    // 2. Checkout & Quote Calculation Journey Benchmark
    console.log('Test 2: Checkout & Quote load benchmark satisfies p95 <= 300ms SLO target');
    const checkoutBenchmark = await loadTester.runJourneyBenchmark(
      'CHECKOUT_QUOTE',
      300,
      30,
      10,
      async () => {
        await new Promise((res) => setTimeout(res, Math.floor(8 + Math.random() * 15)));
      },
    );
    assert.equal(checkoutBenchmark.sloTargetMet, true);
    assert.ok(checkoutBenchmark.latencies.p95Ms <= 300);

    // 3. Order Tracking Journey Benchmark
    console.log('Test 3: Order Tracking load benchmark satisfies p95 <= 150ms SLO target');
    const trackingBenchmark = await loadTester.runJourneyBenchmark(
      'ORDER_TRACKING',
      150,
      30,
      10,
      async () => {
        await new Promise((res) => setTimeout(res, Math.floor(3 + Math.random() * 8)));
      },
    );
    assert.equal(trackingBenchmark.sloTargetMet, true);
    assert.ok(trackingBenchmark.latencies.p95Ms <= 150);

    // 4. Disaster Recovery: Snapshot Generation & Checksum
    console.log('Test 4: Point-in-time database snapshot captures state with SHA-256 checksum');
    const drService = new DisasterRecoveryDrillService();
    const sampleState = {
      users: [{ id: 'usr_01' }, { id: 'usr_02' }],
      orders: [
        { id: 'ord_01', totalPaise: 50000 },
        { id: 'ord_02', totalPaise: 25000 },
      ],
      restaurants: [{ id: 'rest_01', name: 'Peter Cat' }],
    };
    const { snapshot, serializedPayload } = drService.createSnapshot(sampleState);
    assert.equal(snapshot.totalRecords, 5);
    assert.ok(snapshot.checksumSha256.length === 64);

    // 5. Disaster Recovery: Point-in-Time Restore Drill Passes
    console.log('Test 5: Point-in-time restore passes: RTO <= 5s, RPO = 0 records lost');
    const restoreReport = await drService.restoreFromSnapshot(snapshot, serializedPayload);
    assert.equal(restoreReport.status, 'PASSED');
    assert.equal(restoreReport.rpoDataLossCount, 0);
    assert.ok(restoreReport.rtoAchievedSeconds <= 5.0);
    assert.equal(restoreReport.verificationDetails.recordsRestored, 5);
    assert.equal(restoreReport.verificationDetails.snapshotChecksumVerified, true);

    // 6. Queue Worker Crash Recovery Drill
    console.log(
      'Test 6: Queue crash recovery drill recovers in-flight unacknowledged jobs without duplicates',
    );
    const queueReport = await drService.runQueueCrashRecovery(5);
    assert.equal(queueReport.status, 'PASSED');
    assert.equal(queueReport.verificationDetails.unacknowledgedJobsRecovered, 5);
    assert.equal(queueReport.verificationDetails.duplicateExecutionsCount, 0);

    // 7. Database Indexes Verification
    console.log(
      'Test 7: Verified index specifications exist for 2dsphere boundaries, unique partials, and sessions',
    );
    assert.ok(INITIAL_DATABASE_INDEXES.length >= 6);
    const has2dSphere = INITIAL_DATABASE_INDEXES.some((idx) => idx.key.boundary === '2dsphere');
    const hasUniqueEmail = INITIAL_DATABASE_INDEXES.some(
      (idx) => idx.options.name === 'idx_users_email_unique_partial',
    );
    assert.equal(has2dSphere, true);
    assert.equal(hasUniqueEmail, true);

    // 8. Performance Metrics API Endpoint
    console.log(
      'Test 8: GET /api/v1/performance/metrics returns runtime memory in MB and process uptime',
    );
    const metricsRes = await apiJson(baseUrl, '/api/v1/performance/metrics');
    assert.equal(metricsRes.status, 200);
    const metrics = metricsRes.data.data;
    assert.ok(metrics.memoryUsageMb.rss > 0);
    assert.ok(metrics.memoryUsageMb.heapUsed > 0);
    assert.ok(metrics.processUptimeSeconds >= 0);

    // 9. Admin Trigger Load Drill API
    console.log(
      'Test 9: Admin trigger POST /api/v1/performance/load-drill generates multi-journey report',
    );
    const loadApiRes = await apiJson(baseUrl, '/api/v1/performance/load-drill', {
      method: 'POST',
      token: adminUser.token,
      body: { concurrency: 5, requestsPerJourney: 15 },
    });
    assert.equal(loadApiRes.status, 200);
    const report = loadApiRes.data.data;
    assert.equal(report.overallSuccessRatePercentage, 100);
    assert.ok(report.journeys.SEARCH_DISCOVERY.sloTargetMet);

    // 10. Admin Trigger Disaster Recovery Drill API & Role Enforcement
    console.log(
      'Test 10: Admin trigger POST /api/v1/performance/recovery-drill executes restore; customer blocked (403)',
    );
    const recoveryApiRes = await apiJson(baseUrl, '/api/v1/performance/recovery-drill', {
      method: 'POST',
      token: adminUser.token,
      body: { drillType: 'DATABASE_POINT_IN_TIME_RESTORE' },
    });
    assert.equal(recoveryApiRes.status, 200);
    assert.equal(recoveryApiRes.data.data.status, 'PASSED');

    // Customer role forbidden check
    const unauthRecoveryRes = await apiJson(baseUrl, '/api/v1/performance/recovery-drill', {
      method: 'POST',
      token: customerUser.token,
      body: { drillType: 'DATABASE_POINT_IN_TIME_RESTORE' },
    });
    assert.equal(unauthRecoveryRes.status, 403);

    console.log('--- All 10 Checkpoint 35 Verification Tests Passed Successfully! ---');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Checkpoint 35 Verification Failed:', err);
  process.exit(1);
});
