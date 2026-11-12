import { useEffect, useRef } from 'react';
import { TRUST_CATEGORY_LABELS } from '../data/kitchens';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';
import type { KitchenOutlet } from '../types/domain';

interface TrustProfileDialogProps {
  kitchen: KitchenOutlet | null;
  onClose: () => void;
}

export function TrustProfileDialog({ kitchen, onClose }: TrustProfileDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
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
            {kitchen?.fullName ?? 'Arsalan (Park Circus)'}
          </h2>
          <p id="modalFssai" style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
            FSSAI Lic. No: {kitchen?.fssai ?? '12821008000491'}
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
              color: kitchen?.isVerified === false ? 'var(--neutral-800)' : 'var(--trust-green)',
              textTransform: 'uppercase',
            }}
          >
            Independent Audit Result
          </div>
          <div
            style={{
              fontSize: '16px',
              fontWeight: 700,
              color:
                kitchen?.isVerified === false
                  ? 'var(--terracotta-dark)'
                  : 'var(--trust-green-text)',
            }}
          >
            {kitchen?.isVerified === false
              ? 'NOT YET INSPECTED BY BHOJORA'
              : 'VERIFIED CLEAN KITCHEN'}
          </div>
          <div
            id="modalAuditDate"
            style={{ fontSize: '12px', color: 'var(--neutral-600)', marginTop: '2px' }}
          >
            {kitchen?.isVerified === false
              ? kitchen.statusExplanation
              : `Inspected on: ${kitchen?.auditDate ?? '14 Oct 2026'}`}
          </div>
        </div>
        <div className="score-number">
          {kitchen?.isVerified === false || kitchen?.score === null ? (
            <span id="modalScoreVal" style={{ fontSize: '16px' }}>
              Pending Audit
            </span>
          ) : (
            <>
              <span id="modalScoreVal">{kitchen?.score ?? 94}</span>
              <span style={{ fontSize: '16px', color: 'var(--neutral-600)' }}>/100</span>
            </>
          )}
        </div>
      </div>

      {kitchen?.categoryPercentages ? (
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

      <div className="disclaimer-box">
        <strong>⚠️ Statutory Transparency Notice:</strong>
        <br />
        This independent platform assessment reflects on-site physical observations recorded under
        Bhojora Verification Protocol v2.1. It is NOT a statutory government certification issued by
        FSSAI and does not guarantee that every meal is 100% risk-free.
      </div>
    </dialog>
  );
}
