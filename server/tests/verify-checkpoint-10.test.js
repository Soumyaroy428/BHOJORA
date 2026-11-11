'use strict';

const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
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
const { InMemoryCustomerStore } = require('../dist/modules/customer/customer.store.js');
const {
  ONBOARDING_APPLICATION_STATUSES,
  FSSAI_VERIFICATION_STATUSES,
  PLATFORM_INSPECTION_STATUSES,
  RESTAURANT_DOCUMENT_TYPES,
  MANDATORY_ONBOARDING_DOCUMENT_TYPES,
  DOCUMENT_VERIFICATION_STATUSES,
  DOCUMENT_ACCESS_CLASSIFICATIONS,
  ALLOWED_DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  ONBOARDING_REVIEW_DECISIONS,
  OPERATING_DAY_CODES,
  FSSAI_SEPARATION_NOTICE,
} = require('../dist/modules/restaurant/restaurant.types.js');
const {
  InMemoryRestaurantStore,
  createMongooseRestaurantModels,
} = require('../dist/modules/restaurant/restaurant.store.js');

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

async function registerUserWithRoles({ baseUrl, identityStore, name, email, phone, roles }) {
  const password = 'Bhojora#Partner2026';
  const reg = await apiJson(baseUrl, '/auth/register', {
    method: 'POST',
    body: {
      name,
      email,
      phone,
      password,
      acceptTerms: true,
    },
  });
  assert.equal(reg.status, 201, `Expected 201 for ${email}, got ${JSON.stringify(reg.json)}`);
  const userId = reg.json.data.user.id;
  if (roles && roles.length > 0) {
    await identityStore.updateUser(userId, { roles }, new Date());
    const login = await apiJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: { identifier: email, password },
    });
    assert.equal(login.status, 200);
    return {
      userId,
      accessToken: login.json.data.tokens.accessToken,
      email,
      password,
    };
  }
  return {
    userId,
    accessToken: reg.json.data.tokens.accessToken,
    email,
    password,
  };
}

async function verifyAdminMfa(baseUrl, accessToken, otpAdapter) {
  const sendRes = await apiJson(baseUrl, '/auth/mfa/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(sendRes.status, 200);
  const msg = otpAdapter.getLatestMessage();
  assert.ok(msg && /^\d{6}$/.test(msg.code));
  const verifyRes = await apiJson(baseUrl, '/auth/mfa/verify', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { challengeId: sendRes.json.data.challengeId, code: msg.code },
  });
  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.json.data.session.mfaVerified, true);
}

function buildValidDraftInput(overrides = {}) {
  return {
    legalEntity: {
      legalBusinessName: 'Kasturi Heritage Foods Pvt Ltd',
      ownerFullName: 'Subhamoy Chatterjee',
      ownerPhone: '+919830099111',
      ownerBusinessEmail: 'legal@kasturikolkata.in',
      panNumber: 'AAACK4321B',
      gstin: '19BBBBK5678C1Z9',
      fssaiLicenseNumber: '12824019000456',
      fssaiExpiresOn: '2027-09-30',
      ...(overrides.legalEntity || {}),
    },
    outletSetup: {
      brandName: 'Kasturi Kitchens',
      outletName: 'Kasturi — Salt Lake Sector V',
      streetAddress: 'Plot EP-GP, Sector V, Bidhannagar',
      landmark: 'Near Webel More',
      locality: 'Salt Lake',
      wardOrBorough: 'Bidhannagar Ward 32',
      city: 'Kolkata',
      postalCode: '700091',
      zoneId: 'salt-lake',
      coordinates: [88.4317, 22.5806],
      cuisines: ['Bengali', 'Seafood'],
      prepTimeMinutes: 30,
      ...(overrides.outletSetup || {}),
    },
    bankPayout: {
      accountHolderName: 'Kasturi Heritage Foods Pvt Ltd',
      bankAccountNumber: '50200012349876',
      ifscCode: 'HDFC0000412',
      ...(overrides.bankPayout || {}),
    },
  };
}

function sha256Hex(label) {
  return nodeCrypto.createHash('sha256').update(label).digest('hex');
}

async function run() {
  console.log('--- Starting Checkpoint 10 Restaurant Onboarding Verification Suite ---');

  // 1. Verify contract parity between @bhojora/shared and server restaurant module
  const sharedRestaurant = await import('../../client/shared/dist/contracts/restaurant.js');
  assert.deepEqual(
    [...ONBOARDING_APPLICATION_STATUSES],
    [...sharedRestaurant.ONBOARDING_APPLICATION_STATUSES],
  );
  assert.deepEqual(
    [...FSSAI_VERIFICATION_STATUSES],
    [...sharedRestaurant.FSSAI_VERIFICATION_STATUSES],
  );
  assert.deepEqual(
    [...PLATFORM_INSPECTION_STATUSES],
    [...sharedRestaurant.PLATFORM_INSPECTION_STATUSES],
  );
  assert.deepEqual([...RESTAURANT_DOCUMENT_TYPES], [...sharedRestaurant.RESTAURANT_DOCUMENT_TYPES]);
  assert.deepEqual(
    [...MANDATORY_ONBOARDING_DOCUMENT_TYPES],
    [...sharedRestaurant.MANDATORY_ONBOARDING_DOCUMENT_TYPES],
  );
  assert.deepEqual(
    [...DOCUMENT_VERIFICATION_STATUSES],
    [...sharedRestaurant.DOCUMENT_VERIFICATION_STATUSES],
  );
  assert.deepEqual(
    [...DOCUMENT_ACCESS_CLASSIFICATIONS],
    [...sharedRestaurant.DOCUMENT_ACCESS_CLASSIFICATIONS],
  );
  assert.deepEqual(
    [...ALLOWED_DOCUMENT_MIME_TYPES],
    [...sharedRestaurant.ALLOWED_DOCUMENT_MIME_TYPES],
  );
  assert.equal(MAX_DOCUMENT_SIZE_BYTES, sharedRestaurant.MAX_DOCUMENT_SIZE_BYTES);
  assert.deepEqual(
    [...ONBOARDING_REVIEW_DECISIONS],
    [...sharedRestaurant.ONBOARDING_REVIEW_DECISIONS],
  );
  assert.deepEqual([...OPERATING_DAY_CODES], [...sharedRestaurant.OPERATING_DAY_CODES]);
  assert.equal(FSSAI_SEPARATION_NOTICE, sharedRestaurant.FSSAI_SEPARATION_NOTICE);

  // 2. Verify OpenAPI contains all Checkpoint 10 endpoints
  const openapi = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, 'docs', '01-CORE-PLANNING-DESIGN', 'openapi.json'),
      'utf8',
    ),
  );
  for (const apiPath of [
    '/restaurants',
    '/restaurant/applications',
    '/restaurant/applications/{applicationId}',
    '/restaurant/applications/{applicationId}/documents/upload-url',
    '/restaurant/applications/{applicationId}/documents',
    '/restaurant/applications/{applicationId}/submit',
    '/restaurant/documents/{documentId}/access',
    '/admin/restaurant-applications',
    '/admin/restaurant-applications/{applicationId}',
    '/admin/restaurant-applications/{applicationId}/review',
  ]) {
    assert.ok(openapi.paths[apiPath], `openapi.json missing CP10 path ${apiPath}`);
  }

  // 3. Verify database index specs, server index.ts MongoDB wiring & Mongoose schema invariants
  const indexNames = new Set(INITIAL_DATABASE_INDEXES.map((spec) => spec.options.name));
  for (const requiredIdx of [
    'idx_restaurants_application_unique',
    'idx_restaurants_restaurant_unique',
    'idx_restaurants_owner_updated',
    'idx_restaurants_onboarding_submitted',
    'idx_outlets_outlet_unique',
    'idx_restaurant_docs_doc_id_unique',
    'idx_restaurant_docs_restaurant_type_uploaded',
  ]) {
    assert.ok(indexNames.has(requiredIdx), `Missing declarative index ${requiredIdx}`);
  }

  const serverIndexSource = fs.readFileSync(
    path.join(REPO_ROOT, 'server', 'src', 'index.ts'),
    'utf8',
  );
  assert.ok(
    serverIndexSource.includes('new MongooseRestaurantStore(mongoConnection)'),
    'server/src/index.ts must bind MongooseRestaurantStore to dbManager MongoDB connection',
  );

  const mockConn = mongoose.createConnection();
  try {
    const models = createMongooseRestaurantModels(mockConn);
    assert.equal(models.Restaurant.collection.name, COLLECTION_NAMES.restaurants);
    assert.equal(models.RestaurantOutlet.collection.name, COLLECTION_NAMES.restaurantOutlets);
    assert.equal(models.RestaurantDocument.collection.name, COLLECTION_NAMES.restaurantDocuments);

    // Must fail validation if someone attempts isPublic: true on compliance documents
    const invalidPublicDoc = new models.RestaurantDocument({
      documentId: 'doc_bad_public',
      applicationId: 'app_test',
      restaurantId: 'rest_test',
      ownerUserId: 'usr_test',
      documentType: 'FSSAI_CERTIFICATE',
      fileName: 'fssai.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      sha256Checksum: sha256Hex('doc'),
      storageKey: 'private/restaurants/rest_test/FSSAI_CERTIFICATE/doc_bad_public-fssai.pdf',
      accessClassification: 'PRIVATE_COMPLIANCE',
      isPublic: true,
      verificationStatus: 'PENDING_REVIEW',
      uploadedAt: new Date(),
    });
    await assert.rejects(() => invalidPublicDoc.validate(), /private \(isPublic: false\)/i);

    const invalidGeoOutlet = new models.RestaurantOutlet({
      outletId: 'out_bad_geo',
      restaurantId: 'rest_test',
      ownerUserId: 'usr_test',
      brandName: 'Test Brand',
      name: 'Test Outlet',
      slug: 'test-outlet',
      zoneId: 'salt-lake',
      wardOrBorough: 'Ward 32',
      streetAddress: 'Plot 12 Sector V',
      landmark: 'Near Webel More',
      locality: 'Salt Lake',
      city: 'Kolkata',
      postalCode: '700091',
      location: { type: 'Point', coordinates: [88.4317, 120] },
      cuisines: ['Bengali'],
      prepTimeMinutes: 25,
      operatingSlots: [
        { dayOfWeek: 'MON', openTime: '11:00', closeTime: '23:00', isClosed: false },
      ],
      status: 'ACTIVE',
      fssaiLicenseNumber: '12824019000456',
      fssaiExpiresOn: '2027-09-30',
      fssaiVerificationStatus: 'VERIFIED',
      platformInspectionStatus: 'NOT_INSPECTED',
      publishedSafetyScore: null,
    });
    await assert.rejects(() => invalidGeoOutlet.validate(), /latitude/i);
  } finally {
    await mockConn.close();
  }

  // 4. End-to-end Express onboarding, privacy, IDOR, single-use upload & MFA review suite
  const config = createTestConfig();
  const logger = createLogger({ level: 'error', serviceName: config.serviceName });
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const rbacStore = new InMemoryRbacStore();
  const customerStore = new InMemoryCustomerStore();
  const restaurantStore = new InMemoryRestaurantStore();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    customerStore,
    restaurantStore,
  });

  await withServer(app, async (baseUrl) => {
    // Unauthenticated boundaries
    assert.equal((await apiJson(baseUrl, '/restaurant/applications')).status, 401);
    assert.equal((await apiJson(baseUrl, '/admin/restaurant-applications')).status, 401);
    const emptyPublic = await apiJson(baseUrl, '/restaurants');
    assert.equal(emptyPublic.status, 200);
    assert.deepEqual(emptyPublic.json.data.restaurants, []);

    const applicantOne = await registerUserWithRoles({
      baseUrl,
      identityStore,
      name: 'Subhamoy Owner',
      email: 'owner.kasturi@example.com',
      phone: '+919830011001',
    });
    const applicantTwo = await registerUserWithRoles({
      baseUrl,
      identityStore,
      name: 'Other Applicant',
      email: 'other.applicant@example.com',
      phone: '+919830011002',
    });
    const adminUser = await registerUserWithRoles({
      baseUrl,
      identityStore,
      name: 'Ops Governance Admin',
      email: 'ops.admin@bhojora.in',
      phone: '+919830011099',
      roles: ['SUPER_ADMIN'],
    });

    // Non-admin rejected on admin review queue
    assert.equal(
      (
        await apiJson(baseUrl, '/admin/restaurant-applications', {
          headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
        })
      ).status,
      403,
    );

    // Admin without Step-Up MFA rejected with 403 MFA_REQUIRED
    const unverifiedAdminQueue = await apiJson(baseUrl, '/admin/restaurant-applications', {
      headers: { Authorization: `Bearer ${adminUser.accessToken}` },
    });
    assert.equal(unverifiedAdminQueue.status, 403);
    assert.equal(unverifiedAdminQueue.json.error.details[0].code, 'MFA_REQUIRED');

    // Verify Admin MFA
    await verifyAdminMfa(baseUrl, adminUser.accessToken, otpAdapter);

    // Applicant One creates draft onboarding application
    const draftRes = await apiJson(baseUrl, '/restaurant/applications', {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
      body: buildValidDraftInput(),
    });
    assert.equal(draftRes.status, 201);
    const appData = draftRes.json.data.application;
    assert.equal(appData.status, 'DRAFT');
    assert.equal(appData.fssaiVerificationStatus, 'NOT_SUBMITTED');
    assert.equal(appData.platformInspectionStatus, 'NOT_INSPECTED');
    assert.equal(appData.publishedSafetyScore, null);

    // Sensitive PII must be masked & raw PAN/bank account never returned
    const serializedDraft = JSON.stringify(draftRes.json);
    assert.equal(serializedDraft.includes('AAACK4321B'), false, 'Raw PAN must never leak');
    assert.equal(
      serializedDraft.includes('50200012349876'),
      false,
      'Raw bank account must never leak',
    );
    assert.equal('panNumber' in appData.legalEntity, false);
    assert.equal('panHash' in appData.legalEntity, false);
    assert.equal('bankAccountNumber' in appData.bankPayout, false);
    assert.equal('bankAccountHash' in appData.bankPayout, false);
    assert.equal(appData.legalEntity.panMasked, 'AA*****1B');
    assert.ok(appData.bankPayout.bankAccountMasked.endsWith('9876'));

    const applicationId = appData.applicationId;

    // Submitting without mandatory docs fails
    const prematureSubmit = await apiJson(
      baseUrl,
      `/restaurant/applications/${applicationId}/submit`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
      },
    );
    assert.equal(prematureSubmit.status, 400);

    // Path traversal file names must be rejected cleanly
    const traversalIntent = await apiJson(
      baseUrl,
      `/restaurant/applications/${applicationId}/documents/upload-url`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
        body: {
          documentType: 'FSSAI_CERTIFICATE',
          fileName: '../../secret/fssai license final.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 24576,
          sha256Checksum: sha256Hex('traversal-check'),
        },
      },
    );
    assert.equal(traversalIntent.status, 400);

    // Upload mandatory docs via 2-step signed upload + test normalization, tampering, and replay
    let fssaiDocId = '';
    const uploadedDocIds = [];
    for (const [idx, docType] of MANDATORY_ONBOARDING_DOCUMENT_TYPES.entries()) {
      const checksum = sha256Hex(`${docType}-${idx}`);
      const rawFileName = idx === 0 ? 'fssai license 2026.pdf' : `${docType.toLowerCase()}.pdf`;

      const intentRes = await apiJson(
        baseUrl,
        `/restaurant/applications/${applicationId}/documents/upload-url`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
          body: {
            documentType: docType,
            fileName: rawFileName,
            mimeType: 'application/pdf',
            sizeBytes: 24576,
            sha256Checksum: checksum,
          },
        },
      );
      assert.equal(intentRes.status, 200);
      const intent = intentRes.json.data.uploadIntent;
      assert.equal(intent.accessClassification, 'PRIVATE_COMPLIANCE');
      assert.equal(intent.storageKey.includes('..'), false, 'Path traversal must be sanitized');

      if (idx === 0) {
        // Checksum mismatch rejected
        const tamperedConfirm = await apiJson(
          baseUrl,
          `/restaurant/applications/${applicationId}/documents`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
            body: {
              documentType: docType,
              fileName: rawFileName,
              mimeType: 'application/pdf',
              sizeBytes: 24576,
              sha256Checksum: sha256Hex('tampered'),
              uploadToken: intent.uploadToken,
              storageKey: intent.storageKey,
            },
          },
        );
        assert.equal(tamperedConfirm.status, 403);
      }

      const confirmRes = await apiJson(
        baseUrl,
        `/restaurant/applications/${applicationId}/documents`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
          body: {
            documentType: docType,
            fileName: rawFileName,
            mimeType: 'application/pdf',
            sizeBytes: 24576,
            sha256Checksum: checksum,
            uploadToken: intent.uploadToken,
            storageKey: intent.storageKey,
          },
        },
      );
      assert.equal(confirmRes.status, 201);
      const docDto = confirmRes.json.data.document;
      uploadedDocIds.push(docDto.documentId);
      assert.equal(docDto.isPublic, false);
      assert.equal(docDto.accessClassification, 'PRIVATE_COMPLIANCE');
      assert.equal(docDto.fileName.includes(' '), false);
      if (idx === 0) {
        fssaiDocId = docDto.documentId;
        // Replaying the same single-use upload token must fail with 409 CONFLICT
        const replayConfirm = await apiJson(
          baseUrl,
          `/restaurant/applications/${applicationId}/documents`,
          {
            method: 'POST',
            headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
            body: {
              documentType: docType,
              fileName: rawFileName,
              mimeType: 'application/pdf',
              sizeBytes: 24576,
              sha256Checksum: checksum,
              uploadToken: intent.uploadToken,
              storageKey: intent.storageKey,
            },
          },
        );
        assert.equal(replayConfirm.status, 409);
      }
    }

    // Cross-applicant IDOR attempts on application & private document must fail 403 + log DENIED audit
    assert.equal(
      (
        await apiJson(baseUrl, `/restaurant/applications/${applicationId}`, {
          headers: { Authorization: `Bearer ${applicantTwo.accessToken}` },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await apiJson(baseUrl, `/restaurant/documents/${fssaiDocId}/access`, {
          headers: { Authorization: `Bearer ${applicantTwo.accessToken}` },
        })
      ).status,
      403,
    );
    const idorAudit = (await rbacStore.listAuditLogs()).find(
      (entry) =>
        entry.actorId === applicantTwo.userId &&
        entry.outcome === 'DENIED' &&
        entry.resourceId === fssaiDocId,
    );
    assert.ok(idorAudit, 'IDOR private document read attempt must be written to audit_logs');

    // Owner temporary signed access succeeds with no-store & noindex
    const ownerDocAccess = await apiJson(baseUrl, `/restaurant/documents/${fssaiDocId}/access`, {
      headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
    });
    assert.equal(ownerDocAccess.status, 200);
    assert.equal(ownerDocAccess.headers.get('cache-control'), 'no-store');
    assert.equal(ownerDocAccess.json.data.access.accessClassification, 'PRIVATE_COMPLIANCE');

    // Submit application for review
    const submitRes = await apiJson(baseUrl, `/restaurant/applications/${applicationId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
    });
    assert.equal(submitRes.status, 200);
    assert.equal(submitRes.json.data.application.status, 'SUBMITTED');
    assert.equal(submitRes.json.data.application.fssaiVerificationStatus, 'PENDING_REVIEW');

    // Admin cannot self-review their own submitted application
    const adminOwnDraft = await apiJson(baseUrl, '/restaurant/applications', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminUser.accessToken}` },
      body: buildValidDraftInput({
        legalEntity: {
          legalBusinessName: 'Admin Conflict Kitchen',
          fssaiLicenseNumber: '12824019000999',
        },
      }),
    });
    assert.equal(adminOwnDraft.status, 201);
    const adminOwnAppId = adminOwnDraft.json.data.application.applicationId;
    for (const docType of MANDATORY_ONBOARDING_DOCUMENT_TYPES) {
      const checksum = sha256Hex(`admin-own-${docType}`);
      const intentRes = await apiJson(
        baseUrl,
        `/restaurant/applications/${adminOwnAppId}/documents/upload-url`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${adminUser.accessToken}` },
          body: {
            documentType: docType,
            fileName: `${docType}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            sha256Checksum: checksum,
          },
        },
      );
      await apiJson(baseUrl, `/restaurant/applications/${adminOwnAppId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.accessToken}` },
        body: {
          documentType: docType,
          fileName: `${docType}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          sha256Checksum: checksum,
          uploadToken: intentRes.json.data.uploadIntent.uploadToken,
          storageKey: intentRes.json.data.uploadIntent.storageKey,
        },
      });
    }
    await apiJson(baseUrl, `/restaurant/applications/${adminOwnAppId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminUser.accessToken}` },
    });
    const selfReviewRes = await apiJson(
      baseUrl,
      `/admin/restaurant-applications/${adminOwnAppId}/review`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.accessToken}` },
        body: {
          decision: 'APPROVE',
          fssaiVerificationDecision: 'VERIFIED',
          reason: 'Attempting to review my own application',
        },
      },
    );
    assert.equal(selfReviewRes.status, 403);
    assert.equal(selfReviewRes.json.error.details[0].code, 'SELF_REVIEW_PROHIBITED');

    // MFA-verified admin inspects applicantOne queue & documents
    const queueRes = await apiJson(baseUrl, '/admin/restaurant-applications?status=SUBMITTED', {
      headers: { Authorization: `Bearer ${adminUser.accessToken}` },
    });
    assert.equal(queueRes.status, 200);
    assert.ok(queueRes.json.data.applications.some((item) => item.applicationId === applicationId));

    const adminDocAccess = await apiJson(baseUrl, `/restaurant/documents/${fssaiDocId}/access`, {
      headers: { Authorization: `Bearer ${adminUser.accessToken}` },
    });
    assert.equal(adminDocAccess.status, 200);

    // Review with short reason rejected (validation)
    const shortReasonRes = await apiJson(
      baseUrl,
      `/admin/restaurant-applications/${applicationId}/review`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.accessToken}` },
        body: {
          decision: 'REQUEST_CHANGES',
          fssaiVerificationDecision: 'PENDING_REVIEW',
          reason: 'bad',
        },
      },
    );
    assert.equal(shortReasonRes.status, 400);

    // Admin requests changes -> applicant updates & resubmits -> admin approves
    const changesRes = await apiJson(
      baseUrl,
      `/admin/restaurant-applications/${applicationId}/review`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.accessToken}` },
        body: {
          decision: 'REQUEST_CHANGES',
          fssaiVerificationDecision: 'PENDING_REVIEW',
          reason: 'Clarify kitchen Landmark near Webel More entrance',
        },
      },
    );
    assert.equal(changesRes.status, 200);
    assert.equal(changesRes.json.data.application.status, 'CHANGES_REQUESTED');

    const patchRes = await apiJson(baseUrl, `/restaurant/applications/${applicationId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
      body: { outletSetup: { landmark: 'Opposite Webel More Bus Stop, Sector V' } },
    });
    assert.equal(patchRes.status, 200);

    const resubmitRes = await apiJson(baseUrl, `/restaurant/applications/${applicationId}/submit`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${applicantOne.accessToken}` },
    });
    assert.equal(resubmitRes.status, 200);

    // Approval without verifying mandatory compliance documents must fail 400
    const unverifiedDocsApprove = await apiJson(
      baseUrl,
      `/admin/restaurant-applications/${applicationId}/review`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.accessToken}` },
        body: {
          decision: 'APPROVE',
          fssaiVerificationDecision: 'VERIFIED',
          fssaiVerifiedNote: 'Validated 14-digit WB FSSAI registration certificate',
          reason: 'Attempting approval before verifying compliance docs',
        },
      },
    );
    assert.equal(unverifiedDocsApprove.status, 400);

    const approveRes = await apiJson(
      baseUrl,
      `/admin/restaurant-applications/${applicationId}/review`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminUser.accessToken}` },
        body: {
          decision: 'APPROVE',
          fssaiVerificationDecision: 'VERIFIED',
          fssaiVerifiedNote: 'Validated 14-digit WB FSSAI registration certificate',
          reason: 'KYC legal entity, PAN, bank cheque, and statutory FSSAI verified',
          documentReviews: uploadedDocIds.map((documentId) => ({
            documentId,
            verificationStatus: 'VERIFIED',
            note: 'KYC file verified by admin',
          })),
        },
      },
    );
    assert.equal(approveRes.status, 200);
    const approvedApp = approveRes.json.data.application;
    assert.equal(approvedApp.status, 'APPROVED');
    assert.equal(approvedApp.fssaiVerificationStatus, 'VERIFIED');
    // Crucial separation rule: FSSAI + onboarding approval NEVER marks platform hygiene inspected!
    assert.equal(approvedApp.platformInspectionStatus, 'NOT_INSPECTED');
    assert.equal(approvedApp.publishedSafetyScore, null);

    // ApplicantOne re-logs in as RESTAURANT_OWNER and reaches tenant-scoped outlet workspace
    const ownerRelogin = await apiJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: { identifier: applicantOne.email, password: applicantOne.password },
    });
    assert.equal(ownerRelogin.status, 200);
    assert.ok(ownerRelogin.json.data.user.roles.includes('RESTAURANT_OWNER'));
    const workspaceRes = await apiJson(baseUrl, `/rbac/outlets/${approvedApp.outletId}/workspace`, {
      headers: {
        Authorization: `Bearer ${ownerRelogin.json.data.tokens.accessToken}`,
        'X-Bhojora-Active-Role': 'RESTAURANT_OWNER',
      },
    });
    assert.equal(workspaceRes.status, 200);

    // Public discovery lists approved outlet WITHOUT exposing private docs, PAN, bank or owner PII,
    // and keeps FSSAI_VERIFIED strictly separate from NOT_INSPECTED platform inspection
    const publicRes = await apiJson(baseUrl, '/restaurants?zoneId=salt-lake');
    assert.equal(publicRes.status, 200);
    assert.equal(publicRes.json.data.restaurants.length, 1);
    const publicOutlet = publicRes.json.data.restaurants[0];
    assert.equal(publicOutlet.outletId, approvedApp.outletId);
    assert.equal(publicOutlet.fssaiVerificationStatus, 'VERIFIED');
    assert.equal(publicOutlet.platformInspectionStatus, 'NOT_INSPECTED');
    assert.equal(publicOutlet.publishedSafetyScore, null);
    assert.equal(publicOutlet.fssaiSeparationNotice, FSSAI_SEPARATION_NOTICE);

    const serializedPublic = JSON.stringify(publicRes.json);
    assert.equal(serializedPublic.includes('private/restaurants'), false);
    assert.equal(serializedPublic.includes('panMasked'), false);
    assert.equal(serializedPublic.includes('bankAccountMasked'), false);
    assert.equal(serializedPublic.includes('ownerBusinessEmail'), false);
    assert.equal(serializedPublic.includes('ownerPhoneMasked'), false);
    assert.equal(serializedPublic.includes('AAACK4321B'), false);
    assert.equal(serializedPublic.includes('50200012349876'), false);
  });

  // 5. Verify React UI accessibility & anti-slop requirements across partner + admin portals
  const restaurantPanelSource = fs.readFileSync(
    path.join(
      REPO_ROOT,
      'client',
      'restaurant-web',
      'src',
      'components',
      'RestaurantOnboardingPanel.tsx',
    ),
    'utf8',
  );
  const adminQueueSource = fs.readFileSync(
    path.join(REPO_ROOT, 'client', 'admin-web', 'src', 'components', 'OnboardingReviewQueue.tsx'),
    'utf8',
  );
  for (const snippet of [
    '<fieldset',
    '<legend>',
    'aria-describedby',
    'aria-live="polite"',
    'autoComplete',
    'FSSAI_SEPARATION_NOTICE',
  ]) {
    assert.ok(
      restaurantPanelSource.includes(snippet),
      `restaurant-web onboarding missing ${snippet}`,
    );
  }
  for (const snippet of [
    '<caption>',
    'scope="col"',
    'aria-live="polite"',
    'mfaVerified',
    'FSSAI_SEPARATION_NOTICE',
  ]) {
    assert.ok(adminQueueSource.includes(snippet), `admin-web queue missing ${snippet}`);
  }
  for (const cssRel of [
    'client/restaurant-web/src/styles.css',
    'client/admin-web/src/styles.css',
  ]) {
    const css = fs.readFileSync(path.join(REPO_ROOT, cssRel), 'utf8');
    assert.ok(
      css.includes(':user-invalid'),
      `${cssRel} must style :user-invalid instead of eager :invalid`,
    );
  }

  console.log('ALL CHECKPOINT 10 RESTAURANT ONBOARDING CHECKS PASSED.');
}

run().catch((error) => {
  console.error('Checkpoint 10 verification failed:', error);
  process.exit(1);
});
