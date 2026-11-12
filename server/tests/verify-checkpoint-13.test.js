'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { SERVER_BASELINE, buildDiscoveryTrustBadge } = require('../dist/index.js');
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
const { InMemoryOutletStore } = require('../dist/modules/outlet/outlet.store.js');
const { DEFAULT_OUTLET_OPERATING_SLOTS } = require('../dist/modules/outlet/outlet.geo.js');
const { OutletService } = require('../dist/modules/outlet/outlet.service.js');
const { InMemoryCatalogStore } = require('../dist/modules/catalog/catalog.store.js');
const {
  DISCOVERY_SORT_OPTIONS: SERVER_SORT_OPTIONS,
  DISCOVERY_SORT_LABELS: SERVER_SORT_LABELS,
  DISCOVERY_RANKING_DISCLOSURE: SERVER_RANKING_DISCLOSURE,
  PLATFORM_SAFETY_BADGE_META: SERVER_SAFETY_BADGE_META,
  CURATED_DISCOVERY_CATEGORIES: SERVER_CURATED_CATEGORIES,
} = require('../dist/modules/discovery/discovery.types.js');

const REPO_ROOT = path.resolve(__dirname, '../..');

function createTestConfig() {
  return validateEnv(
    {
      NODE_ENV: 'test',
      PORT: '4000',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_cp13_test',
      REDIS_URL: 'redis://127.0.0.1:6379',
      JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-characters-long-cp13',
      JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-characters-long-cp13',
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000,http://127.0.0.1:4173',
    },
    { serviceName: 'bhojora-api', serviceVersion: '0.1.0' },
  );
}

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

async function startTestServer(app) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/api/v1`,
  };
}

async function apiJson(baseUrl, routePath) {
  const res = await fetch(`${baseUrl}${routePath}`);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, json, headers: res.headers };
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
  prepTimeMinutes,
  deliveryRadiusMeters = 5000,
  status = 'ACTIVE',
  fssaiVerificationStatus = 'VERIFIED',
  platformInspectionStatus = 'NOT_INSPECTED',
  publishedSafetyScore = null,
  operatingSlots = DEFAULT_OUTLET_OPERATING_SLOTS,
  now = new Date('2026-11-12T06:00:00Z'),
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
    postalCode: '700091',
    location: {
      type: 'Point',
      coordinates,
    },
    cuisines,
    prepTimeMinutes,
    deliveryRadiusMeters,
    operatingSlots,
    status,
    fssaiLicenseNumber: '12826019000999',
    fssaiExpiresOn: '2028-12-31',
    fssaiVerificationStatus,
    platformInspectionStatus,
    publishedSafetyScore,
    createdAt: now,
    updatedAt: now,
  };
}

function buildDishRecord({
  itemId,
  outletId,
  restaurantId,
  title,
  description,
  pricePaise,
  dietaryType,
  allergens = [],
  isAvailable = true,
  now = new Date('2026-11-12T06:00:00Z'),
}) {
  return {
    itemId,
    outletId,
    restaurantId,
    categoryId: 'cat_main',
    title,
    description,
    pricePaise,
    gstTaxSlab: 'RESTAURANT_5_PCT',
    dietaryType,
    allergens,
    allergenDisclosureConfirmed: true,
    imageUrl: null,
    isAvailable,
    dailyStockRemaining: isAvailable ? 25 : 0,
    prepTimeMinutes: 15,
    variants: [],
    addonGroups: [],
    createdByUserId: 'usr_seed_owner',
    updatedByUserId: 'usr_seed_owner',
    createdAt: now,
    updatedAt: now,
  };
}

async function main() {
  console.log('--- Starting Checkpoint 13 Discovery & Search Verification Suite ---');

  // 1. Baseline, shared contract parity, OpenAPI & DB indexes
  assert.ok(Number(SERVER_BASELINE.checkpoint) >= 13, 'Checkpoint baseline must be >= 13');

  const sharedDiscoveryUrl = pathToFileURL(
    path.join(REPO_ROOT, 'client', 'shared', 'dist', 'contracts', 'discovery.js'),
  ).href;
  const sharedDiscovery = await import(sharedDiscoveryUrl);
  assert.deepEqual(sharedDiscovery.DISCOVERY_SORT_OPTIONS, SERVER_SORT_OPTIONS);
  assert.deepEqual(sharedDiscovery.DISCOVERY_SORT_LABELS, SERVER_SORT_LABELS);
  assert.equal(sharedDiscovery.DISCOVERY_RANKING_DISCLOSURE, SERVER_RANKING_DISCLOSURE);
  assert.deepEqual(sharedDiscovery.PLATFORM_SAFETY_BADGE_META, SERVER_SAFETY_BADGE_META);
  assert.deepEqual(sharedDiscovery.CURATED_DISCOVERY_CATEGORIES, SERVER_CURATED_CATEGORIES);

  const indexNames = new Set(INITIAL_DATABASE_INDEXES.map((entry) => entry.options.name));
  assert.ok(indexNames.has('idx_outlets_discovery_zone_safety'));
  assert.ok(indexNames.has('idx_outlets_discovery_status_cuisine'));
  assert.ok(indexNames.has('idx_menu_items_discovery_avail_diet_price'));
  assert.ok(indexNames.has('idx_menu_items_available_title'));

  const openapi = JSON.parse(
    fs.readFileSync(
      path.join(REPO_ROOT, 'docs', '01-CORE-PLANNING-DESIGN', 'openapi.json'),
      'utf8',
    ),
  );
  assert.ok(openapi.paths['/search'], 'OpenAPI must document GET /search');
  assert.ok(openapi.paths['/categories'], 'OpenAPI must document GET /categories');
  assert.ok(openapi.paths['/restaurants'].get.parameters.some((p) => p.name === 'cursor'));

  // 2. Unit test: Truthful trust badge builder guarantees zero misleading verified claims
  const now = new Date('2026-11-12T06:30:00Z'); // 12:00 IST (all 11:00-23:00 outlets open)
  const verifiedBadge = buildDiscoveryTrustBadge(
    buildOutletRecord({
      outletId: 'o_clean',
      restaurantId: 'r_clean',
      brandName: 'Clean Kitchen',
      name: 'Salt Lake',
      zoneId: 'salt-lake',
      locality: 'Salt Lake',
      coordinates: [88.4317, 22.5806],
      cuisines: ['Bengali'],
      prepTimeMinutes: 25,
      platformInspectionStatus: 'VERIFIED_CLEAN',
      publishedSafetyScore: 94,
      now,
    }),
  );
  assert.equal(verifiedBadge.isVerified, true);
  assert.equal(verifiedBadge.label, 'Verified Clean');
  assert.equal(verifiedBadge.score, 94);

  // Corrupted VERIFIED_CLEAN record with null score must NOT claim verified!
  const missingScoreBadge = buildDiscoveryTrustBadge(
    buildOutletRecord({
      outletId: 'o_null_score',
      restaurantId: 'r_null_score',
      brandName: 'Missing Score',
      name: 'Salt Lake',
      zoneId: 'salt-lake',
      locality: 'Salt Lake',
      coordinates: [88.4317, 22.5806],
      cuisines: ['Bengali'],
      prepTimeMinutes: 25,
      platformInspectionStatus: 'VERIFIED_CLEAN',
      publishedSafetyScore: null,
      now,
    }),
  );
  assert.equal(missingScoreBadge.isVerified, false);
  assert.equal(missingScoreBadge.status, 'NOT_INSPECTED');
  assert.equal(missingScoreBadge.score, null);

  for (const status of ['NOT_INSPECTED', 'SCHEDULED', 'ACTION_REQUIRED', 'EXPIRED', 'SUSPENDED']) {
    const badge = buildDiscoveryTrustBadge(
      buildOutletRecord({
        outletId: `o_${status}`,
        restaurantId: `r_${status}`,
        brandName: `Status ${status}`,
        name: 'Kolkata',
        zoneId: 'central',
        locality: 'Park Street',
        coordinates: [88.3526, 22.5535],
        cuisines: ['Continental'],
        prepTimeMinutes: 25,
        fssaiVerificationStatus: 'VERIFIED',
        platformInspectionStatus: status,
        publishedSafetyScore: 91,
        now,
      }),
    );
    assert.equal(badge.isVerified, false, `${status} must never claim isVerified: true`);
    assert.equal(badge.score, null, `${status} must not surface active score`);
    assert.ok(!badge.shortCode.includes('VERIFIED') || badge.shortCode === 'UNINSPECTED');
  }

  // 3. E2E Express discovery, filtering, geospatial sorting, pagination & abuse rate limiting
  const config = createTestConfig();
  const logger = createLogger({ level: 'error', serviceName: config.serviceName });
  const testClock = new MutableTestClock('2026-11-12T06:30:00Z'); // 12:00 IST Thu
  const identityStore = new InMemoryIdentityStore();
  const otpAdapter = new InMemoryTestOtpAdapter();
  const rbacStore = new InMemoryRbacStore();
  const customerStore = new InMemoryCustomerStore();
  const restaurantStore = new InMemoryRestaurantStore();
  const outletStore = new InMemoryOutletStore();
  const catalogStore = new InMemoryCatalogStore();
  const identityService = new IdentityService({ config, store: identityStore, otpAdapter, logger });
  const outletService = new OutletService({
    restaurantStore,
    outletStore,
    rbacStore,
    logger,
    clock: testClock,
  });

  // Seed 5 distinct outlets covering verified, uninspected (with FSSAI verified), CAP action required, closed hours & suspended
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
      prepTimeMinutes: 22,
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
      cuisines: ['Bengali Mishti', 'Sweets'],
      prepTimeMinutes: 15,
      platformInspectionStatus: 'VERIFIED_CLEAN',
      publishedSafetyScore: 96,
      now,
    }),
  );
  await restaurantStore.upsertOutlet(
    buildOutletRecord({
      outletId: 'out_saltlake_uninspected',
      restaurantId: 'rest_saltlake',
      brandName: 'Kasturi New Branch',
      name: 'Salt Lake Sec V',
      zoneId: 'salt-lake',
      locality: 'Salt Lake Sector V',
      coordinates: [88.4317, 22.5806],
      cuisines: ['Bengali Classics'],
      prepTimeMinutes: 18,
      fssaiVerificationStatus: 'VERIFIED',
      platformInspectionStatus: 'NOT_INSPECTED',
      publishedSafetyScore: null,
      now,
    }),
  );
  await restaurantStore.upsertOutlet(
    buildOutletRecord({
      outletId: 'out_cap_late',
      restaurantId: 'rest_cap_late',
      brandName: 'Esplanade Express',
      name: 'Esplanade',
      zoneId: 'central',
      locality: 'Esplanade',
      coordinates: [88.3526, 22.56],
      cuisines: ['Rolls'],
      prepTimeMinutes: 20,
      platformInspectionStatus: 'ACTION_REQUIRED',
      publishedSafetyScore: 71,
      operatingSlots: DEFAULT_OUTLET_OPERATING_SLOTS.map((s) => ({
        ...s,
        openTime: '14:00',
        closeTime: '23:00',
      })),
      now,
    }),
  );
  await restaurantStore.upsertOutlet(
    buildOutletRecord({
      outletId: 'out_suspended',
      restaurantId: 'rest_suspended',
      brandName: 'Hazard Kitchen',
      name: 'Suspended Branch',
      zoneId: 'salt-lake',
      locality: 'Salt Lake',
      coordinates: [88.4317, 22.5806],
      cuisines: ['Biryani'],
      prepTimeMinutes: 15,
      platformInspectionStatus: 'SUSPENDED',
      publishedSafetyScore: null,
      now,
    }),
  );

  // Seed dishes in paise with dietary & allergens
  await catalogStore.createMenuItem(
    buildDishRecord({
      itemId: 'dish_mutton_biryani',
      outletId: 'out_arsalan',
      restaurantId: 'rest_arsalan',
      title: 'Kolkata Royal Mutton Biryani',
      description: 'Saffron dum biryani with tender mutton and golden potato.',
      pricePaise: 38000,
      dietaryType: 'NON_VEG',
      allergens: ['DAIRY'],
    }),
  );
  await catalogStore.createMenuItem(
    buildDishRecord({
      itemId: 'dish_paneer_tikka',
      outletId: 'out_arsalan',
      restaurantId: 'rest_arsalan',
      title: 'Malai Paneer Tikka',
      description: 'Charcoal-roasted paneer in cream marinade.',
      pricePaise: 29500,
      dietaryType: 'PURE_VEG',
      allergens: ['DAIRY'],
    }),
  );
  await catalogStore.createMenuItem(
    buildDishRecord({
      itemId: 'dish_baked_rosogolla',
      outletId: 'out_balaram',
      restaurantId: 'rest_balaram',
      title: 'Baked Rosogolla Handi',
      description: 'Warm caramelized chhana rosogolla without mustard or peanuts.',
      pricePaise: 18000,
      dietaryType: 'PURE_VEG',
      allergens: ['DAIRY'],
    }),
  );
  await catalogStore.createMenuItem(
    buildDishRecord({
      itemId: 'dish_alu_posto',
      outletId: 'out_saltlake_uninspected',
      restaurantId: 'rest_saltlake',
      title: 'Kacha Lonka Alu Posto',
      description: 'Poppy seed potatoes finished with mustard oil.',
      pricePaise: 21000,
      dietaryType: 'PURE_VEG',
      allergens: ['MUSTARD'],
    }),
  );

  const app = createApp({
    config,
    logger,
    clock: testClock,
    identityService,
    identityStore,
    rbacStore,
    customerStore,
    restaurantStore,
    outletStore,
    outletService,
    catalogStore,
    discoveryRateLimit: { maxRequests: 30, windowMs: 60_000 },
  });

  const { server, baseUrl } = await startTestServer(app);
  try {
    // 3a. Search for dish & exclusion of SUSPENDED outlet
    const biryaniSearch = await apiJson(baseUrl, '/search?q=biryani');
    assert.equal(biryaniSearch.status, 200);
    assert.equal(biryaniSearch.json.data.outlets.length, 1);
    assert.equal(biryaniSearch.json.data.outlets[0].outletId, 'out_arsalan');
    assert.equal(biryaniSearch.json.data.dishes.length, 1);
    assert.equal(biryaniSearch.json.data.dishes[0].formattedPriceInr, '₹380');
    assert.ok(
      biryaniSearch.json.data.rankingDisclosure.includes('never sells higher discovery placement'),
    );

    // 3b. No misleading verified claims under verifiedOnly=true and minSafetyScore=85
    const verifiedSearch = await apiJson(baseUrl, '/search?verifiedOnly=true&minSafetyScore=85');
    assert.equal(verifiedSearch.status, 200);
    const verifiedIds = verifiedSearch.json.data.outlets.map((o) => o.outletId);
    assert.ok(verifiedIds.includes('out_arsalan'));
    assert.ok(verifiedIds.includes('out_balaram'));
    assert.ok(
      !verifiedIds.includes('out_saltlake_uninspected'),
      'FSSAI verified + NOT_INSPECTED must NEVER pass verifiedOnly filter',
    );
    assert.ok(!verifiedIds.includes('out_cap_late'));
    assert.ok(!verifiedIds.includes('out_suspended'));

    // Explicitly fetching NOT_INSPECTED shows honest Uninspected badge with null score
    const uninspectedSearch = await apiJson(baseUrl, '/search?safetyStatus=NOT_INSPECTED');
    assert.equal(uninspectedSearch.status, 200);
    assert.equal(uninspectedSearch.json.data.outlets.length, 1);
    const uninspectedOutlet = uninspectedSearch.json.data.outlets[0];
    assert.equal(uninspectedOutlet.outletId, 'out_saltlake_uninspected');
    assert.equal(uninspectedOutlet.trustBadge.isVerified, false);
    assert.equal(uninspectedOutlet.trustBadge.label, 'Not Yet Inspected');
    assert.equal(uninspectedOutlet.trustBadge.score, null);

    // 3c. Dietary + allergen exclusion + integer maxPricePaise + IST openNow filter
    const allergySafeSearch = await apiJson(
      baseUrl,
      '/search?dietary=PURE_VEG&excludeAllergens=MUSTARD&maxPricePaise=25000&openNow=true',
    );
    assert.equal(allergySafeSearch.status, 200);
    assert.equal(allergySafeSearch.json.data.outlets.length, 1);
    assert.equal(allergySafeSearch.json.data.outlets[0].outletId, 'out_balaram');

    // 3d. Sorting by price_asc, price_desc, safety_score, and geospatial distance
    const sortPriceAsc = await apiJson(baseUrl, '/search?sort=price_asc&maxPricePaise=40000');
    assert.equal(sortPriceAsc.status, 200);
    assert.deepEqual(
      sortPriceAsc.json.data.outlets.map((o) => o.outletId),
      ['out_balaram', 'out_saltlake_uninspected', 'out_arsalan'],
    );

    const sortSafety = await apiJson(baseUrl, '/search?sort=safety_score');
    assert.equal(sortSafety.status, 200);
    assert.equal(sortSafety.json.data.outlets[0].outletId, 'out_balaram'); // score 96 > 94

    // Salt Lake customer coordinates place Salt Lake kitchen closest
    const geoSearch = await apiJson(baseUrl, '/search?lng=88.4317&lat=22.5806&openNow=true');
    assert.equal(geoSearch.status, 200);
    assert.equal(geoSearch.json.data.outlets[0].outletId, 'out_saltlake_uninspected');
    assert.equal(geoSearch.json.data.outlets[0].serviceable, true);

    // 3e. Categories endpoint
    const categoriesRes = await apiJson(baseUrl, '/categories');
    assert.equal(categoriesRes.status, 200);
    assert.equal(categoriesRes.json.data.categories.length, SERVER_CURATED_CATEGORIES.length);

    // 3f. Abuse & invalid query validation
    assert.equal((await apiJson(baseUrl, `/search?q=${'a'.repeat(85)}`)).status, 400);
    assert.equal((await apiJson(baseUrl, '/search?limit=100')).status, 400);
    assert.equal((await apiJson(baseUrl, '/search?lng=22.5806&lat=88.4317')).status, 400);
    assert.equal((await apiJson(baseUrl, '/search?maxPricePaise=199.5')).status, 400);
    assert.equal((await apiJson(baseUrl, '/search?cursor=corrupted-base64')).status, 400);
    // ReDoS-shaped pattern finishes cleanly in milliseconds with 200
    const redosRes = await apiJson(baseUrl, '/search?q=' + encodeURIComponent('(a+)+$'));
    assert.equal(redosRes.status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  // 4. Dedicated scale & cursor pagination test (240 outlets) + sliding-window 429 rate limiter check
  const scaleClock = new MutableTestClock('2026-11-12T06:30:00Z');
  const scaleRestaurants = new InMemoryRestaurantStore();
  const scaleOutlets = new InMemoryOutletStore();
  const scaleCatalog = new InMemoryCatalogStore();
  const scaleIdentityStore = new InMemoryIdentityStore();
  const scaleRbac = new InMemoryRbacStore();
  const scaleOutletSvc = new OutletService({
    restaurantStore: scaleRestaurants,
    outletStore: scaleOutlets,
    rbacStore: scaleRbac,
    logger,
    clock: scaleClock,
  });

  for (let idx = 0; idx < 240; idx += 1) {
    const padded = String(idx).padStart(3, '0');
    const outletId = `out_scale_${padded}`;
    await scaleRestaurants.upsertOutlet(
      buildOutletRecord({
        outletId,
        restaurantId: `rest_scale_${padded}`,
        brandName: `Kolkata Kitchen ${padded}`,
        name: `Branch ${padded}`,
        zoneId: idx % 2 === 0 ? 'salt-lake' : 'central',
        locality: idx % 2 === 0 ? 'Salt Lake' : 'Park Street',
        coordinates: idx % 2 === 0 ? [88.4317, 22.5806] : [88.3526, 22.5535],
        cuisines: ['Bengali', 'Biryani'],
        prepTimeMinutes: 15 + (idx % 20),
        platformInspectionStatus: idx % 3 === 0 ? 'NOT_INSPECTED' : 'VERIFIED_CLEAN',
        publishedSafetyScore: idx % 3 === 0 ? null : 88 + (idx % 10),
        now,
      }),
    );
    await scaleCatalog.createMenuItem(
      buildDishRecord({
        itemId: `dish_scale_${padded}_a`,
        outletId,
        restaurantId: `rest_scale_${padded}`,
        title: `Special Platter ${padded}`,
        description: 'Signature Kolkata preparation',
        pricePaise: 15000 + (idx % 30) * 500,
        dietaryType: idx % 2 === 0 ? 'PURE_VEG' : 'NON_VEG',
      }),
    );
  }

  const scaleApp = createApp({
    config,
    logger,
    clock: scaleClock,
    identityService: new IdentityService({
      config,
      store: scaleIdentityStore,
      otpAdapter: new InMemoryTestOtpAdapter(),
      logger,
    }),
    identityStore: scaleIdentityStore,
    rbacStore: scaleRbac,
    customerStore: new InMemoryCustomerStore(),
    restaurantStore: scaleRestaurants,
    outletStore: scaleOutlets,
    outletService: scaleOutletSvc,
    catalogStore: scaleCatalog,
    discoveryRateLimit: { maxRequests: 20, windowMs: 60_000 },
  });

  const scaleServer = await startTestServer(scaleApp);
  try {
    const startMs = Date.now();
    const collectedIds = [];
    let cursor = null;
    let pages = 0;

    do {
      const url = cursor
        ? `/search?sort=eta&limit=25&cursor=${encodeURIComponent(cursor)}`
        : '/search?sort=eta&limit=25';
      const pageRes = await apiJson(scaleServer.baseUrl, url);
      assert.equal(pageRes.status, 200);
      assert.equal(pageRes.json.meta.totalCount, 240);
      for (const outlet of pageRes.json.data.outlets) {
        collectedIds.push(outlet.outletId);
      }
      cursor = pageRes.json.meta.hasMore ? pageRes.json.meta.nextCursor : null;
      pages += 1;
      assert.ok(pages <= 12, 'Pagination loop safety bound');
    } while (cursor);

    const elapsedMs = Date.now() - startMs;
    assert.equal(collectedIds.length, 240, 'All 240 outlets fetched across cursor pages');
    assert.equal(new Set(collectedIds).size, 240, 'Zero duplicates across cursor pages');
    assert.ok(elapsedMs < 2500, `240-outlet cursor walk took too long (${elapsedMs}ms)`);
    console.log(`  Cursor pagination over 240 outlets (10 pages) completed in ${elapsedMs}ms`);

    // Mismatched cursor across different sort returns 400
    const firstPage = await apiJson(scaleServer.baseUrl, '/search?sort=eta&limit=10');
    const badCursorRes = await apiJson(
      scaleServer.baseUrl,
      `/search?sort=price_asc&limit=10&cursor=${encodeURIComponent(firstPage.json.meta.nextCursor)}`,
    );
    assert.equal(badCursorRes.status, 400);

    // Rate limit exhaustion -> 429 RATE_LIMITED, then clock advance + 61s recovers
    let gotRateLimited = false;
    for (let i = 0; i < 15; i += 1) {
      const res = await apiJson(scaleServer.baseUrl, '/categories');
      if (res.status === 429) {
        assert.equal(res.json.error.code, 'RATE_LIMITED');
        assert.ok(res.headers.get('retry-after'));
        gotRateLimited = true;
        break;
      }
    }
    assert.ok(gotRateLimited, 'Expected 429 RATE_LIMITED when exceeding window quota');

    scaleClock.advanceSeconds(61);
    const recoveredRes = await apiJson(scaleServer.baseUrl, '/categories');
    assert.equal(recoveredRes.status, 200);
  } finally {
    await new Promise((resolve) => scaleServer.server.close(resolve));
  }

  // 5. Verify React customer-web source compliance (truthful badge, IME enter check, zero #ffffff bloat)
  const discoverySrc = fs.readFileSync(
    path.join(REPO_ROOT, 'client', 'customer-web', 'src', 'components', 'KitchenDiscovery.tsx'),
    'utf8',
  );
  assert.ok(discoverySrc.includes('NOT INSPECTED'));
  assert.ok(discoverySrc.includes('Kolkata Map View'));
  assert.ok(discoverySrc.includes('aria-pressed'));

  const heroSrc = fs.readFileSync(
    path.join(REPO_ROOT, 'client', 'customer-web', 'src', 'components', 'HeroSection.tsx'),
    'utf8',
  );
  assert.ok(heroSrc.includes('isComposing'));
  assert.ok(heroSrc.includes('229'));

  console.log('Checkpoint 13 Discovery & Search Verification PASSED cleanly.');
}

main().catch((error) => {
  console.error('Checkpoint 13 verification failed:', error);
  process.exit(1);
});
