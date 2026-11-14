import { z } from 'zod';
import type { PilotCohortType, PilotOperationalStatus, PilotZoneCode } from '@bhojora/shared';

export const PILOT_ZONE_CODES = [
  'SALT_LAKE_SEC_V',
  'PARK_STREET_BHOWANIPORE',
] as const satisfies readonly PilotZoneCode[];

export const PILOT_OPERATIONAL_STATUSES = [
  'ACTIVE_PILOT',
  'PAUSED_MAINTENANCE',
  'EMERGENCY_KILL_SWITCH',
  'ROLLBACK_TRIGGERED',
] as const satisfies readonly PilotOperationalStatus[];

export const PILOT_COHORT_TYPES = [
  'CUSTOMER',
  'RESTAURANT',
  'DELIVERY_RIDER',
  'INSPECTOR',
] as const satisfies readonly PilotCohortType[];

export const joinPilotCohortSchema = z.object({
  inviteCode: z.string().trim().min(4).max(32),
  zoneCode: z.enum(PILOT_ZONE_CODES),
  cohortType: z.enum(PILOT_COHORT_TYPES),
});

export type JoinPilotCohortInput = z.infer<typeof joinPilotCohortSchema>;

export const emergencyRollbackSchema = z.object({
  reason: z.string().trim().min(5).max(500),
  zoneCode: z.enum(PILOT_ZONE_CODES).optional(),
});

export type EmergencyRollbackInput = z.infer<typeof emergencyRollbackSchema>;
