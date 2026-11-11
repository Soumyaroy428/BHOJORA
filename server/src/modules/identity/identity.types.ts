export const USER_ROLES = [
  'CUSTOMER',
  'RESTAURANT_OWNER',
  'RESTAURANT_MANAGER',
  'KITCHEN_STAFF',
  'DELIVERY_PARTNER',
  'INSPECTOR',
  'INSPECTION_REVIEWER',
  'SUPPORT_AGENT',
  'OPS_ADMIN',
  'TRUST_ADMIN',
  'FINANCE_ADMIN',
  'SUPER_ADMIN',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ACCOUNT_STATUSES = [
  'PENDING_VERIFICATION',
  'ACTIVE',
  'SUSPENDED',
  'LOCKED',
  'DEACTIVATED',
  'DELETION_REQUESTED',
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const LANGUAGE_PREFERENCES = ['en-IN', 'bn-IN'] as const;
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

export type OtpChannel = 'sms' | 'email';
export type OtpPurpose = 'auth' | 'recovery';
export type ChallengePurpose = 'otp_auth' | 'password_recovery';
export type RateLimitScope = 'otp_send' | 'login_fail' | 'recovery_send';

export const ACCOUNT_STATUS_TRANSITIONS: Readonly<Record<AccountStatus, readonly AccountStatus[]>> =
  {
    PENDING_VERIFICATION: ['ACTIVE', 'DEACTIVATED', 'DELETION_REQUESTED'],
    ACTIVE: ['SUSPENDED', 'LOCKED', 'DEACTIVATED', 'DELETION_REQUESTED'],
    SUSPENDED: ['ACTIVE', 'DEACTIVATED', 'DELETION_REQUESTED'],
    LOCKED: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'DELETION_REQUESTED'],
    DEACTIVATED: ['ACTIVE', 'DELETION_REQUESTED'],
    DELETION_REQUESTED: [],
  };

export function canTransitionAccountStatus(from: AccountStatus, to: AccountStatus): boolean {
  if (from === to) {
    return true;
  }
  return ACCOUNT_STATUS_TRANSITIONS[from].includes(to);
}

export interface Clock {
  now(): Date;
}

export const SYSTEM_CLOCK: Clock = {
  now: () => new Date(),
};

export interface OtpDeliveryMessage {
  challengeId: string;
  purpose: OtpPurpose;
  channel: OtpChannel;
  destination: string;
  maskedDestination: string;
  code: string;
  bodyText: string;
  expiresAt: Date;
}

export interface OtpSenderAdapter {
  sendOtp(message: OtpDeliveryMessage): Promise<void>;
}

export interface RequestMetadata {
  ipAddress: string;
  userAgent?: string;
  deviceName?: string;
  requestId?: string;
}

export interface UserRecord {
  id: string;
  name: string;
  emailNormalized?: string | null;
  phoneNormalized?: string | null;
  passwordHash?: string | null;
  roles: UserRole[];
  status: AccountStatus;
  languagePreference: LanguagePreference;
  phoneVerified: boolean;
  emailVerified: boolean;
  lastLoginAt?: Date | null;
  passwordChangedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSessionRecord {
  id: string;
  sessionId: string;
  userId: string;
  tokenFamilyId: string;
  currentGeneration: number;
  currentRefreshTokenHash: string;
  deviceName: string;
  ipHash: string;
  userAgentSummary: string;
  expiresAt: Date;
  lastRotatedAt: Date;
  revokedAt?: Date | null;
  revocationReason?: string | null;
  createdAt: Date;
}

export interface AuthChallengeRecord {
  id: string;
  challengeId: string;
  purpose: ChallengePurpose;
  channel: OtpChannel;
  identifierNormalized: string;
  userId?: string | null;
  secretHash: string;
  attempts: number;
  maxAttempts: number;
  invalidatedAt?: Date | null;
  usedAt?: Date | null;
  expiresAt: Date;
  createdAt: Date;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: 'TERMS_AND_PRIVACY';
  policyVersion: string;
  acceptedAt: Date;
  source: 'register' | 'otp_register';
}

export interface UserProfileDto {
  id: string;
  name: string;
  emailMasked?: string | null;
  phoneMasked?: string | null;
  roles: UserRole[];
  activeRole: UserRole;
  status: AccountStatus;
  languagePreference: LanguagePreference;
  phoneVerified: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthSessionSummaryDto {
  sessionId: string;
  deviceName: string;
  createdAt: string;
  lastRotatedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AuthTokensDto {
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

export interface AuthSessionResponseDto {
  user: UserProfileDto;
  tokens: AuthTokensDto;
  session: AuthSessionSummaryDto;
}

export interface OtpSendResponseDto {
  challengeId: string;
  channel: OtpChannel;
  maskedDestination: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

export interface ForgotPasswordResponseDto {
  accepted: true;
  message: string;
  expiresInSeconds: number;
}

export interface RateLimitState {
  allowed: boolean;
  retryAfterSeconds: number;
  count: number;
}

export type CreateUserInput = {
  name: string;
  emailNormalized?: string | null;
  phoneNormalized?: string | null;
  passwordHash?: string | null;
  roles: UserRole[];
  status: AccountStatus;
  languagePreference: LanguagePreference;
  phoneVerified: boolean;
  emailVerified: boolean;
  now: Date;
};

export type CreateSessionInput = {
  sessionId: string;
  userId: string;
  tokenFamilyId: string;
  currentGeneration: number;
  currentRefreshTokenHash: string;
  deviceName: string;
  ipHash: string;
  userAgentSummary: string;
  expiresAt: Date;
  now: Date;
};

export type CreateChallengeInput = {
  challengeId: string;
  purpose: ChallengePurpose;
  channel: OtpChannel;
  identifierNormalized: string;
  userId?: string | null;
  secretHash: string;
  maxAttempts: number;
  expiresAt: Date;
  now: Date;
};

export interface IdentityStore {
  findUserById(userId: string): Promise<UserRecord | null>;
  findUserByIdentifier(identifier: {
    emailNormalized?: string;
    phoneNormalized?: string;
  }): Promise<UserRecord | null>;
  createUserWithConsent(
    userInput: CreateUserInput,
    consent?: {
      consentType: 'TERMS_AND_PRIVACY';
      policyVersion: string;
      source: 'register' | 'otp_register';
    },
  ): Promise<UserRecord>;
  updateUser(
    userId: string,
    patch: Partial<
      Pick<
        UserRecord,
        | 'name'
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
  ): Promise<UserRecord | null>;

  createSession(input: CreateSessionInput): Promise<UserSessionRecord>;
  findSessionById(sessionId: string): Promise<UserSessionRecord | null>;
  listActiveSessionsForUser(userId: string, now: Date): Promise<UserSessionRecord[]>;
  rotateSessionRefreshHash(params: {
    sessionId: string;
    expectedRefreshTokenHash: string;
    nextRefreshTokenHash: string;
    nextGeneration: number;
    nextExpiresAt: Date;
    now: Date;
  }): Promise<UserSessionRecord | null>;
  revokeSession(sessionId: string, reason: string, now: Date): Promise<boolean>;
  revokeAllUserSessions(userId: string, reason: string, now: Date): Promise<number>;

  createChallenge(input: CreateChallengeInput): Promise<AuthChallengeRecord>;
  findLatestActiveChallenge(
    identifierNormalized: string,
    purpose: ChallengePurpose,
    now: Date,
  ): Promise<AuthChallengeRecord | null>;
  findChallengeById(challengeId: string): Promise<AuthChallengeRecord | null>;
  recordFailedChallengeAttempt(challengeId: string, now: Date): Promise<AuthChallengeRecord | null>;
  consumeChallengeAtomically(challengeId: string, now: Date): Promise<AuthChallengeRecord | null>;

  consumeRateLimitWindow(params: {
    scope: RateLimitScope;
    subjectKey: string;
    maxCount: number;
    windowSeconds: number;
    blockSeconds: number;
    now: Date;
  }): Promise<RateLimitState>;
  getRateLimitBlockStatus(params: {
    scope: RateLimitScope;
    subjectKey: string;
    now: Date;
  }): Promise<RateLimitState>;
  resetRateLimit(scope: RateLimitScope, subjectKey: string): Promise<void>;
}
