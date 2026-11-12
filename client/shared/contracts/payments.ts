export const PAYMENT_PROVIDERS = ['SANDBOX_RAZORPAY', 'SANDBOX_CASHFREE'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_METHODS = ['UPI', 'CARD', 'NETBANKING'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'CREATED',
  'PENDING',
  'UNKNOWN',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_EVENT_TYPES = [
  'ATTEMPT_CREATED',
  'PROVIDER_SESSION_ISSUED',
  'WEBHOOK_RECEIVED',
  'PAYMENT_CAPTURED',
  'PAYMENT_FAILED',
  'STATUS_UNKNOWN',
  'RECONCILED_CAPTURED',
  'RECONCILED_FAILED',
  'LATE_WEBHOOK_APPLIED',
  'LATE_WEBHOOK_IGNORED',
] as const;
export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

export const RECONCILIATION_STATUSES = [
  'OPEN_UNKNOWN',
  'RECONCILED_CAPTURED',
  'RECONCILED_FAILED',
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

export type SandboxScenario =
  | 'AUTO_CAPTURE'
  | 'PENDING_WEBHOOK'
  | 'UNKNOWN_RECOVER_CAPTURE'
  | 'UNKNOWN_RECOVER_FAIL'
  | 'DECLINED';

export interface PaymentInstrumentSummaryDto {
  method: PaymentMethod;
  upiVpaMasked: string | null;
  cardNetwork: 'VISA' | 'MASTERCARD' | 'RUPAY' | null;
  cardLast4: string | null;
  bankCode: string | null;
  tokenReference: string | null;
}

export interface PaymentAttemptDto {
  paymentId: string;
  customerId: string;
  quoteId: string;
  outletId: string;
  orderReference: string | null;
  provider: PaymentProvider;
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: number;
  amountFormattedInr: string;
  currency: 'INR';
  status: PaymentStatus;
  attemptNumber: number;
  method: PaymentMethod;
  instrumentSummary: PaymentInstrumentSummaryDto;
  sandboxCheckoutSessionId: string;
  failureReason: string | null;
  lastWebhookEventId: string | null;
  reconciliationRequired: boolean;
  capturedAtIso: string | null;
  failedAtIso: string | null;
  reconciledAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface PaymentEventDto {
  eventId: string;
  paymentId: string;
  provider: PaymentProvider;
  providerEventId: string | null;
  eventType: PaymentEventType;
  previousStatus: PaymentStatus | null;
  newStatus: PaymentStatus;
  payloadSummary: string;
  occurredAtIso: string;
}

export interface CreatePaymentIntentRequestDto {
  quoteId: string;
  provider?: PaymentProvider;
  method: PaymentMethod;
  tokenReference?: string;
  upiHandleHint?: string;
  cardLast4Hint?: string;
  cardNetwork?: 'VISA' | 'MASTERCARD' | 'RUPAY';
  bankCode?: string;
  sandboxScenario?: SandboxScenario;
}

export interface PaymentCreateResponseDto {
  idempotentReplay: boolean;
  payment: PaymentAttemptDto;
  quoteSummary: {
    quoteId: string;
    outletId: string;
    outlet?: {
      outletId: string;
      name: string;
      brandName: string;
    };
    totalPayablePaise: number;
  };
  events: PaymentEventDto[];
  securityNotice: string;
}

export interface WebhookProcessingResultDto {
  accepted: boolean;
  deduplicated: boolean;
  lateEventAction: 'NONE' | 'APPLIED' | 'IGNORED_TERMINAL';
  provider: PaymentProvider;
  providerEventId: string;
  paymentId: string;
  previousStatus: PaymentStatus;
  currentStatus: PaymentStatus;
}

export interface ReconciliationRecordDto {
  reconciliationId: string;
  paymentId: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  previousStatus: PaymentStatus;
  resolvedStatus: PaymentStatus;
  status: ReconciliationStatus;
  reason: string;
  checkedByUserId: string | null;
  createdAtIso: string;
  resolvedAtIso: string | null;
}

export interface ReconcilePaymentResultDto {
  payment: PaymentAttemptDto;
  reconciliation: ReconciliationRecordDto;
  events: PaymentEventDto[];
}
