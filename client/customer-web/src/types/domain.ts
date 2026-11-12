import type { DiscoveryDishMatchDto, PlatformInspectionStatus } from '@bhojora/shared';

export type LanguagePreference = 'en-IN' | 'bn-IN';

export type KolkataZoneId = 'all' | 'salt-lake' | 'central' | 'new-town' | 'south' | 'north';

export interface TrustCategoryScore {
  label: string;
  percentage: number;
}

export interface KitchenOutlet {
  key: string;
  outletId?: string;
  name: string;
  fullName: string;
  locality: string;
  etaMinutes: string;
  etaMinValue: number;
  cuisines: string;
  rating: string;
  ratingNumeric: number;
  reviewCount: string;
  platformInspectionStatus: PlatformInspectionStatus;
  isVerified: boolean;
  score: number | null;
  auditedMonth: string;
  auditDate: string | null;
  statusExplanation: string;
  fssai: string;
  isPureVeg: boolean;
  isOpenNow: boolean;
  minPricePaise: number;
  coordinates: readonly [number, number];
  distanceMeters?: number;
  serviceable?: boolean;
  zones: readonly Exclude<KolkataZoneId, 'all'>[];
  searchText: string;
  imageUrl: string;
  categoryPercentages: readonly [number, number, number, number, number] | null;
  matchedDishes?: readonly DiscoveryDishMatchDto[];
}

export type AuthPanelName = 'login' | 'otp' | 'register' | 'recover';

export interface UserProfileView {
  id: string;
  name: string;
  emailMasked?: string | null;
  phoneMasked?: string | null;
  roles: string[];
  activeRole: string;
  status: string;
  languagePreference: LanguagePreference;
  phoneVerified: boolean;
  emailVerified: boolean;
  createdAt: string;
}

export interface AuthSessionSummaryView {
  sessionId: string;
  deviceName: string;
  createdAt: string;
  lastRotatedAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AuthTokensView {
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  accessExpiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

export interface AuthSessionState {
  user: UserProfileView;
  tokens: AuthTokensView;
  session: AuthSessionSummaryView;
}

export type CustomerDietaryPreference = 'NONE' | 'VEG' | 'EGGETARIAN' | 'VEGAN' | 'JAIN';
export type LocationPermissionState = 'prompt' | 'granted' | 'denied' | 'manual';
export type AddressLabel = 'Home' | 'Work' | 'Other';

export interface NotificationPreferencesView {
  orderUpdates: boolean;
  safetyAlerts: boolean;
  promotions: boolean;
}

export interface CustomerProfileView {
  userId: string;
  dietaryPreference: CustomerDietaryPreference;
  savedDeliveryZoneId: Exclude<KolkataZoneId, 'all'> | null;
  notificationPreferences: NotificationPreferencesView;
  locationPermissionState: LocationPermissionState;
  lastKnownLocalityLabel: string | null;
  deletionRequest: {
    status: 'NONE' | 'PENDING_RETENTION' | 'ANONYMIZED';
    requestedAt: string | null;
    scheduledPurgeAt: string | null;
    reason?: string | null;
    retentionDays: number;
  };
  updatedAt: string;
}

export interface SavedAddressView {
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
  zoneId?: Exclude<KolkataZoneId, 'all'> | null;
  deliveryInstructions?: string | null;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConsentRecordView {
  id: string;
  userId: string;
  consentType: string;
  granted: boolean;
  policyVersion: string;
  acceptedAt: string;
  source: string;
  note?: string | null;
}
