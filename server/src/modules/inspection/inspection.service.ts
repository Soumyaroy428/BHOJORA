import nodeCrypto from 'node:crypto';
import type { InspectionEvidenceDto, InspectionRecordDto } from '@bhojora/shared';
import { AppError } from '../../middleware/error-handler';
import type { InspectorService } from '../inspector/inspector.service';
import type { InspectionStore } from './inspection.store';
import {
  STANDARD_CHECKLIST_TEMPLATE_V1,
  createInspectionSchema,
  draftInspectionSchema,
  evidenceUploadSchema,
  resolveAppealSchema,
  reviewInspectionSchema,
  submitAppealSchema,
  submitInspectionSchema,
  toInspectionEvidenceDto,
  toInspectionRecordDto,
  type InspectionAppealRecord,
  type InspectionEvidenceRecord,
  type InspectionFindingRecord,
  type InspectionRecord,
  type InspectionScoreSummaryRecord,
  type InspectionStatus,
} from './inspection.types';

export interface InspectionServiceOptions {
  inspectionStore: InspectionStore;
  inspectorService: InspectorService;
}

const PRIVILEGED_ROLES = new Set([
  'TRUST_ADMIN',
  'OPS_ADMIN',
  'SUPER_ADMIN',
  'INSPECTION_REVIEWER',
]);

export class InspectionService {
  private readonly inspectionStore: InspectionStore;
  private readonly inspectorService: InspectorService;

  constructor(options: InspectionServiceOptions) {
    this.inspectionStore = options.inspectionStore;
    this.inspectorService = options.inspectorService;
  }

  async createInspection(inspectorId: string, rawInput: unknown): Promise<InspectionRecordDto> {
    const parsed = createInspectionSchema.parse(rawInput);

    // Enforce eligibility and conflict-of-interest check (CP21 integration)
    const eligibility = await this.inspectorService.checkEligibility(inspectorId, {
      outletId: parsed.outletId,
      restaurantId: parsed.restaurantId,
    });

    if (!eligibility.eligible) {
      throw new AppError(
        403,
        'FORBIDDEN',
        `Inspector ${inspectorId} is not eligible for this outlet: ${eligibility.reasons.join('; ')}`,
      );
    }

    const now = new Date();
    const defaultFindings: InspectionFindingRecord[] = STANDARD_CHECKLIST_TEMPLATE_V1.items.map(
      (item) => ({
        itemId: item.itemId,
        category: item.category,
        score: item.maxScore,
        maxScore: item.maxScore,
        severity: 'PASS',
        comments: '',
        evidenceIds: [],
      }),
    );

    const record: InspectionRecord = {
      id: `insp_${nodeCrypto.randomUUID()}`,
      outletId: parsed.outletId,
      restaurantId: parsed.restaurantId,
      inspectorId,
      assessmentType: parsed.assessmentType,
      checklistVersion: parsed.checklistVersion,
      status: 'DRAFT',
      startedAt: now,
      findings: defaultFindings,
      evidence: [],
      hasCriticalViolation: false,
      createdAt: now,
      updatedAt: now,
    };

    const saved = await this.inspectionStore.createInspection(record);
    return toInspectionRecordDto(saved);
  }

  async getInspection(
    inspectorId: string,
    inspectionId: string,
    userRoles: string[] = [],
  ): Promise<InspectionRecordDto> {
    const inspection = await this.inspectionStore.getInspectionById(inspectionId);
    if (!inspection) {
      throw new AppError(404, 'NOT_FOUND', `Inspection ${inspectionId} not found`);
    }

    // Privacy Boundary: only assigned inspector or authorized reviewer/admin can access
    const isAssigned = inspection.inspectorId === inspectorId;
    const isPrivileged = userRoles.some((r) => PRIVILEGED_ROLES.has(r));
    if (!isAssigned && !isPrivileged) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to this inspection report');
    }

    return toInspectionRecordDto(inspection);
  }

  async getAssignedInspections(inspectorId: string): Promise<InspectionRecordDto[]> {
    const list = await this.inspectionStore.getInspectionsForInspector(inspectorId);
    return list.map(toInspectionRecordDto);
  }

  async saveDraft(
    inspectorId: string,
    inspectionId: string,
    rawInput: unknown,
  ): Promise<InspectionRecordDto> {
    const inspection = await this.inspectionStore.getInspectionById(inspectionId);
    if (!inspection) {
      throw new AppError(404, 'NOT_FOUND', `Inspection ${inspectionId} not found`);
    }

    if (inspection.inspectorId !== inspectorId) {
      throw new AppError(403, 'FORBIDDEN', 'Cannot edit inspection assigned to another inspector');
    }

    if (inspection.status === 'APPROVED') {
      throw new AppError(
        409,
        'CONFLICT',
        'Approved inspection reports are immutable and cannot be modified',
      );
    }

    if (
      inspection.status !== 'DRAFT' &&
      inspection.status !== 'SCHEDULED' &&
      inspection.status !== 'RETURNED'
    ) {
      throw new AppError(
        409,
        'CONFLICT',
        `Cannot update draft for inspection in ${inspection.status} status`,
      );
    }

    const parsed = draftInspectionSchema.parse(rawInput);
    const hasCriticalViolation = parsed.findings.some((f) => f.severity === 'CRITICAL');
    const clientDraftSavedAt = parsed.clientDraftSavedAt
      ? new Date(parsed.clientDraftSavedAt)
      : new Date();

    const updated = await this.inspectionStore.updateInspection(inspectionId, {
      findings: parsed.findings.map((f) => ({
        itemId: f.itemId,
        category: f.category,
        score: f.score,
        maxScore: f.maxScore,
        severity: f.severity,
        comments: f.comments,
        evidenceIds: [...f.evidenceIds],
      })),
      hasCriticalViolation,
      clientDraftSavedAt,
    });

    return toInspectionRecordDto(updated!);
  }

  async uploadEvidence(
    inspectorId: string,
    inspectionId: string,
    rawInput: unknown,
  ): Promise<InspectionEvidenceDto> {
    const inspection = await this.inspectionStore.getInspectionById(inspectionId);
    if (!inspection) {
      throw new AppError(404, 'NOT_FOUND', `Inspection ${inspectionId} not found`);
    }

    if (inspection.inspectorId !== inspectorId) {
      throw new AppError(403, 'FORBIDDEN', 'Cannot attach evidence to another inspector audit');
    }

    if (inspection.status === 'APPROVED') {
      throw new AppError(
        409,
        'CONFLICT',
        'Approved inspection reports are immutable and evidence cannot be added',
      );
    }

    if (
      inspection.status !== 'DRAFT' &&
      inspection.status !== 'SCHEDULED' &&
      inspection.status !== 'RETURNED'
    ) {
      throw new AppError(
        409,
        'CONFLICT',
        `Cannot upload evidence for inspection in ${inspection.status} status`,
      );
    }

    const parsed = evidenceUploadSchema.parse(rawInput);

    // Cryptographic Integrity Check: verify SHA-256 hash if payload base64 content is provided
    if (parsed.base64Data) {
      const buffer = Buffer.from(parsed.base64Data, 'base64');
      const computedHash = nodeCrypto.createHash('sha256').update(buffer).digest('hex');
      if (computedHash.toLowerCase() !== parsed.sha256Hash.toLowerCase()) {
        throw new AppError(
          422,
          'VALIDATION_ERROR',
          'Evidence integrity verification failed: SHA-256 hash does not match binary content',
        );
      }
    }

    // Capture timestamp validity (no future dates)
    const capturedTime = new Date(parsed.capturedAt).getTime();
    if (capturedTime > Date.now() + 60000) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Evidence capture timestamp cannot be in the future',
      );
    }

    const evidenceRecord: InspectionEvidenceRecord = {
      id: `evi_${nodeCrypto.randomUUID()}`,
      inspectionId,
      itemId: parsed.itemId,
      evidenceType: parsed.evidenceType,
      sha256Hash: parsed.sha256Hash.toLowerCase(),
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      capturedAt: new Date(parsed.capturedAt),
      capturedCoordinates: [parsed.capturedCoordinates[0], parsed.capturedCoordinates[1]],
      storageKey: `inspections/${inspectionId}/${Date.now()}_${parsed.sha256Hash.slice(0, 8)}`,
      caption: parsed.caption,
      createdAt: new Date(),
    };

    const saved = await this.inspectionStore.addEvidence(evidenceRecord);

    // If an itemId was specified, automatically link evidenceId to the finding
    if (parsed.itemId) {
      const existingFindings = inspection.findings;
      const targetFinding = existingFindings.find((f) => f.itemId === parsed.itemId);
      if (targetFinding && !targetFinding.evidenceIds.includes(saved.id)) {
        targetFinding.evidenceIds.push(saved.id);
        await this.inspectionStore.updateInspection(inspectionId, {
          findings: existingFindings,
        });
      }
    }

    return toInspectionEvidenceDto(saved);
  }

  async getEvidence(
    inspectorId: string,
    inspectionId: string,
    evidenceId: string,
    userRoles: string[] = [],
  ): Promise<InspectionEvidenceDto> {
    const inspection = await this.inspectionStore.getInspectionById(inspectionId);
    if (!inspection) {
      throw new AppError(404, 'NOT_FOUND', `Inspection ${inspectionId} not found`);
    }

    // Privacy boundary
    const isAssigned = inspection.inspectorId === inspectorId;
    const isPrivileged = userRoles.some((r) => PRIVILEGED_ROLES.has(r));
    if (!isAssigned && !isPrivileged) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to this inspection evidence');
    }

    const evidence = await this.inspectionStore.getEvidenceById(evidenceId);
    if (!evidence || evidence.inspectionId !== inspectionId) {
      throw new AppError(404, 'NOT_FOUND', `Evidence ${evidenceId} not found`);
    }

    return toInspectionEvidenceDto(evidence);
  }

  async submitInspection(
    inspectorId: string,
    inspectionId: string,
    rawInput: unknown,
  ): Promise<InspectionRecordDto> {
    const inspection = await this.inspectionStore.getInspectionById(inspectionId);
    if (!inspection) {
      throw new AppError(404, 'NOT_FOUND', `Inspection ${inspectionId} not found`);
    }

    if (inspection.inspectorId !== inspectorId) {
      throw new AppError(
        403,
        'FORBIDDEN',
        'Cannot submit inspection assigned to another inspector',
      );
    }

    if (inspection.status !== 'DRAFT' && inspection.status !== 'RETURNED') {
      throw new AppError(
        409,
        'CONFLICT',
        `Inspection cannot be submitted in ${inspection.status} status (must be DRAFT or RETURNED)`,
      );
    }

    const parsed = submitInspectionSchema.parse(rawInput ?? {});
    const evidenceList = await this.inspectionStore.getEvidenceForInspection(inspectionId);

    const validationErrors: string[] = [];

    // Acceptance Criteria 1: Mandatory checklist items require evidence
    for (const templateItem of STANDARD_CHECKLIST_TEMPLATE_V1.items) {
      if (templateItem.evidenceRequired) {
        const finding = inspection.findings.find((f) => f.itemId === templateItem.itemId);
        const hasFindingEvidence = (finding?.evidenceIds?.length ?? 0) > 0;
        const hasItemEvidence = evidenceList.some((e) => e.itemId === templateItem.itemId);

        if (!hasFindingEvidence && !hasItemEvidence) {
          validationErrors.push(
            `Missing mandatory evidence for checklist item ${templateItem.itemId} ("${templateItem.title}")`,
          );
        }
      }
    }

    // Acceptance Criteria 2: Any MAJOR or CRITICAL finding requires photographic evidence
    for (const finding of inspection.findings) {
      if (finding.severity === 'CRITICAL' || finding.severity === 'MAJOR') {
        const hasFindingEvidence = finding.evidenceIds.length > 0;
        const hasItemEvidence = evidenceList.some((e) => e.itemId === finding.itemId);

        if (!hasFindingEvidence && !hasItemEvidence) {
          validationErrors.push(
            `Violation severity ${finding.severity} on item ${finding.itemId} requires attached photographic evidence`,
          );
        }
      }
    }

    if (validationErrors.length > 0) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        `Missing required evidence blocks submission: ${validationErrors.join('; ')}`,
      );
    }

    const now = new Date();
    const hasCriticalViolation = inspection.findings.some((f) => f.severity === 'CRITICAL');

    const updated = await this.inspectionStore.updateInspection(inspectionId, {
      status: 'SUBMITTED',
      submittedAt: now,
      hasCriticalViolation,
      managerSignedAt: parsed.signedAt ? new Date(parsed.signedAt) : now,
      managerName: parsed.managerName,
      managerDesignation: parsed.managerDesignation,
    });

    return toInspectionRecordDto(updated!);
  }

  async getReviewQueue(
    _reviewerUserId: string,
    userRoles: string[] = [],
  ): Promise<InspectionRecordDto[]> {
    const isPrivileged = userRoles.some((r) => PRIVILEGED_ROLES.has(r));
    if (!isPrivileged) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied to inspection reviewer queue');
    }
    const queue = await this.inspectionStore.listInspectionsByStatus('SUBMITTED');
    return queue.map(toInspectionRecordDto);
  }

  async reviewInspection(
    reviewerUserId: string,
    inspectionId: string,
    rawInput: unknown,
    userRoles: string[] = [],
  ): Promise<InspectionRecordDto> {
    const isPrivileged = userRoles.some((r) => PRIVILEGED_ROLES.has(r));
    if (!isPrivileged) {
      throw new AppError(403, 'FORBIDDEN', 'Reviewer access required to review inspections');
    }

    const inspection = await this.inspectionStore.getInspectionById(inspectionId);
    if (!inspection) {
      throw new AppError(404, 'NOT_FOUND', `Inspection ${inspectionId} not found`);
    }

    if (inspection.status === 'APPROVED') {
      throw new AppError(
        409,
        'CONFLICT',
        'Approved inspection reports are immutable and cannot be re-reviewed',
      );
    }

    if (inspection.status !== 'SUBMITTED' && inspection.status !== 'IN_REVIEW') {
      throw new AppError(
        409,
        'CONFLICT',
        `Inspection is not awaiting review (current status: ${inspection.status})`,
      );
    }

    // Strict Anti-Self-Review Rule (ADR-005): Inspector cannot approve or review their own inspection
    const inspectorProfile = await this.inspectorService.getInspectorById(inspection.inspectorId);
    if (inspectorProfile && inspectorProfile.userId === reviewerUserId) {
      throw new AppError(
        403,
        'SELF_REVIEW_PROHIBITED',
        'Inspectors cannot review or approve their own inspection report',
      );
    }

    const parsed = reviewInspectionSchema.parse(rawInput);
    const now = new Date();

    if (parsed.decision === 'APPROVE') {
      // Score Policy V1 Calculation
      const totalScore = inspection.findings.reduce((acc, f) => acc + f.score, 0);
      const maxScore = inspection.findings.reduce((acc, f) => acc + f.maxScore, 0);
      const rawPercent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0;

      const hasCriticalViolation = inspection.findings.some((f) => f.severity === 'CRITICAL');
      let criticalOverrideApplied = false;
      let overrideReason: string | undefined;
      let finalScorePercent = rawPercent;
      let outcome: 'PASS' | 'FAIL' | 'NEEDS_IMPROVEMENT';
      let grade: 'A_PLUS' | 'A' | 'B' | 'SUSPENDED';

      if (hasCriticalViolation) {
        criticalOverrideApplied = true;
        overrideReason =
          'CRITICAL_VIOLATION_OVERRIDE: Active critical hygiene violation overrides numeric score.';
        finalScorePercent = 0;
        outcome = 'FAIL';
        grade = 'SUSPENDED';
      } else {
        if (rawPercent >= 85) {
          outcome = 'PASS';
          grade = 'A_PLUS';
        } else if (rawPercent >= 70) {
          outcome = 'PASS';
          grade = 'A';
        } else {
          outcome = 'NEEDS_IMPROVEMENT';
          grade = 'B';
        }
      }

      const scoreSummary: InspectionScoreSummaryRecord = {
        rawScore: totalScore,
        maxScore,
        scorePercent: rawPercent,
        scorePolicyVersion: parsed.scorePolicyVersion ?? 'SCORE_POLICY_V1',
        hasCriticalViolation,
        criticalOverrideApplied,
        overrideReason,
        finalScorePercent,
        outcome,
        grade,
      };

      const updated = await this.inspectionStore.updateInspection(inspectionId, {
        status: 'APPROVED',
        reviewDecision: 'APPROVE',
        reviewedByUserId: reviewerUserId,
        reviewedAt: now,
        reviewNotes: parsed.notes,
        scoreSummary,
      });

      return toInspectionRecordDto(updated!);
    }

    if (parsed.decision === 'REJECT') {
      const updated = await this.inspectionStore.updateInspection(inspectionId, {
        status: 'REJECTED',
        reviewDecision: 'REJECT',
        reviewedByUserId: reviewerUserId,
        reviewedAt: now,
        reviewNotes: parsed.notes,
      });
      return toInspectionRecordDto(updated!);
    }

    if (parsed.decision === 'RETURN_FOR_CLARIFICATION') {
      const updated = await this.inspectionStore.updateInspection(inspectionId, {
        status: 'RETURNED',
        reviewDecision: 'RETURN_FOR_CLARIFICATION',
        reviewedByUserId: reviewerUserId,
        reviewedAt: now,
        reviewNotes: parsed.notes,
      });
      return toInspectionRecordDto(updated!);
    }

    throw new AppError(400, 'VALIDATION_ERROR', 'Unsupported review decision');
  }

  async submitAppeal(
    userId: string,
    inspectionId: string,
    rawInput: unknown,
  ): Promise<InspectionRecordDto> {
    const inspection = await this.inspectionStore.getInspectionById(inspectionId);
    if (!inspection) {
      throw new AppError(404, 'NOT_FOUND', `Inspection ${inspectionId} not found`);
    }

    if (inspection.appeal || inspection.status === 'APPEALED') {
      throw new AppError(
        409,
        'CONFLICT',
        'An appeal has already been submitted for this inspection',
      );
    }

    if (inspection.status !== 'APPROVED' && inspection.status !== 'REJECTED') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Can only appeal an inspection in APPROVED or REJECTED status (current: ${inspection.status})`,
      );
    }

    const parsed = submitAppealSchema.parse(rawInput);
    const appealRecord: InspectionAppealRecord = {
      id: `app_${nodeCrypto.randomUUID()}`,
      inspectionId,
      restaurantId: inspection.restaurantId,
      appellantUserId: userId,
      contestedItemIds: parsed.contestedItemIds,
      reason: parsed.reason,
      evidenceUrls: parsed.evidenceUrls,
      status: 'SUBMITTED',
      submittedAt: new Date(),
    };

    const updated = await this.inspectionStore.updateInspection(inspectionId, {
      status: 'APPEALED',
      appeal: appealRecord,
    });

    return toInspectionRecordDto(updated!);
  }

  async resolveAppeal(
    reviewerUserId: string,
    inspectionId: string,
    rawInput: unknown,
    userRoles: string[] = [],
  ): Promise<InspectionRecordDto> {
    const isPrivileged = userRoles.some((r) => PRIVILEGED_ROLES.has(r));
    if (!isPrivileged) {
      throw new AppError(403, 'FORBIDDEN', 'Admin access required to resolve appeals');
    }

    const inspection = await this.inspectionStore.getInspectionById(inspectionId);
    if (!inspection) {
      throw new AppError(404, 'NOT_FOUND', `Inspection ${inspectionId} not found`);
    }

    if (inspection.status !== 'APPEALED' || !inspection.appeal) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Inspection does not have an active appeal');
    }

    const parsed = resolveAppealSchema.parse(rawInput);
    const now = new Date();
    const updatedAppeal: InspectionAppealRecord = {
      ...inspection.appeal,
      status: parsed.resolution,
      resolvedAt: now,
      resolvedByUserId: reviewerUserId,
      resolutionNotes: parsed.notes,
    };

    let nextStatus: InspectionStatus =
      inspection.reviewDecision === 'REJECT' ? 'REJECTED' : 'APPROVED';
    if (parsed.resolution === 'RE_INSPECTION_ORDERED') {
      nextStatus = 'SCHEDULED';
    }

    const updated = await this.inspectionStore.updateInspection(inspectionId, {
      status: nextStatus,
      appeal: updatedAppeal,
    });

    return toInspectionRecordDto(updated!);
  }
}
