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

const ZONE_CENTERS: ReadonlyArray<{
  id: Exclude<KolkataZoneId, 'all'>;
  label: string;
  coords: readonly [number, number];
}> = [
  { id: 'salt-lake', label: 'Salt Lake (Sector V)', coords: [88.4317, 22.5806] },
  { id: 'central', label: 'Central (Park Street)', coords: [88.3526, 22.5535] },
  { id: 'new-town', label: 'New Town (Action Area)', coords: [88.4655, 22.5922] },
  { id: 'south', label: 'South (Ballygunge)', coords: [88.3665, 22.5262] },
  { id: 'north', label: 'North (Shyambazar)', coords: [88.3735, 22.6012] },
];

export function resolveNearestKolkataZone(
  lat: number,
  lng: number,
): {
  zoneId: Exclude<KolkataZoneId, 'all'>;
  label: string;
} {
  let closest = ZONE_CENTERS[0]!;
  let minDist = Number.POSITIVE_INFINITY;
  for (const zone of ZONE_CENTERS) {
    const dLng = lng - zone.coords[0];
    const dLat = lat - zone.coords[1];
    const dist = dLng * dLng + dLat * dLat;
    if (dist < minDist) {
      minDist = dist;
      closest = zone;
    }
  }
  return { zoneId: closest.id, label: closest.label };
}

export function getZoneCoordinates(zoneId: KolkataZoneId): [number, number] {
  const found = ZONE_CENTERS.find((item) => item.id === zoneId);
  return found ? [found.coords[0], found.coords[1]] : [88.4317, 22.5806];
}
