import type {
  IntegrationProvider,
  IntegrationsHealthDto,
  ProviderHealthDto,
} from '@bhojora/shared';
import { CircuitBreaker } from './circuit-breaker';
import { MapsResilienceService } from './maps-resilience';
import { ResilientRetryQueue } from './retry-queue';
import { StorageScannerService } from './storage-scanner';
import { WebhookObservabilityService } from './webhook-observability';

export class IntegrationsService {
  private circuitBreakers: Map<IntegrationProvider, CircuitBreaker> = new Map();
  public readonly maps: MapsResilienceService;
  public readonly retryQueue: ResilientRetryQueue;
  public readonly storageScanner: StorageScannerService;
  public readonly webhooks: WebhookObservabilityService;

  constructor(options: { mapsQuotaLimit?: number } = {}) {
    this.maps = new MapsResilienceService({ quotaLimit: options.mapsQuotaLimit });
    this.retryQueue = new ResilientRetryQueue();
    this.storageScanner = new StorageScannerService();
    this.webhooks = new WebhookObservabilityService();

    // Initialize Circuit Breakers for all 6 external providers
    this.circuitBreakers.set('GOOGLE_MAPS', this.maps.getCircuitBreaker());
    this.circuitBreakers.set(
      'PAYMENT_GATEWAY',
      new CircuitBreaker('razorpay-payments', { failureThreshold: 3, resetTimeoutMs: 12000 }),
    );
    this.circuitBreakers.set(
      'SMS_NOTIFICATION',
      new CircuitBreaker('transactional-sms', { failureThreshold: 4, resetTimeoutMs: 15000 }),
    );
    this.circuitBreakers.set(
      'PUSH_NOTIFICATION',
      new CircuitBreaker('firebase-fcm', { failureThreshold: 4, resetTimeoutMs: 15000 }),
    );
    this.circuitBreakers.set(
      'OBJECT_STORAGE',
      new CircuitBreaker('gcs-vault', { failureThreshold: 3, resetTimeoutMs: 10000 }),
    );
    this.circuitBreakers.set(
      'AI_GATEWAY',
      new CircuitBreaker('gemini-api', { failureThreshold: 3, resetTimeoutMs: 10000 }),
    );
  }

  public getCircuitBreaker(provider: IntegrationProvider): CircuitBreaker {
    const cb = this.circuitBreakers.get(provider);
    if (!cb) {
      throw new Error(`Circuit breaker for provider '${provider}' does not exist`);
    }
    return cb;
  }

  public resetCircuitBreaker(provider: IntegrationProvider): void {
    const cb = this.getCircuitBreaker(provider);
    cb.reset();
  }

  public getHealth(): IntegrationsHealthDto {
    const now = new Date().toISOString();
    const providers = {} as Record<IntegrationProvider, ProviderHealthDto>;
    let openCount = 0;
    let halfOpenCount = 0;

    const providerList: IntegrationProvider[] = [
      'GOOGLE_MAPS',
      'PAYMENT_GATEWAY',
      'SMS_NOTIFICATION',
      'PUSH_NOTIFICATION',
      'OBJECT_STORAGE',
      'AI_GATEWAY',
    ];

    for (const p of providerList) {
      const cb = this.circuitBreakers.get(p)!;
      const metrics = cb.getMetrics();

      let status: ProviderHealthDto['status'] = 'HEALTHY';
      if (metrics.state === 'OPEN') {
        status = 'DOWN';
        openCount += 1;
      } else if (metrics.state === 'HALF_OPEN' || metrics.consecutiveFailures > 0) {
        status = 'DEGRADED';
        halfOpenCount += 1;
      }

      const activeFallback =
        metrics.state === 'OPEN' ||
        (p === 'GOOGLE_MAPS' && this.maps.getQuotaUsage().percentage >= 100);

      providers[p] = {
        provider: p,
        status,
        circuitBreaker: metrics,
        quotaUsage: p === 'GOOGLE_MAPS' ? this.maps.getQuotaUsage() : undefined,
        activeFallback,
        fallbackProvider:
          p === 'GOOGLE_MAPS'
            ? 'offline-haversine-matrix'
            : p === 'AI_GATEWAY'
              ? 'deterministic-heuristics'
              : undefined,
        lastTestedAt: now,
      };
    }

    let overallStatus: IntegrationsHealthDto['overallStatus'] = 'OPERATIONAL';
    if (openCount >= 2) {
      overallStatus = 'OUTAGE';
    } else if (openCount === 1 || halfOpenCount > 0) {
      overallStatus = 'DEGRADED';
    }

    return {
      timestamp: now,
      overallStatus,
      providers,
      dlqSummary: this.retryQueue.getSummary(),
    };
  }
}
