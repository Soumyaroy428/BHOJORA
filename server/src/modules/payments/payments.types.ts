import type {
  PaymentEventType,
  PaymentInstrumentSummaryDto,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  ReconciliationStatus,
  SandboxScenario,
} from '@bhojora/shared';

export const PAYMENT_PROVIDERS_RUNTIME = [
  'SANDBOX_RAZORPAY',
  'SANDBOX_CASHFREE',
] as const satisfies readonly PaymentProvider[];

export const PAYMENT_METHODS_RUNTIME = [
  'UPI',
  'CARD',
  'NETBANKING',
] as const satisfies readonly PaymentMethod[];

export const PAYMENT_STATUSES_RUNTIME = [
  'CREATED',
  'PENDING',
  'UNKNOWN',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
] as const satisfies readonly PaymentStatus[];

export const PAYMENT_EVENT_TYPES_RUNTIME = [
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
] as const satisfies readonly PaymentEventType[];

export const RECONCILIATION_STATUSES_RUNTIME = [
  'OPEN_UNKNOWN',
  'RECONCILED_CAPTURED',
  'RECONCILED_FAILED',
] as const satisfies readonly ReconciliationStatus[];

export const SANDBOX_SCENARIOS_RUNTIME = [
  'AUTO_CAPTURE',
  'PENDING_WEBHOOK',
  'UNKNOWN_RECOVER_CAPTURE',
  'UNKNOWN_RECOVER_FAIL',
  'DECLINED',
] as const satisfies readonly SandboxScenario[];

export const TERMINAL_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  'CAPTURED',
  'FAILED',
  'CANCELLED',
]);

export const FORBIDDEN_RAW_CARD_FIELDS = [
  'cardNumber',
  'card_number',
  'pan',
  'cardPan',
  'cvv',
  'cvc',
  'cvv2',
  'cardExpiry',
  'expiry',
  'expiryMonth',
  'expiryYear',
  'pin',
  'trackData',
  'rawCard',
] as const;

export const FORBIDDEN_CLIENT_PAYMENT_OVERRIDE_FIELDS = [
  'amountPaise',
  'totalPayablePaise',
  'status',
  'providerPaymentId',
  'providerOrderId',
  'capturedAt',
] as const;

export const ZERO_RAW_CARD_SECURITY_NOTICE =
  'Bhojora stores tokenized/masked payment references only; raw PAN, CVV, and expiry data are strictly rejected and never persisted (ADR-007).';

export const DEFAULT_WEBHOOK_REPLAY_WINDOW_SECONDS = 300;
export const IDEMPOTENCY_TTL_SECONDS = 86_400;

export interface PaymentRecord {
  paymentId: string;
  customerId: string;
  quoteId: string;
  outletId: string;
  orderReference: string | null;
  provider: PaymentProvider;
  providerOrderId: string;
  providerPaymentId: string;
  amountPaise: number;
  currency: 'INR';
  status: PaymentStatus;
  attemptNumber: number;
  method: PaymentMethod;
  instrumentSummary: PaymentInstrumentSummaryDto;
  sandboxCheckoutSessionId: string;
  sandboxScenario: SandboxScenario;
  failureReason: string | null;
  lastWebhookEventId: string | null;
  reconciliationRequired: boolean;
  capturedAt: Date | null;
  failedAt: Date | null;
  reconciledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentEventRecord {
  eventId: string;
  paymentId: string;
  provider: PaymentProvider;
  providerEventId: string | null;
  eventType: PaymentEventType;
  previousStatus: PaymentStatus | null;
  newStatus: PaymentStatus;
  payloadSummary: string;
  occurredAt: Date;
}

export interface IdempotencyKeyRecord {
  operation: string;
  key: string;
  actorId: string;
  requestHash: string;
  responseStatus: number;
  paymentId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface IntegrationWebhookEventRecord {
  webhookRecordId: string;
  provider: PaymentProvider;
  eventId: string;
  eventType: string;
  providerPaymentId: string;
  signatureVerified: boolean;
  payloadHash: string;
  receivedAt: Date;
}

export interface ReconciliationRecord {
  reconciliationId: string;
  paymentId: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  previousStatus: PaymentStatus;
  resolvedStatus: PaymentStatus;
  status: ReconciliationStatus;
  reason: string;
  checkedByUserId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface PaymentStore {
  createPayment(record: PaymentRecord): Promise<PaymentRecord>;
  getPaymentById(paymentId: string): Promise<PaymentRecord | null>;
  getPaymentByProviderPaymentId(
    provider: PaymentProvider,
    providerPaymentId: string,
  ): Promise<PaymentRecord | null>;
  listPaymentsByQuoteId(quoteId: string): Promise<PaymentRecord[]>;
  listPaymentsByCustomer(customerId: string): Promise<PaymentRecord[]>;
  listUnknownPayments(): Promise<PaymentRecord[]>;
  updatePaymentState(
    paymentId: string,
    patch: {
      status?: PaymentStatus;
      failureReason?: string | null;
      lastWebhookEventId?: string | null;
      reconciliationRequired?: boolean;
      capturedAt?: Date | null;
      failedAt?: Date | null;
      reconciledAt?: Date | null;
      updatedAt: Date;
    },
  ): Promise<PaymentRecord | null>;
  appendPaymentEvent(event: PaymentEventRecord): Promise<PaymentEventRecord>;
  listEventsForPayment(paymentId: string): Promise<PaymentEventRecord[]>;
  findIdempotencyKey(operation: string, key: string): Promise<IdempotencyKeyRecord | null>;
  saveIdempotencyKeyIfAbsent(
    record: IdempotencyKeyRecord,
  ): Promise<{ inserted: boolean; record: IdempotencyKeyRecord }>;
  recordWebhookEventIfNew(
    record: IntegrationWebhookEventRecord,
  ): Promise<{ inserted: boolean; record: IntegrationWebhookEventRecord }>;
  saveReconciliationRecord(record: ReconciliationRecord): Promise<ReconciliationRecord>;
  listReconciliationRecords(): Promise<ReconciliationRecord[]>;
}
