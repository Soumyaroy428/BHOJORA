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
const { CircuitBreaker } = require('../dist/modules/integrations/circuit-breaker.js');
const { ResilientRetryQueue } = require('../dist/modules/integrations/retry-queue.js');
const { MapsResilienceService } = require('../dist/modules/integrations/maps-resilience.js');
const { StorageScannerService } = require('../dist/modules/integrations/storage-scanner.js');
const {
  WebhookObservabilityService,
} = require('../dist/modules/integrations/webhook-observability.js');
const { IntegrationsService } = require('../dist/modules/integrations/integrations.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4033',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp33_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp33!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp33!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp33!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp33!',
    },
    { serviceName: 'bhojora-test-cp33', serviceVersion: '0.1.0' },
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
  console.log('--- Starting Checkpoint 33 Integrations Hardening & Provider Resilience Tests ---');

  const config = createTestConfig();
  const logger = createLogger({ level: 'error', service: 'test-cp33', environment: 'test' });
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const rbacStore = new InMemoryRbacStore();
  const integrationsService = new IntegrationsService({ mapsQuotaLimit: 10 });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    integrationsService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const adminUser = await registerAndLogin(
      baseUrl,
      identityStore,
      '+919830000033',
      'SUPER_ADMIN',
      rbacStore,
    );
    const customerUser = await registerAndLogin(
      baseUrl,
      identityStore,
      '+919830000133',
      'CUSTOMER',
      rbacStore,
    );

    // 1. Circuit Breaker transitions from CLOSED to OPEN after failureThreshold
    console.log('Test 1: Circuit Breaker trips from CLOSED to OPEN upon repeated failures');
    const cb = new CircuitBreaker('test-external-provider', {
      failureThreshold: 2,
      resetTimeoutMs: 50,
      timeoutMs: 500,
    });
    assert.equal(cb.getMetrics().state, 'CLOSED');

    try {
      await cb.execute(async () => {
        throw new Error('Provider Connection Refused');
      });
    } catch {
      // Expected failure 1
    }
    assert.equal(cb.getMetrics().state, 'CLOSED');
    assert.equal(cb.getMetrics().consecutiveFailures, 1);

    try {
      await cb.execute(async () => {
        throw new Error('Provider Internal 500');
      });
    } catch {
      // Expected failure 2
    }
    assert.equal(cb.getMetrics().state, 'OPEN');

    // 2. Circuit Breaker fast-fails when OPEN without false success
    console.log('Test 2: Circuit Breaker fast-fails when OPEN (no false success)');
    let executedInOpen = false;
    try {
      await cb.execute(async () => {
        executedInOpen = true;
        return 'success';
      });
      assert.fail('Should have fast-failed');
    } catch (err) {
      assert.equal(executedInOpen, false);
      assert.ok(err.message.includes("Circuit breaker for 'test-external-provider' is OPEN"));
    }

    // 3. Circuit Breaker transitions to HALF_OPEN and recovers to CLOSED
    console.log(
      'Test 3: Circuit Breaker transitions to HALF_OPEN after resetTimeout and recovers to CLOSED',
    );
    await new Promise((res) => setTimeout(res, 60)); // Wait for resetTimeoutMs (50ms)
    // Trial call 1 in HALF_OPEN
    await cb.execute(async () => 'trial-1');
    assert.equal(cb.getMetrics().state, 'HALF_OPEN');
    // Trial call 2 in HALF_OPEN (threshold: 2)
    await cb.execute(async () => 'trial-2');
    assert.equal(cb.getMetrics().state, 'CLOSED');
    assert.equal(cb.getMetrics().consecutiveFailures, 0);

    // 4. Retry Queue applies exponential backoff with jitter and moves exhausted jobs to DLQ
    console.log('Test 4: Resilient retry queue with backoff and Dead Letter Queue (DLQ)');
    const retryQueue = new ResilientRetryQueue();
    let attemptCount = 0;
    try {
      await retryQueue.executeWithRetries(
        {
          provider: 'SMS_NOTIFICATION',
          action: 'send_order_otp',
          payload: { phone: '+919830099999' },
          maxAttempts: 3,
          baseDelayMs: 15,
          maxDelayMs: 50,
        },
        async () => {
          attemptCount += 1;
          throw new Error('SMS Gateway Throttled (429)');
        },
      );
      assert.fail('Should fail after 3 attempts');
    } catch (err) {
      assert.equal(attemptCount, 3);
      assert.ok(err.message.includes('SMS Gateway Throttled'));
    }

    const exhaustedJobs = retryQueue.getDlqJobs();
    assert.equal(exhaustedJobs.length, 1);
    assert.equal(exhaustedJobs[0].status, 'EXHAUSTED');
    assert.equal(exhaustedJobs[0].attempts, 3);

    // 5. DLQ manual reprocessing
    console.log('Test 5: DLQ manual retry succeeds and marks job RESOLVED');
    const reprocessed = await retryQueue.retryExhaustedJob(exhaustedJobs[0].id, async () => {
      return { sent: true };
    });
    assert.equal(reprocessed.sent, true);
    assert.equal(retryQueue.getJobById(exhaustedJobs[0].id).status, 'RESOLVED');

    // 6. Maps Resilience: switches to Haversine fallback when quota is exhausted
    console.log(
      'Test 6: Maps routing calculates primary route and transparently engages offline fallback when quota exhausted',
    );
    const mapsService = new MapsResilienceService({ quotaLimit: 2 });
    const pickup = { lat: 22.5318, lng: 88.3485 }; // Park Circus
    const dropoff = { lat: 22.5532, lng: 88.3518 }; // Park Street

    // Call 1: within quota
    const route1 = await mapsService.calculateRoute(pickup, dropoff);
    assert.equal(route1.isFallback, false);
    assert.equal(route1.provider, 'google-maps-platform');
    assert.ok(route1.distanceMeters > 0);

    // Call 2: within quota
    const route2 = await mapsService.calculateRoute(pickup, dropoff);
    assert.equal(route2.isFallback, false);

    // Call 3: exceeds quota (limit: 2), must fallback without throwing false success
    const route3 = await mapsService.calculateRoute(pickup, dropoff);
    assert.equal(route3.isFallback, true);
    assert.ok(route3.provider.includes('offline-haversine-matrix'));
    assert.ok(route3.distanceMeters > 0);

    // 7. Storage Scanner: validates MIME magic bytes and blocks malicious payloads
    console.log(
      'Test 7: Storage scanner validates magic bytes, size limits, and blocks executables/scripts',
    );
    const scanner = new StorageScannerService();

    // Valid JPEG (FF D8 FF)
    const validJpegBuffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const jpegScan = scanner.scanFile({
      fileName: 'kitchen_audit.jpg',
      buffer: validJpegBuffer,
      declaredMimeType: 'image/jpeg',
    });
    assert.equal(jpegScan.isSafe, true);
    assert.equal(jpegScan.detectedMimeType, 'image/jpeg');
    assert.ok(jpegScan.sha256Checksum.length === 64);

    // Malicious Windows Executable (MZ) disguised as image
    const fakeImgBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
    const peScan = scanner.scanFile({
      fileName: 'exploit.jpg',
      buffer: fakeImgBuffer,
      declaredMimeType: 'image/jpeg',
    });
    assert.equal(peScan.isSafe, false);
    assert.ok(peScan.rejectionReason.includes('Executable binary signature (MZ PE)'));

    // Script injection payload disguised as document
    const scriptPayload = Buffer.from('<script>alert("xss")</script>');
    const xssScan = scanner.scanFile({
      fileName: 'invoice.pdf',
      buffer: scriptPayload,
      declaredMimeType: 'application/pdf',
    });
    assert.equal(xssScan.isSafe, false);
    assert.ok(xssScan.rejectionReason.includes('Active script or executable tags'));

    // 8. Webhook Observability: HMAC signature validation and replay protection
    console.log('Test 8: Webhook observability validates HMAC signature and blocks replay attacks');
    const webhooks = new WebhookObservabilityService();
    const webhookSecret = 'test_secret_for_payment_webhooks';
    const rawPayload = JSON.stringify({ event: 'payment.captured', orderId: 'ord_test_901' });

    // Generate valid HMAC
    const crypto = require('crypto');
    const validSig = crypto.createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');

    const isValid = webhooks.verifyHmacSignature(rawPayload, validSig, webhookSecret);
    assert.equal(isValid, true);

    const isInvalid = webhooks.verifyHmacSignature(rawPayload, 'tampered_signature', webhookSecret);
    assert.equal(isInvalid, false);

    // Process event 1 (first time)
    const eventResult1 = webhooks.processWebhookEvent(
      'evt_pay_901',
      'RAZORPAY',
      'payment.captured',
      true,
    );
    assert.equal(eventResult1.isDuplicate, false);
    assert.equal(eventResult1.status, 'PROCESSED');

    // Replay attack with same eventId
    const eventResult2 = webhooks.processWebhookEvent(
      'evt_pay_901',
      'RAZORPAY',
      'payment.captured',
      true,
    );
    assert.equal(eventResult2.isDuplicate, true);
    assert.equal(eventResult2.status, 'REPLAY_IGNORED');

    // 9. API Verification: GET /api/v1/integrations/health returns all 6 providers
    console.log(
      'Test 9: Integrations health API returns circuit breakers and quotas for all providers',
    );
    const healthRes = await apiJson(baseUrl, '/api/v1/integrations/health', {
      token: adminUser.token,
    });
    assert.equal(healthRes.status, 200);
    const healthData = healthRes.data.data;
    assert.equal(healthData.overallStatus, 'OPERATIONAL');
    assert.ok(healthData.providers.GOOGLE_MAPS);
    assert.ok(healthData.providers.PAYMENT_GATEWAY);
    assert.ok(healthData.providers.SMS_NOTIFICATION);
    assert.ok(healthData.providers.PUSH_NOTIFICATION);
    assert.ok(healthData.providers.OBJECT_STORAGE);
    assert.ok(healthData.providers.AI_GATEWAY);

    // 10. API Verification: Storage scan endpoint rejects malicious upload
    console.log(
      'Test 10: Storage scan API validates base64 upload and rejects executable payloads',
    );
    const apiScanRes = await apiJson(baseUrl, '/api/v1/integrations/storage/scan', {
      method: 'POST',
      token: adminUser.token,
      body: {
        fileName: 'malicious.exe',
        declaredMimeType: 'image/jpeg',
        contentBase64: fakeImgBuffer.toString('base64'),
      },
    });
    assert.equal(apiScanRes.status, 422);
    assert.ok(apiScanRes.data.error.message.includes('Executable binary signature'));

    // 11. Admin Manual Reset of Tripped Circuit Breaker
    console.log('Test 11: Admin can reset tripped circuit breaker to CLOSED');
    integrationsService.getCircuitBreaker('PAYMENT_GATEWAY').trip();
    assert.equal(
      integrationsService.getCircuitBreaker('PAYMENT_GATEWAY').getMetrics().state,
      'OPEN',
    );

    const resetRes = await apiJson(
      baseUrl,
      '/api/v1/integrations/circuit-breaker/PAYMENT_GATEWAY/reset',
      {
        method: 'POST',
        token: adminUser.token,
      },
    );
    assert.equal(resetRes.status, 200);
    assert.equal(
      integrationsService.getCircuitBreaker('PAYMENT_GATEWAY').getMetrics().state,
      'CLOSED',
    );

    // Customer role forbidden check
    const unauthResetRes = await apiJson(
      baseUrl,
      '/api/v1/integrations/circuit-breaker/PAYMENT_GATEWAY/reset',
      {
        method: 'POST',
        token: customerUser.token,
      },
    );
    assert.equal(unauthResetRes.status, 403);

    console.log('--- All 11 Checkpoint 33 Verification Tests Passed Successfully! ---');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Checkpoint 33 Verification Failed:', err);
  process.exit(1);
});
