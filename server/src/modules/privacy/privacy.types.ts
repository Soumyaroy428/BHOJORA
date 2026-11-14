import { z } from 'zod';
import type {
  CreateDataSubjectRequestDto,
  DataSubjectRequestDto,
  DataSubjectRequestStatus,
  DataSubjectRequestType,
  RetentionPolicyDto,
  SecurityIncidentDto,
  UpdateConsentDto,
  UserConsentDto,
} from '@bhojora/shared';

export const DATA_SUBJECT_REQUEST_TYPES = [
  'ACCESS_EXPORT',
  'ERASURE_FORGET_ME',
  'CONSENT_REVOCATION',
] as const satisfies readonly DataSubjectRequestType[];

export const DATA_SUBJECT_REQUEST_STATUSES = [
  'SUBMITTED',
  'PROCESSING',
  'COMPLETED',
  'REJECTED',
] as const satisfies readonly DataSubjectRequestStatus[];

export const createDataSubjectRequestSchema = z.object({
  requestType: z.enum(DATA_SUBJECT_REQUEST_TYPES),
  reason: z.string().trim().max(500).optional(),
});

export type CreateDataSubjectRequestInput = z.infer<typeof createDataSubjectRequestSchema>;

export const updateConsentSchema = z.object({
  orderTrackingGps: z.boolean().optional(),
  marketingSmsEmail: z.boolean().optional(),
  analyticsCookies: z.boolean().optional(),
});

export type UpdateConsentInput = z.infer<typeof updateConsentSchema>;

export const securityIncidentSchema = z.object({
  severity: z.enum(['P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_LOW']),
  title: z.string().trim().min(3).max(100),
  summary: z.string().trim().min(10).max(1000),
  affectedScope: z.array(z.string().trim()),
  certInReportRequired: z.boolean().default(false),
});

export type SecurityIncidentInput = z.infer<typeof securityIncidentSchema>;

export type {
  CreateDataSubjectRequestDto,
  DataSubjectRequestDto,
  DataSubjectRequestStatus,
  DataSubjectRequestType,
  RetentionPolicyDto,
  SecurityIncidentDto,
  UpdateConsentDto,
  UserConsentDto,
};
