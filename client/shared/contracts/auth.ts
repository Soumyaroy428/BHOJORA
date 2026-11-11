/**
 * BHOJORA — Shared Authentication & Identity Contracts
 * Consumed by server modular monolith domains and all 6 web/mobile client surfaces.
 */

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

export interface RegisterRequest {
  name: string;
  email?: string;
  phone?: string;
  password: string;
  languagePreference?: LanguagePreference;
  acceptTerms: true;
  deviceName?: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
  deviceName?: string;
}

export interface OtpSendRequest {
  identifier: string;
  channel?: OtpChannel;
}

export interface OtpVerifyRequest {
  challengeId: string;
  identifier: string;
  otp: string;
  name?: string;
  languagePreference?: LanguagePreference;
  acceptTerms?: boolean;
  deviceName?: string;
}

export interface RefreshRequest {
  refreshToken?: string;
}

export interface ForgotPasswordRequest {
  identifier: string;
}

export interface ResetPasswordRequest {
  identifier: string;
  token: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  name?: string;
  languagePreference?: LanguagePreference;
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
  challengeId?: string;
  expiresInSeconds: number;
}
