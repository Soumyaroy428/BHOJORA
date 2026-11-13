import { useEffect, useState } from 'react';
import type { DeliveryPartnerDto, DeliveryPartnerStatus } from '@bhojora/shared';

interface DeliveryPartnerReviewQueueProps {
  apiBase: string;
  accessToken: string | null;
  mfaVerified: boolean;
  onStatusUpdate: (message: string) => void;
}

const MOCK_DELIVERY_APPLICATIONS: DeliveryPartnerDto[] = [
  {
    partnerId: 'del_kol_001',
    userId: 'usr_rider_subhas',
    fullName: 'Subhashish Banerjee',
    phoneMasked: '+91 98300 *****',
    email: 'subhashish.banerjee@example.in',
    city: 'Kolkata',
    preferredZones: ['central', 'south'],
    vehicle: {
      vehicleType: 'MOTORCYCLE',
      model: 'Bajaj Pulsar 150',
      registrationNumberMasked: 'WB02-XXXX-8921',
    },
    status: 'UNDER_REVIEW',
    shiftStatus: 'OFFLINE',
    documents: [
      {
        documentId: 'doc_dl_001',
        type: 'DRIVING_LICENSE',
        documentNumberMasked: 'XXXXXXXXXXX8921',
        fileUrl: 'https://storage.bhojora.in/private/docs/dl_subhas.pdf',
        mimeType: 'application/pdf',
        isPublic: false,
        verificationStatus: 'PENDING_REVIEW',
        rejectionReason: null,
        uploadedAt: new Date(Date.now() - 3600000).toISOString(),
        verifiedAt: null,
      },
      {
        documentId: 'doc_rc_001',
        type: 'VEHICLE_RC',
        documentNumberMasked: 'WBXX-XXXX-8921',
        fileUrl: 'https://storage.bhojora.in/private/docs/rc_subhas.pdf',
        mimeType: 'application/pdf',
        isPublic: false,
        verificationStatus: 'PENDING_REVIEW',
        rejectionReason: null,
        uploadedAt: new Date(Date.now() - 3600000).toISOString(),
        verifiedAt: null,
      },
      {
        documentId: 'doc_pan_001',
        type: 'PAN_CARD',
        documentNumberMasked: 'XXXXX5678K',
        fileUrl: 'https://storage.bhojora.in/private/docs/pan_subhas.pdf',
        mimeType: 'application/pdf',
        isPublic: false,
        verificationStatus: 'PENDING_REVIEW',
        rejectionReason: null,
        uploadedAt: new Date(Date.now() - 3600000).toISOString(),
        verifiedAt: null,
      },
    ],
    bankPayout: {
      accountHolderName: 'Subhashish Banerjee',
      accountNumberMasked: 'XXXXXXXX3456',
      ifscCode: 'SBIN0000001',
      bankName: 'State Bank of India — Kolkata Main Branch',
    },
    emergencyContact: {
      name: 'Rina Banerjee',
      phoneMasked: '+91 98311 *****',
      relationship: 'Spouse',
    },
    rejectionReason: null,
    rating: 5.0,
    totalDeliveries: 0,
    submittedAt: new Date(Date.now() - 3600000).toISOString(),
    reviewedAt: null,
    approvedAt: null,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    partnerId: 'del_kol_002',
    userId: 'usr_rider_debrata',
    fullName: 'Debabrata Mukherjee',
    phoneMasked: '+91 98305 *****',
    email: 'debabrata.m@example.in',
    city: 'Kolkata',
    preferredZones: ['salt-lake', 'new-town'],
    vehicle: {
      vehicleType: 'ELECTRIC_SCOOTER',
      model: 'Ather 450X Gen 3',
      registrationNumberMasked: 'WB08-XXXX-1142',
    },
    status: 'APPROVED',
    shiftStatus: 'ONLINE',
    documents: [
      {
        documentId: 'doc_dl_002',
        type: 'DRIVING_LICENSE',
        documentNumberMasked: 'XXXXXXXXXXX1142',
        fileUrl: 'https://storage.bhojora.in/private/docs/dl_deb.pdf',
        mimeType: 'application/pdf',
        isPublic: false,
        verificationStatus: 'VERIFIED',
        rejectionReason: null,
        uploadedAt: new Date(Date.now() - 86400000).toISOString(),
        verifiedAt: new Date(Date.now() - 43200000).toISOString(),
      },
    ],
    bankPayout: {
      accountHolderName: 'Debabrata Mukherjee',
      accountNumberMasked: 'XXXXXXXX7890',
      ifscCode: 'HDFC0000128',
      bankName: 'HDFC Bank Salt Lake Sector 1',
    },
    emergencyContact: {
      name: 'Pradip Mukherjee',
      phoneMasked: '+91 98302 *****',
      relationship: 'Father',
    },
    rejectionReason: null,
    rating: 4.95,
    totalDeliveries: 42,
    submittedAt: new Date(Date.now() - 86400000).toISOString(),
    reviewedAt: new Date(Date.now() - 43200000).toISOString(),
    approvedAt: new Date(Date.now() - 43200000).toISOString(),
    createdAt: new Date(Date.now() - 90000000).toISOString(),
    updatedAt: new Date(Date.now() - 43200000).toISOString(),
  },
];

export function DeliveryPartnerReviewQueue(props: DeliveryPartnerReviewQueueProps) {
  const { apiBase, accessToken, mfaVerified, onStatusUpdate } = props;
  const [applications, setApplications] = useState<DeliveryPartnerDto[]>(
    MOCK_DELIVERY_APPLICATIONS,
  );
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>('del_kol_001');
  const [filterStatus, setFilterStatus] = useState<DeliveryPartnerStatus | 'ALL'>('ALL');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!apiBase || !accessToken) return;
    async function loadQueue() {
      try {
        const query = filterStatus === 'ALL' ? '' : `?status=${filterStatus}`;
        const res = await fetch(`${apiBase}/api/v1/delivery/admin/applications${query}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data?.applications) {
            setApplications(json.data.applications);
          }
        }
      } catch {
        // Fallback to static mock queue
      }
    }
    void loadQueue();
  }, [apiBase, accessToken, filterStatus]);

  const selectedPartner = applications.find((p) => p.partnerId === selectedPartnerId);

  const handleReview = async (action: 'APPROVE' | 'REJECT') => {
    if (!selectedPartner) return;
    if (action === 'REJECT' && rejectionReason.trim().length < 8) {
      onStatusUpdate('Rejection requires an explicit reason of at least 8 characters.');
      return;
    }

    if (!mfaVerified && apiBase && accessToken) {
      onStatusUpdate(
        'Privileged step-up MFA verification required before approving or rejecting riders.',
      );
      return;
    }

    setIsSubmitting(true);
    if (apiBase && accessToken) {
      try {
        const res = await fetch(
          `${apiBase}/api/v1/delivery/admin/applications/${selectedPartner.partnerId}/review`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ action, reason: rejectionReason }),
          },
        );
        const data = await res.json();
        if (res.ok && data.success) {
          onStatusUpdate(
            `Application ${action === 'APPROVE' ? 'APPROVED' : 'REJECTED'} successfully.`,
          );
          setApplications((prev) =>
            prev.map((p) =>
              p.partnerId === selectedPartner.partnerId ? data.data.application : p,
            ),
          );
          setRejectionReason('');
        } else {
          onStatusUpdate(`Review failed: ${data.error?.message || 'Server error'}`);
        }
      } catch (err: unknown) {
        onStatusUpdate(`Network error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Static local mock update
    const updatedStatus: DeliveryPartnerStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    setApplications((prev) =>
      prev.map((p) =>
        p.partnerId === selectedPartner.partnerId
          ? {
              ...p,
              status: updatedStatus,
              rejectionReason: action === 'REJECT' ? rejectionReason : null,
              approvedAt: action === 'APPROVE' ? new Date().toISOString() : null,
              reviewedAt: new Date().toISOString(),
              documents: p.documents.map((d) => ({
                ...d,
                verificationStatus: action === 'APPROVE' ? 'VERIFIED' : 'REJECTED',
                verifiedAt: action === 'APPROVE' ? new Date().toISOString() : null,
              })),
            }
          : p,
      ),
    );
    onStatusUpdate(
      `Mock delivery application ${action === 'APPROVE' ? 'APPROVED' : 'REJECTED'} for ${selectedPartner.fullName}.`,
    );
    setRejectionReason('');
    setIsSubmitting(false);
  };

  const filtered =
    filterStatus === 'ALL' ? applications : applications.filter((p) => p.status === filterStatus);

  return (
    <section className="panel" data-testid="delivery-review-queue-panel">
      <h2>Delivery Partner Compliance Queue ({applications.length} Applications)</h2>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
        Review delivery fleet onboarding, verify masked KYC documents, and approve Kolkata zone
        riders.
      </p>

      {/* Filter row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {(['ALL', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'] as const).map((st) => (
          <button
            key={st}
            type="button"
            className={`filter-btn ${filterStatus === st ? 'active' : ''}`}
            onClick={() => setFilterStatus(st)}
          >
            {st.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
        {/* List of Applications */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map((item) => (
            <div
              key={item.partnerId}
              data-testid={`partner-card-${item.partnerId}`}
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                backgroundColor:
                  selectedPartnerId === item.partnerId ? 'var(--bg-card)' : 'var(--bg-surface)',
                cursor: 'pointer',
              }}
              onClick={() => setSelectedPartnerId(item.partnerId)}
            >
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <strong style={{ fontSize: '0.95rem' }}>{item.fullName}</strong>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor:
                      item.status === 'APPROVED'
                        ? 'rgba(74, 222, 128, 0.15)'
                        : item.status === 'REJECTED'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : 'rgba(250, 204, 21, 0.15)',
                    color:
                      item.status === 'APPROVED'
                        ? '#4ade80'
                        : item.status === 'REJECTED'
                          ? '#ef4444'
                          : '#facc15',
                  }}
                >
                  {item.status}
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                {item.vehicle.model} ({item.vehicle.vehicleType}) • {item.preferredZones.join(', ')}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '12px' }}>
              No applications match filter.
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selectedPartner ? (
          <div
            data-testid="partner-detail-view"
            style={{
              padding: '1.25rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--bg-surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{selectedPartner.fullName}</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  ID: {selectedPartner.partnerId} • User: {selectedPartner.userId} • Phone:{' '}
                  {selectedPartner.phoneMasked}
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: '9999px',
                  border: '1px solid currentColor',
                }}
              >
                {selectedPartner.status}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '10px',
                fontSize: '0.85rem',
                backgroundColor: 'var(--bg-card)',
                padding: '12px',
                borderRadius: '6px',
              }}
            >
              <div>
                <strong>Vehicle:</strong> {selectedPartner.vehicle.model} (
                {selectedPartner.vehicle.vehicleType})
              </div>
              <div>
                <strong>Plate:</strong>{' '}
                {selectedPartner.vehicle.registrationNumberMasked || 'Bicycle / Unregistered'}
              </div>
              <div>
                <strong>Operating Zones:</strong> {selectedPartner.preferredZones.join(', ')}
              </div>
              <div>
                <strong>Emergency Contact:</strong> {selectedPartner.emergencyContact?.name} (
                {selectedPartner.emergencyContact?.phoneMasked})
              </div>
              <div>
                <strong>Bank Payout:</strong> {selectedPartner.bankPayout?.bankName} (
                {selectedPartner.bankPayout?.accountNumberMasked})
              </div>
              <div>
                <strong>IFSC Code:</strong> {selectedPartner.bankPayout?.ifscCode}
              </div>
            </div>

            {/* Private KYC Documents Section */}
            <div>
              <h4 style={{ fontSize: '0.95rem', margin: '0 0 8px 0' }}>
                Private KYC Vault Documents (isPublic: false)
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selectedPartner.documents.map((doc) => (
                  <div
                    key={doc.documentId}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      backgroundColor: 'var(--bg-card)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div>
                      <strong>{doc.type.replace(/_/g, ' ')}:</strong>{' '}
                      <span style={{ color: 'var(--brand-accent)' }}>
                        {doc.documentNumberMasked}
                      </span>
                      <span
                        style={{
                          marginLeft: '8px',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted)',
                        }}
                      >
                        ({doc.mimeType})
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: doc.verificationStatus === 'VERIFIED' ? '#4ade80' : '#facc15',
                      }}
                    >
                      {doc.verificationStatus}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {selectedPartner.rejectionReason && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#ef4444',
                  fontSize: '0.85rem',
                }}
              >
                <strong>Previous Rejection:</strong> {selectedPartner.rejectionReason}
              </div>
            )}

            {/* Review Action Controls */}
            {selectedPartner.status !== 'APPROVED' && (
              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div className="field">
                  <label htmlFor="rejectionNote">
                    Rejection / Review Audit Reason (Min 8 chars)
                  </label>
                  <input
                    id="rejectionNote"
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. DL expiry date unreadable; re-upload photo"
                    disabled={isSubmitting}
                  />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    data-testid="btn-approve-partner"
                    type="button"
                    className="btn-primary"
                    style={{ backgroundColor: '#22c55e', color: '#000', flex: 1 }}
                    onClick={() => void handleReview('APPROVE')}
                    disabled={isSubmitting}
                  >
                    ✓ Approve Delivery Partner
                  </button>
                  <button
                    data-testid="btn-reject-partner"
                    type="button"
                    className="btn-secondary"
                    style={{ borderColor: '#ef4444', color: '#ef4444', flex: 1 }}
                    onClick={() => void handleReview('REJECT')}
                    disabled={isSubmitting}
                  >
                    ✕ Reject Application
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-muted)', fontStyle: 'italic', padding: '24px' }}>
            Select an application from the queue to inspect KYC records.
          </div>
        )}
      </div>
    </section>
  );
}
