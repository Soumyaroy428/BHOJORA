import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  KOLKATA_ZONE_IDS,
  type ApiResponse,
  type DeliveryZoneDto,
  type KolkataZoneId,
} from '@bhojora/shared';

export interface ZoneGovernancePanelProps {
  apiBase: string;
  accessToken: string | null;
  mfaVerified: boolean;
  onStatusUpdate?: (message: string) => void;
}

const DEFAULT_RING_JSON =
  '[[88.425,22.565],[88.45,22.565],[88.45,22.585],[88.425,22.585],[88.425,22.565]]';

export function ZoneGovernancePanel({
  apiBase,
  accessToken,
  mfaVerified,
  onStatusUpdate,
}: ZoneGovernancePanelProps) {
  const [zones, setZones] = useState<DeliveryZoneDto[]>([]);
  const [zoneCode, setZoneCode] = useState('SALT_LAKE_SEC_V');
  const [zoneId, setZoneId] = useState<KolkataZoneId>('salt-lake');
  const [name, setName] = useState('Salt Lake Sector V & Bidhannagar');
  const [ringJson, setRingJson] = useState(DEFAULT_RING_JSON);
  const [centerLng, setCenterLng] = useState('88.4317');
  const [centerLat, setCenterLat] = useState('22.5806');
  const [feePaise, setFeePaise] = useState('2500');
  const [minOrderPaise, setMinOrderPaise] = useState('14900');
  const [estimatedMinutes, setEstimatedMinutes] = useState('24');
  const [ringTouched, setRingTouched] = useState(false);
  const [ringError, setRingError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(
    'MFA-verified Ops Admins manage GeoJSON Polygon boundaries and INR paise fee policies for Kolkata zones.',
  );
  const ringInputRef = useRef<HTMLTextAreaElement | null>(null);

  function report(message: string) {
    setStatusMessage(message);
    onStatusUpdate?.(message);
  }

  function validateRingText(
    text: string,
  ): { ring: Array<[number, number]>; error: null } | { ring: null; error: string } {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed) || parsed.length < 4) {
        return {
          ring: null,
          error:
            'Error: Exterior ring must be a closed GeoJSON Polygon array with at least 4 [longitude, latitude] vertices.',
        };
      }
      const pts: Array<[number, number]> = [];
      for (const item of parsed) {
        if (!Array.isArray(item) || item.length !== 2) {
          return { ring: null, error: 'Error: Each vertex must be [longitude, latitude].' };
        }
        const [lng, lat] = [Number(item[0]), Number(item[1])];
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
          return { ring: null, error: 'Error: Polygon vertices must contain finite numbers.' };
        }
        if (lng >= 18 && lng <= 27 && lat >= 85 && lat <= 91) {
          return {
            ring: null,
            error: 'Error: Ring vertices appear swapped ([lat, lng]). Use [longitude, latitude].',
          };
        }
        pts.push([lng, lat]);
      }
      const first = pts[0]!;
      const last = pts[pts.length - 1]!;
      if (first[0] !== last[0] || first[1] !== last[1]) {
        return {
          ring: null,
          error:
            'Error: Polygon ring is unclosed — first and last [longitude, latitude] coordinates must match.',
        };
      }
      return { ring: pts, error: null };
    } catch {
      return {
        ring: null,
        error: 'Error: Enter valid JSON array of [longitude, latitude] coordinates.',
      };
    }
  }

  async function loadZones() {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/v1/zones?includeInactive=true`);
      const payload = (await res.json()) as ApiResponse<{ zones: DeliveryZoneDto[] }>;
      if (res.ok && payload.success) {
        setZones(payload.data.zones);
      }
    } catch {
      // ignore initial offline load
    }
  }

  useEffect(() => {
    if (accessToken) {
      void loadZones();
    }
  }, [apiBase, accessToken]);

  async function handleToggleZone(zone: DeliveryZoneDto) {
    if (!apiBase || !accessToken || !mfaVerified) {
      report(
        'MFA-verified Ops Admin session required to activate or pause Kolkata delivery zones.',
      );
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/zones/${encodeURIComponent(zone.zoneCode)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ isActive: !zone.isActive }),
        },
      );
      const payload = (await res.json()) as ApiResponse<{ zone: DeliveryZoneDto }>;
      if (!res.ok || !payload.success) {
        report(
          payload.success
            ? 'Failed to update delivery zone status.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setZones((prev) =>
        prev.map((item) =>
          item.zoneCode === payload.data.zone.zoneCode ? payload.data.zone : item,
        ),
      );
      report(
        `Updated zone ${payload.data.zone.zoneCode}: isActive=${String(payload.data.zone.isActive)}.`,
      );
    } catch {
      report('Network error while updating delivery zone.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpsertZone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRingTouched(true);
    const check = validateRingText(ringJson);
    if (check.error || !check.ring) {
      setRingError(check.error);
      ringInputRef.current?.focus();
      report(check.error);
      return;
    }
    setRingError(null);

    if (!apiBase || !accessToken || !mfaVerified) {
      report('MFA-verified Ops Admin session required to save Kolkata Polygon boundaries.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/zones`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          zoneCode: zoneCode.trim().toUpperCase(),
          zoneId,
          name: name.trim(),
          boundary: { type: 'Polygon', coordinates: [check.ring] },
          centerPoint: { type: 'Point', coordinates: [Number(centerLng), Number(centerLat)] },
          deliveryFeePaise: Number(feePaise),
          minOrderPaise: Number(minOrderPaise),
          estimatedMinutes: Number(estimatedMinutes),
          isActive: true,
        }),
      });
      const payload = (await res.json()) as ApiResponse<{ zone: DeliveryZoneDto }>;
      if (!res.ok || !payload.success) {
        report(
          payload.success
            ? 'Failed to upsert Kolkata delivery zone.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      await loadZones();
      report(`Saved Kolkata Polygon zone ${payload.data.zone.zoneCode}.`);
    } catch {
      report('Network error while saving delivery zone.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="zone-governance-heading">
      <div className="topbar-inner" style={{ marginBottom: '0.75rem' }}>
        <div>
          <span className="badge">Checkpoint 11 · Geospatial Delivery Zones</span>
          <h2 id="zone-governance-heading" style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
            Kolkata Delivery Zone Polygons &amp; Serviceability Policies
          </h2>
          <p className="brand-sub">{statusMessage}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void loadZones()}>
          Refresh Zones
        </button>
      </div>

      {zones.length > 0 ? (
        <div className="table-scroll" style={{ marginBottom: '1rem' }}>
          <table className="queue-table">
            <caption>Active &amp; paused Kolkata GeoJSON Polygon corridors</caption>
            <thead>
              <tr>
                <th scope="col">Zone Code</th>
                <th scope="col">Corridor</th>
                <th scope="col">Polygon</th>
                <th scope="col">Fee / Min Order</th>
                <th scope="col">ETA</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.zoneCode}>
                  <th scope="row">{zone.zoneCode}</th>
                  <td>
                    {zone.name} ({zone.zoneId})
                  </td>
                  <td>{(zone.boundary.coordinates[0] ?? []).length} vertices</td>
                  <td>
                    ₹{(zone.deliveryFeePaise / 100).toFixed(0)} / ₹
                    {(zone.minOrderPaise / 100).toFixed(0)}
                  </td>
                  <td>{zone.estimatedMinutes} min</td>
                  <td>
                    <button
                      type="button"
                      className="btn-secondary"
                      disabled={busy || !mfaVerified}
                      onClick={() => void handleToggleZone(zone)}
                    >
                      {zone.isActive ? 'Pause Zone' : 'Activate Zone'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <form aria-labelledby="zone-upsert-form-heading" onSubmit={(e) => void handleUpsertZone(e)}>
        <h3 id="zone-upsert-form-heading">Upsert GeoJSON Polygon Service Zone</h3>
        <div className="detail-grid">
          <div className="field">
            <label htmlFor="adminZoneCode">Zone Code</label>
            <input
              id="adminZoneCode"
              type="text"
              required
              value={zoneCode}
              onChange={(e) => setZoneCode(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="adminZoneCorridor">Kolkata Corridor ID</label>
            <select
              id="adminZoneCorridor"
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value as KolkataZoneId)}
            >
              {KOLKATA_ZONE_IDS.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="adminZoneName">Zone Display Name</label>
            <input
              id="adminZoneName"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="adminFeePaise">Delivery Fee (INR Paise) / Min Order (Paise)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="adminFeePaise"
                type="text"
                inputMode="numeric"
                required
                value={feePaise}
                onChange={(e) => setFeePaise(e.target.value)}
                aria-label="Delivery fee in INR paise"
              />
              <input
                id="adminMinOrderPaise"
                type="text"
                inputMode="numeric"
                required
                value={minOrderPaise}
                onChange={(e) => setMinOrderPaise(e.target.value)}
                aria-label="Minimum order in INR paise"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="adminCenterLng">Center Pin [Longitude, Latitude] &amp; ETA (min)</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="adminCenterLng"
                type="text"
                inputMode="decimal"
                required
                value={centerLng}
                onChange={(e) => setCenterLng(e.target.value)}
                aria-label="Center longitude"
              />
              <input
                id="adminCenterLat"
                type="text"
                inputMode="decimal"
                required
                value={centerLat}
                onChange={(e) => setCenterLat(e.target.value)}
                aria-label="Center latitude"
              />
              <input
                id="adminZoneEta"
                type="text"
                inputMode="numeric"
                required
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                aria-label="Estimated delivery minutes"
              />
            </div>
          </div>
        </div>

        <div className="field" style={{ marginTop: '0.75rem' }}>
          <label htmlFor="adminPolygonRing">
            Exterior Polygon Ring (Closed CCW GeoJSON [[longitude, latitude], ...])
          </label>
          <span id="adminPolygonRing-hint" className="field-hint">
            RFC 7946 counter-clockwise order with identical first &amp; last [longitude, latitude]
            vertex.
          </span>
          <textarea
            ref={ringInputRef}
            id="adminPolygonRing"
            rows={3}
            required
            aria-invalid={ringTouched && ringError ? 'true' : 'false'}
            aria-describedby={
              ringTouched && ringError
                ? 'adminPolygonRing-hint adminPolygonRing-error'
                : 'adminPolygonRing-hint'
            }
            value={ringJson}
            onChange={(e) => {
              setRingJson(e.target.value);
              if (ringError) {
                const next = validateRingText(e.target.value);
                if (!next.error) setRingError(null);
              }
            }}
            onBlur={() => {
              setRingTouched(true);
              const res = validateRingText(ringJson);
              setRingError(res.error);
            }}
          />
          {ringTouched && ringError ? (
            <p id="adminPolygonRing-error" className="field-error">
              <span role="img" aria-label="Error">
                ❌
              </span>{' '}
              {ringError}
            </p>
          ) : null}
        </div>

        <button type="submit" className="btn-primary" disabled={busy || !mfaVerified}>
          Save Kolkata GeoJSON Zone Polygon
        </button>
      </form>
    </section>
  );
}
