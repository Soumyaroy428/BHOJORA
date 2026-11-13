import { useEffect, useRef, useState } from 'react';
import type {
  AllergenCode,
  ApiResponse,
  DietaryType,
  OrderCancelReason,
  OrderDto,
  OrderStatus,
  UserRole,
} from '@bhojora/shared';

export interface KitchenOrderDashboardPanelProps {
  apiBase: string;
  accessToken: string | null;
  activeRole: UserRole;
  selectedOutletId: string;
  selectedOutletName: string;
  onStatusUpdate?: (msg: string) => void;
}

interface SimulatedOrder {
  orderId: string;
  orderNumber: string;
  customerName: string;
  customerPhoneMasked: string;
  deliveryZone: string;
  status: OrderStatus;
  items: Array<{
    name: string;
    quantity: number;
    dietaryType: DietaryType;
    selectionSummary: string;
    allergens: AllergenCode[];
  }>;
  specialInstructions: string | null;
  prepTimeMinutes: number;
  prepStartedAt: number | null; // Date.now() timestamp
  readyAt: number | null;
  totalFormattedInr: string;
  deliveryOtp: string;
  cancellationReason?: string;
  cancellationRefundStatus?: string;
}

const PRESET_SAMPLE_ORDERS: Record<string, SimulatedOrder[]> = {
  outlet_arsalan_pc: [
    {
      orderId: 'ord_sample_arsalan_01',
      orderNumber: 'BHJ-2026-A101',
      customerName: 'Ananya S.',
      customerPhoneMasked: '+91 98301 ••••',
      deliveryZone: 'Salt Lake Sector V',
      status: 'CONFIRMED',
      items: [
        {
          name: 'Kolkata Mutton Biryani',
          quantity: 2,
          dietaryType: 'NON_VEG',
          selectionSummary: 'Special (2 Mutton + 1 Aloo) · + Extra Aloo',
          allergens: ['DAIRY'],
        },
        {
          name: 'Shahi Firni',
          quantity: 2,
          dietaryType: 'PURE_VEG',
          selectionSummary: 'Traditional Clay Pot',
          allergens: ['DAIRY', 'TREE_NUTS'],
        },
      ],
      specialInstructions: 'Please pack raita separately, keep biryani warm',
      prepTimeMinutes: 25,
      prepStartedAt: null,
      readyAt: null,
      totalFormattedInr: '₹985.00',
      deliveryOtp: '7412',
    },
    {
      orderId: 'ord_sample_arsalan_02',
      orderNumber: 'BHJ-2026-A102',
      customerName: 'Debanjan M.',
      customerPhoneMasked: '+91 98310 ••••',
      deliveryZone: 'Park Circus Seven Point',
      status: 'PREPARING',
      items: [
        {
          name: 'Chicken Chaap',
          quantity: 1,
          dietaryType: 'NON_VEG',
          selectionSummary: 'Standard Portion (Leg piece)',
          allergens: ['DAIRY', 'TREE_NUTS'],
        },
        {
          name: 'Rumali Roti',
          quantity: 4,
          dietaryType: 'PURE_VEG',
          selectionSummary: 'Tandoor Fresh',
          allergens: ['GLUTEN'],
        },
      ],
      specialInstructions: 'Make chaap gravy medium spicy',
      prepTimeMinutes: 20,
      prepStartedAt: Date.now() - 11 * 60 * 1000, // 11 mins elapsed
      readyAt: null,
      totalFormattedInr: '₹415.00',
      deliveryOtp: '3951',
    },
    {
      orderId: 'ord_sample_arsalan_03',
      orderNumber: 'BHJ-2026-A103',
      customerName: 'Priya K.',
      customerPhoneMasked: '+91 94330 ••••',
      deliveryZone: 'Ballygunge Circular Rd',
      status: 'READY_FOR_PICKUP',
      items: [
        {
          name: 'Mutton Galawati Kebab',
          quantity: 1,
          dietaryType: 'NON_VEG',
          selectionSummary: '4 pcs with Mint Chutney',
          allergens: ['DAIRY'],
        },
      ],
      specialInstructions: null,
      prepTimeMinutes: 15,
      prepStartedAt: Date.now() - 18 * 60 * 1000,
      readyAt: Date.now() - 3 * 60 * 1000,
      totalFormattedInr: '₹360.00',
      deliveryOtp: '6208',
    },
  ],
};

function playAudioChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    // Dual-tone chime (high-low friendly alert)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now); // A5
    osc1.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15); // D6
    gain1.gain.setValueAtTime(0.18, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.35);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1174.66, now + 0.18);
    osc2.frequency.exponentialRampToValueAtTime(1760, now + 0.45); // A6
    gain2.gain.setValueAtTime(0.15, now + 0.18);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.18);
    osc2.stop(now + 0.55);
  } catch {
    // Ignore audio permission or autoplay restrictions
  }
}

export function KitchenOrderDashboardPanel({
  apiBase,
  accessToken,
  activeRole,
  selectedOutletId,
  selectedOutletName,
  onStatusUpdate,
}: KitchenOrderDashboardPanelProps) {
  const [activeTab, setActiveTab] = useState<'kanban' | 'history'>('kanban');
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [orders, setOrders] = useState<SimulatedOrder[]>(() => {
    return (
      PRESET_SAMPLE_ORDERS[selectedOutletId] ?? PRESET_SAMPLE_ORDERS['outlet_arsalan_pc'] ?? []
    );
  });
  const [selectedOrderForReject, setSelectedOrderForReject] = useState<SimulatedOrder | null>(null);
  const [rejectReason, setRejectReason] = useState<OrderCancelReason>('OUTLET_OUT_OF_STOCK');
  const [rejectNote, setRejectNote] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    'Kitchen Display System ready. Live kitchen order inbox and turnaround buffers active.',
  );

  const rejectDialogRef = useRef<HTMLDialogElement>(null);
  const isKitchenAuthorized =
    activeRole === 'KITCHEN_STAFF' ||
    activeRole === 'RESTAURANT_MANAGER' ||
    activeRole === 'RESTAURANT_OWNER' ||
    activeRole === 'OPS_ADMIN' ||
    activeRole === 'SUPER_ADMIN';

  function updateStatus(msg: string) {
    setStatusMessage(msg);
    onStatusUpdate?.(msg);
  }

  // Load orders when outlet or live session changes
  useEffect(() => {
    if (apiBase && accessToken) {
      void fetchLiveOrders();
    } else {
      const preset =
        PRESET_SAMPLE_ORDERS[selectedOutletId] ?? PRESET_SAMPLE_ORDERS['outlet_arsalan_pc'] ?? [];
      setOrders(preset);
      updateStatus(
        `KDS preview mode loaded for ${selectedOutletName} (${preset.length} active orders).`,
      );
    }
  }, [selectedOutletId, apiBase, accessToken]);

  // Periodic polling when connected to live backend
  useEffect(() => {
    if (!apiBase || !accessToken || !autoRefresh) return;
    const interval = setInterval(() => {
      void fetchLiveOrders(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [apiBase, accessToken, autoRefresh, selectedOutletId]);

  async function fetchLiveOrders(silent = false) {
    if (!apiBase || !accessToken) return;
    try {
      const res = await fetch(
        `${apiBase}/api/v1/restaurant/orders?outletId=${encodeURIComponent(selectedOutletId)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      const data = (await res.json()) as ApiResponse<{ outletId: string; orders: OrderDto[] }>;
      if (!res.ok || !data.success) {
        if (!silent) {
          updateStatus(
            data.success
              ? 'Failed to fetch kitchen orders'
              : `Order inbox error (${res.status}): ${data.error.message}`,
          );
        }
        return;
      }

      const mapped: SimulatedOrder[] = data.data.orders.map((o) => ({
        orderId: o.orderId,
        orderNumber: o.orderNumber,
        customerName: `Customer #${o.customerId.slice(-4)}`,
        customerPhoneMasked: '+91 9•••• ••••',
        deliveryZone: o.addressSnapshot.label,
        status: o.status,
        items: o.items.map((i) => ({
          name: i.title,
          quantity: i.quantity,
          dietaryType: i.dietaryType,
          selectionSummary: i.selectionSummary,
          allergens: i.allergens,
        })),
        specialInstructions: o.specialInstructions,
        prepTimeMinutes: o.prepTimeMinutes ?? 20,
        prepStartedAt: o.preparingAt ? new Date(o.preparingAt).getTime() : null,
        readyAt: o.readyForPickupAt ? new Date(o.readyForPickupAt).getTime() : null,
        totalFormattedInr: o.formattedTotalPayableInr,
        deliveryOtp: o.deliveryOtp || '••••',
        cancellationReason: o.cancellation?.reasonCode,
        cancellationRefundStatus: o.cancellation?.refundStatus,
      }));

      // Check if new incoming order arrived
      const prevConfirmedIds = new Set(
        orders.filter((o) => o.status === 'CONFIRMED').map((o) => o.orderId),
      );
      const hasNewIncoming = mapped.some(
        (o) => o.status === 'CONFIRMED' && !prevConfirmedIds.has(o.orderId),
      );
      if (hasNewIncoming && audioEnabled) {
        playAudioChime();
      }

      setOrders(mapped);
      if (!silent) {
        updateStatus(`Fetched ${mapped.length} live orders for ${selectedOutletName}.`);
      }
    } catch {
      if (!silent) {
        updateStatus('Unable to reach live orders API; preview mode available.');
      }
    }
  }

  // Accept incoming order
  async function handleAcceptOrder(order: SimulatedOrder, prepMinutes: number) {
    if (!isKitchenAuthorized) {
      updateStatus(`Permission denied: role ${activeRole} cannot accept kitchen orders.`);
      return;
    }

    if (apiBase && accessToken) {
      try {
        const res = await fetch(`${apiBase}/api/v1/restaurant/orders/${order.orderId}/status`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'PREPARING',
            prepTimeMinutes: prepMinutes,
            note: `Kitchen accepted: prep time ${prepMinutes} mins`,
          }),
        });
        const data = (await res.json()) as ApiResponse<{ order: OrderDto }>;
        if (!res.ok || !data.success) {
          updateStatus(
            data.success ? 'Order acceptance failed' : `Accept error: ${data.error.message}`,
          );
          return;
        }
        updateStatus(`Order ${order.orderNumber} accepted (${prepMinutes}m prep timer started).`);
        await fetchLiveOrders();
        return;
      } catch {
        updateStatus('Failed to send live accept mutation; updating preview.');
      }
    }

    // Preview mode update
    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === order.orderId
          ? {
              ...o,
              status: 'PREPARING',
              prepTimeMinutes: prepMinutes,
              prepStartedAt: Date.now(),
            }
          : o,
      ),
    );
    updateStatus(`Order ${order.orderNumber} accepted (${prepMinutes}m prep timer started).`);
  }

  // Adjust prep time during cooking
  async function handleAdjustPrepTime(order: SimulatedOrder, addMinutes: number) {
    const newPrepTime = Math.min(180, Math.max(5, order.prepTimeMinutes + addMinutes));
    if (apiBase && accessToken) {
      try {
        const res = await fetch(`${apiBase}/api/v1/restaurant/orders/${order.orderId}/prep-time`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prepTimeMinutes: newPrepTime,
            note: `Kitchen busy buffer: ${addMinutes > 0 ? `+${addMinutes}` : addMinutes}m`,
          }),
        });
        const data = (await res.json()) as ApiResponse<{ order: OrderDto }>;
        if (!res.ok || !data.success) {
          updateStatus(
            data.success ? 'Failed to update prep time' : `Prep time error: ${data.error.message}`,
          );
          return;
        }
        updateStatus(`Order ${order.orderNumber} prep buffer adjusted to ${newPrepTime} mins.`);
        await fetchLiveOrders();
        return;
      } catch {
        updateStatus('Failed to send prep time update; updating preview.');
      }
    }

    setOrders((prev) =>
      prev.map((o) => (o.orderId === order.orderId ? { ...o, prepTimeMinutes: newPrepTime } : o)),
    );
    updateStatus(`Order ${order.orderNumber} prep buffer adjusted to ${newPrepTime} mins.`);
  }

  // Mark food ready
  async function handleMarkReady(order: SimulatedOrder) {
    if (!isKitchenAuthorized) {
      updateStatus(`Permission denied: role ${activeRole} cannot transition orders to ready.`);
      return;
    }

    if (apiBase && accessToken) {
      try {
        const res = await fetch(`${apiBase}/api/v1/restaurant/orders/${order.orderId}/status`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'READY_FOR_PICKUP',
            note: 'Kitchen confirmed food packaged and ready for delivery partner pickup',
          }),
        });
        const data = (await res.json()) as ApiResponse<{ order: OrderDto }>;
        if (!res.ok || !data.success) {
          updateStatus(
            data.success ? 'Mark ready failed' : `Ready transition error: ${data.error.message}`,
          );
          return;
        }
        updateStatus(`Order ${order.orderNumber} marked READY FOR PICKUP; rider alert triggered.`);
        await fetchLiveOrders();
        return;
      } catch {
        updateStatus('Failed to send live ready transition; updating preview.');
      }
    }

    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === order.orderId
          ? {
              ...o,
              status: 'READY_FOR_PICKUP',
              readyAt: Date.now(),
            }
          : o,
      ),
    );
    updateStatus(`Order ${order.orderNumber} marked READY FOR PICKUP; rider alert triggered.`);
  }

  // Open reject modal
  function openRejectModal(order: SimulatedOrder) {
    setSelectedOrderForReject(order);
    setRejectReason('OUTLET_OUT_OF_STOCK');
    setRejectNote('');
    rejectDialogRef.current?.showModal();
  }

  // Confirm reject order
  async function handleConfirmReject() {
    if (!selectedOrderForReject) return;
    const order = selectedOrderForReject;

    if (apiBase && accessToken) {
      try {
        const res = await fetch(`${apiBase}/api/v1/restaurant/orders/${order.orderId}/reject`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reasonCode: rejectReason,
            note: rejectNote.trim() || 'Kitchen rejected by staff',
          }),
        });
        const data = (await res.json()) as ApiResponse<{ order: OrderDto }>;
        if (!res.ok || !data.success) {
          updateStatus(
            data.success ? 'Reject order failed' : `Reject error: ${data.error.message}`,
          );
          return;
        }
        updateStatus(
          `Order ${order.orderNumber} rejected (${rejectReason}); customer full refund queued.`,
        );
        rejectDialogRef.current?.close();
        await fetchLiveOrders();
        return;
      } catch {
        updateStatus('Failed to send reject request; updating preview.');
      }
    }

    setOrders((prev) =>
      prev.map((o) =>
        o.orderId === order.orderId
          ? {
              ...o,
              status: 'CANCELLED',
              cancellationReason: rejectReason,
              cancellationRefundStatus: 'QUEUED_FULL_REFUND',
            }
          : o,
      ),
    );
    updateStatus(
      `Order ${order.orderNumber} rejected (${rejectReason}); customer full refund queued.`,
    );
    rejectDialogRef.current?.close();
  }

  // Simulate new incoming order for testing
  function handleSimulateIncomingOrder() {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const newSimOrder: SimulatedOrder = {
      orderId: `ord_sim_${randomSuffix}`,
      orderNumber: `BHJ-2026-N${randomSuffix}`,
      customerName: 'Sourav G.',
      customerPhoneMasked: '+91 98305 ••••',
      deliveryZone: 'Salt Lake Sec V',
      status: 'CONFIRMED',
      items: [
        {
          name: 'Special Kolkata Egg Chicken Roll',
          quantity: 2,
          dietaryType: 'NON_VEG',
          selectionSummary: 'Flaky Paratha · Green Chili & Lemon',
          allergens: ['GLUTEN', 'EGG'],
        },
        {
          name: 'Gondhoraj Lime Sharbat',
          quantity: 2,
          dietaryType: 'PURE_VEG',
          selectionSummary: 'Chilled Kolkata Fragrant Lime',
          allergens: [],
        },
      ],
      specialInstructions: 'Make roll crisp, no raw onions',
      prepTimeMinutes: 20,
      prepStartedAt: null,
      readyAt: null,
      totalFormattedInr: '₹340.00',
      deliveryOtp: `${Math.floor(1000 + Math.random() * 9000)}`,
    };

    setOrders((prev) => [newSimOrder, ...prev]);
    if (audioEnabled) {
      playAudioChime();
    }
    updateStatus(`Simulated incoming order ${newSimOrder.orderNumber} placed (chime played).`);
  }

  const incomingOrders = orders.filter((o) => o.status === 'CONFIRMED');
  const preparingOrders = orders.filter((o) => o.status === 'PREPARING');
  const readyOrders = orders.filter((o) => o.status === 'READY_FOR_PICKUP');
  const historyOrders = orders.filter((o) => o.status === 'DELIVERED' || o.status === 'CANCELLED');

  return (
    <section className="panel kds-panel" aria-label="Kitchen Order Dashboard">
      <div className="kds-header">
        <div>
          <span className="badge badge-accent">Live Kitchen Display (KDS)</span>
          <h2>Kitchen Order Operations — {selectedOutletName}</h2>
          <p className="brand-sub">
            Order queue, live cooking turnaround buffers, allergen tickets, and rider handover
            verification for assigned outlet crew.
          </p>
        </div>

        <div className="kds-controls">
          <button
            type="button"
            className={`btn-ghost ${audioEnabled ? 'btn-active-chime' : ''}`}
            onClick={() => {
              const next = !audioEnabled;
              setAudioEnabled(next);
              if (next) playAudioChime();
              updateStatus(next ? 'Kitchen audio chime enabled.' : 'Kitchen audio chime muted.');
            }}
            aria-pressed={audioEnabled}
            title="Toggle audio alert when new order arrives"
          >
            {audioEnabled ? '🔔 Chime On' : '🔕 Muted'}
          </button>

          <button
            type="button"
            className={`btn-ghost ${autoRefresh ? 'btn-active-chime' : ''}`}
            onClick={() => {
              const next = !autoRefresh;
              setAutoRefresh(next);
              updateStatus(next ? 'Live auto-refresh enabled.' : 'Live auto-refresh paused.');
            }}
            aria-pressed={autoRefresh}
            title="Toggle live auto-refresh"
          >
            {autoRefresh ? '⚡ Auto-Sync On' : '⏸ Auto-Sync Off'}
          </button>

          {apiBase && accessToken && (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void fetchLiveOrders()}
              title="Refresh live orders from server"
            >
              ↻ Refresh Orders
            </button>
          )}

          <button
            type="button"
            className="btn-primary"
            id="simulateIncomingOrderBtn"
            onClick={handleSimulateIncomingOrder}
            title="Simulate a new incoming customer order with chime"
          >
            + Simulate Incoming Order
          </button>
        </div>
      </div>

      <div className="kds-metrics-bar">
        <div className="kds-metric">
          <span className="kds-metric-label">Active Queue</span>
          <span className="kds-metric-val">
            {incomingOrders.length + preparingOrders.length + readyOrders.length} orders
          </span>
        </div>
        <div className="kds-metric">
          <span className="kds-metric-label">Needs Acceptance</span>
          <span className={`kds-metric-val ${incomingOrders.length > 0 ? 'text-accent' : ''}`}>
            {incomingOrders.length} new
          </span>
        </div>
        <div className="kds-metric">
          <span className="kds-metric-label">On Stove / Cooking</span>
          <span className="kds-metric-val">{preparingOrders.length} active</span>
        </div>
        <div className="kds-metric">
          <span className="kds-metric-label">Ready for Pickup</span>
          <span className="kds-metric-val">{readyOrders.length} bagged</span>
        </div>
        <div className="kds-metric">
          <span className="kds-metric-label">Assigned Staff Role</span>
          <span className="kds-metric-val badge">{activeRole}</span>
        </div>
      </div>

      <div className="kds-tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'kanban'}
          className={`tab-btn ${activeTab === 'kanban' ? 'active' : ''}`}
          onClick={() => setActiveTab('kanban')}
        >
          Live Prep Board ({incomingOrders.length + preparingOrders.length + readyOrders.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Order History ({historyOrders.length})
        </button>
      </div>

      {activeTab === 'kanban' ? (
        <div className="kds-kanban-board">
          {/* Column 1: Incoming Orders */}
          <div className="kds-column kds-column-incoming">
            <div className="kds-column-header">
              <h3>
                1. Incoming Orders <span className="kds-count-badge">{incomingOrders.length}</span>
              </h3>
              <span className="kds-col-hint">Accept to start kitchen prep timer</span>
            </div>

            {incomingOrders.length === 0 ? (
              <div className="kds-empty-state">
                <p>No incoming orders waiting.</p>
                <small>Tap &quot;Simulate Incoming Order&quot; above to test new order flow.</small>
              </div>
            ) : (
              incomingOrders.map((order) => (
                <article key={order.orderId} className="kds-card kds-card-incoming">
                  <div className="kds-card-header">
                    <div>
                      <span className="kds-order-number">{order.orderNumber}</span>
                      <p className="kds-customer-name">
                        {order.customerName} • 📍 {order.deliveryZone}
                      </p>
                    </div>
                    <span className="badge badge-accent pulse-badge">Incoming</span>
                  </div>

                  <div className="kds-items-list">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="kds-item-row">
                        <span className="kds-item-qty">{item.quantity}×</span>
                        <div className="kds-item-detail">
                          <p className="kds-item-title">
                            <span
                              className={`dietary-dot ${item.dietaryType === 'PURE_VEG' ? 'veg' : 'non-veg'}`}
                              aria-hidden="true"
                            />
                            {item.name}
                          </p>
                          {item.selectionSummary && (
                            <p className="kds-item-custom">{item.selectionSummary}</p>
                          )}
                          {item.allergens.length > 0 && (
                            <p className="kds-item-allergen">
                              ⚠️ Allergens: {item.allergens.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {order.specialInstructions && (
                    <div className="kds-instructions">
                      <strong>Cooking note:</strong> {order.specialInstructions}
                    </div>
                  )}

                  <div className="kds-card-footer">
                    <span className="kds-total">{order.totalFormattedInr}</span>
                    <div className="kds-action-buttons">
                      <button
                        type="button"
                        className="btn-danger-outline"
                        id={`rejectBtn-${order.orderId}`}
                        onClick={() => openRejectModal(order)}
                        title="Reject order due to out of stock or kitchen capacity"
                      >
                        Reject
                      </button>

                      <div className="kds-accept-split">
                        <button
                          type="button"
                          className="btn-primary"
                          id={`acceptBtn-${order.orderId}`}
                          onClick={() => void handleAcceptOrder(order, order.prepTimeMinutes || 20)}
                          title={`Accept order with standard ${order.prepTimeMinutes || 20} min prep`}
                        >
                          Accept ({order.prepTimeMinutes || 20}m)
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => void handleAcceptOrder(order, 30)}
                          title="Accept with 30 min rush prep time"
                        >
                          +30m
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          {/* Column 2: In Preparation */}
          <div className="kds-column kds-column-preparing">
            <div className="kds-column-header">
              <h3>
                2. Cooking / In Prep{' '}
                <span className="kds-count-badge">{preparingOrders.length}</span>
              </h3>
              <span className="kds-col-hint">Manage prep timer and buffer</span>
            </div>

            {preparingOrders.length === 0 ? (
              <div className="kds-empty-state">
                <p>No orders currently cooking.</p>
                <small>Accept an order from the incoming column to start.</small>
              </div>
            ) : (
              preparingOrders.map((order) => {
                const elapsedMinutes = order.prepStartedAt
                  ? Math.max(0, Math.floor((Date.now() - order.prepStartedAt) / 60000))
                  : 5;
                const remainingMinutes = Math.max(0, order.prepTimeMinutes - elapsedMinutes);
                const isOverdue = elapsedMinutes > order.prepTimeMinutes;

                return (
                  <article key={order.orderId} className="kds-card kds-card-preparing">
                    <div className="kds-card-header">
                      <div>
                        <span className="kds-order-number">{order.orderNumber}</span>
                        <p className="kds-customer-name">
                          {order.customerName} • 📍 {order.deliveryZone}
                        </p>
                      </div>
                      <span className={`badge ${isOverdue ? 'badge-warn' : 'badge-green'}`}>
                        {isOverdue ? 'Over Target Time' : 'In Prep'}
                      </span>
                    </div>

                    <div className="kds-timer-bar-wrap">
                      <div className="kds-timer-meta">
                        <span>
                          Target Prep: <strong>{order.prepTimeMinutes} mins</strong>
                        </span>
                        <span>
                          Elapsed: <strong>{elapsedMinutes} mins</strong>
                        </span>
                      </div>
                      <div className="kds-timer-progress-track">
                        <div
                          className={`kds-timer-progress-fill ${isOverdue ? 'overdue' : ''}`}
                          style={{
                            width: `${Math.min(100, (elapsedMinutes / (order.prepTimeMinutes || 20)) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="kds-timer-status">
                        {isOverdue
                          ? `⚠️ Running ${elapsedMinutes - order.prepTimeMinutes}m behind target`
                          : `⏱️ Approx ${remainingMinutes} mins remaining`}
                      </p>
                    </div>

                    <div className="kds-items-list">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="kds-item-row">
                          <label className="kds-checkbox-row">
                            <input type="checkbox" defaultChecked={false} />
                            <span className="kds-item-qty">{item.quantity}×</span>
                            <span className="kds-item-title">
                              <span
                                className={`dietary-dot ${item.dietaryType === 'PURE_VEG' ? 'veg' : 'non-veg'}`}
                                aria-hidden="true"
                              />
                              {item.name}
                            </span>
                          </label>
                        </div>
                      ))}
                    </div>

                    {order.specialInstructions && (
                      <div className="kds-instructions">
                        <strong>Cooking note:</strong> {order.specialInstructions}
                      </div>
                    )}

                    <div className="kds-prep-adjuster">
                      <span className="kds-adjuster-label">Adjust Prep Buffer:</span>
                      <div className="kds-adjuster-buttons">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          id={`addPrep5Btn-${order.orderId}`}
                          onClick={() => void handleAdjustPrepTime(order, 5)}
                          title="Add +5 minutes prep buffer"
                        >
                          +5m
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          id={`addPrep10Btn-${order.orderId}`}
                          onClick={() => void handleAdjustPrepTime(order, 10)}
                          title="Add +10 minutes prep buffer"
                        >
                          +10m
                        </button>
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          id={`addPrep15Btn-${order.orderId}`}
                          onClick={() => void handleAdjustPrepTime(order, 15)}
                          title="Add +15 minutes prep buffer"
                        >
                          +15m
                        </button>
                      </div>
                    </div>

                    <div className="kds-card-footer">
                      <span className="kds-total">{order.totalFormattedInr}</span>
                      <button
                        type="button"
                        className="btn-success"
                        id={`markReadyBtn-${order.orderId}`}
                        onClick={() => void handleMarkReady(order)}
                        title="Confirm all items are cooked, packed and ready for rider pickup"
                      >
                        ✓ Food Ready for Pickup
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          {/* Column 3: Ready for Pickup */}
          <div className="kds-column kds-column-ready">
            <div className="kds-column-header">
              <h3>
                3. Ready for Pickup <span className="kds-count-badge">{readyOrders.length}</span>
              </h3>
              <span className="kds-col-hint">Rider dispatch &amp; PIN handover</span>
            </div>

            {readyOrders.length === 0 ? (
              <div className="kds-empty-state">
                <p>No orders waiting for pickup.</p>
                <small>Food marked ready will appear here for rider handover.</small>
              </div>
            ) : (
              readyOrders.map((order) => (
                <article key={order.orderId} className="kds-card kds-card-ready">
                  <div className="kds-card-header">
                    <div>
                      <span className="kds-order-number">{order.orderNumber}</span>
                      <p className="kds-customer-name">
                        {order.customerName} • 📍 {order.deliveryZone}
                      </p>
                    </div>
                    <span className="badge badge-green">Ready</span>
                  </div>

                  <div className="kds-ready-dispatch-box">
                    <p className="kds-dispatch-title">🛵 Rider Dispatch Status</p>
                    <p className="kds-dispatch-sub">Delivery partner assigned &amp; arriving</p>
                    <div className="kds-pin-badge">
                      <span>Rider Handover PIN:</span>
                      <strong>{order.deliveryOtp}</strong>
                    </div>
                  </div>

                  <div className="kds-items-list compact">
                    {order.items.map((item, idx) => (
                      <p key={idx} className="kds-item-summary-line">
                        {item.quantity}× {item.name}
                      </p>
                    ))}
                  </div>

                  <div className="kds-card-footer">
                    <span className="kds-total">{order.totalFormattedInr}</span>
                    <span className="kds-ready-timestamp">
                      Ready at{' '}
                      {new Date(order.readyAt || Date.now()).toLocaleTimeString('en-IN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      ) : (
        /* Order History View */
        <div className="kds-history-view">
          <h3>Completed &amp; Cancelled Orders</h3>
          {historyOrders.length === 0 ? (
            <p className="kds-empty-state">No historical orders in current shift.</p>
          ) : (
            <div className="kds-history-table-wrap">
              <table className="kds-history-table">
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Final Status</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {historyOrders.map((o) => (
                    <tr key={o.orderId}>
                      <td>
                        <strong>{o.orderNumber}</strong>
                      </td>
                      <td>{o.customerName}</td>
                      <td>{o.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}</td>
                      <td>{o.totalFormattedInr}</td>
                      <td>
                        <span
                          className={`badge ${o.status === 'CANCELLED' ? 'badge-warn' : 'badge-green'}`}
                        >
                          {o.status}
                        </span>
                      </td>
                      <td>
                        {o.status === 'CANCELLED'
                          ? `${o.cancellationReason || 'Rejected'} (${o.cancellationRefundStatus || 'REFUND_PENDING'})`
                          : 'Delivered to customer'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reject Order Modal */}
      <dialog ref={rejectDialogRef} className="kds-modal" id="rejectOrderModal">
        {selectedOrderForReject && (
          <div className="kds-modal-content">
            <div className="kds-modal-header">
              <h3>Reject Order {selectedOrderForReject.orderNumber}</h3>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => rejectDialogRef.current?.close()}
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <p className="kds-modal-lead">
              Rejecting an order triggers an immediate full customer refund and records an immutable
              audit log entry.
            </p>

            <div className="field">
              <label htmlFor="rejectReasonSelect">Reason for Rejection</label>
              <select
                id="rejectReasonSelect"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value as OrderCancelReason)}
              >
                <option value="OUTLET_OUT_OF_STOCK">Kitchen items out of stock</option>
                <option value="DELIVERY_DELAY">Kitchen at maximum capacity / surge backlog</option>
                <option value="OPS_INTERVENTION">Outlet closing / kitchen power maintenance</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="rejectNoteInput">Staff Operational Note (Optional)</label>
              <textarea
                id="rejectNoteInput"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="e.g. Mutton biryani handi exhausted before 10pm shift"
                rows={3}
              />
            </div>

            <div className="kds-modal-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => rejectDialogRef.current?.close()}
              >
                Keep Order
              </button>
              <button
                type="button"
                className="btn-danger"
                id="confirmRejectBtn"
                onClick={() => void handleConfirmReject()}
              >
                Confirm Reject &amp; Full Refund
              </button>
            </div>
          </div>
        )}
      </dialog>

      <p className="status-note" role="status" aria-live="polite">
        {statusMessage}
      </p>
    </section>
  );
}
