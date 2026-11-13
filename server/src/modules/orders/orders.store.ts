import type {
  AllergenCode,
  CheckoutPricingBreakdownDto,
  DietaryType,
  GstTaxSlab,
  OrderCancelReason,
  OrderEventType,
  OrderRefundStatus,
  OrderStatus,
  PlatformInspectionStatus,
  QuoteAddressSnapshotDto,
  UserRole,
} from '@bhojora/shared';
import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import {
  applyBaseSchemaConventions,
  COLLECTION_NAMES,
  paiseField,
} from '../../database/conventions';
import {
  ORDER_CANCEL_REASONS_RUNTIME,
  ORDER_EVENT_TYPES_RUNTIME,
  ORDER_REFUND_STATUSES_RUNTIME,
  ORDER_STATUSES_RUNTIME,
  type CreateOrderBundleInput,
  type CreateOrderBundleResult,
  type OrderEventRecord,
  type OrderIdempotencyKeyRecord,
  type OrderItemRecord,
  type OrderRecord,
  type OrderStore,
  type OutboxEventRecord,
  type TransitionOrderAtomicallyInput,
  type TransitionOrderAtomicallyResult,
} from './orders.types';

const cancellationSubSchema = new Schema(
  {
    reasonCode: { type: String, enum: [...ORDER_CANCEL_REASONS_RUNTIME], required: true },
    note: { type: String, trim: true, maxlength: 300, default: null },
    cancelledByUserId: { type: String, required: true, trim: true, maxlength: 80 },
    cancelledByRole: { type: String, required: true, trim: true, maxlength: 40 },
    cancelledAt: { type: Date, required: true },
    refundStatus: { type: String, enum: [...ORDER_REFUND_STATUSES_RUNTIME], required: true },
    refundAmountPaise: paiseField(),
  },
  { _id: false },
);

const orderSchema = applyBaseSchemaConventions(
  new Schema({
    orderId: { type: String, required: true, trim: true, maxlength: 80 },
    orderNumber: { type: String, required: true, trim: true, maxlength: 40 },
    customerId: { type: String, required: true, trim: true, maxlength: 80 },
    quoteId: { type: String, required: true, trim: true, maxlength: 80 },
    paymentId: { type: String, trim: true, maxlength: 80, default: null },
    restaurantId: { type: String, required: true, trim: true, maxlength: 80 },
    outletId: { type: String, required: true, trim: true, maxlength: 80 },
    outletName: { type: String, required: true, trim: true, maxlength: 140 },
    brandName: { type: String, required: true, trim: true, maxlength: 140 },
    outletInspectionStatus: { type: String, required: true, trim: true, maxlength: 60 },
    outletSafetyScore: { type: Number, default: null },
    status: { type: String, enum: [...ORDER_STATUSES_RUNTIME], required: true },
    version: { type: Number, required: true, min: 1, default: 1 },
    currency: { type: String, enum: ['INR'], required: true, default: 'INR' },
    pricingBreakdown: { type: Schema.Types.Mixed, required: true },
    couponCode: { type: String, trim: true, maxlength: 40, default: null },
    addressSnapshot: { type: Schema.Types.Mixed, required: true },
    estimatedDeliveryMinutes: { type: Number, required: true, min: 1 },
    prepTimeMinutes: { type: Number, default: null },
    specialInstructions: { type: String, trim: true, maxlength: 240, default: null },
    deliveryOtp: { type: String, required: true, trim: true, maxlength: 12 },
    cancellation: { type: cancellationSubSchema, default: null },
    confirmedAt: { type: Date, default: null },
    preparingAt: { type: Date, default: null },
    readyForPickupAt: { type: Date, default: null },
    outForDeliveryAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  }),
);

const orderItemSchema = applyBaseSchemaConventions(
  new Schema({
    orderItemId: { type: String, required: true, trim: true, maxlength: 80 },
    orderId: { type: String, required: true, trim: true, maxlength: 80 },
    menuItemId: { type: String, required: true, trim: true, maxlength: 80 },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    dietaryType: { type: String, required: true, trim: true, maxlength: 40 },
    allergens: { type: [String], default: [] },
    gstTaxSlab: { type: String, required: true, trim: true, maxlength: 40 },
    quantity: { type: Number, required: true, min: 1 },
    unitPricePaise: paiseField(),
    lineTotalPaise: paiseField(),
    selectionSummary: { type: String, trim: true, maxlength: 240, default: '' },
  }),
);

const orderEventSchema = applyBaseSchemaConventions(
  new Schema({
    eventId: { type: String, required: true, trim: true, maxlength: 80 },
    orderId: { type: String, required: true, trim: true, maxlength: 80 },
    eventType: { type: String, enum: [...ORDER_EVENT_TYPES_RUNTIME], required: true },
    fromStatus: { type: String, enum: [...ORDER_STATUSES_RUNTIME, null], default: null },
    toStatus: { type: String, enum: [...ORDER_STATUSES_RUNTIME], required: true },
    actorId: { type: String, required: true, trim: true, maxlength: 80 },
    actorRole: { type: String, required: true, trim: true, maxlength: 40 },
    note: { type: String, required: true, trim: true, maxlength: 320 },
    occurredAt: { type: Date, required: true },
  }),
  { appendOnly: true },
);

const outboxEventSchema = applyBaseSchemaConventions(
  new Schema({
    outboxEventId: { type: String, required: true, trim: true, maxlength: 80 },
    eventType: { type: String, required: true, trim: true, maxlength: 80 },
    aggregateType: { type: String, enum: ['ORDER'], required: true, default: 'ORDER' },
    aggregateId: { type: String, required: true, trim: true, maxlength: 80 },
    payload: { type: Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['PENDING', 'PUBLISHED'], required: true, default: 'PENDING' },
    occurredAt: { type: Date, required: true },
  }),
  { appendOnly: true },
);

const orderIdempotencyKeySchema = applyBaseSchemaConventions(
  new Schema({
    operation: { type: String, required: true, trim: true, maxlength: 80 },
    key: { type: String, required: true, trim: true, maxlength: 160 },
    actorId: { type: String, required: true, trim: true, maxlength: 80 },
    requestHash: { type: String, required: true, trim: true, maxlength: 128 },
    responseStatus: { type: Number, required: true },
    orderId: { type: String, required: true, trim: true, maxlength: 80 },
    expiresAt: { type: Date, required: true },
  }),
);

function isDuplicateKeyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 11000;
}

function toOrderRecord(doc: Record<string, unknown>): OrderRecord {
  const cancelRaw = doc['cancellation'] as Record<string, unknown> | null | undefined;
  return {
    orderId: String(doc['orderId'] ?? ''),
    orderNumber: String(doc['orderNumber'] ?? ''),
    customerId: String(doc['customerId'] ?? ''),
    quoteId: String(doc['quoteId'] ?? ''),
    paymentId: typeof doc['paymentId'] === 'string' ? doc['paymentId'] : null,
    restaurantId: String(doc['restaurantId'] ?? ''),
    outletId: String(doc['outletId'] ?? ''),
    outletName: String(doc['outletName'] ?? ''),
    brandName: String(doc['brandName'] ?? ''),
    outletInspectionStatus: String(
      doc['outletInspectionStatus'] ?? 'INSPECTION_PENDING',
    ) as PlatformInspectionStatus,
    outletSafetyScore:
      typeof doc['outletSafetyScore'] === 'number' ? doc['outletSafetyScore'] : null,
    status: doc['status'] as OrderStatus,
    version: Number(doc['version'] ?? 1),
    currency: 'INR',
    pricingBreakdown: doc['pricingBreakdown'] as CheckoutPricingBreakdownDto,
    couponCode: typeof doc['couponCode'] === 'string' ? doc['couponCode'] : null,
    addressSnapshot: doc['addressSnapshot'] as QuoteAddressSnapshotDto,
    estimatedDeliveryMinutes: Number(doc['estimatedDeliveryMinutes'] ?? 30),
    prepTimeMinutes:
      typeof doc['prepTimeMinutes'] === 'number' ? Number(doc['prepTimeMinutes']) : null,
    specialInstructions:
      typeof doc['specialInstructions'] === 'string' ? doc['specialInstructions'] : null,
    deliveryOtp: String(doc['deliveryOtp'] ?? ''),
    cancellation: cancelRaw
      ? {
          reasonCode: cancelRaw['reasonCode'] as OrderCancelReason,
          note: typeof cancelRaw['note'] === 'string' ? cancelRaw['note'] : null,
          cancelledByUserId: String(cancelRaw['cancelledByUserId'] ?? ''),
          cancelledByRole: cancelRaw['cancelledByRole'] as UserRole | 'SYSTEM',
          cancelledAt:
            cancelRaw['cancelledAt'] instanceof Date ? cancelRaw['cancelledAt'] : new Date(),
          refundStatus: cancelRaw['refundStatus'] as OrderRefundStatus,
          refundAmountPaise: Number(cancelRaw['refundAmountPaise'] ?? 0),
        }
      : null,
    confirmedAt: doc['confirmedAt'] instanceof Date ? doc['confirmedAt'] : null,
    preparingAt: doc['preparingAt'] instanceof Date ? doc['preparingAt'] : null,
    readyForPickupAt: doc['readyForPickupAt'] instanceof Date ? doc['readyForPickupAt'] : null,
    outForDeliveryAt: doc['outForDeliveryAt'] instanceof Date ? doc['outForDeliveryAt'] : null,
    deliveredAt: doc['deliveredAt'] instanceof Date ? doc['deliveredAt'] : null,
    cancelledAt: doc['cancelledAt'] instanceof Date ? doc['cancelledAt'] : null,
    createdAt: doc['createdAt'] instanceof Date ? doc['createdAt'] : new Date(),
    updatedAt: doc['updatedAt'] instanceof Date ? doc['updatedAt'] : new Date(),
  };
}

function toOrderItemRecord(doc: Record<string, unknown>): OrderItemRecord {
  return {
    orderItemId: String(doc['orderItemId'] ?? ''),
    orderId: String(doc['orderId'] ?? ''),
    menuItemId: String(doc['menuItemId'] ?? ''),
    title: String(doc['title'] ?? ''),
    dietaryType: doc['dietaryType'] as DietaryType,
    allergens: Array.isArray(doc['allergens']) ? (doc['allergens'] as AllergenCode[]) : [],
    gstTaxSlab: doc['gstTaxSlab'] as GstTaxSlab,
    quantity: Number(doc['quantity'] ?? 1),
    unitPricePaise: Number(doc['unitPricePaise'] ?? 0),
    lineTotalPaise: Number(doc['lineTotalPaise'] ?? 0),
    selectionSummary: String(doc['selectionSummary'] ?? ''),
    createdAt: doc['createdAt'] instanceof Date ? doc['createdAt'] : new Date(),
  };
}

function toOrderEventRecord(doc: Record<string, unknown>): OrderEventRecord {
  return {
    eventId: String(doc['eventId'] ?? ''),
    orderId: String(doc['orderId'] ?? ''),
    eventType: doc['eventType'] as OrderEventType,
    fromStatus: (doc['fromStatus'] as OrderStatus | null) ?? null,
    toStatus: doc['toStatus'] as OrderStatus,
    actorId: String(doc['actorId'] ?? ''),
    actorRole: doc['actorRole'] as UserRole | 'SYSTEM',
    note: String(doc['note'] ?? ''),
    occurredAt: doc['occurredAt'] instanceof Date ? doc['occurredAt'] : new Date(),
  };
}

function toOutboxEventRecord(doc: Record<string, unknown>): OutboxEventRecord {
  return {
    outboxEventId: String(doc['outboxEventId'] ?? ''),
    eventType: String(doc['eventType'] ?? ''),
    aggregateType: 'ORDER',
    aggregateId: String(doc['aggregateId'] ?? ''),
    payload: (doc['payload'] as Record<string, unknown>) ?? {},
    status: doc['status'] === 'PUBLISHED' ? 'PUBLISHED' : 'PENDING',
    occurredAt: doc['occurredAt'] instanceof Date ? doc['occurredAt'] : new Date(),
  };
}

function cloneOrder(record: OrderRecord): OrderRecord {
  return {
    ...record,
    pricingBreakdown: { ...record.pricingBreakdown },
    addressSnapshot: {
      ...record.addressSnapshot,
      coordinates: [...record.addressSnapshot.coordinates],
    },
    cancellation: record.cancellation
      ? {
          ...record.cancellation,
          cancelledAt: new Date(record.cancellation.cancelledAt.getTime()),
        }
      : null,
    confirmedAt: record.confirmedAt ? new Date(record.confirmedAt.getTime()) : null,
    preparingAt: record.preparingAt ? new Date(record.preparingAt.getTime()) : null,
    readyForPickupAt: record.readyForPickupAt ? new Date(record.readyForPickupAt.getTime()) : null,
    outForDeliveryAt: record.outForDeliveryAt ? new Date(record.outForDeliveryAt.getTime()) : null,
    deliveredAt: record.deliveredAt ? new Date(record.deliveredAt.getTime()) : null,
    cancelledAt: record.cancelledAt ? new Date(record.cancelledAt.getTime()) : null,
    createdAt: new Date(record.createdAt.getTime()),
    updatedAt: new Date(record.updatedAt.getTime()),
  };
}

function cloneItem(record: OrderItemRecord): OrderItemRecord {
  return {
    ...record,
    allergens: [...record.allergens],
    createdAt: new Date(record.createdAt.getTime()),
  };
}

function cloneEvent(record: OrderEventRecord): OrderEventRecord {
  return {
    ...record,
    occurredAt: new Date(record.occurredAt.getTime()),
  };
}

function cloneOutbox(record: OutboxEventRecord): OutboxEventRecord {
  return {
    ...record,
    payload: { ...record.payload },
    occurredAt: new Date(record.occurredAt.getTime()),
  };
}

export class MongooseOrderStore implements OrderStore {
  private readonly orderModel: Model<Record<string, unknown>>;
  private readonly itemModel: Model<Record<string, unknown>>;
  private readonly eventModel: Model<Record<string, unknown>>;
  private readonly outboxModel: Model<Record<string, unknown>>;
  private readonly idempotencyModel: Model<Record<string, unknown>>;

  constructor(connection: Connection) {
    this.orderModel =
      connection.models['BhojoraOrder'] ??
      connection.model<Record<string, unknown>>(
        'BhojoraOrder',
        orderSchema,
        COLLECTION_NAMES.orders,
      );
    this.itemModel =
      connection.models['BhojoraOrderItem'] ??
      connection.model<Record<string, unknown>>(
        'BhojoraOrderItem',
        orderItemSchema,
        COLLECTION_NAMES.orderItems,
      );
    this.eventModel =
      connection.models['BhojoraOrderEvent'] ??
      connection.model<Record<string, unknown>>(
        'BhojoraOrderEvent',
        orderEventSchema,
        COLLECTION_NAMES.orderEvents,
      );
    this.outboxModel =
      connection.models['BhojoraOutboxEvent'] ??
      connection.model<Record<string, unknown>>(
        'BhojoraOutboxEvent',
        outboxEventSchema,
        COLLECTION_NAMES.outboxEvents,
      );
    this.idempotencyModel =
      connection.models['BhojoraOrderIdempotencyKey'] ??
      connection.model<Record<string, unknown>>(
        'BhojoraOrderIdempotencyKey',
        orderIdempotencyKeySchema,
        COLLECTION_NAMES.idempotencyKeys,
      );
  }

  async createOrderBundleAtomically(
    input: CreateOrderBundleInput,
  ): Promise<CreateOrderBundleResult> {
    try {
      const created = await this.orderModel.create({ ...input.order });
      if (input.items.length > 0) {
        await this.itemModel.insertMany(input.items.map((item) => ({ ...item })));
      }
      if (input.events.length > 0) {
        await this.eventModel.insertMany(input.events.map((event) => ({ ...event })));
      }
      if (input.outboxEvents.length > 0) {
        await this.outboxModel.insertMany(input.outboxEvents.map((outbox) => ({ ...outbox })));
      }
      return {
        created: true,
        order: toOrderRecord(created.toJSON() as Record<string, unknown>),
      };
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const message = error instanceof Error ? error.message : '';
        if (message.includes('quoteId')) {
          return { created: false, conflictReason: 'QUOTE_ALREADY_ORDERED' };
        }
        return { created: false, conflictReason: 'DUPLICATE_ORDER_ID' };
      }
      throw error;
    }
  }

  async getOrderById(orderId: string): Promise<OrderRecord | null> {
    const doc = await this.orderModel.findOne({ orderId }).lean();
    return doc ? toOrderRecord(doc as Record<string, unknown>) : null;
  }

  async getOrderByQuoteId(quoteId: string): Promise<OrderRecord | null> {
    const doc = await this.orderModel.findOne({ quoteId }).lean();
    return doc ? toOrderRecord(doc as Record<string, unknown>) : null;
  }

  async listOrdersByCustomer(
    customerId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ orders: OrderRecord[]; nextCursor: string | null; totalCount: number }> {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
    const filter: Record<string, unknown> = { customerId };
    const totalCount = await this.orderModel.countDocuments({ customerId });

    if (options.cursor) {
      const cursorTime = new Date(options.cursor);
      if (!Number.isNaN(cursorTime.getTime())) {
        filter['createdAt'] = { $lt: cursorTime };
      }
    }

    const docs = await this.orderModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = docs.length > limit;
    const sliced = hasMore ? docs.slice(0, limit) : docs;
    const orders = sliced.map((d) => toOrderRecord(d as Record<string, unknown>));
    const last = orders[orders.length - 1];
    return {
      orders,
      nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
      totalCount,
    };
  }

  async listOrdersByOutlet(
    outletId: string,
    options: { status?: OrderStatus; limit?: number } = {},
  ): Promise<OrderRecord[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 40, 100));
    const filter: Record<string, unknown> = { outletId };
    if (options.status) {
      filter['status'] = options.status;
    }
    const docs = await this.orderModel.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    return docs.map((d) => toOrderRecord(d as Record<string, unknown>));
  }

  async listOrderItems(orderId: string): Promise<OrderItemRecord[]> {
    const docs = await this.itemModel.find({ orderId }).sort({ createdAt: 1 }).lean();
    return docs.map((d) => toOrderItemRecord(d as Record<string, unknown>));
  }

  async listOrderEvents(orderId: string): Promise<OrderEventRecord[]> {
    const docs = await this.eventModel.find({ orderId }).sort({ occurredAt: 1 }).lean();
    return docs.map((d) => toOrderEventRecord(d as Record<string, unknown>));
  }

  async listOutboxEventsForAggregate(aggregateId: string): Promise<OutboxEventRecord[]> {
    const docs = await this.outboxModel.find({ aggregateId }).sort({ occurredAt: 1 }).lean();
    return docs.map((d) => toOutboxEventRecord(d as Record<string, unknown>));
  }

  async transitionOrderAtomically(
    input: TransitionOrderAtomicallyInput,
  ): Promise<TransitionOrderAtomicallyResult> {
    const setFields: Record<string, unknown> = {
      status: input.patch.status,
      updatedAt: input.patch.updatedAt,
    };
    if (input.patch.paymentId !== undefined) setFields['paymentId'] = input.patch.paymentId;
    if (input.patch.prepTimeMinutes !== undefined)
      setFields['prepTimeMinutes'] = input.patch.prepTimeMinutes;
    if (input.patch.estimatedDeliveryMinutes !== undefined)
      setFields['estimatedDeliveryMinutes'] = input.patch.estimatedDeliveryMinutes;
    if (input.patch.cancellation !== undefined)
      setFields['cancellation'] = input.patch.cancellation;
    if (input.patch.confirmedAt !== undefined) setFields['confirmedAt'] = input.patch.confirmedAt;
    if (input.patch.preparingAt !== undefined) setFields['preparingAt'] = input.patch.preparingAt;
    if (input.patch.readyForPickupAt !== undefined)
      setFields['readyForPickupAt'] = input.patch.readyForPickupAt;
    if (input.patch.outForDeliveryAt !== undefined)
      setFields['outForDeliveryAt'] = input.patch.outForDeliveryAt;
    if (input.patch.deliveredAt !== undefined) setFields['deliveredAt'] = input.patch.deliveredAt;
    if (input.patch.cancelledAt !== undefined) setFields['cancelledAt'] = input.patch.cancelledAt;

    const updated = await this.orderModel
      .findOneAndUpdate(
        {
          orderId: input.orderId,
          status: { $in: [...input.expectedStatuses] },
          version: input.expectedVersion,
        },
        {
          $set: setFields,
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      )
      .lean();

    if (!updated) {
      return {
        updated: false,
        currentOrder: await this.getOrderById(input.orderId),
      };
    }

    await this.eventModel.create({ ...input.event });
    if (input.outboxEvents && input.outboxEvents.length > 0) {
      await this.outboxModel.insertMany(input.outboxEvents.map((outbox) => ({ ...outbox })));
    }

    return {
      updated: true,
      order: toOrderRecord(updated as Record<string, unknown>),
    };
  }

  async findIdempotencyKey(
    operation: string,
    key: string,
  ): Promise<OrderIdempotencyKeyRecord | null> {
    const doc = await this.idempotencyModel.findOne({ operation, key }).lean();
    if (!doc) {
      return null;
    }
    const raw = doc as Record<string, unknown>;
    return {
      operation: String(raw['operation'] ?? ''),
      key: String(raw['key'] ?? ''),
      actorId: String(raw['actorId'] ?? ''),
      requestHash: String(raw['requestHash'] ?? ''),
      responseStatus: Number(raw['responseStatus'] ?? 201),
      orderId: String(raw['orderId'] ?? ''),
      createdAt: raw['createdAt'] instanceof Date ? raw['createdAt'] : new Date(),
      expiresAt: raw['expiresAt'] instanceof Date ? raw['expiresAt'] : new Date(),
    };
  }

  async saveIdempotencyKeyIfAbsent(
    record: OrderIdempotencyKeyRecord,
  ): Promise<{ inserted: boolean; record: OrderIdempotencyKeyRecord }> {
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
}

export class InMemoryOrderStore implements OrderStore {
  private readonly orders = new Map<string, OrderRecord>();
  private readonly quoteToOrderId = new Map<string, string>();
  private readonly itemsByOrderId = new Map<string, OrderItemRecord[]>();
  private readonly eventsByOrderId = new Map<string, OrderEventRecord[]>();
  private readonly outboxByAggregateId = new Map<string, OutboxEventRecord[]>();
  private readonly idempotencyKeys = new Map<string, OrderIdempotencyKeyRecord>();

  async createOrderBundleAtomically(
    input: CreateOrderBundleInput,
  ): Promise<CreateOrderBundleResult> {
    // Synchronous critical-section checks before yielding prevent duplicate order races on same quoteId.
    if (this.quoteToOrderId.has(input.order.quoteId)) {
      return { created: false, conflictReason: 'QUOTE_ALREADY_ORDERED' };
    }
    if (this.orders.has(input.order.orderId)) {
      return { created: false, conflictReason: 'DUPLICATE_ORDER_ID' };
    }

    const stored = cloneOrder(input.order);
    this.orders.set(stored.orderId, stored);
    this.quoteToOrderId.set(stored.quoteId, stored.orderId);
    this.itemsByOrderId.set(stored.orderId, input.items.map(cloneItem));
    this.eventsByOrderId.set(stored.orderId, input.events.map(cloneEvent));
    this.outboxByAggregateId.set(stored.orderId, input.outboxEvents.map(cloneOutbox));

    return { created: true, order: cloneOrder(stored) };
  }

  async getOrderById(orderId: string): Promise<OrderRecord | null> {
    const found = this.orders.get(orderId);
    return found ? cloneOrder(found) : null;
  }

  async getOrderByQuoteId(quoteId: string): Promise<OrderRecord | null> {
    const orderId = this.quoteToOrderId.get(quoteId);
    if (!orderId) {
      return null;
    }
    return this.getOrderById(orderId);
  }

  async listOrdersByCustomer(
    customerId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<{ orders: OrderRecord[]; nextCursor: string | null; totalCount: number }> {
    const limit = Math.max(1, Math.min(options.limit ?? 20, 50));
    const allForCustomer = [...this.orders.values()]
      .filter((o) => o.customerId === customerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    let filtered = allForCustomer;
    if (options.cursor) {
      const cursorMs = new Date(options.cursor).getTime();
      if (!Number.isNaN(cursorMs)) {
        filtered = allForCustomer.filter((o) => o.createdAt.getTime() < cursorMs);
      }
    }

    const hasMore = filtered.length > limit;
    const sliced = hasMore ? filtered.slice(0, limit) : filtered;
    const last = sliced[sliced.length - 1];
    return {
      orders: sliced.map(cloneOrder),
      nextCursor: hasMore && last ? last.createdAt.toISOString() : null,
      totalCount: allForCustomer.length,
    };
  }

  async listOrdersByOutlet(
    outletId: string,
    options: { status?: OrderStatus; limit?: number } = {},
  ): Promise<OrderRecord[]> {
    const limit = Math.max(1, Math.min(options.limit ?? 40, 100));
    return [...this.orders.values()]
      .filter((o) => o.outletId === outletId && (!options.status || o.status === options.status))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map(cloneOrder);
  }

  async listOrderItems(orderId: string): Promise<OrderItemRecord[]> {
    return (this.itemsByOrderId.get(orderId) ?? []).map(cloneItem);
  }

  async listOrderEvents(orderId: string): Promise<OrderEventRecord[]> {
    return [...(this.eventsByOrderId.get(orderId) ?? [])]
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map(cloneEvent);
  }

  async listOutboxEventsForAggregate(aggregateId: string): Promise<OutboxEventRecord[]> {
    return [...(this.outboxByAggregateId.get(aggregateId) ?? [])]
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .map(cloneOutbox);
  }

  async transitionOrderAtomically(
    input: TransitionOrderAtomicallyInput,
  ): Promise<TransitionOrderAtomicallyResult> {
    const existing = this.orders.get(input.orderId);
    if (
      !existing ||
      existing.version !== input.expectedVersion ||
      !input.expectedStatuses.includes(existing.status)
    ) {
      return {
        updated: false,
        currentOrder: existing ? cloneOrder(existing) : null,
      };
    }

    const next: OrderRecord = {
      ...cloneOrder(existing),
      status: input.patch.status,
      paymentId: input.patch.paymentId !== undefined ? input.patch.paymentId : existing.paymentId,
      prepTimeMinutes:
        input.patch.prepTimeMinutes !== undefined
          ? input.patch.prepTimeMinutes
          : existing.prepTimeMinutes,
      estimatedDeliveryMinutes:
        input.patch.estimatedDeliveryMinutes !== undefined
          ? input.patch.estimatedDeliveryMinutes
          : existing.estimatedDeliveryMinutes,
      cancellation:
        input.patch.cancellation !== undefined ? input.patch.cancellation : existing.cancellation,
      confirmedAt:
        input.patch.confirmedAt !== undefined ? input.patch.confirmedAt : existing.confirmedAt,
      preparingAt:
        input.patch.preparingAt !== undefined ? input.patch.preparingAt : existing.preparingAt,
      readyForPickupAt:
        input.patch.readyForPickupAt !== undefined
          ? input.patch.readyForPickupAt
          : existing.readyForPickupAt,
      outForDeliveryAt:
        input.patch.outForDeliveryAt !== undefined
          ? input.patch.outForDeliveryAt
          : existing.outForDeliveryAt,
      deliveredAt:
        input.patch.deliveredAt !== undefined ? input.patch.deliveredAt : existing.deliveredAt,
      cancelledAt:
        input.patch.cancelledAt !== undefined ? input.patch.cancelledAt : existing.cancelledAt,
      updatedAt: new Date(input.patch.updatedAt.getTime()),
      version: existing.version + 1,
    };

    this.orders.set(input.orderId, next);
    const events = this.eventsByOrderId.get(input.orderId) ?? [];
    events.push(cloneEvent(input.event));
    this.eventsByOrderId.set(input.orderId, events);

    if (input.outboxEvents && input.outboxEvents.length > 0) {
      const outbox = this.outboxByAggregateId.get(input.orderId) ?? [];
      for (const item of input.outboxEvents) {
        outbox.push(cloneOutbox(item));
      }
      this.outboxByAggregateId.set(input.orderId, outbox);
    }

    return { updated: true, order: cloneOrder(next) };
  }

  async findIdempotencyKey(
    operation: string,
    key: string,
  ): Promise<OrderIdempotencyKeyRecord | null> {
    const found = this.idempotencyKeys.get(`${operation}::${key}`);
    return found ? { ...found } : null;
  }

  async saveIdempotencyKeyIfAbsent(
    record: OrderIdempotencyKeyRecord,
  ): Promise<{ inserted: boolean; record: OrderIdempotencyKeyRecord }> {
    const composite = `${record.operation}::${record.key}`;
    const existing = this.idempotencyKeys.get(composite);
    if (existing) {
      return { inserted: false, record: { ...existing } };
    }
    this.idempotencyKeys.set(composite, { ...record });
    return { inserted: true, record: { ...record } };
  }
}
