export const REFUND_STATUSES = [
  'REQUESTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const SETTLEMENT_BATCH_STATUSES = [
  'PENDING',
  'DISPATCHED',
  'SETTLED',
  'RECONCILED',
] as const;

export type SettlementBatchStatus = (typeof SETTLEMENT_BATCH_STATUSES)[number];

export const LEDGER_ENTRY_TYPES = [
  'REFUND',
  'COMMISSION',
  'DELIVERY_EARNINGS',
  'PAYOUT',
  'TAX',
  'DISCOUNT',
] as const;

export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];

export interface RefundRecordDto {
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

export interface SettlementBatchPayoutDto {
  outletId: string;
  outletName: string;
  amountPaise: number;
}

export interface SettlementBatchDto {
  batchId: string;
  batchName: string;
  periodStartIso: string;
  periodEndIso: string;
  provider: 'BANK' | 'RUPAY' | 'UPI' | 'STRIPE';
  status: SettlementBatchStatus;
  totalPaise: number;
  payoutRecords: SettlementBatchPayoutDto[];
  createdAtIso: string;
  updatedAtIso: string;
  providerReference?: string | null;
}

export interface PartnerEarningsRecordDto {
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

export interface PayoutReconciliationDto {
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

export interface LedgerEntryDto {
  ledgerId: string;
  entryType: LedgerEntryType;
  entityId: string;
  amountPaise: number;
  description: string;
  createdAtIso: string;
}
