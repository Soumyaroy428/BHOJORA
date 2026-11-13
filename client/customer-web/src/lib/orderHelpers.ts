import {
  formatInrFromPaise,
  ORDER_STATUS_LABELS,
  type CartDto,
  type CheckoutQuoteDto,
  type OrderCancelReason,
  type OrderDto,
  type OrderEventDto,
  type OrderStatus,
  type OrderTrackingDto,
  type OrderTrackingStepDto,
} from '@bhojora/shared';

const PREVIEW_ORDERS_STORAGE_KEY = 'bhojora_preview_orders_v1';

export interface PreviewOrderBundle {
  order: OrderDto;
  events: OrderEventDto[];
}

const PREVIEW_STEP_SEQUENCE: ReadonlyArray<Exclude<OrderStatus, 'CANCELLED'>> = [
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

export function readStoredPreviewOrders(): PreviewOrderBundle[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(PREVIEW_ORDERS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PreviewOrderBundle[]) : [];
  } catch {
    return [];
  }
}

export function writeStoredPreviewOrders(bundles: PreviewOrderBundle[]): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(PREVIEW_ORDERS_STORAGE_KEY, JSON.stringify(bundles.slice(0, 20)));
  } catch {
    // Ignore localStorage quota failures cleanly
  }
}

export function createClientIdempotencyKey(prefix: string): string {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${randomPart}`.slice(0, 120);
}

export function buildPreviewOrderBundle(params: {
  cart: CartDto;
  quote: CheckoutQuoteDto;
  specialInstructions?: string;
}): PreviewOrderBundle {
  const { cart, quote, specialInstructions } = params;
  const now = new Date();
  const nowIso = now.toISOString();
  const shortHex = Math.floor(100000 + Math.random() * 899999)
    .toString(16)
    .toUpperCase();
  const orderId = `ord_preview_${Date.now()}_${shortHex}`;
  const orderNumber = `BHJ-${now.getUTCFullYear()}-${shortHex}`;
  const deliveryOtp = String(Math.floor(1000 + Math.random() * 9000));
  const cartById = new Map(cart.items.map((entry) => [entry.cartItemId, entry]));

  const items = quote.lineItems.map((line, index) => {
    const matched = cartById.get(line.cartItemId);
    const selectionSummary = matched
      ? [
          ...matched.selectedVariants.map((v) => v.label),
          ...matched.selectedAddons.map((a) => `+ ${a.label}`),
        ].join(' · ')
      : '';
    return {
      orderItemId: `oitm_prev_${Date.now()}_${index}`,
      orderId,
      menuItemId: line.menuItemId,
      title: line.title,
      dietaryType: matched?.dietaryType ?? 'PURE_VEG',
      allergens: matched ? [...matched.allergens] : [],
      gstTaxSlab: line.gstTaxSlab,
      quantity: line.quantity,
      unitPricePaise: line.unitPricePaise,
      lineTotalPaise: line.lineSubtotalPaise,
      formattedLineTotalInr: formatInrFromPaise(line.lineSubtotalPaise),
      selectionSummary,
    };
  });

  const order: OrderDto = {
    orderId,
    orderNumber,
    customerId: cart.customerId,
    quoteId: quote.quoteId,
    paymentId: `pay_sandbox_${shortHex}`,
    outletId: quote.outletId,
    outletName: quote.outletName,
    brandName: quote.brandName,
    outletInspectionStatus: quote.outletInspectionStatus,
    outletSafetyScore: quote.outletSafetyScore,
    status: 'CONFIRMED',
    version: 2,
    currency: 'INR',
    pricingBreakdown: { ...quote.pricingBreakdown },
    couponCode: quote.couponAllocation?.couponCode ?? null,
    formattedTotalPayableInr: quote.pricingBreakdown.formattedTotalPayableInr,
    addressSnapshot: {
      ...quote.addressSnapshot,
      coordinates: [...quote.addressSnapshot.coordinates],
    },
    estimatedDeliveryMinutes: quote.estimatedDeliveryMinutes,
    prepTimeMinutes: null,
    specialInstructions: specialInstructions?.trim() || null,
    deliveryOtp,
    items,
    cancellationEligibility: {
      customerCanCancel: true,
      reason: 'Full refund eligible before kitchen begins preparing your order.',
      eligibleRefundStatus: 'QUEUED_FULL_REFUND',
    },
    cancellation: null,
    confirmedAt: nowIso,
    preparingAt: null,
    readyForPickupAt: null,
    outForDeliveryAt: null,
    deliveredAt: null,
    cancelledAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const events: OrderEventDto[] = [
    {
      eventId: `oevt_prev_${Date.now()}_1`,
      orderId,
      eventType: 'ORDER_CREATED',
      fromStatus: null,
      toStatus: 'AWAITING_PAYMENT',
      actorId: cart.customerId,
      actorRole: 'CUSTOMER',
      note: `Created ${orderNumber} from quote ${quote.quoteId} (${quote.pricingBreakdown.formattedTotalPayableInr})`,
      occurredAt: nowIso,
    },
    {
      eventId: `oevt_prev_${Date.now()}_2`,
      orderId,
      eventType: 'ORDER_CONFIRMED',
      fromStatus: 'AWAITING_PAYMENT',
      toStatus: 'CONFIRMED',
      actorId: 'SYSTEM',
      actorRole: 'SYSTEM',
      note: `Sandbox payment captured (${order.paymentId}); order queued for kitchen acceptance`,
      occurredAt: new Date(now.getTime() + 1000).toISOString(),
    },
  ];

  return { order, events };
}

export function buildPreviewTracking(order: OrderDto, events: OrderEventDto[]): OrderTrackingDto {
  const tsByStatus: Record<Exclude<OrderStatus, 'CANCELLED'>, string | null> = {
    AWAITING_PAYMENT: order.createdAt,
    CONFIRMED: order.confirmedAt,
    PREPARING: order.preparingAt,
    READY_FOR_PICKUP: order.readyForPickupAt,
    OUT_FOR_DELIVERY: order.outForDeliveryAt,
    DELIVERED: order.deliveredAt,
  };
  const activeIdx = order.status === 'CANCELLED' ? -1 : PREVIEW_STEP_SEQUENCE.indexOf(order.status);

  const steps: OrderTrackingStepDto[] = PREVIEW_STEP_SEQUENCE.map((status, index) => {
    const ts = tsByStatus[status];
    let state: OrderTrackingStepDto['state'];
    if (order.status === 'CANCELLED') {
      state = ts ? 'completed' : 'skipped';
    } else if (status === order.status) {
      state = status === 'DELIVERED' ? 'completed' : 'current';
    } else if (index < activeIdx) {
      state = 'completed';
    } else {
      state = 'upcoming';
    }
    return {
      status,
      label: ORDER_STATUS_LABELS[status],
      state,
      timestamp: ts,
    };
  });

  return {
    orderId: order.orderId,
    orderNumber: order.orderNumber,
    status: order.status,
    statusLabel: ORDER_STATUS_LABELS[order.status],
    outletId: order.outletId,
    outletName: order.outletName,
    brandName: order.brandName,
    estimatedDeliveryMinutes: order.estimatedDeliveryMinutes,
    deliveryOtp: order.deliveryOtp,
    cancellationEligibility: order.cancellationEligibility,
    cancellation: order.cancellation,
    steps,
    events,
    updatedAt: order.updatedAt,
  };
}

export function cancelPreviewOrderBundle(
  bundle: PreviewOrderBundle,
  reasonCode: OrderCancelReason,
  note?: string,
): { ok: true; bundle: PreviewOrderBundle } | { ok: false; message: string } {
  const { order } = bundle;
  if (order.status !== 'AWAITING_PAYMENT' && order.status !== 'CONFIRMED') {
    return {
      ok: false,
      message: order.cancellationEligibility.reason,
    };
  }
  const nowIso = new Date().toISOString();
  const refundStatus = order.status === 'AWAITING_PAYMENT' ? 'NOT_REQUIRED' : 'QUEUED_FULL_REFUND';
  const nextOrder: OrderDto = {
    ...order,
    status: 'CANCELLED',
    version: order.version + 1,
    cancelledAt: nowIso,
    updatedAt: nowIso,
    cancellationEligibility: {
      customerCanCancel: false,
      reason: 'Order has already been cancelled.',
      eligibleRefundStatus: 'NOT_REQUIRED',
    },
    cancellation: {
      reasonCode,
      note: note?.trim() || null,
      cancelledByUserId: order.customerId,
      cancelledByRole: 'CUSTOMER',
      cancelledAt: nowIso,
      refundStatus,
      refundAmountPaise:
        refundStatus === 'NOT_REQUIRED' ? 0 : order.pricingBreakdown.totalPayablePaise,
    },
  };
  const nextEvent: OrderEventDto = {
    eventId: `oevt_prev_${Date.now()}_${bundle.events.length + 1}`,
    orderId: order.orderId,
    eventType: 'ORDER_CANCELLED',
    fromStatus: order.status,
    toStatus: 'CANCELLED',
    actorId: order.customerId,
    actorRole: 'CUSTOMER',
    note: `Cancelled (${reasonCode})${note?.trim() ? ` — ${note.trim()}` : ''}; refund=${refundStatus}`,
    occurredAt: nowIso,
  };
  return {
    ok: true,
    bundle: { order: nextOrder, events: [...bundle.events, nextEvent] },
  };
}

export function advancePreviewOrderBundle(bundle: PreviewOrderBundle): PreviewOrderBundle {
  const { order } = bundle;
  const idx = PREVIEW_STEP_SEQUENCE.indexOf(order.status as Exclude<OrderStatus, 'CANCELLED'>);
  if (idx < 0 || idx >= PREVIEW_STEP_SEQUENCE.length - 1) {
    return bundle;
  }
  const nextStatus = PREVIEW_STEP_SEQUENCE[idx + 1]!;
  const nowIso = new Date().toISOString();
  const customerCanCancel = nextStatus === 'AWAITING_PAYMENT' || nextStatus === 'CONFIRMED';

  const eventTypeByStatus: Record<Exclude<OrderStatus, 'CANCELLED'>, OrderEventDto['eventType']> = {
    AWAITING_PAYMENT: 'ORDER_CREATED',
    CONFIRMED: 'ORDER_CONFIRMED',
    PREPARING: 'ORDER_PREPARING_STARTED',
    READY_FOR_PICKUP: 'ORDER_READY_FOR_PICKUP',
    OUT_FOR_DELIVERY: 'ORDER_OUT_FOR_DELIVERY',
    DELIVERED: 'ORDER_DELIVERED',
  };

  const nextOrder: OrderDto = {
    ...order,
    status: nextStatus,
    version: order.version + 1,
    confirmedAt: nextStatus === 'CONFIRMED' ? nowIso : order.confirmedAt,
    preparingAt: nextStatus === 'PREPARING' ? nowIso : order.preparingAt,
    readyForPickupAt: nextStatus === 'READY_FOR_PICKUP' ? nowIso : order.readyForPickupAt,
    outForDeliveryAt: nextStatus === 'OUT_FOR_DELIVERY' ? nowIso : order.outForDeliveryAt,
    deliveredAt: nextStatus === 'DELIVERED' ? nowIso : order.deliveredAt,
    updatedAt: nowIso,
    cancellationEligibility: {
      customerCanCancel,
      reason: customerCanCancel
        ? 'Full refund eligible before kitchen begins preparing your order.'
        : nextStatus === 'DELIVERED'
          ? 'Order has already been delivered.'
          : 'Kitchen has started preparing your food; self-cancellation is closed.',
      eligibleRefundStatus: nextStatus === 'DELIVERED' ? 'NOT_REQUIRED' : 'PENDING_REVIEW',
    },
  };

  const nextEvent: OrderEventDto = {
    eventId: `oevt_prev_${Date.now()}_${bundle.events.length + 1}`,
    orderId: order.orderId,
    eventType: eventTypeByStatus[nextStatus],
    fromStatus: order.status,
    toStatus: nextStatus,
    actorId: 'outlet_preview_staff',
    actorRole:
      nextStatus === 'OUT_FOR_DELIVERY' || nextStatus === 'DELIVERED'
        ? 'DELIVERY_PARTNER'
        : 'KITCHEN_STAFF',
    note: `Preview kitchen/rider simulation: ${order.status} -> ${nextStatus}`,
    occurredAt: nowIso,
  };

  return {
    order: nextOrder,
    events: [...bundle.events, nextEvent],
  };
}
