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
      PORT: '4026',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp26_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp26!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp26!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp26!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp26!',
    },
    { serviceName: 'bhojora-test-cp26', serviceVersion: '0.1.0' },
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
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: response.status, body: json, headers: response.headers };
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
  assert.equal(res.status, 201, `Failed registering ${email}: ${JSON.stringify(res.body)}`);
  return {
    userId: res.body.data.user.id,
    token: res.body.data.tokens.accessToken,
    name,
  };
}

async function createRoleUser(baseUrl, identityStore, email, phone, name, role) {
  const reg = await registerCustomer(baseUrl, email, phone, name);
  await identityStore.updateUser(reg.userId, { roles: [role] }, new Date());
  const loginRes = await apiJson(baseUrl, '/api/v1/auth/login', {
    method: 'POST',
    body: { identifier: email, password: TEST_PASSWORD },
  });
  assert.equal(loginRes.status, 200);
  return {
    userId: reg.userId,
    token: loginRes.body.data.tokens.accessToken,
    name,
  };
}

async function main() {
  console.log('=== CHECKPOINT 26: SUPPORT OPERATIONS, SLA, ESCALATION & CASE HISTORY ===\n');

  let simulatedNow = new Date('2026-11-13T10:00:00.000Z');
  const clock = {
    now: () => simulatedNow,
  };

  const config = createTestConfig();
  const logger = createLogger(config);
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const rbacStore = new InMemoryRbacStore();
  const restaurantStore = new InMemoryRestaurantStore();
  const orderStore = new InMemoryOrderStore();
  const inspectorStore = new InMemoryInspectorStore();
  const inspectionStore = new InMemoryInspectionStore();
  const supportStore = new InMemorySupportStore();

  const identityService = new IdentityService({
    config,
    store: identityStore,
    otpAdapter,
    logger,
  });

  const inspectorService = new InspectorService({
    inspectorStore,
    identityService,
    rbacStore,
  });

  const inspectionService = new InspectionService({
    inspectionStore,
    inspectorStore,
    restaurantStore,
    rbacStore,
    identityService,
  });

  const supportService = new SupportService({
    supportStore,
    orderStore,
    restaurantStore,
    clock,
  });

  const safetyService = new SafetyService({
    inspectionStore,
    restaurantStore,
    inspectorStore,
    supportStore,
    clock,
  });

  const app = createApp({
    config,
    logger,
    identityService,
    rbacStore,
    restaurantStore,
    orderStore,
    inspectorStore,
    inspectorService,
    inspectionStore,
    inspectionService,
    supportStore,
    supportService,
    safetyService,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Test server running at ${baseUrl}`);

  try {
    // 0. Seed Users
    const customer = await registerCustomer(baseUrl, 'customer1@bhojora.test', '9876543210', 'Soumya Roy');
    const customer2 = await registerCustomer(baseUrl, 'customer2@bhojora.test', '9876543211', 'Ananya Sen');
    const agent = await createRoleUser(baseUrl, identityStore, 'agent@bhojora.test', '9876543220', 'Support Agent Rahul', 'SUPPORT_AGENT');
    const opsAdmin = await createRoleUser(baseUrl, identityStore, 'ops@bhojora.test', '9876543230', 'Ops Admin Priya', 'OPS_ADMIN');
    const trustAdmin = await createRoleUser(baseUrl, identityStore, 'trust@bhojora.test', '9876543240', 'Trust Lead Vikram', 'TRUST_ADMIN');

    // Seed a delivered order for customer 1
    const orderRecord = {
      orderId: 'ord_support_001',
      orderNumber: 'BHJ-2026-9001',
      customerId: customer.userId,
      quoteId: 'quote_ord_support_001',
      paymentId: 'pay_ord_support_001',
      restaurantId: 'rest_arsalan_001',
      outletId: 'out_arsalan_001',
      outletName: 'Arsalan - Park Circus',
      brandName: 'Arsalan Heritage',
      outletInspectionStatus: 'APPROVED',
      outletSafetyScore: 92,
      status: 'DELIVERED',
      version: 1,
      currency: 'INR',
      pricingBreakdown: {
        itemsSubtotalPaise: 50000,
        discountPaise: 0,
        discountedSubtotalPaise: 50000,
        packagingChargePaise: 1500,
        deliveryBaseFeePaise: 4000,
        deliveryDistanceFeePaise: 0,
        deliverySurgeFeePaise: 0,
        deliveryFeePaise: 4000,
        platformFeePaise: 500,
        gstTaxPaise: 2500,
        totalPayablePaise: 58500,
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
      cancellation: null,
      createdAt: simulatedNow,
      updatedAt: simulatedNow,
    };
    await orderStore.createOrderBundleAtomically({
      order: orderRecord,
      items: [],
      events: [],
      outboxEvents: [],
    });

    console.log('✓ Seeding complete: Customer, Agents, and Delivered Order.');

    // -------------------------------------------------------------
    // TEST 1: Ticket creation with priority auto-mapping
    // -------------------------------------------------------------
    console.log('\n--- TEST 1: Ticket Creation & Priority Auto-Mapping ---');
    const t1Res = await apiJson(baseUrl, '/api/v1/support/tickets', {
      method: 'POST',
      token: customer.token,
      body: {
        category: 'MISSING_ITEMS',
        subject: 'Missing extra raita in biryani order',
        description: 'I ordered extra garlic raita but only received the biryani container.',
        orderId: 'ord_support_001',
        outletId: 'out_arsalan_001',
      },
    });
    assert.equal(t1Res.status, 201, `Failed to create ticket: ${JSON.stringify(t1Res.body)}`);
    const ticket1 = t1Res.body.data.ticket;
    assert.ok(ticket1.ticketId.startsWith('tkt_'));
    assert.equal(ticket1.category, 'MISSING_ITEMS');
    assert.equal(ticket1.priority, 'P2_HIGH', 'Missing items must auto-map to P2_HIGH priority');
    assert.equal(ticket1.status, 'OPEN');
    assert.equal(ticket1.escalationTier, 'TIER_1_AGENT');
    assert.equal(ticket1.messages.length, 1);
    assert.equal(ticket1.caseHistory.length, 1);
    assert.equal(ticket1.caseHistory[0].action, 'CREATED');
    console.log(`✓ Ticket ${ticket1.ticketId} created with auto-priority P2_HIGH and SLA target.`);

    // -------------------------------------------------------------
    // TEST 2: SLA minutes & SLA target calculation
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: SLA Target Calculation ---');
    assert.equal(ticket1.slaMinutes, 60, 'P2 priority SLA must be 60 minutes');
    const expectedSlaDate = new Date(simulatedNow.getTime() + 60 * 60 * 1000).toISOString();
    assert.equal(ticket1.slaTargetUtc, expectedSlaDate);
    assert.equal(ticket1.isSlaBreached, false, 'Ticket should not be breached at creation time');
    console.log(`✓ SLA target verified: 60 mins -> ${ticket1.slaTargetUtc} (isSlaBreached: false).`);

    // -------------------------------------------------------------
    // TEST 3: SLA breach detection when clock advances
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Dynamic SLA Breach Detection ---');
    // Advance clock by 61 minutes
    simulatedNow = new Date(simulatedNow.getTime() + 61 * 60 * 1000);
    const breachCheck = await apiJson(baseUrl, `/api/v1/support/tickets/${ticket1.ticketId}`, {
      token: agent.token,
    });
    assert.equal(breachCheck.status, 200);
    assert.equal(breachCheck.body.data.ticket.isSlaBreached, true, 'Ticket must be marked as SLA breached after 61 mins');
    console.log('✓ Ticket correctly flagged as SLA breached after clock advanced beyond target.');

    // -------------------------------------------------------------
    // TEST 4: Agent assignment workflow
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Agent Assignment & Status Transition ---');
    const assignRes = await apiJson(baseUrl, `/api/v1/support/tickets/${ticket1.ticketId}/assign`, {
      method: 'POST',
      token: agent.token,
      body: {
        agentId: 'agt_kol_04',
        agentName: 'Agent Rahul Banerjee',
      },
    });
    assert.equal(assignRes.status, 200, `Assignment failed: ${JSON.stringify(assignRes.body)}`);
    const assignedTicket = assignRes.body.data.ticket;
    assert.equal(assignedTicket.status, 'ASSIGNED');
    assert.equal(assignedTicket.assignedTo.agentId, 'agt_kol_04');
    assert.equal(assignedTicket.assignedTo.agentName, 'Agent Rahul Banerjee');
    const assignHistory = assignedTicket.caseHistory.find((h) => h.action === 'ASSIGNED');
    assert.ok(assignHistory, 'Case history must log ASSIGNED action');
    assert.equal(assignHistory.previousStatus, 'OPEN');
    assert.equal(assignHistory.newStatus, 'ASSIGNED');
    console.log('✓ Ticket assigned and audit event appended to case history.');

    // -------------------------------------------------------------
    // TEST 5: Multi-tier escalation workflow
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Multi-Tier Escalation Workflow ---');
    const escRes = await apiJson(baseUrl, `/api/v1/support/tickets/${ticket1.ticketId}/escalate`, {
      method: 'POST',
      token: agent.token,
      body: {
        targetTier: 'TIER_3_ESCALATIONS_LEAD',
        reason: 'Customer requested supervisor review for repeated missing accompaniments',
      },
    });
    assert.equal(escRes.status, 200, `Escalation failed: ${JSON.stringify(escRes.body)}`);
    const escalatedTicket = escRes.body.data.ticket;
    assert.equal(escalatedTicket.status, 'ESCALATED');
    assert.equal(escalatedTicket.escalationTier, 'TIER_3_ESCALATIONS_LEAD');
    const escHistory = escalatedTicket.caseHistory.find((h) => h.action === 'ESCALATED');
    assert.ok(escHistory, 'Case history must record ESCALATED event');
    assert.equal(escHistory.previousTier, 'TIER_1_AGENT');
    assert.equal(escHistory.newTier, 'TIER_3_ESCALATIONS_LEAD');
    console.log('✓ Ticket escalated to Tier 3 Lead with reason logged.');

    // -------------------------------------------------------------
    // TEST 6: Canned response templates retrieval
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Canned Response Templates Retrieval ---');
    const tplRes = await apiJson(baseUrl, '/api/v1/support/tickets/templates', {
      token: agent.token,
    });
    assert.equal(tplRes.status, 200);
    const templates = tplRes.body.data.templates;
    assert.ok(Array.isArray(templates) && templates.length >= 5);
    const missingItemsTpl = templates.find((t) => t.category === 'MISSING_ITEMS');
    assert.ok(missingItemsTpl, 'Missing items response template must exist');
    console.log(`✓ Retrieved ${templates.length} canned response templates.`);

    // -------------------------------------------------------------
    // TEST 7: Adding conversation messages and internal staff notes
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Customer Messages vs Staff Internal Notes ---');
    // Staff adds internal note (hidden from customer)
    const noteRes = await apiJson(baseUrl, `/api/v1/support/tickets/${ticket1.ticketId}/messages`, {
      method: 'POST',
      token: agent.token,
      body: {
        content: 'Merchant Arsalan verified via kitchen log that raita was packed in pouch.',
        isInternalNote: true,
      },
    });
    assert.equal(noteRes.status, 201);
    assert.equal(noteRes.body.data.ticket.messages.some((m) => m.isInternalNote), true);

    // Staff applies canned response to customer
    const msgRes = await apiJson(baseUrl, `/api/v1/support/tickets/${ticket1.ticketId}/messages`, {
      method: 'POST',
      token: agent.token,
      body: {
        content: 'We reviewed your order.',
        templateId: missingItemsTpl.templateId,
        isInternalNote: false,
      },
    });
    assert.equal(msgRes.status, 201);

    // Customer views ticket -> internal notes must be redacted!
    const custView = await apiJson(baseUrl, `/api/v1/support/tickets/${ticket1.ticketId}`, {
      token: customer.token,
    });
    assert.equal(custView.status, 200);
    const custMessages = custView.body.data.ticket.messages;
    assert.ok(
      custMessages.every((m) => !m.isInternalNote),
      'Customer must NEVER receive internal staff notes in messages array',
    );
    console.log('✓ Internal notes privacy boundary verified: staff notes excluded from customer view.');

    // -------------------------------------------------------------
    // TEST 8: Ticket resolution
    // -------------------------------------------------------------
    console.log('\n--- TEST 8: Ticket Resolution & Audit Logging ---');
    const resolveRes = await apiJson(baseUrl, `/api/v1/support/tickets/${ticket1.ticketId}/resolve`, {
      method: 'POST',
      token: opsAdmin.token,
      body: {
        resolutionNotes: 'Issued ₹50 courtesy wallet credit for missing raita and notified kitchen dispatcher.',
      },
    });
    assert.equal(resolveRes.status, 200);
    const resolvedTicket = resolveRes.body.data.ticket;
    assert.equal(resolvedTicket.status, 'RESOLVED');
    assert.ok(resolvedTicket.resolution);
    assert.equal(resolvedTicket.resolution.resolvedByUserId, opsAdmin.userId);
    assert.equal(resolvedTicket.isSlaBreached, false, 'Resolved tickets must not show active SLA breach');
    const resHistory = resolvedTicket.caseHistory.find((h) => h.action === 'RESOLVED');
    assert.ok(resHistory);
    console.log('✓ Ticket marked as RESOLVED with resolution notes and audit entry.');

    // -------------------------------------------------------------
    // TEST 9: Role-scoped access enforcement
    // -------------------------------------------------------------
    console.log('\n--- TEST 9: Role-Scoped Access Enforcement ---');
    // Customer 2 attempts to view Customer 1's ticket -> 403 Forbidden
    const unauthView = await apiJson(baseUrl, `/api/v1/support/tickets/${ticket1.ticketId}`, {
      token: customer2.token,
    });
    assert.equal(unauthView.status, 403, 'Customer cannot view another user\'s support ticket');

    // Customer attempts to assign ticket -> 403 Forbidden
    const unauthAssign = await apiJson(baseUrl, `/api/v1/support/tickets/${ticket1.ticketId}/assign`, {
      method: 'POST',
      token: customer.token,
      body: { agentId: 'agt_99', agentName: 'Fake' },
    });
    assert.equal(unauthAssign.status, 403, 'Customer cannot assign tickets');

    // Customer attempts to resolve ticket -> 403 Forbidden
    const unauthResolve = await apiJson(baseUrl, `/api/v1/support/tickets/${ticket1.ticketId}/resolve`, {
      method: 'POST',
      token: customer.token,
      body: { resolutionNotes: 'Customer trying to resolve' },
    });
    assert.equal(unauthResolve.status, 403, 'Customer cannot resolve support tickets');
    console.log('✓ Role-scoped access verified: unauthorized customer actions strictly blocked with 403.');

    // -------------------------------------------------------------
    // TEST 10: Automatic P1/P2 Safety Support Ticket generation
    // -------------------------------------------------------------
    console.log('\n--- TEST 10: Safety Complaint Auto-Ticket Generation ---');
    const complaintRes = await apiJson(baseUrl, '/api/v1/safety/complaints', {
      method: 'POST',
      token: customer.token,
      body: {
        orderId: 'ord_support_001',
        category: 'FOREIGN_OBJECT', // Critical severity category
        description: 'Found a sharp metal staple inside the chicken biryani container.',
      },
    });
    assert.equal(complaintRes.status, 201);
    const complaint = complaintRes.body.data.complaint;
    assert.equal(complaint.severity, 'CRITICAL');
    assert.equal(complaint.isAllegation, true, 'Safety allegation invariant strictly maintained');

    // Verify auto-generated safety support ticket in support queue
    const safetyQueueRes = await apiJson(baseUrl, '/api/v1/support/tickets?isSafetyPriority=true', {
      token: trustAdmin.token,
    });
    assert.equal(safetyQueueRes.status, 200);
    const safetyTickets = safetyQueueRes.body.data.tickets;
    const autoSafetyTicket = safetyTickets.find((t) => t.safetyComplaintId === complaint.complaintId);
    assert.ok(autoSafetyTicket, 'Auto-generated safety support ticket must exist in queue');
    assert.equal(autoSafetyTicket.priority, 'P1_CRITICAL');
    assert.equal(autoSafetyTicket.escalationTier, 'TRUST_SAFETY_ADMIN');
    assert.equal(autoSafetyTicket.isSafetyPriority, true);
    assert.equal(autoSafetyTicket.slaMinutes, 15, 'Critical safety allegation SLA must be 15 minutes');
    console.log(`✓ Safety complaint ${complaint.complaintId} automatically spawned P1_CRITICAL ticket ${autoSafetyTicket.ticketId} with 15m SLA target.`);

    console.log('\n======================================================');
    console.log('ALL 10 CHECKPOINT 26 VERIFICATION CHECKS PASSED (10/10)');
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

main().catch((err) => {
  console.error('\n❌ CHECKPOINT 26 VERIFICATION FAILED:', err);
  process.exit(1);
});
