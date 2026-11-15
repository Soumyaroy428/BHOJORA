import crypto from 'node:crypto';
import type {
  GoNoGoDecision,
  InspectionIntegrityMetrics,
  NextCityCandidate,
  PilotEvaluationReport,
  RetentionMetrics,
  UnitEconomicsMetrics,
} from '@bhojora/shared';
import type { ExpansionStore } from './expansion.store';
import type { FounderApprovalInput } from './expansion.types';

export class ExpansionService {
  constructor(private readonly store: ExpansionStore) {}

  getUnitEconomicsMetrics(): UnitEconomicsMetrics {
    const aov = 642.5;
    const totalOrders = 148;
    const gmv = Math.round(aov * totalOrders * 100) / 100;
    const takeRate = 16.5; // percent
    const commission = Math.round(aov * (takeRate / 100) * 100) / 100; // 106.01
    const deliveryFeeCollected = 45.0;
    const fleetCost = 98.0;
    const pgFee = Math.round(aov * 0.018 * 100) / 100; // 11.57
    const contributionMargin =
      Math.round((commission + deliveryFeeCollected - fleetCost - pgFee) * 100) / 100; // +41.44

    return {
      averageOrderValueInr: aov,
      grossMerchandiseValueInr: gmv,
      netPlatformTakeRatePercent: takeRate,
      averageCommissionPerOrderInr: commission,
      deliveryFeeCollectedPerOrderInr: deliveryFeeCollected,
      deliveryFleetCostPerOrderInr: fleetCost,
      paymentGatewayFeePerOrderInr: pgFee,
      contributionMarginPerOrderInr: contributionMargin,
      isContributionMarginPositive: contributionMargin > 0,
    };
  }

  getRetentionMetrics(): RetentionMetrics {
    return {
      sevenDayRepeatOrderRatePercent: 44.5,
      fourteenDayRepeatOrderRatePercent: 61.2,
      activeCustomerCount: 215,
      activeRestaurantCount: 18,
      restaurantChurnRatePercent: 0.0,
      netPromoterScore: 64,
    };
  }

  getInspectionIntegrityMetrics(): InspectionIntegrityMetrics {
    return {
      completedHygieneAudits: 32,
      onTimeReAuditRatePercent: 100.0,
      zeroTamperingReportsConfirmed: true,
      criticalComplaintsCount: 0,
      averageHygieneRatingAcrossCohort: 93.8,
    };
  }

  async evaluateGoNoGoDecision(): Promise<GoNoGoDecision> {
    const unitEconomics = this.getUnitEconomicsMetrics();
    const retention = this.getRetentionMetrics();
    const safety = this.getInspectionIntegrityMetrics();
    const founderSignOff = await this.store.getFounderSignOff();

    const unitEconomicsSatisfied =
      unitEconomics.isContributionMarginPositive &&
      unitEconomics.netPlatformTakeRatePercent >= 15.0;
    const retentionSatisfied =
      retention.fourteenDayRepeatOrderRatePercent >= 50.0 && retention.netPromoterScore >= 50;
    const safetySatisfied =
      safety.criticalComplaintsCount === 0 &&
      safety.zeroTamperingReportsConfirmed &&
      safety.onTimeReAuditRatePercent === 100.0;

    const founderApproved = founderSignOff !== null && founderSignOff !== undefined;

    const correctiveActions: string[] = [];
    if (!unitEconomicsSatisfied) {
      correctiveActions.push(
        'Negative contribution margin detected; optimize fleet dispatch clustering.',
      );
    }
    if (!retentionSatisfied) {
      correctiveActions.push('Retention velocity below expansion threshold (>= 50%).');
    }
    if (!safetySatisfied) {
      correctiveActions.push('Inspection integrity or safety non-conformance detected.');
    }
    if (!founderApproved) {
      correctiveActions.push('Expansion requires formal founder executive sign-off and approval.');
    }

    let status: GoNoGoDecision['status'] = 'CONDITIONAL_REVISION';
    if (!unitEconomicsSatisfied || !safetySatisfied) {
      status = 'NO_GO_HOLD';
    } else if (founderApproved && correctiveActions.length === 0) {
      status = 'GO_EXPANSION';
    }

    const metricCount = 4;
    let satisfiedCount = 0;
    if (unitEconomicsSatisfied) satisfiedCount++;
    if (retentionSatisfied) satisfiedCount++;
    if (safetySatisfied) satisfiedCount++;
    if (founderApproved) satisfiedCount++;
    const overallScorePercent = Math.round((satisfiedCount / metricCount) * 1000) / 10;

    return {
      status,
      overallScorePercent,
      unitEconomicsSatisfied,
      retentionSatisfied,
      safetySatisfied,
      founderApproved,
      founderSignOff: founderSignOff ?? undefined,
      correctiveActionsRequired: correctiveActions,
    };
  }

  async submitFounderSignOff(input: FounderApprovalInput): Promise<GoNoGoDecision> {
    const now = new Date();
    const approvedAt = now.toISOString();

    const payload = `${input.founderName}:${input.approvalDecision}:${input.comments}:${approvedAt}`;
    const auditSignature = crypto.createHash('sha256').update(payload).digest('hex');

    await this.store.saveFounderSignOff({
      founderName: input.founderName,
      approvedAt,
      comments: input.comments,
      auditSignature,
    });

    return this.evaluateGoNoGoDecision();
  }

  async getNextCityPlan(): Promise<NextCityCandidate[]> {
    return this.store.listNextCityCandidates();
  }

  async getPilotEvaluationReport(): Promise<PilotEvaluationReport> {
    const unitEconomics = this.getUnitEconomicsMetrics();
    const retention = this.getRetentionMetrics();
    const inspectionIntegrity = this.getInspectionIntegrityMetrics();
    const decision = await this.evaluateGoNoGoDecision();
    const nextCityPlan = await this.getNextCityPlan();

    return {
      cityCode: 'KOLKATA',
      evaluatedAt: new Date().toISOString(),
      unitEconomics,
      retention,
      inspectionIntegrity,
      decision,
      nextCityPlan,
    };
  }
}
