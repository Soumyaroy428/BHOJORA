import type {
  OutletLiveStatusDto,
  OutletLiveStatusReason,
  OutletOperationalStatus,
  OutletSpecialClosureDto,
} from '@bhojora/shared';
import {
  isValidGeoJsonPointCoordinates,
  isValidGeoJsonPolygonCoordinates,
} from '../../database/conventions';
import { AppError } from '../../middleware/error-handler';
import type { KolkataZoneId } from '../customer/customer.types';
import {
  OPERATING_DAY_CODES,
  type OperatingDayCode,
  type OperatingSlotRecord,
} from '../restaurant/restaurant.types';
import type { DeliveryZoneRecord } from './outlet.types';

export const KOLKATA_TIMEZONE = 'Asia/Kolkata' as const;

export const KOLKATA_SERVICE_BOUNDS = {
  minLng: 88.1,
  maxLng: 88.7,
  minLat: 22.3,
  maxLat: 22.85,
} as const;

export const DEFAULT_OUTLET_OPERATING_SLOTS: OperatingSlotRecord[] = OPERATING_DAY_CODES.map(
  (dayOfWeek) => ({
    dayOfWeek,
    openTime: '11:00',
    closeTime: '23:00',
    isClosed: false,
  }),
);

export function getDefaultKolkataZonesSeed(now = new Date()): DeliveryZoneRecord[] {
  const entries: Array<{
    zoneCode: string;
    zoneId: KolkataZoneId;
    name: string;
    center: [number, number];
    ring: Array<[number, number]>;
    deliveryFeePaise: number;
    minOrderPaise: number;
    estimatedMinutes: number;
  }> = [
    {
      zoneCode: 'SALT_LAKE_SEC_V',
      zoneId: 'salt-lake',
      name: 'Salt Lake Sector V & Bidhannagar',
      center: [88.4317, 22.5806],
      ring: [
        [88.425, 22.565],
        [88.45, 22.565],
        [88.45, 22.585],
        [88.425, 22.585],
        [88.425, 22.565],
      ],
      deliveryFeePaise: 2500,
      minOrderPaise: 14900,
      estimatedMinutes: 24,
    },
    {
      zoneCode: 'PARK_STREET',
      zoneId: 'central',
      name: 'Park Street, Park Circus & Esplanade',
      center: [88.3526, 22.5535],
      ring: [
        [88.345, 22.545],
        [88.365, 22.545],
        [88.365, 22.56],
        [88.345, 22.56],
        [88.345, 22.545],
      ],
      deliveryFeePaise: 2900,
      minOrderPaise: 17900,
      estimatedMinutes: 26,
    },
    {
      zoneCode: 'BALLYGUNGE',
      zoneId: 'south',
      name: 'Ballygunge, Jadavpur & Kasba',
      center: [88.3665, 22.5262],
      ring: [
        [88.355, 22.515],
        [88.378, 22.515],
        [88.378, 22.536],
        [88.355, 22.536],
        [88.355, 22.515],
      ],
      deliveryFeePaise: 2900,
      minOrderPaise: 14900,
      estimatedMinutes: 25,
    },
    {
      zoneCode: 'NEW_TOWN_AA1',
      zoneId: 'new-town',
      name: 'New Town Action Area I-III',
      center: [88.4655, 22.5922],
      ring: [
        [88.452, 22.575],
        [88.485, 22.575],
        [88.485, 22.61],
        [88.452, 22.61],
        [88.452, 22.575],
      ],
      deliveryFeePaise: 3200,
      minOrderPaise: 19900,
      estimatedMinutes: 30,
    },
    {
      zoneCode: 'NORTH_KOLKATA',
      zoneId: 'north',
      name: 'Shyambazar & Dum Dum',
      center: [88.3735, 22.6012],
      ring: [
        [88.355, 22.59],
        [88.395, 22.59],
        [88.395, 22.62],
        [88.355, 22.62],
        [88.355, 22.59],
      ],
      deliveryFeePaise: 3000,
      minOrderPaise: 14900,
      estimatedMinutes: 28,
    },
  ];

  return entries.map((entry) => ({
    zoneCode: entry.zoneCode,
    zoneId: entry.zoneId,
    cityCode: 'KOLKATA',
    name: entry.name,
    boundary: {
      type: 'Polygon',
      coordinates: [entry.ring],
    },
    centerPoint: {
      type: 'Point',
      coordinates: entry.center,
    },
    deliveryFeePaise: entry.deliveryFeePaise,
    minOrderPaise: entry.minOrderPaise,
    estimatedMinutes: entry.estimatedMinutes,
    isActive: true,
    createdAt: new Date(now.getTime()),
    updatedAt: new Date(now.getTime()),
  }));
}

export function isLikelySwappedKolkataPoint(coords: readonly [number, number]): boolean {
  const [first, second] = coords;
  return first >= 18 && first <= 27 && second >= 85 && second <= 91;
}

export function isWithinKolkataServiceBounds(coords: readonly [number, number]): boolean {
  const [lng, lat] = coords;
  return (
    lng >= KOLKATA_SERVICE_BOUNDS.minLng &&
    lng <= KOLKATA_SERVICE_BOUNDS.maxLng &&
    lat >= KOLKATA_SERVICE_BOUNDS.minLat &&
    lat <= KOLKATA_SERVICE_BOUNDS.maxLat
  );
}

export function assertValidGeoJsonPoint(
  coords: unknown,
  options: { requireKolkataBounds?: boolean; label?: string } = {},
): [number, number] {
  const fieldLabel = options.label ?? 'GeoJSON Point coordinates';
  if (!Array.isArray(coords) || coords.length !== 2) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldLabel} must be [longitude, latitude]`);
  }
  const [lng, lat] = coords;
  if (
    typeof lng !== 'number' ||
    typeof lat !== 'number' ||
    !Number.isFinite(lng) ||
    !Number.isFinite(lat)
  ) {
    throw new AppError(400, 'VALIDATION_ERROR', `${fieldLabel} must contain finite numbers`);
  }
  if (isLikelySwappedKolkataPoint([lng, lat])) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} appear swapped ([latitude, longitude]); GeoJSON requires [longitude, latitude]`,
    );
  }
  if (!isValidGeoJsonPointCoordinates([lng, lat])) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} out of valid WGS-84 [longitude, latitude] range`,
    );
  }
  if (options.requireKolkataBounds && !isWithinKolkataServiceBounds([lng, lat])) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `${fieldLabel} must lie within Kolkata service bounds ([${KOLKATA_SERVICE_BOUNDS.minLng}..${KOLKATA_SERVICE_BOUNDS.maxLng}, ${KOLKATA_SERVICE_BOUNDS.minLat}..${KOLKATA_SERVICE_BOUNDS.maxLat}])`,
    );
  }
  return [lng, lat];
}

export function computePolygonSignedArea(ring: readonly (readonly number[])[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]!;
    const b = ring[i + 1]!;
    sum += a[0]! * b[1]! - b[0]! * a[1]!;
  }
  return sum / 2;
}

export function assertValidGeoJsonPolygonForKolkata(coordinates: unknown): number[][][] {
  if (!isValidGeoJsonPolygonCoordinates(coordinates)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Invalid GeoJSON Polygon: rings must contain finite [longitude, latitude] pairs with >= 4 vertices and identical first/last closure coordinate',
    );
  }

  const rings = coordinates as number[][][];
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
    const ring = rings[ringIndex]!;
    const distinctVertices = new Set<string>();
    for (const point of ring) {
      const [lng, lat] = assertValidGeoJsonPoint(point, {
        requireKolkataBounds: true,
        label: `Polygon ring[${ringIndex}] vertex`,
      });
      distinctVertices.add(`${lng.toFixed(6)},${lat.toFixed(6)}`);
    }

    if (distinctVertices.size < 3) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Polygon ring[${ringIndex}] must contain at least 3 distinct coordinates`,
      );
    }

    const signedArea = computePolygonSignedArea(ring);
    if (Math.abs(signedArea) <= 1e-10) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Polygon ring[${ringIndex}] must have non-zero area`,
      );
    }

    // RFC 7946 winding rule: exterior ring (index 0) counter-clockwise (> 0), holes clockwise (< 0).
    if (ringIndex === 0 && signedArea < 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Polygon exterior ring must follow counter-clockwise [longitude, latitude] RFC 7946 winding order',
      );
    }
    if (ringIndex > 0 && signedArea > 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Polygon hole ring[${ringIndex}] must follow clockwise RFC 7946 winding order`,
      );
    }
  }

  return rings.map((ring) => ring.map(([lng, lat]) => [lng!, lat!]));
}

function isPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-18) {
    return (px - ax) ** 2 + (py - ay) ** 2 <= 1e-20;
  }
  const cross = (px - ax) * dy - (py - ay) * dx;
  if (Math.abs(cross) > 1e-10 * Math.sqrt(lenSq)) {
    return false;
  }
  const dot = (px - ax) * dx + (py - ay) * dy;
  return dot >= -1e-10 && dot <= lenSq + 1e-10;
}

function isPointInRing(
  point: readonly [number, number],
  ring: readonly (readonly number[])[],
): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i]![0]!;
    const yi = ring[i]![1]!;
    const xj = ring[j]![0]!;
    const yj = ring[j]![1]!;

    if (isPointOnSegment(px, py, xi, yi, xj, yj)) {
      return true;
    }

    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

export function isPointInPolygon(
  point: readonly [number, number],
  polygonRings: readonly (readonly (readonly number[])[])[],
): boolean {
  if (polygonRings.length === 0) {
    return false;
  }
  if (!isPointInRing(point, polygonRings[0]!)) {
    return false;
  }
  for (let i = 1; i < polygonRings.length; i++) {
    if (isPointInRing(point, polygonRings[i]!)) {
      return false;
    }
  }
  return true;
}

export function calculateHaversineDistanceMeters(
  from: readonly [number, number],
  to: readonly [number, number],
): number {
  const EARTH_RADIUS_M = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const [lng1, lat1] = from;
  const [lng2, lat2] = to;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_M * c);
}

export function parseTimeToMinutes(hhmm: string): number {
  const [hoursStr, minsStr] = hhmm.split(':');
  const hours = Number(hoursStr);
  const mins = Number(minsStr);
  return hours * 60 + mins;
}

export function normalizeOperatingSlots(
  inputSlots?: readonly OperatingSlotRecord[],
): OperatingSlotRecord[] {
  const byDay = new Map<OperatingDayCode, OperatingSlotRecord>();
  for (const fallback of DEFAULT_OUTLET_OPERATING_SLOTS) {
    byDay.set(fallback.dayOfWeek, { ...fallback });
  }
  if (inputSlots) {
    const seen = new Set<OperatingDayCode>();
    for (const slot of inputSlots) {
      if (seen.has(slot.dayOfWeek)) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Duplicate operating day slot: ${slot.dayOfWeek}`,
        );
      }
      seen.add(slot.dayOfWeek);
      if (
        !slot.isClosed &&
        parseTimeToMinutes(slot.openTime) >= parseTimeToMinutes(slot.closeTime)
      ) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `${slot.dayOfWeek} closeTime (${slot.closeTime}) must be after openTime (${slot.openTime})`,
        );
      }
      byDay.set(slot.dayOfWeek, {
        dayOfWeek: slot.dayOfWeek,
        openTime: slot.openTime,
        closeTime: slot.closeTime,
        isClosed: slot.isClosed,
      });
    }
  }
  return OPERATING_DAY_CODES.map((day) => ({ ...byDay.get(day)! }));
}

const WEEKDAY_MAP: Readonly<Record<string, OperatingDayCode>> = {
  Mon: 'MON',
  Tue: 'TUE',
  Wed: 'WED',
  Thu: 'THU',
  Fri: 'FRI',
  Sat: 'SAT',
  Sun: 'SUN',
};

function getIstClockParts(atDate: Date): {
  dateIso: string;
  dayOfWeek: OperatingDayCode;
  hhmm: string;
  minutesOfDay: number;
  displayIst: string;
} {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: KOLKATA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(atDate);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  const year = pick('year');
  const month = pick('month');
  const day = pick('day');
  const rawHour = pick('hour');
  const hour = rawHour === '24' ? '00' : rawHour;
  const minute = pick('minute');
  const weekdayShort = pick('weekday');
  const dayOfWeek = WEEKDAY_MAP[weekdayShort] ?? 'MON';
  const hhmm = `${hour}:${minute}`;
  const minutesOfDay = parseTimeToMinutes(hhmm);
  const dateIso = `${year}-${month}-${day}`;
  return {
    dateIso,
    dayOfWeek,
    hhmm,
    minutesOfDay,
    displayIst: `${dateIso} ${hhmm} IST (${dayOfWeek})`,
  };
}

function findNextOpenWindow(
  slots: readonly OperatingSlotRecord[],
  currentDayIndex: number,
  currentMinutes: number,
  skipToday: boolean,
): string | null {
  const ordered = OPERATING_DAY_CODES.map(
    (code) =>
      slots.find((s) => s.dayOfWeek === code) ?? {
        dayOfWeek: code,
        openTime: '11:00',
        closeTime: '23:00',
        isClosed: true,
      },
  );
  for (let offset = 0; offset < 7; offset++) {
    const idx = (currentDayIndex + offset) % 7;
    const candidate = ordered[idx]!;
    if (candidate.isClosed) {
      continue;
    }
    const openMins = parseTimeToMinutes(candidate.openTime);
    if (offset === 0) {
      if (!skipToday && currentMinutes < openMins) {
        return `Today ${candidate.openTime} IST`;
      }
      continue;
    }
    return `${candidate.dayOfWeek} ${candidate.openTime} IST`;
  }
  return null;
}

export function evaluateOutletOpenStatus(params: {
  status: OutletOperationalStatus;
  slots: readonly OperatingSlotRecord[];
  specialClosures?: readonly OutletSpecialClosureDto[];
  atDate?: Date;
}): OutletLiveStatusDto {
  const ist = getIstClockParts(params.atDate ?? new Date());
  const normalizedSlots = params.slots.length > 0 ? params.slots : DEFAULT_OUTLET_OPERATING_SLOTS;
  const currentSlot = normalizedSlots.find((slot) => slot.dayOfWeek === ist.dayOfWeek) ?? null;
  const currentDayIndex = OPERATING_DAY_CODES.indexOf(ist.dayOfWeek);

  const inactiveReasonMap: Partial<Record<OutletOperationalStatus, OutletLiveStatusReason>> = {
    PENDING_APPROVAL: 'PENDING_APPROVAL',
    TEMPORARILY_CLOSED: 'OUTLET_TEMPORARILY_CLOSED',
    SUSPENDED: 'OUTLET_SUSPENDED',
  };
  const inactiveReason = inactiveReasonMap[params.status];
  if (inactiveReason) {
    return {
      isOpenNow: false,
      reason: inactiveReason,
      timezone: KOLKATA_TIMEZONE,
      evaluatedAtIst: ist.displayIst,
      currentSlot: currentSlot ? { ...currentSlot } : null,
      nextOpenWindow: null,
    };
  }

  const closureToday = params.specialClosures?.find(
    (entry) => entry.date === ist.dateIso && entry.isClosed,
  );
  if (closureToday) {
    return {
      isOpenNow: false,
      reason: 'SPECIAL_CLOSURE',
      timezone: KOLKATA_TIMEZONE,
      evaluatedAtIst: ist.displayIst,
      currentSlot: currentSlot ? { ...currentSlot } : null,
      nextOpenWindow: findNextOpenWindow(normalizedSlots, currentDayIndex, ist.minutesOfDay, true),
    };
  }

  if (!currentSlot || currentSlot.isClosed) {
    return {
      isOpenNow: false,
      reason: 'DAY_CLOSED',
      timezone: KOLKATA_TIMEZONE,
      evaluatedAtIst: ist.displayIst,
      currentSlot: currentSlot ? { ...currentSlot } : null,
      nextOpenWindow: findNextOpenWindow(normalizedSlots, currentDayIndex, ist.minutesOfDay, true),
    };
  }

  const openMinutes = parseTimeToMinutes(currentSlot.openTime);
  const closeMinutes = parseTimeToMinutes(currentSlot.closeTime);
  if (openMinutes >= closeMinutes) {
    return {
      isOpenNow: false,
      reason: 'INVALID_HOURS',
      timezone: KOLKATA_TIMEZONE,
      evaluatedAtIst: ist.displayIst,
      currentSlot: { ...currentSlot },
      nextOpenWindow: null,
    };
  }

  const isOpenNow = ist.minutesOfDay >= openMinutes && ist.minutesOfDay < closeMinutes;
  return {
    isOpenNow,
    reason: isOpenNow ? 'OPEN' : 'OUTSIDE_HOURS',
    timezone: KOLKATA_TIMEZONE,
    evaluatedAtIst: ist.displayIst,
    currentSlot: { ...currentSlot },
    nextOpenWindow: isOpenNow
      ? null
      : findNextOpenWindow(normalizedSlots, currentDayIndex, ist.minutesOfDay, false),
  };
}
