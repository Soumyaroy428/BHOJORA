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
const { InMemoryAnalyticsStore } = require('../dist/modules/analytics/analytics.store.js');
const { AnalyticsService } = require('../dist/modules/analytics/analytics.service.js');
const {
  REPORT_TYPES,
  REPORT_FORMATS,
  ANALYTICS_TIMEFRAMES,
} = require('../dist/modules/analytics/analytics.types.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4031',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp31_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp31!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp31!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp31!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp31!',
    },
    { serviceName: 'bhojora-test-cp31', serviceVersion: '0.1.0' },
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
  return { status: response.status, json, text };
}

async function createAuthenticatedUser(baseUrl, identityStore, otpAdapter, email, phone, role) {
  const regRes = await apiJson(baseUrl, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      email,
      phone,
      name: `User ${role}`,
      password: TEST_PASSWORD,
      acceptTerms: true,
    },
  });
  assert.equal(regRes.status, 201, `Registration failed for ${email}`);
  const userId = regRes.json.data.user.id;

  if (role && role !== 'CUSTOMER') {
    await identityStore.updateUser(userId, { roles: [role] }, new Date());
  }

  const loginRes = await apiJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      identifier: email,
      password: TEST_PASSWORD,
    },
  });
  assert.equal(loginRes.status, 200, `Login failed for ${email}`);
  const token = loginRes.json.data.tokens.accessToken;

  // Handle MFA step-up if privileged role
  if (['SUPER_ADMIN', 'OPS_ADMIN', 'FINANCE_ADMIN', 'TRUST_ADMIN'].includes(role)) {
    const mfaSendRes = await apiJson(baseUrl, '/api/v1/auth/mfa/send', {
      method: 'POST',
      token,
    });
    if (mfaSendRes.status === 200) {
      const challengeId = mfaSendRes.json.data.challengeId;
      const latestMfa = otpAdapter.getLatestMessage();
      const codeMatch = latestMfa?.bodyText?.match(/\b(\d{6})\b/);
      if (codeMatch) {
        await apiJson(baseUrl, '/api/v1/auth/mfa/verify', {
          method: 'POST',
          token,
          body: {
            challengeId,
            code: codeMatch[1],
          },
        });
      }
    }
  }

  return {
    userId,
    token,
  };
}

async function runCheckpoint31Verification() {
  console.log('\n======================================================');
  console.log('   BHOJORA Checkpoint 31 Verification Suite');
  console.log('   Analytics & Reporting (Marketplace, Outlets, Fleet,');
  console.log('   Finance Reconciliation, Trust Safety & Scoped Exports)');
  console.log('======================================================\n');

  const config = createTestConfig();
  const logger = createLogger({
    level: 'warn',
    service: 'cp31-test',
    environment: 'test',
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
  const analyticsStore = new InMemoryAnalyticsStore();
  const analyticsService = new AnalyticsService({ analyticsStore });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    analyticsStore,
    analyticsService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // ---------------------------------------------------------
    // Setup Test Users & Tenants
    // ---------------------------------------------------------
    const adminUser = await createAuthenticatedUser(
      baseUrl,
      identityStore,
      otpAdapter,
      'superadmin@bhojora.com',
      '+919830000001',
      'SUPER_ADMIN',
    );

    const ownerA = await createAuthenticatedUser(
      baseUrl,
      identityStore,
      otpAdapter,
      'owner.arsalan@bhojora.com',
      '+919830000002',
      'RESTAURANT_OWNER',
    );

    const ownerB = await createAuthenticatedUser(
      baseUrl,
      identityStore,
      otpAdapter,
      'owner.petercat@bhojora.com',
      '+919830000003',
      'RESTAURANT_OWNER',
    );

    const customerUser = await createAuthenticatedUser(
      baseUrl,
      identityStore,
      otpAdapter,
      'customer.kolkata@bhojora.com',
      '+919830000004',
      'CUSTOMER',
    );

    // Seed RBAC memberships for outlet isolation
    await rbacStore.upsertMembership({
      userId: ownerA.userId,
      restaurantId: 'rest_arsalan',
      outletId: 'outlet_arsalan_parkcircus',
      role: 'RESTAURANT_OWNER',
      status: 'ACTIVE',
      grantedByUserId: adminUser.userId,
      now: new Date(),
    });

    await rbacStore.upsertMembership({
      userId: ownerB.userId,
      restaurantId: 'rest_petercat',
      outletId: 'outlet_petercat_parkst',
      role: 'RESTAURANT_OWNER',
      status: 'ACTIVE',
      grantedByUserId: adminUser.userId,
      now: new Date(),
    });

    // ---------------------------------------------------------
    // Seed Sample Analytics Data across Kolkata Outlets
    // ---------------------------------------------------------
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);

    const sampleOrders = [
      {
        orderId: 'ord_001',
        customerId: 'cust_101',
        customerName: 'Soumya Roy',
        customerPhone: '+919830011223',
        deliveryAddress: 'Flat 4B, 12 Park Circus, Kolkata, West Bengal',
        outletId: 'outlet_arsalan_parkcircus',
        outletName: 'Arsalan — Park Circus',
        zoneId: 'zone_central',
        zoneName: 'Park Street / Central',
        status: 'DELIVERED',
        subtotalPaise: 50000,
        deliveryFeePaise: 4000,
        taxesPaise: 2500,
        platformFeePaise: 1000,
        discountPaise: 5000,
        totalPaise: 52500,
        prepDurationMinutes: 18,
        deliveryDurationMinutes: 24,
        isOnTime: true,
        items: [{ itemId: 'item_biryani', name: 'Mutton Biryani', quantity: 2, pricePaise: 25000 }],
        createdAt: twoDaysAgo,
      },
      {
        orderId: 'ord_002',
        customerId: 'cust_102',
        customerName: 'Ananya Mukherjee',
        customerPhone: '+919830099887',
        deliveryAddress: 'Block CF 210, Sector I, Salt Lake, Kolkata',
        outletId: 'outlet_arsalan_parkcircus',
        outletName: 'Arsalan — Park Circus',
        zoneId: 'zone_saltlake',
        zoneName: 'Salt Lake / Sector V',
        status: 'DELIVERED',
        subtotalPaise: 30000,
        deliveryFeePaise: 4500,
        taxesPaise: 1500,
        platformFeePaise: 1000,
        discountPaise: 0,
        totalPaise: 37000,
        prepDurationMinutes: 15,
        deliveryDurationMinutes: 28,
        isOnTime: true,
        items: [{ itemId: 'item_kebab', name: 'Reshmi Kebab', quantity: 1, pricePaise: 30000 }],
        createdAt: twoDaysAgo,
      },
      {
        orderId: 'ord_003',
        customerId: 'cust_103',
        customerName: 'Rahul Banerjee',
        customerPhone: '+919830055443',
        deliveryAddress: '18A Park Street, Kolkata, West Bengal',
        outletId: 'outlet_petercat_parkst',
        outletName: 'Peter Cat — Park Street',
        zoneId: 'zone_central',
        zoneName: 'Park Street / Central',
        status: 'DELIVERED',
        subtotalPaise: 80000,
        deliveryFeePaise: 3500,
        taxesPaise: 4000,
        platformFeePaise: 1000,
        discountPaise: 10000,
        totalPaise: 78500,
        prepDurationMinutes: 22,
        deliveryDurationMinutes: 19,
        isOnTime: true,
        items: [{ itemId: 'item_chelo', name: 'Chelo Kebab', quantity: 2, pricePaise: 40000 }],
        createdAt: fourDaysAgo,
      },
      {
        orderId: 'ord_004',
        customerId: 'cust_104',
        customerName: 'Priya Sen',
        customerPhone: '+919830033221',
        deliveryAddress: 'Southern Avenue, Ballygunge, Kolkata',
        outletId: 'outlet_petercat_parkst',
        outletName: 'Peter Cat — Park Street',
        zoneId: 'zone_south',
        zoneName: 'Ballygunge / South',
        status: 'CANCELLED',
        subtotalPaise: 40000,
        deliveryFeePaise: 3500,
        taxesPaise: 2000,
        platformFeePaise: 1000,
        discountPaise: 0,
        totalPaise: 46500,
        items: [
          { itemId: 'item_sizzler', name: 'Chicken Sizzler', quantity: 1, pricePaise: 40000 },
        ],
        createdAt: fourDaysAgo,
      },
    ];

    const sampleInspections = [
      {
        inspectionId: 'insp_001',
        outletId: 'outlet_arsalan_parkcircus',
        outletName: 'Arsalan — Park Circus',
        score: 94,
        criticalViolationsCount: 0,
        status: 'PASSED',
        conductedAt: fourDaysAgo,
      },
      {
        inspectionId: 'insp_002',
        outletId: 'outlet_petercat_parkst',
        outletName: 'Peter Cat — Park Street',
        score: 92,
        criticalViolationsCount: 0,
        status: 'PASSED',
        conductedAt: fourDaysAgo,
      },
    ];

    const sampleComplaints = [
      {
        complaintId: 'comp_001',
        outletId: 'outlet_arsalan_parkcircus',
        outletName: 'Arsalan — Park Circus',
        category: 'PACKAGING',
        severity: 'LOW',
        status: 'RESOLVED',
        resolutionHours: 3.5,
        createdAt: twoDaysAgo,
      },
    ];

    await analyticsStore.seedSampleData(sampleOrders, sampleInspections, sampleComplaints);

    // ---------------------------------------------------------
    // Check 1: Contract Parity and Allowed Constants
    // ---------------------------------------------------------
    console.log('[Check 1] Verifying contract definitions and analytics types...');
    assert.deepEqual(
      [...REPORT_TYPES],
      ['MARKETPLACE', 'RESTAURANT', 'DELIVERY', 'FINANCE', 'TRUST_SAFETY'],
    );
    assert.deepEqual([...REPORT_FORMATS], ['CSV', 'JSON']);
    assert.ok(ANALYTICS_TIMEFRAMES.includes('TODAY'));
    assert.ok(ANALYTICS_TIMEFRAMES.includes('LAST_7_DAYS'));
    console.log('   ✓ Contract parity and enum catalogs verified.');

    // ---------------------------------------------------------
    // Check 2: Admin Marketplace KPI Aggregations
    // ---------------------------------------------------------
    console.log('[Check 2] Admin querying marketplace KPI overview...');
    const overviewRes = await apiJson(baseUrl, '/api/v1/analytics/overview?timeframe=LAST_7_DAYS', {
      token: adminUser.token,
    });
    assert.equal(overviewRes.status, 200);
    const kpi = overviewRes.json.data;
    assert.equal(kpi.completedOrdersCount, 3);
    assert.equal(kpi.cancelledOrdersCount, 1);
    assert.equal(kpi.cancellationRatePercent, 25.0); // 1 / 4 = 25%
    assert.equal(kpi.uniqueActiveCustomersCount, 3);
    // Subtotal: 50,000 + 30,000 + 80,000 = 160,000 paise
    assert.equal(kpi.itemsSubtotalPaise, 160000);
    // Delivery fees: 4,000 + 4,500 + 3,500 = 12,000 paise
    assert.equal(kpi.deliveryFeesPaise, 12000);
    // Taxes: 2,500 + 1,500 + 4,000 = 8,000 paise
    assert.equal(kpi.taxesPaise, 8000);
    // Platform fees: 1,000 + 1,000 + 1,000 = 3,000 paise
    assert.equal(kpi.platformFeesPaise, 3000);
    // Discounts: 5,000 + 0 + 10,000 = 15,000 paise
    assert.equal(kpi.discountsPaise, 15000);
    // Total GMV = 160000 + 12000 + 8000 + 3000 - 15000 = 168000 paise
    assert.equal(kpi.totalGmvPaise, 168000);
    assert.equal(kpi.averageOrderValuePaise, 56000); // 168000 / 3 = 56000
    assert.ok(Array.isArray(kpi.kolkataZoneBreakdown));
    assert.ok(kpi.kolkataZoneBreakdown.length >= 2);
    console.log('   ✓ Marketplace KPI overview aggregated correctly.');

    // ---------------------------------------------------------
    // Check 3: Financial Reconciliation Invariant
    // ---------------------------------------------------------
    console.log('[Check 3] Verifying financial reconciliation invariant...');
    const financeRes = await apiJson(baseUrl, '/api/v1/analytics/finance?timeframe=LAST_7_DAYS', {
      token: adminUser.token,
    });
    assert.equal(financeRes.status, 200);
    const finance = financeRes.json.data;
    assert.equal(finance.reconciledGmvPaise, 168000);
    assert.equal(finance.gatewaySettledPaise, 168000);
    // 15% platform commission on 160,000 subtotal = 24,000 paise
    assert.equal(finance.platformCommissionEarnedPaise, 24000);
    // Vouchers: 60% of 15,000 = 9,000 paise platform funded
    assert.equal(finance.voucherSubsidyPlatformPaise, 9000);
    // 40% of 15,000 = 6,000 paise restaurant funded
    assert.equal(finance.voucherSubsidyRestaurantPaise, 6000);
    assert.equal(finance.unreconciledDiscrepancyPaise, 0);
    assert.equal(finance.reconciliationStatus, 'BALANCED');
    console.log(
      '   ✓ Financial reconciliation invariant verified: 0 discrepancy, status BALANCED.',
    );

    // ---------------------------------------------------------
    // Check 4: Restaurant Scoped Operations & Turnaround KPIs
    // ---------------------------------------------------------
    console.log('[Check 4] Restaurant owner querying their own outlet KPIs...');
    const arsalanRes = await apiJson(
      baseUrl,
      '/api/v1/analytics/restaurant/outlet_arsalan_parkcircus?timeframe=LAST_7_DAYS',
      { token: ownerA.token },
    );
    assert.equal(arsalanRes.status, 200);
    const restKpi = arsalanRes.json.data;
    assert.equal(restKpi.outletId, 'outlet_arsalan_parkcircus');
    assert.equal(restKpi.orderCount, 2);
    // Gross subtotal: 50,000 + 30,000 = 80,000 paise
    assert.equal(restKpi.grossRevenuePaise, 80000);
    // 15% commission = 12,000 paise
    assert.equal(restKpi.commissionDeductedPaise, 12000);
    assert.equal(restKpi.netPayoutPaise, 68000);
    assert.equal(restKpi.averagePreparationTimeMinutes, 16.5); // (18 + 15) / 2
    assert.equal(restKpi.hygieneAuditScore, 94);
    assert.equal(restKpi.hygieneStatus, 'VERIFIED_CLEAN');
    assert.ok(restKpi.topSellingItems.some((i) => i.itemId === 'item_biryani'));
    console.log('   ✓ Restaurant scoped operations, net payout & turnaround KPIs verified.');

    // ---------------------------------------------------------
    // Check 5: Tenant Isolation Gate (Reject Cross-Outlet Access)
    // ---------------------------------------------------------
    console.log('[Check 5] Verifying tenant isolation: reject cross-outlet access...');
    const breachRes = await apiJson(
      baseUrl,
      '/api/v1/analytics/restaurant/outlet_petercat_parkst?timeframe=LAST_7_DAYS',
      { token: ownerA.token },
    );
    assert.equal(breachRes.status, 403, 'Cross-outlet access must be denied with 403');
    assert.ok(
      breachRes.json.error.message.includes('Tenant isolation violation'),
      'Must explain tenant isolation violation',
    );
    console.log('   ✓ Tenant isolation strictly enforced (403 Forbidden).');

    // ---------------------------------------------------------
    // Check 6: Delivery Fleet & Logistics KPIs
    // ---------------------------------------------------------
    console.log('[Check 6] Admin querying delivery fleet & rider KPIs...');
    const fleetRes = await apiJson(baseUrl, '/api/v1/analytics/delivery?timeframe=LAST_7_DAYS', {
      token: adminUser.token,
    });
    assert.equal(fleetRes.status, 200);
    const fleet = fleetRes.json.data;
    assert.equal(fleet.completedDeliveriesCount, 3);
    assert.equal(fleet.onTimeDeliveryRatePercent, 100);
    assert.equal(fleet.averageDeliveryTimeMinutes, 23.7); // (24 + 28 + 19) / 3 = 23.66 -> 23.7
    assert.equal(fleet.totalRiderPayoutPaise, 3 * 4500); // 13,500 paise
    assert.ok(fleet.activeRidersCount >= 1);
    assert.ok(Array.isArray(fleet.zoneDeliveryPerformance));
    console.log('   ✓ Delivery fleet KPIs, OTD rate & zone performance verified.');

    // ---------------------------------------------------------
    // Check 7: Trust, Safety & Hygiene Audit KPIs
    // ---------------------------------------------------------
    console.log('[Check 7] Admin querying trust, safety and hygiene metrics...');
    const trustRes = await apiJson(baseUrl, '/api/v1/analytics/trust?timeframe=LAST_7_DAYS', {
      token: adminUser.token,
    });
    assert.equal(trustRes.status, 200);
    const trust = trustRes.json.data;
    assert.equal(trust.verifiedCleanCount, 2);
    assert.equal(trust.verifiedCleanPercentage, 100);
    assert.equal(trust.averageHygieneScore, 93.0); // (94 + 92) / 2
    assert.equal(trust.criticalViolationsReported, 0);
    assert.equal(trust.criticalViolationsSuspended, 0);
    assert.equal(trust.hygieneComplaintsCount, 1);
    assert.equal(trust.averageComplaintResolutionHours, 3.5);
    console.log('   ✓ Trust, safety & hygiene metrics aggregated accurately.');

    // ---------------------------------------------------------
    // Check 8: CSV Export with PII Minimization
    // ---------------------------------------------------------
    console.log('[Check 8] Generating PII-sanitized CSV export...');
    const csvRes = await apiJson(baseUrl, '/api/v1/analytics/export', {
      method: 'POST',
      token: adminUser.token,
      body: {
        reportType: 'MARKETPLACE',
        format: 'CSV',
        timeframe: 'LAST_7_DAYS',
      },
    });
    assert.equal(csvRes.status, 200);
    const csvData = csvRes.json.data;
    assert.equal(csvData.format, 'CSV');
    assert.equal(csvData.contentType, 'text/csv');
    assert.ok(csvData.piiSanitized);
    assert.equal(csvData.rowCount, 4);

    // Verify CSV content and strict PII minimization:
    assert.ok(
      csvData.data.includes('Order_ID,Customer_Masked_ID,Customer_Initials,Customer_Phone_Masked'),
    );
    // Ensure plaintext customer phone numbers are NOT present
    assert.ok(!csvData.data.includes('+919830011223'), 'Plaintext customer phone must not appear');
    assert.ok(csvData.data.includes('+9198300****23'), 'Masked phone must appear');
    // Ensure full street address is sanitized to locality only
    assert.ok(
      !csvData.data.includes('Flat 4B, 12 Park Circus'),
      'Exact door/street number must be redacted',
    );
    assert.ok(csvData.data.includes('Park Circus, Kolkata'), 'Locality and city preserved');
    // Ensure customer name is masked to initials
    assert.ok(!csvData.data.includes('Soumya Roy'), 'Plaintext full customer name must not appear');
    assert.ok(csvData.data.includes('S. R.'), 'Customer name masked to initials');
    console.log(
      '   ✓ CSV report generated with strict PII masking (names, phones, street addresses).',
    );

    // ---------------------------------------------------------
    // Check 9: JSON Export with Structured Sanitation
    // ---------------------------------------------------------
    console.log('[Check 9] Generating PII-sanitized JSON export...');
    const jsonRes = await apiJson(baseUrl, '/api/v1/analytics/export', {
      method: 'POST',
      token: adminUser.token,
      body: {
        reportType: 'FINANCE',
        format: 'JSON',
        timeframe: 'LAST_7_DAYS',
      },
    });
    assert.equal(jsonRes.status, 200);
    const jsonExport = jsonRes.json.data;
    assert.equal(jsonExport.format, 'JSON');
    assert.ok(jsonExport.piiSanitized);
    const parsedPayload = JSON.parse(jsonExport.data);
    assert.equal(parsedPayload.piiSanitized, true);
    assert.equal(parsedPayload.recordCount, 4);
    assert.ok(parsedPayload.records[0].customerPhoneMasked.includes('****'));
    assert.ok(parsedPayload.records[0].customerMaskedId.includes('****'));
    console.log('   ✓ JSON export generated with valid JSON structure and masked PII.');

    // ---------------------------------------------------------
    // Check 10: Least Privilege & RBAC Scope Enforcement
    // ---------------------------------------------------------
    console.log(
      '[Check 10] Testing access scopes: unauth, customer, and restaurant staff restrictions...',
    );
    // Unauthenticated
    const unauth = await apiJson(baseUrl, '/api/v1/analytics/overview');
    assert.equal(unauth.status, 401, 'Unauthenticated request must be 401');

    // Customer
    const custRes = await apiJson(baseUrl, '/api/v1/analytics/overview', {
      token: customerUser.token,
    });
    assert.equal(custRes.status, 403, 'Customer role must be denied 403');

    // Restaurant owner attempting to export platform-wide marketplace data
    const ownerIllegalExport = await apiJson(baseUrl, '/api/v1/analytics/export', {
      method: 'POST',
      token: ownerA.token,
      body: {
        reportType: 'MARKETPLACE',
        format: 'CSV',
      },
    });
    assert.equal(ownerIllegalExport.status, 403, 'Restaurant staff cannot export marketplace data');

    // Restaurant owner exporting their own RESTAURANT report is permitted
    const ownerLegalExport = await apiJson(baseUrl, '/api/v1/analytics/export', {
      method: 'POST',
      token: ownerA.token,
      body: {
        reportType: 'RESTAURANT',
        format: 'CSV',
        outletId: 'outlet_arsalan_parkcircus',
      },
    });
    assert.equal(
      ownerLegalExport.status,
      200,
      'Restaurant owner can export their own restaurant report',
    );
    assert.equal(ownerLegalExport.json.data.rowCount, 2);
    console.log('   ✓ Least privilege & access scoping strictly enforced (401/403).');

    console.log('\n======================================================');
    console.log('   ✓ ALL 10 CHECKPOINT 31 VERIFICATION CHECKS PASSED');
    console.log('======================================================\n');
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

runCheckpoint31Verification().catch((err) => {
  console.error('\n❌ Checkpoint 31 Verification Failed:', err);
  process.exit(1);
});
