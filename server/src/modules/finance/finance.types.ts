import { z } from 'zod';

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

export const createRefundRequestSchema = z
  .object({
    paymentId: z.string().trim().min(1, 'Payment ID is required'),
    orderId: z.string().trim().min(1, 'Order ID is required'),
    customerId: z.string().trim().min(1, 'Customer ID is required'),
    amountPaise: z.number().int().positive('Refund amount must be a positive integer paise value'),
    reason: z.string().trim().min(5, 'Reason must be at least 5 characters').max(500),
    externalReasonCode: z.string().trim().max(50).nullable().optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const approveRefundSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().min(3).max(500).optional(),
    reviewedByUserId: z.string().trim().min(1).optional(),
  })
  .strict();

export const createSettlementBatchSchema = z
  .object({
    batchName: z.string().trim().min(3).max(120),
    periodStartIso: z.string().datetime(),
    periodEndIso: z.string().datetime(),
    provider: z.enum(['BANK', 'RUPAY', 'UPI', 'STRIPE']),
    payoutRecords: z
      .array(
        z.object({
          outletId: z.string().trim().min(1),
          outletName: z.string().trim().min(1).max(120),
          amountPaise: z.number().int().nonnegative(),
        }),
      )
      .min(1),
  })
  .strict();

export const createPartnerEarningsSchema = z
  .object({
    partnerId: z.string().trim().min(1),
    orderId: z.string().trim().min(1),
    basePayPaise: z.number().int().nonnegative(),
    distancePayPaise: z.number().int().nonnegative(),
    tipPaise: z.number().int().nonnegative(),
    incentivePaise: z.number().int().nonnegative(),
    taxPaise: z.number().int().nonnegative(),
    status: z.enum(['POSTED', 'PAID']).optional().default('POSTED'),
  })
  .strict();

export const createPayoutReconciliationSchema = z
  .object({
    batchId: z.string().trim().min(1),
    providerReference: z.string().trim().min(1),
    expectedPaise: z.number().int().nonnegative(),
    actualPaise: z.number().int().nonnegative(),
  })
  .strict();

export const createLedgerEntrySchema = z
  .object({
    entryType: z.enum(LEDGER_ENTRY_TYPES),
    entityId: z.string().trim().min(1),
    amountPaise: z.number().int().nonnegative(),
    description: z.string().trim().min(1).max(500),
  })
  .strict();

export type CreateRefundRequestInput = z.infer<typeof createRefundRequestSchema>;
export type ApproveRefundInput = z.infer<typeof approveRefundSchema>;
export type CreateSettlementBatchInput = z.infer<typeof createSettlementBatchSchema>;
export type CreatePartnerEarningsInput = z.infer<typeof createPartnerEarningsSchema>;
export type CreatePayoutReconciliationInput = z.infer<typeof createPayoutReconciliationSchema>;
export type CreateLedgerEntryInput = z.infer<typeof createLedgerEntrySchema>;
