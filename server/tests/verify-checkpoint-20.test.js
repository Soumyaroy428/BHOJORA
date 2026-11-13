'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');

const { SERVER_BASELINE } = require('../dist/index.js');
const { validateEnv } = require('../dist/config/env.js');
const { createLogger } = require('../dist/config/logger.js');
const { createApp } = require('../dist/app.js');
const { InMemoryIdentityStore } = require('../dist/modules/identity/identity.models.js');
const { InMemoryTestOtpAdapter } = require('../dist/modules/identity/otp.adapter.js');
const { IdentityService } = require('../dist/modules/identity/identity.service.js');
const { InMemoryRbacStore } = require('../dist/modules/rbac/rbac.store.js');
const { InMemoryCustomerStore } = require('../dist/modules/customer/customer.store.js');
const { CustomerService } = require('../dist/modules/customer/customer.service.js');
const { InMemoryRestaurantStore } = require('../dist/modules/restaurant/restaurant.store.js');
const { InMemoryOutletStore } = require('../dist/modules/outlet/outlet.store.js');
const { OutletService } = require('../dist/modules/outlet/outlet.service.js');
const { InMemoryCatalogStore } = require('../dist/modules/catalog/catalog.store.js');
const { InMemoryCartStore } = require('../dist/modules/cart/cart.store.js');
const { CartService } = require('../dist/modules/cart/cart.service.js');
const { InMemoryPricingStore } = require('../dist/modules/pricing/pricing.store.js');
const { PricingService } = require('../dist/modules/pricing/pricing.service.js');
const { SandboxPaymentGatewayAdapter } = require('../dist/modules/payments/payments.adapter.js');
const { InMemoryPaymentStore } = require('../dist/modules/payments/payments.store.js');
const { PaymentService } = require('../dist/modules/payments/payments.service.js');
const { InMemoryOrderStore } = require('../dist/modules/orders/orders.store.js');
const { OrderService } = require('../dist/modules/orders/orders.service.js');
const { InMemoryDeliveryStore } = require('../dist/modules/delivery/delivery.store.js');
const { DeliveryService } = require('../dist/modules/delivery/delivery.service.js');
const {
  DELIVERY_ASSIGNMENT_STATUSES_RUNTIME,
  DELIVERY_EXECUTION_STEPS_RUNTIME,
  DELIVERY_INCIDENT_TYPES_RUNTIME,
  MAX_OTP_ATTEMPTS,
} = require('../dist/modules/delivery/delivery.types.js');

const TEST_PASSWORD = 'Bhojora#Rider2026';

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4020',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp20_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test_jwt_access_secret_32_characters_minimum_cp20!',
      JWT_REFRESH_SECRET: 'test_jwt_refresh_secret_32_characters_minimum_cp20!',
      JWT_ACCESS_EXPIRY: '15m',
      JWT_REFRESH_EXPIRY: '7d',
      COOKIE_SECRET: 'test_cookie_secret_32_characters_minimum_cp20!',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:3000',
      APP_TIMEZONE: 'Asia/Kolkata',
      DEFAULT_CITY_CODE: 'KOLKATA',
      DEFAULT_CURRENCY: 'INR',
      PAYMENT_WEBHOOK_SECRET: 'test_webhook_secret_32_characters_minimum_cp20!',
    },
    { serviceName: 'bhojora-api-test-cp20', serviceVersion: '0.1.0' },
  );
}

async function apiJson(baseUrl, pathUrl, options = {}) {
  const method = options.method ?? 'GET';
  const headers = { ...(options.headers ?? {}) };
  let bodyStr;
  if (options.body !== undefined) {
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
  assert.equal(
    res.status,
    201,
    `Failed registering customer ${email}: ${JSON.stringify(res.json)}`,
  );
  return {
    userId: res.json.data.user.id,
    token: res.json.data.tokens.accessToken,
    refreshToken: res.json.data.tokens.refreshToken,
  };
}

async function createAndVerifyPrivilegedUser({
  baseUrl,
  identityStore,
  otpAdapter,
  email,
  phone,
  name,
  role,
  mfaVerified = true,
}) {
  const reg = await registerCustomer(baseUrl, email, phone, name);
  await identityStore.updateUser(reg.userId, { roles: [role] }, new Date());
  const loginRes = await apiJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: { identifier: email, password: TEST_PASSWORD },
  });
  assert.equal(loginRes.status, 200);
  const accessToken = loginRes.json.data.tokens.accessToken;
  if (!mfaVerified) {
    return { userId: reg.userId, token: accessToken };
  }
  const sendRes = await apiJson(baseUrl, '/auth/mfa/send', {
    method: 'POST',
    token: accessToken,
  });
  assert.equal(sendRes.status, 200);
  const challengeId = sendRes.json.data.challengeId;
  const msg = otpAdapter.getLatestMessage();
  assert.ok(msg && /^\d{6}$/.test(msg.code), `Expected OTP code for ${phone}`);
  const verifyRes = await apiJson(baseUrl, '/auth/mfa/verify', {
    method: 'POST',
    token: accessToken,
    body: { challengeId, code: msg.code },
  });
  assert.equal(verifyRes.status, 200);
  return {
    userId: reg.userId,
    token: verifyRes.json.data.tokens?.accessToken ?? accessToken,
  };
}

async function runCheckpoint20Verification() {
  console.log('=== RUNNING CHECKPOINT 20 VERIFICATION TEST SUITE ===');
  assert.ok(SERVER_BASELINE);
  assert.ok(DELIVERY_ASSIGNMENT_STATUSES_RUNTIME);
  assert.ok(DELIVERY_EXECUTION_STEPS_RUNTIME);
  assert.ok(DELIVERY_INCIDENT_TYPES_RUNTIME);
  assert.equal(MAX_OTP_ATTEMPTS, 5);

  const config = createTestConfig();
  const logger = createLogger({
    level: 'error',
    service: 'bhojora-test',
    environment: 'test',
    includeStack: false,
  });

  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({
    config,
    logger,
    store: identityStore,
    otpAdapter,
  });

  const rbacStore = new InMemoryRbacStore();
  const customerStore = new InMemoryCustomerStore();
  const customerService = new CustomerService({
    config,
    logger,
    customerStore,
    identityStore,
    rbacStore,
  });

  const restaurantStore = new InMemoryRestaurantStore();
  const outletStore = new InMemoryOutletStore();
  const outletService = new OutletService({ outletStore, rbacStore });

  const catalogStore = new InMemoryCatalogStore();
  const cartStore = new InMemoryCartStore();
  const cartService = new CartService({ cartStore, catalogStore, outletStore });

  const pricingStore = new InMemoryPricingStore();
  const pricingService = new PricingService({
    pricingStore,
    catalogStore,
    outletStore,
    outletService,
    signingSecret: config.jwtAccessSecret,
  });

  const paymentStore = new InMemoryPaymentStore();
  const paymentGatewayAdapter = new SandboxPaymentGatewayAdapter();
  const paymentService = new PaymentService({
    paymentStore,
    pricingService,
    gatewayAdapter: paymentGatewayAdapter,
    rbacStore,
    webhookSecret: config.paymentWebhookSecret,
    webhookReplayWindowSeconds: config.webhookReplayWindowSeconds,
    logger,
  });

  const orderStore = new InMemoryOrderStore();
  const orderService = new OrderService({
    orderStore,
    pricingService,
    cartService,
    restaurantStore,
    paymentStore,
    rbacStore,
    logger,
  });

  const deliveryStore = new InMemoryDeliveryStore();
  const deliveryService = new DeliveryService({
    deliveryStore,
    identityStore,
    rbacStore,
    orderStore,
    signingSecret: config.jwtAccessSecret,
  });

  const app = createApp({
    config,
    logger,
    identityService,
    identityStore,
    rbacStore,
    customerService,
    customerStore,
    restaurantStore,
    outletService,
    outletStore,
    catalogStore,
    cartService,
    cartStore,
    pricingService,
    pricingStore,
    paymentService,
    paymentStore,
    orderService,
    orderStore,
    deliveryService,
    deliveryStore,
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;

  try {
    // Test 1: Setup Users, Partner & Active Order with OTP
    console.log('Test 1: Setup Users, Delivery Partner & Active Order with OTP...');

    const adminUser = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'ops.admin.cp20@bhojora.in',
      phone: '+91 98300 00020',
      name: 'Ops Admin CP20',
      role: 'SUPER_ADMIN',
    });

    const customerUser = await registerCustomer(
      baseUrl,
      'customer.cp20@example.com',
      '+91 98300 00021',
      'Ananya Dasgupta',
    );

    const riderUser = await createAndVerifyPrivilegedUser({
      baseUrl,
      identityStore,
      otpAdapter,
      email: 'rider.cp20@bhojora.in',
      phone: '+91 98300 00022',
      name: 'Subhashish Ghosh',
      role: 'DELIVERY_PARTNER',
      mfaVerified: false,
    });

    // Create & Approve Rider Application
    const appRes = await apiJson(baseUrl, '/delivery/applications', {
      method: 'POST',
      token: riderUser.token,
      body: {
        fullName: 'Subhashish Ghosh',
        preferredZones: ['salt-lake', 'new-town'],
        vehicleType: 'MOTORCYCLE',
        vehicleModel: 'Hero Splendor Plus',
        vehicleRegistrationNumber: 'WB-02-CP-2020',
        emergencyContactName: 'Bikas Ghosh',
        emergencyContactPhone: '+91 98300 00029',
        emergencyContactRelationship: 'Father',
      },
    });
    assert.equal(appRes.status, 201);
    const partnerId = appRes.json.data.application.partnerId;

    // Approve Partner
    const approveRes = await apiJson(baseUrl, `/delivery/admin/applications/${partnerId}/review`, {
      method: 'POST',
      token: adminUser.token,
      body: { action: 'APPROVE', reason: 'Documents and verification complete' },
    });
    assert.equal(approveRes.status, 200);

    // Create an Order with known 4-digit Delivery OTP
    const orderId = 'ord_cp20_test_001';
    const deliveryOtp = '4829';
    const now = new Date();

    await orderStore.createOrderBundleAtomically({
      order: {
        orderId,
        orderNumber: 'BHO-2026-CP20',
        customerId: customerUser.userId,
        quoteId: 'qte_cp20_001',
        paymentId: 'pay_cp20_001',
        restaurantId: 'rest_cp20_001',
        outletId: 'out_cp20_001',
        outletName: 'Kolkata Biryani House',
        brandName: 'Kolkata Biryani House',
        outletInspectionStatus: 'APPROVED',
        outletSafetyScore: 95,
        status: 'READY_FOR_PICKUP',
        version: 1,
        currency: 'INR',
        pricingBreakdown: {
          itemsSubtotalPaise: 45000,
          discountPaise: 0,
          discountedSubtotalPaise: 45000,
          packagingChargePaise: 2000,
          deliveryBaseFeePaise: 4000,
          deliveryDistanceFeePaise: 0,
          deliverySurgeFeePaise: 0,
          deliveryFeePaise: 4000,
          platformFeePaise: 500,
          gstTaxPaise: 2350,
          totalPayablePaise: 53850,
        },
        couponCode: null,
        addressSnapshot: {
          addressId: 'addr_cp20_01',
          label: 'Home',
          streetAddress: 'Flat 3B, Lake View Enclave, Salt Lake Sector 1',
          locality: 'Salt Lake',
          city: 'Kolkata',
          zoneId: 'salt-lake',
          coordinates: [88.412, 22.585],
        },
        estimatedDeliveryMinutes: 30,
        prepTimeMinutes: 15,
        specialInstructions: 'Ring doorbell twice',
        deliveryOtp,
        cancellation: null,
        confirmedAt: now,
        preparingAt: now,
        readyForPickupAt: now,
        outForDeliveryAt: null,
        deliveredAt: null,
        cancelledAt: null,
        createdAt: now,
        updatedAt: now,
      },
      items: [],
      events: [],
      outboxEvents: [],
    });

    console.log('✓ Test 1 passed.');

    // Test 2: Privacy Boundary - Location updates rejected when not actively on delivery
    console.log(
      'Test 2: Privacy Boundary - Location updates rejected when not actively on delivery...',
    );

    // Partner is currently OFFLINE
    const partnerProfile = await deliveryStore.getPartnerById(partnerId);
    assert.equal(partnerProfile.shiftStatus, 'OFFLINE');

    // Attempt location ping before having an active delivery assignment
    const unauthorizedPing = await apiJson(
      baseUrl,
      '/delivery/assignments/dlo_mock_nonexistent/location',
      {
        method: 'POST',
        token: riderUser.token,
        body: {
          coordinates: [88.415, 22.583],
          speedKmph: 25,
        },
      },
    );
    assert.ok(unauthorizedPing.status === 403 || unauthorizedPing.status === 404);
    console.log('✓ Test 2 passed.');

    // Test 3: Dispatch & Accept Offer -> Enters ON_DELIVERY Shift Status
    console.log('Test 3: Dispatch & Accept Offer -> Enters ON_DELIVERY Shift Status...');

    // Put rider ONLINE
    const shiftRes = await apiJson(baseUrl, '/delivery/profile/me/availability', {
      method: 'PATCH',
      token: riderUser.token,
      body: { shiftStatus: 'ONLINE', coordinates: [88.41, 22.58] },
    });
    assert.equal(shiftRes.status, 200);

    // Create job offer for order
    const offer = await deliveryStore.createOffer({
      offerId: 'dlo_cp20_offer_001',
      orderId,
      outletId: 'out_cp20_001',
      status: 'OFFERED',
      offeredToPartnerId: partnerId,
      partnerId: null,
      pickupLocation: {
        name: 'Kolkata Biryani House',
        addressLine: 'Salt Lake Sector 1 Main Road',
        landmark: 'Opp City Centre 1',
        coordinates: [88.405, 22.588],
      },
      dropLocation: {
        name: 'Ananya Dasgupta',
        addressLine: 'Flat 3B, Lake View Enclave, Salt Lake Sector 1',
        landmark: null,
        coordinates: [88.412, 22.585],
      },
      estimatedDistanceKm: 2.5,
      estimatedDurationMinutes: 15,
      guaranteedPayoutPaise: 7250, // ₹72.50
      offeredAt: now,
      expiresAt: new Date(Date.now() + 45000),
      acceptedAt: null,
      declinedAt: null,
      declineReason: null,
      reassignedFromOfferId: null,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });

    // Accept offer
    const acceptRes = await apiJson(baseUrl, `/delivery/jobs/${offer.offerId}/accept`, {
      method: 'POST',
      token: riderUser.token,
    });
    assert.equal(acceptRes.status, 200);
    assert.equal(acceptRes.json.data.offer.status, 'ACCEPTED');

    const partnerAfterAccept = await deliveryStore.getPartnerById(partnerId);
    assert.equal(partnerAfterAccept.shiftStatus, 'ON_DELIVERY');
    console.log('✓ Test 3 passed.');

    // Test 4: Live Location Streaming During Active Delivery & Boundary Checks
    console.log('Test 4: Live Location Streaming During Active Delivery...');

    // Out of bounds coordinates (outside Kolkata bounds) -> rejected 400
    const outOfBoundsPing = await apiJson(
      baseUrl,
      `/delivery/assignments/${offer.offerId}/location`,
      {
        method: 'POST',
        token: riderUser.token,
        body: {
          coordinates: [77.209, 28.6139], // Delhi coordinates
          speedKmph: 30,
        },
      },
    );
    assert.equal(outOfBoundsPing.status, 400);

    // Valid location ping in Kolkata
    const validPingRes = await apiJson(baseUrl, `/delivery/assignments/${offer.offerId}/location`, {
      method: 'POST',
      token: riderUser.token,
      body: {
        coordinates: [88.408, 22.586],
        speedKmph: 28.5,
        headingDegrees: 135,
      },
    });
    assert.equal(validPingRes.status, 201);
    assert.ok(validPingRes.json.data.event);
    assert.deepEqual(validPingRes.json.data.event.coordinates, [88.408, 22.586]);

    // Check rider updated coordinates in store
    const partnerUpdated = await deliveryStore.getPartnerById(partnerId);
    assert.deepEqual(partnerUpdated.lastCoordinates, [88.408, 22.586]);
    console.log('✓ Test 4 passed.');

    // Test 5: Execution Step Transitions & Order Status Sync
    console.log('Test 5: Execution Step Transitions & Order Status Sync...');

    // Step 1 -> Arrive at Pickup
    const arrivePickupRes = await apiJson(
      baseUrl,
      `/delivery/assignments/${offer.offerId}/arrive-pickup`,
      {
        method: 'POST',
        token: riderUser.token,
      },
    );
    assert.equal(arrivePickupRes.status, 200);
    assert.equal(arrivePickupRes.json.data.assignment.executionStep, 'ARRIVED_AT_PICKUP');

    // Attempting to jump directly to ARRIVED_AT_DROP without picking up food -> 409 CONFLICT
    const invalidStepRes = await apiJson(
      baseUrl,
      `/delivery/assignments/${offer.offerId}/arrive-drop`,
      {
        method: 'POST',
        token: riderUser.token,
      },
    );
    assert.equal(invalidStepRes.status, 409);

    // Step 2 -> Confirm Pickup (food in hand)
    const confirmPickupRes = await apiJson(
      baseUrl,
      `/delivery/assignments/${offer.offerId}/confirm-pickup`,
      {
        method: 'POST',
        token: riderUser.token,
      },
    );
    assert.equal(confirmPickupRes.status, 200);
    assert.equal(confirmPickupRes.json.data.assignment.executionStep, 'CONFIRMED_PICKUP');

    // Order status should now automatically transition to OUT_FOR_DELIVERY!
    const orderAfterPickup = await orderStore.getOrderById(orderId);
    assert.equal(orderAfterPickup.status, 'OUT_FOR_DELIVERY');

    // Step 3 -> Arrive at Drop
    const arriveDropRes = await apiJson(
      baseUrl,
      `/delivery/assignments/${offer.offerId}/arrive-drop`,
      {
        method: 'POST',
        token: riderUser.token,
      },
    );
    assert.equal(arriveDropRes.status, 200);
    assert.equal(arriveDropRes.json.data.assignment.executionStep, 'ARRIVED_AT_DROP');
    console.log('✓ Test 5 passed.');

    // Test 6: Invalid / Spoofed OTP Handover Rejections & Lockout Protection
    console.log('Test 6: Invalid / Spoofed OTP Handover Rejections & Lockout Protection...');

    // Attempt 1: wrong OTP
    const wrongOtpRes1 = await apiJson(baseUrl, `/delivery/assignments/${offer.offerId}/complete`, {
      method: 'POST',
      token: riderUser.token,
      body: { deliveryOtp: '0000' },
    });
    assert.equal(wrongOtpRes1.status, 400);
    assert.ok(wrongOtpRes1.json.error.message.includes('1/5'));

    // Attempts 2, 3, 4
    for (let i = 2; i <= 4; i++) {
      const wrongRes = await apiJson(baseUrl, `/delivery/assignments/${offer.offerId}/complete`, {
        method: 'POST',
        token: riderUser.token,
        body: { deliveryOtp: `111${i}` },
      });
      assert.equal(wrongRes.status, 400);
      assert.ok(wrongRes.json.error.message.includes(`${i}/5`));
    }

    // Attempt 5: 5th failure triggers lockout (429 RATE_LIMITED)
    const lockRes = await apiJson(baseUrl, `/delivery/assignments/${offer.offerId}/complete`, {
      method: 'POST',
      token: riderUser.token,
      body: { deliveryOtp: '9999' },
    });
    assert.equal(lockRes.status, 429);
    assert.ok(lockRes.json.error.message.includes('Maximum delivery OTP attempts exceeded'));

    // Even if caller now tries the correct OTP, they remain locked out!
    const lockedValidRes = await apiJson(
      baseUrl,
      `/delivery/assignments/${offer.offerId}/complete`,
      {
        method: 'POST',
        token: riderUser.token,
        body: { deliveryOtp },
      },
    );
    assert.equal(lockedValidRes.status, 429);
    console.log('✓ Test 6 passed.');

    // Test 7: Reset counter & Successful Handover with Valid OTP
    console.log('Test 7: Successful Handover with Valid OTP & Order DELIVERED transition...');

    // Reset failed counter to simulate ops resolution
    await deliveryStore.updateOffer(offer.offerId, { failedOtpAttempts: 0 });

    const completeRes = await apiJson(baseUrl, `/delivery/assignments/${offer.offerId}/complete`, {
      method: 'POST',
      token: riderUser.token,
      body: {
        deliveryOtp,
        notes: 'Handed directly to customer at door',
      },
    });
    assert.equal(completeRes.status, 200);
    assert.equal(completeRes.json.data.orderStatus, 'DELIVERED');
    assert.equal(completeRes.json.data.assignment.status, 'COMPLETED');
    assert.equal(completeRes.json.data.payoutCreditedPaise, 7250);

    // Verify Order is now DELIVERED
    const finalOrder = await orderStore.getOrderById(orderId);
    assert.equal(finalOrder.status, 'DELIVERED');
    assert.ok(finalOrder.deliveredAt);

    // Verify Rider is back ONLINE with totalDeliveries incremented
    const finalPartner = await deliveryStore.getPartnerById(partnerId);
    assert.equal(finalPartner.shiftStatus, 'ONLINE');
    assert.equal(finalPartner.totalDeliveries, 1);
    console.log('✓ Test 7 passed.');

    // Test 8: Privacy Boundary Enforcement Post-Completion
    console.log('Test 8: Privacy Boundary Post-Completion (No further location pings)...');

    const postCompletePing = await apiJson(
      baseUrl,
      `/delivery/assignments/${offer.offerId}/location`,
      {
        method: 'POST',
        token: riderUser.token,
        body: {
          coordinates: [88.412, 22.585],
          speedKmph: 0,
        },
      },
    );
    assert.equal(postCompletePing.status, 403);
    assert.ok(
      postCompletePing.json.error.message.includes(
        'only permitted during an active disclosed delivery',
      ),
    );
    console.log('✓ Test 8 passed.');

    // Test 9: Incident & Exception Reporting
    console.log('Test 9: Incident & Exception Reporting...');

    const incidentRes = await apiJson(baseUrl, `/delivery/assignments/${offer.offerId}/incidents`, {
      method: 'POST',
      token: riderUser.token,
      body: {
        incidentType: 'CUSTOMER_UNREACHABLE',
        description: 'Customer phone was busy for 5 minutes during drop attempt',
        coordinates: [88.412, 22.585],
      },
    });
    assert.equal(incidentRes.status, 201);
    assert.equal(incidentRes.json.data.incident.incidentType, 'CUSTOMER_UNREACHABLE');
    assert.equal(incidentRes.json.data.incident.status, 'REPORTED');

    // Retrieve incidents for assignment
    const listIncidentsRes = await apiJson(
      baseUrl,
      `/delivery/assignments/${offer.offerId}/incidents`,
      {
        token: riderUser.token,
      },
    );
    assert.equal(listIncidentsRes.status, 200);
    assert.equal(listIncidentsRes.json.data.incidents.length, 1);
    assert.equal(listIncidentsRes.json.data.incidents[0].incidentType, 'CUSTOMER_UNREACHABLE');
    console.log('✓ Test 9 passed.');

    // Test 10: Customer Live Tracking & Privacy
    console.log('Test 10: Customer Live Tracking & Privacy...');

    // Customer views live tracking for their order
    const trackingRes = await apiJson(baseUrl, `/delivery/orders/${orderId}/live-tracking`, {
      token: customerUser.token,
    });
    assert.equal(trackingRes.status, 200);
    const tracking = trackingRes.json.data.tracking;
    assert.equal(tracking.orderId, orderId);
    assert.equal(tracking.status, 'DELIVERED');
    assert.equal(tracking.deliveryOtp, deliveryOtp); // Customer sees OTP
    assert.ok(tracking.pickupLocation);
    assert.ok(tracking.dropLocation);

    // Unauthorized outsider cannot view live tracking
    const outsider = await registerCustomer(
      baseUrl,
      'outsider.cp20@example.com',
      '+91 98300 00028',
      'Intruder Bob',
    );
    const outsiderRes = await apiJson(baseUrl, `/delivery/orders/${orderId}/live-tracking`, {
      token: outsider.token,
    });
    assert.equal(outsiderRes.status, 403);
    console.log('✓ Test 10 passed.');

    console.log('--- ALL 10 CHECKPOINT 20 VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

void runCheckpoint20Verification().catch((err) => {
  console.error('FATAL Test failure in Checkpoint 20 verification:', err);
  process.exit(1);
});
