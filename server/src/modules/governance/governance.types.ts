import { z } from 'zod';
import type { UserRole } from '../identity/identity.types';
import type { PlatformConfigDto, ConfigChangeProposalDto, ProposalStatus } from '@bhojora/shared';

export interface PlatformConfigRecord {
  configId: string;
  maintenanceMode: boolean;
  emergencySurgeLock: boolean;
  monsoonWaterloggingMode: boolean;
  maxUnassignedOrderAgeMinutes: number;
  instantRefundCapPaise: number;
  platformFeePaise: number;
  activeZones: string[];
  updatedByUserId: string;
  updatedAt: Date;
  version: number;
}

export interface ConfigChangeProposalRecord {
  proposalId: string;
  proposerUserId: string;
  proposerRole: UserRole;
  proposedChanges: Partial<
    Omit<PlatformConfigRecord, 'configId' | 'updatedByUserId' | 'updatedAt' | 'version'>
  >;
  reason: string;
  status: ProposalStatus;
  reviewedByUserId: string | null;
  reviewedAt: Date | null;
  reviewReason: string | null;
  createdAt: Date;
}

export const updateEntityStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  reason: z
    .string()
    .trim()
    .min(8, 'Reason must be at least 8 characters')
    .max(300, 'Reason must not exceed 300 characters'),
});

export const proposeConfigChangeSchema = z.object({
  proposedChanges: z
    .object({
      maintenanceMode: z.boolean().optional(),
      emergencySurgeLock: z.boolean().optional(),
      monsoonWaterloggingMode: z.boolean().optional(),
      maxUnassignedOrderAgeMinutes: z.number().int().min(1).max(60).optional(),
      instantRefundCapPaise: z.number().int().min(0).max(1000000).optional(),
      platformFeePaise: z.number().int().min(0).max(5000).optional(),
      activeZones: z.array(z.string()).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one configuration field must be proposed',
    }),
  reason: z
    .string()
    .trim()
    .min(8, 'Configuration changes require an explicit justification (>= 8 chars)')
    .max(300),
});

export const reviewConfigProposalSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT']),
  reason: z
    .string()
    .trim()
    .min(8, 'Review decision requires an explicit justification (>= 8 chars)')
    .max(300),
});

export const auditSearchQuerySchema = z.object({
  actorId: z.string().optional(),
  actorRole: z.string().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  outcome: z.enum(['ALLOWED', 'DENIED']).optional(),
  search: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export function toPlatformConfigDto(record: PlatformConfigRecord): PlatformConfigDto {
  return {
    configId: record.configId,
    maintenanceMode: record.maintenanceMode,
    emergencySurgeLock: record.emergencySurgeLock,
    monsoonWaterloggingMode: record.monsoonWaterloggingMode,
    maxUnassignedOrderAgeMinutes: record.maxUnassignedOrderAgeMinutes,
    instantRefundCapPaise: record.instantRefundCapPaise,
    platformFeePaise: record.platformFeePaise,
    activeZones: record.activeZones,
    updatedByUserId: record.updatedByUserId,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  };
}

export function toConfigChangeProposalDto(
  record: ConfigChangeProposalRecord,
): ConfigChangeProposalDto {
  return {
    proposalId: record.proposalId,
    proposerUserId: record.proposerUserId,
    proposerRole: record.proposerRole,
    proposedChanges: record.proposedChanges,
    reason: record.reason,
    status: record.status,
    reviewedByUserId: record.reviewedByUserId,
    reviewedAt: record.reviewedAt ? record.reviewedAt.toISOString() : null,
    reviewReason: record.reviewReason,
    createdAt: record.createdAt.toISOString(),
  };
}
