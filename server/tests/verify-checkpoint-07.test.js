'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const mongoose = require('mongoose');

const { validateEnv } = require('../dist/config/env.js');
const { createLogger } = require('../dist/config/logger.js');
const { createApp } = require('../dist/app.js');
const { COLLECTION_NAMES } = require('../dist/database/conventions.js');
const { INITIAL_DATABASE_INDEXES } = require('../dist/database/indexes.js');
const {
  ScryptPasswordHasher,
  JwtTokenManager,
  JwtVerificationError,
  normalizeEmail,
  normalizeIndianPhone,
  resolveIdentifier,
} = require('../dist/modules/identity/identity.crypto.js');
const {
  ACCOUNT_STATUSES,
  LANGUAGE_PREFERENCES,
  USER_ROLES,
  canTransitionAccountStatus,
} = require('../dist/modules/identity/identity.types.js');
const {
  InMemoryIdentityStore,
  createMongooseIdentityModels,
} = require('../dist/modules/identity/identity.models.js');
const {
  InMemoryTestOtpAdapter,
  SafeLogOtpSenderAdapter,
} = require('../dist/modules/identity/otp.adapter.js');
const { IdentityService } = require('../dist/modules/identity/identity.service.js');
const sharedAuth = require('../../client/shared/dist/contracts/auth.js');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function createTestConfig(overrides = {}) {
  return validateEnv({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    PORT: '4000',
    LOG_LEVEL: 'info',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000,https://bhojora.vercel.app',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-chars-0001',
    JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-chars-0002',
    ...overrides,
  });
}

function createMutableClock(initialIso = '2026-11-11T06:00:00.000Z') {
  let currentMs = Date.parse(initialIso);
  return {
    now: () => new Date(currentMs),
    advanceSeconds(seconds) {
      currentMs += seconds * 1000;
    },
  };
}

function createCapturingOtpHarness(logger) {
  const testAdapter = new InMemoryTestOtpAdapter();
  const safeLogAdapter = new SafeLogOtpSenderAdapter(logger);
  return {
    testAdapter,
    adapter: {
      async sendOtp(message) {
        await testAdapter.sendOtp(message);
        await safeLogAdapter.sendOtp(message);
      },
    },
  };
}

async function withServer(app, fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'HTTP server address must be available');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  try {
    return await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function requestJson(baseUrl, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  let body;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body,
  });
  const text = await response.text();
  let json = null;
  if (text.length > 0) {
    json = JSON.parse(text);
  }
  const setCookies =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
  return {
    status: response.status,
    headers: response.headers,
    setCookies,
    json,
  };
}

function parseSetCookieMap(setCookies) {
  const jar = {};
  for (const raw of setCookies) {
    const firstSegment = raw.split(';')[0] || '';
    const eqIndex = firstSegment.indexOf('=');
    if (eqIndex > 0) {
      const name = firstSegment.slice(0, eqIndex).trim();
      const val = firstSegment.slice(eqIndex + 1).trim();
      jar[name] = decodeURIComponent(val);
    }
  }
  return jar;
}

async function captureStdoutDuring(fn) {
  const originalWrite = process.stdout.write.bind(process.stdout);
  const chunks = [];
  process.stdout.write = (chunk, encoding, callback) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    if (typeof encoding === 'function') {
      encoding();
    } else if (typeof callback === 'function') {
      callback();
    }
    return true;
  };
  try {
    const result = await fn();
    return { result, output: chunks.join('') };
  } finally {
    process.stdout.write = originalWrite;
  }
}

async function main() {
  // Test 1: Crypto primitives, normalizers, JWT clock expiry & shared contracts parity
  assert.deepEqual(sharedAuth.USER_ROLES, USER_ROLES, 'USER_ROLES must match shared contract');
  assert.deepEqual(
    sharedAuth.ACCOUNT_STATUSES,
    ACCOUNT_STATUSES,
    'ACCOUNT_STATUSES must match shared contract',
  );
  assert.deepEqual(
    sharedAuth.LANGUAGE_PREFERENCES,
    LANGUAGE_PREFERENCES,
    'LANGUAGE_PREFERENCES must match shared contract',
  );
  assert.equal(canTransitionAccountStatus('PENDING_VERIFICATION', 'ACTIVE'), true);
  assert.equal(canTransitionAccountStatus('DELETION_REQUESTED', 'ACTIVE'), false);

  assert.equal(normalizeEmail('  Sourav.Sen@Example.COM '), 'sourav.sen@example.com');
  assert.equal(normalizeEmail('invalid-email'), null);
  assert.equal(normalizeIndianPhone('+91 98300-12345'), '+919830012345');
  assert.equal(normalizeIndianPhone('09830012345'), '+919830012345');
  assert.equal(normalizeIndianPhone('5830012345'), null);
  assert.deepEqual(resolveIdentifier('9830012345'), {
    type: 'phone',
    normalized: '+919830012345',
    masked: '+91******2345',
  });

  const hasher = new ScryptPasswordHasher();
  const pwHash = await hasher.hash('Kolkata#2026');
  assert.ok(pwHash.startsWith('$scrypt$n=16384,r=8,p=1$'), 'Password hash must use PHC scrypt');
  assert.equal(await hasher.verify('Kolkata#2026', pwHash), true);
  assert.equal(await hasher.verify('WrongPass#2026', pwHash), false);
  assert.equal(await hasher.verify('Kolkata#2026', 'malformed-hash'), false);
  await hasher.verifyDummy('any-password');

  const unitClock = createMutableClock();
  const jwtManager = new JwtTokenManager(
    {
      accessSecret: 'unit-access-secret-min-32-characters',
      refreshSecret: 'unit-refresh-secret-min-32-characters',
    },
    unitClock,
  );
  const shortJwt = jwtManager.signAccessToken({
    userId: 'usr-1',
    sessionId: 'ses-1',
    roles: ['CUSTOMER'],
    ttlSeconds: 10,
  });
  assert.equal(jwtManager.verifyAccessToken(shortJwt).sub, 'usr-1');
  unitClock.advanceSeconds(11);
  assert.throws(
    () => jwtManager.verifyAccessToken(shortJwt),
    (err) => err instanceof JwtVerificationError && err.reason === 'EXPIRED',
  );

  // Set up shared HTTP test harness with deterministic Clock, InMemoryIdentityStore & OTP capture
  const config = createTestConfig();
  const logger = createLogger({
    level: 'info',
    service: config.serviceName,
    environment: 'test',
    includeStack: false,
  });
  const clock = createMutableClock();
  const store = new InMemoryIdentityStore();
  const otpHarness = createCapturingOtpHarness(logger);
  const identityService = new IdentityService({
    config,
    store,
    otpAdapter: otpHarness.adapter,
    logger,
    clock,
  });
  const app = createApp({ config, logger, identityService });

  await withServer(app, async (baseUrl) => {
    // Test 2: Registration, forced CUSTOMER role, consent audit, validation & conflict detection
    const weakPwRes = await requestJson(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Arjun Bose',
        email: 'arjun.bose@example.com',
        password: 'weak',
        acceptTerms: true,
      },
    });
    assert.equal(weakPwRes.status, 400);
    assert.equal(weakPwRes.json.error.code, 'VALIDATION_ERROR');

    const noConsentRes = await requestJson(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Arjun Bose',
        email: 'arjun.bose@example.com',
        password: 'StrongPassword@1',
        acceptTerms: false,
      },
    });
    assert.equal(noConsentRes.status, 400);

    const regRes = await requestJson(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Arjun Bose',
        email: 'Arjun.Bose@Example.com',
        phone: '9830012345',
        password: 'StrongPassword@1',
        languagePreference: 'en-IN',
        acceptTerms: true,
        roles: ['SUPER_ADMIN'],
      },
    });
    assert.equal(regRes.status, 201);
    assert.equal(regRes.json.success, true);
    const regUser = regRes.json.data.user;
    assert.deepEqual(regUser.roles, ['CUSTOMER'], 'Public register must assign CUSTOMER role only');
    assert.equal(regUser.activeRole, 'CUSTOMER');
    assert.equal(regUser.emailMasked, 'ar***@example.com');
    assert.equal(regUser.phoneMasked, '+91******2345');
    assert.equal(regUser.passwordHash, undefined);
    assert.equal(regRes.json.data.tokens.tokenType, 'Bearer');

    const consents = store.getConsentsForUser(regUser.id);
    assert.equal(consents.length, 1);
    assert.equal(consents[0].consentType, 'TERMS_AND_PRIVACY');
    assert.equal(consents[0].source, 'register');

    const dupRes = await requestJson(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Duplicate Arjun',
        email: 'arjun.bose@example.com',
        password: 'StrongPassword@1',
        acceptTerms: true,
      },
    });
    assert.equal(dupRes.status, 409);
    assert.equal(dupRes.json.error.code, 'CONFLICT');

    // Test 3: Login & brute-force lockout enforcement and expiry recovery
    const unknownLogin = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: { identifier: 'nobody@example.com', password: 'StrongPassword@1' },
    });
    assert.equal(unknownLogin.status, 401);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const failRes = await requestJson(baseUrl, '/api/v1/auth/login', {
        method: 'POST',
        body: { identifier: 'arjun.bose@example.com', password: 'WrongPassword@9' },
      });
      assert.equal(failRes.status, 401, `Failure ${attempt} should return 401`);
    }

    const lockoutTrigger = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: { identifier: 'arjun.bose@example.com', password: 'WrongPassword@9' },
    });
    assert.equal(lockoutTrigger.status, 429);
    assert.equal(lockoutTrigger.json.error.code, 'RATE_LIMITED');

    const blockedEvenWithValid = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: { identifier: 'arjun.bose@example.com', password: 'StrongPassword@1' },
    });
    assert.equal(blockedEvenWithValid.status, 429);

    clock.advanceSeconds(config.loginLockoutSeconds + 1);
    const unlockedLogin = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: { identifier: 'arjun.bose@example.com', password: 'StrongPassword@1' },
    });
    assert.equal(unlockedLogin.status, 200);
    const activeAccessToken = unlockedLogin.json.data.tokens.accessToken;
    const activeRefreshToken = unlockedLogin.json.data.tokens.refreshToken;
    const activeSessionId = unlockedLogin.json.data.session.sessionId;

    const profileRes = await requestJson(baseUrl, '/api/v1/users/me', {
      headers: { Authorization: `Bearer ${activeAccessToken}` },
    });
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.json.data.id, regUser.id);

    // Test 4: OTP origin-bound SMS format, zero log leakage, throttling, brute-force, expiry & replay
    const { result: otp1Res, output: otpLogOutput } = await captureStdoutDuring(() =>
      requestJson(baseUrl, '/api/v1/auth/otp/send', {
        method: 'POST',
        body: { identifier: '9876543210' },
      }),
    );
    assert.equal(otp1Res.status, 200);
    assert.equal(otp1Res.json.data.channel, 'sms');
    assert.equal(otp1Res.json.data.maskedDestination, '+91******3210');

    const capturedOtp1 = otpHarness.testAdapter.getLatestMessage('+919876543210');
    assert.ok(capturedOtp1, 'OTP adapter must capture SMS delivery');
    assert.match(capturedOtp1.code, /^\d{6}$/);
    assert.ok(
      capturedOtp1.bodyText.endsWith(`\n@${config.appOriginHost} #${capturedOtp1.code}`),
      'SMS must end with origin-bound WebOTP line',
    );
    assert.equal(
      otpLogOutput.includes(capturedOtp1.code),
      false,
      'Plaintext OTP must never be logged',
    );
    assert.equal(
      otpLogOutput.includes('9876543210'),
      false,
      'Full mobile number must never appear in OTP logs',
    );

    // 3 wrong OTP verification attempts invalidate challenge
    const wrongOtpCode = capturedOtp1.code === '000000' ? '111111' : '000000';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const badOtpRes = await requestJson(baseUrl, '/api/v1/auth/otp/verify', {
        method: 'POST',
        body: {
          challengeId: otp1Res.json.data.challengeId,
          identifier: '9876543210',
          otp: wrongOtpCode,
        },
      });
      assert.equal(badOtpRes.status, 401);
    }
    const postLockRealOtp = await requestJson(baseUrl, '/api/v1/auth/otp/verify', {
      method: 'POST',
      body: {
        challengeId: otp1Res.json.data.challengeId,
        identifier: '9876543210',
        otp: capturedOtp1.code,
      },
    });
    assert.equal(postLockRealOtp.status, 401, 'Invalidated OTP challenge must reject real code');

    // Send 2 more OTPs in same window (total 3 allowed), then 4th triggers 429
    clock.advanceSeconds(10);
    const otp2Res = await requestJson(baseUrl, '/api/v1/auth/otp/send', {
      method: 'POST',
      body: { identifier: '9876543210' },
    });
    assert.equal(otp2Res.status, 200);
    clock.advanceSeconds(10);
    const otp3Res = await requestJson(baseUrl, '/api/v1/auth/otp/send', {
      method: 'POST',
      body: { identifier: '9876543210' },
    });
    assert.equal(otp3Res.status, 200);
    const capturedOtp3 = otpHarness.testAdapter.getLatestMessage('+919876543210');

    const otp4Throttled = await requestJson(baseUrl, '/api/v1/auth/otp/send', {
      method: 'POST',
      body: { identifier: '9876543210' },
    });
    assert.equal(otp4Throttled.status, 429);
    assert.equal(otp4Throttled.json.error.code, 'RATE_LIMITED');

    // Advance past OTP TTL and confirm expired OTP is rejected
    clock.advanceSeconds(config.otpTtlSeconds + 1);
    const expiredOtpRes = await requestJson(baseUrl, '/api/v1/auth/otp/verify', {
      method: 'POST',
      body: {
        challengeId: otp3Res.json.data.challengeId,
        identifier: '9876543210',
        otp: capturedOtp3.code,
      },
    });
    assert.equal(expiredOtpRes.status, 401);

    // Advance past OTP rate-limit block window and test successful OTP registration + replay guard
    clock.advanceSeconds(config.otpBlockSeconds + 1);
    const freshOtpSend = await requestJson(baseUrl, '/api/v1/auth/otp/send', {
      method: 'POST',
      body: { identifier: '9123456789' },
    });
    assert.equal(freshOtpSend.status, 200);
    const freshOtpMsg = otpHarness.testAdapter.getLatestMessage('+919123456789');

    const otpVerifySuccess = await requestJson(baseUrl, '/api/v1/auth/otp/verify', {
      method: 'POST',
      body: {
        challengeId: freshOtpSend.json.data.challengeId,
        identifier: '9123456789',
        otp: freshOtpMsg.code,
        name: 'Ananya Sen',
        languagePreference: 'bn-IN',
        acceptTerms: true,
      },
    });
    assert.equal(otpVerifySuccess.status, 200);
    assert.equal(otpVerifySuccess.json.data.user.phoneVerified, true);
    assert.equal(otpVerifySuccess.json.data.user.languagePreference, 'bn-IN');
    assert.deepEqual(otpVerifySuccess.json.data.user.roles, ['CUSTOMER']);

    const otpReplayRes = await requestJson(baseUrl, '/api/v1/auth/otp/verify', {
      method: 'POST',
      body: {
        challengeId: freshOtpSend.json.data.challengeId,
        identifier: '9123456789',
        otp: freshOtpMsg.code,
      },
    });
    assert.equal(otpReplayRes.status, 401, 'Consumed OTP cannot be replayed');

    // Test 5: Access token expiry, refresh rotation, and refresh replay family revocation
    clock.advanceSeconds(config.jwtAccessTtlSeconds + 1);
    const expiredJwtRes = await requestJson(baseUrl, '/api/v1/users/me', {
      headers: { Authorization: `Bearer ${activeAccessToken}` },
    });
    assert.equal(expiredJwtRes.status, 401);

    const refreshRes = await requestJson(baseUrl, '/api/v1/auth/refresh', {
      method: 'POST',
      body: { refreshToken: activeRefreshToken },
    });
    assert.equal(refreshRes.status, 200);
    const rotatedAccess = refreshRes.json.data.tokens.accessToken;
    const rotatedRefresh = refreshRes.json.data.tokens.refreshToken;
    assert.notEqual(rotatedRefresh, activeRefreshToken);
    assert.equal(refreshRes.json.data.session.sessionId, activeSessionId);

    const okAfterRefresh = await requestJson(baseUrl, '/api/v1/users/me', {
      headers: { Authorization: `Bearer ${rotatedAccess}` },
    });
    assert.equal(okAfterRefresh.status, 200);

    // Replay old consumed refresh token -> must reject AND revoke session family immediately
    const replayRefreshRes = await requestJson(baseUrl, '/api/v1/auth/refresh', {
      method: 'POST',
      body: { refreshToken: activeRefreshToken },
    });
    assert.equal(replayRefreshRes.status, 401);

    const revokedAccessAfterReplay = await requestJson(baseUrl, '/api/v1/users/me', {
      headers: { Authorization: `Bearer ${rotatedAccess}` },
    });
    assert.equal(revokedAccessAfterReplay.status, 401);

    const revokedNewRefreshAfterReplay = await requestJson(baseUrl, '/api/v1/auth/refresh', {
      method: 'POST',
      body: { refreshToken: rotatedRefresh },
    });
    assert.equal(revokedNewRefreshAfterReplay.status, 401);

    // Test 6: Session list, selective revocation, cookie + CSRF protection & /users/me PATCH
    const dev1 = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'X-Device-Name': 'Kolkata Desktop' },
      body: { identifier: 'arjun.bose@example.com', password: 'StrongPassword@1' },
    });
    assert.equal(dev1.status, 200);

    const dev2 = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'X-Device-Name': 'Pixel 8 Mobile' },
      body: { identifier: 'arjun.bose@example.com', password: 'StrongPassword@1' },
    });
    assert.equal(dev2.status, 200);

    const dev1Token = dev1.json.data.tokens.accessToken;
    const dev2Token = dev2.json.data.tokens.accessToken;
    const dev2SessionId = dev2.json.data.session.sessionId;

    const sessionsRes = await requestJson(baseUrl, '/api/v1/auth/sessions', {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    assert.equal(sessionsRes.status, 200);
    assert.ok(sessionsRes.json.data.sessions.length >= 2);
    assert.ok(
      sessionsRes.json.data.sessions.some(
        (s) => s.sessionId === dev1.json.data.session.sessionId && s.current,
      ),
    );

    const revokeDev2Res = await requestJson(baseUrl, `/api/v1/auth/sessions/${dev2SessionId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    assert.equal(revokeDev2Res.status, 200);

    const dev2ImmediateFail = await requestJson(baseUrl, '/api/v1/users/me', {
      headers: { Authorization: `Bearer ${dev2Token}` },
    });
    assert.equal(dev2ImmediateFail.status, 401, 'Revoked session must fail immediately');

    const patchProfileRes = await requestJson(baseUrl, '/api/v1/users/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dev1Token}` },
      body: { name: 'Arjun Chatterjee', languagePreference: 'bn-IN' },
    });
    assert.equal(patchProfileRes.status, 200);
    assert.equal(patchProfileRes.json.data.name, 'Arjun Chatterjee');
    assert.equal(patchProfileRes.json.data.languagePreference, 'bn-IN');

    // Cookie mode & CSRF double-submit verification
    const cookieLogin = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      headers: { 'X-Bhojora-Session-Mode': 'cookie' },
      body: { identifier: 'arjun.bose@example.com', password: 'StrongPassword@1' },
    });
    assert.equal(cookieLogin.status, 200);
    const cookieJar = parseSetCookieMap(cookieLogin.setCookies);
    assert.ok(cookieJar.bhojora_access, 'bhojora_access cookie must be issued');
    assert.ok(cookieJar.bhojora_refresh, 'bhojora_refresh cookie must be issued');
    assert.ok(cookieJar.bhojora_csrf, 'bhojora_csrf cookie must be issued');
    assert.ok(
      cookieLogin.setCookies.some(
        (c) =>
          c.startsWith('bhojora_access=') && c.includes('HttpOnly') && c.includes('SameSite=Lax'),
      ),
    );

    const cookieHeader = `bhojora_access=${encodeURIComponent(cookieJar.bhojora_access)}; bhojora_csrf=${encodeURIComponent(cookieJar.bhojora_csrf)}`;
    const logoutWithoutCsrf = await requestJson(baseUrl, '/api/v1/auth/logout', {
      method: 'POST',
      headers: { Cookie: cookieHeader },
    });
    assert.equal(logoutWithoutCsrf.status, 403);

    const logoutWithCsrf = await requestJson(baseUrl, '/api/v1/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        'X-Csrf-Token': cookieJar.bhojora_csrf,
      },
    });
    assert.equal(logoutWithCsrf.status, 200);

    // Test 7: Password recovery enumeration safety, expiry, replay & global session revocation
    const forgotUnknown = await requestJson(baseUrl, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { identifier: 'unknown-person@example.com' },
    });
    const forgotKnown = await requestJson(baseUrl, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { identifier: 'arjun.bose@example.com' },
    });
    assert.equal(forgotUnknown.status, 200);
    assert.equal(forgotKnown.status, 200);
    assert.deepEqual(forgotUnknown.json.data, forgotKnown.json.data);

    const recovery1 = otpHarness.testAdapter.getLatestMessage('arjun.bose@example.com');
    assert.ok(recovery1 && recovery1.purpose === 'recovery');

    // Expired recovery token rejected
    clock.advanceSeconds(config.recoveryTtlSeconds + 1);
    const expiredReset = await requestJson(baseUrl, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: {
        identifier: 'arjun.bose@example.com',
        token: recovery1.code,
        newPassword: 'UpdatedPassword@2',
      },
    });
    assert.equal(expiredReset.status, 401);

    // Fresh recovery token succeeds, revokes dev1Token session, prevents replay, updates password
    const forgotKnown2 = await requestJson(baseUrl, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { identifier: 'arjun.bose@example.com' },
    });
    assert.equal(forgotKnown2.status, 200);
    const recovery2 = otpHarness.testAdapter.getLatestMessage('arjun.bose@example.com');

    const resetSuccess = await requestJson(baseUrl, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: {
        identifier: 'arjun.bose@example.com',
        token: recovery2.code,
        newPassword: 'UpdatedPassword@2',
      },
    });
    assert.equal(resetSuccess.status, 200);
    assert.equal(resetSuccess.json.data.passwordReset, true);
    assert.ok(resetSuccess.json.data.revokedSessions >= 1);

    const dev1AfterReset = await requestJson(baseUrl, '/api/v1/users/me', {
      headers: { Authorization: `Bearer ${dev1Token}` },
    });
    assert.equal(dev1AfterReset.status, 401, 'Password reset must revoke active sessions');

    const replayReset = await requestJson(baseUrl, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: {
        identifier: 'arjun.bose@example.com',
        token: recovery2.code,
        newPassword: 'AnotherPassword@3',
      },
    });
    assert.equal(replayReset.status, 401, 'Recovery token cannot be replayed');

    const oldPwLogin = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: { identifier: 'arjun.bose@example.com', password: 'StrongPassword@1' },
    });
    assert.equal(oldPwLogin.status, 401);

    const newPwLogin = await requestJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: { identifier: 'arjun.bose@example.com', password: 'UpdatedPassword@2' },
    });
    assert.equal(newPwLogin.status, 200);
  });

  // Test 8: Mongoose models, identity DB indexes & Customer-Web Auth UI foundation checks
  assert.ok(INITIAL_DATABASE_INDEXES.length >= 30, 'Identity indexes must be registered');
  for (const collection of [
    COLLECTION_NAMES.userSessions,
    COLLECTION_NAMES.authChallenges,
    COLLECTION_NAMES.consentRecords,
    COLLECTION_NAMES.authRateLimits,
  ]) {
    assert.ok(
      INITIAL_DATABASE_INDEXES.some((idx) => idx.collection === collection),
      `Missing database indexes for collection ${collection}`,
    );
  }
  assert.ok(
    INITIAL_DATABASE_INDEXES.some(
      (idx) =>
        idx.collection === COLLECTION_NAMES.authChallenges && idx.options.expireAfterSeconds === 0,
    ),
    'auth_challenges must declare TTL index expireAfterSeconds: 0',
  );

  const mockConn = mongoose.createConnection();
  try {
    const models = createMongooseIdentityModels(mockConn);
    assert.equal(models.User.collection.name, COLLECTION_NAMES.users);
    assert.equal(models.UserSession.collection.name, COLLECTION_NAMES.userSessions);
    assert.equal(models.AuthChallenge.collection.name, COLLECTION_NAMES.authChallenges);
    assert.equal(models.ConsentRecord.collection.name, COLLECTION_NAMES.consentRecords);
    assert.equal(models.AuthRateLimit.collection.name, COLLECTION_NAMES.authRateLimits);
    assert.deepEqual(models.User.schema.path('status').options.enum, [...ACCOUNT_STATUSES]);
  } finally {
    await mockConn.close();
  }

  const customerHtml = fs.readFileSync(
    path.join(REPO_ROOT, 'client/customer-web/index.html'),
    'utf8',
  );
  assert.ok(customerHtml.includes('id="openAuthModalBtn"'), 'Header must expose Sign In trigger');
  assert.ok(customerHtml.includes('<dialog id="authModal"'), 'Auth modal must use native dialog');
  assert.ok(customerHtml.includes('id="otpCodeInput"'), 'OTP form must include #otpCodeInput');
  assert.ok(
    customerHtml.includes('inputmode="numeric"'),
    'OTP field must declare numeric inputmode',
  );
  assert.ok(
    customerHtml.includes('autocomplete="one-time-code"'),
    'OTP field must support browser one-time-code autofill',
  );
  assert.ok(customerHtml.includes('autocomplete="current-password"'));
  assert.ok(customerHtml.includes('autocomplete="new-password"'));
  assert.ok(customerHtml.includes('id="authSessionPanel"'));
  assert.equal(customerHtml.includes('github.com'), false, 'Customer-web must omit GitHub links');
  assert.ok(customerHtml.includes('./logo.png'), 'Brand logo ./logo.png must remain present');

  console.log(
    'Checkpoint 07 verification passed: identity APIs, scrypt, JWT rotation/replay, OTP throttling/expiry, recovery, Mongoose schemas & auth UI verified.',
  );
}

main().catch((error) => {
  console.error('Checkpoint 07 verification failed:', error);
  process.exit(1);
});
