import type { KolkataZoneId } from '../types/domain';

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

export const ZONE_CENTERS: readonly KolkataZoneDetail[] = [
  {
    id: 'salt-lake',
    label: 'Salt Lake (Sector V)',
    bengaliName: 'সল্টলেক ও সেক্টর ৫',
    coords: [88.4317, 22.5806],
    centerLat: 22.5806,
    centerLng: 88.4317,
    googleMapQuery: 'Sector V, Salt Lake, Kolkata, West Bengal 700091',
    keyAreas: 'Karunamoyee, Salt Lake Stadium, Nicco Park, City Centre 1',
    avgEtaMinutes: '20–30 mins',
    verifiedKitchensCount: 5,
    minOrderInr: 149,
  },
  {
    id: 'central',
    label: 'Central (Park Street)',
    bengaliName: 'পার্ক স্ট্রিট ও মধ্য কলকাতা',
    coords: [88.3526, 22.5535],
    centerLat: 22.5535,
    centerLng: 88.3526,
    googleMapQuery: 'Park Street, Kolkata, West Bengal 700016',
    keyAreas: 'Camac Street, Esplanade, Park Circus, Mullick Bazar',
    avgEtaMinutes: '22–32 mins',
    verifiedKitchensCount: 6,
    minOrderInr: 179,
  },
  {
    id: 'new-town',
    label: 'New Town (Action Area)',
    bengaliName: 'নিউ টাউন ও রাজারহাট',
    coords: [88.4655, 22.5922],
    centerLat: 22.5922,
    centerLng: 88.4655,
    googleMapQuery: 'Action Area I, New Town, Kolkata, West Bengal 700156',
    keyAreas: 'Action Area I, II, III, Eco Park, City Centre 2',
    avgEtaMinutes: '24–35 mins',
    verifiedKitchensCount: 4,
    minOrderInr: 149,
  },
  {
    id: 'south',
    label: 'South (Ballygunge)',
    bengaliName: 'বালিগঞ্জ ও দক্ষিণ কলকাতা',
    coords: [88.3665, 22.5262],
    centerLat: 22.5262,
    centerLng: 88.3665,
    googleMapQuery: 'Ballygunge, Kolkata, West Bengal 700019',
    keyAreas: 'Gariahat, Jadavpur, Kasba, Southern Avenue, Dhakuria',
    avgEtaMinutes: '20–30 mins',
    verifiedKitchensCount: 5,
    minOrderInr: 149,
  },
  {
    id: 'north',
    label: 'North (Shyambazar)',
    bengaliName: 'শ্যামবাজার ও উত্তর কলকাতা',
    coords: [88.3735, 22.6012],
    centerLat: 22.6012,
    centerLng: 88.3735,
    googleMapQuery: 'Shyambazar Five Point Crossing, Kolkata, West Bengal 700004',
    keyAreas: 'Hatibagan, Sovabazar, Bagbazar, Girish Park',
    avgEtaMinutes: '22–30 mins',
    verifiedKitchensCount: 4,
    minOrderInr: 149,
  },
];

export const KOLKATA_DELIVERY_BOUNDS = {
  minLng: 88.1,
  maxLng: 88.7,
  minLat: 22.3,
  maxLat: 22.85,
  maxCorridorRadiusKm: 15.0,
} as const;

export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number((R * c).toFixed(2));
}

export interface KolkataDeliveryCoverageCheck {
  isCovered: boolean;
  latitude: number;
  longitude: number;
  nearestZoneId: Exclude<KolkataZoneId, 'all'>;
  nearestZoneLabel: string;
  distanceKm: number;
  detectedLocality?: string;
  message: string;
}

export function checkKolkataDeliveryCoverage(
  lat: number,
  lng: number,
  detectedLocality?: string,
): KolkataDeliveryCoverageCheck {
  let closest = ZONE_CENTERS[0]!;
  let minDistanceKm = Number.POSITIVE_INFINITY;

  for (const zone of ZONE_CENTERS) {
    const dist = calculateHaversineDistanceKm(lat, lng, zone.centerLat, zone.centerLng);
    if (dist < minDistanceKm) {
      minDistanceKm = dist;
      closest = zone;
    }
  }

  const withinMetropolitanBounds =
    lng >= KOLKATA_DELIVERY_BOUNDS.minLng &&
    lng <= KOLKATA_DELIVERY_BOUNDS.maxLng &&
    lat >= KOLKATA_DELIVERY_BOUNDS.minLat &&
    lat <= KOLKATA_DELIVERY_BOUNDS.maxLat;

  const isCovered =
    withinMetropolitanBounds && minDistanceKm <= KOLKATA_DELIVERY_BOUNDS.maxCorridorRadiusKm;

  const message = isCovered
    ? `Delivery is available in your area! Matched to closest corridor: ${closest.label} (${minDistanceKm} km away).`
    : `Unfortunately, in this location there is no delivery available right now. We are working hard to make delivery available to your location soon!`;

  return {
    isCovered,
    latitude: lat,
    longitude: lng,
    nearestZoneId: closest.id,
    nearestZoneLabel: closest.label,
    distanceKm: minDistanceKm,
    detectedLocality,
    message,
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
