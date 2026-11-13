import crypto from 'node:crypto';
import type {
  CancelOrderRequestDto,
  CreateOrderResultDto,
  OrderCancellationEligibilityDto,
  OrderCancelReason,
  OrderDto,
  OrderEventDto,
  OrderEventType,
  OrderItemSnapshotDto,
  OrderListResponseDto,
  OrderRefundStatus,
  OrderStatus,
  OrderTrackingDto,
  OrderTrackingStepDto,
  PaymentAttemptDto,
  TransitionOrderStatusRequestDto,
  UserRole,
} from '@bhojora/shared';
import { z } from 'zod';
import type { Logger } from '../../config/logger';
import { AppError } from '../../middleware/error-handler';
import type { CartService } from '../cart/cart.service';
import { formatInrFromPaise } from '../catalog/catalog.types';
import { SYSTEM_CLOCK, type Clock } from '../identity/identity.types';
import type { PaymentStore } from '../payments/payments.types';
import type { PricingService } from '../pricing/pricing.service';
import { hasOutletMembership, hasPermissionForRole } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { RestaurantStore } from '../restaurant/restaurant.types';
import {
  CUSTOMER_CANCELLABLE_STATUSES_SET,
  CUSTOMER_SELF_CANCEL_REASONS_SET,
  FORBIDDEN_CLIENT_ORDER_OVERRIDE_FIELDS,
  ORDER_CANCEL_REASONS_RUNTIME,
  ORDER_IDEMPOTENCY_TTL_SECONDS,
  ORDER_STATUS_LABELS_MAP,
  ORDER_STATUSES_RUNTIME,
  ORDER_VALID_TRANSITIONS_MAP,
  OUTLET_CANCELLABLE_STATUSES_SET,
  TERMINAL_ORDER_STATUSES_SET,
  type OrderEventRecord,
  type OrderItemRecord,
  type OrderRecord,
  type OrderStore,
  type OutboxEventRecord,
} from './orders.types';

const createOrderSchema = z
  .object({
    quoteId: z.string().trim().min(4).max(80),
    paymentId: z.string().trim().min(4).max(80).optional(),
    specialInstructions: z.string().trim().max(240).optional(),
  })
  .strict();

const cancelOrderSchema = z
  .object({
    reasonCode: z.enum(ORDER_CANCEL_REASONS_RUNTIME),
    note: z.string().trim().max(240).optional(),
  })
  .strict();

const transitionOrderStatusSchema = z
  .object({
    status: z.enum(ORDER_STATUSES_RUNTIME),
    prepTimeMinutes: z.number().int().min(5).max(180).optional(),
    note: z.string().trim().max(240).optional(),
  })
  .strict();

const updatePrepTimeSchema = z
  .object({
    prepTimeMinutes: z.number().int().min(5).max(180),
    note: z.string().trim().max(240).optional(),
  })
  .strict();

const rejectOrderSchema = z
  .object({
    reasonCode: z.enum(ORDER_CANCEL_REASONS_RUNTIME).default('OUTLET_OUT_OF_STOCK'),
    note: z.string().trim().max(240).optional(),
  })
  .strict();

const TRACKING_LINEAR_STEPS: ReadonlyArray<Exclude<OrderStatus, 'CANCELLED'>> = [
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

function assertNoClientOrderOverrides(
  rawBody: unknown,
  endpointLabel: string,
  allowStatusField = false,
  allowPrepTimeField = false,
): void {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return;
  }
  const obj = rawBody as Record<string, unknown>;
  for (const field of FORBIDDEN_CLIENT_ORDER_OVERRIDE_FIELDS) {
    if (allowStatusField && field === 'status') {
      continue;
    }
    if (allowPrepTimeField && field === 'prepTimeMinutes') {
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(obj, field)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Client-supplied field "${field}" is forbidden on ${endpointLabel}; order state and totals are server-authoritative`,
        [
          {
            field,
            code: 'CLIENT_ORDER_OVERRIDE_FORBIDDEN',
            issue: 'Server derives state, sequence, and INR paise totals from signed quote',
          },
        ],
      );
    }
  }
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

function stableCreateOrderHash(payload: z.infer<typeof createOrderSchema>): string {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        quoteId: payload.quoteId,
        paymentId: payload.paymentId ?? null,
        specialInstructions: payload.specialInstructions ?? null,
      }),
    )
    .digest('hex');
}

function generateOrderNumber(now: Date): string {
  const year = now.getUTCFullYear();
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BHJ-${year}-${suffix}`;
}

function generateDeliveryOtp(): string {
  return String(crypto.randomInt(1000, 9999));
}

export function evaluateCancellationEligibility(
  status: OrderStatus,
): OrderCancellationEligibilityDto {
  switch (status) {
    case 'AWAITING_PAYMENT':
      return {
        customerCanCancel: true,
        reason: 'Free cancellation available while awaiting payment capture.',
        eligibleRefundStatus: 'NOT_REQUIRED',
      };
    case 'CONFIRMED':
      return {
        customerCanCancel: true,
        reason: 'Full refund eligible before kitchen begins preparing your order.',
        eligibleRefundStatus: 'QUEUED_FULL_REFUND',
      };
    case 'PREPARING':
      return {
        customerCanCancel: false,
        reason:
          'Kitchen has already started preparing your food; self-cancellation is closed. Contact support for help.',
        eligibleRefundStatus: 'PENDING_REVIEW',
      };
    case 'READY_FOR_PICKUP':
      return {
        customerCanCancel: false,
        reason: 'Order is packed for rider pickup and cannot be self-cancelled.',
        eligibleRefundStatus: 'PENDING_REVIEW',
      };
    case 'OUT_FOR_DELIVERY':
      return {
        customerCanCancel: false,
        reason: 'Rider is already on the way with your order.',
        eligibleRefundStatus: 'PENDING_REVIEW',
      };
    case 'DELIVERED':
      return {
        customerCanCancel: false,
        reason: 'Order has already been delivered.',
        eligibleRefundStatus: 'NOT_REQUIRED',
      };
    case 'CANCELLED':
      return {
        customerCanCancel: false,
        reason: 'Order has already been cancelled.',
        eligibleRefundStatus: 'NOT_REQUIRED',
      };
  }
}

function eventTypeForTransition(toStatus: OrderStatus): OrderEventType {
  switch (toStatus) {
    case 'AWAITING_PAYMENT':
      return 'ORDER_CREATED';
    case 'CONFIRMED':
      return 'ORDER_CONFIRMED';
    case 'PREPARING':
      return 'ORDER_PREPARING_STARTED';
    case 'READY_FOR_PICKUP':
      return 'ORDER_READY_FOR_PICKUP';
    case 'OUT_FOR_DELIVERY':
      return 'ORDER_OUT_FOR_DELIVERY';
    case 'DELIVERED':
      return 'ORDER_DELIVERED';
    case 'CANCELLED':
      return 'ORDER_CANCELLED';
  }
}

function outboxTypeForStatus(status: OrderStatus): string | null {
  switch (status) {
    case 'CONFIRMED':
      return 'ORDER_CONFIRMED';
    case 'READY_FOR_PICKUP':
      return 'ORDER_READY_FOR_PICKUP';
    case 'DELIVERED':
      return 'ORDER_DELIVERED';
    case 'CANCELLED':
      return 'ORDER_CANCELLED';
    default:
      return null;
  }
}

export interface OrderServiceOptions {
  orderStore: OrderStore;
  pricingService: PricingService;
  cartService: CartService;
  restaurantStore: RestaurantStore;
  paymentStore?: PaymentStore;
  rbacStore?: RbacStore;
  logger: Logger;
  clock?: Clock;
}

export class OrderService {
  private readonly orderStore: OrderStore;
  private readonly pricingService: PricingService;
  private readonly cartService: CartService;
  private readonly restaurantStore: RestaurantStore;
  private readonly paymentStore?: PaymentStore;
  private readonly rbacStore?: RbacStore;
  private readonly logger: Logger;
  private readonly clock: Clock;

  constructor(options: OrderServiceOptions) {
    this.orderStore = options.orderStore;
    this.pricingService = options.pricingService;
    this.cartService = options.cartService;
    this.restaurantStore = options.restaurantStore;
    this.paymentStore = options.paymentStore;
    this.rbacStore = options.rbacStore;
    this.logger = options.logger;
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  private toItemDto(record: OrderItemRecord): OrderItemSnapshotDto {
    return {
      orderItemId: record.orderItemId,
      orderId: record.orderId,
      menuItemId: record.menuItemId,
      title: record.title,
      dietaryType: record.dietaryType,
      allergens: [...record.allergens],
      gstTaxSlab: record.gstTaxSlab,
      quantity: record.quantity,
      unitPricePaise: record.unitPricePaise,
      lineTotalPaise: record.lineTotalPaise,
      formattedLineTotalInr: formatInrFromPaise(record.lineTotalPaise),
      selectionSummary: record.selectionSummary,
    };
  }

  private toEventDto(record: OrderEventRecord): OrderEventDto {
    return {
      eventId: record.eventId,
      orderId: record.orderId,
      eventType: record.eventType,
      fromStatus: record.fromStatus,
      toStatus: record.toStatus,
      actorId: record.actorId,
      actorRole: record.actorRole,
      note: record.note,
      occurredAt: record.occurredAt.toISOString(),
    };
  }

  private async hydrateOrderDto(order: OrderRecord, revealOtp = true): Promise<OrderDto> {
    const items = await this.orderStore.listOrderItems(order.orderId);
    return {
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      quoteId: order.quoteId,
      paymentId: order.paymentId,
      outletId: order.outletId,
      outletName: order.outletName,
      brandName: order.brandName,
      outletInspectionStatus: order.outletInspectionStatus,
      outletSafetyScore: order.outletSafetyScore,
      status: order.status,
      version: order.version,
      currency: 'INR',
      pricingBreakdown: { ...order.pricingBreakdown },
      couponCode: order.couponCode,
      formattedTotalPayableInr: formatInrFromPaise(order.pricingBreakdown.totalPayablePaise),
      addressSnapshot: {
        ...order.addressSnapshot,
        coordinates: [...order.addressSnapshot.coordinates],
      },
      estimatedDeliveryMinutes: order.estimatedDeliveryMinutes,
      prepTimeMinutes: order.prepTimeMinutes,
      specialInstructions: order.specialInstructions,
      deliveryOtp: revealOtp ? order.deliveryOtp : null,
      items: items.map((item) => this.toItemDto(item)),
      cancellationEligibility: evaluateCancellationEligibility(order.status),
      cancellation: order.cancellation
        ? {
            reasonCode: order.cancellation.reasonCode,
            note: order.cancellation.note,
            cancelledByUserId: order.cancellation.cancelledByUserId,
            cancelledByRole: order.cancellation.cancelledByRole,
            cancelledAt: order.cancellation.cancelledAt.toISOString(),
            refundStatus: order.cancellation.refundStatus,
            refundAmountPaise: order.cancellation.refundAmountPaise,
          }
        : null,
      confirmedAt: order.confirmedAt ? order.confirmedAt.toISOString() : null,
      preparingAt: order.preparingAt ? order.preparingAt.toISOString() : null,
      readyForPickupAt: order.readyForPickupAt ? order.readyForPickupAt.toISOString() : null,
      outForDeliveryAt: order.outForDeliveryAt ? order.outForDeliveryAt.toISOString() : null,
      deliveredAt: order.deliveredAt ? order.deliveredAt.toISOString() : null,
      cancelledAt: order.cancelledAt ? order.cancelledAt.toISOString() : null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  private async replayFromIdempotency(
    idempotencyKey: string,
    customerId: string,
    requestHash: string,
    now: Date,
  ): Promise<{ httpStatus: 200; result: CreateOrderResultDto } | null> {
    const existing = await this.orderStore.findIdempotencyKey('orders.create', idempotencyKey);
    if (!existing || existing.expiresAt.getTime() <= now.getTime()) {
      return null;
    }
    if (existing.actorId !== customerId || existing.requestHash !== requestHash) {
      throw new AppError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'Idempotency-Key was already used with a different order payload or actor',
      );
    }
    const order = await this.orderStore.getOrderById(existing.orderId);
    if (!order) {
      return null;
    }
    const events = await this.orderStore.listOrderEvents(order.orderId);
    return {
      httpStatus: 200,
      result: {
        idempotentReplay: true,
        paymentAttached: Boolean(order.paymentId),
        order: await this.hydrateOrderDto(order, true),
        events: events.map((e) => this.toEventDto(e)),
      },
    };
  }

  private async assertReadAccess(
    order: OrderRecord,
    actorUserId: string,
    actorRole: UserRole,
    action: string,
    requestId: string,
  ): Promise<{ isCustomer: boolean }> {
    if (order.customerId === actorUserId) {
      return { isCustomer: true };
    }

    if (
      hasPermissionForRole(actorRole, 'support:ticket:read') ||
      hasPermissionForRole(actorRole, 'ops:outlet:manage') ||
      hasPermissionForRole(actorRole, 'delivery:job:update')
    ) {
      return { isCustomer: false };
    }

    if (hasPermissionForRole(actorRole, 'restaurant:order:manage') && this.rbacStore) {
      const memberships = await this.rbacStore.listMembershipsForUser(actorUserId);
      if (hasOutletMembership(memberships, order.restaurantId, order.outletId)) {
        return { isCustomer: false };
      }
    }

    if (this.rbacStore) {
      await this.rbacStore.appendAuditLog({
        actorId: actorUserId,
        actorRole,
        action,
        resourceType: 'order',
        resourceId: order.orderId,
        outcome: 'DENIED',
        reason: 'Cross-customer / cross-tenant order access blocked',
        requestId,
      });
    }

    throw new AppError(403, 'FORBIDDEN', 'You do not have access to this order');
  }

  async createOrder(
    customerId: string,
    idempotencyKeyHeader: string | string[] | undefined,
    rawBody: unknown,
    _requestId = 'unknown-request',
  ): Promise<{ httpStatus: 200 | 201; result: CreateOrderResultDto }> {
    assertNoClientOrderOverrides(rawBody, 'POST /orders');
    const idempotencyKey = normalizeIdempotencyKey(idempotencyKeyHeader);
    const parsed = createOrderSchema.parse(rawBody);
    const now = this.clock.now();
    const requestHash = stableCreateOrderHash(parsed);

    const replay = await this.replayFromIdempotency(idempotencyKey, customerId, requestHash, now);
    if (replay) {
      return replay;
    }

    const { quote } = await this.pricingService.verifyQuoteForCheckout(customerId, parsed.quoteId);

    const outlet = await this.restaurantStore.getOutletById(quote.outletId);
    if (!outlet) {
      throw new AppError(404, 'NOT_FOUND', `Outlet "${quote.outletId}" not found`);
    }
    if (outlet.status === 'SUSPENDED' || outlet.platformInspectionStatus === 'SUSPENDED') {
      throw new AppError(
        403,
        'CRITICAL_VIOLATION_SUSPENDED',
        `Outlet "${outlet.name}" is suspended for food safety or compliance`,
      );
    }

    // Optional linked payment verification (either explicit paymentId or captured payment for quoteId)
    let linkedPaymentId: string | null = null;
    let initialStatus: OrderStatus = 'AWAITING_PAYMENT';
    let confirmedAt: Date | null = null;

    if (parsed.paymentId) {
      if (!this.paymentStore) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Payment linkage store unavailable');
      }
      const payment = await this.paymentStore.getPaymentById(parsed.paymentId);
      if (!payment || payment.quoteId !== quote.quoteId) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Payment "${parsed.paymentId}" does not match quote "${quote.quoteId}"`,
        );
      }
      if (payment.customerId !== customerId) {
        throw new AppError(403, 'FORBIDDEN', 'You do not have access to this payment attempt');
      }
      if (payment.status === 'FAILED' || payment.status === 'CANCELLED') {
        throw new AppError(
          409,
          'CONFLICT',
          `Payment "${payment.paymentId}" is in status ${payment.status} and cannot fund an order`,
        );
      }
      linkedPaymentId = payment.paymentId;
      if (payment.status === 'CAPTURED') {
        initialStatus = 'CONFIRMED';
        confirmedAt = now;
      }
    } else if (this.paymentStore) {
      const existingPayments = await this.paymentStore.listPaymentsByQuoteId(quote.quoteId);
      const capturedPayment = existingPayments.find(
        (p) => p.customerId === customerId && p.status === 'CAPTURED',
      );
      if (capturedPayment) {
        linkedPaymentId = capturedPayment.paymentId;
        initialStatus = 'CONFIRMED';
        confirmedAt = now;
      }
    }

    const orderId = `ord_${crypto.randomUUID()}`;
    const orderNumber = generateOrderNumber(now);
    const orderRecord: OrderRecord = {
      orderId,
      orderNumber,
      customerId,
      quoteId: quote.quoteId,
      paymentId: linkedPaymentId,
      restaurantId: outlet.restaurantId,
      outletId: outlet.outletId,
      outletName: quote.outletName,
      brandName: quote.brandName,
      outletInspectionStatus: quote.outletInspectionStatus,
      outletSafetyScore: quote.outletSafetyScore,
      status: initialStatus,
      version: 1,
      currency: 'INR',
      pricingBreakdown: { ...quote.pricingBreakdown },
      couponCode: quote.couponAllocation?.couponCode ?? null,
      addressSnapshot: {
        ...quote.addressSnapshot,
        coordinates: [...quote.addressSnapshot.coordinates],
      },
      estimatedDeliveryMinutes: quote.estimatedDeliveryMinutes,
      prepTimeMinutes: outlet.prepTimeMinutes ?? null,
      specialInstructions: parsed.specialInstructions?.trim() || null,
      deliveryOtp: generateDeliveryOtp(),
      cancellation: null,
      confirmedAt,
      preparingAt: null,
      readyForPickupAt: null,
      outForDeliveryAt: null,
      deliveredAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    };

    const currentCart = await this.cartService.getCart(customerId);
    const cartItemById = new Map(currentCart.items.map((entry) => [entry.cartItemId, entry]));
    const items: OrderItemRecord[] = quote.lineItems.map((line) => {
      const matchedCart = cartItemById.get(line.cartItemId);
      const selectionSummary = matchedCart
        ? [
            ...matchedCart.selectedVariants.map((v) => v.label),
            ...matchedCart.selectedAddons.map((a) => `+ ${a.label}`),
          ].join(' · ')
        : '';
      return {
        orderItemId: `oitm_${crypto.randomUUID()}`,
        orderId,
        menuItemId: line.menuItemId,
        title: line.title,
        dietaryType: matchedCart?.dietaryType ?? 'PURE_VEG',
        allergens: matchedCart ? [...matchedCart.allergens] : [],
        gstTaxSlab: line.gstTaxSlab,
        quantity: line.quantity,
        unitPricePaise: line.unitPricePaise,
        lineTotalPaise: line.lineSubtotalPaise,
        selectionSummary,
        createdAt: now,
      };
    });

    const events: OrderEventRecord[] = [
      {
        eventId: `oevt_${crypto.randomUUID()}`,
        orderId,
        eventType: 'ORDER_CREATED',
        fromStatus: null,
        toStatus: 'AWAITING_PAYMENT',
        actorId: customerId,
        actorRole: 'CUSTOMER',
        note: `Created ${orderNumber} from server-signed quote ${quote.quoteId} (${formatInrFromPaise(
          quote.pricingBreakdown.totalPayablePaise,
        )})`,
        occurredAt: now,
      },
    ];

    const outboxEvents: OutboxEventRecord[] = [];
    if (initialStatus === 'CONFIRMED' && linkedPaymentId) {
      events.push({
        eventId: `oevt_${crypto.randomUUID()}`,
        orderId,
        eventType: 'ORDER_CONFIRMED',
        fromStatus: 'AWAITING_PAYMENT',
        toStatus: 'CONFIRMED',
        actorId: 'SYSTEM',
        actorRole: 'SYSTEM',
        note: `Verified payment ${linkedPaymentId} captured (${formatInrFromPaise(
          quote.pricingBreakdown.totalPayablePaise,
        )})`,
        occurredAt: new Date(now.getTime() + 1),
      });
      outboxEvents.push({
        outboxEventId: `obx_${crypto.randomUUID()}`,
        eventType: 'ORDER_CONFIRMED',
        aggregateType: 'ORDER',
        aggregateId: orderId,
        payload: {
          orderId,
          orderNumber,
          customerId,
          outletId: outlet.outletId,
          totalAmountPaise: quote.pricingBreakdown.totalPayablePaise,
          paymentId: linkedPaymentId,
        },
        status: 'PENDING',
        occurredAt: new Date(now.getTime() + 1),
      });
    }

    const createResult = await this.orderStore.createOrderBundleAtomically({
      order: orderRecord,
      items,
      events,
      outboxEvents,
    });

    if (!createResult.created) {
      // Check if an identical concurrent Idempotency-Key request won just before us
      const concurrentReplay = await this.replayFromIdempotency(
        idempotencyKey,
        customerId,
        requestHash,
        now,
      );
      if (concurrentReplay) {
        return concurrentReplay;
      }
      throw new AppError(
        409,
        'CONFLICT',
        `Checkout quote "${quote.quoteId}" has already been used for another order`,
      );
    }

    await this.orderStore.saveIdempotencyKeyIfAbsent({
      operation: 'orders.create',
      key: idempotencyKey,
      actorId: customerId,
      requestHash,
      responseStatus: 201,
      orderId: createResult.order.orderId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ORDER_IDEMPOTENCY_TTL_SECONDS * 1000),
    });

    await this.pricingService.markQuoteConsumed(quote.quoteId);
    if (quote.couponAllocation?.couponCode) {
      await this.pricingService.recordCouponRedemption(
        quote.couponAllocation.couponCode,
        customerId,
      );
    }
    await this.cartService.clearCart(customerId);

    this.logger.info('orders.created', {
      orderId: createResult.order.orderId,
      orderNumber: createResult.order.orderNumber,
      customerId,
      outletId: outlet.outletId,
      status: createResult.order.status,
      totalPayablePaise: createResult.order.pricingBreakdown.totalPayablePaise,
    });

    return {
      httpStatus: 201,
      result: {
        idempotentReplay: false,
        paymentAttached: Boolean(linkedPaymentId),
        order: await this.hydrateOrderDto(createResult.order, true),
        events: events.map((e) => this.toEventDto(e)),
      },
    };
  }

  async confirmOrderFromPayment(payment: PaymentAttemptDto): Promise<OrderDto | null> {
    if (payment.status !== 'CAPTURED') {
      return null;
    }
    const order = await this.orderStore.getOrderByQuoteId(payment.quoteId);
    if (!order || order.status !== 'AWAITING_PAYMENT') {
      return order ? this.hydrateOrderDto(order, true) : null;
    }

    const now = this.clock.now();
    const res = await this.orderStore.transitionOrderAtomically({
      orderId: order.orderId,
      expectedStatuses: ['AWAITING_PAYMENT'],
      expectedVersion: order.version,
      patch: {
        status: 'CONFIRMED',
        paymentId: payment.paymentId,
        confirmedAt: now,
        updatedAt: now,
      },
      event: {
        eventId: `oevt_${crypto.randomUUID()}`,
        orderId: order.orderId,
        eventType: 'ORDER_CONFIRMED',
        fromStatus: 'AWAITING_PAYMENT',
        toStatus: 'CONFIRMED',
        actorId: payment.customerId,
        actorRole: 'SYSTEM',
        note: `Payment ${payment.paymentId} verified & captured via ${payment.provider}`,
        occurredAt: now,
      },
      outboxEvents: [
        {
          outboxEventId: `obx_${crypto.randomUUID()}`,
          eventType: 'ORDER_CONFIRMED',
          aggregateType: 'ORDER',
          aggregateId: order.orderId,
          payload: {
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            customerId: order.customerId,
            outletId: order.outletId,
            totalAmountPaise: order.pricingBreakdown.totalPayablePaise,
            paymentId: payment.paymentId,
          },
          status: 'PENDING',
          occurredAt: now,
        },
      ],
    });

    if (!res.updated) {
      return res.currentOrder ? this.hydrateOrderDto(res.currentOrder, true) : null;
    }

    this.logger.info('orders.confirmed_from_payment', {
      orderId: order.orderId,
      paymentId: payment.paymentId,
    });
    return this.hydrateOrderDto(res.order, true);
  }

  async listOrdersForCustomer(
    customerId: string,
    options: { limit?: number; cursor?: string } = {},
  ): Promise<OrderListResponseDto> {
    const { orders, nextCursor, totalCount } = await this.orderStore.listOrdersByCustomer(
      customerId,
      options,
    );
    const hydrated = await Promise.all(orders.map((order) => this.hydrateOrderDto(order, true)));
    return {
      orders: hydrated,
      nextCursor,
      totalCount,
    };
  }

  async listOrdersForOutlet(
    outletId: string,
    actorUserId: string,
    actorRole: UserRole,
    options: { status?: OrderStatus; limit?: number } = {},
    requestId = 'unknown-request',
  ): Promise<OrderDto[]> {
    const outlet = await this.restaurantStore.getOutletById(outletId);
    if (!outlet) {
      throw new AppError(404, 'NOT_FOUND', `Outlet "${outletId}" not found`);
    }

    const isOps = hasPermissionForRole(actorRole, 'ops:outlet:manage');
    if (!isOps) {
      if (!this.rbacStore || !hasPermissionForRole(actorRole, 'restaurant:order:manage')) {
        throw new AppError(403, 'FORBIDDEN', 'Role lacks permission to view outlet orders');
      }
      const memberships = await this.rbacStore.listMembershipsForUser(actorUserId);
      if (!hasOutletMembership(memberships, outlet.restaurantId, outlet.outletId)) {
        await this.rbacStore.appendAuditLog({
          actorId: actorUserId,
          actorRole,
          action: 'restaurant.orders.list',
          resourceType: 'outlet',
          resourceId: outletId,
          outcome: 'DENIED',
          reason: 'Cross-outlet order list access denied',
          requestId,
        });
        throw new AppError(403, 'FORBIDDEN', 'You do not belong to this outlet');
      }
    }

    const orders = await this.orderStore.listOrdersByOutlet(outletId, options);
    return Promise.all(orders.map((o) => this.hydrateOrderDto(o, false)));
  }

  async getOrderForActor(
    orderId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId = 'unknown-request',
  ): Promise<{ order: OrderDto; events: OrderEventDto[] }> {
    const order = await this.orderStore.getOrderById(orderId);
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', `Order "${orderId}" not found`);
    }

    const { isCustomer } = await this.assertReadAccess(
      order,
      actorUserId,
      actorRole,
      'orders.read',
      requestId,
    );
    const events = await this.orderStore.listOrderEvents(order.orderId);
    return {
      order: await this.hydrateOrderDto(order, isCustomer),
      events: events.map((e) => this.toEventDto(e)),
    };
  }

  async getOrderTracking(
    orderId: string,
    actorUserId: string,
    actorRole: UserRole,
    requestId = 'unknown-request',
  ): Promise<OrderTrackingDto> {
    const order = await this.orderStore.getOrderById(orderId);
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', `Order "${orderId}" not found`);
    }

    const { isCustomer } = await this.assertReadAccess(
      order,
      actorUserId,
      actorRole,
      'orders.tracking.read',
      requestId,
    );
    const events = await this.orderStore.listOrderEvents(order.orderId);

    const timestampByStep: Record<Exclude<OrderStatus, 'CANCELLED'>, Date | null> = {
      AWAITING_PAYMENT: order.createdAt,
      CONFIRMED: order.confirmedAt,
      PREPARING: order.preparingAt,
      READY_FOR_PICKUP: order.readyForPickupAt,
      OUT_FOR_DELIVERY: order.outForDeliveryAt,
      DELIVERED: order.deliveredAt,
    };

    const currentLinearIndex =
      order.status === 'CANCELLED' ? -1 : TRACKING_LINEAR_STEPS.indexOf(order.status);

    const steps: OrderTrackingStepDto[] = TRACKING_LINEAR_STEPS.map((stepStatus, index) => {
      const ts = timestampByStep[stepStatus];
      let state: OrderTrackingStepDto['state'];
      if (order.status === 'CANCELLED') {
        state = ts ? 'completed' : 'skipped';
      } else if (stepStatus === order.status) {
        state = stepStatus === 'DELIVERED' ? 'completed' : 'current';
      } else if (index < currentLinearIndex) {
        state = 'completed';
      } else {
        state = 'upcoming';
      }
      return {
        status: stepStatus,
        label: ORDER_STATUS_LABELS_MAP[stepStatus],
        state,
        timestamp: ts ? ts.toISOString() : null,
      };
    });

    return {
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS_MAP[order.status],
      outletId: order.outletId,
      outletName: order.outletName,
      brandName: order.brandName,
      estimatedDeliveryMinutes: order.estimatedDeliveryMinutes,
      deliveryOtp: isCustomer ? order.deliveryOtp : null,
      cancellationEligibility: evaluateCancellationEligibility(order.status),
      cancellation: order.cancellation
        ? {
            reasonCode: order.cancellation.reasonCode,
            note: order.cancellation.note,
            cancelledByUserId: order.cancellation.cancelledByUserId,
            cancelledByRole: order.cancellation.cancelledByRole,
            cancelledAt: order.cancellation.cancelledAt.toISOString(),
            refundStatus: order.cancellation.refundStatus,
            refundAmountPaise: order.cancellation.refundAmountPaise,
          }
        : null,
      steps,
      events: events.map((e) => this.toEventDto(e)),
      updatedAt: order.updatedAt.toISOString(),
    };
  }

  async cancelOrder(
    orderId: string,
    actorUserId: string,
    actorRole: UserRole,
    rawBody: unknown,
    requestId = 'unknown-request',
  ): Promise<{ order: OrderDto; events: OrderEventDto[] }> {
    assertNoClientOrderOverrides(rawBody, `POST /orders/${orderId}/cancel`);
    const parsed: CancelOrderRequestDto = cancelOrderSchema.parse(rawBody);

    const order = await this.orderStore.getOrderById(orderId);
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', `Order "${orderId}" not found`);
    }

    const isOpsOrSupport =
      hasPermissionForRole(actorRole, 'ops:outlet:manage') ||
      hasPermissionForRole(actorRole, 'support:ticket:resolve');
    const isCustomerOwner = order.customerId === actorUserId;

    let isAuthorizedOutletStaff = false;
    if (
      !isCustomerOwner &&
      !isOpsOrSupport &&
      hasPermissionForRole(actorRole, 'restaurant:order:manage') &&
      this.rbacStore
    ) {
      const memberships = await this.rbacStore.listMembershipsForUser(actorUserId);
      isAuthorizedOutletStaff = hasOutletMembership(
        memberships,
        order.restaurantId,
        order.outletId,
      );
    }

    if (!isCustomerOwner && !isOpsOrSupport && !isAuthorizedOutletStaff) {
      if (this.rbacStore) {
        await this.rbacStore.appendAuditLog({
          actorId: actorUserId,
          actorRole,
          action: 'orders.cancel',
          resourceType: 'order',
          resourceId: orderId,
          outcome: 'DENIED',
          reason: 'Unauthorized order cancellation attempt',
          requestId,
        });
      }
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to cancel this order');
    }

    if (TERMINAL_ORDER_STATUSES_SET.has(order.status)) {
      throw new AppError(
        409,
        'CONFLICT',
        `Order "${order.orderNumber}" is already in terminal state ${order.status} and cannot be cancelled`,
      );
    }

    if (isCustomerOwner && !isOpsOrSupport) {
      if (!CUSTOMER_CANCELLABLE_STATUSES_SET.has(order.status)) {
        const eligibility = evaluateCancellationEligibility(order.status);
        throw new AppError(409, 'CONFLICT', eligibility.reason, [
          {
            field: 'status',
            code: 'CANCELLATION_WINDOW_CLOSED',
            issue: `Customer self-cancellation is only allowed in AWAITING_PAYMENT or CONFIRMED; current state is ${order.status}`,
          },
        ]);
      }
      if (
        !CUSTOMER_SELF_CANCEL_REASONS_SET.has(parsed.reasonCode) &&
        parsed.reasonCode !== 'PAYMENT_FAILED'
      ) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Reason "${parsed.reasonCode}" cannot be selected by customer self-service cancellation`,
        );
      }
    } else if (isAuthorizedOutletStaff && !isOpsOrSupport) {
      if (!OUTLET_CANCELLABLE_STATUSES_SET.has(order.status)) {
        throw new AppError(
          409,
          'CONFLICT',
          `Outlet staff can cancel orders only in CONFIRMED or PREPARING; current state is ${order.status}`,
        );
      }
    }

    const now = this.clock.now();
    const refundStatus: OrderRefundStatus =
      order.status === 'AWAITING_PAYMENT' && !order.paymentId
        ? 'NOT_REQUIRED'
        : 'QUEUED_FULL_REFUND';
    const refundAmountPaise =
      refundStatus === 'NOT_REQUIRED' ? 0 : order.pricingBreakdown.totalPayablePaise;

    const noteSuffix = parsed.note?.trim() ? ` — ${parsed.note.trim()}` : '';
    const transitionResult = await this.orderStore.transitionOrderAtomically({
      orderId: order.orderId,
      expectedStatuses: [order.status],
      expectedVersion: order.version,
      patch: {
        status: 'CANCELLED',
        cancellation: {
          reasonCode: parsed.reasonCode as OrderCancelReason,
          note: parsed.note?.trim() || null,
          cancelledByUserId: actorUserId,
          cancelledByRole: actorRole,
          cancelledAt: now,
          refundStatus,
          refundAmountPaise,
        },
        cancelledAt: now,
        updatedAt: now,
      },
      event: {
        eventId: `oevt_${crypto.randomUUID()}`,
        orderId: order.orderId,
        eventType: 'ORDER_CANCELLED',
        fromStatus: order.status,
        toStatus: 'CANCELLED',
        actorId: actorUserId,
        actorRole,
        note: `Cancelled (${parsed.reasonCode})${noteSuffix}; refund=${refundStatus}`,
        occurredAt: now,
      },
      outboxEvents: [
        {
          outboxEventId: `obx_${crypto.randomUUID()}`,
          eventType: 'ORDER_CANCELLED',
          aggregateType: 'ORDER',
          aggregateId: order.orderId,
          payload: {
            orderId: order.orderId,
            orderNumber: order.orderNumber,
            customerId: order.customerId,
            outletId: order.outletId,
            reasonCode: parsed.reasonCode,
            refundStatus,
            refundAmountPaise,
          },
          status: 'PENDING',
          occurredAt: now,
        },
      ],
    });

    if (!transitionResult.updated) {
      throw new AppError(
        409,
        'CONFLICT',
        `Concurrent order update prevented cancellation; order is now ${transitionResult.currentOrder?.status ?? 'unavailable'}`,
      );
    }

    const events = await this.orderStore.listOrderEvents(order.orderId);
    this.logger.info('orders.cancelled', {
      orderId: order.orderId,
      fromStatus: order.status,
      reasonCode: parsed.reasonCode,
      actorRole,
      refundStatus,
    });

    return {
      order: await this.hydrateOrderDto(transitionResult.order, isCustomerOwner),
      events: events.map((e) => this.toEventDto(e)),
    };
  }

  async transitionOrderStatus(
    orderId: string,
    actorUserId: string,
    actorRole: UserRole,
    rawBody: unknown,
    requestId = 'unknown-request',
  ): Promise<{ order: OrderDto; events: OrderEventDto[] }> {
    assertNoClientOrderOverrides(rawBody, `PATCH /orders/${orderId}/status`, true, true);
    const parsed: TransitionOrderStatusRequestDto = transitionOrderStatusSchema.parse(rawBody);

    const order = await this.orderStore.getOrderById(orderId);
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', `Order "${orderId}" not found`);
    }

    if (TERMINAL_ORDER_STATUSES_SET.has(order.status)) {
      throw new AppError(
        409,
        'CONFLICT',
        `Order "${order.orderNumber}" is already in terminal state ${order.status} and cannot transition to ${parsed.status}`,
      );
    }

    if (parsed.status === 'CANCELLED') {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Use POST /orders/:orderId/cancel with reasonCode to cancel an order',
      );
    }

    // Authorize actor BEFORE exposing or mutating state
    const isOps =
      hasPermissionForRole(actorRole, 'ops:outlet:manage') ||
      hasPermissionForRole(actorRole, 'system:admin:override');

    let authorized = isOps;
    if (!authorized) {
      if (parsed.status === 'PREPARING' || parsed.status === 'READY_FOR_PICKUP') {
        if (hasPermissionForRole(actorRole, 'restaurant:order:manage') && this.rbacStore) {
          const memberships = await this.rbacStore.listMembershipsForUser(actorUserId);
          authorized = hasOutletMembership(memberships, order.restaurantId, order.outletId);
        }
      } else if (parsed.status === 'OUT_FOR_DELIVERY' || parsed.status === 'DELIVERED') {
        authorized = hasPermissionForRole(actorRole, 'delivery:job:update');
      }
    }

    if (!authorized) {
      if (this.rbacStore) {
        await this.rbacStore.appendAuditLog({
          actorId: actorUserId,
          actorRole,
          action: `orders.transition.${parsed.status}`,
          resourceType: 'order',
          resourceId: orderId,
          outcome: 'DENIED',
          reason: `Role ${actorRole} cannot transition order to ${parsed.status}`,
          requestId,
        });
      }
      throw new AppError(
        403,
        'FORBIDDEN',
        `You do not have permission to transition this order to ${parsed.status}`,
      );
    }

    const allowedNext = ORDER_VALID_TRANSITIONS_MAP[order.status];
    if (!allowedNext.includes(parsed.status)) {
      throw new AppError(
        409,
        'CONFLICT',
        `Invalid order transition ${order.status} -> ${parsed.status}; allowed next states: [${allowedNext.join(', ') || 'NONE'}]`,
      );
    }

    const now = this.clock.now();
    const outboxType = outboxTypeForStatus(parsed.status);
    const outboxEvents: OutboxEventRecord[] = outboxType
      ? [
          {
            outboxEventId: `obx_${crypto.randomUUID()}`,
            eventType: outboxType,
            aggregateType: 'ORDER',
            aggregateId: order.orderId,
            payload: {
              orderId: order.orderId,
              orderNumber: order.orderNumber,
              customerId: order.customerId,
              outletId: order.outletId,
              status: parsed.status,
              totalAmountPaise: order.pricingBreakdown.totalPayablePaise,
            },
            status: 'PENDING',
            occurredAt: now,
          },
        ]
      : [];

    const transitionResult = await this.orderStore.transitionOrderAtomically({
      orderId: order.orderId,
      expectedStatuses: [order.status],
      expectedVersion: order.version,
      patch: {
        status: parsed.status,
        ...(parsed.status === 'CONFIRMED' ? { confirmedAt: now } : {}),
        ...(parsed.status === 'PREPARING'
          ? {
              preparingAt: now,
              ...(parsed.prepTimeMinutes !== undefined
                ? {
                    prepTimeMinutes: parsed.prepTimeMinutes,
                    estimatedDeliveryMinutes: Math.min(180, parsed.prepTimeMinutes + 15),
                  }
                : {}),
            }
          : {}),
        ...(parsed.status === 'READY_FOR_PICKUP' ? { readyForPickupAt: now } : {}),
        ...(parsed.status === 'OUT_FOR_DELIVERY' ? { outForDeliveryAt: now } : {}),
        ...(parsed.status === 'DELIVERED' ? { deliveredAt: now } : {}),
        updatedAt: now,
      },
      event: {
        eventId: `oevt_${crypto.randomUUID()}`,
        orderId: order.orderId,
        eventType: eventTypeForTransition(parsed.status),
        fromStatus: order.status,
        toStatus: parsed.status,
        actorId: actorUserId,
        actorRole,
        note:
          parsed.note?.trim() ||
          (parsed.status === 'PREPARING' && parsed.prepTimeMinutes
            ? `Accepted & preparing (prep time: ${parsed.prepTimeMinutes} mins)`
            : `Transitioned ${order.status} -> ${parsed.status} by ${actorRole}`),
        occurredAt: now,
      },
      outboxEvents,
    });

    if (!transitionResult.updated) {
      throw new AppError(
        409,
        'CONFLICT',
        `Concurrent state modification rejected; order is now ${transitionResult.currentOrder?.status ?? 'unavailable'}`,
      );
    }

    if (this.rbacStore) {
      await this.rbacStore.appendAuditLog({
        actorId: actorUserId,
        actorRole,
        action: `orders.transition.${parsed.status}`,
        resourceType: 'order',
        resourceId: order.orderId,
        outcome: 'ALLOWED',
        reason: `Status updated to ${parsed.status}`,
        requestId,
      });
    }

    const events = await this.orderStore.listOrderEvents(order.orderId);
    this.logger.info('orders.status_transitioned', {
      orderId: order.orderId,
      fromStatus: order.status,
      toStatus: parsed.status,
      actorRole,
    });

    return {
      order: await this.hydrateOrderDto(transitionResult.order, false),
      events: events.map((e) => this.toEventDto(e)),
    };
  }

  async updatePrepTime(
    orderId: string,
    actorUserId: string,
    actorRole: UserRole,
    rawBody: unknown,
    requestId = 'unknown-request',
  ): Promise<{ order: OrderDto; events: OrderEventDto[] }> {
    assertNoClientOrderOverrides(
      rawBody,
      `PATCH /restaurant/orders/${orderId}/prep-time`,
      false,
      true,
    );
    const parsed = updatePrepTimeSchema.parse(rawBody);

    const order = await this.orderStore.getOrderById(orderId);
    if (!order) {
      throw new AppError(404, 'NOT_FOUND', `Order "${orderId}" not found`);
    }

    const isOps =
      hasPermissionForRole(actorRole, 'ops:outlet:manage') ||
      hasPermissionForRole(actorRole, 'system:admin:override');

    let authorized = isOps;
    if (!authorized) {
      if (hasPermissionForRole(actorRole, 'restaurant:order:manage') && this.rbacStore) {
        const memberships = await this.rbacStore.listMembershipsForUser(actorUserId);
        authorized = hasOutletMembership(memberships, order.restaurantId, order.outletId);
      }
    }

    if (!authorized) {
      if (this.rbacStore) {
        await this.rbacStore.appendAuditLog({
          actorId: actorUserId,
          actorRole,
          action: 'orders.prep_time.update',
          resourceType: 'order',
          resourceId: orderId,
          outcome: 'DENIED',
          reason: `Role ${actorRole} cannot update prep time for outlet ${order.outletId}`,
          requestId,
        });
      }
      throw new AppError(
        403,
        'FORBIDDEN',
        'You do not have permission to update prep time for this order',
      );
    }

    if (order.status !== 'CONFIRMED' && order.status !== 'PREPARING') {
      throw new AppError(
        409,
        'CONFLICT',
        `Prep time can only be updated while order is CONFIRMED or PREPARING; current status is ${order.status}`,
      );
    }

    const now = this.clock.now();
    const newDeliveryMinutes = Math.min(180, parsed.prepTimeMinutes + 15);
    const transitionResult = await this.orderStore.transitionOrderAtomically({
      orderId: order.orderId,
      expectedStatuses: [order.status],
      expectedVersion: order.version,
      patch: {
        status: order.status,
        prepTimeMinutes: parsed.prepTimeMinutes,
        estimatedDeliveryMinutes: newDeliveryMinutes,
        updatedAt: now,
      },
      event: {
        eventId: `oevt_${crypto.randomUUID()}`,
        orderId: order.orderId,
        eventType: 'PREP_TIME_UPDATED',
        fromStatus: order.status,
        toStatus: order.status,
        actorId: actorUserId,
        actorRole,
        note:
          parsed.note?.trim() ||
          `Prep time updated from ${order.prepTimeMinutes ?? 'unset'}m to ${parsed.prepTimeMinutes}m by ${actorRole}`,
        occurredAt: now,
      },
    });

    if (!transitionResult.updated) {
      throw new AppError(
        409,
        'CONFLICT',
        `Order "${order.orderNumber}" state changed concurrently; please reload order ticket`,
      );
    }

    if (this.rbacStore) {
      await this.rbacStore.appendAuditLog({
        actorId: actorUserId,
        actorRole,
        action: 'orders.prep_time.update',
        resourceType: 'order',
        resourceId: orderId,
        outcome: 'ALLOWED',
        reason: `Prep time adjusted to ${parsed.prepTimeMinutes} mins`,
        requestId,
      });
    }

    const updated = transitionResult.order;
    const hydrated = await this.hydrateOrderDto(updated, false);
    const events = await this.orderStore.listOrderEvents(order.orderId);
    return { order: hydrated, events: events.map((e) => this.toEventDto(e)) };
  }

  async rejectOrder(
    orderId: string,
    actorUserId: string,
    actorRole: UserRole,
    rawBody: unknown,
    requestId = 'unknown-request',
  ): Promise<{ order: OrderDto; events: OrderEventDto[] }> {
    const parsed = rejectOrderSchema.parse(rawBody || {});
    return this.cancelOrder(
      orderId,
      actorUserId,
      actorRole,
      {
        reasonCode: parsed.reasonCode,
        note: parsed.note || 'Rejected by kitchen staff',
      },
      requestId,
    );
  }
}
