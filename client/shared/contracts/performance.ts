export interface LatencyPercentilesDto {
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  minMs: number;
  avgMs: number;
}

export interface JourneyBenchmarkDto {
  journeyName: 'SEARCH_DISCOVERY' | 'CHECKOUT_QUOTE' | 'ORDER_TRACKING';
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  requestsPerSecond: number;
  latencies: LatencyPercentilesDto;
  sloTargetP95Ms: number;
  sloTargetMet: boolean;
}

export interface LoadTestReportDto {
  id: string;
  concurrencyLevel: number;
  durationSeconds: number;
  timestamp: string;
  overallRequests: number;
  overallSuccessRatePercentage: number;
  journeys: Record<string, JourneyBenchmarkDto>;
}

export interface BackupSnapshotDto {
  snapshotId: string;
  createdAt: string;
  collectionsIncluded: string[];
  totalRecords: number;
  checksumSha256: string;
}

export interface RecoveryDrillReportDto {
  drillId: string;
  drillType: 'DATABASE_POINT_IN_TIME_RESTORE' | 'QUEUE_WORKER_CRASH_RECOVERY';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  rtoTargetSeconds: number;
  rtoAchievedSeconds: number;
  rpoDataLossCount: number;
  status: 'PASSED' | 'FAILED';
  verificationDetails: {
    snapshotChecksumVerified: boolean;
    recordsRestored: number;
    unacknowledgedJobsRecovered: number;
    duplicateExecutionsCount: number;
  };
}

export interface PerformanceMetricsDto {
  timestamp: string;
  processUptimeSeconds: number;
  memoryUsageMb: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  eventLoopLagMs: number;
  activeConnectionsCount: number;
}
