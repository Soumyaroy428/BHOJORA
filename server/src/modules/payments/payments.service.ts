import crypto from 'node:crypto';
import type {
  CreatePaymentIntentRequestDto,
  PaymentAttemptDto,
  PaymentCreateResponseDto,
  PaymentEventDto,
  PaymentEventType,
  PaymentInstrumentSummaryDto,
  PaymentProvider,
  PaymentStatus,
  ReconcilePaymentResultDto,
  ReconciliationRecordDto,
  WebhookProcessingResultDto,
} from '@bhojora/shared';
import { z } from 'zod';
import type { Logger } from '../../config/logger';
import { AppError } from '../../middleware/error-handler';
import { formatInrFromPaise } from '../catalog/catalog.types';
import { SYSTEM_CLOCK, type Clock, type UserRole } from '../identity/identity.types';
import type { PricingService } from '../pricing/pricing.service';
import { hasPermissionForRole } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import { SandboxPaymentGatewayAdapter, verifySandboxWebhookSignature } from './payments.adapter';
import {
  DEFAULT_WEBHOOK_REPLAY_WINDOW_SECONDS,
  FORBIDDEN_CLIENT_PAYMENT_OVERRIDE_FIELDS,
  FORBIDDEN_RAW_CARD_FIELDS,
  IDEMPOTENCY_TTL_SECONDS,
  PAYMENT_METHODS_RUNTIME,
  PAYMENT_PROVIDERS_RUNTIME,
  SANDBOX_SCENARIOS_RUNTIME,
  ZERO_RAW_CARD_SECURITY_NOTICE,
  type PaymentEventRecord,
  type PaymentRecord,
  type PaymentStore,
  type ReconciliationRecord,
} from './payments.types';

const createPaymentSchema = z
  .object({
    quoteId: z.string().trim().min(5).max(80),
    provider: z.enum(PAYMENT_PROVIDERS_RUNTIME).optional().default('SANDBOX_RAZORPAY'),
    method: z.enum(PAYMENT_METHODS_RUNTIME),
    tokenReference: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9_-]{6,64}$/, 'Invalid gateway token reference format')
      .optional(),
    upiHandleHint: z
      .string()
      .trim()
      .regex(/^[a-zA-Z0-9._-]{2,48}@[a-zA-Z]{2,24}$/, 'Invalid UPI VPA format')
      .optional(),
    cardLast4Hint: z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'cardLast4Hint must be exactly 4 digits')
      .optional(),
    cardNetwork: z.enum(['VISA', 'MASTERCARD', 'RUPAY']).optional(),
    bankCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_]{3,16}$/, 'Invalid bank code format')
      .optional(),
    sandboxScenario: z.enum(SANDBOX_SCENARIOS_RUNTIME).optional().default('AUTO_CAPTURE'),
  })
  .strict();

const verifyPaymentSchema = z
  .object({
    paymentId: z.string().trim().min(5).max(80),
    gatewayToken: z.string().trim().min(4).max(120).optional(),
  })
  .strict();

const webhookBodySchema = z
  .object({
    eventId: z.string().trim().min(4).max(120),
    eventType: z.enum(['payment.captured', 'payment.failed', 'payment.pending', 'payment.unknown']),
    providerPaymentId: z.string().trim().min(4).max(100),
    amountPaise: z.number().int().nonnegative(),
    reason: z.string().trim().max(240).optional(),
  })
  .strict();

function assertNoRawCardOrTamperFields(rawBody: unknown, logger: Logger, routeLabel: string): void {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return;
  }
  const obj = rawBody as Record<string, unknown>;
  const rawCardHits = FORBIDDEN_RAW_CARD_FIELDS.filter((key) =>
    Object.prototype.hasOwnProperty.call(obj, key),
  );
  if (rawCardHits.length > 0) {
    logger.warn('payments.security.raw_card_rejected', {
      route: routeLabel,
      rejectedFields: rawCardHits,
    });
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Raw card fields (${rawCardHits.join(', ')}) are strictly forbidden; submit tokenized references only (ZERO_RAW_CARD_DATA_POLICY)`,
    );
  }

  const overrideHits = FORBIDDEN_CLIENT_PAYMENT_OVERRIDE_FIELDS.filter((key) =>
    Object.prototype.hasOwnProperty.call(obj, key),
  );
  if (overrideHits.length > 0) {
    logger.warn('payments.security.client_override_rejected', {
      route: routeLabel,
      rejectedFields: overrideHits,
    });
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Client-supplied payment authority fields (${overrideHits.join(', ')}) are forbidden`,
    );
  }

  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === 'string') {
      const compactDigits = val.replace(/[\s-]/g, '');
      if (/^\d{13,19}$/.test(compactDigits)) {
        logger.warn('payments.security.pan_pattern_rejected', {
          route: routeLabel,
          field: key,
        });
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Field "${key}" resembles a raw card PAN and is rejected (ZERO_RAW_CARD_DATA_POLICY)`,
        );
      }
    }
  }
}

function maskUpiVpa(raw: string): string {
  const [userPart, handlePart] = raw.split('@');
  if (!userPart || !handlePart) {
    return '***@upi';
  }
  const visiblePrefix = userPart.slice(0, Math.min(2, userPart.length));
  return `${visiblePrefix}***@${handlePart}`;
}

function buildInstrumentSummary(
  parsed: z.infer<typeof createPaymentSchema>,
): PaymentInstrumentSummaryDto {
  const tokenReference =
    parsed.tokenReference ?? `tok_sbx_${crypto.randomBytes(6).toString('hex')}`;
  if (parsed.method === 'UPI') {
    return {
      method: 'UPI',
      upiVpaMasked: parsed.upiHandleHint ? maskUpiVpa(parsed.upiHandleHint) : 'cu***@okicici',
      cardNetwork: null,
      cardLast4: null,
      bankCode: null,
      tokenReference,
    };
  }
  if (parsed.method === 'CARD') {
    return {
      method: 'CARD',
      upiVpaMasked: null,
      cardNetwork: parsed.cardNetwork ?? 'VISA',
      cardLast4: parsed.cardLast4Hint ?? '4242',
      bankCode: null,
      tokenReference,
    };
  }
  return {
    method: 'NETBANKING',
    upiVpaMasked: null,
    cardNetwork: null,
    cardLast4: null,
    bankCode: parsed.bankCode ?? 'HDFC',
    tokenReference,
  };
}

function normalizeIdempotencyKey(rawHeader: string | string[] | undefined): string {
  const value = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader)?.trim() ?? '';
  if (!/^[A-Za-z0-9_.:-]{8,128}$/.test(value)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Missing or invalid Idempotency-Key header (must be 8-128 characters matching [A-Za-z0-9_.:-])',
    );
  }
  return value;
}

function extractHeaderString(
  headers: Record<string, string | string[] | undefined>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const raw = headers[key] ?? headers[key.toLowerCase()];
    const str = Array.isArray(raw) ? raw[0] : raw;
    if (typeof str === 'string' && str.trim().length > 0) {
      return str.trim();
    }
  }
  return '';
}

function stableCreateRequestHash(payload: z.infer<typeof createPaymentSchema>): string {
  const canonical = JSON.stringify({
    quoteId: payload.quoteId,
    provider: payload.provider,
    method: payload.method,
    tokenReference: payload.tokenReference ?? null,
    upiHandleHint: payload.upiHandleHint ?? null,
    cardLast4Hint: payload.cardLast4Hint ?? null,
    cardNetwork: payload.cardNetwork ?? null,
    bankCode: payload.bankCode ?? null,
    sandboxScenario: payload.sandboxScenario,
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export interface PaymentServiceOptions {
  paymentStore: PaymentStore;
  pricingService: PricingService;
  gatewayAdapter?: SandboxPaymentGatewayAdapter;
  rbacStore?: RbacStore;
  webhookSecret: string;
  webhookReplayWindowSeconds?: number;
  logger: Logger;
  clock?: Clock;
}

export class PaymentService {
  private readonly paymentStore: PaymentStore;
  private readonly pricingService: PricingService;
  private readonly gatewayAdapter: SandboxPaymentGatewayAdapter;
  private readonly rbacStore?: RbacStore;
  private readonly webhookSecret: string;
  private readonly replayWindowSeconds: number;
  private readonly logger: Logger;
  private readonly clock: Clock;

  constructor(options: PaymentServiceOptions) {
    this.paymentStore = options.paymentStore;
    this.pricingService = options.pricingService;
    this.gatewayAdapter = options.gatewayAdapter ?? new SandboxPaymentGatewayAdapter();
    this.rbacStore = options.rbacStore;
    this.webhookSecret = options.webhookSecret;
    this.replayWindowSeconds =
      options.webhookReplayWindowSeconds ?? DEFAULT_WEBHOOK_REPLAY_WINDOW_SECONDS;
    this.logger = options.logger;
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  getGatewayAdapter(): SandboxPaymentGatewayAdapter {
    return this.gatewayAdapter;
  }

  private toPaymentDto(record: PaymentRecord): PaymentAttemptDto {
    return {
      paymentId: record.paymentId,
      customerId: record.customerId,
      quoteId: record.quoteId,
      outletId: record.outletId,
      orderReference: record.orderReference,
      provider: record.provider,
      providerOrderId: record.providerOrderId,
      providerPaymentId: record.providerPaymentId,
      amountPaise: record.amountPaise,
      amountFormattedInr: formatInrFromPaise(record.amountPaise),
      currency: record.currency,
      status: record.status,
      attemptNumber: record.attemptNumber,
      method: record.method,
      instrumentSummary: { ...record.instrumentSummary },
      sandboxCheckoutSessionId: record.sandboxCheckoutSessionId,
      failureReason: record.failureReason,
      lastWebhookEventId: record.lastWebhookEventId,
      reconciliationRequired: record.reconciliationRequired,
      capturedAtIso: record.capturedAt ? record.capturedAt.toISOString() : null,
      failedAtIso: record.failedAt ? record.failedAt.toISOString() : null,
      reconciledAtIso: record.reconciledAt ? record.reconciledAt.toISOString() : null,
      createdAtIso: record.createdAt.toISOString(),
      updatedAtIso: record.updatedAt.toISOString(),
    };
  }

  private toEventDto(record: PaymentEventRecord): PaymentEventDto {
    return {
      eventId: record.eventId,
      paymentId: record.paymentId,
      provider: record.provider,
      providerEventId: record.providerEventId,
      eventType: record.eventType,
      previousStatus: record.previousStatus,
      newStatus: record.newStatus,
      payloadSummary: record.payloadSummary,
      occurredAtIso: record.occurredAt.toISOString(),
    };
  }

  private toReconciliationDto(record: ReconciliationRecord): ReconciliationRecordDto {
    return {
      reconciliationId: record.reconciliationId,
      paymentId: record.paymentId,
      provider: record.provider,
      providerPaymentId: record.providerPaymentId,
      previousStatus: record.previousStatus,
      resolvedStatus: record.resolvedStatus,
      status: record.status,
      reason: record.reason,
      checkedByUserId: record.checkedByUserId,
      createdAtIso: record.createdAt.toISOString(),
      resolvedAtIso: record.resolvedAt ? record.resolvedAt.toISOString() : null,
    };
  }

  async createPaymentAttempt(
    customerId: string,
    idempotencyKeyHeader: string | string[] | undefined,
    rawBody: unknown,
    _requestId = 'unknown-request',
  ): Promise<{ httpStatus: 200 | 201; result: PaymentCreateResponseDto }> {
    const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyHeader);
    assertNoRawCardOrTamperFields(rawBody, this.logger, 'POST /payments/create');
    const parsed = createPaymentSchema.parse(rawBody as CreatePaymentIntentRequestDto);
    const requestHash = stableCreateRequestHash(parsed);
    const now = this.clock.now();

    const existingIdem = await this.paymentStore.findIdempotencyKey(
      'payments.create',
      idempotencyKey,
    );
    if (existingIdem && existingIdem.expiresAt.getTime() > now.getTime()) {
      if (existingIdem.actorId !== customerId || existingIdem.requestHash !== requestHash) {
        throw new AppError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'Idempotency-Key was already used with a different payload or actor',
        );
      }
      const existingPayment = await this.paymentStore.getPaymentById(existingIdem.paymentId);
      if (existingPayment) {
        const events = await this.paymentStore.listEventsForPayment(existingPayment.paymentId);
        return {
          httpStatus: 200,
          result: {
            idempotentReplay: true,
            payment: this.toPaymentDto(existingPayment),
            quoteSummary: {
              quoteId: existingPayment.quoteId,
              outletId: existingPayment.outletId,
              totalPayablePaise: existingPayment.amountPaise,
            },
            events: events.map((e) => this.toEventDto(e)),
            securityNotice: ZERO_RAW_CARD_SECURITY_NOTICE,
          },
        };
      }
    }

    const verified = await this.pricingService.verifyQuoteForCheckout(customerId, parsed.quoteId);
    const { quote } = verified;

    const priorQuoteAttempts = await this.paymentStore.listPaymentsByQuoteId(quote.quoteId);
    if (priorQuoteAttempts.some((p) => p.status === 'CAPTURED')) {
      throw new AppError(
        409,
        'CONFLICT',
        `Quote "${quote.quoteId}" already has a captured payment attempt`,
      );
    }

    const paymentId = `pay_${crypto.randomUUID()}`;
    const gatewaySession = await this.gatewayAdapter.createSession({
      paymentId,
      provider: parsed.provider,
      amountPaise: quote.pricingBreakdown.totalPayablePaise,
      currency: 'INR',
      quoteId: quote.quoteId,
      customerId,
      sandboxScenario: parsed.sandboxScenario,
    });

    const record: PaymentRecord = {
      paymentId,
      customerId,
      quoteId: quote.quoteId,
      outletId: quote.outletId,
      orderReference: null,
      provider: gatewaySession.provider,
      providerOrderId: gatewaySession.providerOrderId,
      providerPaymentId: gatewaySession.providerPaymentId,
      amountPaise: quote.pricingBreakdown.totalPayablePaise,
      currency: 'INR',
      status: gatewaySession.initialStatus,
      attemptNumber: priorQuoteAttempts.length + 1,
      method: parsed.method,
      instrumentSummary: buildInstrumentSummary(parsed),
      sandboxCheckoutSessionId: gatewaySession.sandboxCheckoutSessionId,
      sandboxScenario: parsed.sandboxScenario,
      failureReason: gatewaySession.failureReason,
      lastWebhookEventId: null,
      reconciliationRequired: gatewaySession.reconciliationRequired,
      capturedAt: null,
      failedAt: gatewaySession.initialStatus === 'FAILED' ? now : null,
      reconciledAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const savedPayment = await this.paymentStore.createPayment(record);

    const createdEvent = await this.paymentStore.appendPaymentEvent({
      eventId: `pevt_${crypto.randomUUID()}`,
      paymentId: savedPayment.paymentId,
      provider: savedPayment.provider,
      providerEventId: null,
      eventType: 'ATTEMPT_CREATED',
      previousStatus: null,
      newStatus: 'CREATED',
      payloadSummary: `Created attempt #${savedPayment.attemptNumber} for quote ${savedPayment.quoteId} (${savedPayment.amountPaise} paise)`,
      occurredAt: now,
    });

    const secondEventType: PaymentEventType =
      savedPayment.status === 'UNKNOWN'
        ? 'STATUS_UNKNOWN'
        : savedPayment.status === 'FAILED'
          ? 'PAYMENT_FAILED'
          : 'PROVIDER_SESSION_ISSUED';

    const secondEvent = await this.paymentStore.appendPaymentEvent({
      eventId: `pevt_${crypto.randomUUID()}`,
      paymentId: savedPayment.paymentId,
      provider: savedPayment.provider,
      providerEventId: null,
      eventType: secondEventType,
      previousStatus: 'CREATED',
      newStatus: savedPayment.status,
      payloadSummary:
        savedPayment.failureReason ??
        `Sandbox session ${savedPayment.sandboxCheckoutSessionId} initialized (${savedPayment.status})`,
      occurredAt: new Date(now.getTime() + 1),
    });

    if (savedPayment.status === 'UNKNOWN') {
      await this.paymentStore.saveReconciliationRecord({
        reconciliationId: `rec_${crypto.randomUUID()}`,
        paymentId: savedPayment.paymentId,
        provider: savedPayment.provider,
        providerPaymentId: savedPayment.providerPaymentId,
        previousStatus: 'UNKNOWN',
        resolvedStatus: 'UNKNOWN',
        status: 'OPEN_UNKNOWN',
        reason: 'Gateway timeout during session initialization',
        checkedByUserId: null,
        createdAt: now,
        resolvedAt: null,
      });
    }

    await this.paymentStore.saveIdempotencyKeyIfAbsent({
      operation: 'payments.create',
      key: idempotencyKey,
      actorId: customerId,
      requestHash,
      responseStatus: 201,
      paymentId: savedPayment.paymentId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_SECONDS * 1000),
    });

    this.logger.info('payments.attempt.created', {
      paymentId: savedPayment.paymentId,
      customerId,
      quoteId: savedPayment.quoteId,
      provider: savedPayment.provider,
      status: savedPayment.status,
      amountPaise: savedPayment.amountPaise,
    });

    return {
      httpStatus: 201,
      result: {
        idempotentReplay: false,
        payment: this.toPaymentDto(savedPayment),
        quoteSummary: {
          quoteId: quote.quoteId,
          outletId: quote.outletId,
          outlet: {
            outletId: quote.outletId,
            name: quote.outletName,
            brandName: quote.brandName,
          },
          totalPayablePaise: quote.pricingBreakdown.totalPayablePaise,
        },
        events: [this.toEventDto(createdEvent), this.toEventDto(secondEvent)],
        securityNotice: ZERO_RAW_CARD_SECURITY_NOTICE,
      },
    };
  }

  async getPaymentForActor(
    paymentId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId = 'unknown-request',
  ): Promise<{ payment: PaymentAttemptDto; events: PaymentEventDto[] }> {
    const payment = await this.paymentStore.getPaymentById(paymentId);
    if (!payment) {
      throw new AppError(404, 'NOT_FOUND', `Payment "${paymentId}" not found`);
    }
    const isFinanceReader = hasPermissionForRole(actorRole, 'finance:settlement:read');
    if (payment.customerId !== actorUserId && !isFinanceReader) {
      if (this.rbacStore) {
        await this.rbacStore.appendAuditLog({
          actorId: actorUserId,
          actorRole,
          action: 'payments.read',
          resourceType: 'payment',
          resourceId: paymentId,
          outcome: 'DENIED',
          reason: 'Cross-customer payment IDOR blocked',
          requestId,
        });
      }
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this payment attempt');
    }

    const events = await this.paymentStore.listEventsForPayment(payment.paymentId);
    return {
      payment: this.toPaymentDto(payment),
      events: events.map((e) => this.toEventDto(e)),
    };
  }

  async listPaymentsForCustomer(customerId: string): Promise<PaymentAttemptDto[]> {
    const records = await this.paymentStore.listPaymentsByCustomer(customerId);
    return records.map((r) => this.toPaymentDto(r));
  }

  async verifyPaymentWithSandbox(
    customerId: string,
    rawBody: unknown,
  ): Promise<{ payment: PaymentAttemptDto; events: PaymentEventDto[] }> {
    assertNoRawCardOrTamperFields(rawBody, this.logger, 'POST /payments/verify');
    const parsed = verifyPaymentSchema.parse(rawBody);
    const payment = await this.paymentStore.getPaymentById(parsed.paymentId);
    if (!payment) {
      throw new AppError(404, 'NOT_FOUND', `Payment "${parsed.paymentId}" not found`);
    }
    if (payment.customerId !== customerId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to verify this payment');
    }

    if (payment.status === 'CAPTURED' || payment.status === 'FAILED') {
      const existingEvents = await this.paymentStore.listEventsForPayment(payment.paymentId);
      return {
        payment: this.toPaymentDto(payment),
        events: existingEvents.map((e) => this.toEventDto(e)),
      };
    }

    // Per PRD.md F05: browser callback never auto-trusts success; query gateway status first.
    const poll = await this.gatewayAdapter.fetchPaymentStatus(
      payment.provider,
      payment.providerPaymentId,
      payment.sandboxScenario,
    );
    const now = this.clock.now();

    if (poll.gatewayStatus === 'CAPTURED') {
      const updated =
        (await this.paymentStore.updatePaymentState(payment.paymentId, {
          status: 'CAPTURED',
          failureReason: null,
          reconciliationRequired: false,
          capturedAt: now,
          reconciledAt: payment.status === 'UNKNOWN' ? now : payment.reconciledAt,
          updatedAt: now,
        })) ?? payment;
      await this.paymentStore.appendPaymentEvent({
        eventId: `pevt_${crypto.randomUUID()}`,
        paymentId: payment.paymentId,
        provider: payment.provider,
        providerEventId: null,
        eventType: payment.status === 'UNKNOWN' ? 'RECONCILED_CAPTURED' : 'PAYMENT_CAPTURED',
        previousStatus: payment.status,
        newStatus: 'CAPTURED',
        payloadSummary: `Server-verified sandbox capture for ${payment.providerPaymentId}`,
        occurredAt: now,
      });
      const events = await this.paymentStore.listEventsForPayment(payment.paymentId);
      return {
        payment: this.toPaymentDto(updated),
        events: events.map((e) => this.toEventDto(e)),
      };
    }

    if (poll.gatewayStatus === 'FAILED') {
      const updated =
        (await this.paymentStore.updatePaymentState(payment.paymentId, {
          status: 'FAILED',
          failureReason: poll.failureReason ?? 'Sandbox verification failed',
          reconciliationRequired: false,
          failedAt: now,
          updatedAt: now,
        })) ?? payment;
      await this.paymentStore.appendPaymentEvent({
        eventId: `pevt_${crypto.randomUUID()}`,
        paymentId: payment.paymentId,
        provider: payment.provider,
        providerEventId: null,
        eventType: 'PAYMENT_FAILED',
        previousStatus: payment.status,
        newStatus: 'FAILED',
        payloadSummary: poll.failureReason ?? 'Sandbox payment declined',
        occurredAt: now,
      });
      const events = await this.paymentStore.listEventsForPayment(payment.paymentId);
      return {
        payment: this.toPaymentDto(updated),
        events: events.map((e) => this.toEventDto(e)),
      };
    }

    const events = await this.paymentStore.listEventsForPayment(payment.paymentId);
    return {
      payment: this.toPaymentDto(payment),
      events: events.map((e) => this.toEventDto(e)),
    };
  }

  async processSignedWebhook(
    providerParam: string,
    headers: Record<string, string | string[] | undefined>,
    rawBody: unknown,
    _requestId = 'unknown-request',
  ): Promise<WebhookProcessingResultDto> {
    const provider: PaymentProvider = this.gatewayAdapter.normalizeProviderParam(providerParam);

    const signature = extractHeaderString(headers, [
      'x-bhojora-signature',
      'x-razorpay-signature',
      'x-webhook-signature',
    ]);
    const timestampRaw = extractHeaderString(headers, ['x-webhook-timestamp']);

    if (!signature || !timestampRaw) {
      throw new AppError(
        401,
        'UNAUTHORIZED',
        'Missing signed webhook signature or timestamp header',
      );
    }

    const timestampSeconds = Number(timestampRaw);
    if (!Number.isSafeInteger(timestampSeconds) || timestampSeconds <= 0) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid webhook timestamp header');
    }

    const parsed = webhookBodySchema.parse(rawBody);
    const now = this.clock.now();
    const nowSeconds = Math.floor(now.getTime() / 1000);
    const ageSeconds = nowSeconds - timestampSeconds;

    if (ageSeconds > this.replayWindowSeconds || ageSeconds < -60) {
      this.logger.warn('payments.webhook.replay_window_rejected', {
        provider,
        eventId: parsed.eventId,
        ageSeconds,
        replayWindowSeconds: this.replayWindowSeconds,
      });
      throw new AppError(
        401,
        'UNAUTHORIZED',
        `Webhook timestamp outside allowed ${this.replayWindowSeconds}s replay window`,
      );
    }

    const validSignature = verifySandboxWebhookSignature(
      timestampSeconds,
      parsed,
      signature,
      this.webhookSecret,
    );
    if (!validSignature) {
      this.logger.warn('payments.webhook.invalid_signature', {
        provider,
        eventId: parsed.eventId,
      });
      throw new AppError(401, 'UNAUTHORIZED', 'Webhook HMAC-SHA256 signature verification failed');
    }

    const payment = await this.paymentStore.getPaymentByProviderPaymentId(
      provider,
      parsed.providerPaymentId,
    );
    if (!payment) {
      throw new AppError(
        404,
        'NOT_FOUND',
        `No payment found for ${provider} ref "${parsed.providerPaymentId}"`,
      );
    }

    if (parsed.amountPaise !== payment.amountPaise) {
      throw new AppError(
        409,
        'CONFLICT',
        `Webhook amount (${parsed.amountPaise} paise) mismatches authorized amount (${payment.amountPaise} paise)`,
      );
    }

    const payloadHash = crypto.createHash('sha256').update(JSON.stringify(parsed)).digest('hex');
    const dedupe = await this.paymentStore.recordWebhookEventIfNew({
      webhookRecordId: `whk_${crypto.randomUUID()}`,
      provider,
      eventId: parsed.eventId,
      eventType: parsed.eventType,
      providerPaymentId: parsed.providerPaymentId,
      signatureVerified: true,
      payloadHash,
      receivedAt: now,
    });

    if (!dedupe.inserted) {
      this.logger.info('payments.webhook.deduplicated', {
        provider,
        eventId: parsed.eventId,
        paymentId: payment.paymentId,
      });
      return {
        accepted: true,
        deduplicated: true,
        lateEventAction: 'NONE',
        provider,
        providerEventId: parsed.eventId,
        paymentId: payment.paymentId,
        previousStatus: payment.status,
        currentStatus: payment.status,
      };
    }

    const targetStatus: PaymentStatus =
      parsed.eventType === 'payment.captured'
        ? 'CAPTURED'
        : parsed.eventType === 'payment.failed'
          ? 'FAILED'
          : parsed.eventType === 'payment.unknown'
            ? 'UNKNOWN'
            : 'PENDING';

    // Handle late / out-of-order webhooks safely without corrupting terminal CAPTURED state
    if (payment.status === 'CAPTURED') {
      await this.paymentStore.appendPaymentEvent({
        eventId: `pevt_${crypto.randomUUID()}`,
        paymentId: payment.paymentId,
        provider,
        providerEventId: parsed.eventId,
        eventType: 'LATE_WEBHOOK_IGNORED',
        previousStatus: 'CAPTURED',
        newStatus: 'CAPTURED',
        payloadSummary: `Ignored late ${parsed.eventType} (${parsed.eventId}) because payment is already terminal CAPTURED`,
        occurredAt: now,
      });
      return {
        accepted: true,
        deduplicated: false,
        lateEventAction: 'IGNORED_TERMINAL',
        provider,
        providerEventId: parsed.eventId,
        paymentId: payment.paymentId,
        previousStatus: 'CAPTURED',
        currentStatus: 'CAPTURED',
      };
    }

    if (payment.status === 'FAILED' && targetStatus !== 'CAPTURED') {
      await this.paymentStore.appendPaymentEvent({
        eventId: `pevt_${crypto.randomUUID()}`,
        paymentId: payment.paymentId,
        provider,
        providerEventId: parsed.eventId,
        eventType: 'LATE_WEBHOOK_IGNORED',
        previousStatus: 'FAILED',
        newStatus: 'FAILED',
        payloadSummary: `Ignored late ${parsed.eventType} (${parsed.eventId}) while already FAILED`,
        occurredAt: now,
      });
      return {
        accepted: true,
        deduplicated: false,
        lateEventAction: 'IGNORED_TERMINAL',
        provider,
        providerEventId: parsed.eventId,
        paymentId: payment.paymentId,
        previousStatus: 'FAILED',
        currentStatus: 'FAILED',
      };
    }

    const isLateRecovery =
      targetStatus === 'CAPTURED' && (payment.status === 'UNKNOWN' || payment.status === 'FAILED');

    const updated =
      (await this.paymentStore.updatePaymentState(payment.paymentId, {
        status: targetStatus,
        failureReason:
          targetStatus === 'FAILED'
            ? (parsed.reason ?? 'Gateway webhook reported failure')
            : targetStatus === 'CAPTURED'
              ? null
              : payment.failureReason,
        lastWebhookEventId: parsed.eventId,
        reconciliationRequired: targetStatus === 'UNKNOWN',
        capturedAt: targetStatus === 'CAPTURED' ? now : payment.capturedAt,
        failedAt: targetStatus === 'FAILED' ? now : payment.failedAt,
        reconciledAt: isLateRecovery ? now : payment.reconciledAt,
        updatedAt: now,
      })) ?? payment;

    await this.paymentStore.appendPaymentEvent({
      eventId: `pevt_${crypto.randomUUID()}`,
      paymentId: payment.paymentId,
      provider,
      providerEventId: parsed.eventId,
      eventType: isLateRecovery
        ? 'LATE_WEBHOOK_APPLIED'
        : targetStatus === 'CAPTURED'
          ? 'PAYMENT_CAPTURED'
          : targetStatus === 'FAILED'
            ? 'PAYMENT_FAILED'
            : targetStatus === 'UNKNOWN'
              ? 'STATUS_UNKNOWN'
              : 'WEBHOOK_RECEIVED',
      previousStatus: payment.status,
      newStatus: updated.status,
      payloadSummary: isLateRecovery
        ? `Late capture webhook (${parsed.eventId}) reconciled ${payment.status} -> CAPTURED`
        : `Signed webhook ${parsed.eventType} (${parsed.eventId}) transitioned ${payment.status} -> ${updated.status}`,
      occurredAt: now,
    });

    if (targetStatus === 'UNKNOWN') {
      await this.paymentStore.saveReconciliationRecord({
        reconciliationId: `rec_${crypto.randomUUID()}`,
        paymentId: payment.paymentId,
        provider,
        providerPaymentId: payment.providerPaymentId,
        previousStatus: payment.status,
        resolvedStatus: 'UNKNOWN',
        status: 'OPEN_UNKNOWN',
        reason: parsed.reason ?? 'Webhook reported indeterminate payment status',
        checkedByUserId: null,
        createdAt: now,
        resolvedAt: null,
      });
    } else if (isLateRecovery) {
      await this.paymentStore.saveReconciliationRecord({
        reconciliationId: `rec_${crypto.randomUUID()}`,
        paymentId: payment.paymentId,
        provider,
        providerPaymentId: payment.providerPaymentId,
        previousStatus: payment.status,
        resolvedStatus: 'CAPTURED',
        status: 'RECONCILED_CAPTURED',
        reason: `Late webhook ${parsed.eventId} resolved status to CAPTURED`,
        checkedByUserId: null,
        createdAt: now,
        resolvedAt: now,
      });
    }

    return {
      accepted: true,
      deduplicated: false,
      lateEventAction: isLateRecovery ? 'APPLIED' : 'NONE',
      provider,
      providerEventId: parsed.eventId,
      paymentId: payment.paymentId,
      previousStatus: payment.status,
      currentStatus: updated.status,
    };
  }

  async reconcilePayment(
    paymentId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId = 'unknown-request',
  ): Promise<ReconcilePaymentResultDto> {
    const payment = await this.paymentStore.getPaymentById(paymentId);
    if (!payment) {
      throw new AppError(404, 'NOT_FOUND', `Payment "${paymentId}" not found`);
    }

    const isFinanceAdmin = hasPermissionForRole(actorRole, 'finance:settlement:read');
    if (payment.customerId !== actorUserId && !isFinanceAdmin) {
      if (this.rbacStore) {
        await this.rbacStore.appendAuditLog({
          actorId: actorUserId,
          actorRole,
          action: 'payments.reconcile',
          resourceType: 'payment',
          resourceId: paymentId,
          outcome: 'DENIED',
          reason: 'Unauthorized payment reconciliation attempt',
          requestId,
        });
      }
      throw new AppError(403, 'FORBIDDEN', 'You cannot reconcile this payment');
    }

    const now = this.clock.now();
    if (payment.status === 'CAPTURED' || payment.status === 'FAILED') {
      const existingEvents = await this.paymentStore.listEventsForPayment(payment.paymentId);
      return {
        payment: this.toPaymentDto(payment),
        reconciliation: {
          reconciliationId: `rec_terminal_${payment.paymentId}`,
          paymentId: payment.paymentId,
          provider: payment.provider,
          providerPaymentId: payment.providerPaymentId,
          previousStatus: payment.status,
          resolvedStatus: payment.status,
          status: payment.status === 'CAPTURED' ? 'RECONCILED_CAPTURED' : 'RECONCILED_FAILED',
          reason: 'Payment already in terminal state',
          checkedByUserId: actorUserId,
          createdAtIso: now.toISOString(),
          resolvedAtIso: (payment.reconciledAt ?? now).toISOString(),
        },
        events: existingEvents.map((e) => this.toEventDto(e)),
      };
    }

    const poll = await this.gatewayAdapter.fetchPaymentStatus(
      payment.provider,
      payment.providerPaymentId,
      payment.sandboxScenario,
    );

    if (poll.gatewayStatus === 'CAPTURED' || poll.gatewayStatus === 'FAILED') {
      const resolvedStatus: PaymentStatus = poll.gatewayStatus;
      const updated =
        (await this.paymentStore.updatePaymentState(payment.paymentId, {
          status: resolvedStatus,
          failureReason: resolvedStatus === 'FAILED' ? poll.failureReason : null,
          reconciliationRequired: false,
          capturedAt: resolvedStatus === 'CAPTURED' ? now : payment.capturedAt,
          failedAt: resolvedStatus === 'FAILED' ? now : payment.failedAt,
          reconciledAt: now,
          updatedAt: now,
        })) ?? payment;

      await this.paymentStore.appendPaymentEvent({
        eventId: `pevt_${crypto.randomUUID()}`,
        paymentId: payment.paymentId,
        provider: payment.provider,
        providerEventId: null,
        eventType: resolvedStatus === 'CAPTURED' ? 'RECONCILED_CAPTURED' : 'RECONCILED_FAILED',
        previousStatus: payment.status,
        newStatus: resolvedStatus,
        payloadSummary: `Reconciliation poll resolved ${payment.status} -> ${resolvedStatus}`,
        occurredAt: now,
      });

      const recRecord = await this.paymentStore.saveReconciliationRecord({
        reconciliationId: `rec_${crypto.randomUUID()}`,
        paymentId: payment.paymentId,
        provider: payment.provider,
        providerPaymentId: payment.providerPaymentId,
        previousStatus: payment.status,
        resolvedStatus,
        status: resolvedStatus === 'CAPTURED' ? 'RECONCILED_CAPTURED' : 'RECONCILED_FAILED',
        reason: poll.failureReason ?? 'Provider polling confirmed final payment state',
        checkedByUserId: actorUserId,
        createdAt: now,
        resolvedAt: now,
      });

      if (this.rbacStore && isFinanceAdmin) {
        await this.rbacStore.appendAuditLog({
          actorId: actorUserId,
          actorRole,
          action: 'payments.reconcile',
          resourceType: 'payment',
          resourceId: payment.paymentId,
          outcome: 'ALLOWED',
          reason: `Reconciled payment from ${payment.status} to ${resolvedStatus}`,
          requestId,
        });
      }

      const events = await this.paymentStore.listEventsForPayment(payment.paymentId);
      return {
        payment: this.toPaymentDto(updated),
        reconciliation: this.toReconciliationDto(recRecord),
        events: events.map((e) => this.toEventDto(e)),
      };
    }

    const openRec = await this.paymentStore.saveReconciliationRecord({
      reconciliationId: `rec_${crypto.randomUUID()}`,
      paymentId: payment.paymentId,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      previousStatus: payment.status,
      resolvedStatus: payment.status,
      status: 'OPEN_UNKNOWN',
      reason: 'Gateway still reports non-terminal status; retry reconciliation',
      checkedByUserId: actorUserId,
      createdAt: now,
      resolvedAt: null,
    });
    const events = await this.paymentStore.listEventsForPayment(payment.paymentId);
    return {
      payment: this.toPaymentDto(payment),
      reconciliation: this.toReconciliationDto(openRec),
      events: events.map((e) => this.toEventDto(e)),
    };
  }

  async listReconciliationQueue(): Promise<{
    pendingPayments: PaymentAttemptDto[];
    reconciliations: ReconciliationRecordDto[];
  }> {
    const [unknownPayments, recs] = await Promise.all([
      this.paymentStore.listUnknownPayments(),
      this.paymentStore.listReconciliationRecords(),
    ]);
    return {
      pendingPayments: unknownPayments.map((p) => this.toPaymentDto(p)),
      reconciliations: recs.map((r) => this.toReconciliationDto(r)),
    };
  }
}
