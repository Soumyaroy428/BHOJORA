import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import {
  applyBaseSchemaConventions,
  COLLECTION_NAMES,
  createGeoPointSubSchema,
  createGeoPolygonSubSchema,
  paiseField,
} from '../../database/conventions';
import { KOLKATA_ZONE_IDS, type KolkataZoneId } from '../customer/customer.types';
import {
  OPERATING_DAY_CODES,
  type OperatingDayCode,
  type OperatingSlotRecord,
} from '../restaurant/restaurant.types';
import {
  getDefaultKolkataZonesSeed,
  KOLKATA_TIMEZONE,
  normalizeOperatingSlots,
} from './outlet.geo';
import type {
  DeliveryZoneRecord,
  OutletHoursRecord,
  OutletSpecialClosureRecord,
  OutletStore,
} from './outlet.types';

const deliveryZoneSchema = applyBaseSchemaConventions(
  new Schema({
    zoneCode: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 },
    zoneId: { type: String, enum: KOLKATA_ZONE_IDS, required: true },
    cityCode: { type: String, required: true, enum: ['KOLKATA'], default: 'KOLKATA' },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    boundary: { type: createGeoPolygonSubSchema(), required: true },
    centerPoint: { type: createGeoPointSubSchema(), required: true },
    deliveryFeePaise: paiseField({ default: 2500 }),
    minOrderPaise: paiseField({ default: 14900 }),
    estimatedMinutes: { type: Number, required: true, min: 10, max: 90, default: 28 },
    isActive: { type: Boolean, required: true, default: true },
  }),
);

const outletHoursSlotSubSchema = new Schema(
  {
    dayOfWeek: { type: String, enum: OPERATING_DAY_CODES, required: true },
    openTime: { type: String, required: true, maxlength: 5 },
    closeTime: { type: String, required: true, maxlength: 5 },
    isClosed: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const specialClosureSubSchema = new Schema(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    reason: { type: String, required: true, trim: true, maxlength: 160 },
    isClosed: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

const outletHoursSchema = applyBaseSchemaConventions(
  new Schema({
    outletId: { type: String, required: true, trim: true },
    restaurantId: { type: String, required: true, trim: true },
    timezone: { type: String, enum: [KOLKATA_TIMEZONE], required: true, default: KOLKATA_TIMEZONE },
    slots: { type: [outletHoursSlotSubSchema], required: true },
    specialClosures: { type: [specialClosureSubSchema], required: true, default: [] },
  }),
);

function toDate(value: unknown, fallback: Date): Date {
  return value instanceof Date ? value : new Date(fallback.getTime());
}

const SEED_ZONE_CODE_TO_ID: Readonly<Record<string, KolkataZoneId>> = {
  SALT_LAKE_SEC_V: 'salt-lake',
  PARK_STREET: 'central',
  BALLYGUNGE: 'south',
  NEW_TOWN_AA1: 'new-town',
  NORTH_KOLKATA: 'north',
};

function toDeliveryZoneRecord(doc: Record<string, unknown>): DeliveryZoneRecord {
  const now = new Date();
  const zoneCode = String(doc['zoneCode'] ?? '').toUpperCase();
  const rawBoundary = (doc['boundary'] as Record<string, unknown> | undefined) ?? {};
  const rawRings = Array.isArray(rawBoundary['coordinates'])
    ? (rawBoundary['coordinates'] as number[][][]).map((ring) =>
        ring.map((pt) => [Number(pt[0]), Number(pt[1])]),
      )
    : [];
  const rawCenter = (doc['centerPoint'] as Record<string, unknown> | undefined) ?? {};
  const rawCenterCoords = Array.isArray(rawCenter['coordinates'])
    ? rawCenter['coordinates']
    : [88.3639, 22.5726];
  const resolvedZoneId =
    typeof doc['zoneId'] === 'string' &&
    (KOLKATA_ZONE_IDS as readonly string[]).includes(doc['zoneId'])
      ? (doc['zoneId'] as KolkataZoneId)
      : (SEED_ZONE_CODE_TO_ID[zoneCode] ?? 'salt-lake');

  return {
    zoneCode,
    zoneId: resolvedZoneId,
    cityCode: 'KOLKATA',
    name: String(doc['name']),
    boundary: {
      type: 'Polygon',
      coordinates: rawRings,
    },
    centerPoint: {
      type: 'Point',
      coordinates: [Number(rawCenterCoords[0]), Number(rawCenterCoords[1])],
    },
    deliveryFeePaise: Number(doc['deliveryFeePaise'] ?? 2500),
    minOrderPaise: Number(doc['minOrderPaise'] ?? 14900),
    estimatedMinutes: Number(doc['estimatedMinutes'] ?? 28),
    isActive: doc['isActive'] !== false,
    createdAt: toDate(doc['createdAt'], now),
    updatedAt: toDate(doc['updatedAt'], now),
  };
}

function toOutletHoursRecord(doc: Record<string, unknown>): OutletHoursRecord {
  const now = new Date();
  const rawSlots = Array.isArray(doc['slots'])
    ? doc['slots'].map((entry) => {
        const s = entry as Record<string, unknown>;
        return {
          dayOfWeek: s['dayOfWeek'] as OperatingDayCode,
          openTime: String(s['openTime'] ?? '11:00'),
          closeTime: String(s['closeTime'] ?? '23:00'),
          isClosed: Boolean(s['isClosed']),
        } satisfies OperatingSlotRecord;
      })
    : [];

  const rawClosures = Array.isArray(doc['specialClosures'])
    ? doc['specialClosures'].map((entry) => {
        const c = entry as Record<string, unknown>;
        return {
          date: String(c['date']),
          reason: String(c['reason'] ?? 'Scheduled closure'),
          isClosed: c['isClosed'] !== false,
        } satisfies OutletSpecialClosureRecord;
      })
    : [];

  return {
    outletId: String(doc['outletId']),
    restaurantId: String(doc['restaurantId']),
    timezone: KOLKATA_TIMEZONE,
    slots: normalizeOperatingSlots(rawSlots),
    specialClosures: rawClosures,
    createdAt: toDate(doc['createdAt'], now),
    updatedAt: toDate(doc['updatedAt'], now),
  };
}

export interface MongooseOutletModels {
  DeliveryZone: Model<Record<string, unknown>>;
  OutletHours: Model<Record<string, unknown>>;
}

export function createMongooseOutletModels(connection: Connection): MongooseOutletModels {
  const resolveModel = (
    name: string,
    schema: Schema<Record<string, unknown>>,
    collectionName: string,
  ): Model<Record<string, unknown>> => {
    const existing = connection.models[name] as Model<Record<string, unknown>> | undefined;
    return existing ?? connection.model<Record<string, unknown>>(name, schema, collectionName);
  };

  return {
    DeliveryZone: resolveModel(
      'BhojoraDeliveryZone',
      deliveryZoneSchema,
      COLLECTION_NAMES.deliveryZones,
    ),
    OutletHours: resolveModel(
      'BhojoraOutletHours',
      outletHoursSchema,
      COLLECTION_NAMES.outletHours,
    ),
  };
}

export class MongooseOutletStore implements OutletStore {
  private readonly models: MongooseOutletModels;

  constructor(connection: Connection) {
    this.models = createMongooseOutletModels(connection);
  }

  getModels(): MongooseOutletModels {
    return this.models;
  }

  async listDeliveryZones(
    options: { includeInactive?: boolean } = {},
  ): Promise<DeliveryZoneRecord[]> {
    const filter = options.includeInactive ? {} : { isActive: true };
    const docs = await this.models.DeliveryZone.find(filter).sort({ zoneCode: 1 });
    return docs.map((doc) => toDeliveryZoneRecord(doc.toObject() as Record<string, unknown>));
  }

  async getDeliveryZoneByCode(zoneCode: string): Promise<DeliveryZoneRecord | null> {
    const doc = await this.models.DeliveryZone.findOne({ zoneCode: zoneCode.toUpperCase() });
    return doc ? toDeliveryZoneRecord(doc.toObject() as Record<string, unknown>) : null;
  }

  async upsertDeliveryZone(zone: DeliveryZoneRecord): Promise<DeliveryZoneRecord> {
    const doc = await this.models.DeliveryZone.findOneAndUpdate(
      { zoneCode: zone.zoneCode.toUpperCase() },
      { $set: { ...zone, zoneCode: zone.zoneCode.toUpperCase() } },
      { upsert: true, new: true, runValidators: true },
    );
    if (!doc) {
      throw new Error('Failed to upsert delivery zone');
    }
    return toDeliveryZoneRecord(doc.toObject() as Record<string, unknown>);
  }

  async getOutletHours(outletId: string): Promise<OutletHoursRecord | null> {
    const doc = await this.models.OutletHours.findOne({ outletId });
    return doc ? toOutletHoursRecord(doc.toObject() as Record<string, unknown>) : null;
  }

  async listOutletHoursByIds(outletIds: readonly string[]): Promise<OutletHoursRecord[]> {
    if (outletIds.length === 0) {
      return [];
    }
    const docs = await this.models.OutletHours.find({ outletId: { $in: [...outletIds] } });
    return docs.map((doc) => toOutletHoursRecord(doc.toObject() as Record<string, unknown>));
  }

  async upsertOutletHours(record: OutletHoursRecord): Promise<OutletHoursRecord> {
    const doc = await this.models.OutletHours.findOneAndUpdate(
      { outletId: record.outletId },
      { $set: record },
      { upsert: true, new: true, runValidators: true },
    );
    if (!doc) {
      throw new Error('Failed to upsert outlet hours');
    }
    return toOutletHoursRecord(doc.toObject() as Record<string, unknown>);
  }
}

export class InMemoryOutletStore implements OutletStore {
  private readonly zones = new Map<string, DeliveryZoneRecord>();
  private readonly hours = new Map<string, OutletHoursRecord>();

  constructor(initialZones: readonly DeliveryZoneRecord[] = getDefaultKolkataZonesSeed()) {
    for (const zone of initialZones) {
      this.zones.set(zone.zoneCode, structuredClone(zone));
    }
  }

  async listDeliveryZones(
    options: { includeInactive?: boolean } = {},
  ): Promise<DeliveryZoneRecord[]> {
    return Array.from(this.zones.values())
      .filter((zone) => options.includeInactive || zone.isActive)
      .sort((a, b) => a.zoneCode.localeCompare(b.zoneCode))
      .map((zone) => structuredClone(zone));
  }

  async getDeliveryZoneByCode(zoneCode: string): Promise<DeliveryZoneRecord | null> {
    const found = this.zones.get(zoneCode.toUpperCase());
    return found ? structuredClone(found) : null;
  }

  async upsertDeliveryZone(zone: DeliveryZoneRecord): Promise<DeliveryZoneRecord> {
    const copy = structuredClone({
      ...zone,
      zoneCode: zone.zoneCode.toUpperCase(),
    });
    this.zones.set(copy.zoneCode, copy);
    return structuredClone(copy);
  }

  async getOutletHours(outletId: string): Promise<OutletHoursRecord | null> {
    const found = this.hours.get(outletId);
    return found ? structuredClone(found) : null;
  }

  async listOutletHoursByIds(outletIds: readonly string[]): Promise<OutletHoursRecord[]> {
    const wanted = new Set(outletIds);
    return Array.from(this.hours.values())
      .filter((entry) => wanted.has(entry.outletId))
      .map((entry) => structuredClone(entry));
  }

  async upsertOutletHours(record: OutletHoursRecord): Promise<OutletHoursRecord> {
    const copy = structuredClone(record);
    this.hours.set(copy.outletId, copy);
    return structuredClone(copy);
  }
}
