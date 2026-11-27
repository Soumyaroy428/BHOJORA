'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');

const { createApp } = require('../dist/app.js');
const { validateEnv } = require('../dist/config/env.js');
const { createLogger } = require('../dist/config/logger.js');
const { InMemoryIdentityStore } = require('../dist/modules/identity/identity.models.js');

function createMutableClock(initialIso = '2026-11-26T12:00:00.000Z') {
  let currentMs = Date.parse(initialIso);
  return {
    now: () => new Date(currentMs),
    advanceSeconds: (sec) => {
      currentMs += sec * 1000;
    },
  };
}

function createLocalSmtpServer() {
  const capturedEmails = [];
  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    const currentMail = { ehlo: '', mailFrom: '', rcptTo: '', data: '' };

    socket.setEncoding('utf8');
    socket.write('220 localhost ESMTP BhojoraTest\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk;
      while (true) {
        const idx = buffer.indexOf('\r\n');
        if (idx === -1) {
          break;
        }
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        if (inData) {
          if (line === '.') {
            inData = false;
            capturedEmails.push({ ...currentMail });
            socket.write('250 2.0.0 OK queued\r\n');
          } else {
            currentMail.data += (line.startsWith('..') ? line.slice(1) : line) + '\r\n';
          }
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          currentMail.ehlo = line;
          socket.write('250-localhost\r\n250 AUTH PLAIN\r\n');
        } else if (upper.startsWith('AUTH PLAIN')) {
          socket.write('235 2.7.0 Authentication succeeded\r\n');
        } else if (upper.startsWith('MAIL FROM:')) {
          currentMail.mailFrom = line;
          socket.write('250 2.1.0 Originator ok\r\n');
        } else if (upper.startsWith('RCPT TO:')) {
          currentMail.rcptTo = line;
          socket.write('250 2.1.5 Recipient ok\r\n');
        } else if (upper === 'DATA') {
          inData = true;
          socket.write('354 Start mail input; end with <CRLF>.<CRLF>\r\n');
        } else if (upper === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('502 Command not implemented\r\n');
        }
      }
    });
  });

  return { server, capturedEmails };
}

async function apiJson(baseUrl, path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { status: res.status, headers: res.headers, json };
}

function extractRecoveryToken(mimeData) {
  const match = /password recovery token \(([^)]+)\)/i.exec(mimeData);
  assert.ok(match && match[1], `Expected recovery token in email body, got:\n${mimeData}`);
  return match[1];
}

async function run() {
  console.log('--- Starting Email Recovery Code End-to-End Verification ---');

  const { server: smtpServer, capturedEmails } = createLocalSmtpServer();
  await new Promise((resolve) => smtpServer.listen(0, '127.0.0.1', resolve));
  const smtpPort = smtpServer.address().port;

  const clock = createMutableClock();
  const config = validateEnv({
    NODE_ENV: 'test',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/bhojora_test',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_ACCESS_SECRET: 'test-access-secret-key-minimum-32-chars-01234',
    JWT_REFRESH_SECRET: 'test-refresh-secret-key-minimum-32-chars-56789',
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(smtpPort),
    SMTP_SECURE: 'false',
    SMTP_FROM: 'BHOJORA Security <no-reply@bhojora.in>',
    LOG_LEVEL: 'error',
  });

  const logger = createLogger({
    level: 'error',
    service: 'bhojora-recovery-email-test',
    environment: 'test',
  });

  const app = createApp({
    config,
    logger,
    clock,
    identityStore: new InMemoryIdentityStore(),
  });

  const httpServer = http.createServer(app);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;

  try {
    const email = 'recovery.tester@example.com';
    const initialPassword = 'OldStrong@Password1';
    const updatedPassword = 'NewStrong@Password2';

    // 1. Register user by email and keep active sessions
    const reg = await apiJson(baseUrl, '/api/v1/auth/register', {
      method: 'POST',
      body: {
        name: 'Recovery Email Tester',
        email,
        password: initialPassword,
        acceptTerms: true,
        deviceName: 'Initial Web Session',
      },
    });
    assert.equal(reg.status, 201);
    const activeToken1 = reg.json.data.tokens.accessToken;

    const login2 = await apiJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: {
        identifier: email,
        password: initialPassword,
        deviceName: 'Second Session',
      },
    });
    assert.equal(login2.status, 200);
    const activeToken2 = login2.json.data.tokens.accessToken;

    // 2. Enumeration check: unregistered email returns identical 200 and sends 0 emails
    const forgotUnknown = await apiJson(baseUrl, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { identifier: 'nobody.here@example.com' },
    });
    assert.equal(forgotUnknown.status, 200);
    assert.equal(capturedEmails.length, 0);

    // 3. Request recovery code via mixed-case + padded email -> actual SMTP MIME delivery
    const forgotEmail1 = await apiJson(baseUrl, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { identifier: '  Recovery.Tester@Example.COM  ' },
    });
    assert.equal(forgotEmail1.status, 200);
    assert.deepEqual(forgotEmail1.json.data, forgotUnknown.json.data);
    assert.equal(capturedEmails.length, 1);

    const mail1 = capturedEmails[0];
    assert.equal(mail1.mailFrom, 'MAIL FROM:<no-reply@bhojora.in>');
    assert.equal(mail1.rcptTo, `RCPT TO:<${email}>`);
    assert.match(mail1.data, /Subject: BHOJORA Account Recovery Code/);
    assert.match(mail1.data, /From: BHOJORA Security <no-reply@bhojora\.in>/);
    const token1 = extractRecoveryToken(mail1.data);
    assert.ok(token1.length >= 32, 'Email recovery token must be high-entropy');
    console.log(`PASS [1/6] Email recovery dispatched over SMTP to ${email}`);

    // 4. Brute-force guard: 3 failed attempts invalidate challenge, 4th locks for 1h even WITHOUT new /forgot-password
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const wrong = await apiJson(baseUrl, '/api/v1/auth/reset-password', {
        method: 'POST',
        body: {
          identifier: email,
          token: `wrong-recovery-token-${attempt}`,
          newPassword: updatedPassword,
        },
      });
      assert.equal(wrong.status, 401);
    }
    const fourthWrong = await apiJson(baseUrl, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: {
        identifier: email,
        token: token1, // even with old token or wrong token, lockout must block 4th attempt
        newPassword: updatedPassword,
      },
    });
    assert.equal(fourthWrong.status, 429);
    assert.equal(fourthWrong.headers.get('retry-after'), '3600');
    console.log(
      'PASS [2/6] 4 failed recovery attempts trigger 1-hour (3600s) lockout without bypass',
    );

    // Advance past 1-hour lockout
    clock.advanceSeconds(config.loginLockoutSeconds + 5);

    // 5. Expiry check
    const forgotEmail2 = await apiJson(baseUrl, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { identifier: email },
    });
    assert.equal(forgotEmail2.status, 200);
    assert.equal(capturedEmails.length, 2);
    const token2 = extractRecoveryToken(capturedEmails[1].data);

    clock.advanceSeconds(config.recoveryTtlSeconds + 1);
    const expiredReset = await apiJson(baseUrl, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: {
        identifier: email,
        token: token2,
        newPassword: updatedPassword,
      },
    });
    assert.equal(expiredReset.status, 401);
    console.log('PASS [3/6] Expired email recovery code rejected (401)');

    // Reset rate limit counter won't block since only 1 attempt after lockout; request fresh recovery code #3
    const forgotEmail3 = await apiJson(baseUrl, '/api/v1/auth/forgot-password', {
      method: 'POST',
      body: { identifier: email },
    });
    assert.equal(forgotEmail3.status, 200);
    assert.equal(capturedEmails.length, 3);
    const token3 = extractRecoveryToken(capturedEmails[2].data);

    // Earlier invalidated/superseded token must fail
    const supersededReset = await apiJson(baseUrl, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: {
        identifier: email,
        token: token2,
        newPassword: updatedPassword,
      },
    });
    assert.equal(supersededReset.status, 401);
    console.log('PASS [4/6] Superseded email recovery token rejected (401)');

    // 6. Successful reset with emailed code revokes ALL active sessions, updates password, blocks replay
    const validReset = await apiJson(baseUrl, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: {
        identifier: 'Recovery.Tester@Example.COM',
        token: token3,
        newPassword: updatedPassword,
      },
    });
    assert.equal(validReset.status, 200);
    assert.equal(validReset.json.data.passwordReset, true);
    assert.equal(validReset.json.data.revokedSessions, 2);

    const me1After = await apiJson(baseUrl, '/api/v1/users/me', { token: activeToken1 });
    const me2After = await apiJson(baseUrl, '/api/v1/users/me', { token: activeToken2 });
    assert.equal(me1After.status, 401);
    assert.equal(me2After.status, 401);

    const replayReset = await apiJson(baseUrl, '/api/v1/auth/reset-password', {
      method: 'POST',
      body: {
        identifier: email,
        token: token3,
        newPassword: 'AnotherStrong@Password3',
      },
    });
    assert.equal(replayReset.status, 401);
    console.log('PASS [5/6] Valid emailed code resets password, revokes 2 sessions, blocks replay');

    // 7. Old password fails, new password works
    const oldLogin = await apiJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: { identifier: email, password: initialPassword },
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await apiJson(baseUrl, '/api/v1/auth/login', {
      method: 'POST',
      body: { identifier: email, password: updatedPassword },
    });
    assert.equal(newLogin.status, 200);
    console.log('PASS [6/6] Old password rejected and new password sign-in succeeded');
    console.log('ALL EMAIL RECOVERY CODE TESTS PASSED CLEANLY.');
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
    await new Promise((resolve) => smtpServer.close(resolve));
  }
}

run().catch((err) => {
  console.error('Email Recovery Test Failed:', err);
  process.exit(1);
});
