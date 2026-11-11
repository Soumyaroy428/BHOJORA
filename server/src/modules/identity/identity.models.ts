import crypto from 'node:crypto';
import type { Connection, HydratedDocument, Model } from 'mongoose';
import { Schema } from 'mongoose';
import { AppError } from '../../middleware/error-handler';
import { applyBaseSchemaConventions, COLLECTION_NAMES } from '../../database/conventions';
import { withTransaction } from '../../database/repository';
import {
  ACCOUNT_STATUSES,
  LANGUAGE_PREFERENCES,
  USER_ROLES,
  type AuthChallengeRecord,
  type ChallengePurpose,
  type ConsentRecord,
  type CreateChallengeInput,
  type CreateSessionInput,
  type CreateUserInput,
  type IdentityStore,
  type OtpChannel,
  type RateLimitScope,
  type RateLimitState,
  type UserRecord,
  type UserSessionRecord,
} from './identity.types';

interface MongoRateLimitDoc {
  scope: RateLimitScope;
  subjectKey: string;
  count: number;
  windowStartAt: Date;
  blockedUntil?: Date;
  expiresAt: Date;
}

const userSchema = applyBaseSchemaConventions(
  new Schema({
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    emailNormalized: { type: String, required: false, trim: true, lowercase: true },
    phoneNormalized: { type: String, required: false, trim: true },
    passwordHash: { type: String, required: false },
    roles: {
      type: [{ type: String, enum: USER_ROLES }],
      required: true,
      default: ['CUSTOMER'],
    },
    status: {
      type: String,
      enum: ACCOUNT_STATUSES,
      required: true,
      default: 'ACTIVE',
    },
    languagePreference: {
      type: String,
      enum: LANGUAGE_PREFERENCES,
      required: true,
      default: 'en-IN',
    },
    phoneVerified: { type: Boolean, required: true, default: false },
    emailVerified: { type: Boolean, required: true, default: false },
    lastLoginAt: { type: Date, required: false },
    passwordChangedAt: { type: Date, required: false },
  }),
);

const userSessionSchema = applyBaseSchemaConventions(
  new Schema({
    sessionId: { type: String, required: true },
    userId: { type: String, required: true },
    tokenFamilyId: { type: String, required: true },
    currentGeneration: { type: Number, required: true, min: 1 },
    currentRefreshTokenHash: { type: String, required: true },
    deviceName: { type: String, required: true, maxlength: 120 },
    ipHash: { type: String, required: true },
    userAgentSummary: { type: String, required: true, maxlength: 160 },
    expiresAt: { type: Date, required: true },
    lastRotatedAt: { type: Date, required: true },
    revokedAt: { type: Date, required: false, default: null },
    revocationReason: { type: String, required: false, default: null },
    mfaVerifiedAt: { type: Date, required: false, default: null },
  }),
);

const authChallengeSchema = applyBaseSchemaConventions(
  new Schema({
    challengeId: { type: String, required: true },
    purpose: {
      type: String,
      enum: ['otp_auth', 'password_recovery', 'mfa_step_up'],
      required: true,
    },
    channel: {
      type: String,
      enum: ['sms', 'email'],
      required: true,
    },
    identifierNormalized: { type: String, required: true },
    userId: { type: String, required: false },
    secretHash: { type: String, required: true },
    attempts: { type: Number, required: true, default: 0, min: 0 },
    maxAttempts: { type: Number, required: true, default: 3, min: 1 },
    invalidatedAt: { type: Date, required: false, default: null },
    usedAt: { type: Date, required: false, default: null },
    expiresAt: { type: Date, required: true },
  }),
);

const consentRecordSchema = applyBaseSchemaConventions(
  new Schema({
    userId: { type: String, required: true },
    consentType: { type: String, enum: ['TERMS_AND_PRIVACY'], required: true },
    policyVersion: { type: String, required: true },
    acceptedAt: { type: Date, required: true },
    source: { type: String, enum: ['register', 'otp_register'], required: true },
  }),
  { appendOnly: true },
);

const authRateLimitSchema = applyBaseSchemaConventions(
  new Schema<MongoRateLimitDoc>({
    scope: { type: String, enum: ['otp_send', 'login_fail', 'recovery_send'], required: true },
    subjectKey: { type: String, required: true },
    count: { type: Number, required: true, default: 0, min: 0 },
    windowStartAt: { type: Date, required: true },
    blockedUntil: { type: Date, required: false },
    expiresAt: { type: Date, required: true },
  }),
);

export interface MongooseIdentityModels {
  User: Model<Record<string, unknown>>;
  UserSession: Model<Record<string, unknown>>;
  AuthChallenge: Model<Record<string, unknown>>;
  ConsentRecord: Model<Record<string, unknown>>;
  AuthRateLimit: Model<MongoRateLimitDoc>;
}

export function createMongooseIdentityModels(connection: Connection): MongooseIdentityModels {
  const resolveModel = <T>(name: string, schema: Schema<T>, collectionName: string): Model<T> => {
    const existing = connection.models[name] as Model<T> | undefined;
    if (existing) {
      return existing;
    }
    return connection.model<T>(name, schema, collectionName);
  };

  return {
    User: resolveModel(
      'BhojoraUser',
      userSchema as Schema<Record<string, unknown>>,
      COLLECTION_NAMES.users,
    ),
    UserSession: resolveModel(
      'BhojoraUserSession',
      userSessionSchema as Schema<Record<string, unknown>>,
      COLLECTION_NAMES.userSessions,
    ),
    AuthChallenge: resolveModel(
      'BhojoraAuthChallenge',
      authChallengeSchema as Schema<Record<string, unknown>>,
      COLLECTION_NAMES.authChallenges,
    ),
    ConsentRecord: resolveModel(
      'BhojoraConsentRecord',
      consentRecordSchema as Schema<Record<string, unknown>>,
      COLLECTION_NAMES.consentRecords,
    ),
    AuthRateLimit: resolveModel<MongoRateLimitDoc>(
      'BhojoraAuthRateLimit',
      authRateLimitSchema,
      COLLECTION_NAMES.authRateLimits,
    ),
  };
}

function isMongoDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 11000;
}

function toUserRecord(
  doc: HydratedDocument<Record<string, unknown>> | Record<string, unknown>,
): UserRecord {
  const raw =
    doc instanceof Object && 'toObject' in doc && typeof doc.toObject === 'function'
      ? doc.toObject()
      : doc;
  const record = raw as Record<string, unknown>;
  return {
    id: String(record['id'] ?? record['_id']),
    name: String(record['name']),
    emailNormalized:
      typeof record['emailNormalized'] === 'string' ? record['emailNormalized'] : null,
    phoneNormalized:
      typeof record['phoneNormalized'] === 'string' ? record['phoneNormalized'] : null,
    passwordHash: typeof record['passwordHash'] === 'string' ? record['passwordHash'] : null,
    roles: Array.isArray(record['roles']) ? (record['roles'] as UserRecord['roles']) : ['CUSTOMER'],
    status: record['status'] as UserRecord['status'],
    languagePreference: record['languagePreference'] as UserRecord['languagePreference'],
    phoneVerified: Boolean(record['phoneVerified']),
    emailVerified: Boolean(record['emailVerified']),
    lastLoginAt: record['lastLoginAt'] instanceof Date ? record['lastLoginAt'] : null,
    passwordChangedAt:
      record['passwordChangedAt'] instanceof Date ? record['passwordChangedAt'] : null,
    createdAt: record['createdAt'] instanceof Date ? record['createdAt'] : new Date(),
    updatedAt: record['updatedAt'] instanceof Date ? record['updatedAt'] : new Date(),
  };
}

function toSessionRecord(
  doc: HydratedDocument<Record<string, unknown>> | Record<string, unknown>,
): UserSessionRecord {
  const raw =
    doc instanceof Object && 'toObject' in doc && typeof doc.toObject === 'function'
      ? doc.toObject()
      : doc;
  const record = raw as Record<string, unknown>;
  return {
    id: String(record['id'] ?? record['_id']),
    sessionId: String(record['sessionId']),
    userId: String(record['userId']),
    tokenFamilyId: String(record['tokenFamilyId']),
    currentGeneration: Number(record['currentGeneration']),
    currentRefreshTokenHash: String(record['currentRefreshTokenHash']),
    deviceName: String(record['deviceName']),
    ipHash: String(record['ipHash']),
    userAgentSummary: String(record['userAgentSummary']),
    expiresAt: record['expiresAt'] as Date,
    lastRotatedAt: record['lastRotatedAt'] as Date,
    revokedAt: record['revokedAt'] instanceof Date ? record['revokedAt'] : null,
    revocationReason:
      typeof record['revocationReason'] === 'string' ? record['revocationReason'] : null,
    mfaVerifiedAt: record['mfaVerifiedAt'] instanceof Date ? record['mfaVerifiedAt'] : null,
    createdAt: record['createdAt'] instanceof Date ? record['createdAt'] : new Date(),
  };
}

function toChallengeRecord(
  doc: HydratedDocument<Record<string, unknown>> | Record<string, unknown>,
): AuthChallengeRecord {
  const raw =
    doc instanceof Object && 'toObject' in doc && typeof doc.toObject === 'function'
      ? doc.toObject()
      : doc;
  const record = raw as Record<string, unknown>;
  return {
    id: String(record['id'] ?? record['_id']),
    challengeId: String(record['challengeId']),
    purpose: record['purpose'] as ChallengePurpose,
    channel: record['channel'] as OtpChannel,
    identifierNormalized: String(record['identifierNormalized']),
    userId: typeof record['userId'] === 'string' ? record['userId'] : null,
    secretHash: String(record['secretHash']),
    attempts: Number(record['attempts']),
    maxAttempts: Number(record['maxAttempts']),
    invalidatedAt: record['invalidatedAt'] instanceof Date ? record['invalidatedAt'] : null,
    usedAt: record['usedAt'] instanceof Date ? record['usedAt'] : null,
    expiresAt: record['expiresAt'] as Date,
    createdAt: record['createdAt'] instanceof Date ? record['createdAt'] : new Date(),
  };
}

export class MongooseIdentityStore implements IdentityStore {
  private readonly models: MongooseIdentityModels;

  constructor(private readonly connection: Connection) {
    this.models = createMongooseIdentityModels(connection);
  }

  getModels(): MongooseIdentityModels {
    return this.models;
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    const doc = await this.models.User.findById(userId);
    return doc ? toUserRecord(doc) : null;
  }

  async findUserByIdentifier(identifier: {
    emailNormalized?: string;
    phoneNormalized?: string;
  }): Promise<UserRecord | null> {
    if (identifier.emailNormalized) {
      const doc = await this.models.User.findOne({ emailNormalized: identifier.emailNormalized });
      if (doc) {
        return toUserRecord(doc);
      }
    }
    if (identifier.phoneNormalized) {
      const doc = await this.models.User.findOne({ phoneNormalized: identifier.phoneNormalized });
      if (doc) {
        return toUserRecord(doc);
      }
    }
    return null;
  }

  async createUserWithConsent(
    userInput: CreateUserInput,
    consent?: {
      consentType: 'TERMS_AND_PRIVACY';
      policyVersion: string;
      source: 'register' | 'otp_register';
    },
  ): Promise<UserRecord> {
    try {
      return await withTransaction(this.connection, async (session) => {
        const userPayload: Record<string, unknown> = {
          name: userInput.name,
          roles: userInput.roles,
          status: userInput.status,
          languagePreference: userInput.languagePreference,
          phoneVerified: userInput.phoneVerified,
          emailVerified: userInput.emailVerified,
        };
        if (userInput.emailNormalized) {
          userPayload['emailNormalized'] = userInput.emailNormalized;
        }
        if (userInput.phoneNormalized) {
          userPayload['phoneNormalized'] = userInput.phoneNormalized;
        }
        if (userInput.passwordHash) {
          userPayload['passwordHash'] = userInput.passwordHash;
          userPayload['passwordChangedAt'] = userInput.now;
        }

        const [createdUser] = await this.models.User.create([userPayload], { session });
        if (!createdUser) {
          throw new Error('Failed to create user record');
        }
        const record = toUserRecord(createdUser);

        if (consent) {
          await this.models.ConsentRecord.create(
            [
              {
                userId: record.id,
                consentType: consent.consentType,
                policyVersion: consent.policyVersion,
                acceptedAt: userInput.now,
                source: consent.source,
              },
            ],
            { session },
          );
        }

        return record;
      });
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        throw new AppError(409, 'CONFLICT', 'An account already exists with these credentials');
      }
      throw error;
    }
  }

  async updateUser(
    userId: string,
    patch: Partial<
      Pick<
        UserRecord,
        | 'name'
        | 'roles'
        | 'languagePreference'
        | 'status'
        | 'phoneVerified'
        | 'emailVerified'
        | 'passwordHash'
        | 'passwordChangedAt'
        | 'lastLoginAt'
      >
    >,
  ): Promise<UserRecord | null> {
    const updated = await this.models.User.findByIdAndUpdate(
      userId,
      { $set: patch },
      { new: true, runValidators: true },
    );
    return updated ? toUserRecord(updated) : null;
  }

  async createSession(input: CreateSessionInput): Promise<UserSessionRecord> {
    const [created] = await this.models.UserSession.create([
      {
        sessionId: input.sessionId,
        userId: input.userId,
        tokenFamilyId: input.tokenFamilyId,
        currentGeneration: input.currentGeneration,
        currentRefreshTokenHash: input.currentRefreshTokenHash,
        deviceName: input.deviceName,
        ipHash: input.ipHash,
        userAgentSummary: input.userAgentSummary,
        expiresAt: input.expiresAt,
        lastRotatedAt: input.now,
        revokedAt: null,
        revocationReason: null,
        mfaVerifiedAt: null,
      },
    ]);
    if (!created) {
      throw new Error('Failed to create user session');
    }
    return toSessionRecord(created);
  }

  async findSessionById(sessionId: string): Promise<UserSessionRecord | null> {
    const doc = await this.models.UserSession.findOne({ sessionId });
    return doc ? toSessionRecord(doc) : null;
  }

  async listActiveSessionsForUser(userId: string, now: Date): Promise<UserSessionRecord[]> {
    const docs = await this.models.UserSession.find({
      userId,
      revokedAt: null,
      expiresAt: { $gt: now },
    }).sort({ lastRotatedAt: -1 });
    return docs.map((doc) => toSessionRecord(doc));
  }

  async rotateSessionRefreshHash(params: {
    sessionId: string;
    expectedRefreshTokenHash: string;
    nextRefreshTokenHash: string;
    nextGeneration: number;
    nextExpiresAt: Date;
    now: Date;
  }): Promise<UserSessionRecord | null> {
    const updated = await this.models.UserSession.findOneAndUpdate(
      {
        sessionId: params.sessionId,
        currentRefreshTokenHash: params.expectedRefreshTokenHash,
        revokedAt: null,
        expiresAt: { $gt: params.now },
      },
      {
        $set: {
          currentRefreshTokenHash: params.nextRefreshTokenHash,
          currentGeneration: params.nextGeneration,
          expiresAt: params.nextExpiresAt,
          lastRotatedAt: params.now,
        },
      },
      { new: true, runValidators: true },
    );
    return updated ? toSessionRecord(updated) : null;
  }

  async markSessionMfaVerified(
    sessionId: string,
    mfaVerifiedAt: Date,
  ): Promise<UserSessionRecord | null> {
    const updated = await this.models.UserSession.findOneAndUpdate(
      { sessionId, revokedAt: null },
      { $set: { mfaVerifiedAt } },
      { new: true },
    );
    return updated ? toSessionRecord(updated) : null;
  }

  async revokeSession(sessionId: string, reason: string, now: Date): Promise<boolean> {
    const updated = await this.models.UserSession.findOneAndUpdate(
      { sessionId, revokedAt: null },
      { $set: { revokedAt: now, revocationReason: reason } },
      { new: true },
    );
    return updated !== null;
  }

  async revokeAllUserSessions(userId: string, reason: string, now: Date): Promise<number> {
    const result = await this.models.UserSession.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: now, revocationReason: reason } },
    );
    return result.modifiedCount ?? 0;
  }

  async createChallenge(input: CreateChallengeInput): Promise<AuthChallengeRecord> {
    await this.models.AuthChallenge.updateMany(
      {
        identifierNormalized: input.identifierNormalized,
        purpose: input.purpose,
        usedAt: null,
        invalidatedAt: null,
      },
      { $set: { invalidatedAt: input.now } },
    );

    const [created] = await this.models.AuthChallenge.create([
      {
        challengeId: input.challengeId,
        purpose: input.purpose,
        channel: input.channel,
        identifierNormalized: input.identifierNormalized,
        ...(input.userId ? { userId: input.userId } : {}),
        secretHash: input.secretHash,
        attempts: 0,
        maxAttempts: input.maxAttempts,
        invalidatedAt: null,
        usedAt: null,
        expiresAt: input.expiresAt,
      },
    ]);
    if (!created) {
      throw new Error('Failed to create auth challenge');
    }
    return toChallengeRecord(created);
  }

  async findLatestActiveChallenge(
    identifierNormalized: string,
    purpose: ChallengePurpose,
    now: Date,
  ): Promise<AuthChallengeRecord | null> {
    const doc = await this.models.AuthChallenge.findOne({
      identifierNormalized,
      purpose,
      usedAt: null,
      invalidatedAt: null,
      expiresAt: { $gt: now },
    }).sort({ createdAt: -1 });
    return doc ? toChallengeRecord(doc) : null;
  }

  async findChallengeById(challengeId: string): Promise<AuthChallengeRecord | null> {
    const doc = await this.models.AuthChallenge.findOne({ challengeId });
    return doc ? toChallengeRecord(doc) : null;
  }

  async recordFailedChallengeAttempt(
    challengeId: string,
    now: Date,
  ): Promise<AuthChallengeRecord | null> {
    const doc = await this.models.AuthChallenge.findOneAndUpdate(
      { challengeId, usedAt: null, invalidatedAt: null },
      { $inc: { attempts: 1 } },
      { new: true },
    );
    if (!doc) {
      return null;
    }
    const record = toChallengeRecord(doc);
    if (record.attempts >= record.maxAttempts && !record.invalidatedAt) {
      const invalidated = await this.models.AuthChallenge.findOneAndUpdate(
        { challengeId, invalidatedAt: null },
        { $set: { invalidatedAt: now } },
        { new: true },
      );
      return invalidated ? toChallengeRecord(invalidated) : record;
    }
    return record;
  }

  async consumeChallengeAtomically(
    challengeId: string,
    now: Date,
  ): Promise<AuthChallengeRecord | null> {
    const updated = await this.models.AuthChallenge.findOneAndUpdate(
      {
        challengeId,
        usedAt: null,
        invalidatedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { usedAt: now } },
      { new: true },
    );
    return updated ? toChallengeRecord(updated) : null;
  }

  async consumeRateLimitWindow(params: {
    scope: RateLimitScope;
    subjectKey: string;
    maxCount: number;
    windowSeconds: number;
    blockSeconds: number;
    now: Date;
  }): Promise<RateLimitState> {
    const { scope, subjectKey, maxCount, windowSeconds, blockSeconds, now } = params;
    const windowCutoff = new Date(now.getTime() - windowSeconds * 1000);
    const existing = await this.models.AuthRateLimit.findOne({ scope, subjectKey });

    if (existing?.blockedUntil && existing.blockedUntil > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.blockedUntil.getTime() - now.getTime()) / 1000),
        ),
        count: existing.count,
      };
    }

    const withinWindow = existing && existing.windowStartAt > windowCutoff;
    const nextCount = withinWindow ? existing.count + 1 : 1;
    const nextWindowStart = withinWindow ? existing.windowStartAt : now;
    const isExceeded = nextCount > maxCount;
    const blockedUntil = isExceeded ? new Date(now.getTime() + blockSeconds * 1000) : undefined;
    const expiresAt = blockedUntil ?? new Date(nextWindowStart.getTime() + windowSeconds * 1000);

    await this.models.AuthRateLimit.findOneAndUpdate(
      { scope, subjectKey },
      {
        $set: {
          count: nextCount,
          windowStartAt: nextWindowStart,
          blockedUntil: blockedUntil ?? null,
          expiresAt,
        },
      },
      { upsert: true, new: true },
    );

    return {
      allowed: !isExceeded,
      retryAfterSeconds: isExceeded ? blockSeconds : 0,
      count: nextCount,
    };
  }

  async getRateLimitBlockStatus(params: {
    scope: RateLimitScope;
    subjectKey: string;
    now: Date;
  }): Promise<RateLimitState> {
    const existing = await this.models.AuthRateLimit.findOne({
      scope: params.scope,
      subjectKey: params.subjectKey,
    });
    if (!existing?.blockedUntil || existing.blockedUntil <= params.now) {
      return { allowed: true, retryAfterSeconds: 0, count: existing?.count ?? 0 };
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.blockedUntil.getTime() - params.now.getTime()) / 1000),
      ),
      count: existing.count,
    };
  }

  async resetRateLimit(scope: RateLimitScope, subjectKey: string): Promise<void> {
    await this.models.AuthRateLimit.deleteOne({ scope, subjectKey });
  }
}

interface InMemoryRateEntry {
  count: number;
  windowStartAt: Date;
  blockedUntil: Date | null;
}

/**
 * Isolated deterministic store enabling full security/expiry/replay HTTP tests without a live mongod process.
 */
export class InMemoryIdentityStore implements IdentityStore {
  private readonly usersById = new Map<string, UserRecord>();
  private readonly userIdsByEmail = new Map<string, string>();
  private readonly userIdsByPhone = new Map<string, string>();
  private readonly sessionsById = new Map<string, UserSessionRecord>();
  private readonly challengesById = new Map<string, AuthChallengeRecord>();
  private readonly consents: ConsentRecord[] = [];
  private readonly rateLimits = new Map<string, InMemoryRateEntry>();

  getConsentsForUser(userId: string): readonly ConsentRecord[] {
    return this.consents.filter((c) => c.userId === userId);
  }

  async findUserById(userId: string): Promise<UserRecord | null> {
    return this.usersById.get(userId) ?? null;
  }

  async findUserByIdentifier(identifier: {
    emailNormalized?: string;
    phoneNormalized?: string;
  }): Promise<UserRecord | null> {
    if (identifier.emailNormalized) {
      const id = this.userIdsByEmail.get(identifier.emailNormalized);
      if (id) {
        return this.usersById.get(id) ?? null;
      }
    }
    if (identifier.phoneNormalized) {
      const id = this.userIdsByPhone.get(identifier.phoneNormalized);
      if (id) {
        return this.usersById.get(id) ?? null;
      }
    }
    return null;
  }

  async createUserWithConsent(
    userInput: CreateUserInput,
    consent?: {
      consentType: 'TERMS_AND_PRIVACY';
      policyVersion: string;
      source: 'register' | 'otp_register';
    },
  ): Promise<UserRecord> {
    if (userInput.emailNormalized && this.userIdsByEmail.has(userInput.emailNormalized)) {
      throw new AppError(409, 'CONFLICT', 'An account already exists with this email');
    }
    if (userInput.phoneNormalized && this.userIdsByPhone.has(userInput.phoneNormalized)) {
      throw new AppError(409, 'CONFLICT', 'An account already exists with this phone number');
    }

    const user: UserRecord = {
      id: crypto.randomUUID(),
      name: userInput.name,
      emailNormalized: userInput.emailNormalized ?? null,
      phoneNormalized: userInput.phoneNormalized ?? null,
      passwordHash: userInput.passwordHash ?? null,
      roles: [...userInput.roles],
      status: userInput.status,
      languagePreference: userInput.languagePreference,
      phoneVerified: userInput.phoneVerified,
      emailVerified: userInput.emailVerified,
      lastLoginAt: null,
      passwordChangedAt: userInput.passwordHash ? userInput.now : null,
      createdAt: userInput.now,
      updatedAt: userInput.now,
    };

    this.usersById.set(user.id, user);
    if (user.emailNormalized) {
      this.userIdsByEmail.set(user.emailNormalized, user.id);
    }
    if (user.phoneNormalized) {
      this.userIdsByPhone.set(user.phoneNormalized, user.id);
    }

    if (consent) {
      this.consents.push({
        id: crypto.randomUUID(),
        userId: user.id,
        consentType: consent.consentType,
        policyVersion: consent.policyVersion,
        acceptedAt: userInput.now,
        source: consent.source,
      });
    }

    return user;
  }

  async updateUser(
    userId: string,
    patch: Partial<
      Pick<
        UserRecord,
        | 'name'
        | 'roles'
        | 'languagePreference'
        | 'status'
        | 'phoneVerified'
        | 'emailVerified'
        | 'passwordHash'
        | 'passwordChangedAt'
        | 'lastLoginAt'
      >
    >,
    now: Date,
  ): Promise<UserRecord | null> {
    const existing = this.usersById.get(userId);
    if (!existing) {
      return null;
    }
    const updated: UserRecord = {
      ...existing,
      ...patch,
      updatedAt: now,
    };
    this.usersById.set(userId, updated);
    return updated;
  }

  async createSession(input: CreateSessionInput): Promise<UserSessionRecord> {
    const session: UserSessionRecord = {
      id: input.sessionId,
      sessionId: input.sessionId,
      userId: input.userId,
      tokenFamilyId: input.tokenFamilyId,
      currentGeneration: input.currentGeneration,
      currentRefreshTokenHash: input.currentRefreshTokenHash,
      deviceName: input.deviceName,
      ipHash: input.ipHash,
      userAgentSummary: input.userAgentSummary,
      expiresAt: input.expiresAt,
      lastRotatedAt: input.now,
      revokedAt: null,
      revocationReason: null,
      mfaVerifiedAt: null,
      createdAt: input.now,
    };
    this.sessionsById.set(session.sessionId, session);
    return session;
  }

  async findSessionById(sessionId: string): Promise<UserSessionRecord | null> {
    return this.sessionsById.get(sessionId) ?? null;
  }

  async listActiveSessionsForUser(userId: string, now: Date): Promise<UserSessionRecord[]> {
    return Array.from(this.sessionsById.values())
      .filter((s) => s.userId === userId && s.revokedAt === null && s.expiresAt > now)
      .sort((a, b) => b.lastRotatedAt.getTime() - a.lastRotatedAt.getTime());
  }

  async rotateSessionRefreshHash(params: {
    sessionId: string;
    expectedRefreshTokenHash: string;
    nextRefreshTokenHash: string;
    nextGeneration: number;
    nextExpiresAt: Date;
    now: Date;
  }): Promise<UserSessionRecord | null> {
    const existing = this.sessionsById.get(params.sessionId);
    if (
      !existing ||
      existing.revokedAt !== null ||
      existing.expiresAt <= params.now ||
      existing.currentRefreshTokenHash !== params.expectedRefreshTokenHash
    ) {
      return null;
    }
    const updated: UserSessionRecord = {
      ...existing,
      currentRefreshTokenHash: params.nextRefreshTokenHash,
      currentGeneration: params.nextGeneration,
      expiresAt: params.nextExpiresAt,
      lastRotatedAt: params.now,
    };
    this.sessionsById.set(existing.sessionId, updated);
    return updated;
  }

  async markSessionMfaVerified(
    sessionId: string,
    mfaVerifiedAt: Date,
  ): Promise<UserSessionRecord | null> {
    const existing = this.sessionsById.get(sessionId);
    if (!existing || existing.revokedAt !== null) {
      return null;
    }
    const updated: UserSessionRecord = {
      ...existing,
      mfaVerifiedAt,
    };
    this.sessionsById.set(sessionId, updated);
    return updated;
  }

  async revokeSession(sessionId: string, reason: string, now: Date): Promise<boolean> {
    const existing = this.sessionsById.get(sessionId);
    if (!existing || existing.revokedAt !== null) {
      return false;
    }
    this.sessionsById.set(sessionId, {
      ...existing,
      revokedAt: now,
      revocationReason: reason,
    });
    return true;
  }

  async revokeAllUserSessions(userId: string, reason: string, now: Date): Promise<number> {
    let count = 0;
    for (const [id, session] of this.sessionsById.entries()) {
      if (session.userId === userId && session.revokedAt === null) {
        this.sessionsById.set(id, {
          ...session,
          revokedAt: now,
          revocationReason: reason,
        });
        count += 1;
      }
    }
    return count;
  }

  async createChallenge(input: CreateChallengeInput): Promise<AuthChallengeRecord> {
    for (const [id, challenge] of this.challengesById.entries()) {
      if (
        challenge.identifierNormalized === input.identifierNormalized &&
        challenge.purpose === input.purpose &&
        challenge.usedAt === null &&
        challenge.invalidatedAt === null
      ) {
        this.challengesById.set(id, { ...challenge, invalidatedAt: input.now });
      }
    }

    const created: AuthChallengeRecord = {
      id: input.challengeId,
      challengeId: input.challengeId,
      purpose: input.purpose,
      channel: input.channel,
      identifierNormalized: input.identifierNormalized,
      userId: input.userId ?? null,
      secretHash: input.secretHash,
      attempts: 0,
      maxAttempts: input.maxAttempts,
      invalidatedAt: null,
      usedAt: null,
      expiresAt: input.expiresAt,
      createdAt: input.now,
    };
    this.challengesById.set(created.challengeId, created);
    return created;
  }

  async findLatestActiveChallenge(
    identifierNormalized: string,
    purpose: ChallengePurpose,
    now: Date,
  ): Promise<AuthChallengeRecord | null> {
    const matches = Array.from(this.challengesById.values())
      .filter(
        (c) =>
          c.identifierNormalized === identifierNormalized &&
          c.purpose === purpose &&
          c.usedAt === null &&
          c.invalidatedAt === null &&
          c.expiresAt > now,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return matches[0] ?? null;
  }

  async findChallengeById(challengeId: string): Promise<AuthChallengeRecord | null> {
    return this.challengesById.get(challengeId) ?? null;
  }

  async recordFailedChallengeAttempt(
    challengeId: string,
    now: Date,
  ): Promise<AuthChallengeRecord | null> {
    const existing = this.challengesById.get(challengeId);
    if (!existing || existing.usedAt !== null || existing.invalidatedAt !== null) {
      return null;
    }
    const nextAttempts = existing.attempts + 1;
    const updated: AuthChallengeRecord = {
      ...existing,
      attempts: nextAttempts,
      invalidatedAt: nextAttempts >= existing.maxAttempts ? now : null,
    };
    this.challengesById.set(challengeId, updated);
    return updated;
  }

  async consumeChallengeAtomically(
    challengeId: string,
    now: Date,
  ): Promise<AuthChallengeRecord | null> {
    const existing = this.challengesById.get(challengeId);
    if (
      !existing ||
      existing.usedAt !== null ||
      existing.invalidatedAt !== null ||
      existing.expiresAt <= now
    ) {
      return null;
    }
    const consumed: AuthChallengeRecord = {
      ...existing,
      usedAt: now,
    };
    this.challengesById.set(challengeId, consumed);
    return consumed;
  }

  private rateKey(scope: RateLimitScope, subjectKey: string): string {
    return `${scope}:${subjectKey}`;
  }

  async consumeRateLimitWindow(params: {
    scope: RateLimitScope;
    subjectKey: string;
    maxCount: number;
    windowSeconds: number;
    blockSeconds: number;
    now: Date;
  }): Promise<RateLimitState> {
    const key = this.rateKey(params.scope, params.subjectKey);
    const existing = this.rateLimits.get(key);
    const windowCutoff = new Date(params.now.getTime() - params.windowSeconds * 1000);

    if (existing?.blockedUntil && existing.blockedUntil > params.now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((existing.blockedUntil.getTime() - params.now.getTime()) / 1000),
        ),
        count: existing.count,
      };
    }

    const withinWindow = existing && existing.windowStartAt > windowCutoff;
    const nextCount = withinWindow ? existing.count + 1 : 1;
    const windowStartAt = withinWindow ? existing.windowStartAt : params.now;
    const exceeded = nextCount > params.maxCount;
    const blockedUntil = exceeded
      ? new Date(params.now.getTime() + params.blockSeconds * 1000)
      : null;

    this.rateLimits.set(key, { count: nextCount, windowStartAt, blockedUntil });

    return {
      allowed: !exceeded,
      retryAfterSeconds: exceeded ? params.blockSeconds : 0,
      count: nextCount,
    };
  }

  async getRateLimitBlockStatus(params: {
    scope: RateLimitScope;
    subjectKey: string;
    now: Date;
  }): Promise<RateLimitState> {
    const existing = this.rateLimits.get(this.rateKey(params.scope, params.subjectKey));
    if (!existing?.blockedUntil || existing.blockedUntil <= params.now) {
      return { allowed: true, retryAfterSeconds: 0, count: existing?.count ?? 0 };
    }
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((existing.blockedUntil.getTime() - params.now.getTime()) / 1000),
      ),
      count: existing.count,
    };
  }

  async resetRateLimit(scope: RateLimitScope, subjectKey: string): Promise<void> {
    this.rateLimits.delete(this.rateKey(scope, subjectKey));
  }
}
