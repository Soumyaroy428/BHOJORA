import { useEffect, useRef } from 'react';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';

interface PilotInfoDialogProps {
  open: boolean;
  onClose: () => void;
}

export function PilotInfoDialog({ open, onClose }: PilotInfoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  useDialogLightDismiss(dialogRef);

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

  return (
    <dialog
      ref={dialogRef}
      id="infoModal"
      className="trust-dialog"
      closedby="any"
      aria-labelledby="infoModalTitle"
      onClose={onClose}
    >
      <div className="modal-header">
        <div>
          <h2 id="infoModalTitle" style={{ fontSize: '18px' }}>
            BHOJORA Kolkata Pilot
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
            Web &amp; Expo Mobile Ecosystem (React)
          </p>
        </div>
        <form method="dialog">
          <button type="submit" className="modal-close" aria-label="Close information dialog">
            &times;
          </button>
        </form>
      </div>
      <p style={{ fontSize: '14px', lineHeight: 1.6, marginBottom: '16px' }}>
        Bhojora serves active pilot corridors across <strong>Salt Lake (Sector V)</strong>,{' '}
        <strong>New Town</strong>, <strong>Park Street / Central</strong>,{' '}
        <strong>Ballygunge / South</strong>, and <strong>Shyambazar / North</strong>.
      </p>
      <p style={{ fontSize: '13px', color: 'var(--neutral-600)', lineHeight: 1.55 }}>
        React web portals and Expo mobile clients share the API contract (
        <code style={{ fontSize: '12px' }}>/api/v1</code>) with INR integer paise precision and
        independent safety audits.
      </p>
    </dialog>
  );
}
