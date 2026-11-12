import type { GeoJsonPointDto, KolkataZoneId } from './customer';
import type {
  FssaiVerificationStatus,
  OperatingSlotDto,
  PlatformInspectionStatus,
} from './restaurant';

export const OUTLET_OPERATIONAL_STATUSES = [
  'PENDING_APPROVAL',
  'ACTIVE',
  'TEMPORARILY_CLOSED',
  'SUSPENDED',
] as const;

export type OutletOperationalStatus = (typeof OUTLET_OPERATIONAL_STATUSES)[number];

export const OUTLET_LIVE_STATUS_REASONS = [
  'OPEN',
  'OUTSIDE_HOURS',
  'DAY_CLOSED',
  'SPECIAL_CLOSURE',
  'OUTLET_TEMPORARILY_CLOSED',
  'OUTLET_SUSPENDED',
  'PENDING_APPROVAL',
  'INVALID_HOURS',
] as const;

export type OutletLiveStatusReason = (typeof OUTLET_LIVE_STATUS_REASONS)[number];

export const DEFAULT_OUTLET_DELIVERY_RADIUS_METERS = 5000;
export const MIN_OUTLET_DELIVERY_RADIUS_METERS = 500;
export const MAX_OUTLET_DELIVERY_RADIUS_METERS = 15000;

export interface GeoJsonPolygonDto {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface DeliveryZoneDto {
  zoneCode: string;
  zoneId: KolkataZoneId;
  cityCode: 'KOLKATA';
  name: string;
  boundary: GeoJsonPolygonDto;
  centerPoint: GeoJsonPointDto;
  deliveryFeePaise: number;
  minOrderPaise: number;
  estimatedMinutes: number;
  isActive: boolean;
  updatedAt: string;
}

export interface OutletSpecialClosureDto {
  date: string;
  reason: string;
  isClosed: boolean;
}

export interface OutletHoursDto {
  outletId: string;
  restaurantId: string;
  timezone: 'Asia/Kolkata';
  slots: OperatingSlotDto[];
  specialClosures: OutletSpecialClosureDto[];
  updatedAt: string;
}

export interface OutletLiveStatusDto {
  isOpenNow: boolean;
  reason: OutletLiveStatusReason;
  timezone: 'Asia/Kolkata';
  evaluatedAtIst: string;
  currentSlot: OperatingSlotDto | null;
  nextOpenWindow: string | null;
}

export interface OutletDetailDto {
  outletId: string;
  restaurantId: string;
  brandName: string;
  outletName: string;
  slug: string;
  zoneId: KolkataZoneId;
  wardOrBorough: string;
  streetAddress: string;
  landmark: string;
  locality: string;
  city: string;
  postalCode: string;
  location: GeoJsonPointDto;
  deliveryRadiusMeters: number;
  cuisines: string[];
  prepTimeMinutes: number;
  status: OutletOperationalStatus;
  operatingSlots: OperatingSlotDto[];
  liveStatus: OutletLiveStatusDto;
  distanceMeters?: number;
  serviceable?: boolean;
  fssaiLicenseNumber: string;
  fssaiExpiresOn: string;
  fssaiVerificationStatus: FssaiVerificationStatus;
  platformInspectionStatus: PlatformInspectionStatus;
  publishedSafetyScore: number | null;
  fssaiSeparationNotice: string;
  updatedAt: string;
}

export interface CreateBranchOutletInputDto {
  restaurantId: string;
  outletName: string;
  streetAddress: string;
  landmark: string;
  locality: string;
  wardOrBorough: string;
  city?: string;
  postalCode: string;
  zoneId: KolkataZoneId;
  coordinates: [number, number];
  deliveryRadiusMeters?: number;
  cuisines: string[];
  prepTimeMinutes?: number;
  operatingSlots?: OperatingSlotDto[];
}

export interface UpdateOutletOperationsInputDto {
  zoneId?: KolkataZoneId;
  streetAddress?: string;
  landmark?: string;
  locality?: string;
  wardOrBorough?: string;
  postalCode?: string;
  coordinates?: [number, number];
  deliveryRadiusMeters?: number;
  prepTimeMinutes?: number;
  status?: 'ACTIVE' | 'TEMPORARILY_CLOSED';
}

export interface UpdateOutletHoursInputDto {
  slots: OperatingSlotDto[];
  specialClosures?: OutletSpecialClosureDto[];
}

export interface UpsertDeliveryZoneInputDto {
  zoneCode: string;
  zoneId: KolkataZoneId;
  name: string;
  boundary: GeoJsonPolygonDto;
  centerPoint: GeoJsonPointDto;
  deliveryFeePaise: number;
  minOrderPaise: number;
  estimatedMinutes: number;
  isActive?: boolean;
}

export interface ServiceabilityOutletMatchDto {
  outletId: string;
  restaurantId: string;
  brandName: string;
  outletName: string;
  slug: string;
  zoneId: KolkataZoneId;
  wardOrBorough: string;
  locality: string;
  distanceMeters: number;
  deliveryRadiusMeters: number;
  withinRadius: boolean;
  inZoneBoundary: boolean;
  serviceable: boolean;
  isOpenNow: boolean;
  liveStatusReason: OutletLiveStatusReason;
  estimatedDeliveryMinutes: number;
  deliveryFeePaise: number;
  platformInspectionStatus: PlatformInspectionStatus;
  publishedSafetyScore: number | null;
}

export interface ServiceabilityCheckResultDto {
  serviceable: boolean;
  evaluatedCoordinates: [number, number];
  timezone: 'Asia/Kolkata';
  evaluatedAtIst: string;
  matchedZone: DeliveryZoneDto | null;
  outlets: ServiceabilityOutletMatchDto[];
  reason: string;
}
