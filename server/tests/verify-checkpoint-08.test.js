'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const mongoose = require('mongoose');

const { validateEnv } = require('../dist/config/env.js');
const { createLogger } = require('../dist/config/logger.js');
const { createApp } = require('../dist/app.js');
const { COLLECTION_NAMES } = require('../dist/database/conventions.js');
const { INITIAL_DATABASE_INDEXES } = require('../dist/database/indexes.js');
const { InMemoryIdentityStore } = require('../dist/modules/identity/identity.models.js');
const {
  InMemoryTestOtpAdapter,
  SafeLogOtpSenderAdapter,
} = require('../dist/modules/identity/otp.adapter.js');
const { IdentityService } = require('../dist/modules/identity/identity.service.js');
const {
  PERMISSION_CATALOG,
  PRIVILEGED_MFA_ROLES,
  TENANT_MEMBERSHIP_ROLES,
  TENANT_MEMBERSHIP_STATUSES,
  ROLE_PERMISSION_MATRIX,
} = require('../dist/modules/rbac/rbac.policy.js');
const {
  InMemoryRbacStore,
  createMongooseRbacModels,
} = require('../dist/modules/rbac/rbac.store.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function createTestConfig() {
  return validateEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '4000',
    LOG_LEVEL: 'info',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000,https://bhojora.vercel.app',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-chars-0001',
    JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-chars-0002',
  });
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'Ephemeral HTTP port required');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function apiJson(baseUrl, routePath, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(`${baseUrl}/api/v1${routePath}`, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const json = await response.json();
  return { status: response.status, json };
}

async function registerAndLoginWithRoles({ baseUrl, identityStore, name, email, phone, roles }) {
  const password = 'Bhojora#User2026';
  const reg = await apiJson(baseUrl, '/auth/register', {
    method: 'POST',
    body: {
      name,
      email,
      phone,
      password,
      acceptTerms: true,
    },
  });
  assert.equal(reg.status, 201);
  const userId = reg.json.data.user.id;
  if (roles && roles.length > 0) {
    await identityStore.updateUser(userId, { roles }, new Date());
  }
  const login = await apiJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: { identifier: email, password },
  });
  assert.equal(login.status, 200);
  return {
    userId,
    accessToken: login.json.data.tokens.accessToken,
    refreshToken: login.json.data.tokens.refreshToken,
  };
}

async function performStepUpMfa(baseUrl, accessToken, otpAdapter) {
  const sendRes = await apiJson(baseUrl, '/auth/mfa/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(sendRes.status, 200);
  const msg = otpAdapter.getLatestMessage();
  assert.ok(msg && /^\d{6}$/.test(msg.code), 'MFA challenge OTP must be dispatched via adapter');
  return { challengeId: sendRes.json.data.challengeId, code: msg.code };
}

async function main() {
  console.log('--- Starting Checkpoint 08 RBAC & Tenant Isolation Suite ---');

  // 1. Verify contract parity between @bhojora/shared and server policy
  const sharedRbac = await import('../../client/shared/dist/contracts/rbac.js');
  assert.deepEqual([...PERMISSION_CATALOG], [...sharedRbac.PERMISSION_CATALOG]);
  assert.deepEqual([...PRIVILEGED_MFA_ROLES], [...sharedRbac.PRIVILEGED_MFA_ROLES]);
  assert.deepEqual([...TENANT_MEMBERSHIP_ROLES], [...sharedRbac.TENANT_MEMBERSHIP_ROLES]);
  assert.deepEqual([...TENANT_MEMBERSHIP_STATUSES], [...sharedRbac.TENANT_MEMBERSHIP_STATUSES]);
  assert.deepEqual(ROLE_PERMISSION_MATRIX, sharedRbac.ROLE_PERMISSION_MATRIX);

  assert.equal(
    ROLE_PERMISSION_MATRIX.FINANCE_ADMIN.includes('safety:score:publish'),
    false,
    'FINANCE_ADMIN must never hold safety score mutation permissions',
  );
  assert.equal(
    ROLE_PERMISSION_MATRIX.TRUST_ADMIN.includes('finance:refund:approve'),
    false,
    'TRUST_ADMIN must never hold payment/finance permissions',
  );

  // 2. Verify Mongoose models & database index coverage
  const mockConn = mongoose.createConnection();
  try {
    const rbacModels = createMongooseRbacModels(mockConn);
    assert.equal(rbacModels.RestaurantStaff.collection.name, COLLECTION_NAMES.restaurantStaff);
    assert.equal(rbacModels.AuditLog.collection.name, COLLECTION_NAMES.auditLogs);
  } finally {
    await mockConn.close();
  }
  const indexNames = INITIAL_DATABASE_INDEXES.map((spec) => spec.options.name);
  assert.ok(indexNames.includes('idx_restaurant_staff_user_restaurant_outlet_unique'));
  assert.ok(indexNames.includes('idx_restaurant_staff_outlet_status'));

  // 3. Full HTTP integration tests
  const config = createTestConfig();
  const loggerLines = [];
  const logger = createLogger({
    level: 'info',
    service: 'bhojora-api',
    environment: 'test',
    sink: (line) => loggerLines.push(line),
  });
  const identityStore = new InMemoryIdentityStore();
  const rbacStore = new InMemoryRbacStore();
  const testOtp = new InMemoryTestOtpAdapter();
  const safeOtp = new SafeLogOtpSenderAdapter(logger);
  const otpAdapter = {
    async sendOtp(msg) {
      await testOtp.sendOtp(msg);
      await safeOtp.sendOtp(msg);
    },
  };
  const identityService = new IdentityService({
    config,
    store: identityStore,
    otpAdapter,
    logger,
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
  });

  await withServer(app, async (baseUrl) => {
    const custA = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Customer Alpha',
      email: 'cust.a@example.com',
      phone: '+919830000101',
    });
    const custB = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Customer Beta',
      email: 'cust.b@example.com',
      phone: '+919830000102',
    });

    // IDOR test: Customer A can read own profile, forbidden on Customer B
    const ownProfile = await apiJson(baseUrl, `/rbac/customers/${custA.userId}/profile`, {
      headers: { Authorization: `Bearer ${custA.accessToken}` },
    });
    assert.equal(ownProfile.status, 200);
    assert.equal(ownProfile.json.data.id, custA.userId);

    const idorAttempt = await apiJson(baseUrl, `/rbac/customers/${custB.userId}/profile`, {
      headers: { Authorization: `Bearer ${custA.accessToken}` },
    });
    assert.equal(idorAttempt.status, 403);
    assert.equal(idorAttempt.json.error.code, 'FORBIDDEN');

    // Privilege escalation test: Customer spoofing X-Bhojora-Active-Role or calling /roles
    const spoofHeader = await apiJson(baseUrl, '/rbac/me', {
      headers: {
        Authorization: `Bearer ${custA.accessToken}`,
        'X-Bhojora-Active-Role': 'SUPER_ADMIN',
      },
    });
    assert.equal(spoofHeader.status, 403);

    const escalateAttempt = await apiJson(baseUrl, `/rbac/users/${custA.userId}/roles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${custA.accessToken}` },
      body: { roles: ['SUPER_ADMIN'], reason: 'Unauthorized self promotion attempt' },
    });
    assert.equal(escalateAttempt.status, 403);

    // Tenant isolation test across restaurants & outlets
    const ownerArsalan = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Arsalan Owner',
      email: 'owner.arsalan@example.com',
      phone: '+919830000103',
      roles: ['RESTAURANT_OWNER'],
    });
    const staffMember = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Park Circus Manager',
      email: 'manager.arsalan@example.com',
      phone: '+919830000104',
      roles: ['CUSTOMER'],
    });

    await rbacStore.upsertMembership({
      userId: ownerArsalan.userId,
      restaurantId: 'rest_arsalan',
      outletId: '*',
      role: 'RESTAURANT_OWNER',
      status: 'ACTIVE',
      grantedByUserId: 'system_seed',
      now: new Date(),
    });

    const ownOutlet = await apiJson(baseUrl, '/rbac/outlets/outlet_arsalan_pc/workspace', {
      headers: { Authorization: `Bearer ${ownerArsalan.accessToken}` },
    });
    assert.equal(ownOutlet.status, 200);
    assert.equal(ownOutlet.json.data.outlet.outletId, 'outlet_arsalan_pc');

    const crossOutletDenied = await apiJson(baseUrl, '/rbac/outlets/outlet_petercat_ps/workspace', {
      headers: { Authorization: `Bearer ${ownerArsalan.accessToken}` },
    });
    assert.equal(crossOutletDenied.status, 403);

    // Owner delegates manager within owned restaurant, blocked on rival restaurant
    const grantOwn = await apiJson(baseUrl, '/rbac/memberships', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerArsalan.accessToken}` },
      body: {
        userId: staffMember.userId,
        restaurantId: 'rest_arsalan',
        outletId: 'outlet_arsalan_pc',
        role: 'RESTAURANT_MANAGER',
      },
    });
    assert.equal(grantOwn.status, 200);

    const grantCrossRestaurant = await apiJson(baseUrl, '/rbac/memberships', {
      method: 'POST',
      headers: { Authorization: `Bearer ${ownerArsalan.accessToken}` },
      body: {
        userId: staffMember.userId,
        restaurantId: 'rest_petercat',
        outletId: 'outlet_petercat_ps',
        role: 'KITCHEN_STAFF',
      },
    });
    assert.equal(grantCrossRestaurant.status, 403);

    // Delegated manager with explicit role header accesses outlet_arsalan_pc, rejected on outlet_petercat_ps
    const managerOwn = await apiJson(baseUrl, '/rbac/outlets/outlet_arsalan_pc/workspace', {
      headers: {
        Authorization: `Bearer ${staffMember.accessToken}`,
        'X-Bhojora-Active-Role': 'RESTAURANT_MANAGER',
      },
    });
    assert.equal(managerOwn.status, 200);

    const managerCross = await apiJson(baseUrl, '/rbac/outlets/outlet_petercat_ps/workspace', {
      headers: {
        Authorization: `Bearer ${staffMember.accessToken}`,
        'X-Bhojora-Active-Role': 'RESTAURANT_MANAGER',
      },
    });
    assert.equal(managerCross.status, 403);

    // Delivery partner job IDOR isolation
    const riderA = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Rider Alpha',
      email: 'rider.a@example.com',
      phone: '+919830000105',
      roles: ['DELIVERY_PARTNER'],
    });
    const riderB = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Rider Beta',
      email: 'rider.b@example.com',
      phone: '+919830000106',
      roles: ['DELIVERY_PARTNER'],
    });
    await rbacStore.upsertDeliveryJob({
      jobId: 'job_rider_a',
      partnerId: riderA.userId,
      outletId: 'outlet_arsalan_pc',
      status: 'OUT_FOR_DELIVERY',
      payoutPaise: 6500,
    });
    await rbacStore.upsertDeliveryJob({
      jobId: 'job_rider_b',
      partnerId: riderB.userId,
      outletId: 'outlet_petercat_ps',
      status: 'OUT_FOR_DELIVERY',
      payoutPaise: 8500,
    });

    assert.equal(
      (
        await apiJson(baseUrl, '/rbac/delivery/jobs/job_rider_a', {
          headers: { Authorization: `Bearer ${riderA.accessToken}` },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await apiJson(baseUrl, '/rbac/delivery/jobs/job_rider_b', {
          headers: { Authorization: `Bearer ${riderA.accessToken}` },
        })
      ).status,
      403,
    );

    // Privileged MFA enforcement & Separation of Duties & Self-Approval Prevention
    const reviewerOne = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Reviewer One',
      email: 'reviewer1@bhojora.in',
      phone: '+919830000107',
      roles: ['INSPECTION_REVIEWER'],
    });
    const reviewerTwo = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Reviewer Two',
      email: 'reviewer2@bhojora.in',
      phone: '+919830000108',
      roles: ['INSPECTION_REVIEWER'],
    });
    const financeAdmin = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Finance Admin',
      email: 'finance@bhojora.in',
      phone: '+919830000109',
      roles: ['FINANCE_ADMIN'],
    });
    const trustAdmin = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Trust Admin',
      email: 'trust@bhojora.in',
      phone: '+919830000110',
      roles: ['TRUST_ADMIN'],
    });
    const superAdmin = await registerAndLoginWithRoles({
      baseUrl,
      identityStore,
      name: 'Super Admin',
      email: 'super@bhojora.in',
      phone: '+919830000111',
      roles: ['SUPER_ADMIN'],
    });

    await rbacStore.upsertInspection({
      inspectionId: 'insp_self_test',
      outletId: 'outlet_arsalan_pc',
      restaurantId: 'rest_arsalan',
      authoredByUserId: reviewerOne.userId,
      status: 'SUBMITTED',
    });

    // Privileged call WITHOUT MFA must fail with 403 MFA_REQUIRED
    const blockedNoMfa = await apiJson(baseUrl, '/rbac/inspections/insp_self_test/approve', {
      method: 'POST',
      headers: { Authorization: `Bearer ${reviewerTwo.accessToken}` },
    });
    assert.equal(blockedNoMfa.status, 403);
    assert.equal(blockedNoMfa.json.error.details[0].code, 'MFA_REQUIRED');

    // Verify wrong MFA code rejected + valid MFA code succeeds + replay rejected
    const r2Mfa = await performStepUpMfa(baseUrl, reviewerTwo.accessToken, testOtp);
    const badMfa = await apiJson(baseUrl, '/auth/mfa/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${reviewerTwo.accessToken}` },
      body: { challengeId: r2Mfa.challengeId, code: '000000' },
    });
    assert.equal(badMfa.status, 401);

    const okMfa = await apiJson(baseUrl, '/auth/mfa/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${reviewerTwo.accessToken}` },
      body: { challengeId: r2Mfa.challengeId, code: r2Mfa.code },
    });
    assert.equal(okMfa.status, 200);
    assert.equal(okMfa.json.data.session.mfaVerified, true);

    const replayMfa = await apiJson(baseUrl, '/auth/mfa/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${reviewerTwo.accessToken}` },
      body: { challengeId: r2Mfa.challengeId, code: r2Mfa.code },
    });
    assert.equal(replayMfa.status, 401);

    // Refresh preserves MFA assurance on active session
    const refreshed = await apiJson(baseUrl, '/auth/refresh', {
      method: 'POST',
      body: { refreshToken: reviewerTwo.refreshToken },
    });
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.json.data.session.mfaVerified, true);
    const r2VerifiedToken = refreshed.json.data.tokens.accessToken;

    // Step-up MFA for reviewerOne -> self-approval STILL forbidden!
    const r1Mfa = await performStepUpMfa(baseUrl, reviewerOne.accessToken, testOtp);
    assert.equal(
      (
        await apiJson(baseUrl, '/auth/mfa/verify', {
          method: 'POST',
          headers: { Authorization: `Bearer ${reviewerOne.accessToken}` },
          body: r1Mfa,
        })
      ).status,
      200,
    );
    const selfApprove = await apiJson(baseUrl, '/rbac/inspections/insp_self_test/approve', {
      method: 'POST',
      headers: { Authorization: `Bearer ${reviewerOne.accessToken}` },
    });
    assert.equal(selfApprove.status, 403);
    assert.equal(selfApprove.json.error.code, 'SELF_APPROVAL_PROHIBITED');

    // Independent MFA-verified reviewerTwo succeeds
    const validApprove = await apiJson(baseUrl, '/rbac/inspections/insp_self_test/approve', {
      method: 'POST',
      headers: { Authorization: `Bearer ${r2VerifiedToken}` },
    });
    assert.equal(validApprove.status, 200);
    assert.equal(validApprove.json.data.status, 'APPROVED');

    // Separation of duties: Finance admin cannot mutate safety scores; Trust admin cannot alter payments
    for (const actor of [financeAdmin, trustAdmin, superAdmin]) {
      const challenge = await performStepUpMfa(baseUrl, actor.accessToken, testOtp);
      assert.equal(
        (
          await apiJson(baseUrl, '/auth/mfa/verify', {
            method: 'POST',
            headers: { Authorization: `Bearer ${actor.accessToken}` },
            body: challenge,
          })
        ).status,
        200,
      );
    }

    const finMutateSafety = await apiJson(baseUrl, '/rbac/outlets/outlet_arsalan_pc/safety-score', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${financeAdmin.accessToken}` },
      body: { safetyScore: 99, reason: 'Finance should never override safety score' },
    });
    assert.equal(finMutateSafety.status, 403);

    const trustMutateSafety = await apiJson(
      baseUrl,
      '/rbac/outlets/outlet_arsalan_pc/safety-score',
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${trustAdmin.accessToken}` },
        body: { safetyScore: 95, reason: 'Approved after independent kitchen audit review' },
      },
    );
    assert.equal(trustMutateSafety.status, 200);
    assert.equal(trustMutateSafety.json.data.safetyScore, 95);

    const trustPayment = await apiJson(baseUrl, '/rbac/payments/pay_evt_01/override', {
      method: 'POST',
      headers: { Authorization: `Bearer ${trustAdmin.accessToken}` },
      body: { settlementNote: 'Trust admin must never alter payment events' },
    });
    assert.equal(trustPayment.status, 403);

    // Super Admin requires explicit audit reason and cannot escalate own user arbitrarily
    const superMissingReason = await apiJson(baseUrl, `/rbac/users/${custB.userId}/roles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdmin.accessToken}` },
      body: { roles: ['INSPECTOR'], reason: 'short' },
    });
    assert.equal(superMissingReason.status, 400);

    const superSelfPromotion = await apiJson(baseUrl, `/rbac/users/${superAdmin.userId}/roles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdmin.accessToken}` },
      body: { roles: ['SUPER_ADMIN', 'FINANCE_ADMIN'], reason: 'Valid length audit reason' },
    });
    assert.equal(superSelfPromotion.status, 403);

    const superAssignValid = await apiJson(baseUrl, `/rbac/users/${custB.userId}/roles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${superAdmin.accessToken}` },
      body: {
        roles: ['INSPECTOR'],
        reason: 'Appointed certified field kitchen inspector after onboarding',
      },
    });
    assert.equal(superAssignValid.status, 200);
    assert.deepEqual(superAssignValid.json.data.roles, ['INSPECTOR']);

    const auditFeed = await apiJson(baseUrl, '/rbac/admin/audit-logs', {
      headers: { Authorization: `Bearer ${superAdmin.accessToken}` },
    });
    assert.equal(auditFeed.status, 200);
    assert.ok(auditFeed.json.data.logs.some((log) => log.outcome === 'DENIED'));
    assert.ok(
      auditFeed.json.data.logs.some(
        (log) => log.action === 'rbac.role.assign' && log.outcome === 'ALLOWED',
      ),
    );
  });

  // 4. Verify MFA OTP codes never leaked into logs
  const joinedLogs = loggerLines.join('\n');
  for (const msg of testOtp.getAllMessages()) {
    assert.equal(
      joinedLogs.includes(msg.code),
      false,
      'Log output must never contain plaintext MFA OTP codes',
    );
  }

  // 5. Verify React frontend & documentation contracts
  const partnerApp = fs.readFileSync(
    path.join(REPO_ROOT, 'client/restaurant-web/src/App.tsx'),
    'utf8',
  );
  const adminApp = fs.readFileSync(path.join(REPO_ROOT, 'client/admin-web/src/App.tsx'), 'utf8');
  assert.ok(
    partnerApp.includes('/api/v1/rbac/me') && partnerApp.includes('ROLE_PERMISSION_MATRIX'),
  );
  assert.ok(
    adminApp.includes('PRIVILEGED_MFA_ROLES') &&
      adminApp.includes('/api/v1/auth/mfa/verify') &&
      adminApp.includes('/api/v1/rbac/me'),
  );

  const adrs = fs.readFileSync(
    path.join(REPO_ROOT, 'docs/01-CORE-PLANNING-DESIGN/ADRS.md'),
    'utf8',
  );
  const authDoc = fs.readFileSync(path.join(REPO_ROOT, 'docs/03-SECURITY-QUALITY/AUTH.md'), 'utf8');
  const openapi = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'docs/01-CORE-PLANNING-DESIGN/openapi.json'), 'utf8'),
  );
  assert.ok(adrs.includes('ADR-012'));
  assert.ok(authDoc.includes('Checkpoint 08 Baseline'));
  assert.ok(openapi.paths['/auth/mfa/verify']);
  assert.ok(openapi.paths['/rbac/me']);
  assert.ok(openapi.paths['/rbac/outlets/{outletId}/workspace']);

  console.log(
    'Checkpoint 08 verification passed: RBAC permission matrix, cross-outlet tenant isolation, IDOR guards, self-approval ban, privileged MFA policy & audit logging verified.',
  );
}

main().catch((error) => {
  console.error('Checkpoint 08 verification failed:', error);
  process.exit(1);
});
