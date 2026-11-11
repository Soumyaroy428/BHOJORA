import crypto from 'node:crypto';
import { z } from 'zod';
import type { Logger } from '../../config/logger';
import { DEFAULT_KOLKATA_CENTER, isValidGeoJsonPointCoordinates } from '../../database/conventions';
import { AppError } from '../../middleware/error-handler';
import { maskEmail, maskPhone, normalizeIndianPhone } from '../identity/identity.crypto';
import {
  CONSENT_SOURCES,
  CONSENT_TYPES,
  LANGUAGE_PREFERENCES,
  SYSTEM_CLOCK,
  type Clock,
  type ConsentRecord,
  type ConsentSource,
  type ConsentType,
  type IdentityStore,
  type UserRole,
} from '../identity/identity.types';
import type { RbacStore } from '../rbac/rbac.store';
import {
  ACCOUNT_DELETION_RETENTION_DAYS,
  ADDRESS_LABELS,
  CUSTOMER_DIETARY_PREFERENCES,
  GPS_LOCATION_RETENTION_HOURS,
  KOLKATA_ZONE_IDS,
  LOCATION_PERMISSION_STATES,
  MAX_SAVED_ADDRESSES_PER_CUSTOMER,
  type CustomerProfileRecord,
  type CustomerStore,
  type KolkataZoneId,
  type SavedAddressRecord,
} from './customer.types';

export const POLICY_VERSION = '2026-11-kolkata-v1';

const KOLKATA_ZONE_CENTERS: Readonly<Record<KolkataZoneId, readonly [number, number]>> = {
  'salt-lake': [88.4317, 22.5806],
  central: [88.3526, 22.5535],
  'new-town': [88.4655, 22.5922],
  south: [88.3665, 22.5262],
  north: [88.3735, 22.6012],
};

const coordinatesSchema = z
  .tuple([z.number(), z.number()])
  .refine((coords) => isValidGeoJsonPointCoordinates(coords), {
    message: 'Coordinates must be finite [longitude, latitude] within valid bounds',
  });

const updateAccountProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').max(120).optional(),
    languagePreference: z.enum(LANGUAGE_PREFERENCES).optional(),
    dietaryPreference: z.enum(CUSTOMER_DIETARY_PREFERENCES).optional(),
    savedDeliveryZoneId: z.enum(KOLKATA_ZONE_IDS).nullable().optional(),
    locationPermissionState: z.enum(LOCATION_PERMISSION_STATES).optional(),
    lastKnownLocalityLabel: z.string().trim().max(120).nullable().optional(),
    notificationPreferences: z
      .object({
        orderUpdates: z.boolean().optional(),
        safetyAlerts: z.boolean().optional(),
        promotions: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'At least one customer profile field must be provided',
  });

const createAddressSchema = z.object({
  label: z.enum(ADDRESS_LABELS).default('Home'),
  customLabel: z.string().trim().max(40).nullable().optional(),
  recipientName: z.string().trim().min(1, 'Recipient name is required').max(120),
  contactPhone: z.string().trim().max(24).nullable().optional(),
  streetAddress: z.string().trim().min(4, 'Street and building details are required').max(240),
  landmark: z.string().trim().min(2, 'Kolkata landmark is required').max(140),
  locality: z.string().trim().min(2, 'Locality / neighborhood is required').max(80),
  city: z.string().trim().min(2).max(60).default('Kolkata'),
  postalCode: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit Indian PIN code'),
  zoneId: z.enum(KOLKATA_ZONE_IDS).nullable().optional(),
  deliveryInstructions: z.string().trim().max(200).nullable().optional(),
  coordinates: coordinatesSchema.optional(),
  isDefault: z.boolean().default(false),
});

const updateAddressSchema = z
  .object({
    label: z.enum(ADDRESS_LABELS).optional(),
    customLabel: z.string().trim().max(40).nullable().optional(),
    recipientName: z.string().trim().min(1).max(120).optional(),
    contactPhone: z.string().trim().max(24).nullable().optional(),
    streetAddress: z.string().trim().min(4).max(240).optional(),
    landmark: z.string().trim().min(2).max(140).optional(),
    locality: z.string().trim().min(2).max(80).optional(),
    city: z.string().trim().min(2).max(60).optional(),
    postalCode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit Indian PIN code')
      .optional(),
    zoneId: z.enum(KOLKATA_ZONE_IDS).nullable().optional(),
    deliveryInstructions: z.string().trim().max(200).nullable().optional(),
    coordinates: coordinatesSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: 'At least one address field must be provided',
  });

const recordConsentSchema = z.object({
  consentType: z.enum(CONSENT_TYPES),
  granted: z.boolean(),
  policyVersion: z.string().trim().min(2).max(40).default(POLICY_VERSION),
  source: z.enum(CONSENT_SOURCES).default('profile_preferences'),
  note: z.string().trim().max(240).nullable().optional(),
});

const deletionRequestSchema = z.object({
  confirmText: z.literal('DELETE', {
    error: 'Type DELETE to confirm account deletion and session termination',
  }),
  reason: z.string().trim().max(240).nullable().optional(),
});

function formatCustomerProfileDto(profile: CustomerProfileRecord) {
  return {
    userId: profile.userId,
    dietaryPreference: profile.dietaryPreference,
    savedDeliveryZoneId: profile.savedDeliveryZoneId,
    notificationPreferences: { ...profile.notificationPreferences },
    locationPermissionState: profile.locationPermissionState,
    lastKnownLocalityLabel: profile.lastKnownLocalityLabel,
    deletionRequest: {
      status: profile.deletionRequest.status,
      requestedAt: profile.deletionRequest.requestedAt?.toISOString() ?? null,
      scheduledPurgeAt: profile.deletionRequest.scheduledPurgeAt?.toISOString() ?? null,
      reason: profile.deletionRequest.reason ?? null,
      retentionDays: profile.deletionRequest.retentionDays,
    },
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function formatSavedAddressDto(record: SavedAddressRecord) {
  return {
    addressId: record.addressId,
    userId: record.userId,
    label: record.label,
    customLabel: record.customLabel ?? null,
    recipientName: record.recipientName,
    contactPhoneMasked: record.contactPhoneNormalized
      ? maskPhone(record.contactPhoneNormalized)
      : null,
    streetAddress: record.streetAddress,
    landmark: record.landmark,
    locality: record.locality,
    city: record.city,
    postalCode: record.postalCode,
    zoneId: record.zoneId ?? null,
    deliveryInstructions: record.deliveryInstructions ?? null,
    location: {
      type: 'Point' as const,
      coordinates: [...record.location.coordinates] as [number, number],
    },
    isDefault: record.isDefault,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function formatConsentDto(record: ConsentRecord) {
  return {
    id: record.id,
    userId: record.userId,
    consentType: record.consentType,
    granted: record.granted,
    policyVersion: record.policyVersion,
    acceptedAt: record.acceptedAt.toISOString(),
    source: record.source,
    note: record.note ?? null,
  };
}

function resolveOptionalContactPhone(
  rawPhone: string | null | undefined,
): string | null | undefined {
  if (rawPhone === undefined) {
    return undefined;
  }
  if (rawPhone === null || rawPhone === '') {
    return null;
  }
  const normalized = normalizeIndianPhone(rawPhone);
  if (!normalized) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Contact phone must be a valid 10-digit Indian mobile number',
    );
  }
  return normalized;
}

export interface CustomerServiceOptions {
  identityStore: IdentityStore;
  customerStore: CustomerStore;
  rbacStore?: RbacStore;
  logger: Logger;
  clock?: Clock;
}

export class CustomerService {
  private readonly clock: Clock;

  constructor(private readonly options: CustomerServiceOptions) {
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  async getAccountBundle(userId: string) {
    const now = this.clock.now();
    const user = await this.options.identityStore.findUserById(userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'Account not found');
    }
    const [profile, consents] = await Promise.all([
      this.options.customerStore.getOrInitializeProfile(userId, now),
      this.options.identityStore.listConsentRecordsForUser(userId, 25),
    ]);

    return {
      user: {
        id: user.id,
        name: user.name,
        emailMasked: user.emailNormalized ? maskEmail(user.emailNormalized) : null,
        phoneMasked: user.phoneNormalized ? maskPhone(user.phoneNormalized) : null,
        languagePreference: user.languagePreference,
        status: user.status,
      },
      profile: formatCustomerProfileDto(profile),
      consents: consents.map(formatConsentDto),
    };
  }

  async updateAccountBundle(userId: string, rawInput: unknown, requestId?: string) {
    const input = updateAccountProfileSchema.parse(rawInput);
    const now = this.clock.now();
    const currentUser = await this.options.identityStore.findUserById(userId);
    if (!currentUser) {
      throw new AppError(404, 'NOT_FOUND', 'Account not found');
    }

    if (input.name !== undefined || input.languagePreference !== undefined) {
      await this.options.identityStore.updateUser(
        userId,
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.languagePreference !== undefined
            ? { languagePreference: input.languagePreference }
            : {}),
        },
        now,
      );
    }

    const updatedProfile = await this.options.customerStore.updateCustomerProfile(
      userId,
      {
        ...(input.dietaryPreference !== undefined
          ? { dietaryPreference: input.dietaryPreference }
          : {}),
        ...(input.savedDeliveryZoneId !== undefined
          ? { savedDeliveryZoneId: input.savedDeliveryZoneId }
          : {}),
        ...(input.locationPermissionState !== undefined
          ? { locationPermissionState: input.locationPermissionState }
          : {}),
        ...(input.lastKnownLocalityLabel !== undefined
          ? { lastKnownLocalityLabel: input.lastKnownLocalityLabel }
          : {}),
        ...(input.notificationPreferences !== undefined
          ? { notificationPreferences: input.notificationPreferences }
          : {}),
      },
      now,
    );

    await this.syncConsentRecordsFromProfileUpdate(userId, input, now);
    this.options.logger.info('customer.profile.updated', {
      requestId,
      userId,
      locationPermissionState: updatedProfile.locationPermissionState,
    });

    return this.getAccountBundle(userId);
  }

  private async syncConsentRecordsFromProfileUpdate(
    userId: string,
    input: z.infer<typeof updateAccountProfileSchema>,
    now: Date,
  ): Promise<void> {
    const appendConsent = async (
      consentType: ConsentType,
      granted: boolean,
      source: ConsentSource,
      note?: string,
    ) => {
      await this.options.identityStore.appendConsentRecord({
        userId,
        consentType,
        granted,
        policyVersion: POLICY_VERSION,
        source,
        note: note ?? null,
        now,
      });
    };

    if (input.locationPermissionState === 'granted' || input.locationPermissionState === 'denied') {
      await appendConsent(
        'PRECISE_LOCATION',
        input.locationPermissionState === 'granted',
        'location_prompt',
        `Browser location choice: ${input.locationPermissionState}`,
      );
    }
    if (input.notificationPreferences?.orderUpdates !== undefined) {
      await appendConsent(
        'ORDER_NOTIFICATIONS',
        input.notificationPreferences.orderUpdates,
        'profile_preferences',
      );
    }
    if (input.notificationPreferences?.safetyAlerts !== undefined) {
      await appendConsent(
        'SAFETY_ALERTS',
        input.notificationPreferences.safetyAlerts,
        'profile_preferences',
      );
    }
    if (input.notificationPreferences?.promotions !== undefined) {
      await appendConsent(
        'MARKETING_PROMOTIONS',
        input.notificationPreferences.promotions,
        'profile_preferences',
      );
    }
  }

  async listAddresses(userId: string) {
    const addresses = await this.options.customerStore.listAddressesForUser(userId);
    return addresses.map(formatSavedAddressDto);
  }

  async createAddress(userId: string, rawInput: unknown, requestId?: string) {
    const input = createAddressSchema.parse(rawInput);
    const now = this.clock.now();

    const currentCount = await this.options.customerStore.countAddressesForUser(userId);
    if (currentCount >= MAX_SAVED_ADDRESSES_PER_CUSTOMER) {
      throw new AppError(
        409,
        'CONFLICT',
        `Maximum of ${MAX_SAVED_ADDRESSES_PER_CUSTOMER} saved addresses reached`,
      );
    }

    const zoneCenter = input.zoneId ? KOLKATA_ZONE_CENTERS[input.zoneId] : DEFAULT_KOLKATA_CENTER;
    const coordinates: [number, number] = input.coordinates
      ? [input.coordinates[0], input.coordinates[1]]
      : [zoneCenter[0], zoneCenter[1]];

    const contactPhoneNormalized = resolveOptionalContactPhone(input.contactPhone) ?? null;

    const created = await this.options.customerStore.createAddress(
      {
        addressId: crypto.randomUUID(),
        userId,
        label: input.label,
        customLabel: input.customLabel ?? null,
        recipientName: input.recipientName,
        contactPhoneNormalized,
        streetAddress: input.streetAddress,
        landmark: input.landmark,
        locality: input.locality,
        city: input.city,
        postalCode: input.postalCode,
        zoneId: input.zoneId ?? null,
        deliveryInstructions: input.deliveryInstructions ?? null,
        coordinates,
        isDefault: input.isDefault,
      },
      now,
    );

    this.options.logger.info('customer.address.created', {
      requestId,
      userId,
      addressId: created.addressId,
      zoneId: created.zoneId,
    });

    return formatSavedAddressDto(created);
  }

  private async resolveOwnedAddress(
    addressId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string,
  ): Promise<SavedAddressRecord> {
    const address = await this.options.customerStore.findAddressById(addressId);
    if (!address) {
      throw new AppError(404, 'NOT_FOUND', 'Saved address not found');
    }
    if (address.userId !== actorUserId) {
      if (this.options.rbacStore) {
        await this.options.rbacStore.appendAuditLog({
          actorId: actorUserId,
          actorRole,
          action: 'address.ownership.denied',
          resourceType: 'address',
          resourceId: addressId,
          outcome: 'DENIED',
          reason: 'Cross-customer address access attempted',
          requestId: requestId ?? null,
        });
      }
      throw new AppError(403, 'FORBIDDEN', 'You may only access your own saved addresses');
    }
    return address;
  }

  async getAddressById(
    addressId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string,
  ) {
    const owned = await this.resolveOwnedAddress(addressId, actorUserId, actorRole, requestId);
    return formatSavedAddressDto(owned);
  }

  async updateAddress(
    addressId: string,
    actorUserId: string,
    actorRole: UserRole,
    rawInput: unknown,
    requestId?: string,
  ) {
    await this.resolveOwnedAddress(addressId, actorUserId, actorRole, requestId);
    const input = updateAddressSchema.parse(rawInput);
    const now = this.clock.now();

    const contactPhoneNormalized = resolveOptionalContactPhone(input.contactPhone);

    const updated = await this.options.customerStore.updateAddressForUser(
      addressId,
      actorUserId,
      {
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.customLabel !== undefined ? { customLabel: input.customLabel } : {}),
        ...(input.recipientName !== undefined ? { recipientName: input.recipientName } : {}),
        ...(contactPhoneNormalized !== undefined ? { contactPhoneNormalized } : {}),
        ...(input.streetAddress !== undefined ? { streetAddress: input.streetAddress } : {}),
        ...(input.landmark !== undefined ? { landmark: input.landmark } : {}),
        ...(input.locality !== undefined ? { locality: input.locality } : {}),
        ...(input.city !== undefined ? { city: input.city } : {}),
        ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
        ...(input.zoneId !== undefined ? { zoneId: input.zoneId } : {}),
        ...(input.deliveryInstructions !== undefined
          ? { deliveryInstructions: input.deliveryInstructions }
          : {}),
        ...(input.coordinates !== undefined ? { coordinates: input.coordinates } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      },
      now,
    );
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Saved address not found');
    }

    this.options.logger.info('customer.address.updated', {
      requestId,
      userId: actorUserId,
      addressId,
    });
    return formatSavedAddressDto(updated);
  }

  async deleteAddress(
    addressId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string,
  ) {
    await this.resolveOwnedAddress(addressId, actorUserId, actorRole, requestId);
    const deleted = await this.options.customerStore.deleteAddressForUser(
      addressId,
      actorUserId,
      this.clock.now(),
    );
    if (!deleted) {
      throw new AppError(404, 'NOT_FOUND', 'Saved address not found');
    }
    this.options.logger.info('customer.address.deleted', {
      requestId,
      userId: actorUserId,
      addressId,
    });
    return { deleted: true as const, addressId: deleted.addressId };
  }

  async setDefaultAddress(
    addressId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId?: string,
  ) {
    await this.resolveOwnedAddress(addressId, actorUserId, actorRole, requestId);
    const updated = await this.options.customerStore.setDefaultAddressForUser(
      addressId,
      actorUserId,
      this.clock.now(),
    );
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', 'Saved address not found');
    }
    return formatSavedAddressDto(updated);
  }

  async listConsents(userId: string) {
    const records = await this.options.identityStore.listConsentRecordsForUser(userId, 50);
    return records.map(formatConsentDto);
  }

  async recordConsent(userId: string, rawInput: unknown, requestId?: string) {
    const input = recordConsentSchema.parse(rawInput);
    const now = this.clock.now();

    if (input.consentType === 'TERMS_AND_PRIVACY' && !input.granted) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Withdrawing core Terms & Privacy consent requires using POST /api/v1/customer/account/deletion-request',
      );
    }

    const record = await this.options.identityStore.appendConsentRecord({
      userId,
      consentType: input.consentType,
      granted: input.granted,
      policyVersion: input.policyVersion,
      source: input.source,
      note: input.note ?? null,
      now,
    });

    if (input.consentType === 'PRECISE_LOCATION') {
      await this.options.customerStore.updateCustomerProfile(
        userId,
        { locationPermissionState: input.granted ? 'granted' : 'denied' },
        now,
      );
    } else if (input.consentType === 'ORDER_NOTIFICATIONS') {
      await this.options.customerStore.updateCustomerProfile(
        userId,
        { notificationPreferences: { orderUpdates: input.granted } },
        now,
      );
    } else if (input.consentType === 'SAFETY_ALERTS') {
      await this.options.customerStore.updateCustomerProfile(
        userId,
        { notificationPreferences: { safetyAlerts: input.granted } },
        now,
      );
    } else if (input.consentType === 'MARKETING_PROMOTIONS') {
      await this.options.customerStore.updateCustomerProfile(
        userId,
        { notificationPreferences: { promotions: input.granted } },
        now,
      );
    }

    this.options.logger.info('customer.consent.recorded', {
      requestId,
      userId,
      consentType: input.consentType,
      granted: input.granted,
    });

    return formatConsentDto(record);
  }

  async exportPrivacyData(userId: string) {
    const [account, addresses] = await Promise.all([
      this.getAccountBundle(userId),
      this.listAddresses(userId),
    ]);

    return {
      exportedAt: this.clock.now().toISOString(),
      account: account.user,
      profile: account.profile,
      addresses,
      consents: account.consents,
      retentionPolicy: {
        accountDeletionGraceDays: ACCOUNT_DELETION_RETENTION_DAYS,
        gpsLocationRetentionHours: GPS_LOCATION_RETENTION_HOURS,
        statutoryLedgerRetentionNote:
          'Personal contact identifiers and saved delivery addresses are purged or anonymized after the 30-day deletion hold; statutory tax/order financial ledgers are retained in pseudonymous form as required under Indian accounting law.',
      },
    };
  }

  async requestAccountDeletion(
    userId: string,
    actorRole: UserRole,
    rawInput: unknown,
    requestId?: string,
  ) {
    const input = deletionRequestSchema.parse(rawInput);
    const now = this.clock.now();
    const user = await this.options.identityStore.findUserById(userId);
    if (!user) {
      throw new AppError(404, 'NOT_FOUND', 'Account not found');
    }
    if (user.status === 'DELETION_REQUESTED') {
      throw new AppError(409, 'CONFLICT', 'Account deletion has already been requested');
    }

    const scheduledPurgeAt = new Date(
      now.getTime() + ACCOUNT_DELETION_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );

    await this.options.identityStore.updateUser(userId, { status: 'DELETION_REQUESTED' }, now);
    const revokedSessions = await this.options.identityStore.revokeAllUserSessions(
      userId,
      'ACCOUNT_DELETION_REQUESTED',
      now,
    );
    await this.options.customerStore.recordDeletionRequest(
      userId,
      {
        status: 'PENDING_RETENTION',
        requestedAt: now,
        scheduledPurgeAt,
        reason: input.reason ?? null,
        retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
      },
      now,
    );
    await this.options.identityStore.appendConsentRecord({
      userId,
      consentType: 'ACCOUNT_DELETION',
      granted: true,
      policyVersion: POLICY_VERSION,
      source: 'account_deletion',
      note: input.reason ?? 'Self-service customer deletion request',
      now,
    });

    if (this.options.rbacStore) {
      await this.options.rbacStore.appendAuditLog({
        actorId: userId,
        actorRole,
        action: 'customer.account.deletion_requested',
        resourceType: 'user',
        resourceId: userId,
        outcome: 'ALLOWED',
        reason: input.reason ?? 'Customer initiated self-service deletion',
        requestId: requestId ?? null,
      });
    }

    this.options.logger.info('customer.account.deletion_requested', {
      requestId,
      userId,
      revokedSessions,
      retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
    });

    return {
      deletedRequested: true as const,
      status: 'DELETION_REQUESTED' as const,
      requestedAt: now.toISOString(),
      scheduledPurgeAt: scheduledPurgeAt.toISOString(),
      retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
      revokedSessions,
      anonymizationSummary:
        'All active sessions are immediately revoked. Direct PII (name, phone, email, saved addresses) is scheduled for irreversible anonymization after 30 days, while anonymized GST/order ledgers persist solely for statutory compliance.',
    };
  }
}
