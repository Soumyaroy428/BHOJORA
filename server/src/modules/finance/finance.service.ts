import crypto from 'node:crypto';
import type { UserRole } from '../identity/identity.types';
import { AppError } from '../../middleware/error-handler';
import { assertMfaSatisfiedForRole, hasPermissionForRole } from '../rbac/rbac.policy';
import type {
  ApproveRefundInput,
  CreateLedgerEntryInput,
  CreatePartnerEarningsInput,
  CreatePayoutReconciliationInput,
  CreateRefundRequestInput,
  CreateSettlementBatchInput,
} from './finance.types';
import {
  approveRefundSchema,
  createLedgerEntrySchema,
  createPartnerEarningsSchema,
  createPayoutReconciliationSchema,
  createRefundRequestSchema,
  createSettlementBatchSchema,
} from './finance.types';
import type {
  FinanceStore,
  LedgerEntryRecord,
  PartnerEarningsRecord,
  PayoutReconciliationRecord,
  RefundRecord,
  SettlementBatchRecord,
} from './finance.store';

export interface FinanceServiceOptions {
  financeStore: FinanceStore;
  clock?: { now(): Date };
}

export class FinanceService {
  private readonly financeStore: FinanceStore;
  private readonly clock: { now(): Date };

  constructor(options: FinanceServiceOptions) {
    this.financeStore = options.financeStore;
    this.clock = options.clock ?? { now: () => new Date() };
  }

  getClock(): { now(): Date } {
    return this.clock;
  }

  static isSafeIntegerPaise(value: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
  }

  static assertPaiseCurrency(value: number, name: string): void {
    if (!FinanceService.isSafeIntegerPaise(value)) {
      throw new AppError(400, 'VALIDATION_ERROR', `${name} must be a safe integer paise amount`);
    }
  }

  static calculateCommissionPaise(amountPaise: number, ratePercent: number): number {
    const rate = Number(ratePercent) / 100;
    return Math.round(amountPaise * rate);
  }

  static calculateDiscrepancyPaise(expectedPaise: number, actualPaise: number): number {
    return actualPaise - expectedPaise;
  }

  async createRefundRequest(actorUserId: string, rawInput: unknown): Promise<RefundRecord> {
    const input = createRefundRequestSchema.parse(rawInput) as CreateRefundRequestInput;
    FinanceService.assertPaiseCurrency(input.amountPaise, 'amountPaise');

    const existing = await this.financeStore.listRefunds();
    const idempotencyKey =
      input.idempotencyKey ?? `${actorUserId}:${input.paymentId}:${input.orderId}`;
    const duplicate = existing.find((refund) => refund.idempotencyKey === idempotencyKey);
    if (duplicate) {
      return duplicate;
    }

    const nowIso = this.clock.now().toISOString();
    const record: RefundRecord = {
      refundId: crypto.randomUUID(),
      paymentId: input.paymentId,
      orderId: input.orderId,
      customerId: input.customerId,
      amountPaise: input.amountPaise,
      reason: input.reason,
      externalReasonCode: input.externalReasonCode ?? null,
      status: 'REQUESTED',
      idempotencyKey,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
      reviewedByUserId: null,
      reviewedAtIso: null,
      approvedAtIso: null,
      processedAtIso: null,
    };

    return this.financeStore.createRefund(record);
  }

  async getRefunds(): Promise<RefundRecord[]> {
    return this.financeStore.listRefunds();
  }

  async getRefundById(refundId: string): Promise<RefundRecord | null> {
    return this.financeStore.getRefundById(refundId);
  }

  async approveRefund(
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
    refundId: string,
    rawInput: unknown,
  ): Promise<RefundRecord> {
    if (!hasPermissionForRole(actorRole, 'finance:refund:approve')) {
      throw new AppError(403, 'FORBIDDEN', `Role ${actorRole} lacks finance:refund:approve`);
    }
    assertMfaSatisfiedForRole(actorRole, mfaVerified);

    const parsed = approveRefundSchema.parse(rawInput) as ApproveRefundInput;
    const refund = await this.financeStore.getRefundById(refundId);
    if (!refund) {
      throw new AppError(404, 'NOT_FOUND', `Refund ${refundId} not found`);
    }

    const reviewedByUserId = parsed.reviewedByUserId ?? actorUserId;
    const nowIso = this.clock.now().toISOString();
    const decisionStatus = parsed.decision === 'APPROVED' ? 'PROCESSING' : 'REJECTED';
    const updated: RefundRecord = {
      ...refund,
      status: decisionStatus,
      reviewedByUserId,
      reviewedAtIso: nowIso,
      approvedAtIso: parsed.decision === 'APPROVED' ? nowIso : (refund.approvedAtIso ?? null),
      processedAtIso: parsed.decision === 'APPROVED' ? null : (refund.processedAtIso ?? null),
      updatedAtIso: nowIso,
      reason: parsed.reason ?? refund.reason,
    };

    const saved = await this.financeStore.updateRefund(refundId, updated);
    if (!saved) {
      throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Refund approval failed to persist');
    }
    return saved;
  }

  calculateRestaurantSettlement(params: {
    itemSubtotalPaise: number;
    packagingPaise: number;
    platformCommissionRatePercent: number;
    merchantDiscountPaise: number;
    taxPaise: number;
  }): number {
    const itemSubtotalPaise = params.itemSubtotalPaise;
    const packagingPaise = params.packagingPaise;
    const commissionPaise = FinanceService.calculateCommissionPaise(
      itemSubtotalPaise + packagingPaise,
      params.platformCommissionRatePercent,
    );
    const netPayable =
      itemSubtotalPaise +
      packagingPaise -
      commissionPaise -
      params.merchantDiscountPaise +
      params.taxPaise;
    FinanceService.assertPaiseCurrency(netPayable, 'restaurant settlement');
    return netPayable;
  }

  createPartnerEarningsRecord(rawInput: unknown): Promise<PartnerEarningsRecord> {
    const input = createPartnerEarningsSchema.parse(rawInput) as CreatePartnerEarningsInput;
    const totalPaise =
      input.basePayPaise +
      input.distancePayPaise +
      input.tipPaise +
      input.incentivePaise -
      input.taxPaise;
    const record: PartnerEarningsRecord = {
      earningId: crypto.randomUUID(),
      partnerId: input.partnerId,
      orderId: input.orderId,
      basePayPaise: input.basePayPaise,
      distancePayPaise: input.distancePayPaise,
      tipPaise: input.tipPaise,
      incentivePaise: input.incentivePaise,
      totalPaise,
      taxPaise: input.taxPaise,
      status: input.status,
      createdAtIso: this.clock.now().toISOString(),
    };
    return this.financeStore.createPartnerEarnings(record);
  }

  async createSettlementBatch(
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
    rawInput: unknown,
  ): Promise<SettlementBatchRecord> {
    if (!hasPermissionForRole(actorRole, 'finance:settlement:read')) {
      throw new AppError(403, 'FORBIDDEN', `Role ${actorRole} lacks finance:settlement:read`);
    }
    assertMfaSatisfiedForRole(actorRole, mfaVerified);

    const input = createSettlementBatchSchema.parse(rawInput) as CreateSettlementBatchInput;
    const totalPaise = input.payoutRecords.reduce((sum, record) => sum + record.amountPaise, 0);
    FinanceService.assertPaiseCurrency(totalPaise, 'batch totalPaise');

    const batch: SettlementBatchRecord = {
      batchId: crypto.randomUUID(),
      batchName: input.batchName,
      periodStartIso: input.periodStartIso,
      periodEndIso: input.periodEndIso,
      provider: input.provider,
      status: 'PENDING',
      totalPaise,
      payoutRecords: input.payoutRecords.map((payout) => ({
        ...payout,
        amountPaise: Number(payout.amountPaise),
      })),
      createdAtIso: this.clock.now().toISOString(),
      updatedAtIso: this.clock.now().toISOString(),
      providerReference: null,
    };

    const saved = await this.financeStore.createSettlementBatch(batch);
    const ledger = this.createLedgerEntryRecord({
      entryType: 'PAYOUT',
      entityId: saved.batchId,
      amountPaise: saved.totalPaise,
      description: `Settlement batch ${saved.batchName} dispatched to ${saved.provider}`,
    });
    void ledger;
    return saved;
  }

  async createPayoutReconciliation(
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
    rawInput: unknown,
  ): Promise<PayoutReconciliationRecord> {
    if (!hasPermissionForRole(actorRole, 'finance:settlement:read')) {
      throw new AppError(403, 'FORBIDDEN', `Role ${actorRole} lacks finance:settlement:read`);
    }
    assertMfaSatisfiedForRole(actorRole, mfaVerified);

    const input = createPayoutReconciliationSchema.parse(
      rawInput,
    ) as CreatePayoutReconciliationInput;
    const discrepancyPaise = FinanceService.calculateDiscrepancyPaise(
      input.expectedPaise,
      input.actualPaise,
    );
    const status: PayoutReconciliationRecord['status'] =
      discrepancyPaise === 0 ? 'MATCHED' : 'DISCREPANT';

    const record: PayoutReconciliationRecord = {
      reconciliationId: crypto.randomUUID(),
      batchId: input.batchId,
      providerReference: input.providerReference,
      expectedPaise: input.expectedPaise,
      actualPaise: input.actualPaise,
      discrepancyPaise,
      status,
      createdAtIso: this.clock.now().toISOString(),
      resolvedAtIso: null,
    };

    return this.financeStore.createReconciliation(record);
  }

  createLedgerEntryRecord(rawInput: unknown): Promise<LedgerEntryRecord> {
    const input = createLedgerEntrySchema.parse(rawInput) as CreateLedgerEntryInput;
    FinanceService.assertPaiseCurrency(input.amountPaise, 'ledger amountPaise');
    const record: LedgerEntryRecord = {
      ledgerId: crypto.randomUUID(),
      entryType: input.entryType,
      entityId: input.entityId,
      amountPaise: input.amountPaise,
      description: input.description,
      createdAtIso: this.clock.now().toISOString(),
    };
    return this.financeStore.createLedgerEntry(record);
  }

  async listLedgerEntries(): Promise<LedgerEntryRecord[]> {
    return this.financeStore.listLedgerEntries();
  }

  async listSettlementBatches(): Promise<SettlementBatchRecord[]> {
    return this.financeStore.listSettlementBatches();
  }

  async listPendingRefunds(): Promise<RefundRecord[]> {
    const refunds = await this.financeStore.listRefunds();
    return refunds.filter(
      (refund) => refund.status === 'REQUESTED' || refund.status === 'UNDER_REVIEW',
    );
  }
}
