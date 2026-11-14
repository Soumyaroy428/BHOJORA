import { useEffect, useState } from 'react';

interface SettlementBatchDto {
  batchId: string;
  batchName: string;
  status: 'PENDING' | 'DISPATCHED' | 'SETTLED' | 'RECONCILED';
  totalPaise: number;
  provider: 'BANK' | 'RUPAY' | 'UPI' | 'STRIPE';
  createdAtIso: string;
}

interface RefundRecordDto {
  refundId: string;
  orderId: string;
  paymentId: string;
  customerId: string;
  amountPaise: number;
  reason: string;
  status:
    'REQUESTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
}

interface Props {
  apiBase: string;
  accessToken: string | null;
  mfaVerified: boolean;
  onStatusUpdate: (message: string) => void;
}

export function FinanceSettlementPanel({
  apiBase,
  accessToken,
  mfaVerified,
  onStatusUpdate,
}: Props) {
  const [refunds, setRefunds] = useState<RefundRecordDto[]>([]);
  const [batches, setBatches] = useState<SettlementBatchDto[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiBase || !accessToken) {
      return;
    }
    void loadFinanceReview();
  }, [apiBase, accessToken]);

  async function loadFinanceReview() {
    setLoading(true);
    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
      };
      const [refundRes, batchRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/finance/refunds`, { headers }),
        fetch(`${apiBase}/api/v1/finance/settlement-batches`, { headers }),
      ]);

      if (refundRes.ok) {
        const payload = await refundRes.json();
        setRefunds((payload.data?.refunds ?? []) as RefundRecordDto[]);
      }
      if (batchRes.ok) {
        const payload = await batchRes.json();
        setBatches((payload.data?.batches ?? []) as SettlementBatchDto[]);
      }
    } catch {
      onStatusUpdate('Unable to load finance refunds and settlement batches');
    } finally {
      setLoading(false);
    }
  }

  const pendingRefunds = refunds.filter((refund) =>
    ['REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING'].includes(refund.status),
  );

  return (
    <section className="panel panel-alt" aria-label="Finance and settlements review panel">
      <h2>Finance &amp; Settlements</h2>
      <p className="brand-sub">
        Review pending refunds, settlement batches, and payout reconciliation states. Finance admins
        require verified step-up MFA.
      </p>
      {!mfaVerified ? (
        <p className="status-note">
          Verified MFA required before approving or dispatching payouts.
        </p>
      ) : null}
      <div className="queue-list">
        {loading ? <p className="status-note">Loading finance review queue…</p> : null}
        {pendingRefunds.length === 0 ? (
          <p className="status-note">No pending refunds requiring finance review.</p>
        ) : (
          pendingRefunds.map((refund) => (
            <div key={refund.refundId} className="queue-item">
              <div>
                <strong>{refund.orderId}</strong>
                <div className="brand-sub">
                  {refund.reason} · ₹{(refund.amountPaise / 100).toFixed(2)} · {refund.status}
                </div>
              </div>
              <span className="pill">{refund.status}</span>
            </div>
          ))
        )}
      </div>

      <h3>Settlement batches</h3>
      <div className="queue-list">
        {batches.length === 0 ? (
          <p className="status-note">No settlement batches created yet.</p>
        ) : (
          batches.map((batch) => (
            <div key={batch.batchId} className="queue-item">
              <div>
                <strong>{batch.batchName}</strong>
                <div className="brand-sub">
                  {batch.provider} · ₹{(batch.totalPaise / 100).toFixed(2)} · {batch.status}
                </div>
              </div>
              <span className="pill">{batch.status}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
