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
const { InMemoryAiStore } = require('../dist/modules/ai/ai.store.js');
const { DeterministicAiAdapter, FallbackAiAdapter } = require('../dist/modules/ai/ai.adapter.js');
const { AiService } = require('../dist/modules/ai/ai.service.js');

const TEST_PASSWORD = 'TestPassword123!Safe';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4032',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp32_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp32!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp32!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp32!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp32!',
    },
    { serviceName: 'bhojora-test-cp32', serviceVersion: '0.1.0' },
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
  const data = await response.json();
  return { status: response.status, ok: response.ok, data };
}

async function registerAndLogin(baseUrl, identityStore, phone, role, rbacStore) {
  const email = `${role.toLowerCase()}_${Date.now()}@test.bhojora.in`;
  const regRes = await apiJson(baseUrl, '/api/v1/auth/register', {
    method: 'POST',
    body: {
      phone,
      name: `User ${role}`,
      email,
      password: TEST_PASSWORD,
      acceptTerms: true,
    },
  });
  assert.equal(regRes.status, 201, `Failed to register ${role}: ${JSON.stringify(regRes.data)}`);

  const userId = regRes.data.data.user.id;

  if (role && role !== 'CUSTOMER') {
    await identityStore.updateUser(userId, { roles: [role] }, new Date());
  }

  // Assign role in RBAC
  await rbacStore.upsertMembership({
    userId,
    tenantType: 'PLATFORM',
    tenantId: 'platform_global',
    roles: [role],
    assignedByUserId: 'system_bootstrap',
    assignedAt: new Date(),
  });

  const loginRes = await apiJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: {
      identifier: email,
      password: TEST_PASSWORD,
    },
  });
  assert.equal(loginRes.status, 200, `Login failed for ${role}`);

  const token = loginRes.data.data.tokens.accessToken;
  return { userId, token, role };
}

async function runTests() {
  console.log('--- Starting Checkpoint 32 AI Assistance & Human-in-the-Loop Tests ---');

  const config = createTestConfig();
  const logger = createLogger({ level: 'error', service: 'test-cp32', environment: 'test' });
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const rbacStore = new InMemoryRbacStore();
  const aiStore = new InMemoryAiStore();
  const aiAdapter = new DeterministicAiAdapter();
  const aiService = new AiService(aiStore, aiAdapter);

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    aiStore,
    aiAdapter,
    aiService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Setup users
    const adminUser = await registerAndLogin(
      baseUrl,
      identityStore,
      '+919830000032',
      'SUPER_ADMIN',
      rbacStore,
    );
    const inspectorUser = await registerAndLogin(
      baseUrl,
      identityStore,
      '+919830000132',
      'INSPECTOR',
      rbacStore,
    );
    const customerUser = await registerAndLogin(
      baseUrl,
      identityStore,
      '+919830000232',
      'CUSTOMER',
      rbacStore,
    );

    // 1. Story F13.1: Image Risk Flagging generates properly labeled proposal
    console.log('Test 1: Vision AI image risk tagging produces labeled assistive proposal');
    const imageFlagRes = await apiJson(baseUrl, '/api/v1/ai/generate', {
      method: 'POST',
      token: inspectorUser.token,
      body: {
        taskType: 'IMAGE_RISK_FLAG',
        targetEntity: 'inspection',
        targetId: 'insp_audit_kol_101',
        inputPayload: {
          photoId: 'photo_prep_counter_04',
          label: 'unsealed open food container',
          photoUrl: 'https://bhojora.storage/photos/kitchen_prep_04.jpg',
        },
      },
    });

    assert.equal(imageFlagRes.status, 201);
    const imageProposal = imageFlagRes.data.data;
    assert.equal(imageProposal.taskType, 'IMAGE_RISK_FLAG');
    assert.equal(imageProposal.status, 'PENDING_HUMAN_REVIEW');
    assert.equal(imageProposal.modelInfo.modelName, 'gemini-1.5-flash');
    assert.ok(imageProposal.modelInfo.promptHash.length >= 8);
    assert.equal(imageProposal.confidenceScore, 0.82);
    assert.equal(
      imageProposal.suggestedOutput.detectedRisks[0].advisoryNote,
      'Possible unlabelled open food container detected (Confidence: 82%)',
    );
    assert.equal(imageProposal.suggestedOutput.humanReviewRequired, true);

    // 2. Acceptance Criteria: Initial status is strictly PENDING_HUMAN_REVIEW
    console.log(
      'Test 2: Model output is strictly pending human review, never automatically approved',
    );
    const getProposalRes = await apiJson(baseUrl, `/api/v1/ai/proposals/${imageProposal.id}`, {
      token: adminUser.token,
    });
    assert.equal(getProposalRes.status, 200);
    assert.equal(getProposalRes.data.data.status, 'PENDING_HUMAN_REVIEW');
    assert.equal(getProposalRes.data.data.humanReview, undefined);

    // 3. Human Approval Workflow: Reviewer accepts finding with audit trail
    console.log('Test 3: Human reviewer accepts AI finding with audit trail');
    const reviewApproveRes = await apiJson(
      baseUrl,
      `/api/v1/ai/proposals/${imageProposal.id}/review`,
      {
        method: 'POST',
        token: inspectorUser.token,
        body: {
          decision: 'APPROVED',
          feedback:
            'Verified during on-site kitchen inspection. Container lacked mandatory date stamp.',
        },
      },
    );
    assert.equal(reviewApproveRes.status, 200);
    assert.equal(reviewApproveRes.data.data.status, 'APPROVED');
    assert.equal(reviewApproveRes.data.data.humanReview.reviewerId, inspectorUser.userId);
    assert.equal(reviewApproveRes.data.data.humanReview.decision, 'APPROVED');
    assert.ok(reviewApproveRes.data.data.humanReview.reviewedAt);

    // 4. Re-review Prevention: Cannot alter proposal after decision
    console.log('Test 4: Cannot re-review already evaluated proposal');
    const reReviewRes = await apiJson(baseUrl, `/api/v1/ai/proposals/${imageProposal.id}/review`, {
      method: 'POST',
      token: adminUser.token,
      body: { decision: 'REJECTED' },
    });
    assert.equal(reReviewRes.status, 400);

    // 5. Human Rejection Workflow: Dismiss as false positive
    console.log('Test 5: Human reviewer dismisses AI finding as false positive');
    const falsePositiveGenRes = await apiJson(baseUrl, '/api/v1/ai/generate', {
      method: 'POST',
      token: inspectorUser.token,
      body: {
        taskType: 'IMAGE_RISK_FLAG',
        targetEntity: 'inspection',
        targetId: 'insp_audit_kol_102',
        inputPayload: {
          photoId: 'photo_prep_counter_09',
          label: 'open container false alarm',
          simulateRisk: true,
        },
      },
    });
    assert.equal(falsePositiveGenRes.status, 201);
    const fpProposalId = falsePositiveGenRes.data.data.id;

    const dismissRes = await apiJson(baseUrl, `/api/v1/ai/proposals/${fpProposalId}/review`, {
      method: 'POST',
      token: inspectorUser.token,
      body: {
        decision: 'REJECTED',
        feedback:
          'Dismissed as false positive: container was actively being prepped by chef wearing complete PPE.',
      },
    });
    assert.equal(dismissRes.status, 200);
    assert.equal(dismissRes.data.data.status, 'REJECTED');
    assert.equal(dismissRes.data.data.humanReview.decision, 'REJECTED');

    // 6. Complaint Classification with Critical Health Risk
    console.log('Test 6: Complaint classification accurately tags critical food poisoning risk');
    const complaintGenRes = await apiJson(baseUrl, '/api/v1/ai/generate', {
      method: 'POST',
      token: adminUser.token,
      body: {
        taskType: 'COMPLAINT_CLASSIFICATION',
        targetEntity: 'complaint',
        targetId: 'cmp_critical_991',
        inputPayload: {
          complaintText:
            'Customer developed severe vomiting and stomach cramps after eating biryani, had to visit hospital.',
        },
      },
    });
    assert.equal(complaintGenRes.status, 201);
    const complaintOutput = complaintGenRes.data.data.suggestedOutput;
    assert.equal(complaintOutput.severity, 'CRITICAL');
    assert.equal(complaintOutput.category, 'FOOD_SAFETY');
    assert.equal(complaintOutput.isHygieneRisk, true);
    assert.ok(complaintOutput.confidence >= 0.9);

    // 7. Audit Report Summarization
    console.log(
      'Test 7: Inspection report summarization highlights non-conformance without altering score',
    );
    const reportGenRes = await apiJson(baseUrl, '/api/v1/ai/generate', {
      method: 'POST',
      token: adminUser.token,
      body: {
        taskType: 'REPORT_SUMMARY',
        targetEntity: 'inspection',
        targetId: 'insp_summary_202',
        inputPayload: {
          violations: ['Cold storage temperature at 9.5C', 'Grease buildup behind fryers'],
        },
      },
    });
    assert.equal(reportGenRes.status, 201);
    const reportOutput = reportGenRes.data.data.suggestedOutput;
    assert.equal(reportOutput.criticalIssues.length, 2);
    assert.ok(reportOutput.executiveSummary.includes('Audit identified 2 non-conformance'));
    assert.ok(reportOutput.suggestedActionItems.length > 0);

    // 8. Demand Forecasting
    console.log('Test 8: Demand forecasting generates operational preparation recommendations');
    const demandGenRes = await apiJson(baseUrl, '/api/v1/ai/generate', {
      method: 'POST',
      token: adminUser.token,
      body: {
        taskType: 'DEMAND_FORECAST',
        targetEntity: 'outlet',
        targetId: 'outlet_kol_01',
        inputPayload: {
          zone: 'Park Circus',
          isFestival: true,
        },
      },
    });
    assert.equal(demandGenRes.status, 201);
    const demandOutput = demandGenRes.data.data.suggestedOutput;
    assert.equal(demandOutput.projectedOrderVolume, 420);
    assert.ok(demandOutput.prepRecommendations.length >= 2);

    // 9. Evaluation Metrics Aggregation
    console.log(
      'Test 9: Evaluation metrics endpoint aggregates approval rates, confidence, and task breakdown',
    );
    const metricsRes = await apiJson(baseUrl, '/api/v1/ai/metrics', {
      token: adminUser.token,
    });
    assert.equal(metricsRes.status, 200);
    const metrics = metricsRes.data.data;
    assert.ok(metrics.totalProposals >= 5);
    assert.equal(metrics.approvedCount, 1);
    assert.equal(metrics.rejectedCount, 1);
    assert.equal(metrics.approvalRatePercentage, 50); // 1 approved / (1 approved + 1 rejected) * 100
    assert.ok(metrics.averageConfidence > 0);
    assert.ok(metrics.taskBreakdown.IMAGE_RISK_FLAG.count >= 2);

    // 10. Fallback Resilience
    console.log('Test 10: Fallback adapter engages local heuristics when primary provider fails');
    const failingPrimaryAdapter = {
      async generate() {
        throw new Error('Upstream AI Gateway Connection Timeout (504)');
      },
    };
    const resilientAdapter = new FallbackAiAdapter(
      failingPrimaryAdapter,
      new DeterministicAiAdapter(),
    );
    const fallbackResult = await resilientAdapter.generate('RECOMMENDATION_BASELINE', {
      preferredCuisine: 'Bengali',
      maxBudgetPaise: 40000,
    });

    assert.equal(fallbackResult.modelInfo.provider, 'local-resilience-fallback');
    assert.ok(fallbackResult.explainabilityNotes[0].includes('[FALLBACK_ACTIVATED]'));
    assert.ok(fallbackResult.output.dishes.length > 0);

    // Non-reviewer unauthorized check
    console.log('Test 11: Non-reviewer roles cannot execute proposal reviews');
    const unauthReviewRes = await apiJson(
      baseUrl,
      `/api/v1/ai/proposals/${complaintGenRes.data.data.id}/review`,
      {
        method: 'POST',
        token: customerUser.token,
        body: { decision: 'APPROVED' },
      },
    );
    assert.equal(unauthReviewRes.status, 403);

    console.log('--- All 11 Checkpoint 32 Verification Tests Passed Successfully! ---');
  } finally {
    server.close();
  }
}

runTests().catch((err) => {
  console.error('Checkpoint 32 Verification Failed:', err);
  process.exit(1);
});
