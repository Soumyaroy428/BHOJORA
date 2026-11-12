import type {
  DeliveryZoneDto,
  GeoJsonPolygonDto,
  OutletHoursDto,
  OutletSpecialClosureDto,
} from '@bhojora/shared';
import type { KolkataZoneId } from '../customer/customer.types';
import type { OperatingSlotRecord } from '../restaurant/restaurant.types';

export interface DeliveryZoneRecord {
  zoneCode: string;
  zoneId: KolkataZoneId;
  cityCode: 'KOLKATA';
  name: string;
  boundary: GeoJsonPolygonDto;
  centerPoint: {
    type: 'Point';
    coordinates: [number, number];
  };
  deliveryFeePaise: number;
  minOrderPaise: number;
  estimatedMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface OutletSpecialClosureRecord {
  date: string;
  reason: string;
  isClosed: boolean;
}

export interface OutletHoursRecord {
  outletId: string;
  restaurantId: string;
  timezone: 'Asia/Kolkata';
  slots: OperatingSlotRecord[];
  specialClosures: OutletSpecialClosureRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OutletStore {
  listDeliveryZones(options?: { includeInactive?: boolean }): Promise<DeliveryZoneRecord[]>;
  getDeliveryZoneByCode(zoneCode: string): Promise<DeliveryZoneRecord | null>;
  upsertDeliveryZone(zone: DeliveryZoneRecord): Promise<DeliveryZoneRecord>;

  getOutletHours(outletId: string): Promise<OutletHoursRecord | null>;
  listOutletHoursByIds(outletIds: readonly string[]): Promise<OutletHoursRecord[]>;
  upsertOutletHours(record: OutletHoursRecord): Promise<OutletHoursRecord>;
}

export function toDeliveryZoneDto(record: DeliveryZoneRecord): DeliveryZoneDto {
  return {
    zoneCode: record.zoneCode,
    zoneId: record.zoneId,
    cityCode: record.cityCode,
    name: record.name,
    boundary: {
      type: 'Polygon',
      coordinates: record.boundary.coordinates.map((ring) =>
        ring.map((pt) => [Number(pt[0]), Number(pt[1])]),
      ),
    },
    centerPoint: {
      type: 'Point',
      coordinates: [record.centerPoint.coordinates[0], record.centerPoint.coordinates[1]],
    },
    deliveryFeePaise: record.deliveryFeePaise,
    minOrderPaise: record.minOrderPaise,
    estimatedMinutes: record.estimatedMinutes,
    isActive: record.isActive,
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toOutletHoursDto(record: OutletHoursRecord): OutletHoursDto {
  const specialClosures: OutletSpecialClosureDto[] = record.specialClosures.map((entry) => ({
    date: entry.date,
    reason: entry.reason,
    isClosed: entry.isClosed,
  }));
  return {
    outletId: record.outletId,
    restaurantId: record.restaurantId,
    timezone: 'Asia/Kolkata',
    slots: record.slots.map((slot) => ({ ...slot })),
    specialClosures,
    updatedAt: record.updatedAt.toISOString(),
  };
}
