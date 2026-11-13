'use strict';

const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const http = require('node:http');

const { validateEnv } = require('../dist/config/env.js');
const { createLogger } = require('../dist/config/logger.js');
const { createApp } = require('../dist/app.js');
const { InMemoryIdentityStore } = require('../dist/modules/identity/identity.models.js');
const { InMemoryTestOtpAdapter } = require('../dist/modules/identity/otp.adapter.js');
const { IdentityService } = require('../dist/modules/identity/identity.service.js');
const { InMemoryRbacStore } = require('../dist/modules/rbac/rbac.store.js');
const { InMemoryRestaurantStore } = require('../dist/modules/restaurant/restaurant.store.js');
const { InMemoryInspectorStore } = require('../dist/modules/inspector/inspector.store.js');
const { InspectorService } = require('../dist/modules/inspector/inspector.service.js');
const { InMemoryInspectionStore } = require('../dist/modules/inspection/inspection.store.js');
const { InspectionService } = require('../dist/modules/inspection/inspection.service.js');
const { SafetyService } = require('../dist/modules/safety/safety.service.js');

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4024',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp24_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp24!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp24!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp24!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp24!',
    },
    { serviceName: 'bhojora-test-cp24', serviceVersion: '0.1.0' },
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

async function runVerification() {
  console.log('🚀 Starting Checkpoint 24 Automated Verification Test Suite...');
  console.log(
    'Testing: Public Safety Profile, Safe Projection, Expiry (180d), History & QR Resolver\n',
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

  // Mutable test clock for expiry simulation
  let simulatedTime = new Date('2026-10-15T10:00:00.000Z');
  const testClock = {
    now: () => new Date(simulatedTime),
  };

  const safetyService = new SafetyService({
    restaurantStore,
    inspectionStore,
    signingSecret: config.jwtAccessSecret,
    clock: testClock,
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    restaurantStore,
    inspectorStore,
    inspectorService,
    inspectionStore,
    inspectionService,
    safetyService,
    clock: testClock,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // -------------------------------------------------------------------------
    // SETUP SEED OUTLETS
    // -------------------------------------------------------------------------
    console.log('Seeding test outlets in Kolkata...');

    // Outlet 1: Arsalan Park Circus (Verified Clean)
    await restaurantStore.upsertOutlet({
      outletId: 'out_arsalan_pc',
      restaurantId: 'rest_arsalan',
      ownerUserId: 'usr_owner_arsalan',
      brandName: 'Arsalan',
      name: 'Arsalan — Park Circus',
      slug: 'arsalan-park-circus',
      zoneId: 'central',
      wardOrBorough: 'Ward 60',
      streetAddress: '119, Park Street',
      landmark: 'Near 7-Point Crossing',
      locality: 'Park Circus',
      city: 'Kolkata',
      postalCode: '700017',
      cuisines: ['Mughlai', 'Biryani'],
      location: { type: 'Point', coordinates: [88.368, 22.544] },
      prepTimeMinutes: 25,
      status: 'ACTIVE',
      fssaiLicenseNumber: '12821008000491',
      fssaiVerificationStatus: 'VERIFIED',
      platformInspectionStatus: 'NOT_INSPECTED',
      publishedSafetyScore: null,
      operatingSlots: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    // Outlet 2: New Town Cloud Kitchen (Not Yet Inspected)
    await restaurantStore.upsertOutlet({
      outletId: 'out_newtown_cloud',
      restaurantId: 'rest_cloud_9',
      ownerUserId: 'usr_owner_cloud',
      brandName: 'Cloud 9 Kitchens',
      name: 'Cloud 9 — Action Area 1',
      slug: 'cloud-9-new-town',
      zoneId: 'new-town',
      wardOrBorough: 'Ward 12',
      streetAddress: 'Plot BG-12, AA-1',
      landmark: 'Near Axis Mall',
      locality: 'New Town',
      city: 'Kolkata',
      postalCode: '700156',
      cuisines: ['North Indian', 'Rolls'],
      location: { type: 'Point', coordinates: [88.461, 22.585] },
      prepTimeMinutes: 20,
      status: 'ACTIVE',
      fssaiLicenseNumber: '12822009000112',
      fssaiVerificationStatus: 'VERIFIED',
      platformInspectionStatus: 'NOT_INSPECTED',
      publishedSafetyScore: null,
      operatingSlots: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    // Outlet 3: Suspended Outlet (Critical Hazard)
    await restaurantStore.upsertOutlet({
      outletId: 'out_hazard_spot',
      restaurantId: 'rest_hazard',
      ownerUserId: 'usr_owner_hazard',
      brandName: 'Hazard Spot',
      name: 'Hazard Spot — Salt Lake',
      slug: 'hazard-spot-salt-lake',
      zoneId: 'salt-lake',
      wardOrBorough: 'Ward 31',
      streetAddress: 'Sector 1',
      landmark: 'Near Tank 3',
      locality: 'Salt Lake',
      city: 'Kolkata',
      postalCode: '700064',
      cuisines: ['Chinese'],
      location: { type: 'Point', coordinates: [88.412, 22.589] },
      prepTimeMinutes: 20,
      status: 'SUSPENDED',
      fssaiLicenseNumber: '12823001000888',
      fssaiVerificationStatus: 'VERIFIED',
      platformInspectionStatus: 'SUSPENDED',
      publishedSafetyScore: 0,
      operatingSlots: [],
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    console.log('✓ Seed outlets created.\n');

    // Helper: Seed approved inspection
    async function seedApprovedInspection(params) {
      const auditDate = params.auditDate || new Date('2026-10-10T12:00:00.000Z');
      const inspectionRecord = {
        id: params.id || `insp_${nodeCrypto.randomUUID()}`,
        outletId: params.outletId,
        restaurantId: params.restaurantId,
        inspectorId: 'insp_senior_01',
        assessmentType: params.assessmentType || 'ROUTINE',
        checklistVersion: 'v1.0',
        status: 'APPROVED',
        startedAt: auditDate,
        submittedAt: auditDate,
        reviewedAt: auditDate,
        reviewedByUserId: 'usr_council_sen',
        reviewDecision: 'APPROVE',
        reviewNotes: 'Verified compliant with FSSAI hygiene standards.',
        hasCriticalViolation: Boolean(params.hasCriticalViolation),
        scoreSummary: {
          rawScore: params.score || 94,
          maxScore: 100,
          scorePercent: params.score || 94,
          scorePolicyVersion: 'SCORE_POLICY_V1',
          hasCriticalViolation: Boolean(params.hasCriticalViolation),
          criticalOverrideApplied: Boolean(params.hasCriticalViolation),
          overrideReason: params.hasCriticalViolation ? 'CRITICAL_HAZARD' : undefined,
          finalScorePercent: params.hasCriticalViolation ? 0 : params.score || 94,
          outcome: params.outcome || (params.hasCriticalViolation ? 'FAIL' : 'PASS'),
          grade: params.grade || (params.hasCriticalViolation ? 'SUSPENDED' : 'A_PLUS'),
        },
        findings: [
          {
            itemId: 'HYG_01',
            category: 'PERSONAL_HYGIENE',
            score: 10,
            maxScore: 10,
            severity: 'PASS',
            evidenceIds: ['evi_photo_01'],
          },
          {
            itemId: 'TEMP_01',
            category: 'FOOD_STORAGE_TEMPERATURE',
            score: 15,
            maxScore: 15,
            severity: 'PASS',
            evidenceIds: ['evi_photo_02'],
          },
          {
            itemId: 'PEST_01',
            category: 'PEST_CONTROL',
            score: params.hasCriticalViolation ? 0 : 15,
            maxScore: 15,
            severity: params.hasCriticalViolation ? 'CRITICAL' : 'PASS',
            evidenceIds: [],
          },
        ],
        evidence: [
          {
            id: 'evi_photo_01',
            inspectionId: 'test_insp',
            itemId: 'HYG_01',
            evidenceType: 'PHOTO',
            sha256Hash: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
            mimeType: 'image/jpeg',
            sizeBytes: 102400,
            capturedAt: auditDate,
            capturedCoordinates: [88.368, 22.544], // Internal GPS coordinate (MUST BE STRIPPED)
            storageKey: 'inspections/internal/private_path/file.jpg', // Private key (MUST BE STRIPPED)
            caption: 'Clean food handler aprons and headgear verified',
            createdAt: auditDate,
          },
          {
            id: 'evi_sig_01',
            inspectionId: 'test_insp',
            evidenceType: 'MANAGER_SIGNATURE', // Private signature (MUST BE EXCLUDED)
            sha256Hash: 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
            mimeType: 'image/png',
            sizeBytes: 2048,
            capturedAt: auditDate,
            capturedCoordinates: [88.368, 22.544],
            storageKey: 'inspections/signatures/private_sig.png',
            caption: 'Manager signature data',
            createdAt: auditDate,
          },
        ],
        createdAt: auditDate,
        updatedAt: auditDate,
      };

      await inspectionStore.createInspection(inspectionRecord);
      return inspectionRecord;
    }

    // Seed approved inspection for Arsalan
    await seedApprovedInspection({
      id: 'insp_arsalan_01',
      outletId: 'out_arsalan_pc',
      restaurantId: 'rest_arsalan',
      score: 95,
      grade: 'A_PLUS',
      outcome: 'PASS',
      auditDate: new Date('2026-10-10T10:00:00.000Z'),
    });

    // Seed older inspection for Arsalan history
    await seedApprovedInspection({
      id: 'insp_arsalan_history_old',
      outletId: 'out_arsalan_pc',
      restaurantId: 'rest_arsalan',
      score: 88,
      grade: 'A',
      outcome: 'PASS',
      auditDate: new Date('2026-04-10T10:00:00.000Z'),
    });

    // Seed suspended inspection for Hazard Spot
    await seedApprovedInspection({
      id: 'insp_hazard_01',
      outletId: 'out_hazard_spot',
      restaurantId: 'rest_hazard',
      score: 0,
      grade: 'SUSPENDED',
      outcome: 'FAIL',
      hasCriticalViolation: true,
      auditDate: new Date('2026-10-12T10:00:00.000Z'),
    });

    // -------------------------------------------------------------------------
    // TEST 1: Public Trust Profile Access & Privacy Boundary Enforcement
    // -------------------------------------------------------------------------
    console.log('Test 1: Public Trust Profile & Privacy Boundary Enforcement...');
    // Unauthenticated request MUST succeed (public consumer transparency)
    const pubRes = await apiJson(baseUrl, '/safety/outlets/out_arsalan_pc');
    assert.equal(pubRes.status, 200, 'Public profile must be accessible without authentication');
    const profile = pubRes.json.data.profile;

    // Verify Public Safe Fields
    assert.equal(profile.outletId, 'out_arsalan_pc');
    assert.equal(profile.brandName, 'Arsalan');
    assert.equal(profile.status, 'VERIFIED_CLEAN');
    assert.equal(profile.statusLabel, 'Verified Clean Kitchen');
    assert.equal(profile.isVerified, true);
    assert.equal(profile.currentScore, 95);
    assert.equal(profile.grade, 'A_PLUS');
    assert.equal(profile.outcome, 'PASS');
    assert(profile.inspectedAt);
    assert(profile.validUntil);
    assert.equal(profile.isExpired, false);
    assert(profile.daysRemaining > 150);
    assert.equal(
      profile.statutoryDisclaimer.includes('Not an FSSAI statutory government certification'),
      true,
    );

    // Strict Privacy Boundary Checks (No internal leakage)
    assert.equal(
      profile.storageKey,
      undefined,
      'Internal storageKey must NOT be exposed in public profile',
    );
    assert.equal(profile.inspectorPhone, undefined, 'Inspector phone must NOT be exposed');
    assert.equal(profile.reviewNotes, undefined, 'Internal reviewNotes must NOT be exposed');

    // Evidence checks: Only PHOTO/TEMPERATURE_LOG exposed; coordinates and signatures stripped
    assert.equal(profile.publicEvidence.length, 1);
    const photoEvidence = profile.publicEvidence[0];
    assert.equal(photoEvidence.evidenceType, 'PHOTO');
    assert.equal(
      photoEvidence.capturedCoordinates,
      undefined,
      'Inspector GPS coordinates must be stripped',
    );
    assert.equal(
      photoEvidence.storageKey,
      undefined,
      'Evidence internal storageKey must be stripped',
    );
    assert.equal(photoEvidence.caption, 'Clean food handler aprons and headgear verified');
    console.log(
      '✓ Test 1 Passed: Public profile exposed safe fields with strict privacy stripping.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 2: Pending / Uninspected State Handling
    // -------------------------------------------------------------------------
    console.log('Test 2: Pending/Uninspected State Handling...');
    const pendingRes = await apiJson(baseUrl, '/safety/outlets/out_newtown_cloud');
    assert.equal(pendingRes.status, 200);
    const pendingProfile = pendingRes.json.data.profile;

    assert.equal(pendingProfile.status, 'NOT_INSPECTED');
    assert.equal(pendingProfile.statusLabel, 'Not Yet Inspected');
    assert.equal(pendingProfile.isVerified, false);
    assert.equal(pendingProfile.currentScore, null, 'Score must be null for uninspected outlet');
    assert.equal(pendingProfile.grade, null);
    assert.equal(pendingProfile.validUntil, null);
    assert.equal(pendingProfile.categoryBreakdown.length, 0);
    assert.equal(pendingProfile.publicEvidence.length, 0);
    console.log(
      '✓ Test 2 Passed: Pending/Uninspected state verified (isVerified: false, score: null).\n',
    );

    // -------------------------------------------------------------------------
    // TEST 3: Scheduled / In-Progress State Handling
    // -------------------------------------------------------------------------
    console.log('Test 3: Scheduled/In-Progress State Handling...');
    await inspectionStore.createInspection({
      id: 'insp_scheduled_01',
      outletId: 'out_newtown_cloud',
      restaurantId: 'rest_cloud_9',
      inspectorId: 'insp_senior_01',
      assessmentType: 'INITIAL',
      checklistVersion: 'v1.0',
      status: 'SCHEDULED',
      startedAt: new Date(),
      findings: [],
      evidence: [],
      hasCriticalViolation: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const scheduledRes = await apiJson(baseUrl, '/safety/outlets/out_newtown_cloud');
    assert.equal(scheduledRes.status, 200);
    const scheduledProfile = scheduledRes.json.data.profile;
    assert.equal(scheduledProfile.status, 'SCHEDULED');
    assert.equal(scheduledProfile.statusLabel, 'Inspection Scheduled');
    assert.equal(scheduledProfile.isVerified, false);
    assert.equal(scheduledProfile.currentScore, null);
    console.log('✓ Test 3 Passed: Scheduled inspection reflects status SCHEDULED.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Suspended State (Critical Food Safety Hazard)
    // -------------------------------------------------------------------------
    console.log('Test 4: Suspended State (Critical Hazard)...');
    const hazardRes = await apiJson(baseUrl, '/safety/outlets/out_hazard_spot');
    assert.equal(hazardRes.status, 200);
    const hazardProfile = hazardRes.json.data.profile;

    assert.equal(hazardProfile.status, 'SUSPENDED');
    assert.equal(hazardProfile.statusLabel, 'Safety Hold — Suspended');
    assert.equal(hazardProfile.isVerified, false);
    assert.equal(hazardProfile.currentScore, 0, 'Score must be 0 for suspended outlet');
    assert.equal(hazardProfile.grade, 'SUSPENDED');
    assert.equal(hazardProfile.outcome, 'FAIL');
    console.log('✓ Test 4 Passed: Critical hazard triggers status SUSPENDED with 0 score.\n');

    // -------------------------------------------------------------------------
    // TEST 5: 180-Day Audit Expiry Handling
    // -------------------------------------------------------------------------
    console.log('Test 5: 180-Day Audit Expiry Handling...');
    // Simulated time: advance clock by 190 days from inspection date (2026-10-10 -> 2027-04-18)
    simulatedTime = new Date('2027-04-18T10:00:00.000Z');

    const expiredRes = await apiJson(baseUrl, '/safety/outlets/out_arsalan_pc');
    assert.equal(expiredRes.status, 200);
    const expiredProfile = expiredRes.json.data.profile;

    assert.equal(expiredProfile.status, 'EXPIRED');
    assert.equal(expiredProfile.statusLabel, 'Inspection Expired');
    assert.equal(expiredProfile.isVerified, false, 'Expired inspection cannot remain verified');
    assert.equal(expiredProfile.isExpired, true);
    assert.equal(expiredProfile.currentScore, null, 'Score must be masked when expired');
    assert.equal(expiredProfile.daysRemaining, 0);
    console.log(
      '✓ Test 5 Passed: Audits older than 180 days transition to EXPIRED with masked score.\n',
    );

    // Reset clock back to 2026-10-15
    simulatedTime = new Date('2026-10-15T10:00:00.000Z');

    // -------------------------------------------------------------------------
    // TEST 6: Category Breakdown Scoring Accuracy
    // -------------------------------------------------------------------------
    console.log('Test 6: Category Breakdown Scoring Accuracy...');
    const catRes = await apiJson(baseUrl, '/safety/outlets/out_arsalan_pc');
    const catProfile = catRes.json.data.profile;
    assert(catProfile.categoryBreakdown.length > 0);

    const hygCat = catProfile.categoryBreakdown.find((c) => c.category === 'PERSONAL_HYGIENE');
    assert(hygCat);
    assert.equal(hygCat.rawScore, 10);
    assert.equal(hygCat.maxScore, 10);
    assert.equal(hygCat.percentage, 100);
    assert.equal(hygCat.categoryLabel, 'Personal Hygiene & Food Handlers');
    console.log(
      '✓ Test 6 Passed: Category score breakdown accurately maps weighted percentages.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 7: Historical Audit Versions
    // -------------------------------------------------------------------------
    console.log('Test 7: Historical Audit Versions Retrieval...');
    const histRes = await apiJson(baseUrl, '/safety/outlets/out_arsalan_pc/history');
    assert.equal(histRes.status, 200);
    assert.equal(histRes.json.data.totalAudits, 2);
    assert.equal(histRes.json.data.history.length, 2);

    // Verify chronological order (newest first)
    const [audit1, audit2] = histRes.json.data.history;
    assert.equal(audit1.inspectionId, 'insp_arsalan_01');
    assert.equal(audit1.scorePercent, 95);
    assert.equal(audit1.grade, 'A_PLUS');

    assert.equal(audit2.inspectionId, 'insp_arsalan_history_old');
    assert.equal(audit2.scorePercent, 88);
    assert.equal(audit2.grade, 'A');
    console.log(
      '✓ Test 7 Passed: Immutable audit history retrieved in reverse chronological order.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 8: Canonical QR Code Payload & HMAC Verification
    // -------------------------------------------------------------------------
    console.log('Test 8: Canonical QR Code Payload & HMAC Signature...');
    const qrRes = await apiJson(baseUrl, '/safety/outlets/out_arsalan_pc/qr');
    assert.equal(qrRes.status, 200);
    const qrPayload = qrRes.json.data.qr;

    assert(qrPayload.qrCode.startsWith('qr_'));
    assert.equal(qrPayload.outletId, 'out_arsalan_pc');
    assert.equal(
      qrPayload.verificationUrl,
      'https://bhojora.in/restaurants/arsalan-park-circus/trust',
    );
    assert.equal(qrPayload.status, 'VERIFIED_CLEAN');
    assert.equal(qrPayload.score, 95);
    assert(qrPayload.hmacSignature.length === 64, 'Must be 64-character SHA-256 HMAC signature');
    assert(qrPayload.qrSvgDataUri.startsWith('data:image/svg+xml'));
    console.log(
      '✓ Test 8 Passed: Canonical QR badge generated with HMAC signature & SVG data URI.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 9: QR Code Resolver Endpoint (JSON & 302 Redirect)
    // -------------------------------------------------------------------------
    console.log('Test 9: QR Code Resolver Endpoint...');
    // 1. JSON Resolver
    const resolveJsonRes = await apiJson(baseUrl, `/safety/qr/${qrPayload.qrCode}`);
    assert.equal(resolveJsonRes.status, 200);
    assert.equal(resolveJsonRes.json.data.profile.outletId, 'out_arsalan_pc');
    assert.equal(resolveJsonRes.json.data.profile.isVerified, true);

    // 2. Browser 302 Redirect (Accept: text/html)
    const resolveRedirectRes = await apiJson(baseUrl, `/safety/qr/${qrPayload.qrCode}`, {
      headers: { Accept: 'text/html' },
      redirect: 'manual', // do not auto-follow so we can assert 302
    });
    assert.equal(resolveRedirectRes.status, 302);
    assert.equal(
      resolveRedirectRes.headers.get('location'),
      'https://bhojora.in/restaurants/arsalan-park-circus/trust',
    );
    console.log(
      '✓ Test 9 Passed: QR resolver supports both JSON API and 302 browser redirection.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 10: 404 Not Found for Nonexistent Outlets
    // -------------------------------------------------------------------------
    console.log('Test 10: 404 Not Found for Nonexistent Outlets...');
    const notFoundRes = await apiJson(baseUrl, '/safety/outlets/out_nonexistent_9999');
    assert.equal(notFoundRes.status, 404);
    assert.match(notFoundRes.json.error.message, /not found/i);
    console.log('✓ Test 10 Passed: Nonexistent outlet properly returns 404 NOT_FOUND.\n');

    console.log('================================================================');
    console.log('🎉 ALL 10 CHECKPOINT 24 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    server.close();
  }
}

runVerification().catch((err) => {
  console.error('❌ Checkpoint 24 Verification failed:', err);
  process.exit(1);
});
