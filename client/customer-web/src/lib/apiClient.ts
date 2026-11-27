import type { KolkataZoneId } from '../types/domain';
import {
  DEFAULT_DELIVERY_RADIUS_KM,
  evaluateDeliveryRouting,
  haversineDistanceKm,
  KOLKATA_CORRIDOR_METADATA,
  roundDistanceKm,
  type DeliveryRoutingResult,
} from '../utils/deliveryGraph';

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown>;
    token?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<T> {
  const viteBase = import.meta.env.VITE_API_BASE?.trim().replace(/\/+$/, '');
  const resolvedViteApi = viteBase
    ? viteBase.endsWith('/api/v1')
      ? viteBase
      : `${viteBase}/api/v1`
    : '/api/v1';
  const apiBase =
    typeof window.BHOJORA_API_BASE === 'string' ? window.BHOJORA_API_BASE : resolvedViteApi;
  const headers: Record<string, string> = {
    'X-Requested-With': 'fetch',
    ...(options.headers ?? {}),
  };
  if (options.body) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  const res = await fetch(`${apiBase}${path}`, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    throw new Error('PREVIEW_NO_API');
  }
  const json = (await res.json()) as {
    success?: boolean;
    data?: T;
    error?: { message?: string };
  };
  if (!res.ok || !json.success || json.data === undefined) {
    throw new Error(json.error?.message ?? 'Request failed');
  }
  return json.data;
}

export interface KolkataZoneDetail {
  id: Exclude<KolkataZoneId, 'all'>;
  label: string;
  bengaliName: string;
  coords: readonly [number, number]; // [lng, lat]
  centerLat: number;
  centerLng: number;
  googleMapQuery: string;
  keyAreas: string;
  avgEtaMinutes: string;
  verifiedKitchensCount: number;
  minOrderInr: number;
}

const STATIC_AVG_ETA_BY_ZONE: Readonly<Record<Exclude<KolkataZoneId, 'all'>, string>> = {
  'salt-lake': '20–30 mins',
  central: '22–32 mins',
  'new-town': '24–35 mins',
  south: '20–30 mins',
  north: '22–30 mins',
};

export const ZONE_CENTERS: readonly KolkataZoneDetail[] = KOLKATA_CORRIDOR_METADATA.map((item) => ({
  id: item.id,
  label: item.label,
  bengaliName: item.bengaliName,
  coords: [item.centerLng, item.centerLat] as const,
  centerLat: item.centerLat,
  centerLng: item.centerLng,
  googleMapQuery: item.googleMapQuery,
  keyAreas: item.keyAreas,
  avgEtaMinutes: STATIC_AVG_ETA_BY_ZONE[item.id],
  verifiedKitchensCount: item.verifiedKitchensCount,
  minOrderInr: item.minOrderInr,
}));

export const KOLKATA_DELIVERY_BOUNDS = {
  minLng: 88.1,
  maxLng: 88.7,
  minLat: 22.3,
  maxLat: 22.85,
  maxCorridorRadiusKm: DEFAULT_DELIVERY_RADIUS_KM,
} as const;

export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  return roundDistanceKm(haversineDistanceKm(lat1, lon1, lat2, lon2));
}

export interface KolkataDeliveryCoverageCheck {
  isCovered: boolean;
  latitude: number;
  longitude: number;
  nearestZoneId: Exclude<KolkataZoneId, 'all'>;
  nearestZoneLabel: string;
  distanceKm: number;
  estimatedEtaLabel: string;
  availableCorridorCount: number;
  totalCorridors: number;
  detectedLocality?: string;
  message: string;
  routing: DeliveryRoutingResult;
}

export function checkKolkataDeliveryCoverage(
  lat: number,
  lng: number,
  detectedLocality?: string,
): KolkataDeliveryCoverageCheck {
  const routing = evaluateDeliveryRouting(lat, lng, {
    maxRadiusKm: KOLKATA_DELIVERY_BOUNDS.maxCorridorRadiusKm,
    detectedLocality,
  });
  const closest = routing.nearestCorridor;

  const withinMetropolitanBounds =
    lng >= KOLKATA_DELIVERY_BOUNDS.minLng &&
    lng <= KOLKATA_DELIVERY_BOUNDS.maxLng &&
    lat >= KOLKATA_DELIVERY_BOUNDS.minLat &&
    lat <= KOLKATA_DELIVERY_BOUNDS.maxLat;

  const isCovered = withinMetropolitanBounds && routing.hasAnyCoverage;

  const message = isCovered
    ? `Delivery is available in your area! ${routing.availableCorridorCount} of ${routing.totalCorridors} corridors within 15 km — nearest: ${closest.label} (${closest.distanceKm} km, ETA ${closest.estimatedEtaLabel}).`
    : `Unfortunately, no Bhojora corridor is within 15 km optimal road distance right now (nearest: ${closest.label} at ${closest.distanceKm} km).`;

  return {
    isCovered,
    latitude: lat,
    longitude: lng,
    nearestZoneId: closest.zoneId,
    nearestZoneLabel: closest.label,
    distanceKm: closest.distanceKm,
    estimatedEtaLabel: closest.estimatedEtaLabel,
    availableCorridorCount: routing.availableCorridorCount,
    totalCorridors: routing.totalCorridors,
    detectedLocality,
    message,
    routing,
  };
}

export function buildGoogleMapEmbedUrl(options: {
  lat?: number;
  lng?: number;
  query?: string;
  zoom?: number;
}): string {
  const zoom = options.zoom ?? (options.lat !== undefined ? 15 : 13);
  const q =
    options.lat !== undefined && options.lng !== undefined
      ? `${options.lat},${options.lng}`
      : (options.query ?? 'Kolkata, West Bengal, India');

  const apiKey =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)
      : undefined;

  if (apiKey && apiKey.trim().length > 0) {
    return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
      apiKey.trim(),
    )}&q=${encodeURIComponent(q)}&zoom=${zoom}`;
  }

  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=m&z=${zoom}&output=embed`;
}

export function resolveNearestKolkataZone(
  lat: number,
  lng: number,
): {
  zoneId: Exclude<KolkataZoneId, 'all'>;
  label: string;
  distanceKm: number;
  isCovered: boolean;
} {
  const coverage = checkKolkataDeliveryCoverage(lat, lng);
  return {
    zoneId: coverage.nearestZoneId,
    label: coverage.nearestZoneLabel,
    distanceKm: coverage.distanceKm,
    isCovered: coverage.isCovered,
  };
}

export function getZoneCoordinates(zoneId: KolkataZoneId): [number, number] {
  const found = ZONE_CENTERS.find((item) => item.id === zoneId);
  return found ? [found.coords[0], found.coords[1]] : [88.4317, 22.5806];
}
