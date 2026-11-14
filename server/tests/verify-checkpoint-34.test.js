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
const { InMemoryPrivacyStore } = require('../dist/modules/privacy/privacy.store.js');
const { PrivacyService } = require('../dist/modules/privacy/privacy.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4034',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp34_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp34!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp34!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp34!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp34!',
    },
    { serviceName: 'bhojora-test-cp34', serviceVersion: '0.1.0' },
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
  return { status: response.status, ok: response.ok, data, headers: response.headers };
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
  return { userId, token, role, email };
}

async function runTests() {
  console.log('--- Starting Checkpoint 34 Security & Privacy Hardening Verification Suite ---');

  const config = createTestConfig();
  const logger = createLogger({ level: 'error', service: 'test-cp34', environment: 'test' });
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const rbacStore = new InMemoryRbacStore();
  const privacyStore = new InMemoryPrivacyStore();
  const privacyService = new PrivacyService(privacyStore, identityStore);

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    privacyStore,
    privacyService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const adminUser = await registerAndLogin(
      baseUrl,
      identityStore,
      '+919830000034',
      'SUPER_ADMIN',
      rbacStore,
    );
    const customerUser = await registerAndLogin(
      baseUrl,
      identityStore,
      '+919830000134',
      'CUSTOMER',
      rbacStore,
    );

    // 1. DSR: Access and Data Export
    console.log('Test 1: DPDP Access & Export request gathers subject data with masked PII');
    const exportReqRes = await apiJson(baseUrl, '/api/v1/privacy/requests', {
      method: 'POST',
      token: customerUser.token,
      body: { requestType: 'ACCESS_EXPORT' },
    });
    assert.equal(exportReqRes.status, 201);
    const exportData = exportReqRes.data.data;
    assert.equal(exportData.requestType, 'ACCESS_EXPORT');
    assert.equal(exportData.status, 'COMPLETED');
    assert.ok(exportData.exportData.subject.phoneMasked.includes('****'));
    assert.ok(exportData.exportData.redactedFields.includes('passwordHash'));

    // 2. DSR: History verification
    console.log('Test 2: User can inspect personal DSR submission history');
    const historyRes = await apiJson(baseUrl, '/api/v1/privacy/requests/me', {
      token: customerUser.token,
    });
    assert.equal(historyRes.status, 200);
    assert.equal(historyRes.data.data.requests.length, 1);

    // 3. User Consent Management
    console.log('Test 3: User can view and update granular consent preferences');
    const initialConsentRes = await apiJson(baseUrl, '/api/v1/privacy/consent/me', {
      token: customerUser.token,
    });
    assert.equal(initialConsentRes.status, 200);
    assert.equal(initialConsentRes.data.data.essentialService, true);

    const updateConsentRes = await apiJson(baseUrl, '/api/v1/privacy/consent', {
      method: 'POST',
      token: customerUser.token,
      body: {
        orderTrackingGps: true,
        marketingSmsEmail: false,
        analyticsCookies: true,
      },
    });
    assert.equal(updateConsentRes.status, 200);
    assert.equal(updateConsentRes.data.data.analyticsCookies, true);

    // 4. DSR: Right to Erasure ("Forget Me")
    console.log('Test 4: DPDP Right to Erasure anonymizes identity and suspends credentials');
    const erasureUser = await registerAndLogin(
      baseUrl,
      identityStore,
      '+919830000999',
      'CUSTOMER',
      rbacStore,
    );
    const erasureRes = await apiJson(baseUrl, '/api/v1/privacy/requests', {
      method: 'POST',
      token: erasureUser.token,
      body: { requestType: 'ERASURE_FORGET_ME' },
    });
    assert.equal(erasureRes.status, 201);
    assert.equal(erasureRes.data.data.status, 'COMPLETED');

    // Verify account is anonymized and locked out
    const erasedUserRecord = await identityStore.findUserById(erasureUser.userId);
    assert.equal(erasedUserRecord.name, 'Deleted User');
    assert.equal(erasedUserRecord.status, 'SUSPENDED');

    // Attempting login with erased account should fail (401 or 403 account suspended)
    const reLoginRes = await apiJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: erasureUser.email,
        password: TEST_PASSWORD,
      },
    });
    assert.ok(reLoginRes.status === 401 || reLoginRes.status === 403);

    // 5. Admin Data Retention Purge
    console.log(
      'Test 5: Admin executes data retention purge for stale telemetry and expired tokens',
    );
    const purgeRes = await apiJson(baseUrl, '/api/v1/privacy/admin/retention-purge', {
      method: 'POST',
      token: adminUser.token,
      body: { retentionDays: 30 },
    });
    assert.equal(purgeRes.status, 200);
    assert.ok(purgeRes.data.data.purgedGpsPoints > 0);
    assert.ok(purgeRes.data.data.thresholdDate);

    // 6. Admin Security Incident Response & CERT-In Reporting Threshold
    console.log(
      'Test 6: Critical P0 security incident automatically flags mandatory 6-hour CERT-In reporting',
    );
    const incidentRes = await apiJson(baseUrl, '/api/v1/privacy/admin/incident', {
      method: 'POST',
      token: adminUser.token,
      body: {
        severity: 'P0_CRITICAL',
        title: 'Simulated Data Boundary Violation Drill',
        summary:
          'Penetration testing validation of containment and forensic notification triggers.',
        affectedScope: ['test_tenant_a'],
      },
    });
    assert.equal(incidentRes.status, 201);
    const incident = incidentRes.data.data;
    assert.equal(incident.severity, 'P0_CRITICAL');
    assert.equal(incident.certInReportRequired, true);

    // 7. Admin Access Review Verification
    console.log(
      'Test 7: Admin access review verifies MFA compliance for privileged operator roles',
    );
    const accessReviewRes = await apiJson(baseUrl, '/api/v1/privacy/admin/access-review', {
      token: adminUser.token,
    });
    assert.equal(accessReviewRes.status, 200);
    assert.equal(accessReviewRes.data.data.allCompliant, true);
    assert.ok(accessReviewRes.data.data.mfaEnforcedRoles.includes('SUPER_ADMIN'));

    // 8. Least Privilege: Customer role blocked from admin controls
    console.log(
      'Test 8: Customer role strictly prohibited from accessing admin privacy governance (403)',
    );
    const unauthPurgeRes = await apiJson(baseUrl, '/api/v1/privacy/admin/retention-purge', {
      method: 'POST',
      token: customerUser.token,
      body: { retentionDays: 30 },
    });
    assert.equal(unauthPurgeRes.status, 403);

    // 9. Security Headers Enforcement (Helmet)
    console.log('Test 9: HTTP security headers enforced across all responses');
    const headerCheckRes = await fetch(`${baseUrl}/health`);
    assert.equal(headerCheckRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(headerCheckRes.headers.get('x-frame-options'), 'DENY');

    // 10. Malformed payload & injection barrier
    console.log(
      'Test 10: Malformed input and invalid request payloads rejected with 400 validation error',
    );
    const malformedDsrRes = await apiJson(baseUrl, '/api/v1/privacy/requests', {
      method: 'POST',
      token: customerUser.token,
      body: { requestType: 'INVALID_TYPE_ATTEMPT' },
    });
    assert.equal(malformedDsrRes.status, 400);
    assert.equal(malformedDsrRes.data.error.code, 'VALIDATION_ERROR');

    console.log('--- All 10 Checkpoint 34 Verification Tests Passed Successfully! ---');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Checkpoint 34 Verification Failed:', err);
  process.exit(1);
});
