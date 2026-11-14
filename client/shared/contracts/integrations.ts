export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerMetricsDto {
  state: CircuitBreakerState;
  failureCount: number;
  successCount: number;
  consecutiveFailures: number;
  lastFailureTime: string | null;
  lastStateChange: string;
  totalRequests: number;
  fallbackCount: number;
}

export type IntegrationProvider =
  | 'GOOGLE_MAPS'
  | 'PAYMENT_GATEWAY'
  | 'SMS_NOTIFICATION'
  | 'PUSH_NOTIFICATION'
  | 'OBJECT_STORAGE'
  | 'AI_GATEWAY';

export interface ProviderHealthDto {
  provider: IntegrationProvider;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  circuitBreaker: CircuitBreakerMetricsDto;
  quotaUsage?: {
    used: number;
    limit: number;
    percentage: number;
    resetsAt: string;
  };
  activeFallback: boolean;
  fallbackProvider?: string;
  lastTestedAt: string;
}

export interface IntegrationsHealthDto {
  timestamp: string;
  overallStatus: 'OPERATIONAL' | 'DEGRADED' | 'OUTAGE';
  providers: Record<IntegrationProvider, ProviderHealthDto>;
  dlqSummary: {
    pendingCount: number;
    exhaustedCount: number;
    oldestItemTimestamp: string | null;
  };
}

export interface DlqJobDto {
  id: string;
  provider: IntegrationProvider;
  action: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  lastError: string;
  firstFailedAt: string;
  lastFailedAt: string;
  nextRetryAt: string | null;
  status: 'QUEUED' | 'RETRYING' | 'EXHAUSTED' | 'RESOLVED';
}

export interface StorageScanResultDto {
  fileName: string;
  fileSizeBytes: number;
  detectedMimeType: string;
  declaredMimeType: string;
  sha256Checksum: string;
  isSafe: boolean;
  rejectionReason?: string;
  scannedAt: string;
}

export interface MapsRouteResultDto {
  distanceMeters: number;
  durationSeconds: number;
  pickupCoordinates: { lat: number; lng: number };
  dropoffCoordinates: { lat: number; lng: number };
  isFallback: boolean;
  provider: string;
  calculatedAt: string;
}
