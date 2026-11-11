import crypto from 'node:crypto';
import { z } from 'zod';
import type { AppConfig } from '../../config/env-types';
import type { Logger } from '../../config/logger';
import { AppError } from '../../middleware/error-handler';
import {
  generateNumericOtp,
  generateOpaqueSecretToken,
  hashAuditValue,
  hashSecretToken,
  JwtTokenManager,
  JwtVerificationError,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizeIndianPhone,
  resolveIdentifier,
  ScryptPasswordHasher,
  timingSafeHexEqual,
  type PasswordHasher,
} from './identity.crypto';
import {
  canTransitionAccountStatus,
  LANGUAGE_PREFERENCES,
  SYSTEM_CLOCK,
  type AuthSessionResponseDto,
  type AuthSessionSummaryDto,
  type Clock,
  type ForgotPasswordResponseDto,
  type IdentityStore,
  type OtpChannel,
  type OtpSendResponseDto,
  type RequestMetadata,
  type UserProfileDto,
  type UserRecord,
  type UserRole,
  type UserSessionRecord,
} from './identity.types';
import { formatOriginBoundOtpSms } from './otp.adapter';

const STRONG_PASSWORD_REGEX = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[\W_]).{8,128}$/;

const registerSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    email: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128)
      .regex(
        STRONG_PASSWORD_REGEX,
        'Password must contain uppercase, lowercase, numeric, and special characters',
      ),
    languagePreference: z.enum(LANGUAGE_PREFERENCES).default('en-IN'),
    acceptTerms: z.literal(true, {
      error: 'Terms and privacy policy consent is required',
    }),
    deviceName: z.string().trim().min(1).max(120).optional(),
  })
  .refine((data) => Boolean(data.email || data.phone), {
    message: 'At least one of email or Indian mobile phone number is required',
    path: ['email'],
  });

const loginSchema = z.object({
  identifier: z.string().trim().min(3, 'Email or mobile number is required').max(254),
  password: z.string().min(1, 'Password is required').max(128),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

const otpSendSchema = z.object({
  identifier: z.string().trim().min(3, 'Mobile number or email is required').max(254),
  channel: z.enum(['sms', 'email']).optional(),
});

const otpVerifySchema = z.object({
  challengeId: z.string().trim().uuid('Valid challengeId is required'),
  identifier: z.string().trim().min(3).max(254),
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'OTP must be a 6-digit numeric code'),
  name: z.string().trim().min(1).max(120).optional(),
  languagePreference: z.enum(LANGUAGE_PREFERENCES).default('en-IN'),
  acceptTerms: z.boolean().optional(),
  deviceName: z.string().trim().min(1).max(120).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().trim().min(10, 'Refresh token is required'),
});

const forgotPasswordSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
});

const resetPasswordSchema = z.object({
  identifier: z.string().trim().min(3).max(254),
  token: z.string().trim().min(6).max(256),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128)
    .regex(
      STRONG_PASSWORD_REGEX,
      'Password must contain uppercase, lowercase, numeric, and special characters',
    ),
});

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    languagePreference: z.enum(LANGUAGE_PREFERENCES).optional(),
  })
  .refine((data) => data.name !== undefined || data.languagePreference !== undefined, {
    message: 'At least one profile field must be provided',
  });

export interface AuthenticatedContext {
  userId: string;
  sessionId: string;
  roles: UserRole[];
  user: UserProfileDto;
}

export interface CreateIdentityServiceOptions {
  config: AppConfig;
  store: IdentityStore;
  otpAdapter: { sendOtp(msg: import('./identity.types').OtpDeliveryMessage): Promise<void> };
  logger: Logger;
  clock?: Clock;
  passwordHasher?: PasswordHasher;
}

function summarizeUserAgent(userAgent?: string): string {
  if (!userAgent) {
    return 'unknown-client';
  }
  return userAgent.slice(0, 160);
}

function resolveDeviceName(meta: RequestMetadata): string {
  if (meta.deviceName && meta.deviceName.trim().length > 0) {
    return meta.deviceName.trim().slice(0, 120);
  }
  const ua = meta.userAgent ?? '';
  if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) {
    return 'Mobile Device';
  }
  if (ua.includes('Mozilla')) {
    return 'Web Browser';
  }
  return 'API Client';
}

function toUserProfileDto(user: UserRecord): UserProfileDto {
  return {
    id: user.id,
    name: user.name,
    emailMasked: user.emailNormalized ? maskEmail(user.emailNormalized) : null,
    phoneMasked: user.phoneNormalized ? maskPhone(user.phoneNormalized) : null,
    roles: [...user.roles],
    activeRole: user.roles[0] ?? 'CUSTOMER',
    status: user.status,
    languagePreference: user.languagePreference,
    phoneVerified: user.phoneVerified,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
  };
}

function toSessionSummaryDto(session: UserSessionRecord, current: boolean): AuthSessionSummaryDto {
  return {
    sessionId: session.sessionId,
    deviceName: session.deviceName,
    createdAt: session.createdAt.toISOString(),
    lastRotatedAt: session.lastRotatedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    current,
  };
}

export class IdentityService {
  private readonly clock: Clock;
  private readonly hasher: PasswordHasher;
  private readonly jwt: JwtTokenManager;

  constructor(private readonly options: CreateIdentityServiceOptions) {
    this.clock = options.clock ?? SYSTEM_CLOCK;
    this.hasher = options.passwordHasher ?? new ScryptPasswordHasher();
    this.jwt = new JwtTokenManager(
      {
        accessSecret: options.config.jwtAccessSecret,
        refreshSecret: options.config.jwtRefreshSecret,
      },
      this.clock,
    );
  }

  async register(rawInput: unknown, meta: RequestMetadata): Promise<AuthSessionResponseDto> {
    const input = registerSchema.parse(rawInput);
    const now = this.clock.now();

    const emailNormalized = input.email ? normalizeEmail(input.email) : null;
    if (input.email && !emailNormalized) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid email address format', [
        { field: 'email', issue: 'Enter a valid email address' },
      ]);
    }

    const phoneNormalized = input.phone ? normalizeIndianPhone(input.phone) : null;
    if (input.phone && !phoneNormalized) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid Indian mobile number format', [
        { field: 'phone', issue: 'Enter a valid 10-digit Indian mobile number' },
      ]);
    }

    const existing = await this.options.store.findUserByIdentifier({
      ...(emailNormalized ? { emailNormalized } : {}),
      ...(phoneNormalized ? { phoneNormalized } : {}),
    });
    if (existing) {
      throw new AppError(409, 'CONFLICT', 'An account already exists with these credentials');
    }

    const passwordHash = await this.hasher.hash(input.password);
    // Privilege safety: self-registration assigns only CUSTOMER regardless of any extraneous client fields.
    const user = await this.options.store.createUserWithConsent(
      {
        name: input.name,
        emailNormalized,
        phoneNormalized,
        passwordHash,
        roles: ['CUSTOMER'],
        status: 'ACTIVE',
        languagePreference: input.languagePreference,
        phoneVerified: false,
        emailVerified: false,
        now,
      },
      {
        consentType: 'TERMS_AND_PRIVACY',
        policyVersion: 'v1.0.0',
        source: 'register',
      },
    );

    const result = await this.issueNewSession(user, {
      ...meta,
      deviceName: input.deviceName ?? meta.deviceName,
    });

    this.options.logger.info('identity.user.registered', {
      requestId: meta.requestId,
      userId: user.id,
      languagePreference: user.languagePreference,
    });

    return result;
  }

  async login(rawInput: unknown, meta: RequestMetadata): Promise<AuthSessionResponseDto> {
    const input = loginSchema.parse(rawInput);
    const now = this.clock.now();
    const resolved = resolveIdentifier(input.identifier);
    const subjectKey = resolved
      ? resolved.normalized
      : `raw:${hashAuditValue(input.identifier, this.options.config.jwtAccessSecret)}`;
    const ipSubjectKey = `ip:${hashAuditValue(meta.ipAddress, this.options.config.jwtAccessSecret)}:id:${hashAuditValue(subjectKey, this.options.config.jwtAccessSecret)}`;

    const lockStatus = await this.options.store.getRateLimitBlockStatus({
      scope: 'login_fail',
      subjectKey: ipSubjectKey,
      now,
    });
    if (!lockStatus.allowed) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        `Too many failed login attempts. Try again in ${lockStatus.retryAfterSeconds} seconds.`,
      );
    }

    const user = resolved
      ? await this.options.store.findUserByIdentifier(
          resolved.type === 'email'
            ? { emailNormalized: resolved.normalized }
            : { phoneNormalized: resolved.normalized },
        )
      : null;

    let passwordMatches = false;
    if (user?.passwordHash) {
      passwordMatches = await this.hasher.verify(input.password, user.passwordHash);
    } else {
      await this.hasher.verifyDummy(input.password);
    }

    if (!user || !passwordMatches) {
      const failureState = await this.options.store.consumeRateLimitWindow({
        scope: 'login_fail',
        subjectKey: ipSubjectKey,
        maxCount: this.options.config.loginMaxFailures - 1,
        windowSeconds: this.options.config.loginLockoutSeconds,
        blockSeconds: this.options.config.loginLockoutSeconds,
        now,
      });

      this.options.logger.warn('identity.login.failed', {
        requestId: meta.requestId,
        attemptCount: failureState.count,
        blocked: !failureState.allowed,
      });

      if (!failureState.allowed) {
        throw new AppError(
          429,
          'RATE_LIMITED',
          `Too many failed login attempts. Try again in ${failureState.retryAfterSeconds} seconds.`,
        );
      }
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid credentials');
    }

    if (user.status !== 'ACTIVE') {
      throw new AppError(403, 'FORBIDDEN', `Account status ${user.status} cannot sign in`);
    }

    await this.options.store.resetRateLimit('login_fail', ipSubjectKey);
    const updatedUser =
      (await this.options.store.updateUser(user.id, { lastLoginAt: now }, now)) ?? user;

    return this.issueNewSession(updatedUser, {
      ...meta,
      deviceName: input.deviceName ?? meta.deviceName,
    });
  }

  async sendOtp(rawInput: unknown, meta: RequestMetadata): Promise<OtpSendResponseDto> {
    const input = otpSendSchema.parse(rawInput);
    const now = this.clock.now();
    const resolved = resolveIdentifier(input.identifier);
    if (!resolved) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Enter a valid Indian mobile number or email address',
        [{ field: 'identifier', issue: 'Must be a 10-digit Indian mobile number or valid email' }],
      );
    }

    const channel: OtpChannel = input.channel ?? (resolved.type === 'phone' ? 'sms' : 'email');
    if (resolved.type === 'email' && channel === 'sms') {
      throw new AppError(400, 'VALIDATION_ERROR', 'SMS OTP requires a valid mobile number');
    }
    if (resolved.type === 'phone' && channel === 'email') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Email OTP requires a valid email address');
    }

    const idLimit = await this.options.store.consumeRateLimitWindow({
      scope: 'otp_send',
      subjectKey: `id:${resolved.normalized}`,
      maxCount: this.options.config.otpMaxSendPerWindow,
      windowSeconds: this.options.config.otpWindowSeconds,
      blockSeconds: this.options.config.otpBlockSeconds,
      now,
    });
    if (!idLimit.allowed) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        `Too many OTP requests. Try again in ${idLimit.retryAfterSeconds} seconds.`,
      );
    }

    const ipLimit = await this.options.store.consumeRateLimitWindow({
      scope: 'otp_send',
      subjectKey: `ip:${hashAuditValue(meta.ipAddress, this.options.config.jwtAccessSecret)}`,
      maxCount: this.options.config.otpMaxSendPerWindow * 2,
      windowSeconds: this.options.config.otpWindowSeconds,
      blockSeconds: this.options.config.otpBlockSeconds,
      now,
    });
    if (!ipLimit.allowed) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        `Too many OTP requests from this network. Try again in ${ipLimit.retryAfterSeconds} seconds.`,
      );
    }

    const otp = generateNumericOtp();
    const challengeId = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + this.options.config.otpTtlSeconds * 1000);
    const existingUser = await this.options.store.findUserByIdentifier(
      resolved.type === 'email'
        ? { emailNormalized: resolved.normalized }
        : { phoneNormalized: resolved.normalized },
    );

    await this.options.store.createChallenge({
      challengeId,
      purpose: 'otp_auth',
      channel,
      identifierNormalized: resolved.normalized,
      userId: existingUser?.id ?? null,
      secretHash: hashSecretToken(`${challengeId}:${otp}`, this.options.config.jwtRefreshSecret),
      maxAttempts: this.options.config.otpMaxVerifyAttempts,
      expiresAt,
      now,
    });

    const bodyText =
      channel === 'sms'
        ? formatOriginBoundOtpSms({
            code: otp,
            originHost: this.options.config.appOriginHost,
            purpose: 'auth',
            ttlSeconds: this.options.config.otpTtlSeconds,
          })
        : `Your BHOJORA verification code is ${otp}. Valid for ${Math.max(1, Math.round(this.options.config.otpTtlSeconds / 60))} minutes.`;

    await this.options.otpAdapter.sendOtp({
      challengeId,
      purpose: 'auth',
      channel,
      destination: resolved.normalized,
      maskedDestination: resolved.masked,
      code: otp,
      bodyText,
      expiresAt,
    });

    return {
      challengeId,
      channel,
      maskedDestination: resolved.masked,
      expiresInSeconds: this.options.config.otpTtlSeconds,
      resendAfterSeconds: this.options.config.otpResendCooldownSeconds,
    };
  }

  async verifyOtp(rawInput: unknown, meta: RequestMetadata): Promise<AuthSessionResponseDto> {
    const input = otpVerifySchema.parse(rawInput);
    const now = this.clock.now();
    const resolved = resolveIdentifier(input.identifier);
    if (!resolved) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid mobile number or email identifier');
    }

    const challenge = await this.options.store.findChallengeById(input.challengeId);
    if (
      !challenge ||
      challenge.purpose !== 'otp_auth' ||
      challenge.identifierNormalized !== resolved.normalized ||
      challenge.usedAt !== null ||
      challenge.invalidatedAt !== null ||
      challenge.expiresAt <= now
    ) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired OTP verification challenge');
    }

    const expectedHash = hashSecretToken(
      `${challenge.challengeId}:${input.otp}`,
      this.options.config.jwtRefreshSecret,
    );
    if (!timingSafeHexEqual(challenge.secretHash, expectedHash)) {
      await this.options.store.recordFailedChallengeAttempt(challenge.challengeId, now);
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid OTP verification code');
    }

    const consumed = await this.options.store.consumeChallengeAtomically(
      challenge.challengeId,
      now,
    );
    if (!consumed) {
      throw new AppError(401, 'UNAUTHORIZED', 'OTP challenge has expired or was already used');
    }

    let user = await this.options.store.findUserByIdentifier(
      resolved.type === 'email'
        ? { emailNormalized: resolved.normalized }
        : { phoneNormalized: resolved.normalized },
    );

    if (!user) {
      user = await this.options.store.createUserWithConsent(
        {
          name: input.name ?? 'Bhojora Customer',
          emailNormalized: resolved.type === 'email' ? resolved.normalized : null,
          phoneNormalized: resolved.type === 'phone' ? resolved.normalized : null,
          passwordHash: null,
          roles: ['CUSTOMER'],
          status: 'ACTIVE',
          languagePreference: input.languagePreference,
          phoneVerified: resolved.type === 'phone',
          emailVerified: resolved.type === 'email',
          now,
        },
        {
          consentType: 'TERMS_AND_PRIVACY',
          policyVersion: 'v1.0.0',
          source: 'otp_register',
        },
      );
    } else {
      if (user.status !== 'ACTIVE' && user.status !== 'PENDING_VERIFICATION') {
        throw new AppError(403, 'FORBIDDEN', `Account status ${user.status} cannot sign in`);
      }
      if (
        user.status === 'PENDING_VERIFICATION' &&
        !canTransitionAccountStatus(user.status, 'ACTIVE')
      ) {
        throw new AppError(403, 'FORBIDDEN', 'Account activation is not permitted');
      }
      user =
        (await this.options.store.updateUser(
          user.id,
          {
            status: 'ACTIVE',
            languagePreference: input.languagePreference,
            ...(resolved.type === 'phone' ? { phoneVerified: true } : { emailVerified: true }),
            lastLoginAt: now,
          },
          now,
        )) ?? user;
    }

    return this.issueNewSession(user, {
      ...meta,
      deviceName: input.deviceName ?? meta.deviceName,
    });
  }

  async refreshSession(rawInput: unknown, meta: RequestMetadata): Promise<AuthSessionResponseDto> {
    const input = refreshSchema.parse(rawInput);
    const now = this.clock.now();

    let claims;
    try {
      claims = this.jwt.verifyRefreshToken(input.refreshToken);
    } catch (error) {
      if (error instanceof JwtVerificationError) {
        throw new AppError(401, 'UNAUTHORIZED', error.message);
      }
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid refresh token');
    }

    const session = await this.options.store.findSessionById(claims.sid);
    if (!session || session.userId !== claims.sub || session.tokenFamilyId !== claims.fam) {
      throw new AppError(401, 'UNAUTHORIZED', 'Session not found');
    }

    if (session.revokedAt !== null || session.expiresAt <= now) {
      throw new AppError(401, 'UNAUTHORIZED', 'Session has expired or been revoked');
    }

    const presentedHash = hashSecretToken(input.refreshToken, this.options.config.jwtRefreshSecret);
    if (!timingSafeHexEqual(session.currentRefreshTokenHash, presentedHash)) {
      // Refresh token replay detected: immediately revoke the session family to contain stolen tokens.
      await this.options.store.revokeSession(
        session.sessionId,
        'REFRESH_TOKEN_REPLAY_DETECTED',
        now,
      );
      this.options.logger.warn('identity.session.refresh_replay_detected', {
        requestId: meta.requestId,
        userId: session.userId,
        sessionId: session.sessionId,
      });
      throw new AppError(401, 'UNAUTHORIZED', 'Refresh token reuse detected; session revoked');
    }

    const user = await this.options.store.findUserById(session.userId);
    if (!user || user.status !== 'ACTIVE') {
      await this.options.store.revokeSession(session.sessionId, 'USER_INACTIVE', now);
      throw new AppError(401, 'UNAUTHORIZED', 'Account is no longer active');
    }

    const nextGeneration = session.currentGeneration + 1;
    const nextRefreshToken = this.jwt.signRefreshToken({
      userId: user.id,
      sessionId: session.sessionId,
      familyId: session.tokenFamilyId,
      generation: nextGeneration,
      ttlSeconds: this.options.config.jwtRefreshTtlSeconds,
    });
    const nextRefreshTokenHash = hashSecretToken(
      nextRefreshToken,
      this.options.config.jwtRefreshSecret,
    );
    const nextExpiresAt = new Date(now.getTime() + this.options.config.jwtRefreshTtlSeconds * 1000);

    const rotated = await this.options.store.rotateSessionRefreshHash({
      sessionId: session.sessionId,
      expectedRefreshTokenHash: presentedHash,
      nextRefreshTokenHash,
      nextGeneration,
      nextExpiresAt,
      now,
    });

    if (!rotated) {
      await this.options.store.revokeSession(session.sessionId, 'REFRESH_CONFLICT_REVOKED', now);
      throw new AppError(401, 'UNAUTHORIZED', 'Refresh token was already rotated');
    }

    const accessToken = this.jwt.signAccessToken({
      userId: user.id,
      sessionId: rotated.sessionId,
      roles: user.roles,
      ttlSeconds: this.options.config.jwtAccessTtlSeconds,
    });

    return {
      user: toUserProfileDto(user),
      tokens: {
        tokenType: 'Bearer',
        accessToken,
        refreshToken: nextRefreshToken,
        accessExpiresInSeconds: this.options.config.jwtAccessTtlSeconds,
        refreshExpiresInSeconds: this.options.config.jwtRefreshTtlSeconds,
      },
      session: toSessionSummaryDto(rotated, true),
    };
  }

  async verifyAccessToken(accessToken: string): Promise<AuthenticatedContext> {
    const now = this.clock.now();
    let claims;
    try {
      claims = this.jwt.verifyAccessToken(accessToken);
    } catch (error) {
      if (error instanceof JwtVerificationError) {
        throw new AppError(401, 'UNAUTHORIZED', error.message);
      }
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid access token');
    }

    const session = await this.options.store.findSessionById(claims.sid);
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt !== null ||
      session.expiresAt <= now
    ) {
      throw new AppError(401, 'UNAUTHORIZED', 'Session has expired or been revoked');
    }

    const user = await this.options.store.findUserById(claims.sub);
    if (!user || user.status !== 'ACTIVE') {
      throw new AppError(401, 'UNAUTHORIZED', 'Account is unavailable');
    }

    return {
      userId: user.id,
      sessionId: session.sessionId,
      roles: [...user.roles],
      user: toUserProfileDto(user),
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.options.store.revokeSession(sessionId, 'USER_LOGOUT', this.clock.now());
  }

  async logoutAll(userId: string): Promise<number> {
    return this.options.store.revokeAllUserSessions(userId, 'USER_LOGOUT_ALL', this.clock.now());
  }

  async listSessions(userId: string, currentSessionId: string): Promise<AuthSessionSummaryDto[]> {
    const sessions = await this.options.store.listActiveSessionsForUser(userId, this.clock.now());
    return sessions.map((session) =>
      toSessionSummaryDto(session, session.sessionId === currentSessionId),
    );
  }

  async revokeUserSession(userId: string, targetSessionId: string): Promise<void> {
    const session = await this.options.store.findSessionById(targetSessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(404, 'NOT_FOUND', 'Session not found');
    }
    await this.options.store.revokeSession(
      targetSessionId,
      'USER_REVOKED_DEVICE',
      this.clock.now(),
    );
  }

  async forgotPassword(
    rawInput: unknown,
    meta: RequestMetadata,
  ): Promise<ForgotPasswordResponseDto> {
    const input = forgotPasswordSchema.parse(rawInput);
    const now = this.clock.now();
    const resolved = resolveIdentifier(input.identifier);
    if (!resolved) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Enter a valid email or Indian mobile number');
    }

    const rateState = await this.options.store.consumeRateLimitWindow({
      scope: 'recovery_send',
      subjectKey: `id:${resolved.normalized}`,
      maxCount: this.options.config.otpMaxSendPerWindow,
      windowSeconds: this.options.config.otpWindowSeconds,
      blockSeconds: this.options.config.otpBlockSeconds,
      now,
    });
    if (!rateState.allowed) {
      throw new AppError(
        429,
        'RATE_LIMITED',
        `Too many password recovery requests. Try again in ${rateState.retryAfterSeconds} seconds.`,
      );
    }

    const user = await this.options.store.findUserByIdentifier(
      resolved.type === 'email'
        ? { emailNormalized: resolved.normalized }
        : { phoneNormalized: resolved.normalized },
    );

    if (
      user &&
      user.status !== 'SUSPENDED' &&
      user.status !== 'DEACTIVATED' &&
      user.status !== 'DELETION_REQUESTED'
    ) {
      const challengeId = crypto.randomUUID();
      const rawToken =
        resolved.type === 'phone' ? generateNumericOtp() : generateOpaqueSecretToken();
      const expiresAt = new Date(now.getTime() + this.options.config.recoveryTtlSeconds * 1000);
      const channel: OtpChannel = resolved.type === 'phone' ? 'sms' : 'email';

      await this.options.store.createChallenge({
        challengeId,
        purpose: 'password_recovery',
        channel,
        identifierNormalized: resolved.normalized,
        userId: user.id,
        secretHash: hashSecretToken(
          `recovery:${resolved.normalized}:${rawToken}`,
          this.options.config.jwtRefreshSecret,
        ),
        maxAttempts: this.options.config.otpMaxVerifyAttempts,
        expiresAt,
        now,
      });

      const bodyText =
        channel === 'sms'
          ? formatOriginBoundOtpSms({
              code: rawToken,
              originHost: this.options.config.appOriginHost,
              purpose: 'recovery',
              ttlSeconds: this.options.config.recoveryTtlSeconds,
            })
          : `Use your BHOJORA password recovery token (${rawToken}) within ${Math.max(1, Math.round(this.options.config.recoveryTtlSeconds / 60))} minutes.`;

      await this.options.otpAdapter.sendOtp({
        challengeId,
        purpose: 'recovery',
        channel,
        destination: resolved.normalized,
        maskedDestination: resolved.masked,
        code: rawToken,
        bodyText,
        expiresAt,
      });
    } else {
      this.options.logger.info('identity.recovery.ignored_ineligible', {
        requestId: meta.requestId,
      });
    }

    return {
      accepted: true,
      message:
        'If an eligible account exists for that identifier, recovery instructions have been dispatched.',
      expiresInSeconds: this.options.config.recoveryTtlSeconds,
    };
  }

  async resetPassword(
    rawInput: unknown,
    meta: RequestMetadata,
  ): Promise<{ passwordReset: true; revokedSessions: number }> {
    const input = resetPasswordSchema.parse(rawInput);
    const now = this.clock.now();
    const resolved = resolveIdentifier(input.identifier);
    if (!resolved) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid account identifier');
    }

    const challenge = await this.options.store.findLatestActiveChallenge(
      resolved.normalized,
      'password_recovery',
      now,
    );
    if (!challenge || !challenge.userId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid or expired password recovery token');
    }

    const expectedHash = hashSecretToken(
      `recovery:${resolved.normalized}:${input.token}`,
      this.options.config.jwtRefreshSecret,
    );
    if (!timingSafeHexEqual(challenge.secretHash, expectedHash)) {
      await this.options.store.recordFailedChallengeAttempt(challenge.challengeId, now);
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid password recovery token');
    }

    const consumed = await this.options.store.consumeChallengeAtomically(
      challenge.challengeId,
      now,
    );
    if (!consumed) {
      throw new AppError(401, 'UNAUTHORIZED', 'Recovery token has expired or was already used');
    }

    const user = await this.options.store.findUserById(challenge.userId);
    if (
      !user ||
      user.status === 'SUSPENDED' ||
      user.status === 'DEACTIVATED' ||
      user.status === 'DELETION_REQUESTED'
    ) {
      throw new AppError(403, 'FORBIDDEN', 'Account is not eligible for password recovery');
    }

    const passwordHash = await this.hasher.hash(input.newPassword);
    await this.options.store.updateUser(
      user.id,
      {
        passwordHash,
        passwordChangedAt: now,
        ...(user.status === 'LOCKED' || user.status === 'PENDING_VERIFICATION'
          ? { status: 'ACTIVE' }
          : {}),
      },
      now,
    );

    const revokedSessions = await this.options.store.revokeAllUserSessions(
      user.id,
      'PASSWORD_RESET',
      now,
    );

    this.options.logger.info('identity.password.reset', {
      requestId: meta.requestId,
      userId: user.id,
      revokedSessions,
    });

    return {
      passwordReset: true,
      revokedSessions,
    };
  }

  async getProfile(userId: string): Promise<UserProfileDto> {
    const user = await this.options.store.findUserById(userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'User profile not found');
    }
    return toUserProfileDto(user);
  }

  async updateProfile(userId: string, rawInput: unknown): Promise<UserProfileDto> {
    const input = updateProfileSchema.parse(rawInput);
    const updated = await this.options.store.updateUser(
      userId,
      {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.languagePreference !== undefined
          ? { languagePreference: input.languagePreference }
          : {}),
      },
      this.clock.now(),
    );
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'User profile not found');
    }
    return toUserProfileDto(updated);
  }

  private async issueNewSession(
    user: UserRecord,
    meta: RequestMetadata,
  ): Promise<AuthSessionResponseDto> {
    const now = this.clock.now();
    const sessionId = crypto.randomUUID();
    const tokenFamilyId = crypto.randomUUID();
    const generation = 1;

    const accessToken = this.jwt.signAccessToken({
      userId: user.id,
      sessionId,
      roles: user.roles,
      ttlSeconds: this.options.config.jwtAccessTtlSeconds,
    });
    const refreshToken = this.jwt.signRefreshToken({
      userId: user.id,
      sessionId,
      familyId: tokenFamilyId,
      generation,
      ttlSeconds: this.options.config.jwtRefreshTtlSeconds,
    });

    const expiresAt = new Date(now.getTime() + this.options.config.jwtRefreshTtlSeconds * 1000);
    const session = await this.options.store.createSession({
      sessionId,
      userId: user.id,
      tokenFamilyId,
      currentGeneration: generation,
      currentRefreshTokenHash: hashSecretToken(refreshToken, this.options.config.jwtRefreshSecret),
      deviceName: resolveDeviceName(meta),
      ipHash: hashAuditValue(meta.ipAddress, this.options.config.jwtAccessSecret),
      userAgentSummary: summarizeUserAgent(meta.userAgent),
      expiresAt,
      now,
    });

    return {
      user: toUserProfileDto(user),
      tokens: {
        tokenType: 'Bearer',
        accessToken,
        refreshToken,
        accessExpiresInSeconds: this.options.config.jwtAccessTtlSeconds,
        refreshExpiresInSeconds: this.options.config.jwtRefreshTtlSeconds,
      },
      session: toSessionSummaryDto(session, true),
    };
  }
}
