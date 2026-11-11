import crypto from 'node:crypto';
import type { Clock, UserRole } from './identity.types';

const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
  keyLen: 64,
} as const;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const INDIAN_MOBILE_REGEX = /^(?:\+?91|0)?([6-9]\d{9})$/;

// Precomputed dummy scrypt hash matching SCRYPT_PARAMS so login checks for unknown accounts take consistent work.
const DUMMY_PASSWORD_SALT = crypto.randomBytes(16).toString('base64');
const DUMMY_PASSWORD_HASH = crypto
  .scryptSync('bhojora-dummy-timing-guard', DUMMY_PASSWORD_SALT, SCRYPT_PARAMS.keyLen, {
    N: SCRYPT_PARAMS.N,
    r: SCRYPT_PARAMS.r,
    p: SCRYPT_PARAMS.p,
  })
  .toString('base64');
const DUMMY_PHC_HASH = `$scrypt$n=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${DUMMY_PASSWORD_SALT}$${DUMMY_PASSWORD_HASH}`;

export interface NormalizedIdentifier {
  type: 'email' | 'phone';
  normalized: string;
  masked: string;
}

export function normalizeEmail(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed || trimmed.length > 254 || !EMAIL_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function normalizeIndianPhone(raw: string): string | null {
  const compact = raw.replace(/[\s\-()]/g, '');
  const match = INDIAN_MOBILE_REGEX.exec(compact);
  if (!match || !match[1]) {
    return null;
  }
  return `+91${match[1]}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) {
    return '***';
  }
  const visiblePrefix = local.slice(0, Math.min(2, local.length));
  return `${visiblePrefix}***@${domain}`;
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) {
    return '***';
  }
  const suffix = phone.slice(-4);
  return `+91******${suffix}`;
}

export function resolveIdentifier(raw: string): NormalizedIdentifier | null {
  const email = normalizeEmail(raw);
  if (email) {
    return {
      type: 'email',
      normalized: email,
      masked: maskEmail(email),
    };
  }
  const phone = normalizeIndianPhone(raw);
  if (phone) {
    return {
      type: 'phone',
      normalized: phone,
      masked: maskPhone(phone),
    };
  }
  return null;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, storedHash: string): Promise<boolean>;
  verifyDummy(password: string): Promise<void>;
}

function scryptAsync(
  password: string,
  salt: string,
  keyLen: number,
  options: crypto.ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, options, (err, derived) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derived);
    });
  });
}

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = crypto.randomBytes(16).toString('base64');
    const derived = await scryptAsync(password, salt, SCRYPT_PARAMS.keyLen, {
      N: SCRYPT_PARAMS.N,
      r: SCRYPT_PARAMS.r,
      p: SCRYPT_PARAMS.p,
    });
    return `$scrypt$n=${SCRYPT_PARAMS.N},r=${SCRYPT_PARAMS.r},p=${SCRYPT_PARAMS.p}$${salt}$${derived.toString('base64')}`;
  }

  async verify(password: string, storedHash: string): Promise<boolean> {
    const parts = storedHash.split('$');
    if (parts.length !== 5 || parts[1] !== 'scrypt') {
      return false;
    }

    const paramSegment = parts[2];
    const salt = parts[3];
    const expectedB64 = parts[4];
    if (!paramSegment || !salt || !expectedB64) {
      return false;
    }

    const params: Record<string, number> = {};
    for (const pair of paramSegment.split(',')) {
      const [key, value] = pair.split('=');
      if (key && value) {
        params[key] = Number(value);
      }
    }

    const N = params['n'];
    const r = params['r'];
    const p = params['p'];
    if (!N || !r || !p) {
      return false;
    }

    const expectedBuf = Buffer.from(expectedB64, 'base64');
    if (expectedBuf.length === 0) {
      return false;
    }

    const derived = await scryptAsync(password, salt, expectedBuf.length, { N, r, p });
    return derived.length === expectedBuf.length && crypto.timingSafeEqual(derived, expectedBuf);
  }

  async verifyDummy(password: string): Promise<void> {
    await this.verify(password, DUMMY_PHC_HASH);
  }
}

export function generateNumericOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function generateOpaqueSecretToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashSecretToken(rawValue: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawValue, 'utf8').digest('hex');
}

export function hashAuditValue(rawValue: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawValue, 'utf8').digest('hex').slice(0, 32);
}

export function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  return bufA.length === bufB.length && bufA.length > 0 && crypto.timingSafeEqual(bufA, bufB);
}

export interface JwtAccessClaims {
  typ: 'access';
  sub: string;
  sid: string;
  roles: UserRole[];
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export interface JwtRefreshClaims {
  typ: 'refresh';
  sub: string;
  sid: string;
  fam: string;
  gen: number;
  jti: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

export type JwtVerificationErrorCode = 'EXPIRED' | 'INVALID';

export class JwtVerificationError extends Error {
  constructor(
    public readonly reason: JwtVerificationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'JwtVerificationError';
  }
}

const JWT_ISSUER = 'bhojora-api';
const JWT_AUDIENCE = 'bhojora-clients';

function encodeBase64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function signHs256(signingInput: string, secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(signingInput, 'utf8').digest();
}

export class JwtTokenManager {
  constructor(
    private readonly secrets: { accessSecret: string; refreshSecret: string },
    private readonly clock: Clock,
  ) {}

  signAccessToken(params: {
    userId: string;
    sessionId: string;
    roles: UserRole[];
    ttlSeconds: number;
  }): string {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const claims: JwtAccessClaims = {
      typ: 'access',
      sub: params.userId,
      sid: params.sessionId,
      roles: [...params.roles],
      jti: crypto.randomUUID(),
      iat,
      exp: iat + params.ttlSeconds,
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    };
    return this.signPayload(claims, this.secrets.accessSecret);
  }

  signRefreshToken(params: {
    userId: string;
    sessionId: string;
    familyId: string;
    generation: number;
    ttlSeconds: number;
  }): string {
    const iat = Math.floor(this.clock.now().getTime() / 1000);
    const claims: JwtRefreshClaims = {
      typ: 'refresh',
      sub: params.userId,
      sid: params.sessionId,
      fam: params.familyId,
      gen: params.generation,
      jti: crypto.randomUUID(),
      iat,
      exp: iat + params.ttlSeconds,
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
    };
    return this.signPayload(claims, this.secrets.refreshSecret);
  }

  verifyAccessToken(token: string): JwtAccessClaims {
    const payload = this.verifyPayload<JwtAccessClaims>(token, this.secrets.accessSecret);
    if (
      payload.typ !== 'access' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      !Array.isArray(payload.roles)
    ) {
      throw new JwtVerificationError('INVALID', 'Malformed access token claims');
    }
    return payload;
  }

  verifyRefreshToken(token: string): JwtRefreshClaims {
    const payload = this.verifyPayload<JwtRefreshClaims>(token, this.secrets.refreshSecret);
    if (
      payload.typ !== 'refresh' ||
      typeof payload.sub !== 'string' ||
      typeof payload.sid !== 'string' ||
      typeof payload.fam !== 'string' ||
      typeof payload.gen !== 'number'
    ) {
      throw new JwtVerificationError('INVALID', 'Malformed refresh token claims');
    }
    return payload;
  }

  private signPayload(claims: object, secret: string): string {
    const headerSegment = encodeBase64UrlJson({ alg: 'HS256', typ: 'JWT' });
    const payloadSegment = encodeBase64UrlJson(claims);
    const signingInput = `${headerSegment}.${payloadSegment}`;
    const sigSegment = signHs256(signingInput, secret).toString('base64url');
    return `${signingInput}.${sigSegment}`;
  }

  private verifyPayload<T extends { iss?: string; aud?: string; exp?: number }>(
    token: string,
    secret: string,
  ): T {
    const segments = token.split('.');
    if (segments.length !== 3) {
      throw new JwtVerificationError('INVALID', 'Invalid JWT format');
    }

    const [headerSeg, payloadSeg, sigSeg] = segments;
    if (!headerSeg || !payloadSeg || !sigSeg) {
      throw new JwtVerificationError('INVALID', 'Invalid JWT segment structure');
    }

    let header: { alg?: string; typ?: string };
    try {
      header = JSON.parse(Buffer.from(headerSeg, 'base64url').toString('utf8')) as {
        alg?: string;
        typ?: string;
      };
    } catch {
      throw new JwtVerificationError('INVALID', 'Malformed JWT header');
    }

    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      throw new JwtVerificationError('INVALID', 'Unsupported JWT algorithm');
    }

    const expectedSig = signHs256(`${headerSeg}.${payloadSeg}`, secret);
    let actualSig: Buffer;
    try {
      actualSig = Buffer.from(sigSeg, 'base64url');
    } catch {
      throw new JwtVerificationError('INVALID', 'Malformed JWT signature');
    }

    if (
      actualSig.length !== expectedSig.length ||
      !crypto.timingSafeEqual(actualSig, expectedSig)
    ) {
      throw new JwtVerificationError('INVALID', 'JWT signature verification failed');
    }

    let payload: T;
    try {
      payload = JSON.parse(Buffer.from(payloadSeg, 'base64url').toString('utf8')) as T;
    } catch {
      throw new JwtVerificationError('INVALID', 'Malformed JWT payload');
    }

    if (payload.iss !== JWT_ISSUER || payload.aud !== JWT_AUDIENCE) {
      throw new JwtVerificationError('INVALID', 'Invalid JWT issuer or audience');
    }

    const nowSeconds = Math.floor(this.clock.now().getTime() / 1000);
    if (typeof payload.exp !== 'number' || nowSeconds >= payload.exp) {
      throw new JwtVerificationError('EXPIRED', 'Token has expired');
    }

    return payload;
  }
}
