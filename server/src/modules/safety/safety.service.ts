import nodeCrypto from 'node:crypto';
import type {
  AuditGrade,
  AuditOutcome,
  CategoryScoreBreakdownDto,
  PlatformInspectionStatus,
  PublicEvidencePhotoDto,
  PublicTrustProfileDto,
  TrustHistoryItemDto,
  TrustHistoryResponseDto,
  TrustQrCodeDto,
} from '@bhojora/shared';
import { AppError } from '../../middleware/error-handler';
import { CHECKLIST_CATEGORIES_RUNTIME } from '../inspection/inspection.types';
import type { InspectionRecord } from '../inspection/inspection.types';
import type { InspectionStore } from '../inspection/inspection.store';
import type { RestaurantOutletRecord, RestaurantStore } from '../restaurant/restaurant.types';
import {
  AUDIT_VALIDITY_DAYS,
  CHECKLIST_CATEGORY_DISPLAY_NAMES,
  STATUTORY_DISCLAIMER_TEXT,
} from './safety.types';

export interface SafetyServiceOptions {
  restaurantStore: RestaurantStore;
  inspectionStore: InspectionStore;
  signingSecret: string;
  clock?: { now(): Date };
}

function generateTrustQrSvgDataUri(qrText: string, status: string, score: number | null): string {
  const badgeColor =
    status === 'VERIFIED_CLEAN' ? '#10B981' : status === 'SUSPENDED' ? '#EF4444' : '#F59E0B';
  const scoreDisplay = score !== null ? score : '!';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <rect width="200" height="200" fill="#FFFFFF" rx="12"/>
  <rect x="10" y="10" width="180" height="180" fill="none" stroke="#E2E8F0" stroke-width="2" rx="8"/>
  <rect x="24" y="24" width="40" height="40" fill="#0F172A" rx="4"/>
  <rect x="32" y="32" width="24" height="24" fill="#FFFFFF" rx="2"/>
  <rect x="38" y="38" width="12" height="12" fill="#0F172A" rx="1"/>
  <rect x="136" y="24" width="40" height="40" fill="#0F172A" rx="4"/>
  <rect x="144" y="32" width="24" height="24" fill="#FFFFFF" rx="2"/>
  <rect x="150" y="38" width="12" height="12" fill="#0F172A" rx="1"/>
  <rect x="24" y="136" width="40" height="40" fill="#0F172A" rx="4"/>
  <rect x="32" y="144" width="24" height="24" fill="#FFFFFF" rx="2"/>
  <rect x="38" y="150" width="12" height="12" fill="#0F172A" rx="1"/>
  <circle cx="100" cy="100" r="28" fill="${badgeColor}"/>
  <text x="100" y="105" font-family="sans-serif" font-size="14" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${scoreDisplay}</text>
  <text x="100" y="186" font-family="sans-serif" font-size="9" font-weight="600" fill="#64748B" text-anchor="middle">BHOJORA TRUST QR</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export class SafetyService {
  private readonly restaurantStore: RestaurantStore;
  private readonly inspectionStore: InspectionStore;
  private readonly signingSecret: string;
  private readonly clock?: { now(): Date };

  constructor(options: SafetyServiceOptions) {
    this.restaurantStore = options.restaurantStore;
    this.inspectionStore = options.inspectionStore;
    this.signingSecret = options.signingSecret;
    this.clock = options.clock;
  }

  private getNow(): Date {
    return this.clock ? this.clock.now() : new Date();
  }

  private computeCategoryBreakdown(inspection: InspectionRecord): CategoryScoreBreakdownDto[] {
    const breakdown: CategoryScoreBreakdownDto[] = [];
    for (const cat of CHECKLIST_CATEGORIES_RUNTIME) {
      const items = (inspection.findings || []).filter((f) => f.category === cat);
      if (items.length > 0) {
        const rawScore = items.reduce((acc, f) => acc + f.score, 0);
        const maxScore = items.reduce((acc, f) => acc + f.maxScore, 0);
        const percentage = maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0;
        breakdown.push({
          category: cat,
          categoryLabel: CHECKLIST_CATEGORY_DISPLAY_NAMES[cat] || cat,
          rawScore,
          maxScore,
          percentage,
        });
      }
    }
    return breakdown;
  }

  private generateQrPayload(
    outletId: string,
    outletSlug: string,
    status: PlatformInspectionStatus,
    score: number | null,
    validUntil: Date | null,
  ): { qrCode: string; hmacSignature: string; verificationUrl: string; qrSvgDataUri: string } {
    const qrCode = `qr_${nodeCrypto.createHash('sha256').update(outletId).digest('hex').slice(0, 16)}`;
    const signPayload = `${outletId}:${status}:${score ?? 'null'}:${validUntil ? validUntil.toISOString() : 'null'}`;
    const hmacSignature = nodeCrypto
      .createHmac('sha256', this.signingSecret)
      .update(signPayload)
      .digest('hex');
    const verificationUrl = `https://bhojora.in/restaurants/${outletSlug || outletId}/trust`;
    const qrSvgDataUri = generateTrustQrSvgDataUri(verificationUrl, status, score);
    return { qrCode, hmacSignature, verificationUrl, qrSvgDataUri };
  }

  private async resolveOutlet(outletIdOrSlug: string): Promise<RestaurantOutletRecord | null> {
    let outlet = await this.restaurantStore.getOutletById(outletIdOrSlug);
    if (!outlet) {
      const all = await this.restaurantStore.listPublicOutlets();
      outlet =
        all.find(
          (o: RestaurantOutletRecord) => o.slug === outletIdOrSlug || o.outletId === outletIdOrSlug,
        ) || null;
    }
    return outlet;
  }

  async getPublicTrustProfile(outletIdOrSlug: string): Promise<PublicTrustProfileDto> {
    const now = this.getNow();
    const outlet = await this.resolveOutlet(outletIdOrSlug);
    const outletId = outlet ? outlet.outletId : outletIdOrSlug;

    // Fetch all inspection audits for this outlet
    const inspections = await this.inspectionStore.getInspectionsForOutlet(outletId);
    if (!outlet && inspections.length === 0) {
      throw new AppError(404, 'NOT_FOUND', `Outlet ${outletIdOrSlug} not found`);
    }

    const approvedInspections = inspections
      .filter((i) => i.status === 'APPROVED')
      .sort((a, b) => {
        const dateA = a.reviewedAt?.getTime() ?? a.startedAt.getTime();
        const dateB = b.reviewedAt?.getTime() ?? b.startedAt.getTime();
        return dateB - dateA;
      });

    const latestApproved = approvedInspections[0] || null;

    let status: PlatformInspectionStatus = 'NOT_INSPECTED';
    let statusLabel = 'Not Yet Inspected';
    let statusExplanation =
      'Statutory onboarding is complete, but an independent Bhojora physical kitchen hygiene audit has not yet been performed.';
    let isVerified = false;
    let currentScore: number | null = null;
    let grade: AuditGrade | null = null;
    let outcome: AuditOutcome | null = null;
    let inspectedAt: string | null = null;
    let validUntil: string | null = null;
    let isExpired = false;
    let daysRemaining: number | null = null;
    let categoryBreakdown: CategoryScoreBreakdownDto[] = [];
    let publicEvidence: PublicEvidencePhotoDto[] = [];

    if (latestApproved) {
      const auditDate = latestApproved.reviewedAt ?? latestApproved.startedAt;
      inspectedAt = auditDate.toISOString();
      const validUntilDate = new Date(
        auditDate.getTime() + AUDIT_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
      );
      validUntil = validUntilDate.toISOString();
      isExpired = now.getTime() > validUntilDate.getTime();
      daysRemaining = isExpired
        ? 0
        : Math.max(
            0,
            Math.ceil((validUntilDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
          );

      categoryBreakdown = this.computeCategoryBreakdown(latestApproved);

      // Mask and project strictly public evidence (photos & temperature logs only)
      publicEvidence = (latestApproved.evidence || [])
        .filter((e) => e.evidenceType === 'PHOTO' || e.evidenceType === 'TEMPERATURE_LOG')
        .map((e) => ({
          id: e.id,
          itemId: e.itemId,
          evidenceType: e.evidenceType,
          sha256Hash: e.sha256Hash,
          mimeType: e.mimeType,
          capturedAt: e.capturedAt.toISOString(),
          caption: e.caption,
        }));

      const isSuspended =
        latestApproved.hasCriticalViolation ||
        latestApproved.scoreSummary?.outcome === 'FAIL' ||
        latestApproved.scoreSummary?.grade === 'SUSPENDED';

      if (isSuspended) {
        status = 'SUSPENDED';
        statusLabel = 'Safety Hold — Suspended';
        statusExplanation =
          'Kitchen discovery is paused pending resolution of critical food-safety findings.';
        isVerified = false;
        currentScore = 0;
        grade = 'SUSPENDED';
        outcome = 'FAIL';
      } else if (isExpired) {
        status = 'EXPIRED';
        statusLabel = 'Inspection Expired';
        statusExplanation =
          'Previous independent inspection validity has expired (180 days); a new physical hygiene audit is required.';
        isVerified = false;
        currentScore = null; // Mask score when expired
        grade = null;
        outcome = null;
      } else {
        const scorePercent =
          latestApproved.scoreSummary?.finalScorePercent ??
          latestApproved.scoreSummary?.scorePercent ??
          null;
        const auditGrade = latestApproved.scoreSummary?.grade ?? 'A';
        const auditOutcome = latestApproved.scoreSummary?.outcome ?? 'PASS';

        if (auditOutcome === 'NEEDS_IMPROVEMENT') {
          status = 'ACTION_REQUIRED';
          statusLabel = 'Action Required (CAP)';
          statusExplanation =
            'Corrective Action Plan observations are open; re-verification is required before Verified Clean status applies.';
          isVerified = false;
        } else {
          status = 'VERIFIED_CLEAN';
          statusLabel = 'Verified Clean Kitchen';
          statusExplanation =
            'Passed independent Bhojora on-site hygiene verification against standardized sanitation and food-handling checks.';
          isVerified = true;
        }
        currentScore = scorePercent;
        grade = auditGrade;
        outcome = auditOutcome;
      }
    } else {
      // Check if scheduled or in progress
      const hasActiveSchedule = inspections.some(
        (i) =>
          i.status === 'SCHEDULED' ||
          i.status === 'DRAFT' ||
          i.status === 'SUBMITTED' ||
          i.status === 'IN_REVIEW',
      );
      if (hasActiveSchedule) {
        status = 'SCHEDULED';
        statusLabel = 'Inspection Scheduled';
        statusExplanation =
          'An independent physical kitchen hygiene audit is in progress or scheduled. Verified Clean status cannot be claimed until audit approval.';
      }
    }

    const brandName =
      outlet?.brandName ||
      outlet?.name ||
      (latestApproved ? 'Verified Partner Kitchen' : 'Bhojora Partner');
    const outletName = outlet?.name || outletId;
    const slug = outlet?.slug || outletId;
    const locality = outlet?.locality || 'Kolkata Central';
    const zoneId = outlet?.zoneId || 'central';
    const fssaiLicenseNumber = outlet?.fssaiLicenseNumber || 'FSSAI-ON-FILE';
    const fssaiStatus = outlet?.fssaiVerificationStatus || 'VERIFIED';

    const qr = this.generateQrPayload(
      outletId,
      slug,
      status,
      currentScore,
      validUntil ? new Date(validUntil) : null,
    );

    return {
      outletId,
      restaurantId: outlet?.restaurantId || latestApproved?.restaurantId || 'rest_unknown',
      brandName,
      outletName,
      slug,
      locality,
      zoneId,
      fssaiLicenseNumber,
      fssaiStatus,
      status,
      statusLabel,
      statusExplanation,
      isVerified,
      currentScore,
      grade,
      outcome,
      inspectedAt,
      validUntil,
      isExpired,
      daysRemaining,
      categoryBreakdown,
      publicEvidence,
      hasActiveSafetyInvestigation: false,
      statutoryDisclaimer: STATUTORY_DISCLAIMER_TEXT,
      qrCode: qr.qrCode,
      verificationUrl: qr.verificationUrl,
    };
  }

  async getPublicTrustHistory(outletIdOrSlug: string): Promise<TrustHistoryResponseDto> {
    const outlet = await this.resolveOutlet(outletIdOrSlug);
    const outletId = outlet ? outlet.outletId : outletIdOrSlug;
    const now = this.getNow();

    const inspections = await this.inspectionStore.getInspectionsForOutlet(outletId);
    if (!outlet && inspections.length === 0) {
      throw new AppError(404, 'NOT_FOUND', `Outlet ${outletIdOrSlug} not found`);
    }

    const approvedInspections = inspections
      .filter((i) => i.status === 'APPROVED')
      .sort((a, b) => {
        const dateA = a.reviewedAt?.getTime() ?? a.startedAt.getTime();
        const dateB = b.reviewedAt?.getTime() ?? b.startedAt.getTime();
        return dateB - dateA;
      });

    const history: TrustHistoryItemDto[] = approvedInspections.map((ins) => {
      const reviewedAtDate = ins.reviewedAt ?? ins.startedAt;
      const validUntilDate = new Date(
        reviewedAtDate.getTime() + AUDIT_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
      );
      const isExpired = now.getTime() > validUntilDate.getTime();

      return {
        inspectionId: ins.id,
        checklistVersion: ins.checklistVersion,
        assessmentType: ins.assessmentType,
        reviewedAt: reviewedAtDate.toISOString(),
        scorePercent: ins.scoreSummary?.finalScorePercent ?? ins.scoreSummary?.scorePercent ?? 0,
        outcome: ins.scoreSummary?.outcome ?? (ins.hasCriticalViolation ? 'FAIL' : 'PASS'),
        grade: ins.scoreSummary?.grade ?? (ins.hasCriticalViolation ? 'SUSPENDED' : 'A'),
        validUntil: validUntilDate.toISOString(),
        isExpired,
        categoryBreakdown: this.computeCategoryBreakdown(ins),
        evidenceCount: (ins.evidence || []).filter(
          (e) => e.evidenceType === 'PHOTO' || e.evidenceType === 'TEMPERATURE_LOG',
        ).length,
      };
    });

    return {
      outletId,
      totalAudits: history.length,
      history,
    };
  }

  async getOutletQrCode(outletIdOrSlug: string): Promise<TrustQrCodeDto> {
    const profile = await this.getPublicTrustProfile(outletIdOrSlug);
    const qr = this.generateQrPayload(
      profile.outletId,
      profile.slug,
      profile.status,
      profile.currentScore,
      profile.validUntil ? new Date(profile.validUntil) : null,
    );

    return {
      qrCode: qr.qrCode,
      outletId: profile.outletId,
      outletName: profile.outletName,
      verificationUrl: qr.verificationUrl,
      status: profile.status,
      score: profile.currentScore,
      grade: profile.grade,
      validUntil: profile.validUntil,
      isExpired: profile.isExpired,
      hmacSignature: qr.hmacSignature,
      qrSvgDataUri: qr.qrSvgDataUri,
    };
  }

  async resolveQrCode(qrCode: string): Promise<PublicTrustProfileDto> {
    const outlets = await this.restaurantStore.listPublicOutlets();
    for (const outlet of outlets) {
      const candidateCode = `qr_${nodeCrypto.createHash('sha256').update(outlet.outletId).digest('hex').slice(0, 16)}`;
      if (candidateCode === qrCode || outlet.outletId === qrCode || outlet.slug === qrCode) {
        return this.getPublicTrustProfile(outlet.outletId);
      }
    }

    // Check if qrCode directly matches an outlet ID in store
    const directOutlet = await this.restaurantStore.getOutletById(qrCode);
    if (directOutlet) {
      return this.getPublicTrustProfile(directOutlet.outletId);
    }

    // Search approved inspections to resolve candidate hash
    const approvedInspections = await this.inspectionStore.listInspectionsByStatus('APPROVED');
    for (const ins of approvedInspections) {
      const candidateCode = `qr_${nodeCrypto.createHash('sha256').update(ins.outletId).digest('hex').slice(0, 16)}`;
      if (candidateCode === qrCode) {
        return this.getPublicTrustProfile(ins.outletId);
      }
    }

    // Fallback: check if qrCode directly matches an outlet ID or slug
    return this.getPublicTrustProfile(qrCode);
  }
}
