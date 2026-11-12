import { useEffect, useRef, useState } from 'react';
import {
  formatInrFromPaise,
  ORDER_CANCEL_REASON_LABELS,
  ORDER_STATUS_LABELS,
  type OrderCancelReason,
  type OrderDto,
  type OrderEventDto,
  type OrderTrackingDto,
} from '@bhojora/shared';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';

const CUSTOMER_CANCEL_OPTIONS: ReadonlyArray<OrderCancelReason> = [
  'CUSTOMER_CHANGED_MIND',
  'ORDERED_BY_MISTAKE',
  'DELIVERY_DELAY',
];

interface CustomerOrdersDialogProps {
  open: boolean;
  orders: readonly OrderDto[];
  selectedOrderId: string | null;
  tracking: OrderTrackingDto | null;
  events: readonly OrderEventDto[];
  isLiveServerMode: boolean;
  loadingOrders: boolean;
  cancellingOrder: boolean;
  statusMessage: string | null;
  errorMessage: string | null;
  onSelectOrder: (orderId: string) => void;
  onRefreshTracking: (orderId: string) => void;
  onCancelOrder: (orderId: string, reasonCode: OrderCancelReason, note: string) => void;
  onSimulatePreviewNextStep: (orderId: string) => void;
  onReorderItems: (order: OrderDto) => void;
  onOpenAuthModal: () => void;
  onClose: () => void;
}

function formatShortTime(iso: string | null): string {
  if (!iso) {
    return 'Pending';
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function CustomerOrdersDialog({
  open,
  orders,
  selectedOrderId,
  tracking,
  events,
  isLiveServerMode,
  loadingOrders,
  cancellingOrder,
  statusMessage,
  errorMessage,
  onSelectOrder,
  onRefreshTracking,
  onCancelOrder,
  onSimulatePreviewNextStep,
  onReorderItems,
  onOpenAuthModal,
  onClose,
}: CustomerOrdersDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useDialogLightDismiss(dialogRef);

  const [cancelReason, setCancelReason] = useState<OrderCancelReason>('CUSTOMER_CHANGED_MIND');
  const [cancelNote, setCancelNote] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const activeOrder =
    orders.find((o) => o.orderId === selectedOrderId) ?? (orders.length > 0 ? orders[0]! : null);
  const canSimulateAdvance =
    !isLiveServerMode &&
    activeOrder !== null &&
    activeOrder.status !== 'DELIVERED' &&
    activeOrder.status !== 'CANCELLED';

  return (
    <dialog
      ref={dialogRef}
      id="customerOrdersModal"
      className="trust-dialog orders-dialog"
      closedby="any"
      aria-labelledby="ordersModalTitle"
      onClose={onClose}
    >
      <div className="modal-header">
        <div>
          <h2 id="ordersModalTitle" style={{ fontSize: '18px' }}>
            Your Orders &amp; Live Lifecycle Tracking
          </h2>
          <p className="menu-source-note">
            {isLiveServerMode
              ? 'Server-backed order state machine with append-only event audit ledger.'
              : 'Kolkata preview lifecycle mode — place an order from Cart or test cancellation & state transitions.'}
          </p>
        </div>
        <form method="dialog">
          <button type="submit" className="modal-close" aria-label="Close orders dialog">
            &times;
          </button>
        </form>
      </div>

      {statusMessage ? (
        <div className="cart-banner-success" role="status" aria-live="polite">
          {statusMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="cart-banner-error" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {loadingOrders && orders.length === 0 ? (
        <div className="cart-empty-state" role="status" aria-live="polite">
          <p>Loading your Kolkata order history…</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="cart-empty-state" role="status" aria-live="polite">
          <p style={{ fontWeight: 700, color: 'var(--neutral-950)', marginBottom: '6px' }}>
            No orders placed yet
          </p>
          <p style={{ fontSize: '13px', color: 'var(--neutral-600)', marginBottom: '16px' }}>
            Add dishes from any inspected Kolkata kitchen, review your server-signed quote, and
            place an idempotent order from your Cart.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Discover Kitchens
            </button>
            {!isLiveServerMode ? (
              <button type="button" className="btn btn-outline" onClick={onOpenAuthModal}>
                Sign In for Live Orders
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="orders-stack">
          <section aria-label="Order History Selector">
            <h3 className="orders-section-heading">Order History ({orders.length})</h3>
            <ul className="orders-history-list">
              {orders.map((order) => {
                const isSelected = activeOrder?.orderId === order.orderId;
                return (
                  <li key={order.orderId}>
                    <button
                      type="button"
                      className={`order-history-pill ${isSelected ? 'is-selected' : ''}`}
                      onClick={() => onSelectOrder(order.orderId)}
                    >
                      <span className="order-history-number">{order.orderNumber}</span>
                      <span className="order-history-brand">{order.brandName}</span>
                      <span className={`order-status-chip status-${order.status.toLowerCase()}`}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </span>
                      <span className="order-history-total">{order.formattedTotalPayableInr}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {activeOrder ? (
            <div className="order-detail-panel">
              <div className="order-detail-top">
                <div>
                  <div className="order-detail-title">
                    {activeOrder.orderNumber} · {activeOrder.brandName}
                  </div>
                  <div className="order-detail-sub">
                    {activeOrder.outletName} · Delivering to {activeOrder.addressSnapshot.label} (
                    {activeOrder.addressSnapshot.locality})
                  </div>
                </div>
                <div className="order-detail-actions-top">
                  <span className={`order-status-chip status-${activeOrder.status.toLowerCase()}`}>
                    {ORDER_STATUS_LABELS[activeOrder.status]}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12px' }}
                    onClick={() => onRefreshTracking(activeOrder.orderId)}
                  >
                    Refresh Status
                  </button>
                </div>
              </div>

              {activeOrder.deliveryOtp && activeOrder.status !== 'CANCELLED' ? (
                <div className="order-otp-banner">
                  <span>
                    Handover PIN for Rider: <strong>{activeOrder.deliveryOtp}</strong>
                  </span>
                  <span>Est. {activeOrder.estimatedDeliveryMinutes} mins</span>
                </div>
              ) : null}

              {tracking ? (
                <section aria-label="Order Lifecycle Progress">
                  <h3 className="orders-section-heading">Lifecycle Stage</h3>
                  <ol className="order-stepper-list">
                    {tracking.steps.map((step) => (
                      <li key={step.status} className={`order-step-item is-${step.state}`}>
                        <div className="order-step-dot" aria-hidden="true" />
                        <div className="order-step-body">
                          <span className="order-step-label">{step.label}</span>
                          <span className="order-step-time">{formatShortTime(step.timestamp)}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              {canSimulateAdvance ? (
                <div className="order-sim-bar">
                  <span>
                    Preview State Machine Tester: advance kitchen/rider state to see customer cancel
                    lock once <strong>PREPARING</strong> begins.
                  </span>
                  <button
                    type="button"
                    id="simulateAdvanceOrderBtn"
                    className="btn btn-outline"
                    style={{ minHeight: '44px', padding: '6px 12px', fontSize: '12px' }}
                    onClick={() => onSimulatePreviewNextStep(activeOrder.orderId)}
                  >
                    Advance Next Stage →
                  </button>
                </div>
              ) : null}

              <section aria-label="Ordered Dishes">
                <h3 className="orders-section-heading">
                  Items ({activeOrder.items.length}) · Total {activeOrder.formattedTotalPayableInr}
                </h3>
                <ul className="order-items-snapshot-list">
                  {activeOrder.items.map((item) => (
                    <li key={item.orderItemId} className="order-snapshot-row">
                      <div>
                        <strong>
                          {item.quantity} × {item.title}
                        </strong>
                        {item.selectionSummary ? (
                          <div className="cart-line-options">{item.selectionSummary}</div>
                        ) : null}
                      </div>
                      <span>{item.formattedLineTotalInr}</span>
                    </li>
                  ))}
                </ul>
                {activeOrder.specialInstructions ? (
                  <p className="order-instructions-note">Note: {activeOrder.specialInstructions}</p>
                ) : null}
              </section>

              {activeOrder.cancellation ? (
                <div className="cart-banner-error" role="status">
                  <strong>
                    Cancelled ({ORDER_CANCEL_REASON_LABELS[activeOrder.cancellation.reasonCode]})
                  </strong>{' '}
                  · Refund status: <code>{activeOrder.cancellation.refundStatus}</code> (
                  {formatInrFromPaise(activeOrder.cancellation.refundAmountPaise)})
                  {activeOrder.cancellation.note ? ` · "${activeOrder.cancellation.note}"` : ''}
                </div>
              ) : (
                <section className="order-cancel-box" aria-label="Cancellation Policy">
                  <div className="order-cancel-policy-copy">
                    <strong>Cancellation Policy:</strong>{' '}
                    {activeOrder.cancellationEligibility.reason}
                  </div>
                  {activeOrder.cancellationEligibility.customerCanCancel ? (
                    <div className="order-cancel-form">
                      <div className="order-cancel-fields">
                        <label htmlFor="orderCancelReasonSelect">Cancellation reason</label>
                        <select
                          id="orderCancelReasonSelect"
                          className="discovery-select"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value as OrderCancelReason)}
                        >
                          {CUSTOMER_CANCEL_OPTIONS.map((code) => (
                            <option key={code} value={code}>
                              {ORDER_CANCEL_REASON_LABELS[code]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="order-cancel-fields">
                        <label htmlFor="orderCancelNoteInput">Optional note</label>
                        <input
                          id="orderCancelNoteInput"
                          type="text"
                          className="cart-coupon-input"
                          maxLength={240}
                          placeholder="Why are you cancelling?"
                          value={cancelNote}
                          onChange={(e) => setCancelNote(e.target.value)}
                        />
                      </div>
                      <button
                        type="button"
                        id="cancelOrderBtn"
                        className="btn btn-outline order-cancel-submit-btn"
                        disabled={cancellingOrder}
                        onClick={() => onCancelOrder(activeOrder.orderId, cancelReason, cancelNote)}
                      >
                        {cancellingOrder ? 'Cancelling Order…' : 'Cancel Order'}
                      </button>
                    </div>
                  ) : null}
                </section>
              )}

              <section aria-label="Append-Only Order Audit Events">
                <h3 className="orders-section-heading">
                  Append-Only Event Ledger ({events.length})
                </h3>
                <ol className="order-events-ledger">
                  {events.map((evt) => (
                    <li key={evt.eventId} className="order-event-row">
                      <span className="order-event-type">{evt.eventType}</span>
                      <span className="order-event-note">{evt.note}</span>
                      <span className="order-event-time">{formatShortTime(evt.occurredAt)}</span>
                    </li>
                  ))}
                </ol>
              </section>

              <div className="cart-footer-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onReorderItems(activeOrder)}
                >
                  Reorder from {activeOrder.brandName}
                </button>
                <button type="button" className="btn btn-outline" onClick={onClose}>
                  Back to Kolkata Kitchens
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </dialog>
  );
}
