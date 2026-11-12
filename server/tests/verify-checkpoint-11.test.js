'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const nodeCrypto = require('node:crypto');
const mongoose = require('mongoose');

const { SERVER_BASELINE } = require('../dist/index.js');
const { validateEnv } = require('../dist/config/env.js');
const { createLogger } = require('../dist/config/logger.js');
const { createApp } = require('../dist/app.js');
const { INITIAL_DATABASE_INDEXES } = require('../dist/database/indexes.js');
const { InMemoryIdentityStore } = require('../dist/modules/identity/identity.models.js');
const { InMemoryTestOtpAdapter } = require('../dist/modules/identity/otp.adapter.js');
const { IdentityService } = require('../dist/modules/identity/identity.service.js');
const { InMemoryRbacStore } = require('../dist/modules/rbac/rbac.store.js');
const { InMemoryCustomerStore } = require('../dist/modules/customer/customer.store.js');
const { InMemoryRestaurantStore } = require('../dist/modules/restaurant/restaurant.store.js');
const { RestaurantService } = require('../dist/modules/restaurant/restaurant.service.js');
const {
  InMemoryOutletStore,
  createMongooseOutletModels,
} = require('../dist/modules/outlet/outlet.store.js');
const { OutletService } = require('../dist/modules/outlet/outlet.service.js');
const {
  assertValidGeoJsonPoint,
  assertValidGeoJsonPolygonForKolkata,
  calculateHaversineDistanceMeters,
  evaluateOutletOpenStatus,
  getDefaultKolkataZonesSeed,
  isPointInPolygon,
} = require('../dist/modules/outlet/outlet.geo.js');

async function startTestServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
  };
}

async function apiJson(baseUrl, routePath, { method = 'GET', token, body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, headers: res.headers };
}

class MutableTestClock {
  constructor(initialIso) {
    this.current = new Date(initialIso);
  }
  setIso(iso) {
    this.current = new Date(iso);
  }
  now() {
    return new Date(this.current.getTime());
  }
}

const TEST_PASSWORD = 'Bhojora#Partner2026';

async function createVerifiedPartnerSession(baseUrl, phone, email, name) {
  const regRes = await apiJson(baseUrl, '/auth/register', {
    method: 'POST',
    body: {
      name,
      email,
      phone,
      password: TEST_PASSWORD,
      acceptTerms: true,
    },
  });
  assert.equal(regRes.status, 201, `Register failed for ${email}: ${JSON.stringify(regRes.json)}`);
  return {
    userId: regRes.json.data.user.id,
    email,
    token: regRes.json.data.tokens.accessToken,
  };
}

async function loginWithEmail(baseUrl, email) {
  const loginRes = await apiJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: { identifier: email, password: TEST_PASSWORD },
  });
  assert.equal(loginRes.status, 200, `Login failed for ${email}: ${JSON.stringify(loginRes.json)}`);
  return loginRes.json.data.tokens.accessToken;
}

async function onboardAndApproveOutlet({
  baseUrl,
  partnerToken,
  adminToken,
  fssaiLicenseNumber,
  brandName,
  outletName,
  zoneId,
  coordinates,
}) {
  const createRes = await apiJson(baseUrl, '/restaurant/applications', {
    method: 'POST',
    token: partnerToken,
    body: {
      legalEntity: {
        legalBusinessName: `${brandName} Hospitality Pvt Ltd`,
        ownerFullName: 'Anirban Chatterjee',
        ownerPhone: '+919830011223',
        ownerBusinessEmail: `ops+${brandName.toLowerCase().replace(/[^a-z]/g, '')}@bhojora.in`,
        panNumber: 'ABCDE1234F',
        gstin: '19ABCDE1234F1Z5',
        fssaiLicenseNumber,
        fssaiExpiresOn: '2027-12-31',
      },
      outletSetup: {
        brandName,
        outletName,
        streetAddress: 'Plot EP-GP, Sector V, Bidhannagar',
        landmark: 'Near Webel More',
        locality: 'Salt Lake Sector V',
        wardOrBorough: 'Bidhannagar Ward 32',
        postalCode: '700091',
        zoneId,
        coordinates,
        cuisines: ['Bengali', 'Mughlai'],
        prepTimeMinutes: 25,
      },
      bankPayout: {
        accountHolderName: `${brandName} Hospitality Pvt Ltd`,
        bankAccountNumber: '123456789012',
        ifscCode: 'HDFC0000123',
      },
    },
  });
  assert.equal(
    createRes.status,
    201,
    `Create onboarding failed: ${JSON.stringify(createRes.json)}`,
  );
  const applicationId = createRes.json.data.application.applicationId;

  const requiredDocTypes = ['FSSAI_CERTIFICATE', 'PAN_CARD', 'BANK_CANCELLED_CHEQUE'];
  const uploadedDocIds = [];
  for (const docType of requiredDocTypes) {
    const checksum = nodeCrypto
      .createHash('sha256')
      .update(`${applicationId}:${docType}`)
      .digest('hex');
    const intentRes = await apiJson(
      baseUrl,
      `/restaurant/applications/${applicationId}/documents/upload-url`,
      {
        method: 'POST',
        token: partnerToken,
        body: {
          documentType: docType,
          fileName: `${docType.toLowerCase()}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 24576,
          sha256Checksum: checksum,
        },
      },
    );
    assert.equal(intentRes.status, 200);
    const confirmRes = await apiJson(
      baseUrl,
      `/restaurant/applications/${applicationId}/documents`,
      {
        method: 'POST',
        token: partnerToken,
        body: {
          documentType: docType,
          fileName: `${docType.toLowerCase()}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 24576,
          sha256Checksum: checksum,
          uploadToken: intentRes.json.data.uploadIntent.uploadToken,
          storageKey: intentRes.json.data.uploadIntent.storageKey,
        },
      },
    );
    assert.equal(confirmRes.status, 201);
    uploadedDocIds.push(confirmRes.json.data.document.documentId);
  }

  const submitRes = await apiJson(baseUrl, `/restaurant/applications/${applicationId}/submit`, {
    method: 'POST',
    token: partnerToken,
  });
  assert.equal(submitRes.status, 200);

  const reviewRes = await apiJson(
    baseUrl,
    `/admin/restaurant-applications/${applicationId}/review`,
    {
      method: 'POST',
      token: adminToken,
      body: {
        decision: 'APPROVE',
        fssaiVerificationDecision: 'VERIFIED',
        reason: 'Statutory FSSAI & compliance documents verified for Kolkata pilot activation',
        fssaiVerifiedNote: 'WB statutory FSSAI record validated',
        documentReviews: uploadedDocIds.map((documentId) => ({
          documentId,
          verificationStatus: 'VERIFIED',
          note: 'KYC file verified by admin',
        })),
      },
    },
  );
  assert.equal(reviewRes.status, 200, `Review failed: ${JSON.stringify(reviewRes.json)}`);
  return reviewRes.json.data.application;
}

async function runTests() {
  console.log('--- Starting Checkpoint 11 Outlet & Service Zones Verification Suite ---');

  // 1. Server baseline, shared contracts & index specifications
  const shared = await import('../../client/shared/dist/contracts/outlet.js');
  assert.equal(SERVER_BASELINE.checkpoint, '11');
  assert.equal(SERVER_BASELINE.timezone, 'Asia/Kolkata');
  assert.equal(shared.DEFAULT_OUTLET_DELIVERY_RADIUS_METERS, 5000);
  assert.ok(shared.OUTLET_OPERATIONAL_STATUSES.includes('TEMPORARILY_CLOSED'));
  assert.ok(shared.OUTLET_LIVE_STATUS_REASONS.includes('SPECIAL_CLOSURE'));

  const indexNames = INITIAL_DATABASE_INDEXES.map((item) => item.options.name);
  assert.ok(indexNames.includes('idx_delivery_zones_boundary_2dsphere'));
  assert.ok(indexNames.includes('idx_delivery_zones_city_zone_unique'));
  assert.ok(indexNames.includes('idx_outlets_location_2dsphere'));
  assert.ok(indexNames.includes('idx_outlet_hours_outlet_unique'));

  // 2. Mongoose schema validation & server/src/index.ts wiring
  const indexTsSrc = fs.readFileSync(path.resolve(__dirname, '../src/index.ts'), 'utf8');
  assert.ok(
    indexTsSrc.includes('new MongooseOutletStore(mongoConnection)'),
    'server/src/index.ts must bind MongooseOutletStore(mongoConnection)',
  );
  assert.ok(
    indexTsSrc.includes('new OutletService('),
    'server/src/index.ts must initialize OutletService',
  );

  const outletModels = createMongooseOutletModels(mongoose.connection);
  const badZoneDoc = new outletModels.DeliveryZone({
    zoneCode: 'BAD_UNCLOSED',
    zoneId: 'salt-lake',
    cityCode: 'KOLKATA',
    name: 'Invalid Unclosed Zone',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [88.425, 22.565],
          [88.45, 22.565],
          [88.45, 22.585],
          [88.425, 22.585],
        ],
      ],
    },
    centerPoint: { type: 'Point', coordinates: [88.4317, 22.5806] },
    deliveryFeePaise: 2500,
    minOrderPaise: 14900,
    estimatedMinutes: 25,
    isActive: true,
  });
  await assert.rejects(
    () => badZoneDoc.validate(),
    /GeoJSON Polygon/i,
    'Mongoose delivery_zones schema must reject unclosed polygons',
  );

  const floatFeeZoneDoc = new outletModels.DeliveryZone({
    zoneCode: 'BAD_FLOAT_FEE',
    zoneId: 'salt-lake',
    cityCode: 'KOLKATA',
    name: 'Float Fee Zone',
    boundary: {
      type: 'Polygon',
      coordinates: getDefaultKolkataZonesSeed()[0].boundary.coordinates,
    },
    centerPoint: { type: 'Point', coordinates: [88.4317, 22.5806] },
    deliveryFeePaise: 25.5,
    minOrderPaise: 14900,
    estimatedMinutes: 25,
    isActive: true,
  });
  await assert.rejects(
    () => floatFeeZoneDoc.validate(),
    /INR paise/i,
    'Mongoose delivery_zones schema must reject fractional paise amounts (ADR-003)',
  );

  // 3. Pure geospatial & IST clock helpers
  assert.throws(
    () => assertValidGeoJsonPoint([22.5806, 88.4317]),
    /swapped/i,
    'Must explicitly reject [latitude, longitude] swapped Kolkata coordinates',
  );
  assert.throws(
    () =>
      assertValidGeoJsonPolygonForKolkata([
        [
          [88.425, 22.565],
          [88.425, 22.585],
          [88.45, 22.585],
          [88.45, 22.565],
          [88.425, 22.565],
        ],
      ]),
    /counter-clockwise/i,
    'Must enforce RFC 7946 counter-clockwise exterior ring winding order',
  );

  const saltLakePoly = getDefaultKolkataZonesSeed()[0].boundary.coordinates;
  assert.equal(isPointInPolygon([88.4317, 22.5806], saltLakePoly), true);
  assert.equal(isPointInPolygon([88.3526, 22.5535], saltLakePoly), false);

  const distSaltLakeToParkStreet = calculateHaversineDistanceMeters(
    [88.4317, 22.5806],
    [88.3526, 22.5535],
  );
  assert.ok(distSaltLakeToParkStreet > 7000 && distSaltLakeToParkStreet < 10000);

  // IST timing check: 2026-11-12T05:40:00Z = 11:10 IST (Thu), 2026-11-12T02:00:00Z = 07:30 IST (Thu)
  const regularSlots = [
    { dayOfWeek: 'MON', openTime: '11:00', closeTime: '23:00', isClosed: false },
    { dayOfWeek: 'TUE', openTime: '11:00', closeTime: '23:00', isClosed: false },
    { dayOfWeek: 'WED', openTime: '11:00', closeTime: '23:00', isClosed: false },
    { dayOfWeek: 'THU', openTime: '11:00', closeTime: '23:00', isClosed: false },
    { dayOfWeek: 'FRI', openTime: '11:00', closeTime: '23:00', isClosed: false },
    { dayOfWeek: 'SAT', openTime: '11:00', closeTime: '23:00', isClosed: false },
    { dayOfWeek: 'SUN', openTime: '11:00', closeTime: '23:00', isClosed: true },
  ];
  const openIst = evaluateOutletOpenStatus({
    status: 'ACTIVE',
    slots: regularSlots,
    atDate: new Date('2026-11-12T05:40:00Z'),
  });
  assert.equal(openIst.isOpenNow, true);
  assert.equal(openIst.reason, 'OPEN');
  assert.ok(openIst.evaluatedAtIst.includes('2026-11-12 11:10 IST (THU)'));

  const earlyIst = evaluateOutletOpenStatus({
    status: 'ACTIVE',
    slots: regularSlots,
    atDate: new Date('2026-11-12T02:00:00Z'),
  });
  assert.equal(earlyIst.isOpenNow, false);
  assert.equal(earlyIst.reason, 'OUTSIDE_HOURS');
  assert.equal(earlyIst.nextOpenWindow, 'Today 11:00 IST');

  const holidayClosure = evaluateOutletOpenStatus({
    status: 'ACTIVE',
    slots: regularSlots,
    specialClosures: [{ date: '2026-11-12', reason: 'Kali Puja Deep Cleaning', isClosed: true }],
    atDate: new Date('2026-11-12T07:00:00Z'),
  });
  assert.equal(holidayClosure.isOpenNow, false);
  assert.equal(holidayClosure.reason, 'SPECIAL_CLOSURE');

  // 4. Full HTTP integration tests
  const config = validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4011',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_test_cp11',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long-cp11',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long-cp11',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    },
    { serviceName: 'bhojora-api-cp11-test', serviceVersion: '0.1.0' },
  );
  const logger = createLogger({ level: 'error', service: 'cp11-test', environment: 'test' });
  const testClock = new MutableTestClock('2026-11-12T06:30:00Z'); // 12:00 IST Thursday
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const rbacStore = new InMemoryRbacStore();
  const customerStore = new InMemoryCustomerStore();
  const restaurantStore = new InMemoryRestaurantStore();
  const restaurantService = new RestaurantService({
    restaurantStore,
    identityStore,
    rbacStore,
    signingSecret: config.jwtAccessSecret,
    logger,
  });
  const outletStore = new InMemoryOutletStore();
  const outletService = new OutletService({
    restaurantStore,
    outletStore,
    rbacStore,
    logger,
    clock: testClock,
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    customerStore,
    restaurantStore,
    restaurantService,
    outletStore,
    outletService,
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    // Prepare Admin (separate unverified MFA session vs verified MFA session)
    const adminSession = await createVerifiedPartnerSession(
      baseUrl,
      '+919830099001',
      'ops-cp11@bhojora.in',
      'Sayan Ops Admin',
    );
    await identityStore.updateUser(
      adminSession.userId,
      {
        roles: ['OPS_ADMIN', 'CUSTOMER'],
        mfaEnabled: true,
      },
      new Date(),
    );
    const unverifiedAdminToken = await loginWithEmail(baseUrl, 'ops-cp11@bhojora.in');
    const verifiedAdminToken = await loginWithEmail(baseUrl, 'ops-cp11@bhojora.in');

    const mfaSend = await apiJson(baseUrl, '/auth/mfa/send', {
      method: 'POST',
      token: verifiedAdminToken,
    });
    assert.equal(mfaSend.status, 200);
    const mfaMsg = otpAdapter.getLatestMessage();
    assert.ok(mfaMsg && /^\d{6}$/.test(mfaMsg.code));
    const mfaVerify = await apiJson(baseUrl, '/auth/mfa/verify', {
      method: 'POST',
      token: verifiedAdminToken,
      body: { challengeId: mfaSend.json.data.challengeId, code: mfaMsg.code },
    });
    assert.equal(mfaVerify.status, 200);
    assert.equal(mfaVerify.json.data.session.mfaVerified, true);

    // Onboard Partner A (Salt Lake) & Partner B (Park Street)
    const partnerA = await createVerifiedPartnerSession(
      baseUrl,
      '+919830011223',
      'partner-a@bhojora.in',
      'Partner A Owner',
    );
    const partnerB = await createVerifiedPartnerSession(
      baseUrl,
      '+919830044556',
      'partner-b@bhojora.in',
      'Partner B Owner',
    );

    const appA = await onboardAndApproveOutlet({
      baseUrl,
      partnerToken: partnerA.token,
      adminToken: verifiedAdminToken,
      fssaiLicenseNumber: '12826019000111',
      brandName: 'Bhojohori Manna',
      outletName: 'Salt Lake Sec V Flagship',
      zoneId: 'salt-lake',
      coordinates: [88.4317, 22.5806],
    });
    const appB = await onboardAndApproveOutlet({
      baseUrl,
      partnerToken: partnerB.token,
      adminToken: verifiedAdminToken,
      fssaiLicenseNumber: '12826019000222',
      brandName: 'Park Street Heritage',
      outletName: 'Park Street Kitchen',
      zoneId: 'central',
      coordinates: [88.3526, 22.5535],
    });

    // Re-issue partnerA & partnerB JWTs after RESTAURANT_OWNER promotion
    const partnerAToken = await loginWithEmail(baseUrl, 'partner-a@bhojora.in');
    const partnerBToken = await loginWithEmail(baseUrl, 'partner-b@bhojora.in');

    // Partner A lists outlets & creates a second branch outlet
    const ownerHeaders = { 'X-Bhojora-Active-Role': 'RESTAURANT_OWNER' };
    const listOwnOutlets = await apiJson(baseUrl, '/restaurant/outlets', {
      token: partnerAToken,
      headers: ownerHeaders,
    });
    assert.equal(listOwnOutlets.status, 200);
    assert.equal(listOwnOutlets.json.data.outlets.length, 1);
    assert.equal(listOwnOutlets.json.data.outlets[0].outletId, appA.outletId);

    const createBranchRes = await apiJson(baseUrl, '/restaurant/outlets', {
      method: 'POST',
      token: partnerAToken,
      headers: ownerHeaders,
      body: {
        restaurantId: appA.restaurantId,
        outletName: 'Salt Lake CK Block Branch',
        streetAddress: 'CK-24 Sector II Salt Lake',
        landmark: 'Near CK Tank',
        locality: 'Salt Lake Sector II',
        wardOrBorough: 'Bidhannagar Ward 33',
        postalCode: '700091',
        zoneId: 'salt-lake',
        coordinates: [88.429, 22.578],
        deliveryRadiusMeters: 4500,
        cuisines: ['Bengali', 'Thalis'],
        prepTimeMinutes: 25,
      },
    });
    assert.equal(createBranchRes.status, 201);
    const branchOutlet = createBranchRes.json.data.outlet;
    assert.equal(branchOutlet.platformInspectionStatus, 'NOT_INSPECTED');
    assert.equal(branchOutlet.publishedSafetyScore, null);
    assert.equal(branchOutlet.deliveryRadiusMeters, 4500);

    // Reject swapped coordinates on branch creation & map pin update
    const swappedCreate = await apiJson(baseUrl, '/restaurant/outlets', {
      method: 'POST',
      token: partnerAToken,
      headers: ownerHeaders,
      body: {
        restaurantId: appA.restaurantId,
        outletName: 'Invalid Swapped Branch',
        streetAddress: 'Plot 12 Sector V',
        landmark: 'Near Ring Road',
        locality: 'Sector V',
        wardOrBorough: 'Ward 32',
        postalCode: '700091',
        zoneId: 'salt-lake',
        coordinates: [22.58, 88.43],
        cuisines: ['Bengali'],
      },
    });
    assert.equal(swappedCreate.status, 400);

    // Tenant IDOR check: Partner B cannot mutate Partner A's outlet pin or hours
    const idorPatch = await apiJson(baseUrl, `/restaurant/outlets/${appA.outletId}`, {
      method: 'PATCH',
      token: partnerBToken,
      headers: ownerHeaders,
      body: { deliveryRadiusMeters: 12000 },
    });
    assert.equal(idorPatch.status, 403);
    const idorHours = await apiJson(baseUrl, `/restaurant/outlets/${appA.outletId}/hours`, {
      method: 'PUT',
      token: partnerBToken,
      headers: ownerHeaders,
      body: {
        slots: [{ dayOfWeek: 'THU', openTime: '09:00', closeTime: '18:00', isClosed: false }],
      },
    });
    assert.equal(idorHours.status, 403);

    // Partner A cannot inject platformInspectionStatus or publishedSafetyScore
    const tamperPatch = await apiJson(baseUrl, `/restaurant/outlets/${appA.outletId}`, {
      method: 'PATCH',
      token: partnerAToken,
      headers: ownerHeaders,
      body: {
        deliveryRadiusMeters: 6000,
        publishedSafetyScore: 99,
      },
    });
    assert.equal(tamperPatch.status, 400);

    // Partner A updates map pin & weekly operating hours cleanly
    const patchPin = await apiJson(baseUrl, `/restaurant/outlets/${appA.outletId}`, {
      method: 'PATCH',
      token: partnerAToken,
      headers: ownerHeaders,
      body: {
        coordinates: [88.4325, 22.5812],
        deliveryRadiusMeters: 4000,
      },
    });
    assert.equal(patchPin.status, 200);
    assert.equal(patchPin.json.data.outlet.deliveryRadiusMeters, 4000);
    assert.deepEqual(patchPin.json.data.outlet.location.coordinates, [88.4325, 22.5812]);

    const invalidHours = await apiJson(baseUrl, `/restaurant/outlets/${appA.outletId}/hours`, {
      method: 'PUT',
      token: partnerAToken,
      headers: ownerHeaders,
      body: {
        slots: [{ dayOfWeek: 'THU', openTime: '22:00', closeTime: '10:00', isClosed: false }],
      },
    });
    assert.equal(invalidHours.status, 400);

    const updateHours = await apiJson(baseUrl, `/restaurant/outlets/${appA.outletId}/hours`, {
      method: 'PUT',
      token: partnerAToken,
      headers: ownerHeaders,
      body: {
        slots: [
          { dayOfWeek: 'THU', openTime: '12:30', closeTime: '22:00', isClosed: false },
          { dayOfWeek: 'FRI', openTime: '11:00', closeTime: '23:00', isClosed: false },
        ],
        specialClosures: [{ date: '2026-11-15', reason: 'Maintenance', isClosed: true }],
      },
    });
    assert.equal(updateHours.status, 200);
    // Clock is 12:00 IST Thu, outlet opens at 12:30 IST Thu -> OUTSIDE_HOURS!
    assert.equal(updateHours.json.data.liveStatus.isOpenNow, false);
    assert.equal(updateHours.json.data.liveStatus.reason, 'OUTSIDE_HOURS');
    assert.equal(updateHours.json.data.liveStatus.nextOpenWindow, 'Today 12:30 IST');

    // Serviceability check from Salt Lake pin [88.433, 22.580] -> serviceable in SALT_LAKE_SEC_V, Salt Lake outlets within 4km, Park Street ~8.5km out of radius!
    const servSaltLake = await apiJson(baseUrl, '/serviceability?lng=88.433&lat=22.580');
    assert.equal(servSaltLake.status, 200);
    assert.equal(servSaltLake.json.data.serviceability.serviceable, true);
    assert.equal(servSaltLake.json.data.serviceability.matchedZone.zoneCode, 'SALT_LAKE_SEC_V');
    const parkStreetMatch = servSaltLake.json.data.serviceability.outlets.find(
      (o) => o.outletId === appB.outletId,
    );
    assert.ok(parkStreetMatch, 'Park Street outlet must appear in outlet distance breakdown');
    assert.equal(parkStreetMatch.withinRadius, false);
    assert.equal(parkStreetMatch.serviceable, false);

    // Public discovery sorted by Haversine distance & openNow filter in Asia/Kolkata!
    // At 12:00 IST, appA opens at 12:30 IST (closed now), whereas branchOutlet & appB use default 11:00-23:00 IST (open now!)
    const discoveryOpen = await apiJson(baseUrl, '/restaurants?lng=88.433&lat=22.580&openNow=true');
    assert.equal(discoveryOpen.status, 200);
    const openIds = discoveryOpen.json.data.restaurants.map((r) => r.outletId);
    assert.ok(
      !openIds.includes(appA.outletId),
      'Closed outlet appA must be excluded by openNow=true',
    );
    assert.ok(openIds.includes(branchOutlet.outletId), 'Open Salt Lake branch must be included');
    assert.equal(discoveryOpen.json.data.restaurants[0].outletId, branchOutlet.outletId);

    // Advance IST clock to 13:00 IST Thu (07:30 UTC) -> appA is now OPEN!
    testClock.setIso('2026-11-12T07:30:00Z');
    const detailOpen = await apiJson(baseUrl, `/outlets/${appA.outletId}?lng=88.433&lat=22.580`);
    assert.equal(detailOpen.status, 200);
    assert.equal(detailOpen.json.data.outlet.liveStatus.isOpenNow, true);
    assert.equal(detailOpen.json.data.outlet.liveStatus.reason, 'OPEN');
    assert.equal(detailOpen.json.data.outlet.platformInspectionStatus, 'NOT_INSPECTED');
    assert.equal(detailOpen.json.data.outlet.ownerPhoneMasked, undefined);

    // Swapped [lat, lng] on /serviceability returns 400; Mumbai coords return 200 serviceable: false
    const swappedQuery = await apiJson(baseUrl, '/serviceability?lng=22.5806&lat=88.4317');
    assert.equal(swappedQuery.status, 400);
    const outsideKolkata = await apiJson(baseUrl, '/serviceability/check', {
      method: 'POST',
      body: { coordinates: [72.8777, 19.076] },
    });
    assert.equal(outsideKolkata.status, 200);
    assert.equal(outsideKolkata.json.data.serviceability.serviceable, false);
    assert.equal(outsideKolkata.json.data.serviceability.matchedZone, null);

    // MFA-gated Admin zone mutation
    const unverifiedAdminZone = await apiJson(baseUrl, '/admin/zones', {
      method: 'POST',
      token: unverifiedAdminToken,
      body: {
        zoneCode: 'NEW_CORRIDOR',
        zoneId: 'salt-lake',
        name: 'New Test Corridor',
        boundary: { type: 'Polygon', coordinates: saltLakePoly },
        centerPoint: { type: 'Point', coordinates: [88.4317, 22.5806] },
        deliveryFeePaise: 2500,
        minOrderPaise: 14900,
        estimatedMinutes: 25,
      },
    });
    assert.equal(unverifiedAdminZone.status, 403);

    // Verified admin pauses SALT_LAKE_SEC_V -> customer inside Salt Lake polygon becomes unserviceable
    const pauseZoneRes = await apiJson(baseUrl, '/admin/zones/SALT_LAKE_SEC_V', {
      method: 'PATCH',
      token: verifiedAdminToken,
      body: { isActive: false },
    });
    assert.equal(pauseZoneRes.status, 200);
    assert.equal(pauseZoneRes.json.data.zone.isActive, false);

    const pausedCheck = await apiJson(baseUrl, '/serviceability?lng=88.433&lat=22.580');
    assert.equal(pausedCheck.status, 200);
    assert.equal(pausedCheck.json.data.serviceability.serviceable, false);

    // Reactivate SALT_LAKE_SEC_V cleanly
    const reactivateZone = await apiJson(baseUrl, '/admin/zones/SALT_LAKE_SEC_V', {
      method: 'PATCH',
      token: verifiedAdminToken,
      body: { isActive: true },
    });
    assert.equal(reactivateZone.status, 200);

    // Confirm audit logs recorded cross-tenant DENIED and admin zone mutation ALLOWED
    const logs = await rbacStore.listAuditLogs(50);
    assert.ok(
      logs.some(
        (entry) => entry.action === 'restaurant.outlet.update' && entry.outcome === 'DENIED',
      ),
    );
    assert.ok(
      logs.some(
        (entry) => entry.action === 'admin.delivery_zone.updated' && entry.outcome === 'ALLOWED',
      ),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // 5. React UI components integration & modern-web-guidance checks
  const outletPanelSrc = fs.readFileSync(
    path.resolve(__dirname, '../../client/restaurant-web/src/components/OutletZonesPanel.tsx'),
    'utf8',
  );
  assert.ok(outletPanelSrc.includes('inputMode="decimal"'));
  assert.ok(outletPanelSrc.includes('aria-invalid'));
  assert.ok(outletPanelSrc.includes('FSSAI_SEPARATION_NOTICE'));
  assert.ok(outletPanelSrc.includes('/api/v1/restaurant/outlets'));

  const zonePanelSrc = fs.readFileSync(
    path.resolve(__dirname, '../../client/admin-web/src/components/ZoneGovernancePanel.tsx'),
    'utf8',
  );
  assert.ok(zonePanelSrc.includes('/api/v1/admin/zones'));
  assert.ok(zonePanelSrc.includes('aria-invalid'));

  const discoverySrc = fs.readFileSync(
    path.resolve(__dirname, '../../client/customer-web/src/components/KitchenDiscovery.tsx'),
    'utf8',
  );
  assert.ok(discoverySrc.includes('/serviceability'));
  assert.ok(discoverySrc.includes('inputMode="decimal"'));

  console.log('ALL CHECKPOINT 11 OUTLET & SERVICE ZONES CHECKS PASSED.');
}

runTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
