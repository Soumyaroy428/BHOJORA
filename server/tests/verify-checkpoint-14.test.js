'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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
const { CustomerService } = require('../dist/modules/customer/customer.service.js');
const { InMemoryRestaurantStore } = require('../dist/modules/restaurant/restaurant.store.js');
const { InMemoryOutletStore } = require('../dist/modules/outlet/outlet.store.js');
const { DEFAULT_OUTLET_OPERATING_SLOTS } = require('../dist/modules/outlet/outlet.geo.js');
const { OutletService } = require('../dist/modules/outlet/outlet.service.js');
const { InMemoryCatalogStore } = require('../dist/modules/catalog/catalog.store.js');
const { InMemoryCartStore } = require('../dist/modules/cart/cart.store.js');
const { CartService } = require('../dist/modules/cart/cart.service.js');
const { InMemoryPricingStore } = require('../dist/modules/pricing/pricing.store.js');
const { PricingService } = require('../dist/modules/pricing/pricing.service.js');
const { computeServerPricingBreakdown } = require('../dist/modules/pricing/pricing.math.js');
const {
  QUOTE_TTL_SECONDS: SERVER_QUOTE_TTL_SECONDS,
  PLATFORM_FEE_PAISE: SERVER_PLATFORM_FEE_PAISE,
  DELIVERY_PER_KM_PAISE: SERVER_DELIVERY_PER_KM_PAISE,
  PACKAGING_PER_UNIT_PAISE: SERVER_PACKAGING_PER_UNIT_PAISE,
  PACKAGING_MAX_PAISE: SERVER_PACKAGING_MAX_PAISE,
  MAX_TIP_PAISE: SERVER_MAX_TIP_PAISE,
  GST_TAX_BPS_BY_SLAB: SERVER_GST_TAX_BPS_BY_SLAB,
  TAMPER_PROTECTION_NOTICE: SERVER_TAMPER_PROTECTION_NOTICE,
} = require('../dist/modules/pricing/pricing.types.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TEST_PASSWORD = 'Bhojora#Pricing2026';

class MutableTestClock {
  constructor(initialIso) {
    this.current = new Date(initialIso);
  }
  advanceSeconds(seconds) {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
  now() {
    return new Date(this.current.getTime());
  }
}

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4014',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp14_test',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long-cp14',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long-cp14',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:4173',
    },
    { serviceName: 'bhojora-api-cp14-test', serviceVersion: '0.1.0' },
  );
}

async function startTestServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
  };
}

async function apiJson(baseUrl, routePath, { method = 'GET', token, body } = {}) {
  const res = await fetch(`${baseUrl}${routePath}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

async function registerCustomer(baseUrl, phone, email, name) {
  const res = await apiJson(baseUrl, '/auth/register', {
    method: 'POST',
    body: {
      name,
      email,
      phone,
      password: TEST_PASSWORD,
      acceptTerms: true,
    },
  });
  assert.equal(res.status, 201, `Register failed for ${email}: ${JSON.stringify(res.json)}`);
  return {
    userId: res.json.data.user.id,
    email,
    token: res.json.data.tokens.accessToken,
  };
}

async function loginUser(baseUrl, identifier) {
  const res = await apiJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: { identifier, password: TEST_PASSWORD },
  });
  assert.equal(res.status, 200, `Login failed for ${identifier}: ${JSON.stringify(res.json)}`);
  return res.json.data.tokens.accessToken;
}

function buildOutletRecord({
  outletId,
  restaurantId,
  brandName,
  name,
  zoneId,
  locality,
  coordinates,
  cuisines,
  platformInspectionStatus = 'VERIFIED_CLEAN',
  publishedSafetyScore = 94,
  now = new Date('2026-11-12T06:30:00Z'),
}) {
  return {
    outletId,
    restaurantId,
    ownerUserId: 'usr_seed_owner',
    brandName,
    name,
    slug: `${brandName}-${outletId}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    zoneId,
    wardOrBorough: `${locality} Ward`,
    streetAddress: `12 ${locality} Main Road`,
    landmark: `Near ${locality} Crossing`,
    locality,
    city: 'Kolkata',
    postalCode: '700017',
    location: { type: 'Point', coordinates },
    cuisines,
    prepTimeMinutes: 25,
    deliveryRadiusMeters: 8000,
    operatingSlots: DEFAULT_OUTLET_OPERATING_SLOTS,
    status: 'ACTIVE',
    fssaiLicenseNumber: '12826019000999',
    fssaiExpiresOn: '2028-12-31',
    fssaiVerificationStatus: 'VERIFIED',
    platformInspectionStatus,
    publishedSafetyScore,
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  console.log('--- Starting Checkpoint 14 Cart & Authoritative Pricing Verification Suite ---');

  // 1. Baseline, shared-vs-server contract & math parity, DB indexes, OpenAPI coverage
  assert.ok(Number(SERVER_BASELINE.checkpoint) >= 14, 'SERVER_BASELINE.checkpoint must be >= 14');

  const sharedPricingUrl = pathToFileURL(
    path.join(REPO_ROOT, 'client', 'shared', 'dist', 'contracts', 'cart-pricing.js'),
  ).href;
  const sharedPricing = await import(sharedPricingUrl);

  assert.equal(sharedPricing.QUOTE_TTL_SECONDS, SERVER_QUOTE_TTL_SECONDS);
  assert.equal(sharedPricing.QUOTE_TTL_SECONDS, 600);
  assert.equal(sharedPricing.PLATFORM_FEE_PAISE, SERVER_PLATFORM_FEE_PAISE);
  assert.equal(sharedPricing.PLATFORM_FEE_PAISE, 500);
  assert.equal(sharedPricing.DELIVERY_PER_KM_PAISE, SERVER_DELIVERY_PER_KM_PAISE);
  assert.equal(sharedPricing.DELIVERY_PER_KM_PAISE, 600);
  assert.equal(sharedPricing.PACKAGING_PER_UNIT_PAISE, SERVER_PACKAGING_PER_UNIT_PAISE);
  assert.equal(sharedPricing.PACKAGING_MAX_PAISE, SERVER_PACKAGING_MAX_PAISE);
  assert.equal(sharedPricing.MAX_TIP_PAISE, SERVER_MAX_TIP_PAISE);
  assert.deepEqual(sharedPricing.GST_TAX_BPS_BY_SLAB, SERVER_GST_TAX_BPS_BY_SLAB);
  assert.equal(sharedPricing.TAMPER_PROTECTION_NOTICE, SERVER_TAMPER_PROTECTION_NOTICE);

  const parityInput = {
    items: [
      { unitPricePaise: 48000, quantity: 1, gstTaxSlab: 'RESTAURANT_5_PCT' },
      { unitPricePaise: 18000, quantity: 2, gstTaxSlab: 'BAKERY_18_PCT' },
      { unitPricePaise: 5000, quantity: 2, gstTaxSlab: 'EXEMPT_0_PCT' },
    ],
    deliveryBaseFeePaise: 2900,
    distanceMeters: 2450,
    tipPaise: 3000,
    coupon: {
      code: 'BHOJORA100',
      title: '₹100 Off Kolkata Welcome Offer',
      discountType: 'FLAT_PAISE',
      discountValue: 10000,
      maxDiscountPaise: 10000,
      minOrderSubtotalPaise: 40000,
      platformShareBps: 6000,
      restaurantShareBps: 4000,
    },
  };
  const sharedMath = sharedPricing.computeIntegerPricingBreakdown(parityInput);
  const serverMath = computeServerPricingBreakdown(parityInput);
  assert.deepEqual(
    {
      ...serverMath.breakdown,
      formattedTotalPayableInr: undefined,
    },
    {
      ...sharedMath.breakdown,
      formattedTotalPayableInr: undefined,
    },
    'Shared and server integer pricing math must be bit-for-bit identical',
  );
  assert.deepEqual(serverMath.lineTaxPaise, sharedMath.lineTaxPaise);
  assert.deepEqual(serverMath.couponAllocation, sharedMath.couponAllocation);
  assert.equal(
    serverMath.breakdown.packagingChargePaise,
    4000,
    'Packaging cap must clamp at 4000 paise (Rs 40)',
  );

  const indexNames = new Set(INITIAL_DATABASE_INDEXES.map((entry) => entry.options.name));
  for (const requiredIdx of [
    'idx_carts_customer_unique',
    'idx_pricing_quotes_id_unique',
    'idx_pricing_quotes_customer_issued_desc',
    'idx_pricing_quotes_expires_ttl',
    'idx_coupons_code_unique',
    'idx_coupons_active_valid_until',
  ]) {
    assert.ok(indexNames.has(requiredIdx), `Missing required CP14 index ${requiredIdx}`);
  }

  const openapi = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, 'docs', '01-CORE-PLANNING-DESIGN', 'openapi.json'),
      'utf8',
    ),
  );
  for (const p of [
    '/cart',
    '/cart/items',
    '/cart/items/{cartItemId}',
    '/coupons/available',
    '/checkout/quote',
    '/checkout/quotes/{quoteId}',
    '/checkout/quotes/{quoteId}/verify',
  ]) {
    assert.ok(openapi.paths[p], `OpenAPI spec must document ${p}`);
  }

  // 2. Full Express Integration Server with MutableTestClock & Stores
  const config = createTestConfig();
  const logger = createLogger({ level: 'error', service: 'cp14-test', environment: 'test' });
  const testClock = new MutableTestClock('2026-11-12T06:30:00Z'); // 12:00 IST open hours
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const rbacStore = new InMemoryRbacStore();
  const customerStore = new InMemoryCustomerStore();
  const customerService = new CustomerService({
    customerStore,
    identityStore,
    rbacStore,
    logger,
    clock: testClock,
  });
  const restaurantStore = new InMemoryRestaurantStore();
  const outletStore = new InMemoryOutletStore();
  const outletService = new OutletService({
    restaurantStore,
    outletStore,
    rbacStore,
    logger,
    clock: testClock,
  });
  const catalogStore = new InMemoryCatalogStore();
  const cartStore = new InMemoryCartStore();
  const cartService = new CartService({
    cartStore,
    restaurantStore,
    catalogStore,
    logger,
    clock: testClock,
  });
  const pricingStore = new InMemoryPricingStore();
  const pricingService = new PricingService({
    pricingStore,
    cartService,
    customerService,
    restaurantStore,
    outletService,
    catalogStore,
    signingSecret: config.jwtAccessSecret,
    logger,
    clock: testClock,
  });

  const now = testClock.now();
  await restaurantStore.upsertOutlet(
    buildOutletRecord({
      outletId: 'out_arsalan',
      restaurantId: 'rest_arsalan',
      brandName: 'Arsalan',
      name: 'Park Circus',
      zoneId: 'central',
      locality: 'Park Circus',
      coordinates: [88.366, 22.543],
      cuisines: ['Mughlai', 'Biryani'],
      platformInspectionStatus: 'VERIFIED_CLEAN',
      publishedSafetyScore: 94,
      now,
    }),
  );
  await restaurantStore.upsertOutlet(
    buildOutletRecord({
      outletId: 'out_balaram',
      restaurantId: 'rest_balaram',
      brandName: 'Balaram Mullick',
      name: 'Bhowanipore',
      zoneId: 'south',
      locality: 'Bhowanipore',
      coordinates: [88.3485, 22.5318],
      cuisines: ['Bengali Mishti', 'Bakery'],
      platformInspectionStatus: 'VERIFIED_CLEAN',
      publishedSafetyScore: 96,
      now,
    }),
  );
  await restaurantStore.upsertOutlet(
    buildOutletRecord({
      outletId: 'out_suspended',
      restaurantId: 'rest_suspended',
      brandName: 'Hazard Kitchen',
      name: 'Salt Lake Suspended',
      zoneId: 'salt-lake',
      locality: 'Salt Lake',
      coordinates: [88.4317, 22.5806],
      cuisines: ['Rolls'],
      platformInspectionStatus: 'SUSPENDED',
      publishedSafetyScore: null,
      now,
    }),
  );

  // Menu items at Arsalan, Balaram & Suspended outlet
  await catalogStore.createMenuItem({
    itemId: 'dish_biryani',
    outletId: 'out_arsalan',
    restaurantId: 'rest_arsalan',
    categoryId: 'cat_biryani',
    title: 'Kolkata Royal Mutton Biryani',
    description: 'Slow-cooked dum biryani with saffron and tender mutton.',
    pricePaise: 32000,
    gstTaxSlab: 'RESTAURANT_5_PCT',
    dietaryType: 'NON_VEG',
    allergens: ['DAIRY'],
    allergenDisclosureConfirmed: true,
    imageUrl: null,
    isAvailable: true,
    dailyStockRemaining: 20,
    prepTimeMinutes: 20,
    variants: [
      {
        groupId: 'portion',
        name: 'Portion Size',
        required: true,
        minSelections: 1,
        maxSelections: 1,
        options: [
          {
            optionId: 'regular',
            label: 'Regular (1 pc)',
            priceDeltaPaise: 0,
            isDefault: true,
            isAvailable: true,
          },
          {
            optionId: 'special',
            label: 'Special (2 pcs)',
            priceDeltaPaise: 14000,
            isDefault: false,
            isAvailable: true,
          },
        ],
      },
    ],
    addonGroups: [
      {
        groupId: 'extras',
        name: 'Add-ons',
        minSelections: 0,
        maxSelections: 2,
        options: [
          {
            optionId: 'extra_aloo',
            label: 'Extra Roasted Aloo',
            pricePaise: 2000,
            dietaryType: 'PURE_VEG',
            allergens: [],
            isAvailable: true,
          },
        ],
      },
    ],
    createdByUserId: 'usr_seed_owner',
    updatedByUserId: 'usr_seed_owner',
    createdAt: now,
    updatedAt: now,
  });

  await catalogStore.createMenuItem({
    itemId: 'dish_shahi_cake',
    outletId: 'out_arsalan',
    restaurantId: 'rest_arsalan',
    categoryId: 'cat_desserts',
    title: 'Shahi Khoya Plum Cake',
    description: 'Rich slow-baked celebratory dessert cake.',
    pricePaise: 18000,
    gstTaxSlab: 'BAKERY_18_PCT',
    dietaryType: 'PURE_VEG',
    allergens: ['DAIRY', 'GLUTEN'],
    allergenDisclosureConfirmed: true,
    imageUrl: null,
    isAvailable: true,
    dailyStockRemaining: 15,
    prepTimeMinutes: 10,
    variants: [],
    addonGroups: [],
    createdByUserId: 'usr_seed_owner',
    updatedByUserId: 'usr_seed_owner',
    createdAt: now,
    updatedAt: now,
  });

  await catalogStore.createMenuItem({
    itemId: 'dish_rosogolla',
    outletId: 'out_balaram',
    restaurantId: 'rest_balaram',
    categoryId: 'cat_sweets',
    title: 'Baked Rosogolla Handi',
    description: 'Caramelized baked chhana rosogolla.',
    pricePaise: 18000,
    gstTaxSlab: 'RESTAURANT_5_PCT',
    dietaryType: 'PURE_VEG',
    allergens: ['DAIRY'],
    allergenDisclosureConfirmed: true,
    imageUrl: null,
    isAvailable: true,
    dailyStockRemaining: 25,
    prepTimeMinutes: 10,
    variants: [],
    addonGroups: [],
    createdByUserId: 'usr_seed_owner',
    updatedByUserId: 'usr_seed_owner',
    createdAt: now,
    updatedAt: now,
  });

  await catalogStore.createMenuItem({
    itemId: 'dish_suspended_roll',
    outletId: 'out_suspended',
    restaurantId: 'rest_suspended',
    categoryId: 'cat_rolls',
    title: 'Unsafe Suspended Roll',
    description: 'Blocked while outlet is suspended.',
    pricePaise: 20000,
    gstTaxSlab: 'RESTAURANT_5_PCT',
    dietaryType: 'NON_VEG',
    allergens: ['GLUTEN'],
    allergenDisclosureConfirmed: true,
    imageUrl: null,
    isAvailable: true,
    dailyStockRemaining: 10,
    prepTimeMinutes: 12,
    variants: [],
    addonGroups: [],
    createdByUserId: 'usr_seed_owner',
    updatedByUserId: 'usr_seed_owner',
    createdAt: now,
    updatedAt: now,
  });

  const app = createApp({
    config,
    logger,
    clock: testClock,
    identityService,
    identityStore,
    rbacStore,
    customerStore,
    customerService,
    restaurantStore,
    outletStore,
    outletService,
    catalogStore,
    cartStore,
    cartService,
    pricingStore,
    pricingService,
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    // Public coupons list works unauthenticated
    const publicCouponsRes = await apiJson(baseUrl, '/coupons/available');
    assert.equal(publicCouponsRes.status, 200);
    const couponCodes = publicCouponsRes.json.data.coupons.map((c) => c.code);
    assert.ok(couponCodes.includes('BHOJORA100'), 'BHOJORA100 pilot coupon must be public');
    assert.ok(couponCodes.includes('KOLKATA20'), 'KOLKATA20 pilot coupon must be public');

    // Unauthenticated requests blocked with 401
    assert.equal((await apiJson(baseUrl, '/cart')).status, 401);
    assert.equal(
      (
        await apiJson(baseUrl, '/checkout/quote', {
          method: 'POST',
          body: { coordinates: [88.3526, 22.5535] },
        })
      ).status,
      401,
    );

    const customerA = await registerCustomer(
      baseUrl,
      '+919830091401',
      'ananya-cp14@bhojora.in',
      'Ananya Chatterjee',
    );
    const customerB = await registerCustomer(
      baseUrl,
      '+919830091402',
      'rohit-cp14@bhojora.in',
      'Rohit Sen',
    );
    const riderUser = await registerCustomer(
      baseUrl,
      '+919830091403',
      'rider-cp14@bhojora.in',
      'Subham Rider',
    );
    await identityStore.updateUser(riderUser.userId, { roles: ['DELIVERY_PARTNER'] }, now);
    const riderToken = await loginUser(baseUrl, 'rider-cp14@bhojora.in');

    // Wrong RBAC role (DELIVERY_PARTNER) blocked with 403
    assert.equal((await apiJson(baseUrl, '/cart', { token: riderToken })).status, 403);
    assert.equal(
      (
        await apiJson(baseUrl, '/cart/items', {
          method: 'POST',
          token: riderToken,
          body: { outletId: 'out_arsalan', menuItemId: 'dish_biryani', quantity: 1 },
        })
      ).status,
      403,
    );

    // Suspended outlet blocked with 409 CRITICAL_VIOLATION_SUSPENDED
    const suspendedRes = await apiJson(baseUrl, '/cart/items', {
      method: 'POST',
      token: customerA.token,
      body: { outletId: 'out_suspended', menuItemId: 'dish_suspended_roll', quantity: 1 },
    });
    assert.equal(suspendedRes.status, 409);
    assert.equal(suspendedRes.json.error.code, 'CRITICAL_VIOLATION_SUSPENDED');

    // 3. Anti-tampering checks: client CANNOT pass pricePaise, unitPricePaise, totalPayablePaise, discountPaise, gstTaxPaise, deliveryFeePaise, signature
    for (const badField of [
      { pricePaise: 100 },
      { unitPricePaise: 100 },
      { priceAtAddPaise: 100 },
      { lineTotalPaise: 100 },
      { subtotalPaise: 100 },
    ]) {
      const tamperCartRes = await apiJson(baseUrl, '/cart/items', {
        method: 'POST',
        token: customerA.token,
        body: {
          outletId: 'out_arsalan',
          menuItemId: 'dish_biryani',
          quantity: 1,
          ...badField,
        },
      });
      assert.equal(
        tamperCartRes.status,
        400,
        `Client tamper field ${Object.keys(badField)[0]} must be rejected on /cart/items`,
      );
      assert.equal(tamperCartRes.json.error.code, 'VALIDATION_ERROR');
    }

    // Invalid variant option rejected cleanly
    const badOptionRes = await apiJson(baseUrl, '/cart/items', {
      method: 'POST',
      token: customerA.token,
      body: {
        outletId: 'out_arsalan',
        menuItemId: 'dish_biryani',
        quantity: 1,
        selectedVariants: [{ groupId: 'portion', optionId: 'nonexistent_variant' }],
      },
    });
    assert.equal(badOptionRes.status, 400);

    // 4. Add Arsalan Special Biryani (+14000) + Extra Aloo (+2000) => 32000 + 14000 + 2000 = 48000 paise (Rs 480)
    const addBiryaniRes = await apiJson(baseUrl, '/cart/items', {
      method: 'POST',
      token: customerA.token,
      body: {
        outletId: 'out_arsalan',
        menuItemId: 'dish_biryani',
        quantity: 1,
        selectedVariants: [{ groupId: 'portion', optionId: 'special' }],
        selectedAddons: [{ groupId: 'extras', optionId: 'extra_aloo' }],
      },
    });
    assert.equal(addBiryaniRes.status, 200);
    assert.equal(addBiryaniRes.json.data.cart.itemsSubtotalPaise, 48000);
    const biryaniCartItemId = addBiryaniRes.json.data.cart.items[0].cartItemId;

    // PATCH with tampered monetary field rejected
    const patchTamperRes = await apiJson(baseUrl, `/cart/items/${biryaniCartItemId}`, {
      method: 'PATCH',
      token: customerA.token,
      body: { quantity: 2, unitPricePaise: 500 },
    });
    assert.equal(patchTamperRes.status, 400);
    assert.equal(patchTamperRes.json.error.code, 'VALIDATION_ERROR');

    // 5. Single-outlet rule: adding Balaram item while Arsalan is in cart -> 409 SINGLE_OUTLET_CONFLICT
    const conflictRes = await apiJson(baseUrl, '/cart/items', {
      method: 'POST',
      token: customerA.token,
      body: {
        outletId: 'out_balaram',
        menuItemId: 'dish_rosogolla',
        quantity: 1,
      },
    });
    assert.equal(conflictRes.status, 409);
    assert.equal(conflictRes.json.error.code, 'CONFLICT');
    assert.ok(
      Array.isArray(conflictRes.json.error.details) &&
        conflictRes.json.error.details.some((d) => d.code === 'SINGLE_OUTLET_CONFLICT'),
      '409 response must carry SINGLE_OUTLET_CONFLICT detail code',
    );

    // Confirm replaceOutlet=true clears Arsalan and switches cleanly to Balaram
    const replaceRes = await apiJson(baseUrl, '/cart/items', {
      method: 'POST',
      token: customerA.token,
      body: {
        outletId: 'out_balaram',
        menuItemId: 'dish_rosogolla',
        quantity: 1,
        replaceOutlet: true,
      },
    });
    assert.equal(replaceRes.status, 200);
    assert.equal(replaceRes.json.data.cart.outletId, 'out_balaram');
    assert.equal(replaceRes.json.data.cart.itemsSubtotalPaise, 18000);

    // Switch back to Arsalan with Special Biryani (48000) + Bakery Shahi Cake (18000, 18% GST slab) => 66000 subtotal
    await apiJson(baseUrl, '/cart/items', {
      method: 'POST',
      token: customerA.token,
      body: {
        outletId: 'out_arsalan',
        menuItemId: 'dish_biryani',
        quantity: 1,
        replaceOutlet: true,
        selectedVariants: [{ groupId: 'portion', optionId: 'special' }],
        selectedAddons: [{ groupId: 'extras', optionId: 'extra_aloo' }],
      },
    });
    const addCakeRes = await apiJson(baseUrl, '/cart/items', {
      method: 'POST',
      token: customerA.token,
      body: {
        outletId: 'out_arsalan',
        menuItemId: 'dish_shahi_cake',
        quantity: 1,
      },
    });
    assert.equal(addCakeRes.status, 200);
    assert.equal(addCakeRes.json.data.cart.itemsSubtotalPaise, 66000);
    assert.equal(addCakeRes.json.data.cart.itemCount, 2);

    // 6. Anti-tampering on /checkout/quote
    for (const quoteTamper of [
      { totalPayablePaise: 100 },
      { discountPaise: 50000 },
      { gstTaxPaise: 0 },
      { deliveryFeePaise: 0 },
      { platformFeePaise: 0 },
      { signature: 'forged_sig' },
    ]) {
      const badQuoteRes = await apiJson(baseUrl, '/checkout/quote', {
        method: 'POST',
        token: customerA.token,
        body: {
          coordinates: [88.3526, 22.5535],
          ...quoteTamper,
        },
      });
      assert.equal(
        badQuoteRes.status,
        400,
        `/checkout/quote must reject tamper key ${Object.keys(quoteTamper)[0]}`,
      );
      assert.equal(badQuoteRes.json.error.code, 'VALIDATION_ERROR');
    }

    // 7. Authoritative quote without tip vs with Rs 30 tip: tip MUST NOT affect GST
    const baseQuoteRes = await apiJson(baseUrl, '/checkout/quote', {
      method: 'POST',
      token: customerA.token,
      body: {
        coordinates: [88.3526, 22.5535],
        couponCode: 'BHOJORA100',
        tipPaise: 0,
      },
    });
    assert.equal(baseQuoteRes.status, 200, JSON.stringify(baseQuoteRes.json));
    const baseQuote = baseQuoteRes.json.data.quote;

    const tippedQuoteRes = await apiJson(baseUrl, '/checkout/quote', {
      method: 'POST',
      token: customerA.token,
      body: {
        coordinates: [88.3526, 22.5535],
        couponCode: 'BHOJORA100',
        tipPaise: 3000,
      },
    });
    assert.equal(tippedQuoteRes.status, 200, JSON.stringify(tippedQuoteRes.json));
    const tippedQuote = tippedQuoteRes.json.data.quote;

    assert.equal(tippedQuote.pricingBreakdown.itemsSubtotalPaise, 66000);
    assert.equal(tippedQuote.pricingBreakdown.discountPaise, 10000);
    assert.equal(tippedQuote.pricingBreakdown.discountedSubtotalPaise, 56000);
    assert.equal(tippedQuote.pricingBreakdown.packagingChargePaise, 2000);
    assert.equal(tippedQuote.pricingBreakdown.platformFeePaise, 500);
    assert.equal(tippedQuote.pricingBreakdown.tipPaise, 3000);
    assert.equal(
      tippedQuote.pricingBreakdown.gstTaxPaise,
      baseQuote.pricingBreakdown.gstTaxPaise,
      'Delivery tip must remain strictly untaxed',
    );
    assert.equal(
      tippedQuote.pricingBreakdown.totalPayablePaise - baseQuote.pricingBreakdown.totalPayablePaise,
      3000,
      'Tip must add exact integer amount without compounding taxes',
    );
    assert.equal(
      tippedQuote.pricingBreakdown.cgstPaise + tippedQuote.pricingBreakdown.sgstPaise,
      tippedQuote.pricingBreakdown.gstTaxPaise,
    );
    assert.equal(tippedQuote.couponAllocation.couponCode, 'BHOJORA100');
    assert.equal(tippedQuote.couponAllocation.platformFundedPaise, 6000);
    assert.equal(tippedQuote.couponAllocation.restaurantFundedPaise, 4000);
    assert.equal(tippedQuote.ttlSeconds, 600);
    assert.equal(tippedQuote.remainingSeconds, 600);
    assert.equal(tippedQuote.signatureAlgorithm, 'HMAC-SHA256');
    assert.equal(tippedQuote.signature.length, 64);

    // Cross-customer IDOR read/verify rejected with 403 FORBIDDEN
    assert.equal(
      (
        await apiJson(baseUrl, `/checkout/quotes/${tippedQuote.quoteId}`, {
          token: customerB.token,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await apiJson(baseUrl, `/checkout/quotes/${tippedQuote.quoteId}/verify`, {
          method: 'POST',
          token: customerB.token,
        })
      ).status,
      403,
    );

    // Verify fails cleanly if expectedTotalPayablePaise mismatches, passes when matching
    const mismatchVerifyRes = await apiJson(
      baseUrl,
      `/checkout/quotes/${tippedQuote.quoteId}/verify`,
      {
        method: 'POST',
        token: customerA.token,
        body: { expectedTotalPayablePaise: tippedQuote.pricingBreakdown.totalPayablePaise - 100 },
      },
    );
    assert.equal(mismatchVerifyRes.status, 400);

    const okVerifyRes = await apiJson(baseUrl, `/checkout/quotes/${tippedQuote.quoteId}/verify`, {
      method: 'POST',
      token: customerA.token,
      body: { expectedTotalPayablePaise: tippedQuote.pricingBreakdown.totalPayablePaise },
    });
    assert.equal(okVerifyRes.status, 200);
    assert.equal(okVerifyRes.json.data.valid, true);

    // 8. Stored quote integrity tampering check -> 400 VALIDATION_ERROR
    const storedForTamper = await pricingStore.getQuoteById(baseQuote.quoteId);
    assert.ok(storedForTamper);
    await pricingStore.saveQuote({
      ...storedForTamper,
      pricingBreakdown: {
        ...storedForTamper.pricingBreakdown,
        totalPayablePaise: 100,
      },
    });
    const tamperedReadRes = await apiJson(baseUrl, `/checkout/quotes/${baseQuote.quoteId}`, {
      token: customerA.token,
    });
    assert.equal(tamperedReadRes.status, 400);
    assert.equal(tamperedReadRes.json.error.code, 'VALIDATION_ERROR');

    // 9. Per-user coupon redemption limit enforced
    await pricingService.recordCouponRedemption('BHOJORA100', customerA.userId);
    const repeatCouponRes = await apiJson(baseUrl, '/checkout/quote', {
      method: 'POST',
      token: customerA.token,
      body: {
        coordinates: [88.3526, 22.5535],
        couponCode: 'BHOJORA100',
        tipPaise: 0,
      },
    });
    assert.equal(repeatCouponRes.status, 409);

    // 10. Price drift detection & explicit acceptance flow
    const existingBiryani = await catalogStore.getMenuItemById('dish_biryani');
    await catalogStore.updateMenuItem('dish_biryani', {
      ...existingBiryani,
      pricePaise: 36000, // base increases +Rs 40 (32000 -> 36000)
      updatedAt: testClock.now(),
    });
    const driftedCartRes = await apiJson(baseUrl, '/cart', { token: customerA.token });
    assert.equal(driftedCartRes.status, 200);
    const driftedBiryani = driftedCartRes.json.data.cart.items.find(
      (i) => i.menuItemId === 'dish_biryani',
    );
    assert.equal(driftedBiryani.priceAtAddPaise, 48000);
    assert.equal(driftedBiryani.effectiveUnitPricePaise, 52000);
    assert.equal(driftedBiryani.currentPriceChanged, true);

    const driftQuoteRes = await apiJson(baseUrl, '/checkout/quote', {
      method: 'POST',
      token: customerA.token,
      body: {
        coordinates: [88.3526, 22.5535],
        couponCode: 'KOLKATA20',
        tipPaise: 2000,
      },
    });
    assert.equal(driftQuoteRes.status, 200);
    const driftQuote = driftQuoteRes.json.data.quote;
    assert.equal(driftQuote.priceDriftDetected, true);
    assert.equal(driftQuote.priceDriftWarnings.length, 1);
    assert.equal(driftQuote.pricingBreakdown.itemsSubtotalPaise, 70000); // 52000 + 18000

    // Verify refuses until customer explicitly accepts price drift
    const unacceptedVerifyRes = await apiJson(
      baseUrl,
      `/checkout/quotes/${driftQuote.quoteId}/verify`,
      { method: 'POST', token: customerA.token },
    );
    assert.equal(unacceptedVerifyRes.status, 409);
    assert.equal(unacceptedVerifyRes.json.error.code, 'ITEM_PRICE_CHANGED');

    const acceptedQuoteRes = await apiJson(baseUrl, '/checkout/quote', {
      method: 'POST',
      token: customerA.token,
      body: {
        coordinates: [88.3526, 22.5535],
        couponCode: 'KOLKATA20',
        tipPaise: 2000,
        acceptPriceChanges: true,
      },
    });
    assert.equal(acceptedQuoteRes.status, 200);
    assert.equal(acceptedQuoteRes.json.data.quote.priceDriftDetected, false);

    // 11. 600-second quote TTL expiry check via MutableTestClock
    testClock.advanceSeconds(601);
    const expiredQuoteGet = await apiJson(
      baseUrl,
      `/checkout/quotes/${acceptedQuoteRes.json.data.quote.quoteId}`,
      { token: customerA.token },
    );
    assert.equal(expiredQuoteGet.status, 200);
    assert.equal(expiredQuoteGet.json.data.quote.isExpired, true);
    assert.equal(expiredQuoteGet.json.data.quote.status, 'EXPIRED');
    assert.equal(expiredQuoteGet.json.data.quote.remainingSeconds, 0);

    const expiredVerifyRes = await apiJson(
      baseUrl,
      `/checkout/quotes/${acceptedQuoteRes.json.data.quote.quoteId}/verify`,
      { method: 'POST', token: customerA.token },
    );
    assert.equal(expiredVerifyRes.status, 409);
    assert.equal(expiredVerifyRes.json.error.code, 'CONFLICT');

    // Clear cart works cleanly
    const clearRes = await apiJson(baseUrl, '/cart', {
      method: 'DELETE',
      token: customerA.token,
    });
    assert.equal(clearRes.status, 200);
    assert.equal(clearRes.json.data.cart.itemCount, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // 12. Customer Web React source presence & anti-slop checks
  const cartDialogSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'client', 'customer-web', 'src', 'components', 'CartCheckoutDialog.tsx'),
    'utf8',
  );
  assert.ok(cartDialogSrc.includes('id="cartCheckoutModal"'));
  assert.ok(cartDialogSrc.includes('closedby="any"'));
  assert.ok(!cartDialogSrc.includes('role="dialog"'));

  const menuDialogSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'client', 'customer-web', 'src', 'components', 'OutletMenuDialog.tsx'),
    'utf8',
  );
  assert.ok(menuDialogSrc.includes('addToCartBtn-'));
  assert.ok(menuDialogSrc.includes('replaceCartConfirmBtn'));

  const headerSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'client', 'customer-web', 'src', 'components', 'Header.tsx'),
    'utf8',
  );
  assert.ok(headerSrc.includes('id="openCartModalBtn"'));

  const helpersSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'client', 'customer-web', 'src', 'lib', 'cartHelpers.ts'),
    'utf8',
  );
  assert.ok(helpersSrc.includes('computeIntegerPricingBreakdown'));
  assert.ok(helpersSrc.includes('BHOJORA100'));

  const cssSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'client', 'customer-web', 'src', 'styles', 'app.css'),
    'utf8',
  );
  assert.ok(cssSrc.includes('overscroll-behavior: contain'));
  assert.ok(cssSrc.includes('font-size: max(1rem, 1em)'));

  console.log('Checkpoint 14 Cart & Authoritative Pricing Verification PASSED cleanly.');
}

main().catch((error) => {
  console.error('Checkpoint 14 verification failed:', error);
  process.exit(1);
});
