/**
 * Checkpoint 05 — Backend Bootstrap Verification Suite
 *
 * Verifies:
 * 1. Fail-safe Zod environment validation (missing, invalid, production safety, secret masking).
 * 2. Structured JSON logger & Tier 3/Tier 4 PII/secret redaction.
 * 3. Request ID header validation & safe correlation fallback.
 * 4. HTTP integration suite for /api/v1/health, /api/v1/ready (200 & 503), 404, malformed JSON, security headers, CORS.
 * 5. Global error handler behavior (ZodError, AppError, unhandled 500 with zero leak).
 * 6. Synchronized OpenAPI (/ready, SERVICE_UNAVAILABLE) & ADR-009 docs.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const assert = require('assert');
const express = require('express');
const { z } = require('zod');

const ROOT_DIR = path.resolve(__dirname, '../..');
const DIST_DIR = path.join(ROOT_DIR, 'server/dist');

assert.ok(
  fs.existsSync(path.join(DIST_DIR, 'app.js')),
  'Missing compiled server/dist/app.js. Run `npm run build` before `npm test`.',
);

const { ConfigValidationError, validateEnv } = require(path.join(DIST_DIR, 'config/env.js'));
const { createLogger } = require(path.join(DIST_DIR, 'config/logger.js'));
const { createApp } = require(path.join(DIST_DIR, 'app.js'));
const { AppError, createErrorHandler } = require(
  path.join(DIST_DIR, 'middleware/error-handler.js'),
);
const { createRequestContextMiddleware, resolveRequestId } = require(
  path.join(DIST_DIR, 'middleware/request-context.js'),
);

function buildValidEnv(overrides = {}) {
  return {
    NODE_ENV: 'test',
    PORT: '4000',
    HOST: '127.0.0.1',
    APP_TIMEZONE: 'Asia/Kolkata',
    DEFAULT_CITY_CODE: 'KOLKATA',
    DEFAULT_CURRENCY: 'INR',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-chars-kolkata-1',
    JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-chars-kolkata-2',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000,https://bhojora.vercel.app',
    LOG_LEVEL: 'info',
    SHUTDOWN_TIMEOUT_MS: '5000',
    ...overrides,
  };
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'Expected TCP server address');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

async function runSuite() {
  console.log('--- Starting Checkpoint 05 Verification Suite ---');

  // Test 1: Config Validation Fails Safely
  console.log('[Test 1] Verifying fail-safe Zod config validation...');
  const validConfig = validateEnv(buildValidEnv());
  assert.strictEqual(validConfig.appTimezone, 'Asia/Kolkata');
  assert.strictEqual(validConfig.defaultCityCode, 'KOLKATA');
  assert.strictEqual(validConfig.defaultCurrency, 'INR');
  assert.deepStrictEqual(validConfig.corsAllowedOrigins, [
    'http://localhost:3000',
    'https://bhojora.vercel.app',
  ]);

  assert.throws(
    () => validateEnv({ NODE_ENV: 'development' }),
    (err) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.ok(err.issues.some((i) => i.field === 'MONGODB_URI'));
      assert.ok(err.issues.some((i) => i.field === 'JWT_ACCESS_SECRET'));
      assert.ok(err.issues.some((i) => i.field === 'JWT_REFRESH_SECRET'));
      return true;
    },
  );

  const leakedSecret = 'short-secret-never-log';
  assert.throws(
    () =>
      validateEnv(
        buildValidEnv({
          JWT_ACCESS_SECRET: leakedSecret,
        }),
      ),
    (err) => {
      assert.ok(err instanceof ConfigValidationError);
      assert.ok(!err.message.includes(leakedSecret), 'Config error must never leak raw secret');
      return true;
    },
  );

  assert.throws(
    () =>
      validateEnv(
        buildValidEnv({
          JWT_REFRESH_SECRET: 'test-access-secret-minimum-32-chars-kolkata-1',
        }),
      ),
    ConfigValidationError,
  );

  assert.throws(
    () =>
      validateEnv(
        buildValidEnv({
          APP_TIMEZONE: 'Mars/Olympus',
        }),
      ),
    ConfigValidationError,
  );

  assert.throws(
    () =>
      validateEnv(
        buildValidEnv({
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'replace-with-local-dev-access-secret-min-32-chars',
          CORS_ALLOWED_ORIGINS: '',
        }),
      ),
    ConfigValidationError,
  );

  assert.throws(
    () =>
      validateEnv(
        buildValidEnv({
          NODE_ENV: 'production',
          CORS_ALLOWED_ORIGINS: '*',
        }),
      ),
    ConfigValidationError,
  );

  assert.throws(
    () =>
      validateEnv(
        buildValidEnv({
          NODE_ENV: 'production',
          JWT_ACCESS_SECRET: 'a'.repeat(32),
        }),
      ),
    ConfigValidationError,
  );
  console.log('✓ Fail-safe config validation verified across missing/invalid/production checks.');

  // Test 2: Structured Logger & PII/Secret Redaction
  console.log('[Test 2] Verifying structured JSON logging & Tier 3/4 redaction...');
  const stdoutLines = [];
  const stderrLines = [];
  const logger = createLogger({
    level: 'info',
    environment: 'production',
    includeStack: false,
    writeStdout: (line) => stdoutLines.push(line),
    writeStderr: (line) => stderrLines.push(line),
  });

  logger.debug('should.be.filtered');
  assert.strictEqual(stdoutLines.length, 0, 'Debug logs must be suppressed at info level');

  logger.info('auth.attempt', {
    requestId: 'req-12345678',
    password: 'my-secret-password',
    customerPhone: '+919830000000',
    panNumber: 'ABCDE1234F',
    companyName: 'Bhojora Foods Pvt Ltd',
    nested: { jwtAccessSecret: 'abc', otp: '123456' },
    connectionHint: 'mongodb://admin:' + 'topsecret@cluster.example.com/bhojora',
  });
  assert.strictEqual(stdoutLines.length, 1);
  const parsedLog = JSON.parse(stdoutLines[0]);
  assert.strictEqual(parsedLog.password, '[REDACTED]');
  assert.strictEqual(parsedLog.customerPhone, '[REDACTED]');
  assert.strictEqual(parsedLog.panNumber, '[REDACTED]');
  assert.strictEqual(parsedLog.companyName, 'Bhojora Foods Pvt Ltd');
  assert.strictEqual(parsedLog.nested.jwtAccessSecret, '[REDACTED]');
  assert.strictEqual(parsedLog.nested.otp, '[REDACTED]');
  assert.ok(!stdoutLines[0].includes('topsecret'), 'URI credentials must be scrubbed from logs');

  logger.error('boom', { error: new Error('db timeout') });
  const parsedErr = JSON.parse(stderrLines[0]);
  assert.strictEqual(parsedErr.error.stack, undefined, 'Production logs should suppress stack');
  console.log('✓ Structured JSON logger & sensitive field redaction verified.');

  // Test 3: Request ID Hygiene
  console.log('[Test 3] Verifying request ID preservation and sanitization...');
  assert.strictEqual(resolveRequestId('kolkata-trace-001'), 'kolkata-trace-001');
  const injected = resolveRequestId('bad\r\nheader-injection');
  assert.match(injected, /^[0-9a-f-]{36}$/i);
  console.log('✓ Request ID validation and UUID fallback verified.');

  // Test 4: HTTP Integration Suite (/health, /ready, 404, malformed JSON, headers, CORS)
  console.log('[Test 4] Running HTTP integration tests on ephemeral Express server...');
  let probeHealthy = true;
  let shuttingDown = false;
  const silentLogger = createLogger({
    level: 'error',
    environment: 'test',
    writeStdout: () => {},
    writeStderr: () => {},
  });

  const app = createApp({
    config: validConfig,
    logger: silentLogger,
    getIsShuttingDown: () => shuttingDown,
    readinessProbes: [
      {
        name: 'synthetic-dependency',
        check: () => {
          if (!probeHealthy) {
            throw new Error('SECRET_CONN_STRING_SHOULD_NOT_LEAK');
          }
          return { status: 'pass', detail: 'Synthetic probe OK' };
        },
      },
    ],
  });

  await withServer(app, async (baseUrl) => {
    const healthRes = await fetch(`${baseUrl}/api/v1/health`, {
      headers: {
        'X-Request-Id': 'req-health-check-01',
        Origin: 'http://localhost:3000',
      },
    });
    assert.strictEqual(healthRes.status, 200);
    assert.strictEqual(healthRes.headers.get('x-request-id'), 'req-health-check-01');
    assert.strictEqual(healthRes.headers.get('x-content-type-options'), 'nosniff');
    assert.strictEqual(healthRes.headers.get('x-frame-options'), 'DENY');
    assert.strictEqual(healthRes.headers.get('x-powered-by'), null);
    assert.strictEqual(
      healthRes.headers.get('access-control-allow-origin'),
      'http://localhost:3000',
    );

    const healthBody = await healthRes.json();
    assert.strictEqual(healthBody.success, true);
    assert.strictEqual(healthBody.requestId, 'req-health-check-01');
    assert.strictEqual(healthBody.data.status, 'ok');
    assert.strictEqual(healthBody.data.timezone, 'Asia/Kolkata');
    assert.strictEqual(healthBody.data.currency, 'INR');

    const rootHealthRes = await fetch(`${baseUrl}/health`);
    assert.strictEqual(rootHealthRes.status, 200);

    const readyOkRes = await fetch(`${baseUrl}/api/v1/ready`);
    assert.strictEqual(readyOkRes.status, 200);
    const readyOkBody = await readyOkRes.json();
    assert.strictEqual(readyOkBody.data.status, 'ready');
    assert.strictEqual(readyOkBody.data.checks.length, 2);

    probeHealthy = false;
    const readyFailRes = await fetch(`${baseUrl}/api/v1/ready`);
    assert.strictEqual(readyFailRes.status, 503);
    const readyFailBody = await readyFailRes.json();
    assert.strictEqual(readyFailBody.success, false);
    assert.strictEqual(readyFailBody.error.code, 'SERVICE_UNAVAILABLE');
    assert.ok(
      !JSON.stringify(readyFailBody).includes('SECRET_CONN_STRING_SHOULD_NOT_LEAK'),
      'Readiness failure must never leak thrown exception messages',
    );

    probeHealthy = true;
    shuttingDown = true;
    const shuttingDownRes = await fetch(`${baseUrl}/api/v1/ready`);
    assert.strictEqual(shuttingDownRes.status, 503);
    shuttingDown = false;

    const notFoundRes = await fetch(`${baseUrl}/api/v1/does-not-exist`);
    assert.strictEqual(notFoundRes.status, 404);
    const notFoundBody = await notFoundRes.json();
    assert.strictEqual(notFoundBody.success, false);
    assert.strictEqual(notFoundBody.error.code, 'NOT_FOUND');
    assert.ok(notFoundRes.headers.get('x-request-id'));

    const badJsonRes = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"broken": ',
    });
    assert.strictEqual(badJsonRes.status, 400);
    const badJsonBody = await badJsonRes.json();
    assert.strictEqual(badJsonBody.error.code, 'VALIDATION_ERROR');

    const oversizedRes = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'x'.repeat(110_000) }),
    });
    assert.strictEqual(oversizedRes.status, 413);
    const oversizedBody = await oversizedRes.json();
    assert.strictEqual(oversizedBody.error.code, 'VALIDATION_ERROR');

    const disallowedCorsRes = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    assert.strictEqual(disallowedCorsRes.headers.get('access-control-allow-origin'), null);

    const disallowedPreflightRes = await fetch(`${baseUrl}/api/v1/health`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example' },
    });
    assert.strictEqual(disallowedPreflightRes.status, 403);
  });
  console.log('✓ HTTP health, readiness, CORS, security headers, 404, and bad JSON checks passed.');

  // Test 5: Global Error Middleware Pipeline (AppError, ZodError, Unhandled 500)
  console.log('[Test 5] Verifying global error handler normalization...');
  const errApp = express();
  errApp.use(createRequestContextMiddleware(silentLogger));
  errApp.use(express.json());
  errApp.get('/zod-fail', (_req, _res, next) => {
    const parsed = z.object({ quantity: z.number().int().positive() }).safeParse({ quantity: -1 });
    if (!parsed.success) {
      next(parsed.error);
      return;
    }
    next();
  });
  errApp.get('/app-fail', () => {
    throw new AppError(409, 'CONFLICT', 'Order already confirmed');
  });
  errApp.get('/crash', () => {
    throw new Error('RAW_DATABASE_SECRET_MUST_NOT_LEAK');
  });
  errApp.use(createErrorHandler(silentLogger));

  await withServer(errApp, async (baseUrl) => {
    const zodRes = await fetch(`${baseUrl}/zod-fail`);
    assert.strictEqual(zodRes.status, 400);
    const zodBody = await zodRes.json();
    assert.strictEqual(zodBody.error.code, 'VALIDATION_ERROR');
    assert.strictEqual(zodBody.error.details[0].field, 'quantity');

    const appErrRes = await fetch(`${baseUrl}/app-fail`);
    assert.strictEqual(appErrRes.status, 409);
    const appErrBody = await appErrRes.json();
    assert.strictEqual(appErrBody.error.code, 'CONFLICT');

    const crashRes = await fetch(`${baseUrl}/crash`);
    assert.strictEqual(crashRes.status, 500);
    const crashBody = await crashRes.json();
    assert.strictEqual(crashBody.error.code, 'INTERNAL_SERVER_ERROR');
    assert.ok(
      !JSON.stringify(crashBody).includes('RAW_DATABASE_SECRET_MUST_NOT_LEAK'),
      'Unhandled 500 response must sanitize internal error messages and stack traces',
    );
  });
  console.log('✓ Global error normalization (Zod, AppError, sanitized 500) passed.');

  // Test 6: OpenAPI & ADR-009 Synchronization
  console.log('[Test 6] Verifying OpenAPI /ready & ADR-009 docs synchronization...');
  const spec = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/openapi.json'), 'utf8'),
  );
  assert.ok(spec.paths['/ready'], 'openapi.json must document /ready');
  assert.ok(
    spec.components.schemas.ErrorCode.enum.includes('SERVICE_UNAVAILABLE'),
    'openapi.json ErrorCode enum must include SERVICE_UNAVAILABLE',
  );
  const adrs = fs.readFileSync(path.join(ROOT_DIR, 'docs/01-CORE-PLANNING-DESIGN/ADRS.md'), 'utf8');
  assert.ok(adrs.includes('ADR-009'), 'ADRS.md must document ADR-009');
  console.log('✓ OpenAPI contract & ADR-009 verified.');

  console.log('--- ALL CHECKPOINT 05 CHECKS PASSED SUCCESSFULLY ---');
}

runSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
