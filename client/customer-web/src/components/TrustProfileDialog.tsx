import { useEffect, useRef, useState } from 'react';
import type { PublicTrustProfileDto } from '@bhojora/shared';
import { TRUST_CATEGORY_LABELS } from '../data/kitchens';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';
import { apiRequest } from '../lib/apiClient';
import type { KitchenOutlet } from '../types/domain';

interface TrustProfileDialogProps {
  kitchen: KitchenOutlet | null;
  onClose: () => void;
}

export function TrustProfileDialog({ kitchen, onClose }: TrustProfileDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [liveProfile, setLiveProfile] = useState<PublicTrustProfileDto | null>(null);
  const [showQrPreview, setShowQrPreview] = useState(false);
  useDialogLightDismiss(dialogRef);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (kitchen && !dialog.open) {
      dialog.showModal();
    } else if (!kitchen && dialog.open) {
      dialog.close();
    }
  }, [kitchen]);

  useEffect(() => {
    if (!kitchen) {
      setLiveProfile(null);
      setShowQrPreview(false);
      return;
    }

    const outletId = kitchen.outletId || kitchen.key;
    let active = true;

    void apiRequest<{ profile: PublicTrustProfileDto }>(
      `/safety/outlets/${encodeURIComponent(outletId)}`,
    )
      .then((res) => {
        if (active && res.profile) {
          setLiveProfile(res.profile);
        }
      })
      .catch(() => {
        // Fall back gracefully to static mock data
      });

    return () => {
      active = false;
    };
  }, [kitchen]);

  const isVerified = liveProfile ? liveProfile.isVerified : (kitchen?.isVerified ?? false);
  const isExpired = liveProfile?.isExpired ?? false;
  const isSuspended = liveProfile?.status === 'SUSPENDED';
  const score = liveProfile ? liveProfile.currentScore : kitchen?.score;
  const grade = liveProfile?.grade;

  return (
    <dialog
      ref={dialogRef}
      id="trustModal"
      className="trust-dialog"
      closedby="any"
      aria-labelledby="modalOutletName"
      onClose={onClose}
    >
      <div className="modal-header">
        <div>
          <h2 id="modalOutletName" style={{ fontSize: '18px' }}>
            {liveProfile?.brandName ?? kitchen?.fullName ?? 'Arsalan (Park Circus)'}
          </h2>
          <p id="modalFssai" style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
            FSSAI Lic. No: {liveProfile?.fssaiLicenseNumber ?? kitchen?.fssai ?? '12821008000491'}
          </p>
        </div>
        <form method="dialog">
          <button type="submit" className="modal-close" aria-label="Close trust profile dialog">
            &times;
          </button>
        </form>
      </div>

      <div className="score-banner">
        <div>
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: isExpired
                ? 'var(--neutral-600)'
                : isSuspended
                  ? '#EF4444'
                  : isVerified
                    ? 'var(--trust-green)'
                    : 'var(--neutral-800)',
              textTransform: 'uppercase',
            }}
          >
            Independent Audit Result {grade ? `· Grade ${grade}` : ''}
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color: isExpired
                ? '#DC2626'
                : isSuspended
                  ? '#EF4444'
                  : isVerified
                    ? 'var(--trust-green-text)'
                    : 'var(--terracotta-dark)',
            }}
          >
            {isExpired
              ? 'INSPECTION EXPIRED (180 DAYS)'
              : isSuspended
                ? 'SAFETY HOLD — SUSPENDED'
                : isVerified
                  ? 'VERIFIED CLEAN KITCHEN'
                  : 'NOT YET INSPECTED BY BHOJORA'}
          </div>
          <div
            id="modalAuditDate"
            style={{ fontSize: '12px', color: 'var(--neutral-600)', marginTop: '2px' }}
          >
            {liveProfile?.inspectedAt
              ? `Inspected on: ${new Date(liveProfile.inspectedAt).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })} · Valid until: ${new Date(liveProfile.validUntil!).toLocaleDateString('en-IN', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}`
              : !isVerified
                ? (kitchen?.statusExplanation ?? 'Onboarding verified; physical audit pending.')
                : `Inspected on: ${kitchen?.auditDate ?? '14 Oct 2026'}`}
          </div>
        </div>
        <div className="score-number">
          {!isVerified || score === null ? (
            <span id="modalScoreVal" style={{ fontSize: '16px' }}>
              {isExpired ? 'Expired' : 'Pending Audit'}
            </span>
          ) : (
            <>
              <span id="modalScoreVal">{score}</span>
              <span style={{ fontSize: '16px', color: 'var(--neutral-600)' }}>/100</span>
            </>
          )}
        </div>
      </div>

      {liveProfile?.categoryBreakdown && liveProfile.categoryBreakdown.length > 0 ? (
        <>
          <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>
            Verified Category Score Breakdown
          </h3>
          {liveProfile.categoryBreakdown.map((cat, idx) => (
            <div key={cat.category} className="category-row">
              <div className="category-label">
                <span>{cat.categoryLabel}</span>
                <span id={`catPct${idx}`}>{cat.percentage}%</span>
              </div>
              <div className="progress-bar-bg">
                <div
                  id={`catBar${idx}`}
                  className="progress-bar-fill"
                  style={{ width: `${cat.percentage}%` }}
                />
              </div>
            </div>
          ))}
        </>
      ) : kitchen?.categoryPercentages ? (
        <>
          <h3 style={{ fontSize: '14px', marginBottom: '12px' }}>Category Score Breakdown</h3>
          {TRUST_CATEGORY_LABELS.map((label, idx) => {
            const pct = kitchen.categoryPercentages?.[idx] ?? 0;
            return (
              <div key={label} className="category-row">
                <div className="category-label">
                  <span>{label}</span>
                  <span id={`catPct${idx}`}>{pct}%</span>
                </div>
                <div className="progress-bar-bg">
                  <div
                    id={`catBar${idx}`}
                    className="progress-bar-fill"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <div
          className="disclaimer-box"
          style={{ marginTop: 0, marginBottom: '14px', background: 'var(--saffron-light)' }}
        >
          <strong>Verification Status Pending:</strong> Statutory FSSAI license{' '}
          <code>{kitchen?.fssai}</code> is on file, but no independent Bhojora hygiene score has
          been published yet. Category scores remain unpublished until physical audit sign-off.
        </div>
      )}

      {liveProfile?.publicEvidence && liveProfile.publicEvidence.length > 0 && (
        <div style={{ marginTop: '14px', marginBottom: '14px' }}>
          <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>
            Verified Photographic Evidence ({liveProfile.publicEvidence.length})
          </h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {liveProfile.publicEvidence.map((evi) => (
              <div
                key={evi.id}
                style={{
                  backgroundColor: 'var(--neutral-100)',
                  border: '1px solid var(--neutral-300)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                }}
              >
                <strong>📷 {evi.caption || 'Verified Kitchen Evidence'}</strong>
                <div style={{ color: 'var(--neutral-600)', fontSize: '10px' }}>
                  SHA-256: <code>{evi.sha256Hash.slice(0, 12)}...</code>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '12px',
        }}
      >
        <button
          type="button"
          onClick={() => setShowQrPreview((prev) => !prev)}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            padding: '6px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {showQrPreview ? 'Hide Physical Trust QR' : '📱 Show Physical Trust QR Badge'}
        </button>

        {liveProfile?.verificationUrl && (
          <a
            href={liveProfile.verificationUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: '12px', color: 'var(--trust-green)' }}
          >
            Canonical Certificate Link ↗
          </a>
        )}
      </div>

      {showQrPreview && (
        <div
          style={{
            marginTop: '12px',
            padding: '12px',
            backgroundColor: '#0F172A',
            borderRadius: '8px',
            textAlign: 'center',
            color: '#FFFFFF',
          }}
        >
          <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>
            Bhojora Canonical QR Certificate Badge
          </div>
          <p style={{ fontSize: '11px', color: '#94A3B8', margin: '0 0 10px 0' }}>
            Diners scan this physical badge on-site to inspect the verified audit ledger.
          </p>
          <div
            style={{
              display: 'inline-block',
              backgroundColor: '#FFFFFF',
              padding: '8px',
              borderRadius: '8px',
            }}
          >
            <span style={{ fontSize: '11px', color: '#0F172A', fontWeight: 800 }}>
              [BHOJORA VERIFIED QR: {liveProfile?.qrCode || 'qr_preview'}]
            </span>
          </div>
        </div>
      )}

      <div className="disclaimer-box" style={{ marginTop: '14px' }}>
        <strong>⚠️ Statutory Transparency Notice:</strong>
        <br />
        This independent platform assessment reflects on-site physical observations recorded under
        Bhojora Verification Protocol v2.1. It is NOT a statutory government certification issued by
        FSSAI and does not guarantee that every meal is 100% risk-free.
      </div>
    </dialog>
  );
}
