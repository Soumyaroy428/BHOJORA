import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_OUTLET_DELIVERY_RADIUS_METERS,
  FSSAI_SEPARATION_NOTICE,
  KOLKATA_ZONE_IDS,
  MAX_OUTLET_DELIVERY_RADIUS_METERS,
  MIN_OUTLET_DELIVERY_RADIUS_METERS,
  OPERATING_DAY_CODES,
  type ApiResponse,
  type KolkataZoneId,
  type OperatingDayCode,
  type OperatingSlotDto,
  type OutletDetailDto,
  type OutletHoursDto,
  type OutletLiveStatusDto,
} from '@bhojora/shared';

export interface OutletZonesPanelProps {
  apiBase: string;
  accessToken: string | null;
  activeRole?: string;
  onStatusUpdate?: (message: string) => void;
}

const ZONE_PIN_PRESETS: Readonly<
  Record<KolkataZoneId, { label: string; coords: [number, number] }>
> = {
  'salt-lake': { label: 'Salt Lake Sec V', coords: [88.4317, 22.5806] },
  central: { label: 'Park Street', coords: [88.3526, 22.5535] },
  south: { label: 'Ballygunge', coords: [88.3665, 22.5262] },
  'new-town': { label: 'New Town AA-I', coords: [88.4655, 22.5922] },
  north: { label: 'Shyambazar', coords: [88.3735, 22.6012] },
};

const DEFAULT_SLOTS: OperatingSlotDto[] = OPERATING_DAY_CODES.map((dayOfWeek) => ({
  dayOfWeek,
  openTime: '11:00',
  closeTime: '23:00',
  isClosed: false,
}));

type PinField = 'pinLng' | 'pinLat' | 'radiusMeters';

function validatePinField(
  field: PinField,
  values: { pinLng: string; pinLat: string; radiusMeters: string },
): string | null {
  const num = Number(values[field]);
  if (field === 'pinLng') {
    if (!Number.isFinite(num)) return 'Error: Enter numeric GeoJSON longitude (e.g. 88.4317).';
    const lat = Number(values.pinLat);
    if (num >= 18 && num <= 27 && Number.isFinite(lat) && lat >= 85 && lat <= 91) {
      return 'Error: Coordinates look swapped ([lat, lng]). Enter longitude (~88.10–88.70) first.';
    }
    if (num < 88.1 || num > 88.7) {
      return 'Error: Longitude must stay inside Kolkata service bounds (88.10 to 88.70).';
    }
  }
  if (field === 'pinLat') {
    if (!Number.isFinite(num)) return 'Error: Enter numeric GeoJSON latitude (e.g. 22.5806).';
    const lng = Number(values.pinLng);
    if (Number.isFinite(lng) && lng >= 18 && lng <= 27 && num >= 85 && num <= 91) {
      return 'Error: Coordinates look swapped ([lat, lng]). Enter latitude (~22.30–22.85) second.';
    }
    if (num < 22.3 || num > 22.85) {
      return 'Error: Latitude must stay inside Kolkata service bounds (22.30 to 22.85).';
    }
  }
  if (field === 'radiusMeters') {
    if (
      !Number.isInteger(num) ||
      num < MIN_OUTLET_DELIVERY_RADIUS_METERS ||
      num > MAX_OUTLET_DELIVERY_RADIUS_METERS
    ) {
      return `Error: Delivery radius must be between ${MIN_OUTLET_DELIVERY_RADIUS_METERS} and ${MAX_OUTLET_DELIVERY_RADIUS_METERS} meters.`;
    }
  }
  return null;
}

export function OutletZonesPanel({
  apiBase,
  accessToken,
  activeRole = 'RESTAURANT_OWNER',
  onStatusUpdate,
}: OutletZonesPanelProps) {
  const [outlets, setOutlets] = useState<OutletDetailDto[]>([]);
  const [selectedOutletId, setSelectedOutletId] = useState<string>('');
  const [zoneId, setZoneId] = useState<KolkataZoneId>('salt-lake');
  const [pinLng, setPinLng] = useState('88.4317');
  const [pinLat, setPinLat] = useState('22.5806');
  const [radiusMeters, setRadiusMeters] = useState(String(DEFAULT_OUTLET_DELIVERY_RADIUS_METERS));
  const [outletStatus, setOutletStatus] = useState<'ACTIVE' | 'TEMPORARILY_CLOSED'>('ACTIVE');
  const [slots, setSlots] = useState<OperatingSlotDto[]>(DEFAULT_SLOTS);
  const [closureDate, setClosureDate] = useState('');
  const [closureReason, setClosureReason] = useState('');
  const [touched, setTouched] = useState<Partial<Record<PinField, boolean>>>({});
  const [pinErrors, setPinErrors] = useState<Partial<Record<PinField, string>>>({});
  const [hoursError, setHoursError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showBranchCreate, setShowBranchCreate] = useState(false);
  const [restaurantId, setRestaurantId] = useState('');
  const [branchName, setBranchName] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchLandmark, setBranchLandmark] = useState('');
  const [branchLocality, setBranchLocality] = useState('');
  const [branchWard, setBranchWard] = useState('');
  const [branchPostal, setBranchPostal] = useState('700091');
  const [branchCuisines, setBranchCuisines] = useState('Bengali, Mughlai');

  const [panelStatus, setPanelStatus] = useState(
    'Configure GeoJSON [longitude, latitude] map pins and Asia/Kolkata operating slots for assigned outlets.',
  );

  const pinLngRef = useRef<HTMLInputElement | null>(null);
  const pinLatRef = useRef<HTMLInputElement | null>(null);
  const radiusRef = useRef<HTMLInputElement | null>(null);

  const selectedOutlet =
    outlets.find((item) => item.outletId === selectedOutletId) ?? outlets[0] ?? null;

  function report(message: string) {
    setPanelStatus(message);
    onStatusUpdate?.(message);
  }

  function hydrateOutletFields(outlet: OutletDetailDto) {
    setSelectedOutletId(outlet.outletId);
    setZoneId(outlet.zoneId);
    setPinLng(String(outlet.location.coordinates[0]));
    setPinLat(String(outlet.location.coordinates[1]));
    setRadiusMeters(String(outlet.deliveryRadiusMeters));
    setOutletStatus(outlet.status === 'TEMPORARILY_CLOSED' ? 'TEMPORARILY_CLOSED' : 'ACTIVE');
    setSlots(outlet.operatingSlots.map((slot) => ({ ...slot })));
    setRestaurantId(outlet.restaurantId);
  }

  async function loadPartnerOutlets(token: string) {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/v1/restaurant/outlets`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Bhojora-Active-Role': activeRole,
        },
      });
      const payload = (await res.json()) as ApiResponse<{ outlets: OutletDetailDto[] }>;
      if (!res.ok || !payload.success) {
        report(
          payload.success
            ? 'Unable to load partner outlets.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setOutlets(payload.data.outlets);
      const first = payload.data.outlets[0];
      if (first) {
        hydrateOutletFields(first);
      }
      report(`Loaded ${payload.data.outlets.length} tenant-scoped outlet(s) with IST status.`);
    } catch {
      report('Network error while loading partner outlet locations.');
    }
  }

  useEffect(() => {
    if (accessToken && apiBase) {
      void loadPartnerOutlets(accessToken);
    }
  }, [accessToken, apiBase, activeRole]);

  function handleBlurPinField(field: PinField) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validatePinField(field, { pinLng, pinLat, radiusMeters });
    setPinErrors((prev) => ({ ...prev, [field]: err ?? undefined }));
  }

  function clearFieldError(field: PinField) {
    if (pinErrors[field]) {
      const nextErr = validatePinField(field, { pinLng, pinLat, radiusMeters });
      if (!nextErr) {
        setPinErrors((prev) => ({ ...prev, [field]: undefined }));
      }
    }
  }

  async function handleSaveMapPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = { pinLng, pinLat, radiusMeters };
    const fields: PinField[] = ['pinLng', 'pinLat', 'radiusMeters'];
    const nextErrors: Partial<Record<PinField, string>> = {};
    let firstInvalid: PinField | null = null;

    for (const field of fields) {
      const err = validatePinField(field, values);
      if (err) {
        nextErrors[field] = err;
        if (!firstInvalid) firstInvalid = field;
      }
    }

    setTouched({ pinLng: true, pinLat: true, radiusMeters: true });
    setPinErrors(nextErrors);

    if (firstInvalid) {
      if (firstInvalid === 'pinLng') pinLngRef.current?.focus();
      if (firstInvalid === 'pinLat') pinLatRef.current?.focus();
      if (firstInvalid === 'radiusMeters') radiusRef.current?.focus();
      report(nextErrors[firstInvalid] ?? 'Fix invalid GeoJSON pin values.');
      return;
    }

    if (!apiBase || !accessToken || !selectedOutlet) {
      report(
        'Sign in as an approved partner against a live API to persist outlet map pin & radius updates.',
      );
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/restaurant/outlets/${encodeURIComponent(selectedOutlet.outletId)}`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'X-Bhojora-Active-Role': activeRole,
          },
          body: JSON.stringify({
            zoneId,
            coordinates: [Number(pinLng), Number(pinLat)],
            deliveryRadiusMeters: Number(radiusMeters),
            status: outletStatus,
          }),
        },
      );
      const payload = (await res.json()) as ApiResponse<{ outlet: OutletDetailDto }>;
      if (!res.ok || !payload.success) {
        report(
          payload.success
            ? 'Failed to update outlet map pin.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setOutlets((prev) =>
        prev.map((o) => (o.outletId === payload.data.outlet.outletId ? payload.data.outlet : o)),
      );
      hydrateOutletFields(payload.data.outlet);
      report(
        `Saved GeoJSON pin [${payload.data.outlet.location.coordinates.join(', ')}] and ${payload.data.outlet.deliveryRadiusMeters}m radius.`,
      );
    } catch {
      report('Network error while saving outlet map pin.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    for (const slot of slots) {
      if (!slot.isClosed && slot.openTime >= slot.closeTime) {
        const msg = `Error: ${slot.dayOfWeek} closing time (${slot.closeTime}) must be after opening time (${slot.openTime}).`;
        setHoursError(msg);
        report(msg);
        return;
      }
    }
    setHoursError(null);

    if (!apiBase || !accessToken || !selectedOutlet) {
      report('Sign in with outlet membership on a live API to save weekly IST hours.');
      return;
    }

    setBusy(true);
    try {
      const specialClosures =
        closureDate.trim() && closureReason.trim()
          ? [{ date: closureDate.trim(), reason: closureReason.trim(), isClosed: true }]
          : undefined;
      const res = await fetch(
        `${apiBase}/api/v1/restaurant/outlets/${encodeURIComponent(selectedOutlet.outletId)}/hours`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'X-Bhojora-Active-Role': activeRole,
          },
          body: JSON.stringify({
            slots,
            ...(specialClosures ? { specialClosures } : {}),
          }),
        },
      );
      const payload = (await res.json()) as ApiResponse<{
        hours: OutletHoursDto;
        liveStatus: OutletLiveStatusDto;
      }>;
      if (!res.ok || !payload.success) {
        report(
          payload.success
            ? 'Failed to update operating hours.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setOutlets((prev) =>
        prev.map((item) =>
          item.outletId === payload.data.hours.outletId
            ? {
                ...item,
                operatingSlots: payload.data.hours.slots,
                liveStatus: payload.data.liveStatus,
              }
            : item,
        ),
      );
      report(
        `Saved Asia/Kolkata operating hours — current server status: ${payload.data.liveStatus.reason} (${payload.data.liveStatus.evaluatedAtIst}).`,
      );
    } catch {
      report('Network error while saving operating hours.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiBase || !accessToken) {
      report('Sign in with owner credentials against a live API to add a branch outlet.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/restaurant/outlets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'X-Bhojora-Active-Role': activeRole,
        },
        body: JSON.stringify({
          restaurantId: restaurantId.trim(),
          outletName: branchName.trim(),
          streetAddress: branchAddress.trim(),
          landmark: branchLandmark.trim(),
          locality: branchLocality.trim(),
          wardOrBorough: branchWard.trim(),
          postalCode: branchPostal.trim(),
          zoneId,
          coordinates: [Number(pinLng), Number(pinLat)],
          deliveryRadiusMeters: Number(radiusMeters),
          cuisines: branchCuisines
            .split(',')
            .map((c) => c.trim())
            .filter(Boolean),
          operatingSlots: slots,
        }),
      });
      const payload = (await res.json()) as ApiResponse<{ outlet: OutletDetailDto }>;
      if (!res.ok || !payload.success) {
        report(
          payload.success
            ? 'Branch creation failed.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setOutlets((prev) => [payload.data.outlet, ...prev]);
      hydrateOutletFields(payload.data.outlet);
      setShowBranchCreate(false);
      report(
        `Created branch outlet ${payload.data.outlet.outletName} (NOT_INSPECTED until audit).`,
      );
    } catch {
      report('Network error while creating branch outlet.');
    } finally {
      setBusy(false);
    }
  }

  const updateSlot = (dayOfWeek: OperatingDayCode, patch: Partial<OperatingSlotDto>) => {
    setHoursError(null);
    setSlots((prev) => prev.map((s) => (s.dayOfWeek === dayOfWeek ? { ...s, ...patch } : s)));
  };

  return (
    <section className="panel" aria-labelledby="outlet-ops-heading">
      <div className="topbar-inner" style={{ marginBottom: '0.75rem' }}>
        <div>
          <span className="badge">Checkpoint 11 · GeoJSON [lng, lat] &amp; Asia/Kolkata Hours</span>
          <h2 id="outlet-ops-heading" style={{ marginTop: '0.5rem', marginBottom: '0.25rem' }}>
            Outlet Map Pin, Delivery Radius &amp; Operating Hours
          </h2>
          <p className="brand-sub">{panelStatus}</p>
        </div>
        <button
          type="button"
          className="btn-ghost"
          aria-expanded={showBranchCreate}
          aria-controls="branch-outlet-create-form"
          onClick={() => setShowBranchCreate((prev) => !prev)}
        >
          {showBranchCreate ? 'Close New Branch Form' : 'Add Kolkata Branch'}
        </button>
      </div>

      <div className="notice-banner" role="note">
        <strong>FSSAI &amp; Field Inspection Rule:</strong> {FSSAI_SEPARATION_NOTICE}
      </div>

      {outlets.length > 0 ? (
        <div className="outlet-tabs" role="group" aria-label="Tenant-owned outlets">
          {outlets.map((outlet) => (
            <button
              key={outlet.outletId}
              type="button"
              className="tab-btn"
              aria-pressed={outlet.outletId === selectedOutlet?.outletId}
              onClick={() => hydrateOutletFields(outlet)}
            >
              {outlet.outletName} (
              {outlet.liveStatus.isOpenNow ? 'Open IST' : outlet.liveStatus.reason})
            </button>
          ))}
        </div>
      ) : null}

      {selectedOutlet ? (
        <div className="metrics-row" style={{ marginBottom: '1rem' }}>
          <div>
            <p className="metric-label">Server Live Status (IST)</p>
            <p className="metric-val" style={{ fontSize: '1.1rem' }}>
              {selectedOutlet.liveStatus.isOpenNow ? 'OPEN NOW' : selectedOutlet.liveStatus.reason}
            </p>
            <p className="field-hint">{selectedOutlet.liveStatus.evaluatedAtIst}</p>
          </div>
          <div>
            <p className="metric-label">GeoJSON Pin &amp; Radius</p>
            <p className="metric-val" style={{ fontSize: '1.1rem' }}>
              [{selectedOutlet.location.coordinates.join(', ')}]
            </p>
            <p className="field-hint">{selectedOutlet.deliveryRadiusMeters} m service radius</p>
          </div>
          <div>
            <p className="metric-label">Inspection State</p>
            <p className="metric-val" style={{ fontSize: '1.1rem' }}>
              {selectedOutlet.platformInspectionStatus}
            </p>
            <p className="field-hint">
              Next open: {selectedOutlet.liveStatus.nextOpenWindow ?? 'Open / Schedule active'}
            </p>
          </div>
        </div>
      ) : null}

      <div className="form-grid-2">
        <form
          aria-labelledby="outlet-pin-form-heading"
          noValidate
          onSubmit={(e) => void handleSaveMapPin(e)}
        >
          <fieldset className="fieldset-group">
            <legend id="outlet-pin-form-heading">Map Pin (GeoJSON [lng, lat]) &amp; Radius</legend>

            <div
              className="action-row"
              role="group"
              aria-label="Kolkata corridor pin presets"
              style={{ marginBottom: '0.85rem' }}
            >
              {(
                Object.entries(ZONE_PIN_PRESETS) as Array<
                  [KolkataZoneId, { label: string; coords: [number, number] }]
                >
              ).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setZoneId(key);
                    setPinLng(String(preset.coords[0]));
                    setPinLat(String(preset.coords[1]));
                    setPinErrors({});
                  }}
                >
                  Pin {preset.label}
                </button>
              ))}
            </div>

            <div className="form-grid-2">
              <div className="field">
                <label htmlFor="outletPinLng">Longitude (first in GeoJSON)</label>
                <span id="outletPinLng-hint" className="field-hint">
                  Kolkata East longitude ~88.10–88.70 (e.g. 88.4317)
                </span>
                <input
                  ref={pinLngRef}
                  id="outletPinLng"
                  name="pinLng"
                  type="text"
                  inputMode="decimal"
                  required
                  aria-invalid={touched.pinLng && pinErrors.pinLng ? 'true' : 'false'}
                  aria-describedby={
                    touched.pinLng && pinErrors.pinLng
                      ? 'outletPinLng-hint outletPinLng-error'
                      : 'outletPinLng-hint'
                  }
                  value={pinLng}
                  onChange={(e) => {
                    setPinLng(e.target.value);
                    clearFieldError('pinLng');
                  }}
                  onBlur={() => handleBlurPinField('pinLng')}
                />
                {touched.pinLng && pinErrors.pinLng ? (
                  <p id="outletPinLng-error" className="field-error">
                    <span role="img" aria-label="Error">
                      ❌
                    </span>{' '}
                    {pinErrors.pinLng}
                  </p>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="outletPinLat">Latitude (second in GeoJSON)</label>
                <span id="outletPinLat-hint" className="field-hint">
                  Kolkata North latitude ~22.30–22.85 (e.g. 22.5806)
                </span>
                <input
                  ref={pinLatRef}
                  id="outletPinLat"
                  name="pinLat"
                  type="text"
                  inputMode="decimal"
                  required
                  aria-invalid={touched.pinLat && pinErrors.pinLat ? 'true' : 'false'}
                  aria-describedby={
                    touched.pinLat && pinErrors.pinLat
                      ? 'outletPinLat-hint outletPinLat-error'
                      : 'outletPinLat-hint'
                  }
                  value={pinLat}
                  onChange={(e) => {
                    setPinLat(e.target.value);
                    clearFieldError('pinLat');
                  }}
                  onBlur={() => handleBlurPinField('pinLat')}
                />
                {touched.pinLat && pinErrors.pinLat ? (
                  <p id="outletPinLat-error" className="field-error">
                    <span role="img" aria-label="Error">
                      ❌
                    </span>{' '}
                    {pinErrors.pinLat}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="form-grid-2">
              <div className="field">
                <label htmlFor="outletRadiusMeters">Delivery Radius (meters)</label>
                <span id="outletRadius-hint" className="field-hint">
                  500m to 15000m from map pin
                </span>
                <input
                  ref={radiusRef}
                  id="outletRadiusMeters"
                  name="deliveryRadiusMeters"
                  type="text"
                  inputMode="numeric"
                  required
                  aria-invalid={touched.radiusMeters && pinErrors.radiusMeters ? 'true' : 'false'}
                  aria-describedby={
                    touched.radiusMeters && pinErrors.radiusMeters
                      ? 'outletRadius-hint outletRadius-error'
                      : 'outletRadius-hint'
                  }
                  value={radiusMeters}
                  onChange={(e) => {
                    setRadiusMeters(e.target.value);
                    clearFieldError('radiusMeters');
                  }}
                  onBlur={() => handleBlurPinField('radiusMeters')}
                />
                {touched.radiusMeters && pinErrors.radiusMeters ? (
                  <p id="outletRadius-error" className="field-error">
                    <span role="img" aria-label="Error">
                      ❌
                    </span>{' '}
                    {pinErrors.radiusMeters}
                  </p>
                ) : null}
              </div>

              <div className="field">
                <label htmlFor="outletZoneSelect">Kolkata Service Corridor</label>
                <select
                  id="outletZoneSelect"
                  name="zoneId"
                  value={zoneId}
                  onChange={(e) => setZoneId(e.target.value as KolkataZoneId)}
                >
                  {KOLKATA_ZONE_IDS.map((id) => (
                    <option key={id} value={id}>
                      {ZONE_PIN_PRESETS[id].label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="outletOperationalStatus">Kitchen Service Status</label>
              <select
                id="outletOperationalStatus"
                name="status"
                value={outletStatus}
                onChange={(e) => setOutletStatus(e.target.value as 'ACTIVE' | 'TEMPORARILY_CLOSED')}
              >
                <option value="ACTIVE">ACTIVE (Accepting Orders During Hours)</option>
                <option value="TEMPORARILY_CLOSED">TEMPORARILY_CLOSED (Paused by Outlet)</option>
              </select>
            </div>

            <button type="submit" className="btn-primary" disabled={busy}>
              Save Outlet Map Pin &amp; Radius
            </button>
          </fieldset>
        </form>

        <form aria-labelledby="outlet-hours-form-heading" onSubmit={(e) => void handleSaveHours(e)}>
          <fieldset className="fieldset-group">
            <legend id="outlet-hours-form-heading">
              Weekly Operating Hours (Asia/Kolkata IST)
            </legend>
            <div className="table-scroll">
              <table className="data-table">
                <caption>Weekly 24h IST kitchen opening &amp; closing schedule</caption>
                <thead>
                  <tr>
                    <th scope="col">Day</th>
                    <th scope="col">Open</th>
                    <th scope="col">Close</th>
                    <th scope="col">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={slot.dayOfWeek}>
                      <th scope="row">{slot.dayOfWeek}</th>
                      <td>
                        <label htmlFor={`open-${slot.dayOfWeek}`} className="visually-hidden">
                          {slot.dayOfWeek} opening time
                        </label>
                        <input
                          id={`open-${slot.dayOfWeek}`}
                          type="time"
                          disabled={slot.isClosed}
                          value={slot.openTime}
                          onChange={(e) => updateSlot(slot.dayOfWeek, { openTime: e.target.value })}
                        />
                      </td>
                      <td>
                        <label htmlFor={`close-${slot.dayOfWeek}`} className="visually-hidden">
                          {slot.dayOfWeek} closing time
                        </label>
                        <input
                          id={`close-${slot.dayOfWeek}`}
                          type="time"
                          disabled={slot.isClosed}
                          value={slot.closeTime}
                          onChange={(e) =>
                            updateSlot(slot.dayOfWeek, { closeTime: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <label htmlFor={`closed-${slot.dayOfWeek}`} className="table-check-label">
                          <input
                            id={`closed-${slot.dayOfWeek}`}
                            type="checkbox"
                            checked={slot.isClosed}
                            onChange={(e) =>
                              updateSlot(slot.dayOfWeek, { isClosed: e.target.checked })
                            }
                          />
                          <span className="visually-hidden">Mark {slot.dayOfWeek} closed</span>
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="form-grid-2" style={{ marginTop: '0.75rem' }}>
              <div className="field">
                <label htmlFor="specialClosureDate">
                  Holiday / Special Closure Date (Optional)
                </label>
                <input
                  id="specialClosureDate"
                  type="date"
                  value={closureDate}
                  onChange={(e) => setClosureDate(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="specialClosureReason">Closure Note</label>
                <input
                  id="specialClosureReason"
                  type="text"
                  placeholder="Durga Puja / Kitchen Deep Clean"
                  value={closureReason}
                  onChange={(e) => setClosureReason(e.target.value)}
                />
              </div>
            </div>

            {hoursError ? (
              <p className="field-error" role="alert" style={{ marginBottom: '0.65rem' }}>
                {hoursError}
              </p>
            ) : null}

            <button type="submit" className="btn-primary" disabled={busy}>
              Save Weekly Operating Hours (IST)
            </button>
          </fieldset>
        </form>
      </div>

      {showBranchCreate ? (
        <form
          id="branch-outlet-create-form"
          aria-labelledby="create-branch-heading"
          style={{ marginTop: '1rem' }}
          onSubmit={(e) => void handleCreateBranch(e)}
        >
          <fieldset className="fieldset-group">
            <legend id="create-branch-heading">Create Additional Branch Outlet</legend>
            <div className="form-grid-2">
              <div className="field">
                <label htmlFor="branchRestaurantId">Approved Restaurant ID</label>
                <input
                  id="branchRestaurantId"
                  type="text"
                  required
                  value={restaurantId}
                  onChange={(e) => setRestaurantId(e.target.value)}
                  placeholder="rest_..."
                />
              </div>
              <div className="field">
                <label htmlFor="branchOutletName">Branch Outlet Name</label>
                <input
                  id="branchOutletName"
                  type="text"
                  required
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="Park Street Express"
                />
              </div>
              <div className="field">
                <label htmlFor="branchStreetAddress">Street Address</label>
                <input
                  id="branchStreetAddress"
                  type="text"
                  required
                  value={branchAddress}
                  onChange={(e) => setBranchAddress(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="branchLandmark">Landmark</label>
                <input
                  id="branchLandmark"
                  type="text"
                  required
                  value={branchLandmark}
                  onChange={(e) => setBranchLandmark(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="branchLocality">Locality</label>
                <input
                  id="branchLocality"
                  type="text"
                  required
                  value={branchLocality}
                  onChange={(e) => setBranchLocality(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="branchWard">KMC Ward / Borough</label>
                <input
                  id="branchWard"
                  type="text"
                  required
                  value={branchWard}
                  onChange={(e) => setBranchWard(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="branchPostal">PIN Code</label>
                <input
                  id="branchPostal"
                  type="text"
                  inputMode="numeric"
                  required
                  value={branchPostal}
                  onChange={(e) => setBranchPostal(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="branchCuisines">Cuisines (comma separated)</label>
                <input
                  id="branchCuisines"
                  type="text"
                  required
                  value={branchCuisines}
                  onChange={(e) => setBranchCuisines(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={busy}>
              Create Branch Outlet Using Above Pin &amp; Hours
            </button>
          </fieldset>
        </form>
      ) : null}

      <p className="status-note" role="status" aria-live="polite">
        {panelStatus}
      </p>
    </section>
  );
}
