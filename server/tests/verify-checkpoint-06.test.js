/**
 * Checkpoint 06 — Database Foundation Verification Suite
 *
 * Verifies:
 * 1. MongoDB URI credential scrubbing & safe error properties (zero secret leaks).
 * 2. Real Mongoose connection failure handling + backoff retries + /api/v1/ready 503 integration.
 * 3. Mongoose conventions (integer paise validator, GeoJSON Point/Polygon, timestamps, append-only guard).
 * 4. BaseRepository abstraction (CRUD, atomic state update, cursor pagination) & withTransaction lifecycle.
 * 5. Repeatable idempotent index builder matching DATABASE.md Section 4.
 * 6. Idempotent non-PII market/policy seed runner & production safety guard.
 * 7. DATABASE.md backup/conventions docs & ADR-010 synchronization.
 */

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const assert = require('assert');
const { Schema, model } = require('mongoose');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DIST_DIR = path.join(ROOT_DIR, 'server/dist');

const { validateEnv } = require(path.join(DIST_DIR, 'config/env.js'));
const { createLogger } = require(path.join(DIST_DIR, 'config/logger.js'));
const { createApp } = require(path.join(DIST_DIR, 'app.js'));
const { createDatabaseManager, DatabaseConnectionError, sanitizeMongoUri } = require(
  path.join(DIST_DIR, 'database/connection.js'),
);
const {
  COLLECTION_NAMES,
  DEFAULT_KOLKATA_CENTER,
  applyBaseSchemaConventions,
  createGeoPointSubSchema,
  createGeoPolygonSubSchema,
  paiseField,
} = require(path.join(DIST_DIR, 'database/conventions.js'));
const { BaseRepository, withTransaction } = require(path.join(DIST_DIR, 'database/repository.js'));
const { INITIAL_DATABASE_INDEXES, applyInitialIndexes } = require(
  path.join(DIST_DIR, 'database/indexes.js'),
);
const {
  INITIAL_INSPECTION_TEMPLATE_SEED,
  INITIAL_KOLKATA_CITY_SEED,
  INITIAL_KOLKATA_ZONES_SEED,
  runSeed,
} = require(path.join(DIST_DIR, 'database/seed.js'));

async function getClosedLoopbackPort() {
  const srv = net.createServer();
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const { port } = srv.address();
  await new Promise((resolve) => srv.close(resolve));
  return port;
}

function buildTestConfig(overrides = {}) {
  return validateEnv({
    NODE_ENV: 'test',
    PORT: '4000',
    HOST: '127.0.0.1',
    APP_TIMEZONE: 'Asia/Kolkata',
    DEFAULT_CITY_CODE: 'KOLKATA',
    DEFAULT_CURRENCY: 'INR',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_test',
    MONGODB_SERVER_SELECTION_TIMEOUT_MS: '250',
    MONGODB_CONNECT_TIMEOUT_MS: '250',
    MONGODB_MAX_POOL_SIZE: '5',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-chars-kolkata-1',
    JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-chars-kolkata-2',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    LOG_LEVEL: 'info',
    ...overrides,
  });
}

async function runSuite() {
  console.log('--- Starting Checkpoint 06 Verification Suite ---');

  // Test 1: URI Credential Sanitization
  console.log('[Test 1] Verifying MongoDB URI credential scrubbing...');
  const secretPass = 'VerySecretDbPass987';
  const rawUri =
    'mongodb+srv://' +
    'bhojora_admin:' +
    secretPass +
    '@cluster0.kolkata.mongodb.net/bhojora_prod?retryWrites=true&password=' +
    secretPass;
  const sanitized = sanitizeMongoUri(rawUri);
  assert.ok(!sanitized.includes(secretPass), 'Sanitized URI must strip password');
  assert.ok(sanitized.includes('[REDACTED]:[REDACTED]@'), 'Must mask user/pass segment');
  console.log('✓ MongoDB URI sanitization verified.');

  // Test 2: Real Connection Failure Handling, Retry Backoff & /ready 503
  console.log('[Test 2] Verifying unreachable MongoDB failure handling and /api/v1/ready 503...');
  const closedPort = await getClosedLoopbackPort();
  const unreachableUri =
    'mongodb://devuser:' + secretPass + `@127.0.0.1:${closedPort}/bhojora_unreachable`;
  const failLogs = [];
  const captureLogger = createLogger({
    level: 'info',
    environment: 'test',
    writeStdout: (line) => failLogs.push(line),
    writeStderr: (line) => failLogs.push(line),
  });

  const dbConfig = buildTestConfig({ MONGODB_URI: unreachableUri });
  const dbManager = createDatabaseManager({
    config: dbConfig,
    logger: captureLogger,
    maxAttempts: 2,
    retryBaseDelayMs: 10,
  });

  await assert.rejects(
    () => dbManager.connect(),
    (err) => {
      assert.ok(err instanceof DatabaseConnectionError);
      assert.ok(!err.message.includes(secretPass), 'Connection error must never leak DB password');
      assert.ok(!err.sanitizedUri.includes(secretPass), 'Error URI field must stay redacted');
      return true;
    },
  );

  const attemptWarnings = failLogs
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.message === 'database.connection.attempt_failed');
  assert.strictEqual(attemptWarnings.length, 2, 'Expected 2 connection retry attempts logged');
  for (const logLine of failLogs) {
    assert.ok(!logLine.includes(secretPass), 'Database logs must never include raw DB credentials');
  }

  // Verify readiness probe returns 503 cleanly when disconnected
  const app = createApp({
    config: dbConfig,
    logger: captureLogger,
    readinessProbes: [dbManager.getReadinessProbe()],
  });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/ready`);
    assert.strictEqual(res.status, 503);
    const body = await res.json();
    assert.strictEqual(body.error.code, 'SERVICE_UNAVAILABLE');
    assert.strictEqual(body.error.details[0].field, 'mongodb');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  console.log('✓ MongoDB connection retry failure & 503 readiness probe verified.');

  // Test 3: Mongoose Schema Conventions (Paise, GeoJSON Point/Polygon, Append-Only Guard)
  console.log('[Test 3] Validating Mongoose schema conventions...');
  const sampleSchema = applyBaseSchemaConventions(
    new Schema({
      pricePaise: paiseField(),
      location: { type: createGeoPointSubSchema(), required: true },
      zone: { type: createGeoPolygonSubSchema(), required: false },
    }),
    { appendOnly: true },
  );

  assert.strictEqual(sampleSchema.get('timestamps'), true);
  assert.strictEqual(sampleSchema.get('strict'), true);
  assert.strictEqual(sampleSchema.get('versionKey'), false);

  const SampleModel = model('Checkpoint06SampleConvention', sampleSchema);

  const validDoc = new SampleModel({
    pricePaise: 35000,
    location: { type: 'Point', coordinates: [...DEFAULT_KOLKATA_CENTER] },
    zone: { type: 'Polygon', coordinates: INITIAL_KOLKATA_ZONES_SEED[0].coordinates },
  });
  assert.strictEqual(validDoc.validateSync(), undefined);

  const floatPaiseDoc = new SampleModel({
    pricePaise: 350.5,
    location: { type: 'Point', coordinates: [88.36, 22.57] },
  });
  assert.ok(floatPaiseDoc.validateSync(), 'Float rupee/paise value must fail integer validation');

  const unclosedPolyDoc = new SampleModel({
    pricePaise: 1000,
    location: { type: 'Point', coordinates: [88.36, 22.57] },
    zone: {
      type: 'Polygon',
      coordinates: [
        [
          [88.4, 22.5],
          [88.41, 22.5],
          [88.41, 22.51],
          [88.4, 22.51],
        ],
      ],
    },
  });
  assert.ok(unclosedPolyDoc.validateSync(), 'Unclosed GeoJSON polygon must fail validation');

  await assert.rejects(
    () => SampleModel.updateOne({ _id: '123' }, { $set: { pricePaise: 1 } }),
    /Append-only collection forbids updateOne/,
  );
  console.log('✓ Paise integer, GeoJSON Point/Polygon, and append-only invariants verified.');

  // Test 4: BaseRepository & withTransaction Lifecycle
  console.log('[Test 4] Verifying BaseRepository & withTransaction abstraction...');
  const rows = [
    { _id: 'o1', id: 'o1', state: 'AWAITING_PAYMENT' },
    { _id: 'o2', id: 'o2', state: 'AWAITING_PAYMENT' },
    { _id: 'o3', id: 'o3', state: 'CONFIRMED' },
  ];
  const fakeModel = {
    async findById(id) {
      return rows.find((r) => r._id === id) ?? null;
    },
    async findOne(filter) {
      return rows.find((r) => r.state === filter.state) ?? null;
    },
    async create(docs) {
      return docs.map((d, idx) => ({ _id: `new_${idx}`, id: `new_${idx}`, ...d }));
    },
    async findOneAndUpdate(filter, update) {
      const match = rows.find((r) => r._id === filter._id && r.state === filter.state);
      if (!match) {
        return null;
      }
      Object.assign(match, update.$set);
      return match;
    },
    find() {
      return {
        sort() {
          return {
            async limit(n) {
              return rows.slice(0, n);
            },
          };
        },
      };
    },
  };

  const repo = new BaseRepository(fakeModel);
  const firstTransition = await repo.atomicStateTransition(
    { _id: 'o1', state: 'AWAITING_PAYMENT' },
    { $set: { state: 'CONFIRMED' } },
  );
  assert.strictEqual(firstTransition.state, 'CONFIRMED');
  const replayTransition = await repo.atomicStateTransition(
    { _id: 'o1', state: 'AWAITING_PAYMENT' },
    { $set: { state: 'CONFIRMED' } },
  );
  assert.strictEqual(
    replayTransition,
    null,
    'Replayed conditional state transition must fail safely',
  );

  const page = await repo.findCursorPage({ filter: {}, limit: 2 });
  assert.strictEqual(page.items.length, 2);
  assert.strictEqual(page.hasMore, true);
  assert.strictEqual(page.nextCursor, 'o2');

  let sessionEnded = false;
  const fakeConn = {
    async startSession() {
      return {
        async withTransaction(fn) {
          return fn();
        },
        async endSession() {
          sessionEnded = true;
        },
      };
    },
  };
  await assert.rejects(
    () =>
      withTransaction(fakeConn, async () => {
        throw new Error('forced_tx_abort');
      }),
    /forced_tx_abort/,
  );
  assert.strictEqual(sessionEnded, true, 'Transaction session must always close in finally');
  console.log('✓ Repository atomic transitions, cursor pagination & session cleanup verified.');

  // Test 5: Repeatable Idempotent Index Creation
  console.log('[Test 5] Verifying repeatable database index creation...');
  assert.ok(
    INITIAL_DATABASE_INDEXES.some(
      (idx) =>
        idx.collection === COLLECTION_NAMES.restaurantOutlets && idx.key.location === '2dsphere',
    ),
    'Missing 2dsphere index on restaurant_outlets',
  );
  assert.ok(
    INITIAL_DATABASE_INDEXES.some(
      (idx) => idx.collection === COLLECTION_NAMES.payments && idx.options.unique === true,
    ),
    'Missing unique payment provider index',
  );
  assert.ok(
    INITIAL_DATABASE_INDEXES.some(
      (idx) =>
        idx.collection === COLLECTION_NAMES.idempotencyKeys && idx.options.expireAfterSeconds === 0,
    ),
    'Missing TTL index on idempotency_keys',
  );

  const createdIndexesByCollection = new Map();
  const fakeIndexDb = {
    collection(colName) {
      return {
        async createIndexes(specs) {
          const existing = createdIndexesByCollection.get(colName) ?? new Set();
          for (const spec of specs) {
            existing.add(spec.name);
          }
          createdIndexesByCollection.set(colName, existing);
          return specs.map((s) => s.name);
        },
      };
    },
  };

  const silentLogger = createLogger({
    level: 'error',
    writeStdout: () => {},
    writeStderr: () => {},
  });
  const pass1 = await applyInitialIndexes(fakeIndexDb, silentLogger);
  const pass2 = await applyInitialIndexes(fakeIndexDb, silentLogger);
  assert.strictEqual(pass1.indexesEnsured, INITIAL_DATABASE_INDEXES.length);
  assert.strictEqual(pass2.indexesEnsured, pass1.indexesEnsured);
  const totalUniqueNames = Array.from(createdIndexesByCollection.values()).reduce(
    (sum, s) => sum + s.size,
    0,
  );
  assert.strictEqual(totalUniqueNames, INITIAL_DATABASE_INDEXES.length);
  console.log(`✓ All ${pass1.indexesEnsured} declarative database indexes verified idempotent.`);

  // Test 6: Idempotent Non-PII Seed Strategy & Production Guard
  console.log('[Test 6] Verifying repeatable synthetic seed & production safety guard...');
  const store = new Map();
  const fakeSeedDb = {
    collection(colName) {
      return {
        async updateOne(filter, update) {
          const key = `${colName}:${JSON.stringify(filter)}`;
          if (store.has(key)) {
            return { upsertedCount: 0, matchedCount: 1 };
          }
          store.set(key, update.$setOnInsert);
          return { upsertedCount: 1, matchedCount: 0 };
        },
      };
    },
  };

  await assert.rejects(
    () => runSeed({ db: fakeSeedDb, logger: silentLogger, nodeEnv: 'production' }),
    /production/,
  );

  const seedRun1 = await runSeed({ db: fakeSeedDb, logger: silentLogger, nodeEnv: 'development' });
  const expectedRecords = 1 + INITIAL_KOLKATA_ZONES_SEED.length + 1;
  assert.strictEqual(seedRun1.upsertedCount, expectedRecords);
  assert.strictEqual(seedRun1.matchedCount, 0);

  const seedRun2 = await runSeed({ db: fakeSeedDb, logger: silentLogger, nodeEnv: 'development' });
  assert.strictEqual(seedRun2.upsertedCount, 0, 'Repeat seed must be 100% idempotent');
  assert.strictEqual(seedRun2.matchedCount, expectedRecords);
  assert.strictEqual(INITIAL_KOLKATA_CITY_SEED.currency, 'INR');
  assert.strictEqual(INITIAL_INSPECTION_TEMPLATE_SEED.prohibitSelfApproval, true);
  console.log('✓ Non-PII starter seed idempotency & production refusal verified.');

  // Test 7: DATABASE.md & ADR-010 Documentation Sync
  console.log('[Test 7] Verifying DATABASE.md & ADR-010 documentation updates...');
  const dbDoc = fs.readFileSync(
    path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/DATABASE.md'),
    'utf8',
  );
  assert.ok(dbDoc.includes('Model conventions'));
  assert.ok(dbDoc.includes('Repeatable index and seed strategy'));
  assert.ok(dbDoc.includes('Backup, retention and restore notes'));
  const adrs = fs.readFileSync(path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/ADRS.md'), 'utf8');
  assert.ok(adrs.includes('ADR-010'));
  console.log('✓ DATABASE.md & ADR-010 synchronized cleanly.');

  console.log('--- ALL CHECKPOINT 06 CHECKS PASSED SUCCESSFULLY ---');
}

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
