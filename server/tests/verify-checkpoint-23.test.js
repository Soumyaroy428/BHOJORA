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

const TEST_PASSWORD = 'Bhojora#Inspector2026';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4023',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp23_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp23!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp23!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp23!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp23!',
    },
    { serviceName: 'bhojora-test-cp23', serviceVersion: '0.1.0' },
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
  console.log('🚀 Starting Checkpoint 23 Automated Verification Test Suite...');
  console.log(
    'Testing: Review & Scoring, Anti-Self-Review, Score Policy V1, Critical Override & Appeals\n',
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
    // SETUP ACTORS
    // -------------------------------------------------------------------------
    console.log(
      'Setting up test actors (Inspectors, Independent Reviewer, Restaurant Partner, Customer)...',
    );

    // 1. Council Trust Admin
    const admin = await createAdminUser(
      baseUrl,
      identityStore,
      'admin.council@bhojora.internal',
      '+919830000001',
      'Council Admin Sen',
      'TRUST_ADMIN',
    );

    // 2. Independent Reviewer
    const reviewer = await createAdminUser(
      baseUrl,
      identityStore,
      'reviewer.trust@bhojora.internal',
      '+919830009999',
      'Senior Reviewer Dr. Banerjee',
      'INSPECTION_REVIEWER',
    );

    // 3. Inspector 1 (Dr. Anirban Mukherjee)
    const insp1User = await registerCustomer(
      baseUrl,
      'anirban.inspect@bhojora.internal',
      '+919830111111',
      'Dr. Anirban Mukherjee',
    );

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
      },
    });
    assert.equal(apply1Res.status, 201);
    const inspector1Id = apply1Res.json.data.profile.id;

    // Admin approves Inspector 1
    const approveInspRes = await apiJson(baseUrl, `/admin/inspectors/${inspector1Id}/review`, {
      method: 'POST',
      token: admin.token,
      body: { decision: 'APPROVE' },
    });
    assert.equal(
      approveInspRes.status,
      200,
      `Failed to approve inspector 1: ${JSON.stringify(approveInspRes.json)}`,
    );

    // 4. Customer (Unprivileged)
    const regularCustomer = await registerCustomer(
      baseUrl,
      'subho.foodie@bhojora.internal',
      '+919830333333',
      'Subhojit Roy',
    );

    // 4. Restaurant Partner (for appeals)
    const restaurantOwner = await registerCustomer(
      baseUrl,
      'owner.arsalan@bhojora.internal',
      '+919830444444',
      'Arsalan Management',
    );

    console.log('✓ Actors initialized successfully.\n');

    // Helper: Upload evidence buffer
    async function uploadEvidence(token, inspectionId, itemId, textContent) {
      const buf = Buffer.from(textContent);
      const hash = computeSha256(buf);
      const res = await apiJson(baseUrl, `/inspections/${inspectionId}/evidence`, {
        method: 'POST',
        token,
        body: {
          itemId,
          evidenceType: 'PHOTO',
          sha256Hash: hash,
          mimeType: 'image/jpeg',
          sizeBytes: buf.length,
          capturedAt: new Date().toISOString(),
          capturedCoordinates: [88.3512, 22.5535],
          base64Data: buf.toString('base64'),
          caption: `Photo proof for ${itemId}`,
        },
      });
      assert.equal(res.status, 201);
      return res.json.data.evidence.id;
    }

    // -------------------------------------------------------------------------
    // TEST 1: Reviewer Queue RBAC Guard
    // -------------------------------------------------------------------------
    console.log('Test 1: Reviewer Queue RBAC Access Guard...');
    // Regular customer cannot access queue
    const custQueueRes = await apiJson(baseUrl, '/inspections/review-queue', {
      method: 'GET',
      token: regularCustomer.token,
    });
    assert.equal(custQueueRes.status, 403);
    assert.match(custQueueRes.json.error.message, /Access denied/i);

    // Inspector cannot access queue without reviewer/admin role
    const inspQueueRes = await apiJson(baseUrl, '/inspections/review-queue', {
      method: 'GET',
      token: insp1User.token,
    });
    assert.equal(inspQueueRes.status, 403);

    // Privileged reviewer can access queue
    const revQueueRes = await apiJson(baseUrl, '/inspections/review-queue', {
      method: 'GET',
      token: reviewer.token,
    });
    assert.equal(revQueueRes.status, 200);
    assert(Array.isArray(revQueueRes.json.data.queue));
    console.log(
      '✓ Test 1 Passed: Reviewer queue strictly guarded by RBAC permissions (403 for unauthorized).\n',
    );

    // -------------------------------------------------------------------------
    // TEST 2: Inspection Creation, Submission & Review Queue Discovery
    // -------------------------------------------------------------------------
    console.log('Test 2: Inspection creation, evidence attachment & queue discovery...');
    const createRes1 = await apiJson(baseUrl, '/inspections', {
      method: 'POST',
      token: insp1User.token,
      body: {
        restaurantId: 'rest_arsalan_01',
        outletId: 'out_arsalan_park_circus',
        assessmentType: 'ROUTINE',
      },
    });
    assert.equal(createRes1.status, 201);
    const insp1Id = createRes1.json.data.inspection.id;

    // Attach required mandatory evidence (HYG_02, TEMP_01, and PEST_01)
    await uploadEvidence(
      insp1User.token,
      insp1Id,
      'HYG_02',
      'CLEAN_HANDWASH_STATION_WITH_DISPENSER',
    );
    await uploadEvidence(
      insp1User.token,
      insp1Id,
      'TEMP_01',
      'DIGITAL_CHILLER_READING_3_POINT_2_C',
    );
    await uploadEvidence(
      insp1User.token,
      insp1Id,
      'PEST_01',
      'PEST_CONTROL_CONTRACT_CERTIFICATE_VALID',
    );

    // Update draft findings with 92 raw points (Passable, Grade A_PLUS)
    const findingsHighGrade = createRes1.json.data.inspection.findings.map((f) => ({
      ...f,
      score: f.maxScore > 10 ? f.maxScore - 2 : f.maxScore, // Minor deduction: 92/100
      severity: 'MINOR',
    }));

    await apiJson(baseUrl, `/inspections/${insp1Id}/draft`, {
      method: 'PATCH',
      token: insp1User.token,
      body: { findings: findingsHighGrade },
    });

    // Submit report
    const submitRes1 = await apiJson(baseUrl, `/inspections/${insp1Id}/submit`, {
      method: 'POST',
      token: insp1User.token,
      body: { managerName: 'Md. Farooq', managerDesignation: 'General Manager' },
    });
    assert.equal(submitRes1.status, 200, `Submit failed: ${JSON.stringify(submitRes1.json)}`);
    assert.equal(submitRes1.json.data.inspection.status, 'SUBMITTED');

    // Verify inspection appears in Reviewer Queue
    const queueAfterSubmit = await apiJson(baseUrl, '/inspections/review-queue', {
      method: 'GET',
      token: reviewer.token,
    });
    assert.equal(queueAfterSubmit.status, 200);
    const inQueue = queueAfterSubmit.json.data.queue.find((i) => i.id === insp1Id);
    assert(inQueue, 'Submitted inspection must be present in reviewer queue');
    console.log(
      `✓ Test 2 Passed: Inspection ${insp1Id} submitted and visible in reviewer queue.\n`,
    );

    // -------------------------------------------------------------------------
    // TEST 3: Anti-Self-Review Guard (ADR-005)
    // -------------------------------------------------------------------------
    console.log('Test 3: Anti-Self-Review Guard (ADR-005 separation of duties)...');
    // Temporarily grant INSPECTION_REVIEWER role to Inspector 1 to test anti-self-review
    await identityStore.updateUser(
      insp1User.userId,
      { roles: ['INSPECTOR', 'INSPECTION_REVIEWER'] },
      new Date(),
    );
    const insp1Login = await apiJson(baseUrl, '/auth/login', {
      method: 'POST',
      body: { identifier: 'anirban.inspect@bhojora.internal', password: TEST_PASSWORD },
    });
    const dualRoleToken = insp1Login.json.data.tokens.accessToken;

    const selfReviewAttempt = await apiJson(baseUrl, `/inspections/${insp1Id}/review`, {
      method: 'POST',
      token: dualRoleToken,
      body: {
        decision: 'APPROVE',
        notes: 'Self-approval attempt by authoring inspector',
        scorePolicyVersion: 'SCORE_POLICY_V1',
      },
    });
    assert.equal(selfReviewAttempt.status, 403);
    assert.equal(selfReviewAttempt.json.error.code, 'SELF_REVIEW_PROHIBITED');
    assert.match(
      selfReviewAttempt.json.error.message,
      /cannot review or approve their own inspection/i,
    );
    console.log('✓ Test 3 Passed: Self-review prohibited with 403 SELF_REVIEW_PROHIBITED.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Independent Review & Approval with SCORE_POLICY_V1
    // -------------------------------------------------------------------------
    console.log('Test 4: Independent Review & Approval (SCORE_POLICY_V1)...');
    const approveRes = await apiJson(baseUrl, `/inspections/${insp1Id}/review`, {
      method: 'POST',
      token: reviewer.token,
      body: {
        decision: 'APPROVE',
        notes: 'Comprehensive documentation verified against FSSAI hygiene schedule.',
        scorePolicyVersion: 'SCORE_POLICY_V1',
      },
    });
    assert.equal(approveRes.status, 200);
    const approvedInspection = approveRes.json.data.inspection;
    assert.equal(approvedInspection.status, 'APPROVED');
    assert.equal(approvedInspection.reviewDecision, 'APPROVE');
    assert.equal(approvedInspection.reviewedByUserId, reviewer.userId);
    assert(approvedInspection.reviewedAt);

    // Verify Score Summary
    assert(approvedInspection.scoreSummary, 'scoreSummary must be present on approved inspection');
    assert.equal(approvedInspection.scoreSummary.scorePolicyVersion, 'SCORE_POLICY_V1');
    assert.equal(approvedInspection.scoreSummary.hasCriticalViolation, false);
    assert.equal(approvedInspection.scoreSummary.criticalOverrideApplied, false);
    assert.equal(approvedInspection.scoreSummary.outcome, 'PASS');
    assert.equal(approvedInspection.scoreSummary.grade, 'A_PLUS');
    assert(approvedInspection.scoreSummary.finalScorePercent >= 85);
    console.log(
      `✓ Test 4 Passed: Inspection approved with Policy V1 (Grade: ${approvedInspection.scoreSummary.grade}, Score: ${approvedInspection.scoreSummary.finalScorePercent}%).\n`,
    );

    // -------------------------------------------------------------------------
    // TEST 5: Approved Report Immutability Guard
    // -------------------------------------------------------------------------
    console.log('Test 5: Approved Report Immutability Guard (No edits/evidence/re-reviews)...');
    // Attempt draft update on approved report
    const editDraftRes = await apiJson(baseUrl, `/inspections/${insp1Id}/draft`, {
      method: 'PATCH',
      token: insp1User.token,
      body: { findings: [] },
    });
    assert.equal(editDraftRes.status, 409);
    assert.match(editDraftRes.json.error.message, /Approved inspection reports are immutable/i);

    // Attempt evidence upload on approved report
    const addEvidenceRes = await apiJson(baseUrl, `/inspections/${insp1Id}/evidence`, {
      method: 'POST',
      token: insp1User.token,
      body: {
        itemId: 'HYG_01',
        evidenceType: 'PHOTO',
        sha256Hash: computeSha256(Buffer.from('LATE_EVIDENCE')),
        mimeType: 'image/jpeg',
        sizeBytes: 13,
        capturedAt: new Date().toISOString(),
        capturedCoordinates: [88.3512, 22.5535],
      },
    });
    assert.equal(addEvidenceRes.status, 409);
    assert.match(addEvidenceRes.json.error.message, /Approved inspection reports are immutable/i);

    // Attempt re-review on approved report
    const reReviewRes = await apiJson(baseUrl, `/inspections/${insp1Id}/review`, {
      method: 'POST',
      token: reviewer.token,
      body: { decision: 'REJECT', notes: 'Attempting to change decision' },
    });
    assert.equal(reReviewRes.status, 409);
    assert.match(reReviewRes.json.error.message, /Approved inspection reports are immutable/i);
    console.log(
      '✓ Test 5 Passed: Immutability strictly enforced with 409 CONFLICT on all modification attempts.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 6: Critical Finding Score Override
    // -------------------------------------------------------------------------
    console.log('Test 6: Critical Finding Score Override Gate...');
    const createRes2 = await apiJson(baseUrl, '/inspections', {
      method: 'POST',
      token: insp1User.token,
      body: {
        restaurantId: 'rest_bhoj_02',
        outletId: 'out_bhoj_central',
        assessmentType: 'COMPLAINT_TRIGGERED',
      },
    });
    const insp2Id = createRes2.json.data.inspection.id;

    // Attach required evidence for HYG_02, TEMP_01, PEST_01, and the critical finding
    await uploadEvidence(insp1User.token, insp2Id, 'HYG_02', 'HANDWASH_PHOTO');
    await uploadEvidence(insp1User.token, insp2Id, 'TEMP_01', 'CHILLER_PHOTO');
    await uploadEvidence(insp1User.token, insp2Id, 'PEST_01', 'PEST_PHOTO');
    const critEvidenceId = await uploadEvidence(
      insp1User.token,
      insp2Id,
      'TEMP_02',
      'PHOTO_OF_CROSS_CONTAMINATION',
    );

    // High raw score (90/100) BUT with 1 CRITICAL finding on TEMP_02
    const findingsWithCritical = createRes2.json.data.inspection.findings.map((f) => {
      if (f.itemId === 'TEMP_02') {
        return {
          ...f,
          severity: 'CRITICAL',
          score: 0,
          comments: 'Raw meat stored unsealed directly over cooked dessert items',
          evidenceIds: [critEvidenceId],
        };
      }
      return {
        ...f,
        score: f.maxScore,
        severity: 'MINOR',
      };
    });

    await apiJson(baseUrl, `/inspections/${insp2Id}/draft`, {
      method: 'PATCH',
      token: insp1User.token,
      body: { findings: findingsWithCritical },
    });

    await apiJson(baseUrl, `/inspections/${insp2Id}/submit`, {
      method: 'POST',
      token: insp1User.token,
      body: { managerName: 'Amitava Ghosh', managerDesignation: 'Head Chef' },
    });

    // Reviewer approves the assessment report
    const approveCritRes = await apiJson(baseUrl, `/inspections/${insp2Id}/review`, {
      method: 'POST',
      token: reviewer.token,
      body: {
        decision: 'APPROVE',
        notes: 'Critical hazard documented with photographic evidence. Score override enforced.',
        scorePolicyVersion: 'SCORE_POLICY_V1',
      },
    });
    assert.equal(approveCritRes.status, 200);
    const criticalInspection = approveCritRes.json.data.inspection;
    assert.equal(criticalInspection.scoreSummary.hasCriticalViolation, true);
    assert.equal(criticalInspection.scoreSummary.criticalOverrideApplied, true);
    assert.equal(
      criticalInspection.scoreSummary.finalScorePercent,
      0,
      'Final score must be overridden to 0',
    );
    assert.equal(
      criticalInspection.scoreSummary.outcome,
      'FAIL',
      'Outcome must be FAIL despite high raw points',
    );
    assert.equal(
      criticalInspection.scoreSummary.grade,
      'SUSPENDED',
      'Grade must be SUSPENDED due to critical hazard',
    );
    console.log(
      `✓ Test 6 Passed: Critical finding overrides 90% raw points to 0% Final Score, Outcome: ${criticalInspection.scoreSummary.outcome}, Grade: ${criticalInspection.scoreSummary.grade}.\n`,
    );

    // -------------------------------------------------------------------------
    // TEST 7: Return for Clarification & Inspector Resubmission
    // -------------------------------------------------------------------------
    console.log('Test 7: Return for Clarification lifecycle...');
    const createRes3 = await apiJson(baseUrl, '/inspections', {
      method: 'POST',
      token: insp1User.token,
      body: {
        restaurantId: 'rest_bhoj_03',
        outletId: 'out_bhoj_south',
        assessmentType: 'ROUTINE',
      },
    });
    const insp3Id = createRes3.json.data.inspection.id;

    await uploadEvidence(insp1User.token, insp3Id, 'HYG_02', 'HANDWASH_DOC');
    await uploadEvidence(insp1User.token, insp3Id, 'TEMP_01', 'CHILLER_DOC');
    await uploadEvidence(insp1User.token, insp3Id, 'PEST_01', 'PEST_DOC');

    await apiJson(baseUrl, `/inspections/${insp3Id}/submit`, {
      method: 'POST',
      token: insp1User.token,
      body: { managerName: 'Debu Pal', managerDesignation: 'Shift Incharge' },
    });

    // Reviewer returns for clarification
    const returnRes = await apiJson(baseUrl, `/inspections/${insp3Id}/review`, {
      method: 'POST',
      token: reviewer.token,
      body: {
        decision: 'RETURN_FOR_CLARIFICATION',
        notes:
          'Please update chiller temperature log timestamps and clarify kitchen deep clean schedule.',
      },
    });
    assert.equal(returnRes.status, 200);
    assert.equal(returnRes.json.data.inspection.status, 'RETURNED');
    assert.equal(returnRes.json.data.inspection.reviewDecision, 'RETURN_FOR_CLARIFICATION');

    // Inspector can modify draft while in RETURNED status
    const updateClarificationRes = await apiJson(baseUrl, `/inspections/${insp3Id}/draft`, {
      method: 'PATCH',
      token: insp1User.token,
      body: {
        findings: createRes3.json.data.inspection.findings,
        notes:
          'Clarified: Chiller log taken at 11:30 AM during active morning prep. Kitchen deep cleaned daily.',
      },
    });
    assert.equal(
      updateClarificationRes.status,
      200,
      `Update draft failed: ${JSON.stringify(updateClarificationRes.json)}`,
    );

    // Inspector resubmits
    const resubmitRes = await apiJson(baseUrl, `/inspections/${insp3Id}/submit`, {
      method: 'POST',
      token: insp1User.token,
      body: { managerName: 'Debu Pal', managerDesignation: 'Shift Incharge' },
    });
    assert.equal(resubmitRes.status, 200);
    assert.equal(resubmitRes.json.data.inspection.status, 'SUBMITTED');
    console.log(
      '✓ Test 7 Passed: Report returned for clarification, modified by inspector, and resubmitted.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 8: Reviewer Rejection
    // -------------------------------------------------------------------------
    console.log('Test 8: Reviewer Rejection of non-compliant audit...');
    const rejectRes = await apiJson(baseUrl, `/inspections/${insp3Id}/review`, {
      method: 'POST',
      token: reviewer.token,
      body: {
        decision: 'REJECT',
        notes: 'Debrief signature was not witnessed by verified on-duty outlet in-charge.',
      },
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.json.data.inspection.status, 'REJECTED');
    assert.equal(rejectRes.json.data.inspection.reviewDecision, 'REJECT');
    console.log('✓ Test 8 Passed: Inspection rejected with formal audit rationale.\n');

    // -------------------------------------------------------------------------
    // TEST 9: Dispute & Appeal Lodging
    // -------------------------------------------------------------------------
    console.log('Test 9: Dispute & Appeal Lodging by Restaurant Partner...');
    const appealRes = await apiJson(baseUrl, `/inspections/${insp3Id}/appeal`, {
      method: 'POST',
      token: restaurantOwner.token,
      body: {
        contestedItemIds: ['HYG_01', 'TEMP_01'],
        reason:
          'Shift Incharge Debu Pal is registered on the FSSAI license display. Signature was fully authorized.',
        evidenceUrls: ['https://cdn.bhojora.in/evidence/fssai_roster_valid.pdf'],
      },
    });
    assert.equal(appealRes.status, 201);
    const appealedInspection = appealRes.json.data.inspection;
    assert.equal(appealedInspection.status, 'APPEALED');
    assert(appealedInspection.appeal);
    assert.equal(appealedInspection.appeal.status, 'SUBMITTED');
    assert.equal(
      appealedInspection.appeal.reason,
      'Shift Incharge Debu Pal is registered on the FSSAI license display. Signature was fully authorized.',
    );

    // Duplicate appeal attempt returns 409 CONFLICT
    const dupAppealRes = await apiJson(baseUrl, `/inspections/${insp3Id}/appeal`, {
      method: 'POST',
      token: restaurantOwner.token,
      body: { contestedItemIds: ['HYG_01'], reason: 'Duplicate filing' },
    });
    assert.equal(dupAppealRes.status, 409);
    assert.match(dupAppealRes.json.error.message, /appeal has already been submitted/i);
    console.log(
      '✓ Test 9 Passed: Appeal lodged successfully; duplicate appeal blocked with 409.\n',
    );

    // -------------------------------------------------------------------------
    // TEST 10: Appeal Resolution
    // -------------------------------------------------------------------------
    console.log('Test 10: Appeal Resolution by Privileged Governance Council...');
    // Unauthorized user cannot resolve appeal
    const custResolveRes = await apiJson(baseUrl, `/inspections/${insp3Id}/appeal/resolve`, {
      method: 'POST',
      token: regularCustomer.token,
      body: { resolution: 'UPHELD', notes: 'Attempted resolution' },
    });
    assert.equal(custResolveRes.status, 403);

    // Council orders re-inspection
    const councilAdmin = await createAdminUser(
      baseUrl,
      identityStore,
      'chair.council@bhojora.internal',
      '+919830888888',
      'Council Chair Sen',
      'TRUST_ADMIN',
    );

    const resolveRes = await apiJson(baseUrl, `/inspections/${insp3Id}/appeal/resolve`, {
      method: 'POST',
      token: councilAdmin.token,
      body: {
        resolution: 'RE_INSPECTION_ORDERED',
        notes:
          'License authority verified. Re-inspection ordered under secondary senior auditor supervision.',
      },
    });
    assert.equal(resolveRes.status, 200);
    const resolvedInspection = resolveRes.json.data.inspection;
    assert.equal(
      resolvedInspection.status,
      'SCHEDULED',
      'Re-inspection ordered must reset status to SCHEDULED',
    );
    assert.equal(resolvedInspection.appeal.status, 'RE_INSPECTION_ORDERED');
    assert.equal(resolvedInspection.appeal.resolvedByUserId, councilAdmin.userId);
    assert(resolvedInspection.appeal.resolvedAt);
    console.log(
      '✓ Test 10 Passed: Appeal resolved with RE_INSPECTION_ORDERED and reset to SCHEDULED.\n',
    );

    console.log('================================================================');
    console.log('🎉 ALL 10 CHECKPOINT 23 VERIFICATION TESTS PASSED SUCCESSFULLY!');
    console.log('================================================================');
  } finally {
    server.close();
  }
}

runVerification().catch((err) => {
  console.error('❌ Checkpoint 23 Verification failed:', err);
  process.exit(1);
});
