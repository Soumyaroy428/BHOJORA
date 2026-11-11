import type { Connection, HydratedDocument, Model } from 'mongoose';
import { Schema } from 'mongoose';
import {
  applyBaseSchemaConventions,
  COLLECTION_NAMES,
  createGeoPointSubSchema,
} from '../../database/conventions';
import {
  ACCOUNT_DELETION_RETENTION_DAYS,
  ACCOUNT_DELETION_STATUSES,
  ADDRESS_LABELS,
  CUSTOMER_DIETARY_PREFERENCES,
  KOLKATA_ZONE_IDS,
  LOCATION_PERMISSION_STATES,
  type AccountDeletionStatus,
  type AddressLabel,
  type CreateAddressInput,
  type CustomerDietaryPreference,
  type CustomerProfileRecord,
  type CustomerStore,
  type KolkataZoneId,
  type LocationPermissionState,
  type NotificationPreferencesRecord,
  type SavedAddressRecord,
  type UpdateAddressInput,
} from './customer.types';

const customerProfileSchema = applyBaseSchemaConventions(
  new Schema({
    userId: { type: String, required: true },
    dietaryPreference: {
      type: String,
      enum: CUSTOMER_DIETARY_PREFERENCES,
      required: true,
      default: 'NONE',
    },
    savedDeliveryZoneId: {
      type: String,
      enum: KOLKATA_ZONE_IDS,
      required: false,
      default: null,
    },
    notificationPreferences: {
      type: {
        orderUpdates: { type: Boolean, required: true, default: true },
        safetyAlerts: { type: Boolean, required: true, default: true },
        promotions: { type: Boolean, required: true, default: false },
      },
      required: true,
      default: () => ({ orderUpdates: true, safetyAlerts: true, promotions: false }),
      _id: false,
    },
    locationPermissionState: {
      type: String,
      enum: LOCATION_PERMISSION_STATES,
      required: true,
      default: 'prompt',
    },
    lastKnownLocalityLabel: { type: String, required: false, default: null, maxlength: 120 },
    deletionRequest: {
      type: {
        status: {
          type: String,
          enum: ACCOUNT_DELETION_STATUSES,
          required: true,
          default: 'NONE',
        },
        requestedAt: { type: Date, required: false, default: null },
        scheduledPurgeAt: { type: Date, required: false, default: null },
        reason: { type: String, required: false, default: null, maxlength: 240 },
        retentionDays: { type: Number, required: true, default: ACCOUNT_DELETION_RETENTION_DAYS },
      },
      required: true,
      default: () => ({
        status: 'NONE',
        requestedAt: null,
        scheduledPurgeAt: null,
        reason: null,
        retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
      }),
      _id: false,
    },
  }),
);

const savedAddressSchema = applyBaseSchemaConventions(
  new Schema({
    addressId: { type: String, required: true },
    userId: { type: String, required: true },
    label: { type: String, enum: ADDRESS_LABELS, required: true, default: 'Home' },
    customLabel: { type: String, required: false, default: null, maxlength: 40 },
    recipientName: { type: String, required: true, trim: true, minlength: 1, maxlength: 120 },
    contactPhoneNormalized: { type: String, required: false, default: null, maxlength: 24 },
    streetAddress: { type: String, required: true, trim: true, minlength: 4, maxlength: 240 },
    landmark: { type: String, required: true, trim: true, minlength: 2, maxlength: 140 },
    locality: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    city: { type: String, required: true, trim: true, default: 'Kolkata', maxlength: 60 },
    postalCode: { type: String, required: true, trim: true, maxlength: 10 },
    zoneId: { type: String, enum: KOLKATA_ZONE_IDS, required: false, default: null },
    deliveryInstructions: { type: String, required: false, default: null, maxlength: 200 },
    location: { type: createGeoPointSubSchema(), required: true },
    isDefault: { type: Boolean, required: true, default: false },
  }),
);

export interface MongooseCustomerModels {
  CustomerProfile: Model<Record<string, unknown>>;
  SavedAddress: Model<Record<string, unknown>>;
}

export function createMongooseCustomerModels(connection: Connection): MongooseCustomerModels {
  const resolveModel = (
    name: string,
    schema: Schema<Record<string, unknown>>,
    collectionName: string,
  ): Model<Record<string, unknown>> => {
    const existing = connection.models[name] as Model<Record<string, unknown>> | undefined;
    if (existing) {
      return existing;
    }
    return connection.model<Record<string, unknown>>(name, schema, collectionName);
  };

  return {
    CustomerProfile: resolveModel(
      'BhojoraCustomerProfile',
      customerProfileSchema as Schema<Record<string, unknown>>,
      COLLECTION_NAMES.customerProfiles,
    ),
    SavedAddress: resolveModel(
      'BhojoraSavedAddress',
      savedAddressSchema as Schema<Record<string, unknown>>,
      COLLECTION_NAMES.addresses,
    ),
  };
}

function asPlainObject(
  doc: HydratedDocument<Record<string, unknown>> | Record<string, unknown>,
): Record<string, unknown> {
  if (doc instanceof Object && 'toObject' in doc && typeof doc.toObject === 'function') {
    return doc.toObject() as Record<string, unknown>;
  }
  return doc;
}

function toCustomerProfileRecord(
  doc: HydratedDocument<Record<string, unknown>> | Record<string, unknown>,
): CustomerProfileRecord {
  const raw = asPlainObject(doc);
  const prefsRaw = (raw['notificationPreferences'] ?? {}) as Record<string, unknown>;
  const delRaw = (raw['deletionRequest'] ?? {}) as Record<string, unknown>;
  return {
    id: String(raw['id'] ?? raw['_id']),
    userId: String(raw['userId']),
    dietaryPreference: (raw['dietaryPreference'] as CustomerDietaryPreference) ?? 'NONE',
    savedDeliveryZoneId:
      typeof raw['savedDeliveryZoneId'] === 'string'
        ? (raw['savedDeliveryZoneId'] as KolkataZoneId)
        : null,
    notificationPreferences: {
      orderUpdates:
        prefsRaw['orderUpdates'] === undefined ? true : Boolean(prefsRaw['orderUpdates']),
      safetyAlerts:
        prefsRaw['safetyAlerts'] === undefined ? true : Boolean(prefsRaw['safetyAlerts']),
      promotions: Boolean(prefsRaw['promotions']),
    },
    locationPermissionState:
      (raw['locationPermissionState'] as LocationPermissionState) ?? 'prompt',
    lastKnownLocalityLabel:
      typeof raw['lastKnownLocalityLabel'] === 'string' ? raw['lastKnownLocalityLabel'] : null,
    deletionRequest: {
      status: (delRaw['status'] as AccountDeletionStatus) ?? 'NONE',
      requestedAt: delRaw['requestedAt'] instanceof Date ? delRaw['requestedAt'] : null,
      scheduledPurgeAt:
        delRaw['scheduledPurgeAt'] instanceof Date ? delRaw['scheduledPurgeAt'] : null,
      reason: typeof delRaw['reason'] === 'string' ? delRaw['reason'] : null,
      retentionDays:
        typeof delRaw['retentionDays'] === 'number'
          ? delRaw['retentionDays']
          : ACCOUNT_DELETION_RETENTION_DAYS,
    },
    createdAt: raw['createdAt'] instanceof Date ? raw['createdAt'] : new Date(),
    updatedAt: raw['updatedAt'] instanceof Date ? raw['updatedAt'] : new Date(),
  };
}

function toSavedAddressRecord(
  doc: HydratedDocument<Record<string, unknown>> | Record<string, unknown>,
): SavedAddressRecord {
  const raw = asPlainObject(doc);
  const locRaw = (raw['location'] ?? {}) as { coordinates?: unknown };
  const coords = Array.isArray(locRaw.coordinates) ? locRaw.coordinates : [88.3639, 22.5726];
  return {
    id: String(raw['id'] ?? raw['_id']),
    addressId: String(raw['addressId']),
    userId: String(raw['userId']),
    label: (raw['label'] as AddressLabel) ?? 'Home',
    customLabel: typeof raw['customLabel'] === 'string' ? raw['customLabel'] : null,
    recipientName: String(raw['recipientName']),
    contactPhoneNormalized:
      typeof raw['contactPhoneNormalized'] === 'string' ? raw['contactPhoneNormalized'] : null,
    streetAddress: String(raw['streetAddress']),
    landmark: String(raw['landmark']),
    locality: String(raw['locality']),
    city: String(raw['city'] ?? 'Kolkata'),
    postalCode: String(raw['postalCode']),
    zoneId: typeof raw['zoneId'] === 'string' ? (raw['zoneId'] as KolkataZoneId) : null,
    deliveryInstructions:
      typeof raw['deliveryInstructions'] === 'string' ? raw['deliveryInstructions'] : null,
    location: {
      type: 'Point',
      coordinates: [Number(coords[0]), Number(coords[1])],
    },
    isDefault: Boolean(raw['isDefault']),
    createdAt: raw['createdAt'] instanceof Date ? raw['createdAt'] : new Date(),
    updatedAt: raw['updatedAt'] instanceof Date ? raw['updatedAt'] : new Date(),
  };
}

export class MongooseCustomerStore implements CustomerStore {
  private readonly models: MongooseCustomerModels;

  constructor(connection: Connection) {
    this.models = createMongooseCustomerModels(connection);
  }

  getModels(): MongooseCustomerModels {
    return this.models;
  }

  async getOrInitializeProfile(userId: string, _now: Date): Promise<CustomerProfileRecord> {
    const doc = await this.models.CustomerProfile.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId } },
      { upsert: true, new: true, runValidators: true },
    );
    if (!doc) {
      throw new Error('Failed to load or initialize customer profile');
    }
    return toCustomerProfileRecord(doc);
  }

  async updateCustomerProfile(
    userId: string,
    patch: {
      dietaryPreference?: CustomerDietaryPreference;
      savedDeliveryZoneId?: KolkataZoneId | null;
      notificationPreferences?: Partial<NotificationPreferencesRecord>;
      locationPermissionState?: LocationPermissionState;
      lastKnownLocalityLabel?: string | null;
    },
    now: Date,
  ): Promise<CustomerProfileRecord> {
    await this.getOrInitializeProfile(userId, now);
    const setFields: Record<string, unknown> = {};
    if (patch.dietaryPreference !== undefined) {
      setFields['dietaryPreference'] = patch.dietaryPreference;
    }
    if (patch.savedDeliveryZoneId !== undefined) {
      setFields['savedDeliveryZoneId'] = patch.savedDeliveryZoneId;
    }
    if (patch.locationPermissionState !== undefined) {
      setFields['locationPermissionState'] = patch.locationPermissionState;
    }
    if (patch.lastKnownLocalityLabel !== undefined) {
      setFields['lastKnownLocalityLabel'] = patch.lastKnownLocalityLabel;
    }
    if (patch.notificationPreferences) {
      if (patch.notificationPreferences.orderUpdates !== undefined) {
        setFields['notificationPreferences.orderUpdates'] =
          patch.notificationPreferences.orderUpdates;
      }
      if (patch.notificationPreferences.safetyAlerts !== undefined) {
        setFields['notificationPreferences.safetyAlerts'] =
          patch.notificationPreferences.safetyAlerts;
      }
      if (patch.notificationPreferences.promotions !== undefined) {
        setFields['notificationPreferences.promotions'] = patch.notificationPreferences.promotions;
      }
    }

    const updated = await this.models.CustomerProfile.findOneAndUpdate(
      { userId },
      { $set: setFields },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new Error('Failed to update customer profile');
    }
    return toCustomerProfileRecord(updated);
  }

  async recordDeletionRequest(
    userId: string,
    input: {
      status: AccountDeletionStatus;
      requestedAt: Date;
      scheduledPurgeAt: Date;
      reason?: string | null;
      retentionDays: number;
    },
    now: Date,
  ): Promise<CustomerProfileRecord> {
    await this.getOrInitializeProfile(userId, now);
    const updated = await this.models.CustomerProfile.findOneAndUpdate(
      { userId },
      {
        $set: {
          deletionRequest: {
            status: input.status,
            requestedAt: input.requestedAt,
            scheduledPurgeAt: input.scheduledPurgeAt,
            reason: input.reason ?? null,
            retentionDays: input.retentionDays,
          },
        },
      },
      { new: true, runValidators: true },
    );
    if (!updated) {
      throw new Error('Failed to update deletion request state');
    }
    return toCustomerProfileRecord(updated);
  }

  async listAddressesForUser(userId: string): Promise<SavedAddressRecord[]> {
    const docs = await this.models.SavedAddress.find({ userId }).sort({
      isDefault: -1,
      updatedAt: -1,
    });
    return docs.map((doc) => toSavedAddressRecord(doc));
  }

  async findAddressById(addressId: string): Promise<SavedAddressRecord | null> {
    const doc = await this.models.SavedAddress.findOne({ addressId });
    return doc ? toSavedAddressRecord(doc) : null;
  }

  async countAddressesForUser(userId: string): Promise<number> {
    return this.models.SavedAddress.countDocuments({ userId });
  }

  async createAddress(input: CreateAddressInput, _now: Date): Promise<SavedAddressRecord> {
    const existingCount = await this.models.SavedAddress.countDocuments({ userId: input.userId });
    const shouldBeDefault = input.isDefault || existingCount === 0;
    if (shouldBeDefault && existingCount > 0) {
      await this.models.SavedAddress.updateMany(
        { userId: input.userId },
        { $set: { isDefault: false } },
      );
    }

    const [created] = await this.models.SavedAddress.create([
      {
        addressId: input.addressId,
        userId: input.userId,
        label: input.label,
        customLabel: input.customLabel ?? null,
        recipientName: input.recipientName,
        contactPhoneNormalized: input.contactPhoneNormalized ?? null,
        streetAddress: input.streetAddress,
        landmark: input.landmark,
        locality: input.locality,
        city: input.city,
        postalCode: input.postalCode,
        zoneId: input.zoneId ?? null,
        deliveryInstructions: input.deliveryInstructions ?? null,
        location: { type: 'Point', coordinates: input.coordinates },
        isDefault: shouldBeDefault,
      },
    ]);
    if (!created) {
      throw new Error('Failed to create saved address');
    }
    return toSavedAddressRecord(created);
  }

  async updateAddressForUser(
    addressId: string,
    userId: string,
    patch: UpdateAddressInput,
    _now: Date,
  ): Promise<SavedAddressRecord | null> {
    if (patch.isDefault === true) {
      await this.models.SavedAddress.updateMany({ userId }, { $set: { isDefault: false } });
    }

    const setFields: Record<string, unknown> = {};
    if (patch.label !== undefined) setFields['label'] = patch.label;
    if (patch.customLabel !== undefined) setFields['customLabel'] = patch.customLabel;
    if (patch.recipientName !== undefined) setFields['recipientName'] = patch.recipientName;
    if (patch.contactPhoneNormalized !== undefined)
      setFields['contactPhoneNormalized'] = patch.contactPhoneNormalized;
    if (patch.streetAddress !== undefined) setFields['streetAddress'] = patch.streetAddress;
    if (patch.landmark !== undefined) setFields['landmark'] = patch.landmark;
    if (patch.locality !== undefined) setFields['locality'] = patch.locality;
    if (patch.city !== undefined) setFields['city'] = patch.city;
    if (patch.postalCode !== undefined) setFields['postalCode'] = patch.postalCode;
    if (patch.zoneId !== undefined) setFields['zoneId'] = patch.zoneId;
    if (patch.deliveryInstructions !== undefined)
      setFields['deliveryInstructions'] = patch.deliveryInstructions;
    if (patch.coordinates !== undefined) {
      setFields['location'] = { type: 'Point', coordinates: patch.coordinates };
    }
    if (patch.isDefault !== undefined) setFields['isDefault'] = patch.isDefault;

    const updated = await this.models.SavedAddress.findOneAndUpdate(
      { addressId, userId },
      { $set: setFields },
      { new: true, runValidators: true },
    );
    return updated ? toSavedAddressRecord(updated) : null;
  }

  async deleteAddressForUser(
    addressId: string,
    userId: string,
    _now: Date,
  ): Promise<SavedAddressRecord | null> {
    const deleted = await this.models.SavedAddress.findOneAndDelete({ addressId, userId });
    if (!deleted) {
      return null;
    }
    const record = toSavedAddressRecord(deleted);
    if (record.isDefault) {
      const replacement = await this.models.SavedAddress.findOne({ userId }).sort({
        updatedAt: -1,
      });
      if (replacement) {
        replacement.set('isDefault', true);
        await replacement.save();
      }
    }
    return record;
  }

  async setDefaultAddressForUser(
    addressId: string,
    userId: string,
    now: Date,
  ): Promise<SavedAddressRecord | null> {
    return this.updateAddressForUser(addressId, userId, { isDefault: true }, now);
  }
}

export class InMemoryCustomerStore implements CustomerStore {
  private readonly profilesByUserId = new Map<string, CustomerProfileRecord>();
  private readonly addressesById = new Map<string, SavedAddressRecord>();

  async getOrInitializeProfile(userId: string, now: Date): Promise<CustomerProfileRecord> {
    const existing = this.profilesByUserId.get(userId);
    if (existing) {
      return existing;
    }
    const created: CustomerProfileRecord = {
      id: userId,
      userId,
      dietaryPreference: 'NONE',
      savedDeliveryZoneId: null,
      notificationPreferences: {
        orderUpdates: true,
        safetyAlerts: true,
        promotions: false,
      },
      locationPermissionState: 'prompt',
      lastKnownLocalityLabel: null,
      deletionRequest: {
        status: 'NONE',
        requestedAt: null,
        scheduledPurgeAt: null,
        reason: null,
        retentionDays: ACCOUNT_DELETION_RETENTION_DAYS,
      },
      createdAt: now,
      updatedAt: now,
    };
    this.profilesByUserId.set(userId, created);
    return created;
  }

  async updateCustomerProfile(
    userId: string,
    patch: {
      dietaryPreference?: CustomerDietaryPreference;
      savedDeliveryZoneId?: KolkataZoneId | null;
      notificationPreferences?: Partial<NotificationPreferencesRecord>;
      locationPermissionState?: LocationPermissionState;
      lastKnownLocalityLabel?: string | null;
    },
    now: Date,
  ): Promise<CustomerProfileRecord> {
    const current = await this.getOrInitializeProfile(userId, now);
    const updated: CustomerProfileRecord = {
      ...current,
      dietaryPreference: patch.dietaryPreference ?? current.dietaryPreference,
      savedDeliveryZoneId:
        patch.savedDeliveryZoneId !== undefined
          ? patch.savedDeliveryZoneId
          : current.savedDeliveryZoneId,
      locationPermissionState: patch.locationPermissionState ?? current.locationPermissionState,
      lastKnownLocalityLabel:
        patch.lastKnownLocalityLabel !== undefined
          ? patch.lastKnownLocalityLabel
          : current.lastKnownLocalityLabel,
      notificationPreferences: {
        orderUpdates:
          patch.notificationPreferences?.orderUpdates ??
          current.notificationPreferences.orderUpdates,
        safetyAlerts:
          patch.notificationPreferences?.safetyAlerts ??
          current.notificationPreferences.safetyAlerts,
        promotions:
          patch.notificationPreferences?.promotions ?? current.notificationPreferences.promotions,
      },
      updatedAt: now,
    };
    this.profilesByUserId.set(userId, updated);
    return updated;
  }

  async recordDeletionRequest(
    userId: string,
    input: {
      status: AccountDeletionStatus;
      requestedAt: Date;
      scheduledPurgeAt: Date;
      reason?: string | null;
      retentionDays: number;
    },
    now: Date,
  ): Promise<CustomerProfileRecord> {
    const current = await this.getOrInitializeProfile(userId, now);
    const updated: CustomerProfileRecord = {
      ...current,
      deletionRequest: { ...input },
      updatedAt: now,
    };
    this.profilesByUserId.set(userId, updated);
    return updated;
  }

  async listAddressesForUser(userId: string): Promise<SavedAddressRecord[]> {
    return Array.from(this.addressesById.values())
      .filter((item) => item.userId === userId)
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) {
          return a.isDefault ? -1 : 1;
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      });
  }

  async findAddressById(addressId: string): Promise<SavedAddressRecord | null> {
    return this.addressesById.get(addressId) ?? null;
  }

  async countAddressesForUser(userId: string): Promise<number> {
    let count = 0;
    for (const item of this.addressesById.values()) {
      if (item.userId === userId) {
        count += 1;
      }
    }
    return count;
  }

  async createAddress(input: CreateAddressInput, now: Date): Promise<SavedAddressRecord> {
    const existing = await this.listAddressesForUser(input.userId);
    const shouldBeDefault = input.isDefault || existing.length === 0;
    if (shouldBeDefault) {
      for (const item of existing) {
        if (item.isDefault) {
          this.addressesById.set(item.addressId, { ...item, isDefault: false, updatedAt: now });
        }
      }
    }

    const record: SavedAddressRecord = {
      id: input.addressId,
      addressId: input.addressId,
      userId: input.userId,
      label: input.label,
      customLabel: input.customLabel ?? null,
      recipientName: input.recipientName,
      contactPhoneNormalized: input.contactPhoneNormalized ?? null,
      streetAddress: input.streetAddress,
      landmark: input.landmark,
      locality: input.locality,
      city: input.city,
      postalCode: input.postalCode,
      zoneId: input.zoneId ?? null,
      deliveryInstructions: input.deliveryInstructions ?? null,
      location: { type: 'Point', coordinates: [...input.coordinates] as [number, number] },
      isDefault: shouldBeDefault,
      createdAt: now,
      updatedAt: now,
    };
    this.addressesById.set(record.addressId, record);
    return record;
  }

  async updateAddressForUser(
    addressId: string,
    userId: string,
    patch: UpdateAddressInput,
    now: Date,
  ): Promise<SavedAddressRecord | null> {
    const existing = this.addressesById.get(addressId);
    if (!existing || existing.userId !== userId) {
      return null;
    }

    if (patch.isDefault === true) {
      for (const item of this.addressesById.values()) {
        if (item.userId === userId && item.addressId !== addressId && item.isDefault) {
          this.addressesById.set(item.addressId, { ...item, isDefault: false, updatedAt: now });
        }
      }
    }

    const updated: SavedAddressRecord = {
      ...existing,
      label: patch.label ?? existing.label,
      customLabel: patch.customLabel !== undefined ? patch.customLabel : existing.customLabel,
      recipientName: patch.recipientName ?? existing.recipientName,
      contactPhoneNormalized:
        patch.contactPhoneNormalized !== undefined
          ? patch.contactPhoneNormalized
          : existing.contactPhoneNormalized,
      streetAddress: patch.streetAddress ?? existing.streetAddress,
      landmark: patch.landmark ?? existing.landmark,
      locality: patch.locality ?? existing.locality,
      city: patch.city ?? existing.city,
      postalCode: patch.postalCode ?? existing.postalCode,
      zoneId: patch.zoneId !== undefined ? patch.zoneId : existing.zoneId,
      deliveryInstructions:
        patch.deliveryInstructions !== undefined
          ? patch.deliveryInstructions
          : existing.deliveryInstructions,
      location: patch.coordinates
        ? { type: 'Point', coordinates: [...patch.coordinates] as [number, number] }
        : existing.location,
      isDefault: patch.isDefault !== undefined ? patch.isDefault : existing.isDefault,
      updatedAt: now,
    };
    this.addressesById.set(addressId, updated);
    return updated;
  }

  async deleteAddressForUser(
    addressId: string,
    userId: string,
    now: Date,
  ): Promise<SavedAddressRecord | null> {
    const existing = this.addressesById.get(addressId);
    if (!existing || existing.userId !== userId) {
      return null;
    }
    this.addressesById.delete(addressId);
    if (existing.isDefault) {
      const remaining = await this.listAddressesForUser(userId);
      const nextDefault = remaining[0];
      if (nextDefault) {
        this.addressesById.set(nextDefault.addressId, {
          ...nextDefault,
          isDefault: true,
          updatedAt: now,
        });
      }
    }
    return existing;
  }

  async setDefaultAddressForUser(
    addressId: string,
    userId: string,
    now: Date,
  ): Promise<SavedAddressRecord | null> {
    return this.updateAddressForUser(addressId, userId, { isDefault: true }, now);
  }
}
