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
const { InMemoryOutletStore } = require('../dist/modules/outlet/outlet.store.js');
const { OutletService } = require('../dist/modules/outlet/outlet.service.js');
const {
  InMemoryCatalogStore,
  createMongooseCatalogModels,
} = require('../dist/modules/catalog/catalog.store.js');
const {
  ALLERGEN_CODES: SERVER_ALLERGEN_CODES,
  ALLERGEN_LABELS: SERVER_ALLERGEN_LABELS,
  DIETARY_TYPES: SERVER_DIETARY_TYPES,
  DIETARY_LABELS: SERVER_DIETARY_LABELS,
  GST_TAX_SLABS: SERVER_GST_TAX_SLABS,
  formatInrFromPaise: serverFormatInrFromPaise,
} = require('../dist/modules/catalog/catalog.types.js');
const { CatalogService } = require('../dist/modules/catalog/catalog.service.js');

const REPO_ROOT = path.resolve(__dirname, '../..');
const TEST_PASSWORD = 'Bhojora#Catalog2026';

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
  advanceMinutes(mins) {
    this.current = new Date(this.current.getTime() + mins * 60_000);
  }
  now() {
    return new Date(this.current.getTime());
  }
}

async function createUserSession(baseUrl, phone, email, name) {
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

async function loginWithEmail(baseUrl, email) {
  const res = await apiJson(baseUrl, '/auth/login', {
    method: 'POST',
    body: { identifier: email, password: TEST_PASSWORD },
  });
  assert.equal(res.status, 200, `Login failed for ${email}: ${JSON.stringify(res.json)}`);
  return res.json.data.tokens.accessToken;
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
        legalBusinessName: `${brandName} Foods Pvt Ltd`,
        ownerFullName: 'Subhojit Sen',
        ownerPhone: '+919830011223',
        ownerBusinessEmail: `menu+${brandName.toLowerCase().replace(/[^a-z]/g, '')}@bhojora.in`,
        panNumber: 'ABCDE1234F',
        gstin: '19ABCDE1234F1Z5',
        fssaiLicenseNumber,
        fssaiExpiresOn: '2027-12-31',
      },
      outletSetup: {
        brandName,
        outletName,
        streetAddress: '62 Park Circus Connector',
        landmark: 'Near Quest Mall',
        locality: 'Park Circus',
        wardOrBorough: 'KMC Ward 65',
        postalCode: '700017',
        zoneId,
        coordinates,
        cuisines: ['Mughlai', 'Biryani'],
        prepTimeMinutes: 25,
      },
      bankPayout: {
        accountHolderName: `${brandName} Foods Pvt Ltd`,
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
        reason: 'Statutory FSSAI & compliance documents verified for catalog launch',
        fssaiVerifiedNote: 'WB FSSAI active',
        documentReviews: uploadedDocIds.map((documentId) => ({
          documentId,
          verificationStatus: 'VERIFIED',
          note: 'KYC verified',
        })),
      },
    },
  );
  assert.equal(reviewRes.status, 200);
  return reviewRes.json.data.application;
}

async function runTests() {
  console.log('--- Starting Checkpoint 12 Catalog & Menu Verification Suite ---');

  // 1. Server baseline, shared contracts, DB indexes & OpenAPI verification
  const sharedCatalog = await import('../../client/shared/dist/contracts/catalog.js');
  assert.ok(Number(SERVER_BASELINE.checkpoint) >= 12);
  assert.equal(SERVER_BASELINE.currencyUnit, 'paise');
  assert.deepEqual([...sharedCatalog.DIETARY_TYPES], [...SERVER_DIETARY_TYPES]);
  assert.deepEqual([...sharedCatalog.ALLERGEN_CODES], [...SERVER_ALLERGEN_CODES]);
  assert.deepEqual([...sharedCatalog.GST_TAX_SLABS], [...SERVER_GST_TAX_SLABS]);
  assert.deepEqual(sharedCatalog.DIETARY_LABELS, SERVER_DIETARY_LABELS);
  assert.deepEqual(sharedCatalog.ALLERGEN_LABELS, SERVER_ALLERGEN_LABELS);
  assert.equal(serverFormatInrFromPaise(38000), '₹380');
  assert.equal(sharedCatalog.formatInrFromPaise(38000), '₹380');
  assert.equal(sharedCatalog.formatInrFromPaise(38050), '₹380.50');

  const indexNames = new Set(INITIAL_DATABASE_INDEXES.map((spec) => spec.options.name));
  for (const requiredIdx of [
    'idx_menu_categories_outlet_sort',
    'idx_menu_categories_id_unique',
    'idx_menu_items_id_unique',
    'idx_menu_items_outlet_avail_category',
    'idx_item_customizations_item_unique',
    'idx_inventory_records_outlet_item_unique',
  ]) {
    assert.ok(indexNames.has(requiredIdx), `Missing declarative catalog index ${requiredIdx}`);
  }

  const indexTsSrc = fs.readFileSync(path.join(REPO_ROOT, 'server', 'src', 'index.ts'), 'utf8');
  assert.ok(
    indexTsSrc.includes('new MongooseCatalogStore(mongoConnection)'),
    'server/src/index.ts must bind MongooseCatalogStore(mongoConnection)',
  );
  assert.ok(
    indexTsSrc.includes('new CatalogService('),
    'server/src/index.ts must initialize CatalogService',
  );

  const openapi = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, 'docs', '01-CORE-PLANNING-DESIGN', 'openapi.json'),
      'utf8',
    ),
  );
  for (const apiPath of [
    '/outlets/{id}/menu',
    '/restaurant/outlets/{outletId}/menu',
    '/restaurant/menu/categories',
    '/restaurant/menu/categories/{categoryId}',
    '/restaurant/menu/items',
    '/restaurant/menu/items/{itemId}',
    '/restaurant/menu/items/{itemId}/availability',
  ]) {
    assert.ok(openapi.paths[apiPath], `openapi.json missing CP12 path ${apiPath}`);
  }

  // 2. Mongoose schema validation for integer paise & dietary enums
  const catalogModels = createMongooseCatalogModels(mongoose.connection);
  const floatItemDoc = new catalogModels.itemModel({
    itemId: 'item_float_bad',
    outletId: 'out_test',
    restaurantId: 'rest_test',
    categoryId: 'cat_test',
    title: 'Float Price Dish',
    pricePaise: 199.5,
    dietaryType: 'PURE_VEG',
    allergens: ['DAIRY'],
    allergenDisclosureConfirmed: true,
    createdByUserId: 'usr_1',
    updatedByUserId: 'usr_1',
  });
  await assert.rejects(
    () => floatItemDoc.validate(),
    /INR paise/i,
    'Mongoose menu_items schema must reject fractional paise prices (ADR-003)',
  );

  const negativeItemDoc = new catalogModels.itemModel({
    itemId: 'item_neg_bad',
    outletId: 'out_test',
    restaurantId: 'rest_test',
    categoryId: 'cat_test',
    title: 'Negative Price Dish',
    pricePaise: -500,
    dietaryType: 'PURE_VEG',
    allergens: [],
    allergenDisclosureConfirmed: true,
    createdByUserId: 'usr_1',
    updatedByUserId: 'usr_1',
  });
  await assert.rejects(
    () => negativeItemDoc.validate(),
    /INR paise/i,
    'Mongoose menu_items schema must reject negative paise prices',
  );

  const floatAddonDoc = new catalogModels.itemModel({
    itemId: 'item_addon_float',
    outletId: 'out_test',
    restaurantId: 'rest_test',
    categoryId: 'cat_test',
    title: 'Bad Addon Dish',
    pricePaise: 25000,
    dietaryType: 'NON_VEG',
    allergens: ['DAIRY'],
    allergenDisclosureConfirmed: true,
    addonGroups: [
      {
        groupId: 'grp_1',
        name: 'Extras',
        minSelections: 0,
        maxSelections: 2,
        options: [
          {
            optionId: 'opt_1',
            label: 'Bad Extra',
            pricePaise: 15.25,
            dietaryType: 'PURE_VEG',
            allergens: [],
            isAvailable: true,
          },
        ],
      },
    ],
    createdByUserId: 'usr_1',
    updatedByUserId: 'usr_1',
  });
  await assert.rejects(
    () => floatAddonDoc.validate(),
    /INR paise/i,
    'Mongoose schema must enforce integer paise inside add-on options too',
  );

  // 3. Full HTTP integration tests
  const config = validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4012',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_test_cp12',
      REDIS_URL: 'redis://127.0.0.1:6379/0',
      JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long-cp12',
      JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long-cp12',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    },
    { serviceName: 'bhojora-api-cp12-test', serviceVersion: '0.1.0' },
  );
  const logger = createLogger({ level: 'error', service: 'cp12-test', environment: 'test' });
  const testClock = new MutableTestClock('2026-11-12T06:30:00Z');
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
  const catalogStore = new InMemoryCatalogStore();
  const catalogService = new CatalogService({
    catalogStore,
    restaurantStore,
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
    catalogStore,
    catalogService,
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    // Admin MFA setup
    const adminUser = await createUserSession(
      baseUrl,
      '+919830099012',
      'ops-cp12@bhojora.in',
      'Riya Ops Admin',
    );
    await identityStore.updateUser(
      adminUser.userId,
      { roles: ['OPS_ADMIN', 'CUSTOMER'], mfaEnabled: true },
      new Date(),
    );
    const adminToken = await loginWithEmail(baseUrl, 'ops-cp12@bhojora.in');
    const mfaSend = await apiJson(baseUrl, '/auth/mfa/send', { method: 'POST', token: adminToken });
    const mfaMsg = otpAdapter.getLatestMessage();
    await apiJson(baseUrl, '/auth/mfa/verify', {
      method: 'POST',
      token: adminToken,
      body: { challengeId: mfaSend.json.data.challengeId, code: mfaMsg.code },
    });

    // Partner A (Arsalan Park Circus) & Partner B (Balaram Ballygunge)
    const partnerA = await createUserSession(
      baseUrl,
      '+919830011223',
      'arsalan-owner@bhojora.in',
      'Arsalan Owner',
    );
    const partnerB = await createUserSession(
      baseUrl,
      '+919830044556',
      'balaram-owner@bhojora.in',
      'Balaram Owner',
    );
    const kitchenStaffA = await createUserSession(
      baseUrl,
      '+919830077889',
      'kitchen-staff@bhojora.in',
      'Kitchen Line Cook',
    );

    const appA = await onboardAndApproveOutlet({
      baseUrl,
      partnerToken: partnerA.token,
      adminToken,
      fssaiLicenseNumber: '12826019000331',
      brandName: 'Arsalan',
      outletName: 'Park Circus Flagship',
      zoneId: 'central',
      coordinates: [88.3665, 22.5432],
    });
    const appB = await onboardAndApproveOutlet({
      baseUrl,
      partnerToken: partnerB.token,
      adminToken,
      fssaiLicenseNumber: '12826019000442',
      brandName: 'Balaram Heritage',
      outletName: 'Ballygunge Sweets',
      zoneId: 'south',
      coordinates: [88.3665, 22.5262],
    });

    // Grant KITCHEN_STAFF on Outlet A (should NOT have restaurant:menu:manage)
    await identityStore.updateUser(
      kitchenStaffA.userId,
      { roles: ['KITCHEN_STAFF', 'CUSTOMER'] },
      new Date(),
    );
    await rbacStore.upsertMembership({
      userId: kitchenStaffA.userId,
      restaurantId: appA.restaurantId,
      outletId: appA.outletId,
      role: 'KITCHEN_STAFF',
      status: 'ACTIVE',
      grantedByUserId: partnerA.userId,
      now: testClock.now(),
    });

    const ownerAToken = await loginWithEmail(baseUrl, 'arsalan-owner@bhojora.in');
    const ownerBToken = await loginWithEmail(baseUrl, 'balaram-owner@bhojora.in');
    const staffAToken = await loginWithEmail(baseUrl, 'kitchen-staff@bhojora.in');

    const ownerHeaders = { 'X-Bhojora-Active-Role': 'RESTAURANT_OWNER' };
    const staffHeaders = { 'X-Bhojora-Active-Role': 'KITCHEN_STAFF' };

    // KITCHEN_STAFF cannot manage catalog pricing/items
    const staffDenyRes = await apiJson(baseUrl, '/restaurant/menu/categories', {
      method: 'POST',
      token: staffAToken,
      headers: staffHeaders,
      body: { outletId: appA.outletId, name: 'Biryani', sortOrder: 1 },
    });
    assert.equal(staffDenyRes.status, 403, 'KITCHEN_STAFF must be denied restaurant:menu:manage');

    // Partner A creates Biryani & Veg Sides categories
    const catBiryaniRes = await apiJson(baseUrl, '/restaurant/menu/categories', {
      method: 'POST',
      token: ownerAToken,
      headers: ownerHeaders,
      body: {
        outletId: appA.outletId,
        name: 'Kolkata Royal Biryani',
        description: 'Slow-cooked dum pukht biryanis sealed in brass handis',
        sortOrder: 1,
      },
    });
    assert.equal(catBiryaniRes.status, 201);
    const catBiryaniId = catBiryaniRes.json.data.category.categoryId;

    const catVegRes = await apiJson(baseUrl, '/restaurant/menu/categories', {
      method: 'POST',
      token: ownerAToken,
      headers: ownerHeaders,
      body: {
        outletId: appA.outletId,
        name: 'Shahi Vegetarian & Desserts',
        sortOrder: 2,
      },
    });
    assert.equal(catVegRes.status, 201);
    const catVegId = catVegRes.json.data.category.categoryId;

    // Reject float paise, missing allergen confirmation, and unsafe/compliance image URLs
    const floatPriceRes = await apiJson(baseUrl, '/restaurant/menu/items', {
      method: 'POST',
      token: ownerAToken,
      headers: ownerHeaders,
      body: {
        outletId: appA.outletId,
        categoryId: catBiryaniId,
        title: 'Bad Float Dish',
        pricePaise: 380.25,
        dietaryType: 'NON_VEG',
        allergens: ['DAIRY'],
        allergenDisclosureConfirmed: true,
      },
    });
    assert.equal(floatPriceRes.status, 400);

    const unconfirmedAllergenRes = await apiJson(baseUrl, '/restaurant/menu/items', {
      method: 'POST',
      token: ownerAToken,
      headers: ownerHeaders,
      body: {
        outletId: appA.outletId,
        categoryId: catBiryaniId,
        title: 'Unconfirmed Allergen Dish',
        pricePaise: 24000,
        dietaryType: 'PURE_VEG',
        allergens: [],
        allergenDisclosureConfirmed: false,
      },
    });
    assert.equal(unconfirmedAllergenRes.status, 400);

    const unsafeImageRes = await apiJson(baseUrl, '/restaurant/menu/items', {
      method: 'POST',
      token: ownerAToken,
      headers: ownerHeaders,
      body: {
        outletId: appA.outletId,
        categoryId: catBiryaniId,
        title: 'XSS Dish Image',
        pricePaise: 25000,
        dietaryType: 'PURE_VEG',
        allergens: [],
        allergenDisclosureConfirmed: true,
        imageUrl: 'javascript:alert(1)',
      },
    });
    assert.equal(unsafeImageRes.status, 400);

    const privatePathRes = await apiJson(baseUrl, '/restaurant/menu/items', {
      method: 'POST',
      token: ownerAToken,
      headers: ownerHeaders,
      body: {
        outletId: appA.outletId,
        categoryId: catBiryaniId,
        title: 'Private Compliance Leak Attempt',
        pricePaise: 25000,
        dietaryType: 'PURE_VEG',
        allergens: [],
        allergenDisclosureConfirmed: true,
        imageUrl: 'https://cdn.bhojora.in/private/compliance/fssai.pdf',
      },
    });
    assert.equal(privatePathRes.status, 400);

    // Create Story F03.1 Biryani item in integer paise + variants + add-ons + labeled allergens
    testClock.advanceMinutes(5);
    const biryaniRes = await apiJson(baseUrl, '/restaurant/menu/items', {
      method: 'POST',
      token: ownerAToken,
      headers: ownerHeaders,
      body: {
        outletId: appA.outletId,
        categoryId: catBiryaniId,
        title: 'Kolkata Mutton Biryani',
        description: 'Long-grain basmati layered with tender mutton, saffron ghee, and potato.',
        pricePaise: 38000,
        gstTaxSlab: 'RESTAURANT_5_PCT',
        dietaryType: 'NON_VEG',
        allergens: ['DAIRY', 'EGG', 'DAIRY'],
        allergenDisclosureConfirmed: true,
        imageUrl: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=600',
        isAvailable: true,
        dailyStockRemaining: 40,
        variants: [
          {
            name: 'Handi Size',
            required: true,
            minSelections: 1,
            maxSelections: 1,
            options: [
              { label: 'Single', priceDeltaPaise: 0, isDefault: true, isAvailable: true },
              { label: 'Special', priceDeltaPaise: 14000, isDefault: false, isAvailable: true },
            ],
          },
        ],
        addonGroups: [
          {
            name: 'Extra Piece',
            minSelections: 0,
            maxSelections: 2,
            options: [
              {
                label: 'Aloo (+₹20)',
                pricePaise: 2000,
                dietaryType: 'PURE_VEG',
                allergens: [],
                isAvailable: true,
              },
              {
                label: 'Boiled Egg (+₹15)',
                pricePaise: 1500,
                dietaryType: 'EGG',
                allergens: ['EGG'],
                isAvailable: true,
              },
            ],
          },
        ],
      },
    });
    assert.equal(biryaniRes.status, 201, `Item create failed: ${JSON.stringify(biryaniRes.json)}`);
    const biryaniItem = biryaniRes.json.data.item;
    assert.equal(biryaniItem.pricePaise, 38000);
    assert.equal(biryaniItem.formattedPriceInr, '₹380');
    assert.equal(biryaniItem.dietaryBadgeLabel, 'Non-Veg');
    assert.deepEqual(biryaniItem.allergens, ['DAIRY', 'EGG']);
    assert.deepEqual(biryaniItem.allergenLabels, ['Contains Dairy', 'Contains Egg']);
    assert.equal(biryaniItem.variants[0].options[1].priceDeltaPaise, 14000);
    assert.equal(biryaniItem.addonGroups[0].options[0].pricePaise, 2000);

    // Create Pure Veg dessert without Egg allergen
    const firniRes = await apiJson(baseUrl, '/restaurant/menu/items', {
      method: 'POST',
      token: ownerAToken,
      headers: ownerHeaders,
      body: {
        outletId: appA.outletId,
        categoryId: catVegId,
        title: 'Matka Shahi Firni',
        pricePaise: 12000,
        dietaryType: 'PURE_VEG',
        allergens: ['DAIRY'],
        allergenDisclosureConfirmed: true,
        isAvailable: true,
      },
    });
    assert.equal(firniRes.status, 201);
    const firniId = firniRes.json.data.item.itemId;

    // Update price & availability (both audited)
    testClock.advanceMinutes(3);
    const patchFirniRes = await apiJson(baseUrl, `/restaurant/menu/items/${firniId}`, {
      method: 'PATCH',
      token: ownerAToken,
      headers: ownerHeaders,
      body: {
        pricePaise: 13500,
        allergens: ['DAIRY', 'TREE_NUTS'],
        allergenDisclosureConfirmed: true,
      },
    });
    assert.equal(patchFirniRes.status, 200);
    assert.equal(patchFirniRes.json.data.item.pricePaise, 13500);
    assert.equal(patchFirniRes.json.data.item.formattedPriceInr, '₹135');
    assert.deepEqual(patchFirniRes.json.data.item.allergenLabels, [
      'Contains Dairy',
      'Contains Tree Nuts',
    ]);

    const stockOffRes = await apiJson(baseUrl, `/restaurant/menu/items/${firniId}/availability`, {
      method: 'PATCH',
      token: ownerAToken,
      headers: ownerHeaders,
      body: { isAvailable: false, dailyStockRemaining: 0, reason: 'Evening batch sold out' },
    });
    assert.equal(stockOffRes.status, 200);
    assert.equal(stockOffRes.json.data.item.isAvailable, false);

    // Cross-tenant IDOR check: Partner B cannot mutate Partner A category/item/stock
    const idorPatchItem = await apiJson(baseUrl, `/restaurant/menu/items/${firniId}`, {
      method: 'PATCH',
      token: ownerBToken,
      headers: ownerHeaders,
      body: { pricePaise: 100 },
    });
    assert.equal(idorPatchItem.status, 403);

    const idorCatCreate = await apiJson(baseUrl, '/restaurant/menu/categories', {
      method: 'POST',
      token: ownerBToken,
      headers: ownerHeaders,
      body: { outletId: appA.outletId, name: 'Hijacked Category' },
    });
    assert.equal(idorCatCreate.status, 403);

    // Verify partner menu endpoint returns scoped audits + excludes Partner B
    const partnerBMenuCat = await apiJson(baseUrl, '/restaurant/menu/categories', {
      method: 'POST',
      token: ownerBToken,
      headers: ownerHeaders,
      body: { outletId: appB.outletId, name: 'Mishti Doi Specials' },
    });
    assert.equal(partnerBMenuCat.status, 201);

    const partnerMenuRes = await apiJson(baseUrl, `/restaurant/outlets/${appA.outletId}/menu`, {
      token: ownerAToken,
      headers: ownerHeaders,
    });
    assert.equal(partnerMenuRes.status, 200);
    assert.equal(partnerMenuRes.json.data.catalog.items.length, 2);
    const auditActions = partnerMenuRes.json.data.audits.map((a) => a.action);
    assert.ok(auditActions.includes('catalog.category.created'));
    assert.ok(auditActions.includes('catalog.item.created'));
    assert.ok(auditActions.includes('catalog.item.price.updated'));
    assert.ok(auditActions.includes('catalog.item.availability.updated'));
    assert.ok(
      partnerMenuRes.json.data.audits.every(
        (a) =>
          a.resourceId === appA.outletId ||
          a.resourceId === catBiryaniId ||
          a.resourceId === catVegId ||
          a.resourceId === biryaniItem.itemId ||
          a.resourceId === firniId,
      ),
      'Partner audit trail must strictly isolate to current outlet resources',
    );

    const allAuditLogs = await rbacStore.listAuditLogs(100);
    assert.ok(
      allAuditLogs.some(
        (entry) =>
          entry.outcome === 'DENIED' &&
          entry.actorId === partnerB.userId &&
          entry.resourceId === firniId,
      ),
      'Denied cross-tenant catalog mutation must record DENIED audit event',
    );

    // Public Tier-1 menu endpoint + filters
    const publicMenuRes = await apiJson(baseUrl, `/outlets/${appA.outletId}/menu`);
    assert.equal(publicMenuRes.status, 200);
    assert.equal(publicMenuRes.json.data.catalog.currency, 'INR');
    assert.equal(publicMenuRes.json.data.catalog.priceUnit, 'paise');
    assert.equal(publicMenuRes.json.data.catalog.items.length, 2);
    assert.equal(publicMenuRes.json.data.catalog.availableItems, 1);

    const publicVegOnly = await apiJson(baseUrl, `/outlets/${appA.outletId}/menu?dietary=PURE_VEG`);
    assert.equal(publicVegOnly.status, 200);
    assert.equal(publicVegOnly.json.data.catalog.items.length, 1);
    assert.equal(publicVegOnly.json.data.catalog.items[0].title, 'Matka Shahi Firni');

    const publicExcludeEgg = await apiJson(
      baseUrl,
      `/outlets/${appA.outletId}/menu?excludeAllergen=EGG`,
    );
    assert.equal(publicExcludeEgg.status, 200);
    assert.equal(publicExcludeEgg.json.data.catalog.items.length, 1);
    assert.equal(publicExcludeEgg.json.data.catalog.items[0].itemId, firniId);

    const publicAvailOnly = await apiJson(
      baseUrl,
      `/outlets/${appA.outletId}/menu?availableOnly=true`,
    );
    assert.equal(publicAvailOnly.status, 200);
    assert.equal(publicAvailOnly.json.data.catalog.items.length, 1);
    assert.equal(publicAvailOnly.json.data.catalog.items[0].itemId, biryaniItem.itemId);

    // Confirm React component integration files exist and include required allergen/paise/dietary UI contracts
    const customerMenuDlgSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'client', 'customer-web', 'src', 'components', 'OutletMenuDialog.tsx'),
      'utf8',
    );
    const partnerCatalogPanelSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'client', 'restaurant-web', 'src', 'components', 'MenuCatalogPanel.tsx'),
      'utf8',
    );
    assert.ok(customerMenuDlgSrc.includes('DietaryBadge'));
    assert.ok(customerMenuDlgSrc.includes('formatInrFromPaise'));
    assert.ok(customerMenuDlgSrc.includes('ALLERGEN_LABELS'));
    assert.ok(partnerCatalogPanelSrc.includes('pricePaise'));
    assert.ok(partnerCatalogPanelSrc.includes('allergenDisclosureConfirmed'));
    assert.ok(partnerCatalogPanelSrc.includes('X-Bhojora-Active-Role'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('Checkpoint 12 Catalog & Menu Verification PASSED cleanly.');
}

void runTests().catch((error) => {
  console.error('Checkpoint 12 verification failed:', error);
  process.exit(1);
});
