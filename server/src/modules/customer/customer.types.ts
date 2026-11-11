// Customer profile, saved Kolkata addresses, consent & retention types (Checkpoint 09).

export const CUSTOMER_DIETARY_PREFERENCES = ['NONE', 'VEG', 'EGGETARIAN', 'VEGAN', 'JAIN'] as const;

export const LOCATION_PERMISSION_STATES = ['prompt', 'granted', 'denied', 'manual'] as const;

export const KOLKATA_ZONE_IDS = ['salt-lake', 'central', 'new-town', 'south', 'north'] as const;

export const ADDRESS_LABELS = ['Home', 'Work', 'Other'] as const;

export const ACCOUNT_DELETION_STATUSES = ['NONE', 'PENDING_RETENTION', 'ANONYMIZED'] as const;

export const ACCOUNT_DELETION_RETENTION_DAYS = 30;
export const GPS_LOCATION_RETENTION_HOURS = 24;
export const MAX_SAVED_ADDRESSES_PER_CUSTOMER = 15;

export type CustomerDietaryPreference = (typeof CUSTOMER_DIETARY_PREFERENCES)[number];
export type LocationPermissionState = (typeof LOCATION_PERMISSION_STATES)[number];
export type KolkataZoneId = (typeof KOLKATA_ZONE_IDS)[number];
export type AddressLabel = (typeof ADDRESS_LABELS)[number];
export type AccountDeletionStatus = (typeof ACCOUNT_DELETION_STATUSES)[number];

export interface NotificationPreferencesRecord {
  orderUpdates: boolean;
  safetyAlerts: boolean;
  promotions: boolean;
}

export interface AccountDeletionRequestRecord {
  status: AccountDeletionStatus;
  requestedAt: Date | null;
  scheduledPurgeAt: Date | null;
  reason?: string | null;
  retentionDays: number;
}

export interface CustomerProfileRecord {
  id: string;
  userId: string;
  dietaryPreference: CustomerDietaryPreference;
  savedDeliveryZoneId: KolkataZoneId | null;
  notificationPreferences: NotificationPreferencesRecord;
  locationPermissionState: LocationPermissionState;
  lastKnownLocalityLabel: string | null;
  deletionRequest: AccountDeletionRequestRecord;
  createdAt: Date;
  updatedAt: Date;
}

export interface SavedAddressRecord {
  id: string;
  addressId: string;
  userId: string;
  label: AddressLabel;
  customLabel?: string | null;
  recipientName: string;
  contactPhoneNormalized?: string | null;
  streetAddress: string;
  landmark: string;
  locality: string;
  city: string;
  postalCode: string;
  zoneId?: KolkataZoneId | null;
  deliveryInstructions?: string | null;
  location: {
    type: 'Point';
    coordinates: [number, number];
  };
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateAddressInput {
  addressId: string;
  userId: string;
  label: AddressLabel;
  customLabel?: string | null;
  recipientName: string;
  contactPhoneNormalized?: string | null;
  streetAddress: string;
  landmark: string;
  locality: string;
  city: string;
  postalCode: string;
  zoneId?: KolkataZoneId | null;
  deliveryInstructions?: string | null;
  coordinates: [number, number];
  isDefault: boolean;
}

export interface UpdateAddressInput {
  label?: AddressLabel;
  customLabel?: string | null;
  recipientName?: string;
  contactPhoneNormalized?: string | null;
  streetAddress?: string;
  landmark?: string;
  locality?: string;
  city?: string;
  postalCode?: string;
  zoneId?: KolkataZoneId | null;
  deliveryInstructions?: string | null;
  coordinates?: [number, number];
  isDefault?: boolean;
}

export interface CustomerStore {
  getOrInitializeProfile(userId: string, now: Date): Promise<CustomerProfileRecord>;
  updateCustomerProfile(
    userId: string,
    patch: {
      dietaryPreference?: CustomerDietaryPreference;
      savedDeliveryZoneId?: KolkataZoneId | null;
      notificationPreferences?: Partial<NotificationPreferencesRecord>;
      locationPermissionState?: LocationPermissionState;
      lastKnownLocalityLabel?: string | null;
    },
    now: Date,
  ): Promise<CustomerProfileRecord>;
  recordDeletionRequest(
    userId: string,
    input: {
      status: AccountDeletionStatus;
      requestedAt: Date;
      scheduledPurgeAt: Date;
      reason?: string | null;
      retentionDays: number;
    },
    now: Date,
  ): Promise<CustomerProfileRecord>;

  listAddressesForUser(userId: string): Promise<SavedAddressRecord[]>;
  findAddressById(addressId: string): Promise<SavedAddressRecord | null>;
  countAddressesForUser(userId: string): Promise<number>;
  createAddress(input: CreateAddressInput, now: Date): Promise<SavedAddressRecord>;
  updateAddressForUser(
    addressId: string,
    userId: string,
    patch: UpdateAddressInput,
    now: Date,
  ): Promise<SavedAddressRecord | null>;
  deleteAddressForUser(
    addressId: string,
    userId: string,
    now: Date,
  ): Promise<SavedAddressRecord | null>;
  setDefaultAddressForUser(
    addressId: string,
    userId: string,
    now: Date,
  ): Promise<SavedAddressRecord | null>;
}
