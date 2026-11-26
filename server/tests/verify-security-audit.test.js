'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const { validateEnv } = require('../dist/config/env.js');
const { createLogger } = require('../dist/config/logger.js');
const { createApp } = require('../dist/app.js');
const { InMemoryIdentityStore } = require('../dist/modules/identity/identity.models.js');
const { InMemoryTestOtpAdapter } = require('../dist/modules/identity/otp.adapter.js');
const { IdentityService } = require('../dist/modules/identity/identity.service.js');
const { InMemoryRbacStore } = require('../dist/modules/rbac/rbac.store.js');
const { InMemoryFinanceStore } = require('../dist/modules/finance/finance.store.js');
const { FinanceService } = require('../dist/modules/finance/finance.service.js');
const { InMemoryPrivacyStore } = require('../dist/modules/privacy/privacy.store.js');
const { PrivacyService } = require('../dist/modules/privacy/privacy.service.js');
const { InMemoryPilotStore } = require('../dist/modules/pilot/pilot.store.js');
const { PilotService } = require('../dist/modules/pilot/pilot.service.js');
const { StorageScannerService } = require('../dist/modules/integrations/storage-scanner.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4039',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_sec_audit_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_sec_audit!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_sec_audit!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_sec_audit!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_sec_audit!',
    },
    { serviceName: 'bhojora-test-sec-audit', serviceVersion: '0.1.0' },
  );
}

async function apiJson(baseUrl, pathUrl, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...options.headers };
  let bodyStr;
  if (options.body !== undefined) {
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

async function registerAndLogin(baseUrl, identityStore, rbacStore, phone, role = 'CUSTOMER') {
  const email = `${role.toLowerCase()}_${Date.now()}_${Math.floor(Math.random() * 10000)}@test.bhojora.in`;
  const registerRes = await apiJson(baseUrl, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      phone,
      name: `Security Test ${role}`,
      email,
      password: TEST_PASSWORD,
      acceptTerms: true,
    },
  });
  assert.equal(registerRes.status, 201);

  const userId = registerRes.data.data.user.id;
  if (role !== 'CUSTOMER') {
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

  const loginRes = await apiJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: { identifier: email, password: TEST_PASSWORD },
  });
  assert.equal(loginRes.status, 200);
  return { userId, token: loginRes.data.data.tokens.accessToken };
}

async function runTests() {
  console.log('--- Starting Security Audit Regression Verification Suite ---');

  const config = createTestConfig();
  const logger = createLogger({ level: 'error', service: 'test-sec-audit', environment: 'test' });
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const rbacStore = new InMemoryRbacStore();
  const financeStore = new InMemoryFinanceStore();
  const financeService = new FinanceService({ financeStore });
  const privacyStore = new InMemoryPrivacyStore();
  const privacyService = new PrivacyService(privacyStore, identityStore);
  const pilotStore = new InMemoryPilotStore();
  const pilotService = new PilotService(pilotStore);

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    financeStore,
    financeService,
    privacyStore,
    privacyService,
    pilotStore,
    pilotService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const customerA = await registerAndLogin(baseUrl, identityStore, rbacStore, '+919830091001');
    const customerB = await registerAndLogin(baseUrl, identityStore, rbacStore, '+919830091002');
    const admin = await registerAndLogin(
      baseUrl,
      identityStore,
      rbacStore,
      '+919830091003',
      'SUPER_ADMIN',
    );

    // 1. Support BFLA: customer cannot moderate reviews or resolve safety complaints
    const modUnauth = await apiJson(baseUrl, '/api/v1/support/reviews/rev_fake/moderate', {
      method: 'PATCH',
      body: { status: 'HIDDEN', reason: 'Unauth test' },
    });
    assert.equal(modUnauth.status, 401);

    const modCustomer = await apiJson(baseUrl, '/api/v1/support/reviews/rev_fake/moderate', {
      method: 'PATCH',
      token: customerA.token,
      body: { status: 'HIDDEN', reason: 'Customer privilege escalation attempt' },
    });
    assert.equal(modCustomer.status, 403);

    const resolveCustomer = await apiJson(baseUrl, '/api/v1/support/complaints/cmp_fake/resolve', {
      method: 'PATCH',
      token: customerA.token,
      body: { status: 'RESOLVED', findingStatus: 'REJECTED_ALLEGATION', resolutionNotes: 'Bypass' },
    });
    assert.equal(resolveCustomer.status, 403);

    // 2. Notifications access control & IDOR opt-out
    const unauthDispatch = await apiJson(baseUrl, '/api/v1/notifications/dispatch', {
      method: 'POST',
      body: {
        userId: customerA.userId,
        channels: ['IN_APP'],
        category: 'TRANSACTIONAL',
        templateKey: 'ORDER_CONFIRMED',
        templateVariables: { orderRef: 'ORD-1', outletName: 'Test', etaMinutes: 20 },
      },
    });
    assert.equal(unauthDispatch.status, 401);

    const customerDispatch = await apiJson(baseUrl, '/api/v1/notifications/dispatch', {
      method: 'POST',
      token: customerA.token,
      body: {
        userId: customerB.userId,
        channels: ['IN_APP'],
        category: 'TRANSACTIONAL',
        templateKey: 'ORDER_CONFIRMED',
        templateVariables: { orderRef: 'ORD-1', outletName: 'Test', etaMinutes: 20 },
      },
    });
    assert.equal(customerDispatch.status, 403);

    const unauthOptOut = await apiJson(baseUrl, '/api/v1/notifications/opt-out', {
      method: 'POST',
      body: { userId: customerA.userId },
    });
    assert.equal(unauthOptOut.status, 401);

    const idorOptOut = await apiJson(baseUrl, '/api/v1/notifications/opt-out', {
      method: 'POST',
      token: customerA.token,
      body: { userId: customerB.userId, reason: 'IDOR attempt' },
    });
    assert.equal(idorOptOut.status, 403);

    // 3. Finance refund BOLA + idempotency key isolation
    const refundBola = await apiJson(baseUrl, '/api/v1/finance/refunds', {
      method: 'POST',
      token: customerA.token,
      body: {
        paymentId: 'pay_1',
        orderId: 'ord_1',
        customerId: customerB.userId,
        amountPaise: 5000,
        reason: 'Cross-customer BOLA attempt',
        idempotencyKey: 'shared-refund-key',
      },
    });
    assert.equal(refundBola.status, 403);

    const refundA = await apiJson(baseUrl, '/api/v1/finance/refunds', {
      method: 'POST',
      token: customerA.token,
      body: {
        paymentId: 'pay_a',
        orderId: 'ord_a',
        customerId: customerA.userId,
        amountPaise: 5000,
        reason: 'Order cancelled',
        idempotencyKey: 'shared-refund-key',
      },
    });
    assert.equal(refundA.status, 201);

    const refundB = await apiJson(baseUrl, '/api/v1/finance/refunds', {
      method: 'POST',
      token: customerB.token,
      body: {
        paymentId: 'pay_b',
        orderId: 'ord_b',
        customerId: customerB.userId,
        amountPaise: 7000,
        reason: 'Duplicate key across customers must not collide',
        idempotencyKey: 'shared-refund-key',
      },
    });
    assert.equal(refundB.status, 201);
    assert.notEqual(refundA.data.data.refund.refundId, refundB.data.data.refund.refundId);
    assert.equal(refundB.data.data.refund.customerId, customerB.userId);

    // 4. Privacy retention purge & Pilot resume validation
    for (const badDays of [0, -5, 'abc', 9999]) {
      const badPurge = await apiJson(baseUrl, '/api/v1/privacy/admin/retention-purge', {
        method: 'POST',
        token: admin.token,
        body: { retentionDays: badDays },
      });
      assert.equal(badPurge.status, 400);
      assert.equal(badPurge.data.error.code, 'VALIDATION_ERROR');
    }

    const emptyPurge = await apiJson(baseUrl, '/api/v1/privacy/admin/retention-purge', {
      method: 'POST',
      token: admin.token,
      body: {},
    });
    assert.equal(emptyPurge.status, 200);

    const badPilotResume = await apiJson(baseUrl, '/api/v1/pilot/admin/resume', {
      method: 'POST',
      token: admin.token,
      body: { zoneCode: { $ne: '' } },
    });
    assert.equal(badPilotResume.status, 400);
    assert.equal(badPilotResume.data.error.code, 'VALIDATION_ERROR');

    // 5. Storage scanner MIME spoof, deep-offset script, path traversal, dangerous extension
    const scanner = new StorageScannerService();

    // PDF magic bytes declared as image/jpeg -> must reject
    const pdfAsJpeg = scanner.scanFile({
      fileName: 'menu.jpg',
      declaredMimeType: 'image/jpeg',
      buffer: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj', 'utf-8'),
    });
    assert.equal(pdfAsJpeg.isSafe, false);

    // Polyglot JPEG with <svg onload=...> after byte 1024 -> must reject
    const deepXss = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
      Buffer.alloc(1500, 0x41),
      Buffer.from('<svg onload="fetch(\'https://evil.test\')">'),
    ]);
    const deepScan = scanner.scanFile({
      fileName: 'photo.jpg',
      declaredMimeType: 'image/jpeg',
      buffer: deepXss,
    });
    assert.equal(deepScan.isSafe, false);

    // Path traversal filename -> must reject
    const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const traversalScan = scanner.scanFile({
      fileName: '../../etc/passwd.png',
      declaredMimeType: 'image/png',
      buffer: validPng,
    });
    assert.equal(traversalScan.isSafe, false);

    // Dangerous extension even with PNG bytes -> must reject
    const shellExtScan = scanner.scanFile({
      fileName: 'payload.sh',
      declaredMimeType: 'image/png',
      buffer: validPng,
    });
    assert.equal(shellExtScan.isSafe, false);

    // HTTP endpoint returns 422 on polyglot upload
    const apiDeepScan = await apiJson(baseUrl, '/api/v1/integrations/storage/scan', {
      method: 'POST',
      token: admin.token,
      body: {
        fileName: 'photo.jpg',
        declaredMimeType: 'image/jpeg',
        contentBase64: deepXss.toString('base64'),
      },
    });
    assert.equal(apiDeepScan.status, 422);

    // 6. Client credential hygiene & Vercel security headers verification
    const repoRoot = path.resolve(__dirname, '../..');
    const forbiddenClientStrings = [
      'BhojoraAdmin@2026!',
      'BhojoraPartner@2026!',
      'BhojoraRider@2026!',
      'bhojora_privileged_admin_session_token',
      'bhojora_partner_session_token',
      'VITE_ADMIN_PASSWORD',
      'VITE_PARTNER_PASSWORD',
    ];
    for (const relPath of [
      'client/admin-web/src/App.tsx',
      'client/restaurant-web/src/App.tsx',
      'client/delivery-mobile/src/App.tsx',
    ]) {
      const content = fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
      for (const secretStr of forbiddenClientStrings) {
        assert.ok(
          !content.includes(secretStr),
          `Client file ${relPath} must not contain "${secretStr}"`,
        );
      }
    }

    for (const surface of ['admin-web', 'customer-web', 'delivery-mobile', 'restaurant-web']) {
      const vercelCfg = JSON.parse(
        fs.readFileSync(path.join(repoRoot, 'client', surface, 'vercel.json'), 'utf8'),
      );
      assert.ok(Array.isArray(vercelCfg.headers) && vercelCfg.headers.length > 0);
      const headerKeys = new Set(vercelCfg.headers[0].headers.map((h) => h.key));
      for (const requiredKey of [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'Referrer-Policy',
        'Strict-Transport-Security',
        'Content-Security-Policy',
      ]) {
        assert.ok(
          headerKeys.has(requiredKey),
          `${surface}/vercel.json missing security header ${requiredKey}`,
        );
      }
    }

    // 7. 3-4 failure -> 1-hour (3600s) brute-force lockout verification across login, MFA, recovery
    let clockMs = Date.parse('2026-11-26T10:00:00.000Z');
    const rateClock = {
      now: () => new Date(clockMs),
      advanceSeconds: (sec) => {
        clockMs += sec * 1000;
      },
    };
    const rateIdentityStore = new InMemoryIdentityStore();
    const rateOtpAdapter = new InMemoryTestOtpAdapter();
    const rateIdentityService = new IdentityService({
      config,
      store: rateIdentityStore,
      otpAdapter: rateOtpAdapter,
      logger,
      clock: rateClock,
    });
    const rateApp = createApp({
      config,
      logger,
      identityService: rateIdentityService,
      identityStore: rateIdentityStore,
      rbacStore: new InMemoryRbacStore(),
      clock: rateClock,
    });
    const rateServer = http.createServer(rateApp);
    await new Promise((resolve) => rateServer.listen(0, resolve));
    const rateBaseUrl = `http://127.0.0.1:${rateServer.address().port}`;

    try {
      const targetEmail = 'lockout.target@bhojora.in';
      const targetReg = await apiJson(rateBaseUrl, '/api/v1/auth/register', {
        method: 'POST',
        body: {
          phone: '+919830099111',
          name: 'Rate Limit User',
          email: targetEmail,
          password: TEST_PASSWORD,
          acceptTerms: true,
        },
      });
      assert.equal(targetReg.status, 201);

      // Attempts 1..3 fail with 401; 4th failure triggers 1-hour (3600s) 429 lockout
      for (let i = 1; i <= 3; i += 1) {
        const failAttempt = await apiJson(rateBaseUrl, '/api/v1/auth/login', {
          method: 'POST',
          body: { identifier: targetEmail, password: 'WrongPassword@999' },
        });
        assert.equal(failAttempt.status, 401, `Login fail #${i} should be 401`);
      }

      const lockedRes = await apiJson(rateBaseUrl, '/api/v1/auth/login', {
        method: 'POST',
        body: { identifier: targetEmail, password: 'WrongPassword@999' },
      });
      assert.equal(lockedRes.status, 429);
      assert.equal(lockedRes.data.error.code, 'RATE_LIMITED');
      assert.equal(lockedRes.headers.get('retry-after'), '3600');

      // Still blocked at 59m59s (3599s) even with valid password
      rateClock.advanceSeconds(3599);
      const stillBlocked = await apiJson(rateBaseUrl, '/api/v1/auth/login', {
        method: 'POST',
        body: { identifier: targetEmail, password: TEST_PASSWORD },
      });
      assert.equal(stillBlocked.status, 429);
      assert.equal(stillBlocked.headers.get('retry-after'), '1');

      // Unlocked after 1 full hour (3601s total)
      rateClock.advanceSeconds(2);
      const unlocked = await apiJson(rateBaseUrl, '/api/v1/auth/login', {
        method: 'POST',
        body: { identifier: targetEmail, password: TEST_PASSWORD },
      });
      assert.equal(unlocked.status, 200);
      const freshToken = unlocked.data.data.tokens.accessToken;

      // MFA verify: 4 wrong attempts -> 1-hour lockout
      const mfaSend = await apiJson(rateBaseUrl, '/api/v1/auth/mfa/send', {
        method: 'POST',
        token: freshToken,
      });
      assert.equal(mfaSend.status, 200);
      const challengeId1 = mfaSend.data.data.challengeId;
      for (let i = 1; i <= 3; i += 1) {
        const badMfa = await apiJson(rateBaseUrl, '/api/v1/auth/mfa/verify', {
          method: 'POST',
          token: freshToken,
          body: { challengeId: challengeId1, code: '000000' },
        });
        assert.equal(badMfa.status, 401);
      }
      rateClock.advanceSeconds(65);
      const mfaSend2 = await apiJson(rateBaseUrl, '/api/v1/auth/mfa/send', {
        method: 'POST',
        token: freshToken,
      });
      assert.equal(mfaSend2.status, 200);
      const mfaLocked = await apiJson(rateBaseUrl, '/api/v1/auth/mfa/verify', {
        method: 'POST',
        token: freshToken,
        body: { challengeId: mfaSend2.data.data.challengeId, code: '000000' },
      });
      assert.equal(mfaLocked.status, 429);
      assert.equal(mfaLocked.headers.get('retry-after'), '3600');

      // Recovery reset-password: 4 wrong attempts -> 1-hour lockout
      const rec1 = await apiJson(rateBaseUrl, '/api/v1/auth/forgot-password', {
        method: 'POST',
        body: { identifier: targetEmail },
      });
      assert.equal(rec1.status, 200);
      for (let i = 1; i <= 3; i += 1) {
        const badReset = await apiJson(rateBaseUrl, '/api/v1/auth/reset-password', {
          method: 'POST',
          body: {
            identifier: targetEmail,
            token: 'wrong-recovery-token',
            newPassword: 'NewStrong@Password1',
          },
        });
        assert.equal(badReset.status, 401);
      }
      const rec2 = await apiJson(rateBaseUrl, '/api/v1/auth/forgot-password', {
        method: 'POST',
        body: { identifier: targetEmail },
      });
      assert.equal(rec2.status, 200);
      const recLocked = await apiJson(rateBaseUrl, '/api/v1/auth/reset-password', {
        method: 'POST',
        body: {
          identifier: targetEmail,
          token: 'wrong-recovery-token',
          newPassword: 'NewStrong@Password1',
        },
      });
      assert.equal(recLocked.status, 429);
      assert.equal(recLocked.headers.get('retry-after'), '3600');
    } finally {
      await new Promise((resolve) => rateServer.close(resolve));
    }

    console.log('🎉 ALL SECURITY AUDIT REGRESSION CHECKS PASSED CLEANLY!');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runTests().catch((error) => {
  console.error('❌ Security Audit Regression Verification Failed:', error);
  process.exit(1);
});
