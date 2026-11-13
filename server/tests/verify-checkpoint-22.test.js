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
const { InMemoryInspectorStore } = require('../dist/modules/inspector/inspector.store.js');
const { InspectorService } = require('../dist/modules/inspector/inspector.service.js');
const { InMemoryInspectionStore } = require('../dist/modules/inspection/inspection.store.js');
const { InspectionService } = require('../dist/modules/inspection/inspection.service.js');
const {
  STANDARD_CHECKLIST_TEMPLATE_V1,
} = require('../dist/modules/inspection/inspection.types.js');

const TEST_PASSWORD = 'Bhojora#Inspector2026';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4022',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp22_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp22!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp22!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp22!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp22!',
    },
    { serviceName: 'bhojora-test-cp22', serviceVersion: '0.1.0' },
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
  const response = await fetch(url, { method, headers, body: bodyStr });
  const rawText = await response.text();
  let json;
  try {
    json = JSON.parse(rawText);
  } catch {
    json = null;
  }
  return { status: response.status, json, rawText };
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
  };
}

async function createAdminUser(baseUrl, identityStore, email, phone, name, role = 'TRUST_ADMIN') {
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
  };
}

function computeSha256(buffer) {
  return nodeCrypto.createHash('sha256').update(buffer).digest('hex');
}

async function runVerification() {
  console.log('🚀 Starting Checkpoint 22 Automated Verification Test Suite...');
  console.log(
    'Testing: Inspection Checklist, Offline Drafts, Evidence Hashing & Submission Gate\n',
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

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    inspectorStore,
    inspectorService,
    inspectionStore,
    inspectionService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Checklist Template Version 1.0 structural compliance
    // -------------------------------------------------------------------------
    console.log('Test 1: Versioned Checklist Template (v1.0) structural compliance...');
    assert.equal(STANDARD_CHECKLIST_TEMPLATE_V1.version, 'v1.0');
    assert.equal(STANDARD_CHECKLIST_TEMPLATE_V1.items.length, 8);
    const totalMaxScore = STANDARD_CHECKLIST_TEMPLATE_V1.items.reduce(
      (sum, item) => sum + item.maxScore,
      0,
    );
    assert.equal(totalMaxScore, 100, 'Checklist template total score must equal 100 points');
    const categories = new Set(STANDARD_CHECKLIST_TEMPLATE_V1.items.map((i) => i.category));
    assert.equal(categories.size, 6, 'Must cover 6 distinct categories for Kolkata hygiene');
    console.log(
      '✓ Test 1 Passed: Template v1.0 covers 8 items across 6 categories totalling 100 points.\n',
    );

    // Setup Inspector 1 (Anirban) and Inspector 2 (Sourav) and Admin
    const admin = await createAdminUser(
      baseUrl,
      identityStore,
      'admin.council@bhojora.internal',
      '+919830000001',
      'Council Admin',
      'TRUST_ADMIN',
    );

    const insp1User = await registerCustomer(
      baseUrl,
      'anirban.inspect@bhojora.internal',
      '+919830111111',
      'Dr. Anirban Mukherjee',
    );
    const insp2User = await registerCustomer(
      baseUrl,
      'sourav.inspect@bhojora.internal',
      '+919830222222',
      'Sourav Ganguly',
    );

    // Apply as Inspector 1
    const apply1Res = await apiJson(baseUrl, '/inspectors/apply', {
      method: 'POST',
      token: insp1User.token,
      body: {
        fullName: 'Dr. Anirban Mukherjee',
        phone: '+919830111111',
        cityCode: 'KOLKATA',
        certifications: [
          {
            certificateType: 'FSSAI_FOSTAC',
            certificateNumber: 'FSSAI-WB-9921',
            issuingAuthority: 'FSSAI',
            issuedAt: '2024-01-01T00:00:00.000Z',
            expiresAt: '2028-12-31T00:00:00.000Z',
          },
        ],
        conflicts: [
          {
            restaurantId: 'rest_conflict_spot',
            outletId: 'out_conflict_spot_main',
            conflictType: 'PREVIOUS_EMPLOYMENT',
            description: 'Former hygiene consultant in 2023',
          },
        ],
      },
    });
    assert.equal(
      apply1Res.status,
      201,
      `Failed to apply inspector 1: ${JSON.stringify(apply1Res.json)}`,
    );
    const inspector1Id = apply1Res.json.data.profile.id;

    // Apply as Inspector 2
    const apply2Res = await apiJson(baseUrl, '/inspectors/apply', {
      method: 'POST',
      token: insp2User.token,
      body: {
        fullName: 'Sourav Ganguly',
        phone: '+919830222222',
        cityCode: 'KOLKATA',
        certifications: [
          {
            certificateType: 'FOOD_SAFETY_AUDITOR',
            certificateNumber: 'FSA-KOL-8812',
            issuingAuthority: 'QCI',
            issuedAt: '2024-01-01T00:00:00.000Z',
            expiresAt: '2027-12-31T00:00:00.000Z',
          },
        ],
      },
    });
    assert.equal(
      apply2Res.status,
      201,
      `Failed to apply inspector 2: ${JSON.stringify(apply2Res.json)}`,
    );
    const inspector2Id = apply2Res.json.data.profile.id;

    // Admin approves Inspector 1 and Inspector 2
    const approve1 = await apiJson(baseUrl, `/admin/inspectors/${inspector1Id}/review`, {
      method: 'POST',
      token: admin.token,
      body: { decision: 'APPROVE' },
    });
    assert.equal(
      approve1.status,
      200,
      `Failed to approve inspector 1: ${JSON.stringify(approve1.json)}`,
    );

    const approve2 = await apiJson(baseUrl, `/admin/inspectors/${inspector2Id}/review`, {
      method: 'POST',
      token: admin.token,
      body: { decision: 'APPROVE' },
    });
    assert.equal(
      approve2.status,
      200,
      `Failed to approve inspector 2: ${JSON.stringify(approve2.json)}`,
    );

    // -------------------------------------------------------------------------
    // TEST 2: Start new inspection audit session (eligible outlet)
    // -------------------------------------------------------------------------
    console.log('Test 2: Starting a new inspection audit session...');
    const createRes = await apiJson(baseUrl, '/inspections', {
      method: 'POST',
      token: insp1User.token,
      body: {
        restaurantId: 'rest_flurys_park_st',
        outletId: 'out_flurys_main',
        assessmentType: 'INITIAL',
        checklistVersion: 'v1.0',
      },
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.json.data.inspection.status, 'DRAFT');
    assert.equal(createRes.json.data.inspection.inspectorId, inspector1Id);
    assert.equal(createRes.json.data.inspection.findings.length, 8);
    const inspectionId = createRes.json.data.inspection.id;
    console.log(`✓ Test 2 Passed: Created draft inspection audit ${inspectionId}.\n`);

    // -------------------------------------------------------------------------
    // TEST 3: Conflict of Interest Guard on Inspection Creation
    // -------------------------------------------------------------------------
    console.log('Test 3: Conflict of interest prevention on inspection creation...');
    const conflictCreateRes = await apiJson(baseUrl, '/inspections', {
      method: 'POST',
      token: insp1User.token,
      body: {
        restaurantId: 'rest_conflict_spot',
        outletId: 'out_conflict_spot_main',
        assessmentType: 'ROUTINE',
        checklistVersion: 'v1.0',
      },
    });
    assert.equal(conflictCreateRes.status, 403);
    assert.match(conflictCreateRes.json.error.message, /not eligible|conflict/i);
    console.log(
      '✓ Test 3 Passed: Conflicted inspection audit correctly blocked with 403 Forbidden.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 4: Offline Incremental Draft Save with clientDraftSavedAt
    // -------------------------------------------------------------------------
    console.log('Test 4: Incremental offline draft save...');
    const clientSavedTimestamp = new Date(Date.now() - 5000).toISOString();
    const updatedFindings = createRes.json.data.inspection.findings.map((f) => {
      if (f.itemId === 'HYG_01') {
        return { ...f, score: 8, severity: 'MINOR', comments: 'One food handler hairnet askew' };
      }
      return f;
    });

    const draftRes = await apiJson(baseUrl, `/inspections/${inspectionId}/draft`, {
      method: 'PATCH',
      token: insp1User.token,
      body: {
        findings: updatedFindings,
        clientDraftSavedAt: clientSavedTimestamp,
        notes: 'Intermediate offline draft saved at basement cold room',
      },
    });
    assert.equal(draftRes.status, 200);
    assert.equal(
      draftRes.json.data.inspection.findings.find((f) => f.itemId === 'HYG_01').severity,
      'MINOR',
    );
    assert.equal(
      draftRes.json.data.inspection.findings.find((f) => f.itemId === 'HYG_01').score,
      8,
    );
    assert(
      draftRes.json.data.inspection.clientDraftSavedAt,
      'clientDraftSavedAt must be persisted',
    );
    console.log('✓ Test 4 Passed: Offline draft saved successfully with client timestamp.\n');

    // -------------------------------------------------------------------------
    // TEST 5: Evidence upload with matching SHA-256 integrity hash verification
    // -------------------------------------------------------------------------
    console.log('Test 5: Evidence upload with SHA-256 integrity verification...');
    const testImageBuffer = Buffer.from('MOCK_JPEG_PHOTO_OF_CHILLER_THERMOMETER_READING_3_DEGREES');
    const expectedHash = computeSha256(testImageBuffer);

    const evidenceRes = await apiJson(baseUrl, `/inspections/${inspectionId}/evidence`, {
      method: 'POST',
      token: insp1User.token,
      body: {
        itemId: 'TEMP_01', // Chiller temp item
        evidenceType: 'PHOTO',
        sha256Hash: expectedHash,
        mimeType: 'image/jpeg',
        sizeBytes: testImageBuffer.length,
        capturedAt: new Date().toISOString(),
        capturedCoordinates: [88.3512, 22.5535],
        base64Data: testImageBuffer.toString('base64'),
        caption: 'Chiller calibrated digital display reading 3.2°C',
      },
    });
    assert.equal(evidenceRes.status, 201);
    assert.equal(evidenceRes.json.data.evidence.sha256Hash, expectedHash);
    assert.equal(evidenceRes.json.data.evidence.itemId, 'TEMP_01');
    const evidence1Id = evidenceRes.json.data.evidence.id;
    console.log(
      `✓ Test 5 Passed: Attached evidence ${evidence1Id} with verified SHA-256 ${expectedHash.slice(0, 16)}...\n`,
    );

    // -------------------------------------------------------------------------
    // TEST 6: Tamper-evident guard: Mismatched SHA-256 rejected with 422
    // -------------------------------------------------------------------------
    console.log('Test 6: Tamper-evident guard rejecting mismatched hash...');
    const tamperedPayload = Buffer.from('CORRUPTED_BINARY_DATA');
    const forgedHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    const tamperRes = await apiJson(baseUrl, `/inspections/${inspectionId}/evidence`, {
      method: 'POST',
      token: insp1User.token,
      body: {
        itemId: 'HYG_02',
        evidenceType: 'PHOTO',
        sha256Hash: forgedHash,
        mimeType: 'image/jpeg',
        sizeBytes: tamperedPayload.length,
        capturedAt: new Date().toISOString(),
        capturedCoordinates: [88.3512, 22.5535],
        base64Data: tamperedPayload.toString('base64'),
      },
    });
    assert.equal(tamperRes.status, 422);
    assert.match(tamperRes.json.error.message, /integrity verification failed/i);
    console.log('✓ Test 6 Passed: Tampered evidence rejected with 422 VALIDATION_ERROR.\n');

    // -------------------------------------------------------------------------
    // TEST 7: Privacy Boundary: Other inspector cannot access private evidence
    // -------------------------------------------------------------------------
    console.log('Test 7: Privacy boundary protecting private inspection evidence...');
    const crossAccessRes = await apiJson(
      baseUrl,
      `/inspections/${inspectionId}/evidence/${evidence1Id}`,
      {
        method: 'GET',
        token: insp2User.token, // Inspector 2 trying to read Inspector 1's evidence
      },
    );
    assert.equal(crossAccessRes.status, 403);
    assert.match(crossAccessRes.json.error.message, /access denied/i);

    // Privileged admin CAN access
    const adminAccessRes = await apiJson(
      baseUrl,
      `/inspections/${inspectionId}/evidence/${evidence1Id}`,
      {
        method: 'GET',
        token: admin.token,
      },
    );
    assert.equal(adminAccessRes.status, 200);
    assert.equal(adminAccessRes.json.data.evidence.id, evidence1Id);
    console.log(
      '✓ Test 7 Passed: Private evidence blocked from unauthorized inspectors (403) and accessible to admin.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 8: Submission Gate: Missing mandatory checklist evidence blocks submission
    // -------------------------------------------------------------------------
    console.log('Test 8: Submission Gate blocking when mandatory evidence is missing...');
    // Checklist items HYG_02 (Handwash) and PEST_01 (Pest Control) have evidenceRequired: true
    // Currently only TEMP_01 has evidence attached.
    const submitAttempt1 = await apiJson(baseUrl, `/inspections/${inspectionId}/submit`, {
      method: 'POST',
      token: insp1User.token,
      body: {
        managerName: 'Debabrata Mukherjee',
        managerDesignation: 'Executive Chef',
      },
    });
    assert.equal(submitAttempt1.status, 422);
    assert.match(submitAttempt1.json.error.message, /Missing mandatory evidence/i);
    console.log(
      '✓ Test 8 Passed: Submission blocked with 422 when mandatory evidence is missing.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 9: Submission Gate: CRITICAL / MAJOR violation without photographic evidence
    // -------------------------------------------------------------------------
    console.log(
      'Test 9: Submission Gate blocking CRITICAL finding without photographic evidence...',
    );
    // Provide evidence for HYG_02 and PEST_01 first
    const hyg2Buffer = Buffer.from('PHOTO_OF_HANDWASH_STATION_WITH_SOAP');
    const hyg2Hash = computeSha256(hyg2Buffer);
    await apiJson(baseUrl, `/inspections/${inspectionId}/evidence`, {
      method: 'POST',
      token: insp1User.token,
      body: {
        itemId: 'HYG_02',
        evidenceType: 'PHOTO',
        sha256Hash: hyg2Hash,
        mimeType: 'image/jpeg',
        sizeBytes: hyg2Buffer.length,
        capturedAt: new Date().toISOString(),
        capturedCoordinates: [88.3512, 22.5535],
        base64Data: hyg2Buffer.toString('base64'),
      },
    });

    const pestBuffer = Buffer.from('PHOTO_OF_PEST_TRAP_LOG');
    const pestHash = computeSha256(pestBuffer);
    await apiJson(baseUrl, `/inspections/${inspectionId}/evidence`, {
      method: 'POST',
      token: insp1User.token,
      body: {
        itemId: 'PEST_01',
        evidenceType: 'PHOTO',
        sha256Hash: pestHash,
        mimeType: 'image/jpeg',
        sizeBytes: pestBuffer.length,
        capturedAt: new Date().toISOString(),
        capturedCoordinates: [88.3512, 22.5535],
        base64Data: pestBuffer.toString('base64'),
      },
    });

    // Now mark TEMP_02 (Raw vs Ready separation) as CRITICAL violation, but without linking evidence
    const findingsWithCritical = createRes.json.data.inspection.findings.map((f) => {
      if (f.itemId === 'TEMP_02') {
        return {
          ...f,
          severity: 'CRITICAL',
          score: 0,
          comments: 'Raw poultry stored on top shelf above cooked dessert trays',
          evidenceIds: [], // NO evidence attached
        };
      }
      return f;
    });

    await apiJson(baseUrl, `/inspections/${inspectionId}/draft`, {
      method: 'PATCH',
      token: insp1User.token,
      body: { findings: findingsWithCritical },
    });

    const submitAttempt2 = await apiJson(baseUrl, `/inspections/${inspectionId}/submit`, {
      method: 'POST',
      token: insp1User.token,
      body: {
        managerName: 'Debabrata Mukherjee',
        managerDesignation: 'Executive Chef',
      },
    });
    assert.equal(submitAttempt2.status, 422);
    assert.match(submitAttempt2.json.error.message, /requires attached photographic evidence/i);
    console.log(
      '✓ Test 9 Passed: CRITICAL violation without photographic proof strictly blocks submission (422).\n',
    );

    // -------------------------------------------------------------------------
    // TEST 10: Successful Submission & Report Locking
    // -------------------------------------------------------------------------
    console.log('Test 10: Successful submission and report locking...');
    // Attach photographic proof for the CRITICAL violation on TEMP_02
    const critBuffer = Buffer.from('PHOTO_OF_RAW_POULTRY_CONTAMINATION_TEMP_02');
    const critHash = computeSha256(critBuffer);
    const critEvidenceRes = await apiJson(baseUrl, `/inspections/${inspectionId}/evidence`, {
      method: 'POST',
      token: insp1User.token,
      body: {
        itemId: 'TEMP_02',
        evidenceType: 'PHOTO',
        sha256Hash: critHash,
        mimeType: 'image/jpeg',
        sizeBytes: critBuffer.length,
        capturedAt: new Date().toISOString(),
        capturedCoordinates: [88.3512, 22.5535],
        base64Data: critBuffer.toString('base64'),
        caption: 'High resolution photograph of cross contamination hazard',
      },
    });
    assert.equal(critEvidenceRes.status, 201);

    // Now submit final audit with manager sign-off
    const finalSubmitRes = await apiJson(baseUrl, `/inspections/${inspectionId}/submit`, {
      method: 'POST',
      token: insp1User.token,
      body: {
        managerName: 'Debabrata Mukherjee',
        managerDesignation: 'Executive Chef',
        managerSignatureDataUrl: 'data:image/png;base64,MOCK_SIGNATURE_DATA',
        signedAt: new Date().toISOString(),
      },
    });
    assert.equal(finalSubmitRes.status, 200);
    assert.equal(finalSubmitRes.json.data.inspection.status, 'SUBMITTED');
    assert.equal(finalSubmitRes.json.data.inspection.hasCriticalViolation, true);
    assert.equal(finalSubmitRes.json.data.inspection.managerName, 'Debabrata Mukherjee');
    assert(
      finalSubmitRes.json.data.inspection.submittedAt,
      'submittedAt timestamp must be recorded',
    );

    // Verify report is locked: subsequent draft edits return 409 CONFLICT
    const lockedDraftAttempt = await apiJson(baseUrl, `/inspections/${inspectionId}/draft`, {
      method: 'PATCH',
      token: insp1User.token,
      body: { findings: [] },
    });
    assert.equal(lockedDraftAttempt.status, 409);
    assert.match(
      lockedDraftAttempt.json.error.message,
      /Cannot update draft for inspection in SUBMITTED status/i,
    );

    console.log(
      '✓ Test 10 Passed: Audit submitted successfully, timestamped, and locked against subsequent modifications.\n',
    );

    console.log('🎉 ALL 10 CHECKPOINT 22 VERIFICATION TESTS PASSED CLEANLY!\n');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

runVerification().catch((err) => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
