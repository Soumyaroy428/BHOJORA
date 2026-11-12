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

export const ORDER_STATUSES_RUNTIME = [
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const satisfies readonly OrderStatus[];

export const TERMINAL_ORDER_STATUSES_SET: ReadonlySet<OrderStatus> = new Set([
  'DELIVERED',
  'CANCELLED',
]);

export const ORDER_CANCEL_REASONS_RUNTIME = [
  'CUSTOMER_CHANGED_MIND',
  'ORDERED_BY_MISTAKE',
  'DELIVERY_DELAY',
  'OUTLET_OUT_OF_STOCK',
  'PAYMENT_FAILED',
  'OPS_INTERVENTION',
] as const satisfies readonly OrderCancelReason[];

export const ORDER_REFUND_STATUSES_RUNTIME = [
  'NOT_REQUIRED',
  'PENDING_REVIEW',
  'QUEUED_FULL_REFUND',
  'REFUNDED',
] as const satisfies readonly OrderRefundStatus[];

export const ORDER_EVENT_TYPES_RUNTIME = [
  'ORDER_CREATED',
  'PAYMENT_LINKED',
  'ORDER_CONFIRMED',
  'ORDER_PREPARING_STARTED',
  'ORDER_READY_FOR_PICKUP',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'OUTBOX_EVENT_QUEUED',
] as const satisfies readonly OrderEventType[];

export const ORDER_VALID_TRANSITIONS_MAP: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  AWAITING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const ORDER_STATUS_LABELS_MAP: Readonly<Record<OrderStatus, string>> = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  CONFIRMED: 'Order Confirmed',
  PREPARING: 'Kitchen Preparing',
  READY_FOR_PICKUP: 'Ready for Pickup',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const CUSTOMER_CANCELLABLE_STATUSES_SET: ReadonlySet<OrderStatus> = new Set([
  'AWAITING_PAYMENT',
  'CONFIRMED',
]);

export const OUTLET_CANCELLABLE_STATUSES_SET: ReadonlySet<OrderStatus> = new Set([
  'CONFIRMED',
  'PREPARING',
]);

export const CUSTOMER_SELF_CANCEL_REASONS_SET: ReadonlySet<OrderCancelReason> = new Set([
  'CUSTOMER_CHANGED_MIND',
  'ORDERED_BY_MISTAKE',
  'DELIVERY_DELAY',
]);

export const FORBIDDEN_CLIENT_ORDER_OVERRIDE_FIELDS = [
  'status',
  'orderNumber',
  'orderId',
  'version',
  'itemsSubtotalPaise',
  'discountPaise',
  'packagingChargePaise',
  'deliveryFeePaise',
  'platformFeePaise',
  'gstTaxPaise',
  'totalPayablePaise',
  'amountPaise',
  'refundAmountPaise',
  'confirmedAt',
  'deliveredAt',
  'cancelledAt',
] as const;

export const ORDER_IDEMPOTENCY_TTL_SECONDS = 86_400;

export interface OrderRecord {
  orderId: string;
  orderNumber: string;
  customerId: string;
  quoteId: string;
  paymentId: string | null;
  restaurantId: string;
  outletId: string;
  outletName: string;
  brandName: string;
  outletInspectionStatus: PlatformInspectionStatus;
  outletSafetyScore: number | null;
  status: OrderStatus;
  version: number;
  currency: 'INR';
  pricingBreakdown: CheckoutPricingBreakdownDto;
  couponCode: string | null;
  addressSnapshot: QuoteAddressSnapshotDto;
  estimatedDeliveryMinutes: number;
  specialInstructions: string | null;
  deliveryOtp: string;
  cancellation: {
    reasonCode: OrderCancelReason;
    note: string | null;
    cancelledByUserId: string;
    cancelledByRole: UserRole | 'SYSTEM';
    cancelledAt: Date;
    refundStatus: OrderRefundStatus;
    refundAmountPaise: number;
  } | null;
  confirmedAt: Date | null;
  preparingAt: Date | null;
  readyForPickupAt: Date | null;
  outForDeliveryAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItemRecord {
  orderItemId: string;
  orderId: string;
  menuItemId: string;
  title: string;
  dietaryType: DietaryType;
  allergens: AllergenCode[];
  gstTaxSlab: GstTaxSlab;
  quantity: number;
  unitPricePaise: number;
  lineTotalPaise: number;
  selectionSummary: string;
  createdAt: Date;
}

export interface OrderEventRecord {
  eventId: string;
  orderId: string;
  eventType: OrderEventType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorId: string;
  actorRole: UserRole | 'SYSTEM';
  note: string;
  occurredAt: Date;
}

export interface OutboxEventRecord {
  outboxEventId: string;
  eventType: string;
  aggregateType: 'ORDER';
  aggregateId: string;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'PUBLISHED';
  occurredAt: Date;
}

export interface OrderIdempotencyKeyRecord {
  operation: string;
  key: string;
  actorId: string;
  requestHash: string;
  responseStatus: number;
  orderId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface CreateOrderBundleInput {
  order: OrderRecord;
  items: OrderItemRecord[];
  events: OrderEventRecord[];
  outboxEvents: OutboxEventRecord[];
}

export type CreateOrderBundleResult =
  | { created: true; order: OrderRecord }
  | { created: false; conflictReason: 'QUOTE_ALREADY_ORDERED' | 'DUPLICATE_ORDER_ID' };

export interface TransitionOrderAtomicallyInput {
  orderId: string;
  expectedStatuses: readonly OrderStatus[];
  expectedVersion: number;
  patch: {
    status: OrderStatus;
    paymentId?: string | null;
    cancellation?: OrderRecord['cancellation'];
    confirmedAt?: Date | null;
    preparingAt?: Date | null;
    readyForPickupAt?: Date | null;
    outForDeliveryAt?: Date | null;
    deliveredAt?: Date | null;
    cancelledAt?: Date | null;
    updatedAt: Date;
  };
  event: OrderEventRecord;
  outboxEvents?: readonly OutboxEventRecord[];
}

export type TransitionOrderAtomicallyResult =
  { updated: true; order: OrderRecord } | { updated: false; currentOrder: OrderRecord | null };

export interface OrderStore {
  createOrderBundleAtomically(input: CreateOrderBundleInput): Promise<CreateOrderBundleResult>;
  getOrderById(orderId: string): Promise<OrderRecord | null>;
  getOrderByQuoteId(quoteId: string): Promise<OrderRecord | null>;
  listOrdersByCustomer(
    customerId: string,
    options?: { limit?: number; cursor?: string },
  ): Promise<{ orders: OrderRecord[]; nextCursor: string | null; totalCount: number }>;
  listOrdersByOutlet(
    outletId: string,
    options?: { status?: OrderStatus; limit?: number },
  ): Promise<OrderRecord[]>;
  listOrderItems(orderId: string): Promise<OrderItemRecord[]>;
  listOrderEvents(orderId: string): Promise<OrderEventRecord[]>;
  listOutboxEventsForAggregate(aggregateId: string): Promise<OutboxEventRecord[]>;
  transitionOrderAtomically(
    input: TransitionOrderAtomicallyInput,
  ): Promise<TransitionOrderAtomicallyResult>;
  findIdempotencyKey(operation: string, key: string): Promise<OrderIdempotencyKeyRecord | null>;
  saveIdempotencyKeyIfAbsent(
    record: OrderIdempotencyKeyRecord,
  ): Promise<{ inserted: boolean; record: OrderIdempotencyKeyRecord }>;
}
