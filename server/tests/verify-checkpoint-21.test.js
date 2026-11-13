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
const { InMemoryInspectorStore } = require('../dist/modules/inspector/inspector.store.js');
const { InspectorService } = require('../dist/modules/inspector/inspector.service.js');
const {
  INSPECTOR_STATUSES_RUNTIME,
  CONFLICT_TYPES_RUNTIME,
  CERTIFICATE_TYPES_RUNTIME,
} = require('../dist/modules/inspector/inspector.types.js');

const TEST_PASSWORD = 'Bhojora#Inspector2026';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4021',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp21_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp21!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp21!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp21!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp21!',
    },
    { serviceName: 'bhojora-test-cp21', serviceVersion: '0.1.0' },
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
  assert.equal(res.status, 201, `Failed registering ${email}: ${JSON.stringify(res.json)}`);
  return {
    userId: res.json.data.user.id,
    token: res.json.data.tokens.accessToken,
  };
}

async function createAdminUser(baseUrl, identityStore, email, phone, name, role = 'TRUST_ADMIN') {
  const reg = await registerCustomer(baseUrl, email, phone, name);
  await identityStore.updateUser(reg.userId, { roles: [role] }, new Date());
  const loginRes = await apiJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: { identifier: email, password: TEST_PASSWORD },
  });
  assert.equal(loginRes.status, 200);
  return {
    userId: reg.userId,
    token: loginRes.json.data.tokens.accessToken,
  };
}

async function runVerification() {
  console.log('=== RUNNING CHECKPOINT 21 VERIFICATION TEST SUITE ===');

  const config = createTestConfig();
  const logger = createLogger({
    level: 'error',
    service: 'bhojora-test-cp21',
    environment: 'test',
    includeStack: false,
  });

  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({
    config,
    store: identityStore,
    otpAdapter,
    logger,
  });
  const rbacStore = new InMemoryRbacStore();
  const inspectorStore = new InMemoryInspectorStore();
  const inspectorService = new InspectorService({
    inspectorStore,
    identityStore,
    rbacStore,
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    inspectorStore,
    inspectorService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 4021;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // ------------------------------------------------------------------------
    console.log('Test 1: Baseline types, contracts & runtime enum integrity...');
    assert.ok(INSPECTOR_STATUSES_RUNTIME.includes('APPLIED'));
    assert.ok(INSPECTOR_STATUSES_RUNTIME.includes('APPROVED'));
    assert.ok(CONFLICT_TYPES_RUNTIME.includes('PREVIOUS_EMPLOYMENT'));
    assert.ok(CONFLICT_TYPES_RUNTIME.includes('FINANCIAL_INTEREST'));
    assert.ok(CERTIFICATE_TYPES_RUNTIME.includes('FSSAI_FOSTAC'));
    console.log('✓ Test 1 passed.');

    // ------------------------------------------------------------------------
    console.log('Test 2: Inspector application submission with credentials & conflicts...');
    const candidate1 = await registerCustomer(
      baseUrl,
      'inspector1@bhojora.test',
      '+919830111111',
      'Dr. Indrani Sen',
    );

    const applyRes = await apiJson(baseUrl, '/inspectors/apply', {
      method: 'POST',
      token: candidate1.token,
      body: {
        fullName: 'Dr. Indrani Sen',
        phone: '+919830111111',
        cityCode: 'KOLKATA',
        certifications: [
          {
            certificateType: 'FSSAI_FOSTAC',
            certificateNumber: 'FSSAI-WB-2024-001',
            issuingAuthority: 'FSSAI Eastern Regional Office',
            issuedAt: '2024-01-01T00:00:00.000Z',
            expiresAt: '2028-12-31T00:00:00.000Z',
          },
        ],
        conflicts: [
          {
            restaurantId: 'rest_conflict_01',
            outletId: 'out_conflict_01',
            conflictType: 'PREVIOUS_EMPLOYMENT',
            description: 'Served as quality consultant for Outlet 01 in 2023',
          },
        ],
      },
    });

    assert.equal(applyRes.status, 201, `Apply failed: ${JSON.stringify(applyRes.json)}`);
    const inspector1 = applyRes.json.data.profile;
    assert.equal(inspector1.status, 'APPLIED');
    assert.equal(inspector1.fullName, 'Dr. Indrani Sen');
    assert.equal(inspector1.cityCode, 'KOLKATA');
    assert.ok(inspector1.badgeNumber.startsWith('INS-WB-'));
    assert.equal(inspector1.certifications.length, 1);
    assert.equal(inspector1.conflicts.length, 1);
    console.log('✓ Test 2 passed.');

    // ------------------------------------------------------------------------
    console.log('Test 3: Duplicate application prevention (409 CONFLICT)...');
    const duplicateRes = await apiJson(baseUrl, '/inspectors/apply', {
      method: 'POST',
      token: candidate1.token,
      body: {
        fullName: 'Dr. Indrani Sen',
        phone: '+919830111111',
        certifications: [
          {
            certificateType: 'FSSAI_FOSTAC',
            certificateNumber: 'FSSAI-WB-2024-001',
            issuingAuthority: 'FSSAI Eastern Regional Office',
            issuedAt: '2024-01-01T00:00:00.000Z',
            expiresAt: '2028-12-31T00:00:00.000Z',
          },
        ],
      },
    });
    assert.equal(duplicateRes.status, 409);
    console.log('✓ Test 3 passed.');

    // ------------------------------------------------------------------------
    console.log('Test 4: Self-profile retrieval and dynamic conflict update...');
    const meRes = await apiJson(baseUrl, '/inspectors/me', {
      method: 'GET',
      token: candidate1.token,
    });
    assert.equal(meRes.status, 200);
    assert.equal(meRes.json.data.profile.id, inspector1.id);

    const updateConflictRes = await apiJson(baseUrl, '/inspectors/me/conflicts', {
      method: 'PUT',
      token: candidate1.token,
      body: {
        conflicts: [
          {
            restaurantId: 'rest_conflict_01',
            outletId: 'out_conflict_01',
            conflictType: 'PREVIOUS_EMPLOYMENT',
            description: 'Served as quality consultant for Outlet 01 in 2023',
          },
          {
            restaurantId: 'rest_conflict_02',
            conflictType: 'FAMILY_RELATION',
            description: 'First-degree relative owns franchise',
          },
        ],
      },
    });
    assert.equal(updateConflictRes.status, 200);
    assert.equal(updateConflictRes.json.data.profile.conflicts.length, 2);
    console.log('✓ Test 4 passed.');

    // ------------------------------------------------------------------------
    console.log('Test 5: Unauthorized access controls...');
    // Unauthenticated request
    const unauthRes = await apiJson(baseUrl, '/inspectors/me');
    assert.equal(unauthRes.status, 401);

    // Regular non-inspector candidate fetching profile before applying
    const randomUser = await registerCustomer(
      baseUrl,
      'random@bhojora.test',
      '+919830222222',
      'Regular User',
    );
    const notFoundRes = await apiJson(baseUrl, '/inspectors/me', {
      method: 'GET',
      token: randomUser.token,
    });
    assert.equal(notFoundRes.status, 404);

    // Regular user attempting admin inspection list
    const forbiddenAdminRes = await apiJson(baseUrl, '/admin/inspectors', {
      method: 'GET',
      token: randomUser.token,
    });
    assert.equal(forbiddenAdminRes.status, 403);
    console.log('✓ Test 5 passed.');

    // ------------------------------------------------------------------------
    console.log('Test 6: Anti-Self-Review Enforcement (ADR-005)...');
    const adminUser = await createAdminUser(
      baseUrl,
      identityStore,
      'admin_reviewer@bhojora.test',
      '+919830333333',
      'Trust Admin Roy',
      'TRUST_ADMIN',
    );

    // Admin applies as an inspector
    const adminApplyRes = await apiJson(baseUrl, '/inspectors/apply', {
      method: 'POST',
      token: adminUser.token,
      body: {
        fullName: 'Trust Admin Roy',
        phone: '+919830333333',
        certifications: [
          {
            certificateType: 'FOOD_SAFETY_AUDITOR',
            certificateNumber: 'FSA-2024-99',
            issuingAuthority: 'Quality Council of India',
            issuedAt: '2024-01-01T00:00:00.000Z',
            expiresAt: '2029-01-01T00:00:00.000Z',
          },
        ],
      },
    });
    assert.equal(adminApplyRes.status, 201);
    const adminInspectorProfile = adminApplyRes.json.data.profile;

    // Admin attempts to self-approve their own inspector application
    const selfReviewRes = await apiJson(
      baseUrl,
      `/admin/inspectors/${adminInspectorProfile.id}/review`,
      {
        method: 'POST',
        token: adminUser.token,
        body: { decision: 'APPROVE' },
      },
    );
    assert.equal(selfReviewRes.status, 403);
    assert.equal(selfReviewRes.json.error.code, 'SELF_REVIEW_PROHIBITED');
    console.log('✓ Test 6 passed.');

    // ------------------------------------------------------------------------
    console.log('Test 7: Admin review - certification validity enforcement...');
    // Candidate with expired certificate
    const expiredCandidate = await registerCustomer(
      baseUrl,
      'expired@bhojora.test',
      '+919830444444',
      'Expired Cert User',
    );
    const expiredApplyRes = await apiJson(baseUrl, '/inspectors/apply', {
      method: 'POST',
      token: expiredCandidate.token,
      body: {
        fullName: 'Expired Cert User',
        phone: '+919830444444',
        certifications: [
          {
            certificateType: 'ISO_22000',
            certificateNumber: 'ISO-2018-001',
            issuingAuthority: 'Bureau Veritas',
            issuedAt: '2018-01-01T00:00:00.000Z',
            expiresAt: '2021-01-01T00:00:00.000Z', // Expired!
          },
        ],
      },
    });
    assert.equal(expiredApplyRes.status, 201);
    const expiredInspectorId = expiredApplyRes.json.data.profile.id;

    // Admin attempts to approve expired candidate -> 422
    const approveExpiredRes = await apiJson(
      baseUrl,
      `/admin/inspectors/${expiredInspectorId}/review`,
      {
        method: 'POST',
        token: adminUser.token,
        body: { decision: 'APPROVE' },
      },
    );
    assert.equal(approveExpiredRes.status, 422);
    console.log('✓ Test 7 passed.');

    // ------------------------------------------------------------------------
    console.log('Test 8: Admin approval workflow & role transition...');
    // Admin approves candidate1 (valid certs, different user)
    const approveRes = await apiJson(baseUrl, `/admin/inspectors/${inspector1.id}/review`, {
      method: 'POST',
      token: adminUser.token,
      body: { decision: 'APPROVE' },
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.json.data.profile.status, 'APPROVED');
    assert.equal(approveRes.json.data.profile.approvedByAdminId, adminUser.userId);

    // Verify user role was upgraded to INSPECTOR in identityStore
    const candidateUser = await identityStore.findUserById(candidate1.userId);
    assert.ok(candidateUser.roles.includes('INSPECTOR'), 'User must have INSPECTOR role');
    console.log('✓ Test 8 passed.');

    // ------------------------------------------------------------------------
    console.log('Test 9: Admin rejection and suspension workflows...');
    // Rejection of expired candidate
    const rejectRes = await apiJson(baseUrl, `/admin/inspectors/${expiredInspectorId}/review`, {
      method: 'POST',
      token: adminUser.token,
      body: { decision: 'REJECT', reason: 'Statutory certificate expired' },
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.json.data.profile.status, 'REJECTED');
    assert.equal(rejectRes.json.data.profile.rejectionReason, 'Statutory certificate expired');

    // Suspension of candidate1
    const suspendRes = await apiJson(baseUrl, `/admin/inspectors/${inspector1.id}/review`, {
      method: 'POST',
      token: adminUser.token,
      body: { decision: 'SUSPEND', reason: 'Routine compliance audit pending' },
    });
    assert.equal(suspendRes.status, 200);
    assert.equal(suspendRes.json.data.profile.status, 'SUSPENDED');

    // Re-approve candidate1
    const reApproveRes = await apiJson(baseUrl, `/admin/inspectors/${inspector1.id}/review`, {
      method: 'POST',
      token: adminUser.token,
      body: { decision: 'APPROVE' },
    });
    assert.equal(reApproveRes.status, 200);
    assert.equal(reApproveRes.json.data.profile.status, 'APPROVED');
    console.log('✓ Test 9 passed.');

    // ------------------------------------------------------------------------
    console.log('Test 10: Assignment eligibility engine (conflicts & status)...');
    // 10A: Clean outlet with no conflicts -> eligible: true
    const cleanCheckRes = await apiJson(
      baseUrl,
      `/admin/inspectors/${inspector1.id}/eligibility-check`,
      {
        method: 'POST',
        token: adminUser.token,
        body: { outletId: 'out_clean_99', restaurantId: 'rest_clean_99' },
      },
    );
    assert.equal(cleanCheckRes.status, 200);
    assert.equal(cleanCheckRes.json.data.eligible, true);
    assert.equal(cleanCheckRes.json.data.reasons.length, 0);

    // 10B: Declared conflict outlet (out_conflict_01) -> eligible: false
    const conflictCheckRes = await apiJson(
      baseUrl,
      `/admin/inspectors/${inspector1.id}/eligibility-check`,
      {
        method: 'POST',
        token: adminUser.token,
        body: { outletId: 'out_conflict_01', restaurantId: 'rest_conflict_01' },
      },
    );
    assert.equal(conflictCheckRes.status, 200);
    assert.equal(conflictCheckRes.json.data.eligible, false);
    assert.ok(
      conflictCheckRes.json.data.reasons.some((r) => r.startsWith('CONFLICT_OF_INTEREST_DECLARED')),
    );

    // 10C: Rejected or unapproved inspector eligibility -> eligible: false
    const unapprovedCheckRes = await apiJson(
      baseUrl,
      `/admin/inspectors/${expiredInspectorId}/eligibility-check`,
      {
        method: 'POST',
        token: adminUser.token,
        body: { outletId: 'out_clean_99' },
      },
    );
    assert.equal(unapprovedCheckRes.status, 200);
    assert.equal(unapprovedCheckRes.json.data.eligible, false);
    assert.ok(
      unapprovedCheckRes.json.data.reasons.some((r) => r.startsWith('INSPECTOR_NOT_APPROVED')),
    );

    console.log('✓ Test 10 passed.');

    console.log('--- ALL CHECKPOINT 21 VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  } finally {
    server.close();
  }
}

runVerification().catch((err) => {
  console.error('Checkpoint 21 verification FAILED:', err);
  process.exit(1);
});
