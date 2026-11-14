import { z } from 'zod';
import type {
  BackupSnapshotDto,
  JourneyBenchmarkDto,
  LatencyPercentilesDto,
  LoadTestReportDto,
  PerformanceMetricsDto,
  RecoveryDrillReportDto,
} from '@bhojora/shared';

export const runLoadDrillSchema = z.object({
  concurrency: z.coerce.number().int().min(1).max(50).default(10),
  requestsPerJourney: z.coerce.number().int().min(5).max(100).default(20),
});

export type RunLoadDrillInput = z.infer<typeof runLoadDrillSchema>;

export const runRecoveryDrillSchema = z.object({
  drillType: z.enum(['DATABASE_POINT_IN_TIME_RESTORE', 'QUEUE_WORKER_CRASH_RECOVERY']),
});

export type RunRecoveryDrillInput = z.infer<typeof runRecoveryDrillSchema>;

export type {
  BackupSnapshotDto,
  JourneyBenchmarkDto,
  LatencyPercentilesDto,
  LoadTestReportDto,
  PerformanceMetricsDto,
  RecoveryDrillReportDto,
};
