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
const { InMemoryRestaurantStore } = require('../dist/modules/restaurant/restaurant.store.js');
const { InMemoryOrderStore } = require('../dist/modules/orders/orders.store.js');
const { InMemoryInspectorStore } = require('../dist/modules/inspector/inspector.store.js');
const { InspectorService } = require('../dist/modules/inspector/inspector.service.js');
const { InMemoryInspectionStore } = require('../dist/modules/inspection/inspection.store.js');
const { InspectionService } = require('../dist/modules/inspection/inspection.service.js');
const { InMemorySupportStore } = require('../dist/modules/support/support.store.js');
const { SupportService } = require('../dist/modules/support/support.service.js');
const { SafetyService } = require('../dist/modules/safety/safety.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4025',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp25_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp25!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp25!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp25!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp25!',
    },
    { serviceName: 'bhojora-test-cp25', serviceVersion: '0.1.0' },
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
  const response = await fetch(url, {
    method,
    headers,
    body: bodyStr,
    redirect: options.redirect || 'follow',
  });
  const rawText = await response.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    json = null;
  }
  return {
    status: response.status,
    headers: response.headers,
    json,
    rawText,
  };
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
    name,
  };
}

async function createRoleUser(baseUrl, identityStore, email, phone, name, role) {
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
    name,
  };
}

async function runVerification() {
  console.log('🚀 Starting Checkpoint 25 Automated Verification Test Suite...');
  console.log(
    'Testing: Verified Reviews, Abuse Moderation, Restaurant Reply, Allegation vs Finding Distinction, Privacy Redaction\n',
  );

  const config = createTestConfig();
  const logger = createLogger({
    level: 'warn',
    service: config.serviceName,
    environment: config.nodeEnv,
    includeStack: false,
  });

  const identityStore = new InMemoryIdentityStore();
  const rbacStore = new InMemoryRbacStore();
  const identityService = new IdentityService({
    config,
    store: identityStore,
    otpAdapter: new InMemoryTestOtpAdapter(),
    logger,
  });

  const restaurantStore = new InMemoryRestaurantStore();
  const orderStore = new InMemoryOrderStore();
  const supportStore = new InMemorySupportStore();
  const inspectorStore = new InMemoryInspectorStore();
  const inspectorService = new InspectorService({
    inspectorStore,
    identityStore,
    rbacStore,
  });
  const inspectionStore = new InMemoryInspectionStore();
  const inspectionService = new InspectionService({
    inspectionStore,
    inspectorService,
  });

  const supportService = new SupportService({
    supportStore,
    orderStore,
    restaurantStore,
  });

  const safetyService = new SafetyService({
    restaurantStore,
    inspectionStore,
    signingSecret: config.jwtAccessSecret,
    hasActiveSafetyInvestigationFn: (outletId) =>
      supportService.hasActiveSafetyInvestigation(outletId),
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    restaurantStore,
    orderStore,
    supportStore,
    supportService,
    inspectorStore,
    inspectorService,
    inspectionStore,
    inspectionService,
    safetyService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // -------------------------------------------------------------------------
    // SETUP SEED DATA
    // -------------------------------------------------------------------------
    console.log('Seeding actors, restaurants, outlets, and orders...');

    // 1. Actors
    const customer1 = await registerCustomer(
      baseUrl,
      'soumya.roy@bhojora.in',
      '+919830001001',
      'Soumya Roy',
    );
    const customer2 = await registerCustomer(
      baseUrl,
      'ananya.sen@bhojora.in',
      '+919830001002',
      'Ananya Sen',
    );
    const restaurantOwner = await createRoleUser(
      baseUrl,
      identityStore,
      'chef.subhasish@mocambo.in',
      '+919830002001',
      'Chef Subhasish Das',
      'RESTAURANT_OWNER',
    );
    const unauthorizedOwner = await createRoleUser(
      baseUrl,
      identityStore,
      'chef.bimal@otherkitchen.in',
      '+919830002002',
      'Chef Bimal Mitra',
      'RESTAURANT_OWNER',
    );
    const admin = await createRoleUser(
      baseUrl,
      identityStore,
      'trust.officer@bhojora.internal',
      '+919830003001',
      'Officer Mukherjee',
      'TRUST_ADMIN',
    );

    // 2. Restaurant & Outlet Setup
    const restaurantId = 'rest_mocambo_001';
    const outletId = 'outlet_mocambo_park_st';
    await restaurantStore.createApplication({
      restaurantId,
      applicationId: 'app_mocambo_001',
      outletId,
      ownerUserId: restaurantOwner.userId,
      onboardingStatus: 'APPROVED',
      fssaiVerificationStatus: 'VERIFIED',
      platformInspectionStatus: 'VERIFIED_CLEAN',
      publishedSafetyScore: 94,
      legalEntity: {
        legalName: 'Mocambo Foods Pvt Ltd',
        tradeName: 'Mocambo Heritage',
        pan: 'ABCDE1234F',
        gstin: '19ABCDE1234F1Z5',
        fssaiNumber: '12824999000001',
        fssaiExpiryDate: '2028-12-31',
      },
      outletSetup: {
        outletName: 'Mocambo - Park Street',
        contactPhone: '+919830002001',
        contactEmail: 'chef.subhasish@mocambo.in',
        zoneId: 'ZONE_CENTRAL',
        wardOrBorough: 'Ward 63, Borough VII',
        streetAddress: '25B Park Street',
        landmark: 'Near Park Mansions',
        locality: 'Park Street',
        city: 'Kolkata',
        postalCode: '700016',
        latitude: 22.5516,
        longitude: 88.3524,
        cuisines: ['Continental', 'Mughlai', 'Heritage Anglo-Indian'],
        prepTimeMinutes: 25,
      },
      bankPayout: {
        accountHolderName: 'Mocambo Foods Pvt Ltd',
        accountNumber: '918273645019',
        ifscCode: 'HDFC0001234',
        bankName: 'HDFC Bank',
        branchName: 'Park Street',
      },
      reviewHistory: [],
      submittedAt: new Date(),
      decidedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await restaurantStore.upsertOutlet({
      outletId,
      restaurantId,
      ownerUserId: restaurantOwner.userId,
      brandName: 'Mocambo Heritage',
      name: 'Mocambo - Park Street',
      slug: 'mocambo-park-street',
      zoneId: 'ZONE_CENTRAL',
      wardOrBorough: 'Ward 63',
      streetAddress: '25B Park Street',
      landmark: 'Near Park Mansions',
      locality: 'Park Street',
      city: 'Kolkata',
      postalCode: '700016',
      location: { type: 'Point', coordinates: [88.3524, 22.5516] },
      cuisines: ['Continental', 'Heritage Anglo-Indian'],
      prepTimeMinutes: 25,
      operatingSlots: [],
      status: 'ACTIVE',
      fssaiLicenseNumber: '12824999000001',
      fssaiExpiresOn: '2028-12-31',
      fssaiVerificationStatus: 'VERIFIED',
      platformInspectionStatus: 'VERIFIED_CLEAN',
      publishedSafetyScore: 94,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Orders Setup Helper
    async function seedOrder(data) {
      const now = new Date();
      await orderStore.createOrderBundleAtomically({
        order: {
          orderId: data.orderId,
          orderNumber: data.orderNumber,
          customerId: data.customerId,
          quoteId: 'quote_' + data.orderId,
          paymentId: 'pay_' + data.orderId,
          restaurantId: data.restaurantId || restaurantId,
          outletId: data.outletId || outletId,
          outletName: 'Mocambo - Park Street',
          brandName: 'Mocambo Heritage',
          outletInspectionStatus: 'APPROVED',
          outletSafetyScore: 94,
          status: data.status,
          version: 1,
          currency: 'INR',
          pricingBreakdown: {
            itemsSubtotalPaise: 55000,
            discountPaise: 0,
            discountedSubtotalPaise: 55000,
            packagingChargePaise: 1500,
            deliveryBaseFeePaise: 4000,
            deliveryDistanceFeePaise: 0,
            deliverySurgeFeePaise: 0,
            deliveryFeePaise: 4000,
            platformFeePaise: 500,
            gstTaxPaise: 2750,
            totalPayablePaise: 63750,
          },
          couponCode: null,
          addressSnapshot: {
            addressId: 'addr_01',
            label: 'Home',
            streetAddress: '7, Camac Street',
            locality: 'Camac Street',
            city: 'Kolkata',
            zoneId: 'ZONE_CENTRAL',
            coordinates: [88.3533, 22.5488],
          },
          estimatedDeliveryMinutes: 30,
          prepTimeMinutes: 25,
          specialInstructions: null,
          deliveryOtp: '8492',
          cancellation:
            data.status === 'CANCELLED'
              ? {
                  reasonCode: 'CUSTOMER_CHANGED_MIND',
                  note: null,
                  cancelledByUserId: data.customerId,
                  cancelledByRole: 'CUSTOMER',
                  cancelledAt: now,
                  refundStatus: 'REFUNDED',
                  refundAmountPaise: 63750,
                }
              : null,
          confirmedAt: now,
          preparingAt: now,
          readyForPickupAt: now,
          outForDeliveryAt: data.status === 'DELIVERED' ? now : null,
          deliveredAt: data.status === 'DELIVERED' ? now : null,
          cancelledAt: data.status === 'CANCELLED' ? now : null,
          createdAt: now,
          updatedAt: now,
        },
        items: [],
        events: [],
        outboxEvents: [],
      });
    }

    // Order 1: Delivered (belonging to customer1)
    await seedOrder({
      orderId: 'order_deliv_001',
      orderNumber: 'ORD-KOL-2601',
      customerId: customer1.userId,
      status: 'DELIVERED',
    });

    // Order 2: Preparing (non-delivered, belonging to customer1)
    await seedOrder({
      orderId: 'order_prep_002',
      orderNumber: 'ORD-KOL-2602',
      customerId: customer1.userId,
      status: 'PREPARING',
    });

    // Order 3: Delivered (belonging to customer2)
    await seedOrder({
      orderId: 'order_deliv_003',
      orderNumber: 'ORD-KOL-2603',
      customerId: customer2.userId,
      status: 'DELIVERED',
    });

    // Order 4: Cancelled (belonging to customer1)
    await seedOrder({
      orderId: 'order_canc_004',
      orderNumber: 'ORD-KOL-2604',
      customerId: customer1.userId,
      status: 'CANCELLED',
    });

    console.log('✓ Actors, outlets, and orders successfully seeded.\n');

    // =========================================================================
    // TEST 1: Verified Delivered Order Gate for Reviews
    // =========================================================================
    console.log('Test 1: Verified Delivered Order Gate for Reviews...');
    {
      // Attempt to review order in PREPARING status
      const resPrep = await apiJson(baseUrl, '/support/reviews', {
        method: 'POST',
        token: customer1.token,
        body: {
          orderId: 'order_prep_002',
          foodRating: 5,
          restaurantRating: 5,
          deliveryRating: 5,
          comment: 'Premature review before delivery!',
        },
      });
      assert.equal(resPrep.status, 400, 'Expected 400 for non-delivered order review');
      assert.ok(
        resPrep.json.error.message.includes('Only delivered orders can be reviewed'),
        `Error message mismatch: ${resPrep.json.error.message}`,
      );

      // Attempt to review CANCELLED order
      const resCanc = await apiJson(baseUrl, '/support/reviews', {
        method: 'POST',
        token: customer1.token,
        body: {
          orderId: 'order_canc_004',
          foodRating: 1,
          restaurantRating: 1,
          comment: 'Cancelled order review!',
        },
      });
      assert.equal(resCanc.status, 400, 'Expected 400 for cancelled order review');
      console.log('✓ Test 1 passed: Non-delivered orders rejected with 400.\n');
    }

    // =========================================================================
    // TEST 2: Order Ownership Enforcement for Reviews
    // =========================================================================
    console.log('Test 2: Order Ownership Enforcement for Reviews...');
    {
      // Customer 1 tries to review Customer 2's delivered order
      const resAlien = await apiJson(baseUrl, '/support/reviews', {
        method: 'POST',
        token: customer1.token,
        body: {
          orderId: 'order_deliv_003',
          foodRating: 4,
          restaurantRating: 4,
          comment: 'Trying to review another user order',
        },
      });
      assert.equal(resAlien.status, 403, 'Expected 403 Forbidden for alien order review');
      assert.ok(
        resAlien.json.error.message.includes('only submit reviews for your own orders'),
        `Error message mismatch: ${resAlien.json.error.message}`,
      );
      console.log('✓ Test 2 passed: Alien order review rejected with 403.\n');
    }

    // =========================================================================
    // TEST 3: Multi-dimensional Verified Order Review Creation
    // =========================================================================
    console.log('Test 3: Multi-dimensional Verified Order Review Creation...');
    let review1Id;
    {
      const resValid = await apiJson(baseUrl, '/support/reviews', {
        method: 'POST',
        token: customer1.token,
        body: {
          orderId: 'order_deliv_001',
          customerDisplayName: 'Soumya Roy',
          foodRating: 5,
          restaurantRating: 4,
          deliveryRating: 5,
          comment: 'Exquisite chelo kebab, buttery and piping hot packaging!',
          itemReviews: [
            {
              menuItemId: 'menu_chelo_kebab',
              itemTitle: 'Original Chelo Kebab',
              rating: 5,
              comment: 'Perfect charcoal grill aroma and melted butter.',
            },
          ],
        },
      });
      assert.equal(
        resValid.status,
        201,
        `Failed review creation: ${JSON.stringify(resValid.json)}`,
      );
      const r = resValid.json.data.review;
      assert.ok(r.reviewId, 'Missing reviewId');
      assert.equal(r.orderId, 'order_deliv_001');
      assert.equal(r.outletId, outletId);
      assert.equal(r.foodRating, 5);
      assert.equal(r.restaurantRating, 4);
      assert.equal(r.deliveryRating, 5);
      assert.equal(r.overallRating, 5, 'Overall rating should average to 5');
      assert.equal(r.status, 'APPROVED');
      assert.equal(
        r.customerDisplayName,
        'Soumya R.',
        'Name should be masked as Firstname Initial',
      );
      review1Id = r.reviewId;
      console.log(`✓ Test 3 passed: Review created with id ${review1Id}, status APPROVED.\n`);
    }

    // =========================================================================
    // TEST 4: Duplicate Review Prevention (Abuse Gate)
    // =========================================================================
    console.log('Test 4: Duplicate Review Prevention (Abuse Gate)...');
    {
      const resDuplicate = await apiJson(baseUrl, '/support/reviews', {
        method: 'POST',
        token: customer1.token,
        body: {
          orderId: 'order_deliv_001',
          foodRating: 5,
          restaurantRating: 5,
          comment: 'Trying to review same order twice',
        },
      });
      assert.equal(resDuplicate.status, 409, 'Expected 409 for duplicate review');
      assert.ok(
        resDuplicate.json.error.message.includes('has already been reviewed'),
        `Error message mismatch: ${resDuplicate.json.error.message}`,
      );
      console.log('✓ Test 4 passed: Duplicate review rejected with 409 Conflict.\n');
    }

    // =========================================================================
    // TEST 5: Automated Abuse & Toxic/Spam Content Screening
    // =========================================================================
    console.log('Test 5: Automated Abuse & Toxic/Spam Content Screening...');
    let flaggedReviewId;
    {
      const resSpam = await apiJson(baseUrl, '/support/reviews', {
        method: 'POST',
        token: customer2.token,
        body: {
          orderId: 'order_deliv_003',
          customerDisplayName: 'Ananya Sen',
          foodRating: 1,
          restaurantRating: 1,
          comment: 'Visit https://freemeals.fake.link for free food hack scam telegram!',
        },
      });
      assert.equal(resSpam.status, 201, 'Should create but flag review');
      const flagged = resSpam.json.data.review;
      assert.equal(flagged.status, 'FLAGGED', 'Spam comment should be marked FLAGGED');
      assert.ok(flagged.moderationReason, 'Should have automated moderationReason set');
      flaggedReviewId = flagged.reviewId;
      console.log(
        `✓ Test 5 passed: Toxic/Spam review automatically flagged (${flaggedReviewId}).\n`,
      );
    }

    // =========================================================================
    // TEST 6: Restaurant Official Response Workflow & Anti-Tamper Guard
    // =========================================================================
    console.log('Test 6: Restaurant Official Response Workflow & Anti-Tamper Guard...');
    {
      // 1. Unauthorized owner attempts to reply
      const resUnauthorized = await apiJson(baseUrl, `/support/reviews/${review1Id}/response`, {
        method: 'POST',
        token: unauthorizedOwner.token,
        body: {
          responseText: 'We are pretending to be Mocambo!',
        },
      });
      assert.equal(
        resUnauthorized.status,
        403,
        'Expected 403 for unauthorized restaurant response',
      );

      // 2. Legitimate owner replies
      const resOwnerReply = await apiJson(baseUrl, `/support/reviews/${review1Id}/response`, {
        method: 'POST',
        token: restaurantOwner.token,
        body: {
          responseText:
            'Thank you Soumya! We take pride in our heritage recipe and authentic butter quality.',
        },
      });
      assert.equal(resOwnerReply.status, 200, 'Owner response should succeed');
      const updatedReview = resOwnerReply.json.data.review;
      assert.ok(updatedReview.restaurantResponse);
      assert.equal(
        updatedReview.restaurantResponse.responseText,
        'Thank you Soumya! We take pride in our heritage recipe and authentic butter quality.',
      );
      assert.equal(updatedReview.restaurantResponse.respondedByUserId, restaurantOwner.userId);

      // 3. Duplicate response limit check
      const resDuplicateReply = await apiJson(baseUrl, `/support/reviews/${review1Id}/response`, {
        method: 'POST',
        token: restaurantOwner.token,
        body: {
          responseText: 'Trying to add a second reply',
        },
      });
      assert.equal(
        resDuplicateReply.status,
        409,
        'Expected 409 for second restaurant response on same review',
      );
      console.log('✓ Test 6 passed: Restaurant official response verified with ownership guard.\n');
    }

    // =========================================================================
    // TEST 7: Public Review Feed Privacy Boundary & Aggregation
    // =========================================================================
    console.log('Test 7: Public Review Feed Privacy Boundary & Aggregation...');
    {
      const resPublic = await apiJson(baseUrl, `/support/outlets/${outletId}/reviews`);
      assert.equal(resPublic.status, 200);
      const summary = resPublic.json.data.summary;
      assert.equal(summary.outletId, outletId);
      assert.equal(
        summary.totalReviews,
        1,
        'Only 1 approved review should appear (flagged review excluded)',
      );
      assert.equal(summary.averageFoodRating, 5);
      assert.equal(summary.averageRestaurantRating, 4);
      assert.equal(summary.averageDeliveryRating, 5);
      assert.equal(summary.overallAverageRating, 5);

      const pubReview = summary.reviews[0];
      assert.equal(pubReview.customerDisplayName, 'Soumya R.', 'Name must be masked');
      assert.equal(
        pubReview.customerId,
        undefined,
        'Customer ID must NOT be leaked in public view',
      );
      assert.equal(pubReview.addressSnapshot, undefined, 'Address must NOT be leaked');
      assert.ok(pubReview.restaurantResponse, 'Restaurant response should be displayed');
      console.log('✓ Test 7 passed: Public reviews strictly privacy-safe and filtered.\n');
    }

    // =========================================================================
    // TEST 8: Food Safety Complaint Prerequisite on Delivered Order
    // =========================================================================
    console.log('Test 8: Food Safety Complaint Prerequisite on Delivered Order...');
    {
      const resBadComplaint = await apiJson(baseUrl, '/safety/complaints', {
        method: 'POST',
        token: customer1.token,
        body: {
          orderId: 'order_canc_004', // Cancelled order
          category: 'SPOILED_CONTAMINATED',
          description: 'Cannot complain about food never received!',
        },
      });
      assert.equal(resBadComplaint.status, 400, 'Expected 400 for complaint on cancelled order');
      assert.ok(
        resBadComplaint.json.error.message.includes('delivered orders'),
        `Error mismatch: ${resBadComplaint.json.error.message}`,
      );
      console.log('✓ Test 8 passed: Safety complaint requires verified delivered order.\n');
    }

    // =========================================================================
    // TEST 9: Allegation Distinct from Confirmed Finding (Statutory Mandate)
    // =========================================================================
    console.log('Test 9: Allegation Distinct from Confirmed Finding (Statutory Mandate)...');
    let complaintId;
    {
      const resComplaint = await apiJson(baseUrl, '/safety/complaints', {
        method: 'POST',
        token: customer1.token,
        body: {
          orderId: 'order_deliv_001',
          category: 'FOREIGN_OBJECT',
          description:
            'Discovered a sharp piece of transparent plastic fragment mixed inside the rice.',
          evidencePhotos: [
            {
              url: 'https://storage.bhojora.in/evidence/allegations/complaint_photo_001.jpg',
              caption: 'Plastic fragment next to coin for scale',
            },
          ],
        },
      });
      assert.equal(
        resComplaint.status,
        201,
        `Failed complaint: ${JSON.stringify(resComplaint.json)}`,
      );
      const c = resComplaint.json.data.complaint;
      assert.ok(c.complaintId);
      complaintId = c.complaintId;

      // Acceptance Criteria: Allegation distinct from confirmed finding
      assert.equal(
        c.isAllegation,
        true,
        'CRITICAL ACCEPTANCE CRITERIA: isAllegation MUST be strictly true',
      );
      assert.equal(
        c.findingStatus,
        'UNCONFIRMED_ALLEGATION',
        'CRITICAL ACCEPTANCE CRITERIA: findingStatus must be UNCONFIRMED_ALLEGATION',
      );
      assert.ok(
        c.statutoryDisclaimer.includes('independent trust & safety verification'),
        'Statutory disclaimer must be present',
      );
      assert.equal(c.severity, 'CRITICAL', 'FOREIGN_OBJECT must default to CRITICAL severity');
      assert.ok(c.responseDeadlineUtc, 'Must set emergency explanation deadline');

      // Verify that official outlet safety score is NOT modified or decremented by unconfirmed allegation
      const outletAfter = await restaurantStore.getOutletById(outletId);
      assert.equal(
        outletAfter.publishedSafetyScore,
        94,
        'Certified audit inspection score must NOT be altered by an unconfirmed allegation',
      );

      // Duplicate complaint check for same issue on same order
      const resDup = await apiJson(baseUrl, '/safety/complaints', {
        method: 'POST',
        token: customer1.token,
        body: {
          orderId: 'order_deliv_001',
          category: 'FOREIGN_OBJECT',
          description: 'Submitting again duplicate allegation',
        },
      });
      assert.equal(resDup.status, 409, 'Expected 409 for duplicate allegation');
      console.log('✓ Test 9 passed: Allegation invariant confirmed distinct from findings.\n');
    }

    // =========================================================================
    // TEST 10: Critical Escalation Deadline, Redacted Restaurant View & CAP Intake
    // =========================================================================
    console.log('Test 10: Critical Escalation Deadline, Redacted Restaurant View & CAP Intake...');
    {
      // 1. Restaurant owner inspects complaints for their outlet
      const resRestView = await apiJson(baseUrl, `/support/outlets/${outletId}/complaints`, {
        token: restaurantOwner.token,
      });
      assert.equal(resRestView.status, 200);
      const complaints = resRestView.json.data.complaints;
      assert.equal(complaints.length, 1);
      const rc = complaints[0];

      // Privacy Check: customer PII must be completely redacted
      assert.equal(rc.customerId, undefined, 'Customer ID must NOT be present in restaurant view');
      assert.equal(
        rc.customerPhone,
        undefined,
        'Customer phone must NOT be present in restaurant view',
      );
      assert.equal(
        rc.customerEmail,
        undefined,
        'Customer email must NOT be present in restaurant view',
      );
      assert.equal(
        rc.addressSnapshot,
        undefined,
        'Customer address must NOT be present in restaurant view',
      );
      assert.ok(
        rc.maskedCustomerIdentifier.startsWith('Customer #C-'),
        `Masked customer identifier expected: ${rc.maskedCustomerIdentifier}`,
      );
      assert.equal(rc.isAllegation, true);
      assert.equal(rc.findingStatus, 'UNCONFIRMED_ALLEGATION');

      // 2. Restaurant owner submits explanation & corrective action
      const resExplanation = await apiJson(
        baseUrl,
        `/support/complaints/${complaintId}/explanation`,
        {
          method: 'POST',
          token: restaurantOwner.token,
          body: {
            explanationText:
              'Batch inspection conducted at kitchen. All storage tubs reviewed; supplier packaging replaced with certified food-grade stainless steel.',
            correctiveActionTaken:
              'Discarded batch #KOL-482 and quarantined packaging inventory for full hygiene audit.',
          },
        },
      );
      assert.equal(resExplanation.status, 200);
      const explComplaint = resExplanation.json.data.complaint;
      assert.equal(explComplaint.status, 'EXPLANATION_PROVIDED');
      assert.ok(explComplaint.restaurantExplanation);
      assert.equal(explComplaint.restaurantExplanation.respondedByUserId, restaurantOwner.userId);

      // 3. Outlet active allegation indicator integration
      const resAllegationStatus = await apiJson(
        baseUrl,
        `/support/outlets/${outletId}/allegations/active`,
      );
      assert.equal(resAllegationStatus.status, 200);
      assert.equal(resAllegationStatus.json.data.hasActiveSafetyInvestigation, true);
      assert.equal(resAllegationStatus.json.data.activeSafetyInvestigationsCount, 1);

      // 4. Public Trust Profile integration reflects active investigation with unconfirmed disclaimer
      const resTrust = await apiJson(baseUrl, `/safety/outlets/${outletId}`);
      assert.equal(resTrust.status, 200);
      assert.equal(
        resTrust.json.data.profile.hasActiveSafetyInvestigation,
        true,
        'Public trust profile must show active investigation notice',
      );

      // 5. Admin resolves complaint after review
      const resResolve = await apiJson(baseUrl, `/support/complaints/${complaintId}/resolve`, {
        method: 'PATCH',
        token: admin.token,
        body: {
          status: 'RESOLVED',
          findingStatus: 'REJECTED_ALLEGATION',
          resolutionNotes: 'Packaging quarantine verified, supplier metal test cleared.',
        },
      });
      assert.equal(resResolve.status, 200);
      assert.equal(resResolve.json.data.complaint.status, 'RESOLVED');
      assert.equal(resResolve.json.data.complaint.findingStatus, 'REJECTED_ALLEGATION');

      console.log(
        '✓ Test 10 passed: Privacy redaction, 12h deadline, restaurant CAP and trust integration verified.\n',
      );
    }

    console.log('🎉 ALL 10 CHECKPOINT 25 VERIFICATION TESTS PASSED CLEANLY!\n');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runVerification().catch((error) => {
  console.error('❌ Checkpoint 25 Verification Failed:', error);
  process.exit(1);
});
