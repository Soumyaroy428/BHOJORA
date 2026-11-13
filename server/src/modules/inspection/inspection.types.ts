import { z } from 'zod';
import type {
  AppealStatus,
  AuditGrade,
  AuditOutcome,
  ChecklistCategory,
  EvidenceType,
  FindingSeverity,
  InspectionAssessmentType,
  InspectionEvidenceDto,
  InspectionRecordDto,
  InspectionStatus,
  ReviewDecision,
} from '@bhojora/shared';

export type { InspectionStatus };

export const INSPECTION_STATUSES_RUNTIME = [
  'SCHEDULED',
  'DRAFT',
  'SUBMITTED',
  'IN_REVIEW',
  'APPROVED',
  'REJECTED',
  'RETURNED',
  'APPEALED',
] as const satisfies readonly InspectionStatus[];

export const REVIEW_DECISIONS_RUNTIME = [
  'APPROVE',
  'REJECT',
  'RETURN_FOR_CLARIFICATION',
] as const satisfies readonly ReviewDecision[];

export const APPEAL_STATUSES_RUNTIME = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'UPHELD',
  'OVERTURNED',
  'RE_INSPECTION_ORDERED',
] as const satisfies readonly AppealStatus[];

export const AUDIT_OUTCOMES_RUNTIME = [
  'PASS',
  'FAIL',
  'NEEDS_IMPROVEMENT',
] as const satisfies readonly AuditOutcome[];

export const AUDIT_GRADES_RUNTIME = [
  'A_PLUS',
  'A',
  'B',
  'SUSPENDED',
] as const satisfies readonly AuditGrade[];

export const CHECKLIST_CATEGORIES_RUNTIME = [
  'PERSONAL_HYGIENE',
  'FOOD_STORAGE_TEMPERATURE',
  'CROSS_CONTAMINATION_PREVENTION',
  'CLEANING_SANITATION',
  'PEST_CONTROL',
  'WASTE_MANAGEMENT_DRAINAGE',
] as const satisfies readonly ChecklistCategory[];

export const FINDING_SEVERITIES_RUNTIME = [
  'PASS',
  'MINOR',
  'MAJOR',
  'CRITICAL',
] as const satisfies readonly FindingSeverity[];

export const EVIDENCE_TYPES_RUNTIME = [
  'PHOTO',
  'TEMPERATURE_LOG',
  'CERTIFICATE_DOCUMENT',
  'MANAGER_SIGNATURE',
] as const satisfies readonly EvidenceType[];

export const ASSESSMENT_TYPES_RUNTIME = [
  'INITIAL',
  'ROUTINE',
  'COMPLAINT_TRIGGERED',
  'RE_INSPECTION',
] as const satisfies readonly InspectionAssessmentType[];

export interface ChecklistItemDefinition {
  itemId: string;
  category: ChecklistCategory;
  title: string;
  description: string;
  maxScore: number;
  evidenceRequired: boolean;
  criticalViolationTrigger?: boolean;
}

export interface ChecklistTemplate {
  version: string;
  name: string;
  items: ChecklistItemDefinition[];
}

export const STANDARD_CHECKLIST_TEMPLATE_V1: ChecklistTemplate = {
  version: 'v1.0',
  name: 'BHOJORA Standard Commercial Kitchen Hygiene Checklist (Kolkata)',
  items: [
    {
      itemId: 'HYG_01',
      category: 'PERSONAL_HYGIENE',
      title: 'Protective Apparel & Grooming',
      description:
        'Clean uniforms, hair restraints/nets, and clean aprons worn by all food handlers.',
      maxScore: 10,
      evidenceRequired: false,
    },
    {
      itemId: 'HYG_02',
      category: 'PERSONAL_HYGIENE',
      title: 'Handwash Station Compliance',
      description:
        'Dedicated handwashing sink with potable running water, antibacterial soap, and single-use towels.',
      maxScore: 10,
      evidenceRequired: true,
    },
    {
      itemId: 'TEMP_01',
      category: 'FOOD_STORAGE_TEMPERATURE',
      title: 'Cold Storage / Chiller Temperatures (<= 4°C)',
      description:
        'Chilled items and dairy stored at or below 4°C with verified thermometer readout.',
      maxScore: 15,
      evidenceRequired: true,
    },
    {
      itemId: 'TEMP_02',
      category: 'FOOD_STORAGE_TEMPERATURE',
      title: 'Raw vs Ready-to-Eat Separation',
      description:
        'Raw meats and seafood stored physically below and separate from prepared or cooked foods.',
      maxScore: 15,
      evidenceRequired: false,
      criticalViolationTrigger: true,
    },
    {
      itemId: 'CONTAM_01',
      category: 'CROSS_CONTAMINATION_PREVENTION',
      title: 'Color-Coded Chopping Boards & Knives',
      description:
        'Distinct red/green/yellow boards and knives segregated for raw meat, veg, and dairy.',
      maxScore: 10,
      evidenceRequired: false,
    },
    {
      itemId: 'SAN_01',
      category: 'CLEANING_SANITATION',
      title: 'Food-Grade Sanitizers & Contact Surface Sanitation',
      description: 'Prep tables and equipment sanitized with approved food-contact sanitizers.',
      maxScore: 15,
      evidenceRequired: false,
    },
    {
      itemId: 'PEST_01',
      category: 'PEST_CONTROL',
      title: 'Pest Intrusion & Active Infestation Guard',
      description:
        'Zero evidence of rodents, roaches, or flies; screens, air curtains, and pest traps operational.',
      maxScore: 15,
      evidenceRequired: true,
      criticalViolationTrigger: true,
    },
    {
      itemId: 'WASTE_01',
      category: 'WASTE_MANAGEMENT_DRAINAGE',
      title: 'Grease Trap & Refuse Disposal',
      description:
        'Foot-operated covered waste bins, clean floor drains, and operational grease traps.',
      maxScore: 10,
      evidenceRequired: false,
    },
  ],
};

export interface InspectionEvidenceRecord {
  id: string;
  inspectionId: string;
  itemId?: string;
  evidenceType: EvidenceType;
  sha256Hash: string;
  mimeType: string;
  sizeBytes: number;
  capturedAt: Date;
  capturedCoordinates: [number, number]; // [lng, lat]
  storageKey: string;
  caption?: string;
  createdAt: Date;
}

export interface InspectionFindingRecord {
  itemId: string;
  category: ChecklistCategory;
  score: number;
  maxScore: number;
  severity: FindingSeverity;
  comments?: string;
  evidenceIds: string[];
}

export interface InspectionScoreSummaryRecord {
  rawScore: number;
  maxScore: number;
  scorePercent: number;
  scorePolicyVersion: string;
  hasCriticalViolation: boolean;
  criticalOverrideApplied: boolean;
  overrideReason?: string;
  finalScorePercent: number;
  outcome: AuditOutcome;
  grade: AuditGrade;
}

export interface InspectionAppealRecord {
  id: string;
  inspectionId: string;
  restaurantId: string;
  appellantUserId: string;
  contestedItemIds: string[];
  reason: string;
  evidenceUrls?: string[];
  status: AppealStatus;
  submittedAt: Date;
  resolvedAt?: Date;
  resolvedByUserId?: string;
  resolutionNotes?: string;
}

export interface InspectionRecord {
  id: string;
  outletId: string;
  restaurantId: string;
  inspectorId: string;
  assessmentType: InspectionAssessmentType;
  checklistVersion: string;
  status: InspectionStatus;
  startedAt: Date;
  submittedAt?: Date;
  clientDraftSavedAt?: Date;
  findings: InspectionFindingRecord[];
  evidence: InspectionEvidenceRecord[];
  hasCriticalViolation: boolean;
  scoreSummary?: InspectionScoreSummaryRecord;
  reviewDecision?: ReviewDecision;
  reviewedByUserId?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  appeal?: InspectionAppealRecord;
  managerSignedAt?: Date;
  managerName?: string;
  managerDesignation?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const findingSchema = z.object({
  itemId: z.string().trim().min(1, 'itemId is required'),
  category: z.enum(CHECKLIST_CATEGORIES_RUNTIME),
  score: z.number().min(0).max(100),
  maxScore: z.number().min(1).max(100),
  severity: z.enum(FINDING_SEVERITIES_RUNTIME),
  comments: z.string().trim().optional(),
  evidenceIds: z.array(z.string().trim()).default([]),
});

export const draftInspectionSchema = z.object({
  findings: z.array(findingSchema),
  notes: z.string().trim().optional(),
  clientDraftSavedAt: z.string().datetime().optional(),
});

export const evidenceUploadSchema = z.object({
  itemId: z.string().trim().optional(),
  evidenceType: z.enum(EVIDENCE_TYPES_RUNTIME),
  sha256Hash: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{64}$/i, 'Must be a 64-character SHA-256 hex string'),
  mimeType: z.string().trim().min(3, 'mimeType is required'),
  sizeBytes: z.number().int().positive('sizeBytes must be positive'),
  capturedAt: z.string().datetime('capturedAt must be a valid ISO datetime'),
  capturedCoordinates: z.tuple([
    z.number().min(88.0).max(88.6), // Kolkata longitude bounds
    z.number().min(22.3).max(22.8), // Kolkata latitude bounds
  ]),
  base64Data: z.string().optional(),
  caption: z.string().trim().optional(),
});

export const submitInspectionSchema = z.object({
  managerSignatureDataUrl: z.string().optional(),
  managerName: z.string().trim().optional(),
  managerDesignation: z.string().trim().optional(),
  signedAt: z.string().datetime().optional(),
});

export const reviewInspectionSchema = z.object({
  decision: z.enum(REVIEW_DECISIONS_RUNTIME),
  notes: z.string().trim().min(5, 'Review notes must be at least 5 characters'),
  scorePolicyVersion: z.string().trim().default('SCORE_POLICY_V1'),
});

export const submitAppealSchema = z.object({
  contestedItemIds: z.array(z.string().trim()).min(1, 'At least one contested item ID required'),
  reason: z.string().trim().min(10, 'Grounds for appeal must be at least 10 characters'),
  evidenceUrls: z.array(z.string().trim()).default([]),
});

export const resolveAppealSchema = z.object({
  resolution: z.enum(['UPHELD', 'OVERTURNED', 'RE_INSPECTION_ORDERED']),
  notes: z.string().trim().min(5, 'Resolution notes are required'),
});

export const createInspectionSchema = z.object({
  outletId: z.string().trim().min(1, 'outletId is required'),
  restaurantId: z.string().trim().min(1, 'restaurantId is required'),
  assessmentType: z.enum(ASSESSMENT_TYPES_RUNTIME).default('ROUTINE'),
  checklistVersion: z.string().trim().default('v1.0'),
});

export function toInspectionRecordDto(record: InspectionRecord): InspectionRecordDto {
  return {
    id: record.id,
    outletId: record.outletId,
    restaurantId: record.restaurantId,
    inspectorId: record.inspectorId,
    assessmentType: record.assessmentType,
    checklistVersion: record.checklistVersion,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    submittedAt: record.submittedAt?.toISOString(),
    clientDraftSavedAt: record.clientDraftSavedAt?.toISOString(),
    findings: record.findings.map((f) => ({
      itemId: f.itemId,
      category: f.category,
      score: f.score,
      maxScore: f.maxScore,
      severity: f.severity,
      comments: f.comments,
      evidenceIds: [...f.evidenceIds],
    })),
    evidence: record.evidence.map((e) => ({
      id: e.id,
      inspectionId: e.inspectionId,
      itemId: e.itemId,
      evidenceType: e.evidenceType,
      sha256Hash: e.sha256Hash,
      mimeType: e.mimeType,
      sizeBytes: e.sizeBytes,
      capturedAt: e.capturedAt.toISOString(),
      capturedCoordinates: [e.capturedCoordinates[0], e.capturedCoordinates[1]],
      storageKey: e.storageKey,
      caption: e.caption,
    })),
    hasCriticalViolation: record.hasCriticalViolation,
    scoreSummary: record.scoreSummary
      ? {
          rawScore: record.scoreSummary.rawScore,
          maxScore: record.scoreSummary.maxScore,
          scorePercent: record.scoreSummary.scorePercent,
          scorePolicyVersion: record.scoreSummary.scorePolicyVersion,
          hasCriticalViolation: record.scoreSummary.hasCriticalViolation,
          criticalOverrideApplied: record.scoreSummary.criticalOverrideApplied,
          overrideReason: record.scoreSummary.overrideReason,
          finalScorePercent: record.scoreSummary.finalScorePercent,
          outcome: record.scoreSummary.outcome,
          grade: record.scoreSummary.grade,
        }
      : undefined,
    reviewDecision: record.reviewDecision,
    reviewedByUserId: record.reviewedByUserId,
    reviewedAt: record.reviewedAt?.toISOString(),
    reviewNotes: record.reviewNotes,
    appeal: record.appeal
      ? {
          id: record.appeal.id,
          inspectionId: record.appeal.inspectionId,
          restaurantId: record.appeal.restaurantId,
          appellantUserId: record.appeal.appellantUserId,
          contestedItemIds: [...record.appeal.contestedItemIds],
          reason: record.appeal.reason,
          evidenceUrls: record.appeal.evidenceUrls ? [...record.appeal.evidenceUrls] : undefined,
          status: record.appeal.status,
          submittedAt: record.appeal.submittedAt.toISOString(),
          resolvedAt: record.appeal.resolvedAt?.toISOString(),
          resolvedByUserId: record.appeal.resolvedByUserId,
          resolutionNotes: record.appeal.resolutionNotes,
        }
      : undefined,
    managerSignedAt: record.managerSignedAt?.toISOString(),
    managerName: record.managerName,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toInspectionEvidenceDto(record: InspectionEvidenceRecord): InspectionEvidenceDto {
  return {
    id: record.id,
    inspectionId: record.inspectionId,
    itemId: record.itemId,
    evidenceType: record.evidenceType,
    sha256Hash: record.sha256Hash,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    capturedAt: record.capturedAt.toISOString(),
    capturedCoordinates: [record.capturedCoordinates[0], record.capturedCoordinates[1]],
    storageKey: record.storageKey,
    caption: record.caption,
  };
}
