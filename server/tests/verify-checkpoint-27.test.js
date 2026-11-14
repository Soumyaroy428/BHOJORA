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
const { InMemoryFinanceStore } = require('../dist/modules/finance/finance.store.js');
const { FinanceService } = require('../dist/modules/finance/finance.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4027',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp27_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp27!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp27!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp27!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp27!',
    },
    { serviceName: 'bhojora-test-cp27', serviceVersion: '0.1.0' },
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
    json = { raw: text };
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
  assert.equal(res.status, 201, `Failed registering ${email}: ${JSON.stringify(res.body)}`);
  return {
    userId: res.body.data.user.id,
    token: res.body.data.tokens.accessToken,
    name,
  };
}

async function createRoleUser(baseUrl, identityStore, email, phone, name, role) {
  const reg = await registerCustomer(baseUrl, email, phone, name);
  await identityStore.updateUser(reg.userId, { roles: [role] }, new Date());
  const loginRes = await apiJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: { identifier: email, password: TEST_PASSWORD },
  });
  assert.equal(loginRes.status, 200);
  return {
    userId: reg.userId,
    token: loginRes.body.data.tokens.accessToken,
    name,
  };
}

async function main() {
  console.log('=== CHECKPOINT 27: REFUNDS AND SETTLEMENTS ===\n');

  const config = createTestConfig();
  const logger = createLogger(config);
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const rbacStore = new InMemoryRbacStore();
  const financeStore = new InMemoryFinanceStore();

  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const financeService = new FinanceService({
    financeStore,
    clock: { now: () => new Date('2026-11-13T10:00:00Z') },
  });

  const app = createApp({
    config,
    logger,
    identityService,
    rbacStore,
    financeStore,
    financeService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    const financeAdmin = await createRoleUser(
      baseUrl,
      identityStore,
      'finance@bhojora.test',
      '9876547001',
      'Finance Admin',
      'FINANCE_ADMIN',
    );

    const customer = await registerCustomer(
      baseUrl,
      'customer.refunds@bhojora.test',
      '9876547002',
      'Refund Customer',
    );

    const refundRequest = {
      paymentId: 'pay_123',
      orderId: 'ord_123',
      customerId: customer.userId,
      amountPaise: 12500,
      reason: 'Food-quality issue during delivery',
      externalReasonCode: 'QUALITY_ISSUE',
      idempotencyKey: 'refund-key-1',
    };

    const refundCreateRes = await apiJson(baseUrl, '/api/v1/finance/refunds', {
      method: 'POST',
      token: customer.token,
      body: refundRequest,
    });
    assert.equal(refundCreateRes.status, 201, 'Refund creation should succeed');
    assert.equal(refundCreateRes.body.data.refund.status, 'REQUESTED');

    const duplicateRes = await apiJson(baseUrl, '/api/v1/finance/refunds', {
      method: 'POST',
      token: customer.token,
      body: refundRequest,
    });
    assert.equal(duplicateRes.status, 201, 'Duplicate refund request should be idempotent');
    assert.equal(duplicateRes.body.data.refund.refundId, refundCreateRes.body.data.refund.refundId);

    const mfaSendRes = await apiJson(baseUrl, '/api/v1/auth/mfa/send', {
      method: 'POST',
      token: financeAdmin.token,
    });
    assert.equal(mfaSendRes.status, 200, 'Finance admin MFA challenge should send');
    const challengeId = mfaSendRes.body.data.challengeId;
    const latestMfa = otpAdapter.getLatestMessage();
    const codeMatch = latestMfa?.bodyText?.match(/\b(\d{6})\b/);
    assert.ok(codeMatch, 'MFA code should be present in the test OTP adapter output');
    const verifyMfaRes = await apiJson(baseUrl, '/api/v1/auth/mfa/verify', {
      method: 'POST',
      token: financeAdmin.token,
      body: { challengeId, code: codeMatch[1] },
    });
    assert.equal(verifyMfaRes.status, 200, 'Finance admin MFA verification should succeed');

    const approvalRes = await apiJson(
      baseUrl,
      `/api/v1/finance/refunds/${refundCreateRes.body.data.refund.refundId}/approve`,
      {
        method: 'POST',
        token: financeAdmin.token,
        body: {
          decision: 'APPROVED',
          reason: 'Approved after review',
          reviewedByUserId: financeAdmin.userId,
        },
      },
    );
    assert.equal(approvalRes.status, 200, 'Finance admin approval should succeed');
    assert.equal(approvalRes.body.data.refund.status, 'PROCESSING');

    const settlementBatchRes = await apiJson(baseUrl, '/api/v1/finance/settlement-batches', {
      method: 'POST',
      token: financeAdmin.token,
      body: {
        batchName: 'Nov 2026 Payouts',
        periodStartIso: '2026-11-01T00:00:00.000Z',
        periodEndIso: '2026-11-30T23:59:59.999Z',
        provider: 'BANK',
        payoutRecords: [
          { outletId: 'outlet_1', outletName: 'Arsalan', amountPaise: 90000 },
          { outletId: 'outlet_2', outletName: 'Peter Cat', amountPaise: 110000 },
        ],
      },
    });
    assert.equal(settlementBatchRes.status, 201, 'Settlement batch should be created');
    assert.equal(settlementBatchRes.body.data.batch.status, 'PENDING');

    const settlementCalculation = financeService.calculateRestaurantSettlement({
      itemSubtotalPaise: 100000,
      packagingPaise: 5000,
      platformCommissionRatePercent: 18,
      merchantDiscountPaise: 2000,
      taxPaise: 3000,
    });
    assert.equal(
      settlementCalculation,
      100000 + 5000 - 18900 - 2000 + 3000,
      'Settlement calculation mismatch',
    );

    const earnings = await financeService.createPartnerEarningsRecord({
      partnerId: 'partner_01',
      orderId: 'ord_456',
      basePayPaise: 4000,
      distancePayPaise: 2000,
      tipPaise: 3000,
      incentivePaise: 1500,
      taxPaise: 250,
    });
    assert.equal(earnings.totalPaise, 4000 + 2000 + 3000 + 1500 - 250);

    const reconciliationRes = await apiJson(baseUrl, '/api/v1/finance/reconciliations', {
      method: 'POST',
      token: financeAdmin.token,
      body: {
        batchId: settlementBatchRes.body.data.batch.batchId,
        providerReference: 'bnk_ref_001',
        expectedPaise: settlementBatchRes.body.data.batch.totalPaise,
        actualPaise: settlementBatchRes.body.data.batch.totalPaise,
      },
    });
    assert.equal(reconciliationRes.status, 201, 'Reconciliation should be saved');
    assert.equal(reconciliationRes.body.data.reconciliation.status, 'MATCHED');

    const summaryRes = await apiJson(baseUrl, '/api/v1/finance/summary', {
      method: 'GET',
      token: financeAdmin.token,
    });
    assert.equal(summaryRes.status, 200, 'Finance summary route should work');
    assert.ok(Array.isArray(summaryRes.body.data.refunds));
    assert.ok(Array.isArray(summaryRes.body.data.batches));

    const logsRes = await apiJson(baseUrl, '/api/v1/finance/ledger', {
      method: 'GET',
      token: financeAdmin.token,
    });
    assert.equal(logsRes.status, 200, 'Ledger route should work');
    assert.ok(Array.isArray(logsRes.body.data.entries));

    const routeDenied = await apiJson(baseUrl, '/api/v1/finance/ledger', {
      method: 'GET',
      token: customer.token,
    });
    assert.equal(routeDenied.status, 403, 'Customer without finance permissions should be blocked');

    console.log('10 checkpoint-27 checks passed');
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
