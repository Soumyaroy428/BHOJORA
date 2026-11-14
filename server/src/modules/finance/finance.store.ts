import type { Connection, Model } from 'mongoose';
import { Schema, model, models } from 'mongoose';
import type { LedgerEntryType, RefundStatus, SettlementBatchStatus } from './finance.types';

export interface RefundRecord {
  refundId: string;
  paymentId: string;
  orderId: string;
  customerId: string;
  amountPaise: number;
  reason: string;
  externalReasonCode?: string | null;
  status: RefundStatus;
  idempotencyKey: string;
  createdAtIso: string;
  updatedAtIso: string;
  reviewedByUserId?: string | null;
  reviewedAtIso?: string | null;
  approvedAtIso?: string | null;
  processedAtIso?: string | null;
}

export interface SettlementBatchRecord {
  batchId: string;
  batchName: string;
  periodStartIso: string;
  periodEndIso: string;
  provider: 'BANK' | 'RUPAY' | 'UPI' | 'STRIPE';
  status: SettlementBatchStatus;
  totalPaise: number;
  payoutRecords: Array<{ outletId: string; outletName: string; amountPaise: number }>;
  createdAtIso: string;
  updatedAtIso: string;
  providerReference?: string | null;
}

export interface PartnerEarningsRecord {
  earningId: string;
  partnerId: string;
  orderId: string;
  basePayPaise: number;
  distancePayPaise: number;
  tipPaise: number;
  incentivePaise: number;
  totalPaise: number;
  taxPaise: number;
  status: 'POSTED' | 'PAID';
  createdAtIso: string;
}

export interface LedgerEntryRecord {
  ledgerId: string;
  entryType: LedgerEntryType;
  entityId: string;
  amountPaise: number;
  description: string;
  createdAtIso: string;
}

export interface PayoutReconciliationRecord {
  reconciliationId: string;
  batchId: string;
  providerReference: string;
  expectedPaise: number;
  actualPaise: number;
  discrepancyPaise: number;
  status: 'PENDING' | 'MATCHED' | 'DISCREPANT';
  createdAtIso: string;
  resolvedAtIso?: string | null;
}

export interface FinanceStore {
  createRefund(record: RefundRecord): Promise<RefundRecord>;
  getRefundById(refundId: string): Promise<RefundRecord | null>;
  getRefundByPaymentId(paymentId: string): Promise<RefundRecord | null>;
  listRefunds(): Promise<RefundRecord[]>;
  updateRefund(refundId: string, patch: Partial<RefundRecord>): Promise<RefundRecord | null>;

  createSettlementBatch(record: SettlementBatchRecord): Promise<SettlementBatchRecord>;
  listSettlementBatches(): Promise<SettlementBatchRecord[]>;
  getSettlementBatchById(batchId: string): Promise<SettlementBatchRecord | null>;

  createPartnerEarnings(record: PartnerEarningsRecord): Promise<PartnerEarningsRecord>;
  listPartnerEarnings(): Promise<PartnerEarningsRecord[]>;

  createLedgerEntry(record: LedgerEntryRecord): Promise<LedgerEntryRecord>;
  listLedgerEntries(): Promise<LedgerEntryRecord[]>;

  createReconciliation(record: PayoutReconciliationRecord): Promise<PayoutReconciliationRecord>;
  listReconciliations(): Promise<PayoutReconciliationRecord[]>;
}

export class InMemoryFinanceStore implements FinanceStore {
  private readonly refunds = new Map<string, RefundRecord>();
  private readonly settlementBatches = new Map<string, SettlementBatchRecord>();
  private readonly partnerEarnings = new Map<string, PartnerEarningsRecord>();
  private readonly ledgerEntries = new Map<string, LedgerEntryRecord>();
  private readonly reconciliations = new Map<string, PayoutReconciliationRecord>();

  async createRefund(record: RefundRecord): Promise<RefundRecord> {
    this.refunds.set(record.refundId, { ...record });
    return { ...record };
  }

  async getRefundById(refundId: string): Promise<RefundRecord | null> {
    const found = this.refunds.get(refundId);
    return found ? { ...found } : null;
  }

  async getRefundByPaymentId(paymentId: string): Promise<RefundRecord | null> {
    for (const refund of this.refunds.values()) {
      if (refund.paymentId === paymentId) {
        return { ...refund };
      }
    }
    return null;
  }

  async listRefunds(): Promise<RefundRecord[]> {
    return Array.from(this.refunds.values()).map((refund) => ({ ...refund }));
  }

  async updateRefund(refundId: string, patch: Partial<RefundRecord>): Promise<RefundRecord | null> {
    const existing = this.refunds.get(refundId);
    if (!existing) {
      return null;
    }
    const updated: RefundRecord = { ...existing, ...patch, updatedAtIso: new Date().toISOString() };
    this.refunds.set(refundId, updated);
    return { ...updated };
  }

  async createSettlementBatch(record: SettlementBatchRecord): Promise<SettlementBatchRecord> {
    this.settlementBatches.set(record.batchId, { ...record });
    return { ...record };
  }

  async listSettlementBatches(): Promise<SettlementBatchRecord[]> {
    return Array.from(this.settlementBatches.values()).map((batch) => ({ ...batch }));
  }

  async getSettlementBatchById(batchId: string): Promise<SettlementBatchRecord | null> {
    const found = this.settlementBatches.get(batchId);
    return found ? { ...found } : null;
  }

  async createPartnerEarnings(record: PartnerEarningsRecord): Promise<PartnerEarningsRecord> {
    this.partnerEarnings.set(record.earningId, { ...record });
    return { ...record };
  }

  async listPartnerEarnings(): Promise<PartnerEarningsRecord[]> {
    return Array.from(this.partnerEarnings.values()).map((earning) => ({ ...earning }));
  }

  async createLedgerEntry(record: LedgerEntryRecord): Promise<LedgerEntryRecord> {
    this.ledgerEntries.set(record.ledgerId, { ...record });
    return { ...record };
  }

  async listLedgerEntries(): Promise<LedgerEntryRecord[]> {
    return Array.from(this.ledgerEntries.values()).map((entry) => ({ ...entry }));
  }

  async createReconciliation(
    record: PayoutReconciliationRecord,
  ): Promise<PayoutReconciliationRecord> {
    this.reconciliations.set(record.reconciliationId, { ...record });
    return { ...record };
  }

  async listReconciliations(): Promise<PayoutReconciliationRecord[]> {
    return Array.from(this.reconciliations.values()).map((record) => ({ ...record }));
  }
}

type FinanceRefundDocument = RefundRecord & { _id?: unknown };
type FinanceSettlementBatchDocument = SettlementBatchRecord & { _id?: unknown };
type FinancePartnerEarningsDocument = PartnerEarningsRecord & { _id?: unknown };
type FinanceLedgerEntryDocument = LedgerEntryRecord & { _id?: unknown };
type FinanceReconciliationDocument = PayoutReconciliationRecord & { _id?: unknown };

export class MongooseFinanceStore implements FinanceStore {
  private readonly refundModel: Model<FinanceRefundDocument>;
  private readonly settlementBatchModel: Model<FinanceSettlementBatchDocument>;
  private readonly partnerEarningsModel: Model<FinancePartnerEarningsDocument>;
  private readonly ledgerEntryModel: Model<FinanceLedgerEntryDocument>;
  private readonly reconciliationModel: Model<FinanceReconciliationDocument>;

  constructor(_connection: Connection) {
    const refundSchema = new Schema(
      {
        refundId: { type: String, required: true },
        paymentId: { type: String, required: true },
        orderId: { type: String, required: true },
        customerId: { type: String, required: true },
        amountPaise: { type: Number, required: true },
        reason: { type: String, required: true },
        externalReasonCode: { type: String, default: null },
        status: { type: String, required: true },
        idempotencyKey: { type: String, required: true },
        createdAtIso: { type: String, required: true },
        updatedAtIso: { type: String, required: true },
        reviewedByUserId: { type: String, default: null },
        reviewedAtIso: { type: String, default: null },
        approvedAtIso: { type: String, default: null },
        processedAtIso: { type: String, default: null },
      },
      { collection: 'finance_refunds' },
    );

    const settlementBatchSchema = new Schema(
      {
        batchId: { type: String, required: true },
        batchName: { type: String, required: true },
        periodStartIso: { type: String, required: true },
        periodEndIso: { type: String, required: true },
        provider: { type: String, required: true },
        status: { type: String, required: true },
        totalPaise: { type: Number, required: true },
        payoutRecords: [{ outletId: String, outletName: String, amountPaise: Number }],
        createdAtIso: { type: String, required: true },
        updatedAtIso: { type: String, required: true },
        providerReference: { type: String, default: null },
      },
      { collection: 'finance_settlement_batches' },
    );

    const partnerSchema = new Schema(
      {
        earningId: { type: String, required: true },
        partnerId: { type: String, required: true },
        orderId: { type: String, required: true },
        basePayPaise: { type: Number, required: true },
        distancePayPaise: { type: Number, required: true },
        tipPaise: { type: Number, required: true },
        incentivePaise: { type: Number, required: true },
        totalPaise: { type: Number, required: true },
        taxPaise: { type: Number, required: true },
        status: { type: String, required: true },
        createdAtIso: { type: String, required: true },
      },
      { collection: 'finance_partner_earnings' },
    );

    const ledgerSchema = new Schema(
      {
        ledgerId: { type: String, required: true },
        entryType: { type: String, required: true },
        entityId: { type: String, required: true },
        amountPaise: { type: Number, required: true },
        description: { type: String, required: true },
        createdAtIso: { type: String, required: true },
      },
      { collection: 'finance_ledger_entries' },
    );

    const reconciliationSchema = new Schema(
      {
        reconciliationId: { type: String, required: true },
        batchId: { type: String, required: true },
        providerReference: { type: String, required: true },
        expectedPaise: { type: Number, required: true },
        actualPaise: { type: Number, required: true },
        discrepancyPaise: { type: Number, required: true },
        status: { type: String, required: true },
        createdAtIso: { type: String, required: true },
        resolvedAtIso: { type: String, default: null },
      },
      { collection: 'finance_payout_reconciliations' },
    );

    this.refundModel =
      (models.FinanceRefund as Model<FinanceRefundDocument> | undefined) ??
      model<FinanceRefundDocument>('FinanceRefund', refundSchema);
    this.settlementBatchModel =
      (models.FinanceSettlementBatch as Model<FinanceSettlementBatchDocument> | undefined) ??
      model<FinanceSettlementBatchDocument>('FinanceSettlementBatch', settlementBatchSchema);
    this.partnerEarningsModel =
      (models.FinancePartnerEarnings as Model<FinancePartnerEarningsDocument> | undefined) ??
      model<FinancePartnerEarningsDocument>('FinancePartnerEarnings', partnerSchema);
    this.ledgerEntryModel =
      (models.FinanceLedgerEntry as Model<FinanceLedgerEntryDocument> | undefined) ??
      model<FinanceLedgerEntryDocument>('FinanceLedgerEntry', ledgerSchema);
    this.reconciliationModel =
      (models.FinancePayoutReconciliation as Model<FinanceReconciliationDocument> | undefined) ??
      model<FinanceReconciliationDocument>('FinancePayoutReconciliation', reconciliationSchema);
  }

  async createRefund(record: RefundRecord): Promise<RefundRecord> {
    const created = await this.refundModel.create(record);
    return created.toObject() as FinanceRefundDocument;
  }

  async getRefundById(refundId: string): Promise<RefundRecord | null> {
    const found = await this.refundModel.findOne({ refundId }).lean();
    return found ? (found as RefundRecord) : null;
  }

  async getRefundByPaymentId(paymentId: string): Promise<RefundRecord | null> {
    const found = await this.refundModel.findOne({ paymentId }).lean();
    return found ? (found as RefundRecord) : null;
  }

  async listRefunds(): Promise<RefundRecord[]> {
    const docs = await this.refundModel.find({}).lean();
    return docs as RefundRecord[];
  }

  async updateRefund(refundId: string, patch: Partial<RefundRecord>): Promise<RefundRecord | null> {
    const updated = await this.refundModel.findOneAndUpdate({ refundId }, patch, { new: true });
    return updated ? (updated.toObject() as RefundRecord) : null;
  }

  async createSettlementBatch(record: SettlementBatchRecord): Promise<SettlementBatchRecord> {
    const created = await this.settlementBatchModel.create(record);
    return created.toObject() as SettlementBatchRecord;
  }

  async listSettlementBatches(): Promise<SettlementBatchRecord[]> {
    const docs = await this.settlementBatchModel.find({}).lean();
    return docs as SettlementBatchRecord[];
  }

  async getSettlementBatchById(batchId: string): Promise<SettlementBatchRecord | null> {
    const found = await this.settlementBatchModel.findOne({ batchId }).lean();
    return found ? (found as SettlementBatchRecord) : null;
  }

  async createPartnerEarnings(record: PartnerEarningsRecord): Promise<PartnerEarningsRecord> {
    const created = await this.partnerEarningsModel.create(record);
    return created.toObject() as PartnerEarningsRecord;
  }

  async listPartnerEarnings(): Promise<PartnerEarningsRecord[]> {
    const docs = await this.partnerEarningsModel.find({}).lean();
    return docs as PartnerEarningsRecord[];
  }

  async createLedgerEntry(record: LedgerEntryRecord): Promise<LedgerEntryRecord> {
    const created = await this.ledgerEntryModel.create(record);
    return created.toObject() as LedgerEntryRecord;
  }

  async listLedgerEntries(): Promise<LedgerEntryRecord[]> {
    const docs = await this.ledgerEntryModel.find({}).lean();
    return docs as LedgerEntryRecord[];
  }

  async createReconciliation(
    record: PayoutReconciliationRecord,
  ): Promise<PayoutReconciliationRecord> {
    const created = await this.reconciliationModel.create(record);
    return created.toObject() as PayoutReconciliationRecord;
  }

  async listReconciliations(): Promise<PayoutReconciliationRecord[]> {
    const docs = await this.reconciliationModel.find({}).lean();
    return docs as PayoutReconciliationRecord[];
  }
}
