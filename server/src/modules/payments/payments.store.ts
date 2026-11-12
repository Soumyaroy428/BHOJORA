import type {
  PaymentEventType,
  PaymentInstrumentSummaryDto,
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
  ReconciliationStatus,
  SandboxScenario,
} from '@bhojora/shared';
import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import {
  applyBaseSchemaConventions,
  COLLECTION_NAMES,
  paiseField,
} from '../../database/conventions';
import {
  PAYMENT_EVENT_TYPES_RUNTIME,
  PAYMENT_METHODS_RUNTIME,
  PAYMENT_PROVIDERS_RUNTIME,
  PAYMENT_STATUSES_RUNTIME,
  RECONCILIATION_STATUSES_RUNTIME,
  SANDBOX_SCENARIOS_RUNTIME,
  type IdempotencyKeyRecord,
  type IntegrationWebhookEventRecord,
  type PaymentEventRecord,
  type PaymentRecord,
  type PaymentStore,
  type ReconciliationRecord,
} from './payments.types';

const instrumentSummarySchema = new Schema(
  {
    method: { type: String, enum: [...PAYMENT_METHODS_RUNTIME], required: true },
    upiVpaMasked: { type: String, trim: true, maxlength: 80, default: null },
    cardNetwork: {
      type: String,
      enum: ['VISA', 'MASTERCARD', 'RUPAY', null],
      default: null,
    },
    cardLast4: { type: String, trim: true, maxlength: 4, default: null },
    bankCode: { type: String, trim: true, maxlength: 32, default: null },
    tokenReference: { type: String, trim: true, maxlength: 80, default: null },
  },
  { _id: false },
);

const paymentSchema = applyBaseSchemaConventions(
  new Schema({
    paymentId: { type: String, required: true, trim: true, maxlength: 80 },
    customerId: { type: String, required: true, trim: true, maxlength: 80 },
    quoteId: { type: String, required: true, trim: true, maxlength: 80 },
    outletId: { type: String, required: true, trim: true, maxlength: 80 },
    orderReference: { type: String, trim: true, maxlength: 80, default: null },
    provider: { type: String, enum: [...PAYMENT_PROVIDERS_RUNTIME], required: true },
    providerOrderId: { type: String, required: true, trim: true, maxlength: 100 },
    providerPaymentId: { type: String, required: true, trim: true, maxlength: 100 },
    amountPaise: paiseField(),
    currency: { type: String, enum: ['INR'], required: true, default: 'INR' },
    status: { type: String, enum: [...PAYMENT_STATUSES_RUNTIME], required: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    method: { type: String, enum: [...PAYMENT_METHODS_RUNTIME], required: true },
    instrumentSummary: { type: instrumentSummarySchema, required: true },
    sandboxCheckoutSessionId: { type: String, required: true, trim: true, maxlength: 100 },
    sandboxScenario: {
      type: String,
      enum: [...SANDBOX_SCENARIOS_RUNTIME],
      required: true,
      default: 'AUTO_CAPTURE',
    },
    failureReason: { type: String, trim: true, maxlength: 240, default: null },
    lastWebhookEventId: { type: String, trim: true, maxlength: 120, default: null },
    reconciliationRequired: { type: Boolean, required: true, default: false },
    capturedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    reconciledAt: { type: Date, default: null },
  }),
);

const paymentEventSchema = applyBaseSchemaConventions(
  new Schema({
    eventId: { type: String, required: true, trim: true, maxlength: 80 },
    paymentId: { type: String, required: true, trim: true, maxlength: 80 },
    provider: { type: String, enum: [...PAYMENT_PROVIDERS_RUNTIME], required: true },
    providerEventId: { type: String, trim: true, maxlength: 120, default: null },
    eventType: { type: String, enum: [...PAYMENT_EVENT_TYPES_RUNTIME], required: true },
    previousStatus: {
      type: String,
      enum: [...PAYMENT_STATUSES_RUNTIME, null],
      default: null,
    },
    newStatus: { type: String, enum: [...PAYMENT_STATUSES_RUNTIME], required: true },
    payloadSummary: { type: String, required: true, trim: true, maxlength: 300 },
    occurredAt: { type: Date, required: true },
  }),
  { appendOnly: true },
);

const idempotencyKeySchema = applyBaseSchemaConventions(
  new Schema({
    operation: { type: String, required: true, trim: true, maxlength: 80 },
    key: { type: String, required: true, trim: true, maxlength: 160 },
    actorId: { type: String, required: true, trim: true, maxlength: 80 },
    requestHash: { type: String, required: true, trim: true, maxlength: 128 },
    responseStatus: { type: Number, required: true },
    paymentId: { type: String, required: true, trim: true, maxlength: 80 },
    expiresAt: { type: Date, required: true },
  }),
);

const integrationWebhookEventSchema = applyBaseSchemaConventions(
  new Schema({
    webhookRecordId: { type: String, required: true, trim: true, maxlength: 80 },
    provider: { type: String, enum: [...PAYMENT_PROVIDERS_RUNTIME], required: true },
    eventId: { type: String, required: true, trim: true, maxlength: 120 },
    eventType: { type: String, required: true, trim: true, maxlength: 80 },
    providerPaymentId: { type: String, required: true, trim: true, maxlength: 100 },
    signatureVerified: { type: Boolean, required: true },
    payloadHash: { type: String, required: true, trim: true, maxlength: 128 },
    receivedAt: { type: Date, required: true },
  }),
  { appendOnly: true },
);

const reconciliationRecordSchema = applyBaseSchemaConventions(
  new Schema({
    reconciliationId: { type: String, required: true, trim: true, maxlength: 80 },
    paymentId: { type: String, required: true, trim: true, maxlength: 80 },
    provider: { type: String, enum: [...PAYMENT_PROVIDERS_RUNTIME], required: true },
    providerPaymentId: { type: String, required: true, trim: true, maxlength: 100 },
    previousStatus: { type: String, enum: [...PAYMENT_STATUSES_RUNTIME], required: true },
    resolvedStatus: { type: String, enum: [...PAYMENT_STATUSES_RUNTIME], required: true },
    status: { type: String, enum: [...RECONCILIATION_STATUSES_RUNTIME], required: true },
    reason: { type: String, required: true, trim: true, maxlength: 240 },
    checkedByUserId: { type: String, trim: true, maxlength: 80, default: null },
    resolvedAt: { type: Date, default: null },
  }),
);

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 11000;
}

function toPaymentRecord(doc: Record<string, unknown>): PaymentRecord {
  const inst = (doc['instrumentSummary'] as Record<string, unknown> | undefined) ?? {};
  const instrumentSummary: PaymentInstrumentSummaryDto = {
    method: (inst['method'] as PaymentMethod) ?? 'UPI',
    upiVpaMasked: typeof inst['upiVpaMasked'] === 'string' ? inst['upiVpaMasked'] : null,
    cardNetwork:
      inst['cardNetwork'] === 'VISA' ||
      inst['cardNetwork'] === 'MASTERCARD' ||
      inst['cardNetwork'] === 'RUPAY'
        ? inst['cardNetwork']
        : null,
    cardLast4: typeof inst['cardLast4'] === 'string' ? inst['cardLast4'] : null,
    bankCode: typeof inst['bankCode'] === 'string' ? inst['bankCode'] : null,
    tokenReference: typeof inst['tokenReference'] === 'string' ? inst['tokenReference'] : null,
  };

  return {
    paymentId: String(doc['paymentId'] ?? ''),
    customerId: String(doc['customerId'] ?? ''),
    quoteId: String(doc['quoteId'] ?? ''),
    outletId: String(doc['outletId'] ?? ''),
    orderReference: typeof doc['orderReference'] === 'string' ? doc['orderReference'] : null,
    provider: doc['provider'] as PaymentProvider,
    providerOrderId: String(doc['providerOrderId'] ?? ''),
    providerPaymentId: String(doc['providerPaymentId'] ?? ''),
    amountPaise: Number(doc['amountPaise'] ?? 0),
    currency: 'INR',
    status: doc['status'] as PaymentStatus,
    attemptNumber: Number(doc['attemptNumber'] ?? 1),
    method: doc['method'] as PaymentMethod,
    instrumentSummary,
    sandboxCheckoutSessionId: String(doc['sandboxCheckoutSessionId'] ?? ''),
    sandboxScenario: (doc['sandboxScenario'] as SandboxScenario) ?? 'AUTO_CAPTURE',
    failureReason: typeof doc['failureReason'] === 'string' ? doc['failureReason'] : null,
    lastWebhookEventId:
      typeof doc['lastWebhookEventId'] === 'string' ? doc['lastWebhookEventId'] : null,
    reconciliationRequired: Boolean(doc['reconciliationRequired']),
    capturedAt: doc['capturedAt'] instanceof Date ? doc['capturedAt'] : null,
    failedAt: doc['failedAt'] instanceof Date ? doc['failedAt'] : null,
    reconciledAt: doc['reconciledAt'] instanceof Date ? doc['reconciledAt'] : null,
    createdAt: doc['createdAt'] instanceof Date ? doc['createdAt'] : new Date(),
    updatedAt: doc['updatedAt'] instanceof Date ? doc['updatedAt'] : new Date(),
  };
}

function toPaymentEventRecord(doc: Record<string, unknown>): PaymentEventRecord {
  return {
    eventId: String(doc['eventId'] ?? ''),
    paymentId: String(doc['paymentId'] ?? ''),
    provider: doc['provider'] as PaymentProvider,
    providerEventId: typeof doc['providerEventId'] === 'string' ? doc['providerEventId'] : null,
    eventType: doc['eventType'] as PaymentEventType,
    previousStatus: (doc['previousStatus'] as PaymentStatus | null) ?? null,
    newStatus: doc['newStatus'] as PaymentStatus,
    payloadSummary: String(doc['payloadSummary'] ?? ''),
    occurredAt: doc['occurredAt'] instanceof Date ? doc['occurredAt'] : new Date(),
  };
}

function toReconciliationRecord(doc: Record<string, unknown>): ReconciliationRecord {
  return {
    reconciliationId: String(doc['reconciliationId'] ?? ''),
    paymentId: String(doc['paymentId'] ?? ''),
    provider: doc['provider'] as PaymentProvider,
    providerPaymentId: String(doc['providerPaymentId'] ?? ''),
    previousStatus: doc['previousStatus'] as PaymentStatus,
    resolvedStatus: doc['resolvedStatus'] as PaymentStatus,
    status: doc['status'] as ReconciliationStatus,
    reason: String(doc['reason'] ?? ''),
    checkedByUserId: typeof doc['checkedByUserId'] === 'string' ? doc['checkedByUserId'] : null,
    createdAt: doc['createdAt'] instanceof Date ? doc['createdAt'] : new Date(),
    resolvedAt: doc['resolvedAt'] instanceof Date ? doc['resolvedAt'] : null,
  };
}

function clonePayment(record: PaymentRecord): PaymentRecord {
  return {
    ...record,
    instrumentSummary: { ...record.instrumentSummary },
    capturedAt: record.capturedAt ? new Date(record.capturedAt.getTime()) : null,
    failedAt: record.failedAt ? new Date(record.failedAt.getTime()) : null,
    reconciledAt: record.reconciledAt ? new Date(record.reconciledAt.getTime()) : null,
    createdAt: new Date(record.createdAt.getTime()),
    updatedAt: new Date(record.updatedAt.getTime()),
  };
}

function cloneEvent(record: PaymentEventRecord): PaymentEventRecord {
  return {
    ...record,
    occurredAt: new Date(record.occurredAt.getTime()),
  };
}

function cloneReconciliation(record: ReconciliationRecord): ReconciliationRecord {
  return {
    ...record,
    createdAt: new Date(record.createdAt.getTime()),
    resolvedAt: record.resolvedAt ? new Date(record.resolvedAt.getTime()) : null,
  };
}

export class MongoosePaymentStore implements PaymentStore {
  private readonly paymentModel: Model<Record<string, unknown>>;
  private readonly eventModel: Model<Record<string, unknown>>;
  private readonly idempotencyModel: Model<Record<string, unknown>>;
  private readonly webhookModel: Model<Record<string, unknown>>;
  private readonly reconciliationModel: Model<Record<string, unknown>>;

  constructor(connection: Connection) {
    this.paymentModel =
      (connection.models['BhojoraPayment'] as Model<Record<string, unknown>> | undefined) ??
      connection.model<Record<string, unknown>>(
        'BhojoraPayment',
        paymentSchema,
        COLLECTION_NAMES.payments,
      );
    this.eventModel =
      (connection.models['BhojoraPaymentEvent'] as Model<Record<string, unknown>> | undefined) ??
      connection.model<Record<string, unknown>>(
        'BhojoraPaymentEvent',
        paymentEventSchema,
        COLLECTION_NAMES.paymentEvents,
      );
    this.idempotencyModel =
      (connection.models['BhojoraIdempotencyKey'] as Model<Record<string, unknown>> | undefined) ??
      connection.model<Record<string, unknown>>(
        'BhojoraIdempotencyKey',
        idempotencyKeySchema,
        COLLECTION_NAMES.idempotencyKeys,
      );
    this.webhookModel =
      (connection.models['BhojoraIntegrationWebhookEvent'] as
        Model<Record<string, unknown>> | undefined) ??
      connection.model<Record<string, unknown>>(
        'BhojoraIntegrationWebhookEvent',
        integrationWebhookEventSchema,
        COLLECTION_NAMES.integrationWebhookEvents,
      );
    this.reconciliationModel =
      (connection.models['BhojoraReconciliationRecord'] as
        Model<Record<string, unknown>> | undefined) ??
      connection.model<Record<string, unknown>>(
        'BhojoraReconciliationRecord',
        reconciliationRecordSchema,
        COLLECTION_NAMES.reconciliationRecords,
      );
  }

  async createPayment(record: PaymentRecord): Promise<PaymentRecord> {
    const doc = await this.paymentModel.create({ ...record });
    return toPaymentRecord(doc.toJSON() as Record<string, unknown>);
  }

  async getPaymentById(paymentId: string): Promise<PaymentRecord | null> {
    const doc = await this.paymentModel.findOne({ paymentId }).lean();
    return doc ? toPaymentRecord(doc as Record<string, unknown>) : null;
  }

  async getPaymentByProviderPaymentId(
    provider: PaymentProvider,
    providerPaymentId: string,
  ): Promise<PaymentRecord | null> {
    const doc = await this.paymentModel.findOne({ provider, providerPaymentId }).lean();
    return doc ? toPaymentRecord(doc as Record<string, unknown>) : null;
  }

  async listPaymentsByQuoteId(quoteId: string): Promise<PaymentRecord[]> {
    const docs = await this.paymentModel.find({ quoteId }).sort({ createdAt: 1 }).lean();
    return docs.map((d) => toPaymentRecord(d as Record<string, unknown>));
  }

  async listPaymentsByCustomer(customerId: string): Promise<PaymentRecord[]> {
    const docs = await this.paymentModel.find({ customerId }).sort({ createdAt: -1 }).lean();
    return docs.map((d) => toPaymentRecord(d as Record<string, unknown>));
  }

  async listUnknownPayments(): Promise<PaymentRecord[]> {
    const docs = await this.paymentModel
      .find({ $or: [{ status: 'UNKNOWN' }, { reconciliationRequired: true }] })
      .sort({ createdAt: 1 })
      .lean();
    return docs.map((d) => toPaymentRecord(d as Record<string, unknown>));
  }

  async updatePaymentState(
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
  ): Promise<PaymentRecord | null> {
    const doc = await this.paymentModel
      .findOneAndUpdate({ paymentId }, { $set: patch }, { new: true, lean: true })
      .exec();
    return doc ? toPaymentRecord(doc as Record<string, unknown>) : null;
  }

  async appendPaymentEvent(event: PaymentEventRecord): Promise<PaymentEventRecord> {
    const doc = await this.eventModel.create({ ...event });
    return toPaymentEventRecord(doc.toJSON() as Record<string, unknown>);
  }

  async listEventsForPayment(paymentId: string): Promise<PaymentEventRecord[]> {
    const docs = await this.eventModel.find({ paymentId }).sort({ occurredAt: 1 }).lean();
    return docs.map((d) => toPaymentEventRecord(d as Record<string, unknown>));
  }

  async findIdempotencyKey(operation: string, key: string): Promise<IdempotencyKeyRecord | null> {
    const doc = await this.idempotencyModel.findOne({ operation, key }).lean();
    if (!doc) {
      return null;
    }
    return {
      operation: String(doc['operation'] ?? ''),
      key: String(doc['key'] ?? ''),
      actorId: String(doc['actorId'] ?? ''),
      requestHash: String(doc['requestHash'] ?? ''),
      responseStatus: Number(doc['responseStatus'] ?? 201),
      paymentId: String(doc['paymentId'] ?? ''),
      createdAt: doc['createdAt'] instanceof Date ? doc['createdAt'] : new Date(),
      expiresAt: doc['expiresAt'] instanceof Date ? doc['expiresAt'] : new Date(),
    };
  }

  async saveIdempotencyKeyIfAbsent(
    record: IdempotencyKeyRecord,
  ): Promise<{ inserted: boolean; record: IdempotencyKeyRecord }> {
    try {
      await this.idempotencyModel.create({ ...record });
      return { inserted: true, record };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const existing = await this.findIdempotencyKey(record.operation, record.key);
        if (existing) {
          return { inserted: false, record: existing };
        }
      }
      throw error;
    }
  }

  async recordWebhookEventIfNew(
    record: IntegrationWebhookEventRecord,
  ): Promise<{ inserted: boolean; record: IntegrationWebhookEventRecord }> {
    try {
      await this.webhookModel.create({ ...record });
      return { inserted: true, record };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const existingDoc = await this.webhookModel
          .findOne({ provider: record.provider, eventId: record.eventId })
          .lean();
        const existing: IntegrationWebhookEventRecord = existingDoc
          ? {
              webhookRecordId: String(existingDoc['webhookRecordId'] ?? ''),
              provider: existingDoc['provider'] as PaymentProvider,
              eventId: String(existingDoc['eventId'] ?? ''),
              eventType: String(existingDoc['eventType'] ?? ''),
              providerPaymentId: String(existingDoc['providerPaymentId'] ?? ''),
              signatureVerified: Boolean(existingDoc['signatureVerified']),
              payloadHash: String(existingDoc['payloadHash'] ?? ''),
              receivedAt:
                existingDoc['receivedAt'] instanceof Date ? existingDoc['receivedAt'] : new Date(),
            }
          : record;
        return { inserted: false, record: existing };
      }
      throw error;
    }
  }

  async saveReconciliationRecord(record: ReconciliationRecord): Promise<ReconciliationRecord> {
    const doc = await this.reconciliationModel
      .findOneAndUpdate(
        { reconciliationId: record.reconciliationId },
        { $set: record },
        { upsert: true, new: true, lean: true },
      )
      .exec();
    return toReconciliationRecord((doc ?? record) as Record<string, unknown>);
  }

  async listReconciliationRecords(): Promise<ReconciliationRecord[]> {
    const docs = await this.reconciliationModel.find({}).sort({ createdAt: -1 }).lean();
    return docs.map((d) => toReconciliationRecord(d as Record<string, unknown>));
  }
}

export class InMemoryPaymentStore implements PaymentStore {
  private readonly payments = new Map<string, PaymentRecord>();
  private readonly events: PaymentEventRecord[] = [];
  private readonly idempotencyKeys = new Map<string, IdempotencyKeyRecord>();
  private readonly webhookEvents = new Map<string, IntegrationWebhookEventRecord>();
  private readonly reconciliations = new Map<string, ReconciliationRecord>();

  async createPayment(record: PaymentRecord): Promise<PaymentRecord> {
    const providerKey = `${record.provider}:${record.providerPaymentId}`;
    for (const existing of this.payments.values()) {
      if (`${existing.provider}:${existing.providerPaymentId}` === providerKey) {
        throw new Error(`Duplicate provider payment id ${providerKey}`);
      }
    }
    const copy = clonePayment(record);
    this.payments.set(copy.paymentId, copy);
    return clonePayment(copy);
  }

  async getPaymentById(paymentId: string): Promise<PaymentRecord | null> {
    const hit = this.payments.get(paymentId);
    return hit ? clonePayment(hit) : null;
  }

  async getPaymentByProviderPaymentId(
    provider: PaymentProvider,
    providerPaymentId: string,
  ): Promise<PaymentRecord | null> {
    for (const item of this.payments.values()) {
      if (item.provider === provider && item.providerPaymentId === providerPaymentId) {
        return clonePayment(item);
      }
    }
    return null;
  }

  async listPaymentsByQuoteId(quoteId: string): Promise<PaymentRecord[]> {
    return Array.from(this.payments.values())
      .filter((p) => p.quoteId === quoteId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(clonePayment);
  }

  async listPaymentsByCustomer(customerId: string): Promise<PaymentRecord[]> {
    return Array.from(this.payments.values())
      .filter((p) => p.customerId === customerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(clonePayment);
  }

  async listUnknownPayments(): Promise<PaymentRecord[]> {
    return Array.from(this.payments.values())
      .filter((p) => p.status === 'UNKNOWN' || p.reconciliationRequired)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(clonePayment);
  }

  async updatePaymentState(
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
  ): Promise<PaymentRecord | null> {
    const existing = this.payments.get(paymentId);
    if (!existing) {
      return null;
    }
    const next: PaymentRecord = {
      ...existing,
      ...patch,
    };
    this.payments.set(paymentId, clonePayment(next));
    return clonePayment(next);
  }

  async appendPaymentEvent(event: PaymentEventRecord): Promise<PaymentEventRecord> {
    const copy = cloneEvent(event);
    this.events.push(copy);
    return cloneEvent(copy);
  }

  async listEventsForPayment(paymentId: string): Promise<PaymentEventRecord[]> {
    return this.events
      .filter((e) => e.paymentId === paymentId)
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map(cloneEvent);
  }

  async findIdempotencyKey(operation: string, key: string): Promise<IdempotencyKeyRecord | null> {
    const hit = this.idempotencyKeys.get(`${operation}:${key}`);
    return hit
      ? {
          ...hit,
          createdAt: new Date(hit.createdAt.getTime()),
          expiresAt: new Date(hit.expiresAt.getTime()),
        }
      : null;
  }

  async saveIdempotencyKeyIfAbsent(
    record: IdempotencyKeyRecord,
  ): Promise<{ inserted: boolean; record: IdempotencyKeyRecord }> {
    const composite = `${record.operation}:${record.key}`;
    const existing = this.idempotencyKeys.get(composite);
    if (existing) {
      return { inserted: false, record: { ...existing } };
    }
    this.idempotencyKeys.set(composite, {
      ...record,
      createdAt: new Date(record.createdAt.getTime()),
      expiresAt: new Date(record.expiresAt.getTime()),
    });
    return { inserted: true, record: { ...record } };
  }

  async recordWebhookEventIfNew(
    record: IntegrationWebhookEventRecord,
  ): Promise<{ inserted: boolean; record: IntegrationWebhookEventRecord }> {
    const composite = `${record.provider}:${record.eventId}`;
    const existing = this.webhookEvents.get(composite);
    if (existing) {
      return { inserted: false, record: { ...existing } };
    }
    const copy: IntegrationWebhookEventRecord = {
      ...record,
      receivedAt: new Date(record.receivedAt.getTime()),
    };
    this.webhookEvents.set(composite, copy);
    return { inserted: true, record: { ...copy } };
  }

  async saveReconciliationRecord(record: ReconciliationRecord): Promise<ReconciliationRecord> {
    const copy = cloneReconciliation(record);
    this.reconciliations.set(copy.reconciliationId, copy);
    return cloneReconciliation(copy);
  }

  async listReconciliationRecords(): Promise<ReconciliationRecord[]> {
    return Array.from(this.reconciliations.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map(cloneReconciliation);
  }
}
