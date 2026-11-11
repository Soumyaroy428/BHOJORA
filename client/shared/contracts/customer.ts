import type { LanguagePreference } from './auth';

export const CUSTOMER_DIETARY_PREFERENCES = ['NONE', 'VEG', 'EGGETARIAN', 'VEGAN', 'JAIN'] as const;

export type CustomerDietaryPreference = (typeof CUSTOMER_DIETARY_PREFERENCES)[number];

export const LOCATION_PERMISSION_STATES = ['prompt', 'granted', 'denied', 'manual'] as const;
export type LocationPermissionState = (typeof LOCATION_PERMISSION_STATES)[number];

export const KOLKATA_ZONE_IDS = ['salt-lake', 'central', 'new-town', 'south', 'north'] as const;
export type KolkataZoneId = (typeof KOLKATA_ZONE_IDS)[number];

export const ADDRESS_LABELS = ['Home', 'Work', 'Other'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];

export const CONSENT_TYPES = [
  'TERMS_AND_PRIVACY',
  'ORDER_NOTIFICATIONS',
  'SAFETY_ALERTS',
  'MARKETING_PROMOTIONS',
  'PRECISE_LOCATION',
  'ACCOUNT_DELETION',
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_SOURCES = [
  'register',
  'otp_register',
  'profile_preferences',
  'location_prompt',
  'account_deletion',
] as const;

export type ConsentSource = (typeof CONSENT_SOURCES)[number];

export const ACCOUNT_DELETION_STATUSES = ['NONE', 'PENDING_RETENTION', 'ANONYMIZED'] as const;
export type AccountDeletionStatus = (typeof ACCOUNT_DELETION_STATUSES)[number];

export const ACCOUNT_DELETION_RETENTION_DAYS = 30;
export const GPS_LOCATION_RETENTION_HOURS = 24;

export interface NotificationPreferencesDto {
  orderUpdates: boolean;
  safetyAlerts: boolean;
  promotions: boolean;
}

export interface AccountDeletionRequestDto {
  status: AccountDeletionStatus;
  requestedAt: string | null;
  scheduledPurgeAt: string | null;
  reason?: string | null;
  retentionDays: number;
}

export interface CustomerProfileDto {
  userId: string;
  dietaryPreference: CustomerDietaryPreference;
  savedDeliveryZoneId: KolkataZoneId | null;
  notificationPreferences: NotificationPreferencesDto;
  locationPermissionState: LocationPermissionState;
  lastKnownLocalityLabel: string | null;
  deletionRequest: AccountDeletionRequestDto;
  updatedAt: string;
}

export interface GeoJsonPointDto {
  type: 'Point';
  coordinates: [number, number];
}

export interface SavedAddressDto {
  addressId: string;
  userId: string;
  label: AddressLabel;
  customLabel?: string | null;
  recipientName: string;
  contactPhoneMasked?: string | null;
  streetAddress: string;
  landmark: string;
  locality: string;
  city: string;
  postalCode: string;
  zoneId?: KolkataZoneId | null;
  deliveryInstructions?: string | null;
  location: GeoJsonPointDto;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentRecordDto {
  id: string;
  userId: string;
  consentType: ConsentType;
  granted: boolean;
  policyVersion: string;
  acceptedAt: string;
  source: ConsentSource;
  note?: string | null;
}

export interface CustomerAccountBundleDto {
  user: {
    id: string;
    name: string;
    emailMasked?: string | null;
    phoneMasked?: string | null;
    languagePreference: LanguagePreference;
    status: string;
  };
  profile: CustomerProfileDto;
  consents: ConsentRecordDto[];
}

export interface AccountDeletionResponseDto {
  deletedRequested: true;
  status: 'DELETION_REQUESTED';
  requestedAt: string;
  scheduledPurgeAt: string;
  retentionDays: number;
  revokedSessions: number;
  anonymizationSummary: string;
}
