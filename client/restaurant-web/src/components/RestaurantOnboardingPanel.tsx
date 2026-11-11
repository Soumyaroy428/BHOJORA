import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  FSSAI_SEPARATION_NOTICE,
  KOLKATA_ZONE_IDS,
  MANDATORY_ONBOARDING_DOCUMENT_TYPES,
  MAX_DOCUMENT_SIZE_BYTES,
  RESTAURANT_DOCUMENT_TYPES,
  type ApiResponse,
  type DocumentSignedAccessDto,
  type DocumentUploadIntentDto,
  type KolkataZoneId,
  type RestaurantApplicationDto,
  type RestaurantDocumentDto,
  type RestaurantDocumentType,
} from '@bhojora/shared';

interface OnboardingFormState {
  legalBusinessName: string;
  ownerFullName: string;
  ownerPhone: string;
  ownerBusinessEmail: string;
  panNumber: string;
  gstin: string;
  fssaiLicenseNumber: string;
  fssaiExpiresOn: string;
  brandName: string;
  outletName: string;
  streetAddress: string;
  landmark: string;
  locality: string;
  wardOrBorough: string;
  postalCode: string;
  zoneId: KolkataZoneId;
  cuisinesText: string;
  prepTimeMinutes: string;
  accountHolderName: string;
  bankAccountNumber: string;
  ifscCode: string;
}

const INITIAL_FORM_STATE: OnboardingFormState = {
  legalBusinessName: '',
  ownerFullName: '',
  ownerPhone: '',
  ownerBusinessEmail: '',
  panNumber: '',
  gstin: '',
  fssaiLicenseNumber: '',
  fssaiExpiresOn: '2027-08-19',
  brandName: '',
  outletName: '',
  streetAddress: '',
  landmark: '',
  locality: '',
  wardOrBorough: '',
  postalCode: '',
  zoneId: 'salt-lake',
  cuisinesText: 'Bengali, Mughlai',
  prepTimeMinutes: '30',
  accountHolderName: '',
  bankAccountNumber: '',
  ifscCode: '',
};

const ZONE_LABELS: Record<KolkataZoneId, string> = {
  'salt-lake': 'Salt Lake Sector V & Bidhannagar',
  central: 'Park Street, Park Circus & Esplanade',
  'new-town': 'New Town Action Area I-III',
  south: 'Ballygunge, Jadavpur & Kasba',
  north: 'Shyambazar & Dum Dum',
};

const DOC_LABELS: Record<RestaurantDocumentType, string> = {
  FSSAI_CERTIFICATE: 'FSSAI Statutory License Certificate',
  PAN_CARD: 'Entity PAN Card',
  GSTIN_CERTIFICATE: 'GSTIN Registration Certificate',
  BANK_CANCELLED_CHEQUE: 'Bank Cancelled Cheque',
  MUNICIPAL_TRADE_LICENSE: 'KMC Municipal Trade License',
  KITCHEN_PREMISES_PROOF: 'Kitchen Premises Ownership / Lease',
};

type ValidatableField =
  | 'legalBusinessName'
  | 'ownerFullName'
  | 'ownerPhone'
  | 'ownerBusinessEmail'
  | 'panNumber'
  | 'gstin'
  | 'fssaiLicenseNumber'
  | 'fssaiExpiresOn'
  | 'brandName'
  | 'outletName'
  | 'streetAddress'
  | 'landmark'
  | 'locality'
  | 'wardOrBorough'
  | 'postalCode'
  | 'cuisinesText'
  | 'accountHolderName'
  | 'bankAccountNumber'
  | 'ifscCode';

function validateField(name: ValidatableField, form: OnboardingFormState): string | null {
  const val = form[name].trim();
  switch (name) {
    case 'legalBusinessName':
    case 'ownerFullName':
    case 'brandName':
    case 'outletName':
    case 'locality':
    case 'wardOrBorough':
    case 'accountHolderName':
      return val.length >= 2 ? null : 'Must be at least 2 characters';
    case 'streetAddress':
      return val.length >= 5 ? null : 'Enter street, building, and floor details (min 5 chars)';
    case 'landmark':
      return val.length >= 2 ? null : 'Enter a nearby Kolkata landmark';
    case 'ownerPhone':
      return /^(?:\+91|91)?[6-9]\d{9}$/.test(val.replace(/[\s-]/g, ''))
        ? null
        : 'Enter a valid 10-digit Indian mobile number';
    case 'ownerBusinessEmail':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) ? null : 'Enter a valid business email address';
    case 'panNumber':
      return /^[A-Z]{5}\d{4}[A-Z]$/.test(val.toUpperCase())
        ? null
        : 'PAN must match 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)';
    case 'gstin':
      if (!val) {
        return null;
      }
      return /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(val.toUpperCase())
        ? null
        : 'Enter a valid 15-character GSTIN or leave blank';
    case 'fssaiLicenseNumber':
      return /^\d{14}$/.test(val) ? null : 'FSSAI license number must be exactly 14 digits';
    case 'fssaiExpiresOn':
      return /^\d{4}-\d{2}-\d{2}$/.test(val) ? null : 'Select expiry date (YYYY-MM-DD)';
    case 'postalCode':
      return /^[1-9]\d{5}$/.test(val) ? null : 'Enter a valid 6-digit Kolkata PIN code';
    case 'cuisinesText': {
      const cuisines = val
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c.length >= 2);
      return cuisines.length >= 1 && cuisines.length <= 6
        ? null
        : 'Enter 1 to 6 comma-separated cuisine labels';
    }
    case 'bankAccountNumber':
      return /^\d{9,18}$/.test(val) ? null : 'Bank account number must be 9 to 18 digits';
    case 'ifscCode':
      return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(val.toUpperCase())
        ? null
        : 'Enter an 11-character IFSC (e.g. HDFC0000412)';
  }
}

async function computeFileSha256Hex(file: File): Promise<string> {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface RestaurantOnboardingPanelProps {
  apiBase: string;
  accessToken: string | null;
  onStatusUpdate?: (message: string) => void;
}

export function RestaurantOnboardingPanel({
  apiBase,
  accessToken,
  onStatusUpdate,
}: RestaurantOnboardingPanelProps) {
  const [form, setForm] = useState<OnboardingFormState>(INITIAL_FORM_STATE);
  const [touched, setTouched] = useState<Partial<Record<ValidatableField, boolean>>>({});
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  const [applications, setApplications] = useState<RestaurantApplicationDto[]>([]);
  const [activeApp, setActiveApp] = useState<RestaurantApplicationDto | null>(null);
  const [selectedDocType, setSelectedDocType] =
    useState<RestaurantDocumentType>('FSSAI_CERTIFICATE');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [panelNotice, setPanelNotice] = useState<string>(
    'Complete business KYC, FSSAI details, bank payout, and private compliance uploads before review submission.',
  );
  const [latestSignedAccess, setLatestSignedAccess] = useState<DocumentSignedAccessDto | null>(
    null,
  );

  function reportNotice(message: string) {
    setPanelNotice(message);
    onStatusUpdate?.(message);
  }

  async function refreshOwnApplications(token: string) {
    if (!apiBase) {
      return;
    }
    const res = await fetch(`${apiBase}/api/v1/restaurant/applications`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await res.json()) as ApiResponse<{
      applications: RestaurantApplicationDto[];
    }>;
    if (res.ok && payload.success) {
      setApplications(payload.data.applications);
      const latest = payload.data.applications[0] ?? null;
      if (latest) {
        setActiveApp(latest);
      }
    }
  }

  useEffect(() => {
    if (accessToken && apiBase) {
      void refreshOwnApplications(accessToken);
    }
  }, [accessToken, apiBase]);

  function updateField<K extends keyof OnboardingFormState>(key: K, value: OnboardingFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function markTouched(field: ValidatableField) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  function getVisibleError(field: ValidatableField): string | null {
    if (!touched[field] && !attemptedSubmit) {
      return null;
    }
    return validateField(field, form);
  }

  function validateAll(): ValidatableField[] {
    const allFields: ValidatableField[] = [
      'legalBusinessName',
      'ownerFullName',
      'ownerPhone',
      'ownerBusinessEmail',
      'panNumber',
      'gstin',
      'fssaiLicenseNumber',
      'fssaiExpiresOn',
      'brandName',
      'outletName',
      'streetAddress',
      'landmark',
      'locality',
      'wardOrBorough',
      'postalCode',
      'cuisinesText',
      'accountHolderName',
      'bankAccountNumber',
      'ifscCode',
    ];
    return allFields.filter((field) => validateField(field, form) !== null);
  }

  async function handleSaveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttemptedSubmit(true);
    const invalidFields = validateAll();
    if (invalidFields.length > 0) {
      const firstId = invalidFields[0];
      if (firstId) {
        document.getElementById(`onb-${firstId}`)?.focus();
      }
      reportNotice(`Fix ${invalidFields.length} highlighted onboarding field(s) before saving.`);
      return;
    }

    if (!accessToken || !apiBase) {
      reportNotice(
        'Sign in via Partner Sign In above (with local/deployed API active) to persist onboarding drafts to MongoDB.',
      );
      return;
    }

    setBusyAction('save');
    try {
      const cuisines = form.cuisinesText
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c.length >= 2);
      const bodyPayload = {
        legalEntity: {
          legalBusinessName: form.legalBusinessName.trim(),
          ownerFullName: form.ownerFullName.trim(),
          ownerPhone: form.ownerPhone.trim(),
          ownerBusinessEmail: form.ownerBusinessEmail.trim(),
          panNumber: form.panNumber.trim().toUpperCase(),
          gstin: form.gstin.trim() ? form.gstin.trim().toUpperCase() : null,
          fssaiLicenseNumber: form.fssaiLicenseNumber.trim(),
          fssaiExpiresOn: form.fssaiExpiresOn.trim(),
        },
        outletSetup: {
          brandName: form.brandName.trim(),
          outletName: form.outletName.trim(),
          streetAddress: form.streetAddress.trim(),
          landmark: form.landmark.trim(),
          locality: form.locality.trim(),
          wardOrBorough: form.wardOrBorough.trim(),
          city: 'Kolkata',
          postalCode: form.postalCode.trim(),
          zoneId: form.zoneId,
          cuisines,
          prepTimeMinutes: Number(form.prepTimeMinutes) || 30,
        },
        bankPayout: {
          accountHolderName: form.accountHolderName.trim(),
          bankAccountNumber: form.bankAccountNumber.trim(),
          ifscCode: form.ifscCode.trim().toUpperCase(),
        },
      };

      const targetUrl =
        activeApp && (activeApp.status === 'DRAFT' || activeApp.status === 'CHANGES_REQUESTED')
          ? `${apiBase}/api/v1/restaurant/applications/${activeApp.applicationId}`
          : `${apiBase}/api/v1/restaurant/applications`;
      const method =
        activeApp && (activeApp.status === 'DRAFT' || activeApp.status === 'CHANGES_REQUESTED')
          ? 'PATCH'
          : 'POST';

      const res = await fetch(targetUrl, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(bodyPayload),
      });
      const payload = (await res.json()) as ApiResponse<{ application: RestaurantApplicationDto }>;
      if (!res.ok || !payload.success) {
        reportNotice(
          payload.success
            ? 'Failed to save onboarding draft.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }

      setActiveApp(payload.data.application);
      await refreshOwnApplications(accessToken);
      reportNotice(
        `Saved onboarding application ${payload.data.application.applicationId} (${payload.data.application.status}). FSSAI and PAN/bank details stored masked/private.`,
      );
    } catch {
      reportNotice('Network error while saving restaurant onboarding draft.');
    } finally {
      setBusyAction(null);
    }
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
      reportNotice('Unsupported document format. Upload PDF, JPEG, PNG, or WebP.');
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
      reportNotice('Document exceeds 10 MB maximum file size limit.');
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
  }

  async function handleUploadPrivateDocument() {
    if (!activeApp) {
      reportNotice('Save an onboarding draft before uploading private compliance documents.');
      return;
    }
    if (!accessToken || !apiBase) {
      reportNotice('Active authenticated partner session required for signed document upload.');
      return;
    }
    if (!selectedFile) {
      reportNotice('Select a compliance document file first.');
      return;
    }

    setBusyAction('upload');
    try {
      const sha256Checksum = await computeFileSha256Hex(selectedFile);
      const intentRes = await fetch(
        `${apiBase}/api/v1/restaurant/applications/${activeApp.applicationId}/documents/upload-url`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            documentType: selectedDocType,
            fileName: selectedFile.name,
            mimeType: selectedFile.type,
            sizeBytes: selectedFile.size,
            sha256Checksum,
          }),
        },
      );
      const intentPayload = (await intentRes.json()) as ApiResponse<{
        uploadIntent: DocumentUploadIntentDto;
      }>;
      if (!intentRes.ok || !intentPayload.success) {
        reportNotice(
          intentPayload.success
            ? 'Failed to issue signed private upload intent.'
            : `${intentPayload.error.code}: ${intentPayload.error.message}`,
        );
        return;
      }

      const confirmRes = await fetch(
        `${apiBase}/api/v1/restaurant/applications/${activeApp.applicationId}/documents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            documentType: selectedDocType,
            fileName: selectedFile.name,
            mimeType: selectedFile.type,
            sizeBytes: selectedFile.size,
            sha256Checksum,
            uploadToken: intentPayload.data.uploadIntent.uploadToken,
            storageKey: intentPayload.data.uploadIntent.storageKey,
          }),
        },
      );
      const confirmPayload = (await confirmRes.json()) as ApiResponse<{
        document: RestaurantDocumentDto;
      }>;
      if (!confirmRes.ok || !confirmPayload.success) {
        reportNotice(
          confirmPayload.success
            ? 'Failed to confirm private compliance document upload.'
            : `${confirmPayload.error.code}: ${confirmPayload.error.message}`,
        );
        return;
      }

      setSelectedFile(null);
      await refreshOwnApplications(accessToken);
      reportNotice(
        `Attached ${confirmPayload.data.document.documentType} as PRIVATE_COMPLIANCE (isPublic: false).`,
      );
    } catch {
      reportNotice('Error computing SHA-256 checksum or confirming compliance upload.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleRequestPrivateAccess(documentId: string) {
    if (!accessToken || !apiBase) {
      return;
    }
    setBusyAction(documentId);
    try {
      const res = await fetch(`${apiBase}/api/v1/restaurant/documents/${documentId}/access`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = (await res.json()) as ApiResponse<{ access: DocumentSignedAccessDto }>;
      if (!res.ok || !payload.success) {
        reportNotice(
          payload.success
            ? 'Could not issue temporary private document URL.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setLatestSignedAccess(payload.data.access);
      reportNotice(
        `Short-lived audited access issued for ${documentId} (expires ${payload.data.access.expiresAt}).`,
      );
    } catch {
      reportNotice('Network error while requesting audited document access.');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitForReview() {
    if (!activeApp || !accessToken || !apiBase) {
      reportNotice('Sign in and save an application draft before submitting for admin review.');
      return;
    }
    setBusyAction('submit');
    try {
      const res = await fetch(
        `${apiBase}/api/v1/restaurant/applications/${activeApp.applicationId}/submit`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
      const payload = (await res.json()) as ApiResponse<{ application: RestaurantApplicationDto }>;
      if (!res.ok || !payload.success) {
        reportNotice(
          payload.success
            ? 'Cannot submit application yet.'
            : `${payload.error.code}: ${payload.error.message}`,
        );
        return;
      }
      setActiveApp(payload.data.application);
      await refreshOwnApplications(accessToken);
      reportNotice(
        `Application ${payload.data.application.applicationId} submitted for admin compliance & FSSAI review.`,
      );
    } catch {
      reportNotice('Network error while submitting application.');
    } finally {
      setBusyAction(null);
    }
  }

  const uploadedTypes = new Set(activeApp?.documents.map((doc) => doc.documentType) ?? []);
  const missingMandatoryDocs = MANDATORY_ONBOARDING_DOCUMENT_TYPES.filter(
    (docType) => !uploadedTypes.has(docType),
  );

  return (
    <section className="panel" aria-labelledby="onboarding-heading">
      <div className="action-row" style={{ justifyContent: 'space-between' }}>
        <div>
          <p className="eyebrow">Checkpoint 10 · Partner Onboarding &amp; KYC</p>
          <h2 id="onboarding-heading">Restaurant Onboarding &amp; Statutory Compliance</h2>
        </div>
        {activeApp ? (
          <div className="action-row">
            <span className="badge">Application: {activeApp.status}</span>
            <span className="badge badge-warn">
              Statutory FSSAI: {activeApp.fssaiVerificationStatus}
            </span>
            <span className="badge badge-warn">
              Platform Inspection: {activeApp.platformInspectionStatus}
            </span>
          </div>
        ) : null}
      </div>

      <p className="notice-banner" role="note">
        <strong>Strict Separation Policy:</strong> {FSSAI_SEPARATION_NOTICE}
      </p>

      {applications.length > 0 ? (
        <div className="outlet-tabs" role="group" aria-label="Your onboarding applications">
          {applications.map((item) => (
            <button
              key={item.applicationId}
              type="button"
              className="tab-btn"
              aria-pressed={activeApp?.applicationId === item.applicationId}
              onClick={() => setActiveApp(item)}
            >
              {item.outletSetup.outletName} ({item.status})
            </button>
          ))}
        </div>
      ) : null}

      <form
        noValidate
        aria-labelledby="onboarding-heading"
        onSubmit={(event) => void handleSaveDraft(event)}
      >
        <fieldset className="fieldset-group">
          <legend>1. Legal Entity &amp; Statutory FSSAI Details</legend>
          <div className="form-grid-2">
            <div className="field">
              <label htmlFor="onb-legalBusinessName">Registered Legal Business Name</label>
              <p id="hint-legalBusinessName" className="field-hint">
                As printed on PAN and FSSAI registration
              </p>
              <input
                id="onb-legalBusinessName"
                type="text"
                required
                minLength={2}
                autoComplete="organization"
                aria-describedby="hint-legalBusinessName"
                aria-invalid={getVisibleError('legalBusinessName') ? 'true' : undefined}
                value={form.legalBusinessName}
                onChange={(e) => updateField('legalBusinessName', e.target.value)}
                onBlur={() => markTouched('legalBusinessName')}
              />
              {getVisibleError('legalBusinessName') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('legalBusinessName')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-ownerFullName">Authorized Owner / Signatory Name</label>
              <input
                id="onb-ownerFullName"
                type="text"
                required
                minLength={2}
                autoComplete="name"
                aria-invalid={getVisibleError('ownerFullName') ? 'true' : undefined}
                value={form.ownerFullName}
                onChange={(e) => updateField('ownerFullName', e.target.value)}
                onBlur={() => markTouched('ownerFullName')}
              />
              {getVisibleError('ownerFullName') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('ownerFullName')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-ownerPhone">Owner Mobile (+91)</label>
              <p id="hint-ownerPhone" className="field-hint">
                Format: +919830012345 (masked in partner &amp; public responses)
              </p>
              <input
                id="onb-ownerPhone"
                type="tel"
                required
                autoComplete="tel"
                aria-describedby="hint-ownerPhone"
                aria-invalid={getVisibleError('ownerPhone') ? 'true' : undefined}
                value={form.ownerPhone}
                onChange={(e) => updateField('ownerPhone', e.target.value)}
                onBlur={() => markTouched('ownerPhone')}
              />
              {getVisibleError('ownerPhone') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('ownerPhone')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-ownerBusinessEmail">Owner Business Email</label>
              <input
                id="onb-ownerBusinessEmail"
                type="email"
                required
                autoComplete="email"
                aria-invalid={getVisibleError('ownerBusinessEmail') ? 'true' : undefined}
                value={form.ownerBusinessEmail}
                onChange={(e) => updateField('ownerBusinessEmail', e.target.value)}
                onBlur={() => markTouched('ownerBusinessEmail')}
              />
              {getVisibleError('ownerBusinessEmail') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('ownerBusinessEmail')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-panNumber">Business PAN (Stored Masked &amp; Hashed)</label>
              <p id="hint-panNumber" className="field-hint">
                10 alphanumeric characters (example: ABCDE1234F)
              </p>
              <input
                id="onb-panNumber"
                type="text"
                required
                maxLength={10}
                pattern="[A-Za-z]{5}\d{4}[A-Za-z]"
                aria-describedby="hint-panNumber"
                aria-invalid={getVisibleError('panNumber') ? 'true' : undefined}
                value={form.panNumber}
                onChange={(e) => updateField('panNumber', e.target.value.toUpperCase())}
                onBlur={() => markTouched('panNumber')}
              />
              {getVisibleError('panNumber') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('panNumber')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-gstin">GSTIN (Optional for Composition Entities)</label>
              <p id="hint-gstin" className="field-hint">
                Leave blank or enter 15-character GSTIN (example: 19ABCDE1234F1Z5)
              </p>
              <input
                id="onb-gstin"
                type="text"
                maxLength={15}
                aria-describedby="hint-gstin"
                aria-invalid={getVisibleError('gstin') ? 'true' : undefined}
                value={form.gstin}
                onChange={(e) => updateField('gstin', e.target.value.toUpperCase())}
                onBlur={() => markTouched('gstin')}
              />
              {getVisibleError('gstin') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('gstin')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-fssaiLicenseNumber">14-Digit FSSAI License Number</label>
              <p id="hint-fssai" className="field-hint">
                Statutory registration only; independent Bhojora hygiene audit remains separate
              </p>
              <input
                id="onb-fssaiLicenseNumber"
                type="text"
                inputMode="numeric"
                required
                maxLength={14}
                pattern="\d{14}"
                aria-describedby="hint-fssai"
                aria-invalid={getVisibleError('fssaiLicenseNumber') ? 'true' : undefined}
                value={form.fssaiLicenseNumber}
                onChange={(e) => updateField('fssaiLicenseNumber', e.target.value)}
                onBlur={() => markTouched('fssaiLicenseNumber')}
              />
              {getVisibleError('fssaiLicenseNumber') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('fssaiLicenseNumber')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-fssaiExpiresOn">FSSAI License Expiry Date</label>
              <input
                id="onb-fssaiExpiresOn"
                type="date"
                required
                aria-invalid={getVisibleError('fssaiExpiresOn') ? 'true' : undefined}
                value={form.fssaiExpiresOn}
                onChange={(e) => updateField('fssaiExpiresOn', e.target.value)}
                onBlur={() => markTouched('fssaiExpiresOn')}
              />
              {getVisibleError('fssaiExpiresOn') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('fssaiExpiresOn')}
                </p>
              ) : null}
            </div>
          </div>
        </fieldset>

        <fieldset className="fieldset-group">
          <legend>2. Kolkata Outlet Configuration</legend>
          <div className="form-grid-2">
            <div className="field">
              <label htmlFor="onb-brandName">Restaurant Brand Name</label>
              <input
                id="onb-brandName"
                type="text"
                required
                aria-invalid={getVisibleError('brandName') ? 'true' : undefined}
                value={form.brandName}
                onChange={(e) => updateField('brandName', e.target.value)}
                onBlur={() => markTouched('brandName')}
              />
              {getVisibleError('brandName') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('brandName')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-outletName">Outlet / Branch Name</label>
              <input
                id="onb-outletName"
                type="text"
                required
                aria-invalid={getVisibleError('outletName') ? 'true' : undefined}
                value={form.outletName}
                onChange={(e) => updateField('outletName', e.target.value)}
                onBlur={() => markTouched('outletName')}
              />
              {getVisibleError('outletName') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('outletName')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-zoneId">Kolkata Service Zone</label>
              <select
                id="onb-zoneId"
                value={form.zoneId}
                onChange={(e) => updateField('zoneId', e.target.value as KolkataZoneId)}
              >
                {KOLKATA_ZONE_IDS.map((zone) => (
                  <option key={zone} value={zone}>
                    {ZONE_LABELS[zone]}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="onb-wardOrBorough">KMC / Bidhannagar Ward or Borough</label>
              <input
                id="onb-wardOrBorough"
                type="text"
                required
                aria-invalid={getVisibleError('wardOrBorough') ? 'true' : undefined}
                value={form.wardOrBorough}
                onChange={(e) => updateField('wardOrBorough', e.target.value)}
                onBlur={() => markTouched('wardOrBorough')}
              />
              {getVisibleError('wardOrBorough') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('wardOrBorough')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-streetAddress">Kitchen Street Address</label>
              <input
                id="onb-streetAddress"
                type="text"
                required
                autoComplete="street-address"
                aria-invalid={getVisibleError('streetAddress') ? 'true' : undefined}
                value={form.streetAddress}
                onChange={(e) => updateField('streetAddress', e.target.value)}
                onBlur={() => markTouched('streetAddress')}
              />
              {getVisibleError('streetAddress') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('streetAddress')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-landmark">Landmark</label>
              <input
                id="onb-landmark"
                type="text"
                required
                aria-invalid={getVisibleError('landmark') ? 'true' : undefined}
                value={form.landmark}
                onChange={(e) => updateField('landmark', e.target.value)}
                onBlur={() => markTouched('landmark')}
              />
              {getVisibleError('landmark') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('landmark')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-locality">Locality</label>
              <input
                id="onb-locality"
                type="text"
                required
                aria-invalid={getVisibleError('locality') ? 'true' : undefined}
                value={form.locality}
                onChange={(e) => updateField('locality', e.target.value)}
                onBlur={() => markTouched('locality')}
              />
              {getVisibleError('locality') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('locality')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-postalCode">Kolkata PIN Code</label>
              <p id="hint-postalCode" className="field-hint">
                6-digit postal code (e.g. 700091)
              </p>
              <input
                id="onb-postalCode"
                type="text"
                inputMode="numeric"
                required
                maxLength={6}
                autoComplete="postal-code"
                aria-describedby="hint-postalCode"
                aria-invalid={getVisibleError('postalCode') ? 'true' : undefined}
                value={form.postalCode}
                onChange={(e) => updateField('postalCode', e.target.value)}
                onBlur={() => markTouched('postalCode')}
              />
              {getVisibleError('postalCode') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('postalCode')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-cuisinesText">Primary Cuisines (1-6, comma-separated)</label>
              <input
                id="onb-cuisinesText"
                type="text"
                required
                aria-invalid={getVisibleError('cuisinesText') ? 'true' : undefined}
                value={form.cuisinesText}
                onChange={(e) => updateField('cuisinesText', e.target.value)}
                onBlur={() => markTouched('cuisinesText')}
              />
              {getVisibleError('cuisinesText') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('cuisinesText')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-prepTimeMinutes">Average Prep Time (Minutes)</label>
              <input
                id="onb-prepTimeMinutes"
                type="number"
                min={10}
                max={90}
                value={form.prepTimeMinutes}
                onChange={(e) => updateField('prepTimeMinutes', e.target.value)}
              />
            </div>
          </div>
        </fieldset>

        <fieldset className="fieldset-group">
          <legend>3. Settlement Bank Account (Stored Masked)</legend>
          <div className="form-grid-2">
            <div className="field">
              <label htmlFor="onb-accountHolderName">Bank Account Holder Name</label>
              <input
                id="onb-accountHolderName"
                type="text"
                required
                aria-invalid={getVisibleError('accountHolderName') ? 'true' : undefined}
                value={form.accountHolderName}
                onChange={(e) => updateField('accountHolderName', e.target.value)}
                onBlur={() => markTouched('accountHolderName')}
              />
              {getVisibleError('accountHolderName') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('accountHolderName')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-bankAccountNumber">Bank Account Number</label>
              <p id="hint-bank" className="field-hint">
                9-18 digits; masked after submission (only last 4 digits returned)
              </p>
              <input
                id="onb-bankAccountNumber"
                type="password"
                inputMode="numeric"
                required
                aria-describedby="hint-bank"
                aria-invalid={getVisibleError('bankAccountNumber') ? 'true' : undefined}
                value={form.bankAccountNumber}
                onChange={(e) => updateField('bankAccountNumber', e.target.value)}
                onBlur={() => markTouched('bankAccountNumber')}
              />
              {getVisibleError('bankAccountNumber') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('bankAccountNumber')}
                </p>
              ) : null}
            </div>

            <div className="field">
              <label htmlFor="onb-ifscCode">IFSC Code</label>
              <p id="hint-ifsc" className="field-hint">
                11 characters (example: HDFC0000412)
              </p>
              <input
                id="onb-ifscCode"
                type="text"
                required
                maxLength={11}
                aria-describedby="hint-ifsc"
                aria-invalid={getVisibleError('ifscCode') ? 'true' : undefined}
                value={form.ifscCode}
                onChange={(e) => updateField('ifscCode', e.target.value.toUpperCase())}
                onBlur={() => markTouched('ifscCode')}
              />
              {getVisibleError('ifscCode') ? (
                <p className="field-error" role="alert">
                  {getVisibleError('ifscCode')}
                </p>
              ) : null}
            </div>
          </div>
        </fieldset>

        <div className="action-row">
          <button
            type="submit"
            className="btn-primary"
            style={{ width: 'auto' }}
            disabled={busyAction !== null}
          >
            {busyAction === 'save'
              ? 'Saving Draft...'
              : activeApp
                ? 'Update Onboarding Draft'
                : 'Create Onboarding Draft'}
          </button>

          {activeApp &&
          (activeApp.status === 'DRAFT' || activeApp.status === 'CHANGES_REQUESTED') ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={busyAction !== null || missingMandatoryDocs.length > 0}
              onClick={() => void handleSubmitForReview()}
            >
              {missingMandatoryDocs.length > 0
                ? `Attach ${missingMandatoryDocs.length} Mandatory Doc(s) to Submit`
                : 'Submit Application for Compliance Review'}
            </button>
          ) : null}
        </div>
      </form>

      <fieldset className="fieldset-group" style={{ marginTop: '1.25rem' }}>
        <legend>
          4. Private Compliance Documents Vault (PRIVATE_COMPLIANCE · isPublic: false)
        </legend>
        <p className="field-hint" style={{ marginBottom: '0.75rem' }}>
          Mandatory before submission: FSSAI Certificate, Entity PAN Card, and Bank Cancelled
          Cheque. Files are never exposed on customer or public endpoints.
        </p>

        <div className="form-grid-2">
          <div className="field">
            <label htmlFor="onb-docType">Compliance Document Type</label>
            <select
              id="onb-docType"
              value={selectedDocType}
              onChange={(e) => setSelectedDocType(e.target.value as RestaurantDocumentType)}
            >
              {RESTAURANT_DOCUMENT_TYPES.map((docType) => (
                <option key={docType} value={docType}>
                  {DOC_LABELS[docType]}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="onb-docFile">Select Private PDF / Image (Max 10 MB)</label>
            <input
              id="onb-docFile"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn-ghost"
          disabled={!activeApp || !selectedFile || busyAction !== null}
          onClick={() => void handleUploadPrivateDocument()}
        >
          {busyAction === 'upload'
            ? 'Signing & Registering Private Upload...'
            : 'Request Signed Private Upload & Attach Document'}
        </button>

        {activeApp && activeApp.documents.length > 0 ? (
          <div className="table-scroll" style={{ marginTop: '1rem' }}>
            <table className="data-table">
              <caption>
                Attached Private Compliance Documents ({activeApp.documents.length})
              </caption>
              <thead>
                <tr>
                  <th scope="col">Document Type</th>
                  <th scope="col">File</th>
                  <th scope="col">Privacy Classification</th>
                  <th scope="col">Verification</th>
                  <th scope="col">Access</th>
                </tr>
              </thead>
              <tbody>
                {activeApp.documents.map((doc) => (
                  <tr key={doc.documentId}>
                    <td>{doc.documentType}</td>
                    <td>{doc.fileName}</td>
                    <td>
                      {doc.accessClassification} (isPublic: {String(doc.isPublic)})
                    </td>
                    <td>{doc.verificationStatus}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-ghost"
                        aria-label={`Signed Access for ${doc.documentType}`}
                        disabled={busyAction !== null}
                        onClick={() => void handleRequestPrivateAccess(doc.documentId)}
                      >
                        Signed Access
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {latestSignedAccess ? (
          <p className="status-note">
            Temporary access link ({latestSignedAccess.cacheControl}):{' '}
            <code>{latestSignedAccess.signedAccessUrl}</code>
          </p>
        ) : null}
      </fieldset>

      {activeApp ? (
        <div className="metrics-row" style={{ marginTop: '1rem' }}>
          <div>
            <p className="metric-label">Masked PAN &amp; Payout</p>
            <p className="metric-val" style={{ fontSize: '1rem' }}>
              {activeApp.legalEntity.panMasked} · {activeApp.bankPayout.bankAccountMasked}
            </p>
          </div>
          <div>
            <p className="metric-label">Statutory FSSAI ({activeApp.legalEntity.fssaiExpiresOn})</p>
            <p className="metric-val" style={{ fontSize: '1rem' }}>
              {activeApp.fssaiVerificationStatus}
            </p>
          </div>
          <div>
            <p className="metric-label">Bhojora Field Inspection</p>
            <p className="metric-val" style={{ fontSize: '1rem' }}>
              {activeApp.platformInspectionStatus} (Score:{' '}
              {activeApp.publishedSafetyScore === null ? 'Pending' : activeApp.publishedSafetyScore}
              )
            </p>
          </div>
        </div>
      ) : null}

      <p className="status-note" role="status" aria-live="polite">
        {panelNotice}
      </p>
    </section>
  );
}
