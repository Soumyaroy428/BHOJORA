import { z } from 'zod';
import type {
  CertificateType,
  ConflictType,
  InspectorProfile,
  InspectorStatus,
} from '@bhojora/shared';

export const INSPECTOR_STATUSES_RUNTIME = [
  'APPLIED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'SUSPENDED',
] as const satisfies readonly InspectorStatus[];

export const CONFLICT_TYPES_RUNTIME = [
  'FINANCIAL_INTEREST',
  'PREVIOUS_EMPLOYMENT',
  'FAMILY_RELATION',
  'OWNERSHIP',
  'OTHER',
] as const satisfies readonly ConflictType[];

export const CERTIFICATE_TYPES_RUNTIME = [
  'FSSAI_FOSTAC',
  'FOOD_SAFETY_AUDITOR',
  'HACCP_LEAD_AUDITOR',
  'ISO_22000',
  'OTHER',
] as const satisfies readonly CertificateType[];

export interface InspectorConflictRecord {
  restaurantId: string;
  outletId?: string;
  conflictType: ConflictType;
  description: string;
  declaredAt: Date;
}

export interface InspectorCertificationRecord {
  certificateType: CertificateType;
  certificateNumber: string;
  issuingAuthority: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface InspectorTrainingRecordInternal {
  moduleName: string;
  completedAt: Date;
  scorePercent: number;
  validUntil: Date;
}

export interface InspectorRecord {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  badgeNumber: string;
  status: InspectorStatus;
  cityCode: string;
  certifications: InspectorCertificationRecord[];
  trainings: InspectorTrainingRecordInternal[];
  conflicts: InspectorConflictRecord[];
  approvedByAdminId?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  suspendedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const conflictDeclarationSchema = z.object({
  restaurantId: z.string().trim().min(1, 'restaurantId is required'),
  outletId: z.string().trim().optional(),
  conflictType: z.enum(CONFLICT_TYPES_RUNTIME),
  description: z.string().trim().min(3, 'description is required (min 3 chars)'),
  declaredAt: z.string().datetime().optional(),
});

export const certificationSchema = z.object({
  certificateType: z.enum(CERTIFICATE_TYPES_RUNTIME),
  certificateNumber: z.string().trim().min(2, 'certificateNumber is required'),
  issuingAuthority: z.string().trim().min(2, 'issuingAuthority is required'),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
});

export const inspectorApplicationSchema = z.object({
  fullName: z.string().trim().min(2, 'fullName is required'),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Must be a valid international phone number'),
  cityCode: z.string().trim().default('KOLKATA'),
  certifications: z.array(certificationSchema).min(1, 'At least one certification is required'),
  conflicts: z.array(conflictDeclarationSchema).optional().default([]),
});

export const inspectorReviewDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'SUSPEND']),
  reason: z.string().trim().optional(),
});

export const inspectorConflictUpdateSchema = z.object({
  conflicts: z.array(conflictDeclarationSchema),
});

export const inspectorEligibilityCheckSchema = z.object({
  outletId: z.string().trim().min(1, 'outletId is required'),
  restaurantId: z.string().trim().optional(),
});

export function toInspectorProfile(record: InspectorRecord): InspectorProfile {
  return {
    id: record.id,
    userId: record.userId,
    fullName: record.fullName,
    email: record.email,
    phone: record.phone,
    badgeNumber: record.badgeNumber,
    status: record.status,
    cityCode: record.cityCode,
    certifications: record.certifications.map((c) => ({
      certificateType: c.certificateType,
      certificateNumber: c.certificateNumber,
      issuingAuthority: c.issuingAuthority,
      issuedAt: c.issuedAt.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
    })),
    trainings: record.trainings.map((t) => ({
      moduleName: t.moduleName,
      completedAt: t.completedAt.toISOString(),
      scorePercent: t.scorePercent,
      validUntil: t.validUntil.toISOString(),
    })),
    conflicts: record.conflicts.map((conf) => ({
      restaurantId: conf.restaurantId,
      outletId: conf.outletId,
      conflictType: conf.conflictType,
      description: conf.description,
      declaredAt: conf.declaredAt.toISOString(),
    })),
    approvedByAdminId: record.approvedByAdminId,
    approvedAt: record.approvedAt?.toISOString(),
    rejectionReason: record.rejectionReason,
    suspendedReason: record.suspendedReason,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
