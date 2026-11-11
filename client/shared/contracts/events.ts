/**
 * BHOJORA — Outbox Domain Event Contracts
 * Guarantees strict cross-module communication without coupling database repositories.
 */

export type DomainEventType =
  | 'USER_REGISTERED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_READY_FOR_PICKUP'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'PAYMENT_CAPTURED'
  | 'PAYMENT_FAILED'
  | 'REFUND_PROCESSED'
  | 'DELIVERY_PARTNER_ASSIGNED'
  | 'INSPECTION_SUBMITTED'
  | 'INSPECTION_APPROVED'
  | 'CRITICAL_VIOLATION_DETECTED'
  | 'SAFETY_COMPLAINT_ESCALATED';

export interface OutboxDomainEvent<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: DomainEventType;
  aggregateId: string;
  aggregateType: 'User' | 'Order' | 'Payment' | 'Delivery' | 'Inspection' | 'Outlet' | 'Complaint';
  occurredAtUtc: string; // ISO 8601
  version: number;
  correlationId: string;
  payload: TPayload;
}

export interface OrderConfirmedPayload {
  orderId: string;
  outletId: string;
  customerId: string;
  totalPayablePaise: number;
  currency: 'INR';
  zoneId: string;
}

/** Canonical outlet hygiene states aligned with OpenAPI SafetyStatusEnum. */
export type SafetyStatus =
  | 'NOT_INSPECTED'
  | 'PENDING_REVIEW'
  | 'VERIFIED_CLEAN'
  | 'ACTION_REQUIRED'
  | 'SUSPENDED'
  | 'EXPIRED';

/** Terminal states emitted immediately when an independent reviewer approves a submission. */
export type ApprovedSafetyStatus = Extract<
  SafetyStatus,
  'VERIFIED_CLEAN' | 'ACTION_REQUIRED' | 'SUSPENDED'
>;

export interface InspectionApprovedPayload {
  inspectionId: string;
  outletId: string;
  reviewerId: string;
  inspectorId: string;
  finalScore: number;
  status: ApprovedSafetyStatus;
  criticalViolationDetected: boolean;
  policyVersion: string;
}
