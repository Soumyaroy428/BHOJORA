import type { UserRole } from './auth';
import type { AllergenCode, DietaryType, GstTaxSlab } from './catalog';
import type { CheckoutPricingBreakdownDto, QuoteAddressSnapshotDto } from './cart-pricing';
import type { PlatformInspectionStatus } from './restaurant';

export const ORDER_STATUSES = [
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'PREPARING',
  'READY_FOR_PICKUP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_ORDER_STATUSES = ['DELIVERED', 'CANCELLED'] as const;

export type TerminalOrderStatus = (typeof TERMINAL_ORDER_STATUSES)[number];

export const ORDER_CANCEL_REASONS = [
  'CUSTOMER_CHANGED_MIND',
  'ORDERED_BY_MISTAKE',
  'DELIVERY_DELAY',
  'OUTLET_OUT_OF_STOCK',
  'PAYMENT_FAILED',
  'OPS_INTERVENTION',
] as const;

export type OrderCancelReason = (typeof ORDER_CANCEL_REASONS)[number];

export const ORDER_REFUND_STATUSES = [
  'NOT_REQUIRED',
  'PENDING_REVIEW',
  'QUEUED_FULL_REFUND',
  'REFUNDED',
] as const;

export type OrderRefundStatus = (typeof ORDER_REFUND_STATUSES)[number];

export const ORDER_EVENT_TYPES = [
  'ORDER_CREATED',
  'PAYMENT_LINKED',
  'ORDER_CONFIRMED',
  'ORDER_PREPARING_STARTED',
  'ORDER_READY_FOR_PICKUP',
  'ORDER_OUT_FOR_DELIVERY',
  'ORDER_DELIVERED',
  'ORDER_CANCELLED',
  'OUTBOX_EVENT_QUEUED',
] as const;

export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export const ORDER_VALID_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  AWAITING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: [],
};

export const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = {
  AWAITING_PAYMENT: 'Awaiting Payment',
  CONFIRMED: 'Order Confirmed',
  PREPARING: 'Kitchen Preparing',
  READY_FOR_PICKUP: 'Ready for Pickup',
  OUT_FOR_DELIVERY: 'Out for Delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

export const ORDER_CANCEL_REASON_LABELS: Readonly<Record<OrderCancelReason, string>> = {
  CUSTOMER_CHANGED_MIND: 'Changed my mind',
  ORDERED_BY_MISTAKE: 'Ordered by mistake',
  DELIVERY_DELAY: 'Estimated delivery wait too long',
  OUTLET_OUT_OF_STOCK: 'Kitchen item unavailable',
  PAYMENT_FAILED: 'Payment could not be completed',
  OPS_INTERVENTION: 'Operations intervention',
};

export interface OrderItemSnapshotDto {
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
  formattedLineTotalInr: string;
  selectionSummary: string;
}

export interface OrderEventDto {
  eventId: string;
  orderId: string;
  eventType: OrderEventType;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorId: string;
  actorRole: UserRole | 'SYSTEM';
  note: string;
  occurredAt: string;
}

export interface OrderCancellationEligibilityDto {
  customerCanCancel: boolean;
  reason: string;
  eligibleRefundStatus: OrderRefundStatus;
}

export interface OrderCancellationSummaryDto {
  reasonCode: OrderCancelReason;
  note: string | null;
  cancelledByUserId: string;
  cancelledByRole: UserRole | 'SYSTEM';
  cancelledAt: string;
  refundStatus: OrderRefundStatus;
  refundAmountPaise: number;
}

export interface OrderDto {
  orderId: string;
  orderNumber: string;
  customerId: string;
  quoteId: string;
  paymentId: string | null;
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
  formattedTotalPayableInr: string;
  addressSnapshot: QuoteAddressSnapshotDto;
  estimatedDeliveryMinutes: number;
  specialInstructions: string | null;
  deliveryOtp: string | null;
  items: OrderItemSnapshotDto[];
  cancellationEligibility: OrderCancellationEligibilityDto;
  cancellation: OrderCancellationSummaryDto | null;
  confirmedAt: string | null;
  preparingAt: string | null;
  readyForPickupAt: string | null;
  outForDeliveryAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderTrackingStepDto {
  status: Exclude<OrderStatus, 'CANCELLED'>;
  label: string;
  state: 'completed' | 'current' | 'upcoming' | 'skipped';
  timestamp: string | null;
}

export interface OrderTrackingDto {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  statusLabel: string;
  outletId: string;
  outletName: string;
  brandName: string;
  estimatedDeliveryMinutes: number;
  deliveryOtp: string | null;
  cancellationEligibility: OrderCancellationEligibilityDto;
  cancellation: OrderCancellationSummaryDto | null;
  steps: OrderTrackingStepDto[];
  events: OrderEventDto[];
  updatedAt: string;
}

export interface CreateOrderRequestDto {
  quoteId: string;
  paymentId?: string;
  specialInstructions?: string;
}

export interface CreateOrderResultDto {
  idempotentReplay: boolean;
  paymentAttached: boolean;
  order: OrderDto;
  events: OrderEventDto[];
}

export interface CancelOrderRequestDto {
  reasonCode: OrderCancelReason;
  note?: string;
}

export interface TransitionOrderStatusRequestDto {
  status: OrderStatus;
  note?: string;
}

export interface OrderListResponseDto {
  orders: OrderDto[];
  nextCursor: string | null;
  totalCount: number;
}
