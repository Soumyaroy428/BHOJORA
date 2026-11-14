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
const {
  InMemoryNotificationStore,
} = require('../dist/modules/notifications/notifications.store.js');
const {
  InMemorySmsAdapter,
  InMemoryEmailAdapter,
  InMemoryPushAdapter,
} = require('../dist/modules/notifications/notifications.adapters.js');
const { NotificationService } = require('../dist/modules/notifications/notifications.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4029',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp29_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp29!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp29!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp29!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp29!',
    },
    { serviceName: 'bhojora-test-cp29', serviceVersion: '0.1.0' },
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
    json = { rawText: text };
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
  assert.equal(res.status, 201, `Failed to register customer: ${JSON.stringify(res.body)}`);
  return {
    userId: res.body.data.user.id,
    token: res.body.data.tokens.accessToken,
    email,
    phone,
  };
}

async function createRoleUser(baseUrl, identityStore, otpAdapter, email, phone, name, role) {
  const reg = await registerCustomer(baseUrl, email, phone, name);
  await identityStore.updateUser(reg.userId, { roles: [role] }, new Date());
  const loginRes = await apiJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      identifier: email,
      password: TEST_PASSWORD,
    },
  });
  assert.equal(loginRes.status, 200, `Login failed for ${role}`);
  const token = loginRes.body.data.tokens.accessToken;

  const mfaSendRes = await apiJson(baseUrl, '/api/v1/auth/mfa/send', {
    method: 'POST',
    token,
  });
  assert.equal(mfaSendRes.status, 200, `MFA send failed for ${role}`);

  const challengeId = mfaSendRes.body.data.challengeId;
  const latestMfa = otpAdapter.getLatestMessage();
  const codeMatch = latestMfa?.bodyText?.match(/\b(\d{6})\b/);
  assert.ok(codeMatch, 'MFA code should be generated in test OTP adapter');

  const verifyMfaRes = await apiJson(baseUrl, '/api/v1/auth/mfa/verify', {
    method: 'POST',
    token,
    body: {
      challengeId,
      code: codeMatch[1],
    },
  });
  assert.equal(verifyMfaRes.status, 200, `MFA verify failed for ${role}`);

  return {
    userId: reg.userId,
    token,
    role,
    email,
  };
}

async function runCheckpoint29Tests() {
  console.log('--- Starting Checkpoint 29 Verification Suite (Notifications) ---');

  const config = createTestConfig();
  const logger = createLogger({
    level: 'error',
    service: config.serviceName,
    environment: config.nodeEnv,
  });

  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({
    store: identityStore,
    otpAdapter,
    config,
    logger,
  });
  const rbacStore = new InMemoryRbacStore();
  const notificationStore = new InMemoryNotificationStore();
  const smsAdapter = new InMemorySmsAdapter();
  const emailAdapter = new InMemoryEmailAdapter();
  const pushAdapter = new InMemoryPushAdapter();

  const notificationService = new NotificationService({
    notificationStore,
    smsAdapter,
    emailAdapter,
    pushAdapter,
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    notificationStore,
    notificationService,
    smsAdapter,
    emailAdapter,
    pushAdapter,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // 1. Setup users
    const customer = await registerCustomer(
      baseUrl,
      'bhojora.customer@kolkata.test',
      '9830012345',
      'Anirban Mukherjee',
    );

    const admin = await createRoleUser(
      baseUrl,
      identityStore,
      otpAdapter,
      'admin.notif@bhojora.test',
      '9830099999',
      'Bhojora Admin',
      'SUPER_ADMIN',
    );

    // [Check 1] Multi-Channel Notification Dispatch across SMS, Email, Push & In-App
    console.log('[Check 1] Validating multi-channel notification dispatch...');
    const dispatch1 = await apiJson(baseUrl, '/api/v1/notifications/dispatch', {
      method: 'POST',
      body: {
        userId: customer.userId,
        channels: ['SMS', 'EMAIL', 'PUSH', 'IN_APP'],
        category: 'TRANSACTIONAL',
        templateKey: 'ORDER_CONFIRMED',
        templateVariables: {
          orderRef: 'ORD-7890',
          outletName: 'Peter Cat, Park Street',
          etaMinutes: 25,
        },
        recipientPhone: '+919830012345',
        recipientEmail: 'bhojora.customer@kolkata.test',
        devicePushToken: 'fcm_token_test_123',
      },
    });

    assert.equal(dispatch1.status, 201);
    assert.equal(dispatch1.body.data.notifications.length, 4);
    assert.equal(dispatch1.body.data.deliveredCount, 4);
    assert.equal(dispatch1.body.data.suppressedCount, 0);
    assert.equal(smsAdapter.sentMessages.length, 1);
    assert.equal(emailAdapter.sentEmails.length, 1);
    assert.equal(pushAdapter.sentPushes.length, 1);
    assert.ok(smsAdapter.sentMessages[0].message.includes('ORD-7890'));
    console.log('✓ [Check 1] Multi-channel notification dispatch verified across all 4 adapters.');

    // [Check 2] Bengali & English Localization
    console.log(
      '[Check 2] Validating Bengali (bn-IN) and English (en-IN) template localization...',
    );
    // Update customer preference to Bengali
    const prefUpdate = await apiJson(baseUrl, '/api/v1/notifications/preferences', {
      method: 'PATCH',
      token: customer.token,
      body: { language: 'bn-IN' },
    });
    assert.equal(prefUpdate.status, 200);
    assert.equal(prefUpdate.body.data.preferences.language, 'bn-IN');

    // Dispatch delivery OTP in Bengali
    const bnDispatch = await apiJson(baseUrl, '/api/v1/notifications/dispatch', {
      method: 'POST',
      body: {
        userId: customer.userId,
        channels: ['SMS'],
        category: 'TRANSACTIONAL',
        templateKey: 'DELIVERY_OTP',
        templateVariables: {
          otp: '4892',
          orderRef: 'ORD-7890',
        },
        recipientPhone: '+919830012345',
      },
    });
    assert.equal(bnDispatch.status, 201);
    const lastSms = smsAdapter.sentMessages[smsAdapter.sentMessages.length - 1];
    assert.ok(
      lastSms.message.includes('আপনার ভোজোরা ডেলিভারি ওটিপি হলো 4892'),
      'Expected Bengali script delivery OTP message',
    );
    console.log('✓ [Check 2] Bengali script localization verified for Kolkata delivery users.');

    // [Check 3] Strict PII Sanitization: Zero Sensitive Data in Notification Bodies
    console.log('[Check 3] Validating zero sensitive PII leakage in notification bodies...');
    const piiDispatch = await apiJson(baseUrl, '/api/v1/notifications/dispatch', {
      method: 'POST',
      body: {
        userId: customer.userId,
        channels: ['SMS', 'EMAIL'],
        category: 'TRANSACTIONAL',
        templateKey: 'ORDER_CANCELLED',
        templateVariables: {
          orderRef: 'ORD-9999',
          reason:
            'Payment card 4111 2222 3333 4444 failed with CVV: 899 and Bearer token eyJhbGciOiJIUzI1Ni. Account: 9876543210',
        },
        recipientPhone: '+919830012345',
        recipientEmail: 'bhojora.customer@kolkata.test',
      },
    });
    assert.equal(piiDispatch.status, 201);
    for (const notif of piiDispatch.body.data.notifications) {
      assert.ok(!notif.body.includes('4111 2222 3333 4444'), 'Raw card number must be masked');
      assert.ok(notif.body.includes('****-****-****-4444'), 'Card must have masked format');
      assert.ok(!notif.body.includes('CVV: 899'), 'CVV must be masked');
      assert.ok(notif.body.includes('CVV: ***'), 'CVV masked replacement verified');
      assert.ok(!notif.body.includes('eyJhbGciOiJIUzI1Ni'), 'Bearer auth tokens must be redacted');
      assert.ok(!notif.body.includes('9876543210'), 'Bank account numbers must be redacted');
    }
    console.log(
      '✓ [Check 3] PII sanitizer verified: credit cards, CVVs, tokens, and bank details masked.',
    );

    // [Check 4] Idempotent Dispatch: Duplicate Requests Suppressed
    console.log('[Check 4] Validating idempotent dispatch replay protection...');
    const smsCountBefore = smsAdapter.sentMessages.length;
    const idempotencyKey = 'cp29_unique_order_event_12345';

    const dispatchReq = {
      userId: customer.userId,
      channels: ['SMS'],
      category: 'TRANSACTIONAL',
      templateKey: 'ORDER_CONFIRMED',
      templateVariables: {
        orderRef: 'ORD-IDEMP',
        outletName: 'Arsalan Biryani',
        etaMinutes: 30,
      },
      recipientPhone: '+919830012345',
      idempotencyKey,
    };

    const firstRun = await apiJson(baseUrl, '/api/v1/notifications/dispatch', {
      method: 'POST',
      body: dispatchReq,
    });
    assert.equal(firstRun.status, 201);
    assert.equal(smsAdapter.sentMessages.length, smsCountBefore + 1);

    // Replay with identical idempotencyKey
    const secondRun = await apiJson(baseUrl, '/api/v1/notifications/dispatch', {
      method: 'POST',
      body: dispatchReq,
    });
    assert.equal(secondRun.status, 201);
    assert.equal(
      smsAdapter.sentMessages.length,
      smsCountBefore + 1,
      'SMS provider must NOT be called twice for identical idempotencyKey',
    );
    assert.equal(
      firstRun.body.data.notifications[0].notificationId,
      secondRun.body.data.notifications[0].notificationId,
    );
    console.log(
      '✓ [Check 4] Idempotent dispatch verified: replay returns existing notification without duplicate send.',
    );

    // [Check 5] Marketing Opt-Out Policy Enforced
    console.log('[Check 5] Validating marketing / promotional opt-out enforcement...');
    // Opt-out from promotions
    const optOutRes = await apiJson(baseUrl, '/api/v1/notifications/opt-out', {
      method: 'POST',
      body: {
        userId: customer.userId,
        reason: 'Too many festival promo notifications',
      },
    });
    assert.equal(optOutRes.status, 200);
    assert.equal(optOutRes.body.data.optedOut, true);

    // Try to send promotional notification
    const promoDispatch = await apiJson(baseUrl, '/api/v1/notifications/dispatch', {
      method: 'POST',
      body: {
        userId: customer.userId,
        channels: ['SMS', 'EMAIL', 'PUSH'],
        category: 'MARKETING',
        templateKey: 'PROMOTIONAL_OFFER',
        templateVariables: {
          discountPercent: 20,
          promoCode: 'KOLKATAFEAST',
          zoneName: 'Park Street',
        },
        recipientPhone: '+919830012345',
        recipientEmail: 'bhojora.customer@kolkata.test',
      },
    });
    assert.equal(promoDispatch.status, 201);
    assert.equal(promoDispatch.body.data.suppressedCount, 3);
    assert.equal(promoDispatch.body.data.deliveredCount, 0);
    for (const notif of promoDispatch.body.data.notifications) {
      assert.equal(notif.status, 'SUPPRESSED_OPT_OUT');
    }
    console.log('✓ [Check 5] Marketing opt-out respected: promotional communications suppressed.');

    // [Check 6] Transactional Overrides Marketing Opt-Out
    console.log(
      '[Check 6] Validating that critical transactional messages are not suppressed by marketing opt-out...',
    );
    const transDispatch = await apiJson(baseUrl, '/api/v1/notifications/dispatch', {
      method: 'POST',
      body: {
        userId: customer.userId,
        channels: ['SMS'],
        category: 'TRANSACTIONAL',
        templateKey: 'DELIVERY_OTP',
        templateVariables: {
          otp: '7712',
          orderRef: 'ORD-CRITICAL',
        },
        recipientPhone: '+919830012345',
      },
    });
    assert.equal(transDispatch.status, 201);
    assert.equal(transDispatch.body.data.deliveredCount, 1);
    assert.equal(transDispatch.body.data.notifications[0].status, 'DELIVERED');
    console.log(
      '✓ [Check 6] Critical transactional alerts delivered regardless of marketing opt-out.',
    );

    // [Check 7] Error Handling, Adapter Failure & Idempotent Retry
    console.log('[Check 7] Validating adapter temporary failure, retry mechanism & backoff...');
    smsAdapter.setFailNextAttempts(1); // Next attempt will fail

    const failDispatch = await apiJson(baseUrl, '/api/v1/notifications/dispatch', {
      method: 'POST',
      body: {
        userId: customer.userId,
        channels: ['SMS'],
        category: 'TRANSACTIONAL',
        templateKey: 'REFUND_CREDITED',
        templateVariables: {
          amount: '450.00',
          orderRef: 'ORD-REFUND',
          refundRef: 'RF_12345',
        },
        recipientPhone: '+919830012345',
      },
    });
    assert.equal(failDispatch.status, 201);
    const failedNotif = failDispatch.body.data.notifications[0];
    assert.equal(failedNotif.status, 'FAILED');
    assert.ok(failedNotif.failureReason.includes('Simulated telecom SMS gateway'));

    // Admin retries the failed notification
    const retryRes = await apiJson(
      baseUrl,
      `/api/v1/notifications/logs/${failedNotif.notificationId}/retry`,
      {
        method: 'POST',
        token: admin.token,
      },
    );
    assert.equal(retryRes.status, 200);
    assert.equal(retryRes.body.data.notification.status, 'DELIVERED');
    assert.equal(retryRes.body.data.notification.attemptCount, 2);

    // Retrying an already DELIVERED notification is idempotent
    const idempotentRetry = await apiJson(
      baseUrl,
      `/api/v1/notifications/logs/${failedNotif.notificationId}/retry`,
      {
        method: 'POST',
        token: admin.token,
      },
    );
    assert.equal(idempotentRetry.status, 200);
    assert.equal(idempotentRetry.body.data.notification.status, 'DELIVERED');
    assert.equal(idempotentRetry.body.data.notification.attemptCount, 2);
    console.log('✓ [Check 7] Temporary adapter failure recovery and idempotent retry verified.');

    // [Check 8] In-App Notification Center & Mark-as-Read State
    console.log('[Check 8] Validating customer in-app notification center and read state...');
    const inAppList = await apiJson(baseUrl, '/api/v1/notifications/me', {
      token: customer.token,
    });
    assert.equal(inAppList.status, 200);
    assert.ok(inAppList.body.data.notifications.length >= 1);
    const unreadNotif = inAppList.body.data.notifications[0];
    assert.equal(unreadNotif.isRead, false);

    // Mark as read
    const markRes = await apiJson(
      baseUrl,
      `/api/v1/notifications/${unreadNotif.notificationId}/read`,
      {
        method: 'PATCH',
        token: customer.token,
      },
    );
    assert.equal(markRes.status, 200);
    assert.equal(markRes.body.data.success, true);

    // Verify unread query filters it out
    const unreadOnlyRes = await apiJson(baseUrl, '/api/v1/notifications/me?unreadOnly=true', {
      token: customer.token,
    });
    assert.equal(unreadOnlyRes.status, 200);
    assert.ok(
      !unreadOnlyRes.body.data.notifications.some(
        (n) => n.notificationId === unreadNotif.notificationId,
      ),
    );
    console.log('✓ [Check 8] In-app notification inbox and read-state management verified.');

    // [Check 9] Admin Delivery Logs & Audit Permissions
    console.log('[Check 9] Validating delivery logs query and RBAC least-privilege...');
    // Customer lacks audit:log:read -> 403 Forbidden
    const unauthLogs = await apiJson(baseUrl, '/api/v1/notifications/logs', {
      token: customer.token,
    });
    assert.equal(unauthLogs.status, 403, 'Customer must not access admin delivery logs');

    // Admin can query delivery logs
    const adminLogs = await apiJson(baseUrl, '/api/v1/notifications/logs?status=DELIVERED', {
      token: admin.token,
    });
    assert.equal(adminLogs.status, 200);
    assert.ok(adminLogs.body.data.logs.length >= 1);
    assert.ok(adminLogs.body.data.logs.every((l) => l.status === 'DELIVERED'));
    console.log('✓ [Check 9] Delivery logs RBAC security and status filtering verified.');

    // [Check 10] Channel Toggle Preference Updates
    console.log('[Check 10] Validating channel preference toggles (SMS, Push, In-App)...');
    const togglePref = await apiJson(baseUrl, '/api/v1/notifications/preferences', {
      method: 'PATCH',
      token: customer.token,
      body: {
        smsEnabled: false,
        emailEnabled: true,
        pushEnabled: false,
      },
    });
    assert.equal(togglePref.status, 200);
    assert.equal(togglePref.body.data.preferences.smsEnabled, false);
    assert.equal(togglePref.body.data.preferences.pushEnabled, false);
    assert.equal(togglePref.body.data.preferences.emailEnabled, true);
    console.log('✓ [Check 10] Granular user channel preference toggles verified.');

    console.log('\n--- ALL CHECKPOINT 29 NOTIFICATION CHECKS PASSED SUCCESSFULLY ---');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runCheckpoint29Tests().catch((err) => {
  console.error('Checkpoint 29 Verification Suite Failed:', err);
  process.exit(1);
});
