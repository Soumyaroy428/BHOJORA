import { useEffect, useRef, useState } from 'react';
import { KOLKATA_ZONE_OPTIONS } from '../data/kitchens';
import { useDialogLightDismiss } from '../hooks/useDialogLightDismiss';
import { resolveNearestKolkataZone } from '../lib/apiClient';
import type { KolkataZoneId, LocationPermissionState } from '../types/domain';

interface PilotInfoDialogProps {
  open: boolean;
  selectedZone: KolkataZoneId;
  permissionState: LocationPermissionState;
  onSelectZone: (zone: KolkataZoneId) => void;
  onDetectGpsZone: (
    zone: Exclude<KolkataZoneId, 'all'>,
    permissionState: LocationPermissionState,
    localityLabel: string,
  ) => void;
  onClose: () => void;
}

export function PilotInfoDialog({
  open,
  selectedZone,
  permissionState,
  onSelectZone,
  onDetectGpsZone,
  onClose,
}: PilotInfoDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
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

  const handleUseCurrentLocation = async (): Promise<void> => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatusNote(
        'Browser geolocation is unavailable here. Choose your Kolkata neighborhood below.',
      );
      onDetectGpsZone(selectedZone === 'all' ? 'salt-lake' : selectedZone, 'manual', 'Manual');
      return;
    }

    setDetecting(true);
    setStatusNote('Requesting one-time Kolkata location check...');

    try {
      if ('permissions' in navigator && typeof navigator.permissions.query === 'function') {
        const perm = await navigator.permissions.query({ name: 'geolocation' });
        if (perm.state === 'denied') {
          setDetecting(false);
          setStatusNote(
            'Location permission is currently blocked in your browser site settings. Re-enable Location for this site or select a Kolkata zone below.',
          );
          onDetectGpsZone(selectedZone === 'all' ? 'salt-lake' : selectedZone, 'denied', 'Blocked');
          return;
        }
      }
    } catch {
      // Proceed directly to getCurrentPosition if Permissions API query is unsupported
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const resolved = resolveNearestKolkataZone(
          position.coords.latitude,
          position.coords.longitude,
        );
        setDetecting(false);
        setStatusNote(`Matched to nearest service corridor: ${resolved.label}.`);
        onDetectGpsZone(resolved.zoneId, 'granted', resolved.label);
      },
      (error) => {
        setDetecting(false);
        const denied = error.code === error.PERMISSION_DENIED;
        setStatusNote(
          denied
            ? 'Permission denied (ST-06): enable Location access in browser site settings or pick a Kolkata corridor below.'
            : 'Unable to lock GPS coordinates right now. Choose your Kolkata corridor below.',
        );
        onDetectGpsZone(
          selectedZone === 'all' ? 'salt-lake' : selectedZone,
          denied ? 'denied' : 'manual',
          denied ? 'Permission denied' : 'Manual fallback',
        );
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
    );
  };

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
            Kolkata Delivery Zone &amp; Location UX
          </h2>
          <p style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
            Privacy-first neighborhood matching • Manual &amp; GPS supported
          </p>
        </div>
        <form method="dialog">
          <button type="submit" className="modal-close" aria-label="Close location dialog">
            &times;
          </button>
        </form>
      </div>

      <div className="privacy-callout" style={{ marginBottom: '14px' }}>
        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '4px' }}>
          Why BHOJORA asks for your location
        </div>
        <p style={{ fontSize: '13px', color: 'var(--neutral-800)', lineHeight: 1.55 }}>
          Your browser coordinates are used once to match you to the closest serviceable Kolkata
          corridor (Salt Lake, Park Street, New Town, Ballygunge, or Shyambazar). Background GPS
          tracking is never enabled during browsing.
        </p>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginTop: '10px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            id="detectGpsLocationBtn"
            className="btn btn-primary"
            style={{ minHeight: '42px', padding: '8px 14px' }}
            onClick={() => void handleUseCurrentLocation()}
            disabled={detecting}
          >
            {detecting ? 'Checking location...' : 'Use Current GPS Location'}
          </button>
          <span style={{ fontSize: '12px', color: 'var(--neutral-600)' }}>
            Permission status: <strong>{permissionState}</strong>
          </span>
        </div>
        {statusNote ? (
          <p
            id="locationPermissionStatus"
            role="status"
            style={{
              fontSize: '12px',
              marginTop: '8px',
              color: permissionState === 'denied' ? '#5F2120' : 'var(--trust-green-text)',
              fontWeight: 600,
            }}
          >
            {statusNote}
          </p>
        ) : null}
      </div>

      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px' }}>
          Or select a Kolkata corridor manually
        </div>
        <div className="landmark-chips" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
          {KOLKATA_ZONE_OPTIONS.map((zone) => {
            const active = selectedZone === zone.id;
            return (
              <button
                key={zone.id}
                type="button"
                className={active ? 'chip active' : 'chip'}
                aria-pressed={active}
                onClick={() => {
                  onSelectZone(zone.id);
                  onClose();
                }}
              >
                {zone.label}
              </button>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--neutral-600)', lineHeight: 1.55 }}>
        React customer, restaurant &amp; admin applications connect over{' '}
        <code style={{ fontSize: '12px' }}>/api/v1</code> with INR integer paise precision and
        independent kitchen safety audits.
      </p>
    </dialog>
  );
}
