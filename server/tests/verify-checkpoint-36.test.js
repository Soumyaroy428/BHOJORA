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
const { InMemoryComplianceStore } = require('../dist/modules/compliance/compliance.store.js');
const { ComplianceService } = require('../dist/modules/compliance/compliance.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4036',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp36_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp36!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp36!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp36!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp36!',
    },
    { serviceName: 'bhojora-test-cp36', serviceVersion: '0.1.0' },
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
  console.log('--- Starting Checkpoint 36 Compliance & Launch Readiness Verification Suite ---');

  const config = createTestConfig();
  const logger = createLogger({
    level: 'error',
    service: 'cp36-test',
    environment: 'test',
  });

  const identityStore = new InMemoryIdentityStore();
  const rbacStore = new InMemoryRbacStore();
  const complianceStore = new InMemoryComplianceStore();
  const complianceService = new ComplianceService(complianceStore);

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
    complianceStore,
    complianceService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;

  try {
    // Bootstrap Admin and Customer users
    const adminAuth = await registerAndLogin(
      baseUrl,
      identityStore,
      rbacStore,
      '+919900036001',
      'SUPER_ADMIN',
    );
    const customerAuth = await registerAndLogin(
      baseUrl,
      identityStore,
      rbacStore,
      '+919900036002',
      'CUSTOMER',
    );

    // Test 1: FSSAI verification service distinguishes Central, State, and Registration
    console.log(
      'Test 1: FSSAI 14-digit format validation distinguishes central, state license, and registration',
    );
    const fssaiCentral = complianceService.verifyFssai({ fssaiNumber: '11924001000123' });
    assert.equal(fssaiCentral.isValid, true);
    assert.equal(fssaiCentral.licenseType, 'CENTRAL_LICENSE');
    assert.equal(fssaiCentral.stateCode, '19');

    const fssaiState = complianceService.verifyFssai({ fssaiNumber: '21924002000456' });
    assert.equal(fssaiState.isValid, true);
    assert.equal(fssaiState.licenseType, 'STATE_LICENSE');

    const fssaiReg = complianceService.verifyFssai({ fssaiNumber: '31924003000789' });
    assert.equal(fssaiReg.isValid, true);
    assert.equal(fssaiReg.licenseType, 'REGISTRATION');

    // Test 2: Invalid FSSAI formats rejected via API endpoint
    console.log('Test 2: Invalid FSSAI formats are rejected with descriptive validation error');
    const invalidFssaiRes = await apiJson(baseUrl, '/compliance/verify/fssai', {
      method: 'POST',
      body: { fssaiNumber: '123' }, // Too short
    });
    assert.equal(invalidFssaiRes.status, 400);
    assert.equal(invalidFssaiRes.data.success, false);

    const validFssaiApiRes = await apiJson(baseUrl, '/compliance/verify/fssai', {
      method: 'POST',
      body: { fssaiNumber: '11924001000123' },
    });
    assert.equal(validFssaiApiRes.status, 200);
    assert.equal(validFssaiApiRes.data.data.isValid, true);
    assert.equal(validFssaiApiRes.data.data.stateCode, '19');

    // Test 3: GSTIN 15-character verification validates state jurisdiction and PAN structure
    console.log(
      'Test 3: GSTIN 15-character verification validates state jurisdiction and PAN structure',
    );
    const validGstinRes = await apiJson(baseUrl, '/compliance/verify/gstin', {
      method: 'POST',
      body: { gstin: '19AAACB1234F1Z5' },
    });
    assert.equal(validGstinRes.status, 200);
    assert.equal(validGstinRes.data.data.isValid, true);
    assert.equal(validGstinRes.data.data.stateCode, '19'); // West Bengal
    assert.equal(validGstinRes.data.data.panNumber, 'AAACB1234F');

    const invalidGstinRes = await apiJson(baseUrl, '/compliance/verify/gstin', {
      method: 'POST',
      body: { gstin: 'INVALID_GSTIN_123' },
    });
    assert.equal(invalidGstinRes.status, 400);
    assert.equal(invalidGstinRes.data.success, false);

    // Test 4: Initial statutory checklist items verify all regulatory domains
    console.log(
      'Test 4: Initial statutory checklist items verify FSSAI, Consumer Protection, DPDP, RBI escrow, GST Sec 9(5), and gig worker rights',
    );
    const checkItems = await complianceStore.listCheckItems();
    assert.ok(checkItems.length >= 7);
    const domainList = checkItems.map((c) => c.domain);
    assert.ok(domainList.includes('FSSAI_FOOD_SAFETY'));
    assert.ok(domainList.includes('E_COMMERCE_CONSUMER_PROTECTION'));
    assert.ok(domainList.includes('DPDP_PRIVACY'));
    assert.ok(domainList.includes('PAYMENT_ESCROW_RBI'));
    assert.ok(domainList.includes('GST_TAXATION'));
    assert.ok(domainList.includes('GIG_WORKFORCE_LABOR'));
    assert.ok(domainList.includes('INSPECTOR_ACCREDITATION'));

    // Test 5: Launch readiness dossier without complete adviser sign-offs reports BLOCKED_WITH_GAPS
    console.log(
      'Test 5: Launch readiness dossier without complete adviser sign-offs reports BLOCKED_WITH_GAPS',
    );
    const uncertifiedDossier = await complianceService.getLaunchReadinessDossier();
    assert.equal(uncertifiedDossier.status, 'BLOCKED_WITH_GAPS');
    assert.ok(uncertifiedDossier.blockers.length > 0);
    assert.ok(uncertifiedDossier.readinessScorePercent < 100);

    // Test 6: Authorized admin can submit qualified adviser sign-off with audit checksum
    console.log(
      'Test 6: Authorized admin can submit qualified adviser sign-off with audit checksum',
    );
    const signOffRes = await apiJson(baseUrl, '/compliance/sign-offs', {
      method: 'POST',
      token: adminAuth.token,
      body: {
        domain: 'FSSAI_FOOD_SAFETY',
        adviserName: 'Dr. Debabrata Banerjee',
        professionalRegistrationNo: 'FSSAI-AUD-2023-WB-1094',
        firmOrAgency: 'Eastern India Food Safety & Hygiene Certification Bureau',
        status: 'CERTIFIED',
        remarks:
          'Mandatory hygiene protocols and kitchen inspection checklists certified compliant.',
        validityDays: 180,
      },
    });
    assert.equal(signOffRes.status, 201);
    assert.equal(signOffRes.data.data.domain, 'FSSAI_FOOD_SAFETY');
    assert.ok(typeof signOffRes.data.data.auditChecksum === 'string');
    assert.equal(signOffRes.data.data.auditChecksum.length, 64); // SHA-256

    // Test 7: Tamper-evident SHA-256 checksum uniquely identifies each adviser certification
    console.log(
      'Test 7: Tamper-evident SHA-256 checksum uniquely identifies each adviser certification',
    );
    const retrievedSignOff = await complianceStore.getSignOffByDomain('FSSAI_FOOD_SAFETY');
    assert.ok(retrievedSignOff !== null);
    assert.equal(retrievedSignOff.auditChecksum, signOffRes.data.data.auditChecksum);

    // Test 8: Seeding complete certified pilot dossier transitions status to READY_FOR_PILOT
    console.log(
      'Test 8: Seeding complete certified pilot dossier transitions status to READY_FOR_PILOT',
    );
    const seedRes = await apiJson(baseUrl, '/compliance/admin/seed-pilot-certifications', {
      method: 'POST',
      token: adminAuth.token,
    });
    assert.equal(seedRes.status, 200);
    assert.equal(seedRes.data.data.status, 'READY_FOR_PILOT');
    assert.equal(seedRes.data.data.readinessScorePercent, 100);
    assert.equal(seedRes.data.data.blockers.length, 0);
    assert.equal(
      seedRes.data.data.mandatoryDomainsCovered,
      seedRes.data.data.totalMandatoryDomains,
    );
    assert.ok(seedRes.data.data.officers.grievanceOfficer.name.includes('Soumya Roy'));

    // Test 9: Public / unauthenticated endpoint GET /api/v1/compliance/readiness returns readiness summary
    console.log(
      'Test 9: Public / unauthenticated endpoint GET /api/v1/compliance/readiness returns readiness summary and blocker counts',
    );
    const publicReadinessRes = await apiJson(baseUrl, '/compliance/readiness');
    assert.equal(publicReadinessRes.status, 200);
    assert.equal(publicReadinessRes.data.data.status, 'READY_FOR_PILOT');
    assert.equal(publicReadinessRes.data.data.readinessScorePercent, 100);
    assert.equal(publicReadinessRes.data.data.blockersCount, 0);

    // Test 10: Non-admin users are strictly blocked (403 FORBIDDEN) from submitting adviser sign-offs or pilot seeds
    console.log(
      'Test 10: Non-admin users are strictly blocked (403 FORBIDDEN) from submitting adviser sign-offs or pilot seeds',
    );
    const customerSignOffRes = await apiJson(baseUrl, '/compliance/sign-offs', {
      method: 'POST',
      token: customerAuth.token,
      body: {
        domain: 'GST_TAXATION',
        adviserName: 'Fraudulent Adviser',
        professionalRegistrationNo: 'FAKE-123',
        firmOrAgency: 'No Agency',
        status: 'CERTIFIED',
        remarks: 'Unauthorized attempt',
      },
    });
    assert.equal(customerSignOffRes.status, 403);
    assert.equal(customerSignOffRes.data.success, false);

    const customerSeedRes = await apiJson(baseUrl, '/compliance/admin/seed-pilot-certifications', {
      method: 'POST',
      token: customerAuth.token,
    });
    assert.equal(customerSeedRes.status, 403);
    assert.equal(customerSeedRes.data.success, false);

    console.log('--- All 10 Checkpoint 36 Verification Tests Passed Successfully! ---');
  } finally {
    server.close();
  }
}

run().catch((error) => {
  console.error('Checkpoint 36 verification failed:', error);
  process.exit(1);
});
