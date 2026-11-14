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
const { InMemoryPromotionsStore } = require('../dist/modules/promotions/promotions.store.js');
const { PromotionsService } = require('../dist/modules/promotions/promotions.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4030',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp30_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp30!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp30!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp30!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp30!',
    },
    { serviceName: 'bhojora-test-cp30', serviceVersion: '0.1.0' },
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

async function runCheckpoint30Tests() {
  console.log('--- Starting Checkpoint 30 Verification Suite (Promotions & Loyalty) ---');

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
  const promotionsStore = new InMemoryPromotionsStore();
  const promotionsService = new PromotionsService({
    promotionsStore,
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    promotionsStore,
    promotionsService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // 1. Setup Actors
    const customerA = await registerCustomer(
      baseUrl,
      'customer.a@kolkata.test',
      '9830022201',
      'Debashis Sen',
    );

    const customerB = await registerCustomer(
      baseUrl,
      'customer.b@kolkata.test',
      '9830022202',
      'Ruma Banerjee',
    );

    const admin = await createRoleUser(
      baseUrl,
      identityStore,
      otpAdapter,
      'admin.promo@bhojora.test',
      '9830022299',
      'Promo Admin',
      'SUPER_ADMIN',
    );

    // [Check 1] Admin Create Campaign with Budget Cap
    console.log('[Check 1] Validating campaign creation with budget ceiling...');
    // Unauthenticated/Customer fails
    const unauthCamp = await apiJson(baseUrl, '/api/v1/admin/promotions/campaigns', {
      method: 'POST',
      token: customerA.token,
      body: {
        title: 'Festival Feast 2026',
        description: 'Autumn celebration discounts in Kolkata',
        budgetCapPaise: 100000, // ₹1,000.00
        validFrom: new Date(Date.now() - 3600000).toISOString(),
        validUntil: new Date(Date.now() + 86400000 * 30).toISOString(),
      },
    });
    assert.equal(unauthCamp.status, 403, 'Customer must not create marketing campaigns');

    // Admin creates campaign
    const adminCamp = await apiJson(baseUrl, '/api/v1/admin/promotions/campaigns', {
      method: 'POST',
      token: admin.token,
      body: {
        title: 'Durga Puja Food Walk 2026',
        description: 'Subsidized festive biryani & sweets campaign',
        budgetCapPaise: 50000, // ₹500.00 cap
        validFrom: new Date(Date.now() - 3600000).toISOString(),
        validUntil: new Date(Date.now() + 86400000 * 30).toISOString(),
      },
    });
    assert.equal(adminCamp.status, 201);
    const campaignId = adminCamp.body.data.campaign.campaignId;
    assert.ok(campaignId);
    assert.equal(adminCamp.body.data.campaign.currentSpendPaise, 0);
    assert.equal(adminCamp.body.data.campaign.status, 'ACTIVE');
    console.log('✓ [Check 1] Promotional campaign created with strict budget cap enforcement.');

    // [Check 2] Admin Create Coupon with Transparent Terms & Funding Split
    console.log('[Check 2] Validating coupon creation with transparent funding terms...');
    const createCouponRes = await apiJson(baseUrl, '/api/v1/admin/promotions/coupons', {
      method: 'POST',
      token: admin.token,
      body: {
        campaignId,
        code: 'PUJA50',
        title: '50% Festive Feast',
        description: '50% off on authentic Kolkata feasts up to ₹150',
        termsConditions: [
          'Minimum cart value ₹300.00',
          'Maximum discount ₹150.00',
          'Valid in Park Street and Salt Lake corridors',
          '1 redemption per customer account',
        ],
        discountType: 'PERCENT_BPS',
        discountValue: 5000, // 50%
        minOrderSubtotalPaise: 30000, // ₹300
        maxDiscountPaise: 15000, // ₹150
        platformShareBps: 6000, // 60% Platform funded
        applicableZones: ['park_street', 'salt_lake'],
        totalRedemptionLimit: 100,
        perUserRedemptionLimit: 1,
        firstOrderOnly: false,
        validFrom: new Date(Date.now() - 3600000).toISOString(),
        validUntil: new Date(Date.now() + 86400000 * 30).toISOString(),
      },
    });
    assert.equal(createCouponRes.status, 201);
    const createdCoupon = createCouponRes.body.data.coupon;
    assert.equal(createdCoupon.code, 'PUJA50');
    assert.equal(createdCoupon.fundingSummaryLabel, '60% Platform / 40% Restaurant Funded');
    assert.equal(createdCoupon.termsConditions.length, 4);
    console.log('✓ [Check 2] Coupon created with explicit funding breakdown and terms.');

    // [Check 3] Public Active Coupons Listing
    console.log('[Check 3] Validating public coupon catalogue listing...');
    const publicCoupons = await apiJson(baseUrl, '/api/v1/promotions/coupons');
    assert.equal(publicCoupons.status, 200);
    assert.ok(publicCoupons.body.data.coupons.some((c) => c.code === 'PUJA50'));
    console.log('✓ [Check 3] Public active coupons listed with transparent funding labels.');

    // [Check 4] Coupon Validation & Calculation Precision
    console.log(
      '[Check 4] Validating discount calculation and split precision on cart subtotal...',
    );
    // Cart of ₹400 (40000 paise). 50% = ₹200, capped at max ₹150 (15000 paise)
    // 60% Platform = ₹90 (9000 paise), 40% Restaurant = ₹60 (6000 paise)
    const valRes = await apiJson(baseUrl, '/api/v1/promotions/coupons/validate', {
      method: 'POST',
      token: customerA.token,
      body: {
        code: 'PUJA50',
        subtotalPaise: 40000,
        zoneId: 'park_street',
        isFirstOrder: false,
      },
    });
    assert.equal(valRes.status, 200);
    assert.equal(valRes.body.data.valid, true);
    assert.equal(valRes.body.data.discountPaise, 15000); // ₹150.00
    assert.equal(valRes.body.data.platformDiscountPaise, 9000); // ₹90.00
    assert.equal(valRes.body.data.restaurantDiscountPaise, 6000); // ₹60.00
    assert.equal(valRes.body.data.fundingSummary, '60% Platform / 40% Restaurant Funded');
    console.log(
      '✓ [Check 4] Mathematical discount capping and multi-party funding split verified.',
    );

    // [Check 5] Eligibility Controls (Minimum Order & New Customer Flags)
    console.log('[Check 5] Validating cart subtotal & new customer eligibility barriers...');
    // Below minimum order ₹300
    const minOrderFail = await apiJson(baseUrl, '/api/v1/promotions/coupons/validate', {
      method: 'POST',
      token: customerA.token,
      body: {
        code: 'PUJA50',
        subtotalPaise: 25000, // ₹250 < ₹300
        zoneId: 'park_street',
      },
    });
    assert.equal(minOrderFail.status, 200);
    assert.equal(minOrderFail.body.data.valid, false);
    assert.ok(minOrderFail.body.data.reason.includes('minimum order requirement'));

    // First order only coupon
    await promotionsService.createCoupon({
      code: 'FIRSTFEAST',
      title: 'First Order Special',
      description: 'Flat ₹100 off on your first order',
      termsConditions: ['Valid on first order only'],
      discountType: 'FLAT_PAISE',
      discountValue: 10000,
      maxDiscountPaise: 10000,
      firstOrderOnly: true,
      validFrom: new Date(Date.now() - 3600000),
      validUntil: new Date(Date.now() + 86400000),
    });

    // Attempt with existing customer (isFirstOrder: false)
    const notFirst = await apiJson(baseUrl, '/api/v1/promotions/coupons/validate', {
      method: 'POST',
      token: customerA.token,
      body: {
        code: 'FIRSTFEAST',
        subtotalPaise: 30000,
        isFirstOrder: false,
      },
    });
    assert.equal(notFirst.status, 200);
    assert.equal(notFirst.body.data.valid, false);
    assert.ok(notFirst.body.data.reason.includes('first-time Bhojora orders'));

    // Attempt with new customer (isFirstOrder: true)
    const isFirst = await apiJson(baseUrl, '/api/v1/promotions/coupons/validate', {
      method: 'POST',
      token: customerB.token,
      body: {
        code: 'FIRSTFEAST',
        subtotalPaise: 30000,
        isFirstOrder: true,
      },
    });
    assert.equal(isFirst.status, 200);
    assert.equal(isFirst.body.data.valid, true);
    assert.equal(isFirst.body.data.discountPaise, 10000);
    console.log('✓ [Check 5] Minimum subtotal and first-order eligibility guards verified.');

    // [Check 6] Campaign Budget Ceiling Enforcement
    console.log('[Check 6] Validating campaign budget exhaustion protection...');
    // Total campaign budget is ₹500 (50000 paise).
    // Simulate 3 redemptions of ₹150 (45000 paise total)
    await promotionsService.recordRedemption({
      code: 'PUJA50',
      userId: 'usr_mock_1',
      orderId: 'ord_mock_1',
      discountPaise: 15000,
    });
    await promotionsService.recordRedemption({
      code: 'PUJA50',
      userId: 'usr_mock_2',
      orderId: 'ord_mock_2',
      discountPaise: 15000,
    });
    await promotionsService.recordRedemption({
      code: 'PUJA50',
      userId: 'usr_mock_3',
      orderId: 'ord_mock_3',
      discountPaise: 15000,
    });
    // Current spend is 45000 / 50000 paise.
    // Another ₹150 discount would exceed 50000 cap!
    const budgetExceeded = await apiJson(baseUrl, '/api/v1/promotions/coupons/validate', {
      method: 'POST',
      token: customerA.token,
      body: {
        code: 'PUJA50',
        subtotalPaise: 40000,
        zoneId: 'park_street',
      },
    });
    assert.equal(budgetExceeded.status, 200);
    assert.equal(budgetExceeded.body.data.valid, false);
    assert.ok(
      budgetExceeded.body.data.reason.includes(
        'Promotional budget for this campaign has been fully consumed',
      ),
    );
    console.log(
      '✓ [Check 6] Campaign budget cap enforced: stops redemptions when budget ceiling is reached.',
    );

    // [Check 7] Abuse Control (Per-User Redemption Ceiling)
    console.log('[Check 7] Validating per-user abuse limits...');
    // Create coupon with perUserRedemptionLimit: 1
    await promotionsService.createCoupon({
      code: 'ONCEONLY',
      title: 'One-Time Treat',
      description: 'Flat ₹50 off once per user',
      termsConditions: ['One per customer'],
      discountType: 'FLAT_PAISE',
      discountValue: 5000,
      maxDiscountPaise: 5000,
      perUserRedemptionLimit: 1,
      validFrom: new Date(Date.now() - 3600000),
      validUntil: new Date(Date.now() + 86400000),
    });

    // Record one redemption for Customer A
    await promotionsService.recordRedemption({
      code: 'ONCEONLY',
      userId: customerA.userId,
      orderId: 'ord_cust_a_1',
      discountPaise: 5000,
    });

    // Customer A attempts second validation
    const abuseFail = await apiJson(baseUrl, '/api/v1/promotions/coupons/validate', {
      method: 'POST',
      token: customerA.token,
      body: {
        code: 'ONCEONLY',
        subtotalPaise: 20000,
      },
    });
    assert.equal(abuseFail.status, 200);
    assert.equal(abuseFail.body.data.valid, false);
    assert.ok(
      abuseFail.body.data.reason.includes(
        'already redeemed this promotion the maximum allowed 1 time',
      ),
    );

    // Customer B has not redeemed yet -> valid
    const custBVal = await apiJson(baseUrl, '/api/v1/promotions/coupons/validate', {
      method: 'POST',
      token: customerB.token,
      body: {
        code: 'ONCEONLY',
        subtotalPaise: 20000,
      },
    });
    assert.equal(custBVal.status, 200);
    assert.equal(custBVal.body.data.valid, true);
    console.log('✓ [Check 7] Per-user redemption limit strictly blocks coupon replay abuse.');

    // [Check 8] Referral Program & Self-Referral Prevention
    console.log('[Check 8] Validating customer referral engine and self-referral prevention...');
    const referralInfo = await apiJson(baseUrl, '/api/v1/promotions/referral', {
      token: customerA.token,
    });
    assert.equal(referralInfo.status, 200);
    const codeA = referralInfo.body.data.referral.referralCode;
    assert.ok(codeA.startsWith('BHOJ-'));

    // Customer A tries to apply their own referral code
    const selfReferral = await apiJson(baseUrl, '/api/v1/promotions/referral/apply', {
      method: 'POST',
      token: customerA.token,
      body: { referralCode: codeA },
    });
    assert.ok(
      selfReferral.status >= 400 || !selfReferral.body.success,
      'Self-referral must be rejected',
    );

    // Customer B applies Customer A's code
    const applyRef = await apiJson(baseUrl, '/api/v1/promotions/referral/apply', {
      method: 'POST',
      token: customerB.token,
      body: { referralCode: codeA },
    });
    assert.equal(applyRef.status, 200);
    assert.equal(applyRef.body.data.success, true);

    // Customer B qualifies referral upon first order completion
    await promotionsService.qualifyReferral(customerB.userId, 'ord_referee_first_123');

    // Verify referrer received 100 points and referee received 50 points
    const loyaltyA = await promotionsService.getLoyaltyAccount(customerA.userId);
    const loyaltyB = await promotionsService.getLoyaltyAccount(customerB.userId);
    assert.equal(loyaltyA.pointsBalance, 100, 'Referrer should have 100 bonus points');
    assert.equal(loyaltyB.pointsBalance, 50, 'Referee should have 50 bonus points');
    console.log(
      '✓ [Check 8] Referral workflow verified with self-referral prohibition and ledger crediting.',
    );

    // [Check 9] Loyalty Points Ledger & 20% Cart Redemption Ceiling
    console.log('[Check 9] Validating loyalty points ledger & 20% cart ceiling control...');
    // Customer B has 50 points (₹25 value).
    // On a ₹100 cart (10000 paise), 20% ceiling = ₹20 (2000 paise = 40 points).
    // Attempting to redeem all 50 points (₹25) exceeds the ₹20 ceiling!
    const overCapRedeem = await apiJson(baseUrl, '/api/v1/promotions/loyalty/redeem', {
      method: 'POST',
      token: customerB.token,
      body: {
        pointsToRedeem: 50,
        cartSubtotalPaise: 10000, // ₹100
      },
    });
    assert.ok(
      overCapRedeem.status >= 400 || !overCapRedeem.body.success,
      'Redemption over 20% cart ceiling must be rejected',
    );

    // Redeem valid 40 points (₹20 = 2000 paise)
    const validRedeem = await apiJson(baseUrl, '/api/v1/promotions/loyalty/redeem', {
      method: 'POST',
      token: customerB.token,
      body: {
        pointsToRedeem: 40,
        cartSubtotalPaise: 10000,
      },
    });
    assert.equal(validRedeem.status, 200);
    assert.equal(validRedeem.body.data.pointsDeducted, 40);
    assert.equal(validRedeem.body.data.discountPaise, 2000); // ₹20.00
    assert.equal(validRedeem.body.data.balanceAfter, 10);

    // Verify ledger entry
    const updatedLoyaltyB = await apiJson(baseUrl, '/api/v1/promotions/loyalty', {
      token: customerB.token,
    });
    assert.equal(updatedLoyaltyB.status, 200);
    assert.equal(updatedLoyaltyB.body.data.loyalty.pointsBalance, 10);
    assert.equal(updatedLoyaltyB.body.data.loyalty.recentEntries[0].entryType, 'REDEEM');
    console.log('✓ [Check 9] Loyalty double-entry ledger and 20% cart cap verified.');

    // [Check 10] Clean Dine Club Membership Subscription & 2x Earn Multiplier
    console.log('[Check 10] Validating Clean Dine Club membership & double-points accelerator...');
    // Initial status FREE
    const initMember = await apiJson(baseUrl, '/api/v1/promotions/membership', {
      token: customerA.token,
    });
    assert.equal(initMember.status, 200);
    assert.equal(initMember.body.data.membership.tier, 'FREE');

    // Subscribe to CLEAN_DINE_CLUB
    const subRes = await apiJson(baseUrl, '/api/v1/promotions/membership/subscribe', {
      method: 'POST',
      token: customerA.token,
      body: {
        tier: 'CLEAN_DINE_CLUB',
        durationMonths: 6,
      },
    });
    assert.equal(subRes.status, 201);
    assert.equal(subRes.body.data.subscription.tier, 'CLEAN_DINE_CLUB');
    assert.equal(subRes.body.data.subscription.status, 'ACTIVE');

    // Place ₹500 order -> Club member earns 10% (50 points) vs standard 5% (25 points)
    const earnedClubPoints = await promotionsService.earnOrderPoints(
      customerA.userId,
      'ord_club_boost_99',
      50000, // ₹500
    );
    assert.equal(earnedClubPoints, 50, 'Club member should earn 10 points per ₹100 spent');
    console.log(
      '✓ [Check 10] Clean Dine Club membership foundation & double-points accelerator verified.',
    );

    console.log('\n--- ALL CHECKPOINT 30 PROMOTIONS & LOYALTY CHECKS PASSED SUCCESSFULLY ---');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runCheckpoint30Tests().catch((err) => {
  console.error('Checkpoint 30 Verification Suite Failed:', err);
  process.exit(1);
});
