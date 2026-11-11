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
const { InMemoryTestOtpAdapter } = require('../dist/modules/identity/otp.adapter.js');
const { IdentityService } = require('../dist/modules/identity/identity.service.js');
const { InMemoryRbacStore } = require('../dist/modules/rbac/rbac.store.js');
const {
  CUSTOMER_DIETARY_PREFERENCES,
  LOCATION_PERMISSION_STATES,
  KOLKATA_ZONE_IDS,
  ADDRESS_LABELS,
  ACCOUNT_DELETION_RETENTION_DAYS,
  GPS_LOCATION_RETENTION_HOURS,
} = require('../dist/modules/customer/customer.types.js');
const {
  InMemoryCustomerStore,
  createMongooseCustomerModels,
} = require('../dist/modules/customer/customer.store.js');

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
  return { status: response.status, headers: response.headers, json };
}

async function registerCustomer(baseUrl, { name, email, phone }) {
  const reg = await apiJson(baseUrl, '/auth/register', {
    method: 'POST',
    body: {
      name,
      email,
      phone,
      password: 'Bhojora#Customer2026',
      acceptTerms: true,
    },
  });
  assert.equal(reg.status, 201, `Expected 201 for ${email}, got ${JSON.stringify(reg.json)}`);
  return {
    userId: reg.json.data.user.id,
    accessToken: reg.json.data.tokens.accessToken,
    email,
  };
}

async function run() {
  const sharedCustomerPath = path.join(
    REPO_ROOT,
    'client',
    'shared',
    'dist',
    'contracts',
    'customer.js',
  );
  assert.ok(
    fs.existsSync(sharedCustomerPath),
    'client/shared customer contracts must be built first',
  );
  const sharedCustomer = require(sharedCustomerPath);

  assert.deepEqual(
    [...sharedCustomer.CUSTOMER_DIETARY_PREFERENCES],
    [...CUSTOMER_DIETARY_PREFERENCES],
  );
  assert.deepEqual([...sharedCustomer.LOCATION_PERMISSION_STATES], [...LOCATION_PERMISSION_STATES]);
  assert.deepEqual([...sharedCustomer.KOLKATA_ZONE_IDS], [...KOLKATA_ZONE_IDS]);
  assert.deepEqual([...sharedCustomer.ADDRESS_LABELS], [...ADDRESS_LABELS]);
  assert.equal(sharedCustomer.ACCOUNT_DELETION_RETENTION_DAYS, ACCOUNT_DELETION_RETENTION_DAYS);
  assert.equal(sharedCustomer.GPS_LOCATION_RETENTION_HOURS, GPS_LOCATION_RETENTION_HOURS);

  const indexNames = new Set(INITIAL_DATABASE_INDEXES.map((spec) => spec.options.name));
  for (const requiredIdx of [
    'idx_customer_profiles_user_id_unique',
    'idx_customer_profiles_deletion_schedule',
    'idx_addresses_id_unique',
    'idx_addresses_user_default_created',
    'idx_addresses_location_2dsphere',
  ]) {
    assert.ok(indexNames.has(requiredIdx), `Missing database index spec: ${requiredIdx}`);
  }

  const mongooseModels = createMongooseCustomerModels(mongoose.connection);
  assert.equal(mongooseModels.CustomerProfile.collection.name, COLLECTION_NAMES.customerProfiles);
  assert.equal(mongooseModels.SavedAddress.collection.name, COLLECTION_NAMES.addresses);

  const invalidCoordsDoc = new mongooseModels.SavedAddress({
    addressId: 'addr_bad',
    userId: 'user_bad',
    label: 'Home',
    recipientName: 'Test User',
    streetAddress: '12 Park Street',
    landmark: 'Near Metro',
    locality: 'Park Street',
    city: 'Kolkata',
    postalCode: '700016',
    location: { type: 'Point', coordinates: [195, 22.5] },
  });
  await assert.rejects(() => invalidCoordsDoc.validate(), /GeoJSON Point coordinates/);

  const serverIndexSource = fs.readFileSync(
    path.join(REPO_ROOT, 'server', 'src', 'index.ts'),
    'utf8',
  );
  assert.ok(
    serverIndexSource.includes('new MongooseRbacStore(mongoConnection)'),
    'server/src/index.ts must bind MongooseRbacStore to active MongoDB connection',
  );
  assert.ok(
    serverIndexSource.includes('new MongooseCustomerStore(mongoConnection)'),
    'server/src/index.ts must bind MongooseCustomerStore to active MongoDB connection',
  );

  const config = createTestConfig();
  const logger = createLogger({
    level: 'error',
    service: 'bhojora-cp09-test',
    environment: 'test',
    includeStack: false,
  });
  const identityStore = new InMemoryIdentityStore();
  const rbacStore = new InMemoryRbacStore();
  const customerStore = new InMemoryCustomerStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    customerStore,
  });

  await withServer(app, async (baseUrl) => {
    // 1. Unauthenticated requests blocked with 401
    for (const [method, endpoint] of [
      ['GET', '/customer/profile'],
      ['PATCH', '/customer/profile'],
      ['GET', '/addresses'],
      ['POST', '/addresses'],
      ['GET', '/customer/consents'],
      ['POST', '/customer/consents'],
      ['GET', '/customer/privacy/export'],
      ['POST', '/customer/account/deletion-request'],
    ]) {
      const res = await apiJson(baseUrl, endpoint, { method });
      assert.equal(res.status, 401, `Expected 401 on unauthenticated ${method} ${endpoint}`);
    }

    const customerA = await registerCustomer(baseUrl, {
      name: 'Ananya Chatterjee',
      email: 'ananya.cp09@example.com',
      phone: '+919830099111',
    });
    const customerB = await registerCustomer(baseUrl, {
      name: 'Rohan Sen',
      email: 'rohan.cp09@example.com',
      phone: '+919830099222',
    });

    const authA = { Authorization: `Bearer ${customerA.accessToken}` };
    const authB = { Authorization: `Bearer ${customerB.accessToken}` };

    // 2. Profile initialization defaults to promotions=false & deletionStatus=NONE
    const initProfile = await apiJson(baseUrl, '/customer/profile', { headers: authA });
    assert.equal(initProfile.status, 200);
    assert.equal(initProfile.json.data.profile.notificationPreferences.promotions, false);
    assert.equal(initProfile.json.data.profile.locationPermissionState, 'prompt');
    assert.equal(initProfile.json.data.profile.deletionRequest.status, 'NONE');
    assert.ok(
      initProfile.json.data.consents.some(
        (c) => c.consentType === 'TERMS_AND_PRIVACY' && c.granted,
      ),
    );

    // 3. Unicode Bengali name + preferences + location permission consent logging
    const updatedProfile = await apiJson(baseUrl, '/customer/profile', {
      method: 'PATCH',
      headers: authA,
      body: {
        name: 'অনন্যা চ্যাটার্জি',
        languagePreference: 'bn-IN',
        dietaryPreference: 'VEG',
        savedDeliveryZoneId: 'salt-lake',
        locationPermissionState: 'granted',
        lastKnownLocalityLabel: 'Salt Lake (Sector V)',
        notificationPreferences: { promotions: true, safetyAlerts: true },
      },
    });
    assert.equal(updatedProfile.status, 200);
    assert.equal(updatedProfile.json.data.user.name, 'অনন্যা চ্যাটার্জি');
    assert.equal(updatedProfile.json.data.user.languagePreference, 'bn-IN');
    assert.equal(updatedProfile.json.data.profile.dietaryPreference, 'VEG');
    assert.equal(updatedProfile.json.data.profile.locationPermissionState, 'granted');
    assert.ok(
      updatedProfile.json.data.consents.some(
        (c) => c.consentType === 'PRECISE_LOCATION' && c.granted === true,
      ),
    );
    assert.ok(
      updatedProfile.json.data.consents.some(
        (c) => c.consentType === 'MARKETING_PROMOTIONS' && c.granted === true,
      ),
    );

    // 4. Saved Kolkata Addresses CRUD + Phone masking + Default auto-promotion
    const badPin = await apiJson(baseUrl, '/addresses', {
      method: 'POST',
      headers: authA,
      body: {
        label: 'Home',
        recipientName: 'অনন্যা চ্যাটার্জি',
        streetAddress: 'Flat 4B, Block EP, Salt Lake',
        landmark: 'Karunamoyee',
        locality: 'Salt Lake',
        postalCode: '123',
      },
    });
    assert.equal(badPin.status, 400);

    const addr1Res = await apiJson(baseUrl, '/addresses', {
      method: 'POST',
      headers: authA,
      body: {
        label: 'Home',
        recipientName: 'অনন্যা চ্যাটার্জি',
        contactPhone: '+919830099111',
        streetAddress: 'ফ্ল্যাট ৪বি, ব্লক ইপি, সেক্টর ৫',
        landmark: 'করুণাময়ী বাস স্ট্যান্ডের কাছে',
        locality: 'Salt Lake Sector V',
        postalCode: '700091',
        zoneId: 'salt-lake',
      },
    });
    assert.equal(addr1Res.status, 201);
    const addr1 = addr1Res.json.data.address;
    assert.equal(addr1.isDefault, true, 'First saved address should auto-become default');
    assert.equal(
      addr1.contactPhoneNormalized,
      undefined,
      'Raw contactPhone must never leak in DTO',
    );
    assert.ok(
      typeof addr1.contactPhoneMasked === 'string' && addr1.contactPhoneMasked.includes('9111'),
    );

    const addr2Res = await apiJson(baseUrl, '/addresses', {
      method: 'POST',
      headers: authA,
      body: {
        label: 'Work',
        recipientName: 'Ananya Chatterjee',
        streetAddress: '18B Park Street, 3rd Floor',
        landmark: 'Opposite Flurys',
        locality: 'Park Street',
        postalCode: '700016',
        zoneId: 'central',
        isDefault: true,
      },
    });
    assert.equal(addr2Res.status, 201);
    const addr2 = addr2Res.json.data.address;
    assert.equal(addr2.isDefault, true);

    const listA = await apiJson(baseUrl, '/addresses', { headers: authA });
    assert.equal(listA.status, 200);
    assert.equal(listA.json.data.addresses.length, 2);
    const a1InList = listA.json.data.addresses.find((x) => x.addressId === addr1.addressId);
    assert.equal(a1InList.isDefault, false);

    // 5. Cross-customer IDOR protection (Customer B CANNOT read, update, set default, or delete Customer A address)
    const idorGet = await apiJson(baseUrl, `/addresses/${addr1.addressId}`, { headers: authB });
    assert.equal(idorGet.status, 403);

    const idorPatch = await apiJson(baseUrl, `/addresses/${addr1.addressId}`, {
      method: 'PATCH',
      headers: authB,
      body: { landmark: 'Tampered Landmark' },
    });
    assert.equal(idorPatch.status, 403);

    const idorDefault = await apiJson(baseUrl, `/addresses/${addr1.addressId}/default`, {
      method: 'POST',
      headers: authB,
    });
    assert.equal(idorDefault.status, 403);

    const idorDelete = await apiJson(baseUrl, `/addresses/${addr1.addressId}`, {
      method: 'DELETE',
      headers: authB,
    });
    assert.equal(idorDelete.status, 403);

    const listB = await apiJson(baseUrl, '/addresses', { headers: authB });
    assert.equal(listB.status, 200);
    assert.equal(listB.json.data.addresses.length, 0);

    const logsAfterIdor = await rbacStore.listAuditLogs(20);
    assert.ok(
      logsAfterIdor.some(
        (entry) =>
          entry.actorId === customerB.userId &&
          entry.action === 'address.ownership.denied' &&
          entry.outcome === 'DENIED',
      ),
      'Cross-customer IDOR attempt must be recorded in audit_logs',
    );

    // Deleting current default address promotes remaining address back to default
    const delAddr2 = await apiJson(baseUrl, `/addresses/${addr2.addressId}`, {
      method: 'DELETE',
      headers: authA,
    });
    assert.equal(delAddr2.status, 200);
    const listAfterDel = await apiJson(baseUrl, '/addresses', { headers: authA });
    assert.equal(listAfterDel.json.data.addresses.length, 1);
    assert.equal(listAfterDel.json.data.addresses[0].isDefault, true);

    // 6. Consent withdrawal & Terms withdrawal guard
    const withdrawPromo = await apiJson(baseUrl, '/customer/consents', {
      method: 'POST',
      headers: authA,
      body: {
        consentType: 'MARKETING_PROMOTIONS',
        granted: false,
        note: 'Opted out from festival promos',
      },
    });
    assert.equal(withdrawPromo.status, 201);
    assert.equal(withdrawPromo.json.data.consent.granted, false);

    const rejectTermsWithdraw = await apiJson(baseUrl, '/customer/consents', {
      method: 'POST',
      headers: authA,
      body: {
        consentType: 'TERMS_AND_PRIVACY',
        granted: false,
      },
    });
    assert.equal(rejectTermsWithdraw.status, 400);

    // 7. Self-service privacy data export & Account deletion / 30-day retention workflow
    const exportRes = await apiJson(baseUrl, '/customer/privacy/export', { headers: authA });
    assert.equal(exportRes.status, 200);
    assert.equal(exportRes.json.data.retentionPolicy.accountDeletionGraceDays, 30);
    assert.equal(exportRes.json.data.retentionPolicy.gpsLocationRetentionHours, 24);
    assert.equal(exportRes.json.data.addresses.length, 1);
    assert.equal(exportRes.json.data.profile.notificationPreferences.promotions, false);

    const wrongConfirm = await apiJson(baseUrl, '/customer/account/deletion-request', {
      method: 'POST',
      headers: authA,
      body: { confirmText: 'NOPE' },
    });
    assert.equal(wrongConfirm.status, 400);

    const deletionRes = await apiJson(baseUrl, '/customer/account/deletion-request', {
      method: 'POST',
      headers: authA,
      body: { confirmText: 'DELETE', reason: 'Closing pilot account' },
    });
    assert.equal(deletionRes.status, 200);
    assert.equal(deletionRes.json.data.status, 'DELETION_REQUESTED');
    assert.equal(deletionRes.json.data.retentionDays, 30);
    assert.ok(deletionRes.json.data.revokedSessions >= 1);
    assert.match(deletionRes.headers.get('clear-site-data') ?? '', /"cookies"/);

    // Session immediately revoked & login rejected once DELETION_REQUESTED
    const revokedProfileAttempt = await apiJson(baseUrl, '/customer/profile', { headers: authA });
    assert.equal(revokedProfileAttempt.status, 401);

    const deletedLoginAttempt = await apiJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: { identifier: customerA.email, password: 'Bhojora#Customer2026' },
    });
    assert.equal(deletedLoginAttempt.status, 403);
  });

  // 8. Frontend React customer-web UX & documentation retention checks
  const accountPanelSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'client', 'customer-web', 'src', 'components', 'CustomerAccountPanel.tsx'),
    'utf8',
  );
  for (const requiredToken of [
    'autoComplete="street-address"',
    'autoComplete="postal-code"',
    'autoComplete="name"',
    'exportPrivacyDataBtn',
    'requestAccountDeletionBtn',
  ]) {
    assert.ok(
      accountPanelSrc.includes(requiredToken),
      `Missing CustomerAccountPanel contract: ${requiredToken}`,
    );
  }

  const pilotDialogSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'client', 'customer-web', 'src', 'components', 'PilotInfoDialog.tsx'),
    'utf8',
  );
  assert.ok(pilotDialogSrc.includes('navigator.geolocation.getCurrentPosition'));
  assert.ok(pilotDialogSrc.includes('ST-06'));

  const authDoc = fs.readFileSync(
    path.join(REPO_ROOT, 'docs', '03-SECURITY-QUALITY', 'AUTH.md'),
    'utf8',
  );
  assert.ok(authDoc.includes('Checkpoint 09 Baseline'));
  assert.ok(authDoc.includes('30-day statutory retention window'));

  console.log(
    '[verify-checkpoint-09] PASSED: Customer profile, saved Kolkata addresses, IDOR isolation, consents, location UX & deletion retention verified.',
  );
}

run().catch((error) => {
  console.error('[verify-checkpoint-09] FAILED:', error);
  process.exit(1);
});
