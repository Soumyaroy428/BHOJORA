import type { MapsRouteResultDto } from '@bhojora/shared';
import { CircuitBreaker } from './circuit-breaker';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface MapsProviderAdapter {
  calculateRoute(pickup: Coordinates, dropoff: Coordinates): Promise<MapsRouteResultDto>;
}

export class MapsResilienceService implements MapsProviderAdapter {
  private quotaUsed = 0;
  private readonly quotaLimit: number;
  private readonly circuitBreaker: CircuitBreaker;
  private quotaResetTime: number;

  constructor(options: { quotaLimit?: number; circuitBreaker?: CircuitBreaker } = {}) {
    this.quotaLimit = options.quotaLimit ?? 1000;
    this.circuitBreaker =
      options.circuitBreaker ??
      new CircuitBreaker('google-maps-platform', {
        failureThreshold: 3,
        resetTimeoutMs: 15000,
        timeoutMs: 2500,
      });
    this.quotaResetTime = Date.now() + 60000;
  }

  public getCircuitBreaker(): CircuitBreaker {
    return this.circuitBreaker;
  }

  public getQuotaUsage() {
    this.checkQuotaReset();
    return {
      used: this.quotaUsed,
      limit: this.quotaLimit,
      percentage: Number(((this.quotaUsed / this.quotaLimit) * 100).toFixed(1)),
      resetsAt: new Date(this.quotaResetTime).toISOString(),
    };
  }

  public setSimulatedQuota(used: number): void {
    this.quotaUsed = used;
  }

  public async calculateRoute(
    pickup: Coordinates,
    dropoff: Coordinates,
  ): Promise<MapsRouteResultDto> {
    this.checkQuotaReset();

    // If quota exceeded, directly trigger fallback without calling external API
    if (this.quotaUsed >= this.quotaLimit) {
      return this.calculateOfflineFallback(pickup, dropoff, 'quota-exhausted');
    }

    return await this.circuitBreaker.execute(
      async () => {
        this.quotaUsed += 1;
        // Primary route calculation (Google Maps Platform)
        return this.simulateGoogleMapsRoute(pickup, dropoff);
      },
      async () => {
        // Safe offline mathematical fallback
        return this.calculateOfflineFallback(pickup, dropoff, 'circuit-breaker-fallback');
      },
    );
  }

  private checkQuotaReset(): void {
    if (Date.now() >= this.quotaResetTime) {
      this.quotaUsed = 0;
      this.quotaResetTime = Date.now() + 60000;
    }
  }

  private simulateGoogleMapsRoute(pickup: Coordinates, dropoff: Coordinates): MapsRouteResultDto {
    const straightLine = this.calculateHaversineMeters(pickup, dropoff);
    const roadDistanceMeters = Math.round(straightLine * 1.32); // Urban routing multiplier
    const avgSpeedMps = 5.5; // ~20 km/h Kolkata traffic density
    const durationSeconds = Math.round(roadDistanceMeters / avgSpeedMps) + 180; // +3 min buffer

    return {
      distanceMeters: roadDistanceMeters,
      durationSeconds,
      pickupCoordinates: pickup,
      dropoffCoordinates: dropoff,
      isFallback: false,
      provider: 'google-maps-platform',
      calculatedAt: new Date().toISOString(),
    };
  }

  public calculateOfflineFallback(
    pickup: Coordinates,
    dropoff: Coordinates,
    reason: string,
  ): MapsRouteResultDto {
    const straightLine = this.calculateHaversineMeters(pickup, dropoff);
    // Offline heuristic: 1.38x road curvature factor for Kolkata alleys and river crossings
    const roadDistanceMeters = Math.round(straightLine * 1.38);
    const avgSpeedMps = 4.8; // conservative 17 km/h fallback speed
    const durationSeconds = Math.round(roadDistanceMeters / avgSpeedMps) + 300; // +5 min buffer

    return {
      distanceMeters: roadDistanceMeters,
      durationSeconds,
      pickupCoordinates: pickup,
      dropoffCoordinates: dropoff,
      isFallback: true,
      provider: `offline-haversine-matrix (${reason})`,
      calculatedAt: new Date().toISOString(),
    };
  }

  private calculateHaversineMeters(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371e3; // Earth radius in meters
    const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const dLon = ((coord2.lng - coord1.lng) * Math.PI) / 180;
    const lat1 = (coord1.lat * Math.PI) / 180;
    const lat2 = (coord2.lat * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  }
}
