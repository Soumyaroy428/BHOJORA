import { z } from 'zod';
import type {
  AdviserSignOffStatus,
  ComplianceDomain,
  ComplianceItemStatus,
  LaunchReadinessStatus,
} from '@bhojora/shared';

export const COMPLIANCE_DOMAINS = [
  'FSSAI_FOOD_SAFETY',
  'E_COMMERCE_CONSUMER_PROTECTION',
  'DPDP_PRIVACY',
  'PAYMENT_ESCROW_RBI',
  'GST_TAXATION',
  'GIG_WORKFORCE_LABOR',
  'INSPECTOR_ACCREDITATION',
] as const satisfies readonly ComplianceDomain[];

export const ADVISER_SIGNOFF_STATUSES = [
  'CERTIFIED',
  'REJECTED',
  'CONDITIONAL_APPROVAL',
] as const satisfies readonly AdviserSignOffStatus[];

export const COMPLIANCE_ITEM_STATUSES = [
  'COMPLIANT',
  'NON_COMPLIANT',
  'UNDER_REVIEW',
] as const satisfies readonly ComplianceItemStatus[];

export const LAUNCH_READINESS_STATUSES = [
  'READY_FOR_PILOT',
  'BLOCKED_WITH_GAPS',
] as const satisfies readonly LaunchReadinessStatus[];

export const signOffSchema = z.object({
  domain: z.enum(COMPLIANCE_DOMAINS),
  adviserName: z.string().trim().min(3).max(120),
  professionalRegistrationNo: z.string().trim().min(3).max(80),
  firmOrAgency: z.string().trim().min(2).max(150),
  status: z.enum(ADVISER_SIGNOFF_STATUSES),
  remarks: z.string().trim().min(5).max(1000),
  validityDays: z.number().int().min(1).max(365).optional().default(180),
});

export type SignOffInput = z.infer<typeof signOffSchema>;

export const fssaiVerifySchema = z.object({
  fssaiNumber: z
    .string()
    .trim()
    .regex(/^\d{14}$/, 'FSSAI number must be exactly 14 numeric digits'),
});

export type FssaiVerifyInput = z.infer<typeof fssaiVerifySchema>;

export const gstinVerifySchema = z.object({
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      'GSTIN must follow standard 15-character Indian tax identification format',
    ),
});

export type GstinVerifyInput = z.infer<typeof gstinVerifySchema>;
