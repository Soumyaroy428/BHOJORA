import { FormEvent, useEffect, useState } from 'react';
import {
  DOCUMENT_VERIFICATION_STATUSES,
  FSSAI_SEPARATION_NOTICE,
  FSSAI_VERIFICATION_STATUSES,
  ONBOARDING_APPLICATION_STATUSES,
  ONBOARDING_REVIEW_DECISIONS,
  type ApiResponse,
  type DocumentSignedAccessDto,
  type DocumentVerificationStatus,
  type FssaiVerificationStatus,
  type OnboardingApplicationStatus,
  type OnboardingReviewDecision,
  type RestaurantApplicationDto,
} from '@bhojora/shared';

export interface OnboardingReviewQueueProps {
  apiBase: string;
  accessToken: string | null;
  mfaVerified: boolean;
  onStatusUpdate?: (message: string) => void;
}

export function OnboardingReviewQueue({
  apiBase,
  accessToken,
  mfaVerified,
  onStatusUpdate,
}: OnboardingReviewQueueProps) {
  const [statusFilter, setStatusFilter] = useState<'ALL' | OnboardingApplicationStatus>('ALL');
  const [applications, setApplications] = useState<RestaurantApplicationDto[]>([]);
  const [selectedApp, setSelectedApp] = useState<RestaurantApplicationDto | null>(null);
  const [decision, setDecision] = useState<OnboardingReviewDecision>('APPROVE');
  const [fssaiDecision, setFssaiDecision] = useState<FssaiVerificationStatus>('VERIFIED');
  const [reason, setReason] = useState('');
  const [fssaiNote, setFssaiNote] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);
  const [docDecisions, setDocDecisions] = useState<Record<string, DocumentVerificationStatus>>({});
  const [busy, setBusy] = useState(false);
  const [signedDocAccess, setSignedDocAccess] = useState<DocumentSignedAccessDto | null>(null);
  const [queueStatus, setQueueStatus] = useState(
    'MFA-verified governance session required to inspect KYC metadata, private documents, and publish onboarding decisions.',
  );

  function selectApplication(application: RestaurantApplicationDto) {
    setSelectedApp(application);
    setDocDecisions(
      Object.fromEntries(application.documents.map((d) => [d.documentId, d.verificationStatus])),
    );
    setSignedDocAccess(null);
  }

  function reportStatus(message: string) {
    setQueueStatus(message);
    onStatusUpdate?.(message);
  }

  async function loadQueue(token: string, filterValue = statusFilter) {
    if (!apiBase || !mfaVerified) {
      return;
    }
    setBusy(true);
    try {
      const query = filterValue === 'ALL' ? '' : `?status=${encodeURIComponent(filterValue)}`;
      const res = await fetch(`${apiBase}/api/v1/admin/restaurant-applications${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await res.json()) as ApiResponse<{
        applications: RestaurantApplicationDto[];
      }>;
      if (!res.ok || !payload.success) {
        reportStatus(
          payload.success
            ? 'Unable to load onboarding review queue.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setApplications(payload.data.applications);
      const first = payload.data.applications[0] ?? null;
      if (first && !selectedApp) {
        selectApplication(first);
      }
      reportStatus(`Loaded ${payload.data.applications.length} onboarding application(s).`);
    } catch {
      reportStatus('Network error while loading onboarding review queue.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (accessToken && mfaVerified && apiBase) {
      void loadQueue(accessToken, statusFilter);
    }
  }, [accessToken, mfaVerified, statusFilter, apiBase]);

  async function handleInspectApplication(applicationId: string) {
    if (!accessToken || !apiBase || !mfaVerified) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/restaurant-applications/${applicationId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await res.json()) as ApiResponse<{ application: RestaurantApplicationDto }>;
      if (!res.ok || !payload.success) {
        reportStatus(
          payload.success
            ? 'Unable to load application detail.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      selectApplication(payload.data.application);
      reportStatus(`Inspecting application ${applicationId} (masked KYC & private documents).`);
    } catch {
      reportStatus('Network error while loading application details.');
    } finally {
      setBusy(false);
    }
  }

  async function handleOpenPrivateDocument(documentId: string) {
    if (!accessToken || !apiBase || !mfaVerified) {
      reportStatus('Verify Step-Up MFA before opening private compliance documents.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/restaurant/documents/${documentId}/access`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await res.json()) as ApiResponse<{ access: DocumentSignedAccessDto }>;
      if (!res.ok || !payload.success) {
        reportStatus(
          payload.success
            ? 'Private document access denied.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setSignedDocAccess(payload.data.access);
      reportStatus(`Audited temporary URL issued for document ${documentId}.`);
    } catch {
      reportStatus('Network error requesting private document access.');
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReasonTouched(true);
    if (!selectedApp || !accessToken || !apiBase) {
      reportStatus('Select an application inside an authenticated admin session first.');
      return;
    }
    if (!mfaVerified) {
      reportStatus(
        'Step-Up MFA verification is mandatory before submitting an onboarding decision.',
      );
      return;
    }
    if (reason.trim().length < 8) {
      document.getElementById('adminReviewReason')?.focus();
      reportStatus('Provide an explicit audit reason of at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/admin/restaurant-applications/${selectedApp.applicationId}/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            decision,
            fssaiVerificationDecision: fssaiDecision,
            reason: reason.trim(),
            fssaiVerifiedNote: fssaiNote.trim() ? fssaiNote.trim() : null,
            documentReviews: selectedApp.documents.map((doc) => ({
              documentId: doc.documentId,
              verificationStatus: docDecisions[doc.documentId] ?? doc.verificationStatus,
            })),
          }),
        },
      );
      const payload = (await res.json()) as ApiResponse<{ application: RestaurantApplicationDto }>;
      if (!res.ok || !payload.success) {
        reportStatus(
          payload.success
            ? 'Failed to apply onboarding review.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }

      selectApplication(payload.data.application);
      setReason('');
      setReasonTouched(false);
      await loadQueue(accessToken, statusFilter);
      reportStatus(
        `Decision ${decision} recorded for ${payload.data.application.applicationId}. FSSAI=${payload.data.application.fssaiVerificationStatus}, Platform Inspection remains ${payload.data.application.platformInspectionStatus}.`,
      );
    } catch {
      reportStatus('Network error while recording onboarding review.');
    } finally {
      setBusy(false);
    }
  }

  const reasonError =
    reasonTouched && reason.trim().length < 8 ? 'Audit reason must be at least 8 characters' : null;

  return (
    <section className="panel" aria-labelledby="onboarding-review-heading">
      <div className="hero-split" style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
        <div>
          <p className="eyebrow">Checkpoint 10 · Audited KYC &amp; FSSAI Governance</p>
          <h2 id="onboarding-review-heading">Restaurant Onboarding Review Queue</h2>
        </div>
        <button
          type="button"
          className="filter-btn"
          disabled={!accessToken || !mfaVerified || busy}
          onClick={() => accessToken && void loadQueue(accessToken, statusFilter)}
        >
          Refresh Live Queue
        </button>
      </div>

      <p className="notice-banner" role="note">
        <strong>Governance Boundary:</strong> {FSSAI_SEPARATION_NOTICE}
      </p>

      <div className="filter-row" role="group" aria-label="Onboarding application status filter">
        {(['ALL', ...ONBOARDING_APPLICATION_STATUSES] as const).map((status) => (
          <button
            key={status}
            type="button"
            className="filter-btn"
            aria-pressed={statusFilter === status}
            onClick={() => setStatusFilter(status)}
          >
            {status}
          </button>
        ))}
      </div>

      {!mfaVerified ? (
        <p className="status-note">
          Complete Control Session Sign-In and Step-Up MFA above to unlock
          `/api/v1/admin/restaurant-applications` and private document inspection.
        </p>
      ) : null}

      <div className="table-scroll">
        <table className="queue-table">
          <caption>
            Restaurant Applications ({applications.length} visible) — Statutory FSSAI &amp; Bhojora
            Platform Inspection kept strictly separate
          </caption>
          <thead>
            <tr>
              <th scope="col">Applicant &amp; Outlet</th>
              <th scope="col">Zone</th>
              <th scope="col">Masked KYC</th>
              <th scope="col">Statutory FSSAI</th>
              <th scope="col">Platform Inspection</th>
              <th scope="col">App Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {applications.length === 0 ? (
              <tr>
                <td colSpan={7}>No applications loaded for current filter / MFA session.</td>
              </tr>
            ) : (
              applications.map((item) => (
                <tr key={item.applicationId}>
                  <td>
                    <strong>{item.outletSetup.outletName}</strong>
                    <div className="field-hint">
                      {item.legalEntity.legalBusinessName} · {item.applicationId}
                    </div>
                  </td>
                  <td>{item.outletSetup.zoneId}</td>
                  <td>
                    PAN: {item.legalEntity.panMasked}
                    <div className="field-hint">Bank: {item.bankPayout.bankAccountMasked}</div>
                  </td>
                  <td>
                    <span className="pill">{item.fssaiVerificationStatus}</span>
                    <div className="field-hint">Exp: {item.legalEntity.fssaiExpiresOn}</div>
                  </td>
                  <td>
                    <span className="pill pill-warn">{item.platformInspectionStatus}</span>
                    <div className="field-hint">
                      Score:{' '}
                      {item.publishedSafetyScore === null
                        ? 'Pending Audit'
                        : item.publishedSafetyScore}
                    </div>
                  </td>
                  <td>{item.status}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-secondary"
                      aria-label={`Inspect ${item.outletSetup.outletName}`}
                      disabled={busy}
                      onClick={() => void handleInspectApplication(item.applicationId)}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedApp ? (
        <div className="detail-grid" role="region" aria-label="Selected application review panel">
          <div className="detail-box">
            <h3>
              {selectedApp.outletSetup.brandName} — {selectedApp.outletSetup.outletName}
            </h3>
            <p className="field-hint">
              Owner: {selectedApp.legalEntity.ownerFullName} (
              {selectedApp.legalEntity.ownerPhoneMasked}) · FSSAI{' '}
              {selectedApp.legalEntity.fssaiLicenseNumber}
            </p>
            <p className="field-hint">
              Platform Inspection State: <strong>{selectedApp.platformInspectionStatus}</strong>{' '}
              (unchanged by onboarding approval)
            </p>

            <h4 style={{ marginTop: '0.9rem', marginBottom: '0.45rem' }}>
              Private Compliance Documents ({selectedApp.documents.length})
            </h4>
            <ul className="queue-list">
              {selectedApp.documents.map((doc) => (
                <li key={doc.documentId} className="queue-item">
                  <div>
                    <strong>{doc.documentType}</strong>
                    <div className="field-hint">
                      {doc.fileName} · {doc.accessClassification} (isPublic: {String(doc.isPublic)})
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <label htmlFor={`doc-status-${doc.documentId}`} className="field-hint">
                      Status
                    </label>
                    <select
                      id={`doc-status-${doc.documentId}`}
                      value={docDecisions[doc.documentId] ?? doc.verificationStatus}
                      onChange={(e) =>
                        setDocDecisions((prev) => ({
                          ...prev,
                          [doc.documentId]: e.target.value as DocumentVerificationStatus,
                        }))
                      }
                    >
                      {DOCUMENT_VERIFICATION_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn-secondary"
                      aria-label={`Signed Access for ${doc.documentType}`}
                      disabled={busy || !mfaVerified}
                      onClick={() => void handleOpenPrivateDocument(doc.documentId)}
                    >
                      Signed Access
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {signedDocAccess ? (
              <p className="status-note">
                Audited private grant ({signedDocAccess.cacheControl}):{' '}
                <code>{signedDocAccess.signedAccessUrl}</code>
              </p>
            ) : null}
          </div>

          <div className="detail-box">
            <h3 id="review-form-heading">Record Audited Decision</h3>
            <form
              noValidate
              aria-labelledby="review-form-heading"
              onSubmit={(event) => void handleSubmitReview(event)}
            >
              <div className="field">
                <label htmlFor="adminReviewDecision">Onboarding Decision</label>
                <select
                  id="adminReviewDecision"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value as OnboardingReviewDecision)}
                >
                  {ONBOARDING_REVIEW_DECISIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="adminFssaiDecision">Statutory FSSAI Verification</label>
                <p id="hint-adminFssai" className="field-hint">
                  Applies to statutory FSSAI license only; does NOT alter platform inspection status
                </p>
                <select
                  id="adminFssaiDecision"
                  aria-describedby="hint-adminFssai"
                  value={fssaiDecision}
                  onChange={(e) => setFssaiDecision(e.target.value as FssaiVerificationStatus)}
                >
                  {FSSAI_VERIFICATION_STATUSES.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="adminFssaiNote">FSSAI Verification Note (Optional)</label>
                <input
                  id="adminFssaiNote"
                  type="text"
                  maxLength={240}
                  value={fssaiNote}
                  onChange={(e) => setFssaiNote(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="adminReviewReason">Mandatory Audit Reason (Min 8 chars)</label>
                <p id="hint-adminReason" className="field-hint">
                  Recorded immutably in reviewHistory and audit_logs
                </p>
                <textarea
                  id="adminReviewReason"
                  rows={3}
                  required
                  minLength={8}
                  aria-describedby="hint-adminReason"
                  aria-invalid={reasonError ? 'true' : undefined}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onBlur={() => setReasonTouched(true)}
                />
                {reasonError ? (
                  <p className="field-error" role="alert">
                    {reasonError}
                  </p>
                ) : null}
              </div>

              <button type="submit" className="btn-primary" disabled={busy || !mfaVerified}>
                {busy ? 'Recording Audit Decision...' : 'Submit Audited Review Decision'}
              </button>
            </form>
          </div>
        </div>
      ) : null}

      <p className="status-note" role="status" aria-live="polite">
        {queueStatus}
      </p>
    </section>
  );
}
