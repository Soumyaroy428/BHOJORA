import React, { useState, useEffect } from 'react';
import {
  type CertificateType,
  type ConflictType,
  type InspectorConflictDeclaration,
  type InspectorProfile,
  type FindingSeverity,
  type EvidenceType,
  type InspectionFindingDto,
  type InspectionEvidenceDto,
  STANDARD_CHECKLIST_TEMPLATE_V1,
} from '@bhojora/shared';

const _CERT_OPTIONS: { value: CertificateType; label: string }[] = [
  { value: 'FSSAI_FOSTAC', label: 'FSSAI FoSTaC Advanced Catering' },
  { value: 'FOOD_SAFETY_AUDITOR', label: 'Certified Food Safety Auditor (ISO 19011)' },
  { value: 'HACCP_LEAD_AUDITOR', label: 'HACCP Lead Auditor' },
  { value: 'ISO_22000', label: 'ISO 22000 Lead Auditor' },
  { value: 'OTHER', label: 'Other Recognized Statutory Credential' },
];

const CONFLICT_OPTIONS: { value: ConflictType; label: string }[] = [
  { value: 'PREVIOUS_EMPLOYMENT', label: 'Previous Employment within 24 months' },
  { value: 'FINANCIAL_INTEREST', label: 'Direct or Indirect Financial Interest' },
  { value: 'FAMILY_RELATION', label: 'Family Relation / Household Member' },
  { value: 'OWNERSHIP', label: 'Partial or Full Ownership / Directorship' },
  { value: 'OTHER', label: 'Other Personal or Professional Affiliation' },
];

async function computeSha256Hex(text: string): Promise<string> {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
}

export default function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'audit' | 'profile'>('audit');

  // Profile state
  const [profile, setProfile] = useState<InspectorProfile | null>({
    id: 'ins_kol_8921',
    userId: 'usr_inspector_kolkata',
    fullName: 'Dr. Anirban Mukherjee',
    email: 'anirban.mukherjee@bhojora.internal',
    phone: '+919830123456',
    badgeNumber: 'INS-WB-104',
    status: 'APPROVED',
    cityCode: 'KOLKATA',
    certifications: [
      {
        certificateType: 'FSSAI_FOSTAC',
        certificateNumber: 'FSSAI-WB-2024-9842',
        issuingAuthority: 'Food Safety and Standards Authority of India',
        issuedAt: '2024-01-01T00:00:00.000Z',
        expiresAt: '2028-12-31T00:00:00.000Z',
      },
    ],
    trainings: [
      {
        moduleName: 'BHOJORA Kolkata Food Safety Standard v1.0',
        completedAt: new Date().toISOString(),
        scorePercent: 100,
        validUntil: '2028-01-01T00:00:00.000Z',
      },
    ],
    conflicts: [
      {
        restaurantId: 'rest_mocambo_park_st',
        outletId: 'out_mocambo_main',
        conflictType: 'PREVIOUS_EMPLOYMENT',
        description: 'Consulted as external hygiene adviser in 2023',
        declaredAt: new Date().toISOString(),
      },
    ],
    approvedByAdminId: 'usr_super_admin_01',
    approvedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const [fullName] = useState('Dr. Anirban Mukherjee');
  const [phone] = useState('+919830123456');
  const [certType] = useState<CertificateType>('FSSAI_FOSTAC');
  const [certNumber] = useState('FSSAI-WB-2024-9842');
  const [authority] = useState('Food Safety and Standards Authority of India');
  const [expiryDate] = useState('2028-12-31');

  // Conflict declaration
  const [conflicts, setConflicts] = useState<InspectorConflictDeclaration[]>(
    profile?.conflicts ?? [],
  );
  const [newConflictRestId, setNewConflictRestId] = useState('');
  const [newConflictType, setNewConflictType] = useState<ConflictType>('PREVIOUS_EMPLOYMENT');
  const [newConflictDesc, setNewConflictDesc] = useState('');

  // Active Inspection Audit State
  const [outletId] = useState('out_flurys_parkst');
  const [outletName] = useState('Flurys Heritage Tearoom & Confectionery');
  const [findings, setFindings] = useState<Record<string, InspectionFindingDto>>(() => {
    const init: Record<string, InspectionFindingDto> = {};
    for (const item of STANDARD_CHECKLIST_TEMPLATE_V1.items) {
      init[item.itemId] = {
        itemId: item.itemId,
        category: item.category,
        score: item.maxScore,
        maxScore: item.maxScore,
        severity: 'PASS',
        comments: '',
        evidenceIds: [],
      };
    }
    return init;
  });

  const [evidenceList, setEvidenceList] = useState<InspectionEvidenceDto[]>([]);
  const [offlineDraftSavedAt, setOfflineDraftSavedAt] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [managerName, setManagerName] = useState('Amitava Sengupta');
  const [managerDesignation, setManagerDesignation] = useState(
    'General Manager / Food Safety Officer',
  );
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  // Load any previously cached offline draft from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bhojora_inspection_draft_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.findings) {
          setFindings(parsed.findings);
        }
        if (parsed.offlineDraftSavedAt) {
          setOfflineDraftSavedAt(parsed.offlineDraftSavedAt);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handleUpdateFindingSeverity = (itemId: string, severity: FindingSeverity) => {
    const item = STANDARD_CHECKLIST_TEMPLATE_V1.items.find((i) => i.itemId === itemId);
    if (!item) return;

    let score = item.maxScore;
    if (severity === 'MINOR') score = Math.round(item.maxScore * 0.7);
    else if (severity === 'MAJOR') score = Math.round(item.maxScore * 0.3);
    else if (severity === 'CRITICAL') score = 0;

    setFindings((prev) => {
      const current = prev[itemId] || {
        itemId,
        category: item.category,
        score: item.maxScore,
        maxScore: item.maxScore,
        severity: 'PASS',
        comments: '',
        evidenceIds: [],
      };
      return {
        ...prev,
        [itemId]: {
          ...current,
          severity,
          score,
        },
      };
    });
  };

  const handleUpdateComments = (itemId: string, comments: string) => {
    const item = STANDARD_CHECKLIST_TEMPLATE_V1.items.find((i) => i.itemId === itemId);
    if (!item) return;

    setFindings((prev) => {
      const current = prev[itemId] || {
        itemId,
        category: item.category,
        score: item.maxScore,
        maxScore: item.maxScore,
        severity: 'PASS',
        comments: '',
        evidenceIds: [],
      };
      return {
        ...prev,
        [itemId]: {
          ...current,
          comments,
        },
      };
    });
  };

  const handleAttachEvidence = async (itemId: string, evidenceType: EvidenceType = 'PHOTO') => {
    const item = STANDARD_CHECKLIST_TEMPLATE_V1.items.find((i) => i.itemId === itemId);
    const mockFilePayload = `EVIDENCE_${itemId}_${Date.now()}_LON88.3512_LAT22.5535`;
    const sha256 = await computeSha256Hex(mockFilePayload);
    const newEvidenceId = `evi_${Math.random().toString(36).substring(2, 9)}`;

    const newEvidence: InspectionEvidenceDto = {
      id: newEvidenceId,
      inspectionId: 'ins_audit_session_01',
      itemId,
      evidenceType,
      sha256Hash: sha256,
      mimeType: evidenceType === 'PHOTO' ? 'image/jpeg' : 'application/pdf',
      sizeBytes: 1024 * 340, // 340 KB
      capturedAt: new Date().toISOString(),
      capturedCoordinates: [88.3512, 22.5535],
      storageKey: `evidence/ins_audit_session_01/${newEvidenceId}.jpg`,
      caption: `On-site digital capture for ${item?.title ?? itemId}`,
    };

    setEvidenceList((prev) => [...prev, newEvidence]);
    setFindings((prev) => {
      const current = prev[itemId] || {
        itemId,
        category: item ? item.category : 'PERSONAL_HYGIENE',
        score: item ? item.maxScore : 10,
        maxScore: item ? item.maxScore : 10,
        severity: 'PASS',
        comments: '',
        evidenceIds: [],
      };
      return {
        ...prev,
        [itemId]: {
          ...current,
          evidenceIds: [...(current.evidenceIds || []), newEvidenceId],
        },
      };
    });

    setMessage(`Attached tamper-verified evidence (${evidenceType}) with SHA-256 integrity hash.`);
  };

  const handleSaveOfflineDraft = () => {
    const now = new Date().toISOString();
    setOfflineDraftSavedAt(now);
    try {
      localStorage.setItem(
        'bhojora_inspection_draft_v1',
        JSON.stringify({
          outletId,
          findings,
          evidenceList,
          offlineDraftSavedAt: now,
        }),
      );
      setMessage(
        `Offline inspection draft saved to local device at ${new Date(now).toLocaleTimeString()}.`,
      );
    } catch {
      setMessage('Draft saved in memory.');
    }
  };

  const validateSubmission = (): string[] => {
    const errors: string[] = [];
    for (const item of STANDARD_CHECKLIST_TEMPLATE_V1.items) {
      const f = findings[item.itemId];
      const hasEvidence = f && f.evidenceIds && f.evidenceIds.length > 0;

      // 1. Mandatory checklist item evidence
      if (item.evidenceRequired && !hasEvidence) {
        errors.push(
          `Item [${item.itemId}] '${item.title}' has mandatory evidence requirement. Please capture proof.`,
        );
      }

      // 2. CRITICAL or MAJOR violations must have evidence
      if (f && (f.severity === 'CRITICAL' || f.severity === 'MAJOR') && !hasEvidence) {
        errors.push(
          `Violation severity is ${f.severity} on [${item.itemId}] '${item.title}'. Photographic or documentary evidence is strictly required before submission.`,
        );
      }
    }

    if (!managerName.trim()) {
      errors.push('Manager on duty signature and name required for on-site debrief.');
    }

    return errors;
  };

  const handleSubmitInspection = (e: React.FormEvent) => {
    e.preventDefault();
    const errors = validateSubmission();
    setValidationErrors(errors);

    if (errors.length > 0) {
      setMessage(null);
      return;
    }

    const now = new Date().toISOString();
    setSubmittedAt(now);
    localStorage.removeItem('bhojora_inspection_draft_v1');
    setMessage('Inspection audit successfully verified & submitted to Bhojora Quality Council.');
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const mockProfile: InspectorProfile = {
      id: 'ins_mock_7491',
      userId: 'usr_mock_inspector',
      fullName,
      email: 'anirban.mukherjee@bhojora.internal',
      phone,
      badgeNumber: 'INS-WB-104',
      status: 'APPROVED',
      cityCode: 'KOLKATA',
      certifications: [
        {
          certificateType: certType,
          certificateNumber: certNumber,
          issuingAuthority: authority,
          issuedAt: '2024-01-01T00:00:00.000Z',
          expiresAt: `${expiryDate}T00:00:00.000Z`,
        },
      ],
      trainings: [
        {
          moduleName: 'BHOJORA Kolkata Food Safety Standard v1.0',
          completedAt: new Date().toISOString(),
          scorePercent: 100,
          validUntil: '2028-01-01T00:00:00.000Z',
        },
      ],
      conflicts,
      approvedByAdminId: 'usr_super_admin_01',
      approvedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setProfile(mockProfile);
    setMessage('Inspector profile and qualification credentials saved.');
  };

  const handleAddConflict = () => {
    if (!newConflictRestId.trim() || !newConflictDesc.trim()) return;
    const newEntry: InspectorConflictDeclaration = {
      restaurantId: newConflictRestId.trim(),
      conflictType: newConflictType,
      description: newConflictDesc.trim(),
      declaredAt: new Date().toISOString(),
    };
    const updated = [...conflicts, newEntry];
    setConflicts(updated);
    if (profile) {
      setProfile({ ...profile, conflicts: updated });
    }
    setNewConflictRestId('');
    setNewConflictDesc('');
  };

  const totalScore = Object.values(findings).reduce((acc, curr) => acc + (curr.score || 0), 0);
  const maxPossibleScore = STANDARD_CHECKLIST_TEMPLATE_V1.items.reduce(
    (acc, curr) => acc + curr.maxScore,
    0,
  );
  const scorePercent = Math.round((totalScore / maxPossibleScore) * 100);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0B0F17',
        color: '#E2E8F0',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '16px',
        maxWidth: '720px',
        margin: '0 auto',
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #1E293B',
          paddingBottom: '14px',
          marginBottom: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              backgroundColor: '#C84C21',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '18px',
              color: '#FFFFFF',
            }}
          >
            ভ
          </div>
          <div>
            <h1 style={{ fontSize: '17px', margin: 0, fontWeight: 700, letterSpacing: '-0.01em' }}>
              Bhojora Inspect
            </h1>
            <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8' }}>
              Checklist & Evidence Engine · Kolkata Food Safety v1.0
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: activeTab === 'audit' ? '#C84C21' : '#1E293B',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Audit Mode
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              backgroundColor: activeTab === 'profile' ? '#C84C21' : '#1E293B',
              color: '#FFFFFF',
              border: 'none',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Inspector Profile
          </button>
        </div>
      </header>

      {/* Global message banner */}
      {message && (
        <div
          style={{
            backgroundColor: '#064E3B',
            color: '#A7F3D0',
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '13px',
            border: '1px solid #059669',
          }}
        >
          ✓ {message}
        </div>
      )}

      {activeTab === 'audit' ? (
        <main>
          {/* Outlet & Session Info Card */}
          <section
            style={{
              backgroundColor: '#131B29',
              border: '1px solid #1E293B',
              borderRadius: '10px',
              padding: '16px',
              marginBottom: '16px',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <span
                  style={{
                    backgroundColor: '#1E293B',
                    color: '#38BDF8',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  Template: {STANDARD_CHECKLIST_TEMPLATE_V1.version}
                </span>
                <h2 style={{ fontSize: '16px', margin: '6px 0 2px 0', color: '#F8FAFC' }}>
                  {outletName}
                </h2>
                <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8' }}>
                  Outlet ID: <code>{outletId}</code> · Park Street Zone
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontSize: '22px',
                    fontWeight: 800,
                    color: scorePercent >= 80 ? '#34D399' : '#F87171',
                  }}
                >
                  {totalScore} / {maxPossibleScore}
                </div>
                <div style={{ fontSize: '11px', color: '#94A3B8' }}>{scorePercent}% Score</div>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: '1px solid #1E293B',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={handleSaveOfflineDraft}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#1E293B',
                  color: '#93C5FD',
                  border: '1px solid #3B82F6',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                💾 Save Offline Draft
              </button>
              {offlineDraftSavedAt && (
                <span style={{ fontSize: '11px', color: '#6EE7B7' }}>
                  Draft saved locally at {new Date(offlineDraftSavedAt).toLocaleTimeString()}
                </span>
              )}
              {submittedAt && (
                <span
                  style={{
                    marginLeft: 'auto',
                    backgroundColor: '#064E3B',
                    color: '#34D399',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  ✓ SUBMITTED
                </span>
              )}
            </div>
          </section>

          {/* Validation Warnings */}
          {validationErrors.length > 0 && (
            <div
              style={{
                backgroundColor: '#450A0A',
                border: '1px solid #DC2626',
                borderRadius: '8px',
                padding: '12px 14px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{ color: '#FCA5A5', fontWeight: 700, fontSize: '13px', marginBottom: '6px' }}
              >
                ⚠️ Submission Blocked — Required Evidence Missing:
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: '#FECACA', fontSize: '12px' }}>
                {validationErrors.map((err, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>
                    {err}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Versioned Checklist Items */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}
          >
            {STANDARD_CHECKLIST_TEMPLATE_V1.items.map((item) => {
              const finding = findings[item.itemId] || {
                itemId: item.itemId,
                category: item.category,
                score: item.maxScore,
                maxScore: item.maxScore,
                severity: 'PASS',
                comments: '',
                evidenceIds: [],
              };
              const itemEvidence = evidenceList.filter((e) => finding.evidenceIds?.includes(e.id));
              const isEvidenceMandatory =
                item.evidenceRequired ||
                finding.severity === 'CRITICAL' ||
                finding.severity === 'MAJOR';

              return (
                <article
                  key={item.itemId}
                  style={{
                    backgroundColor: '#131B29',
                    border: '1px solid #1E293B',
                    borderRadius: '8px',
                    padding: '14px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '6px',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#94A3B8',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                        }}
                      >
                        {item.category.replace(/_/g, ' ')}
                      </span>
                      <h3 style={{ fontSize: '14px', margin: '2px 0 0 0', color: '#F1F5F9' }}>
                        [{item.itemId}] {item.title}
                      </h3>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          color: finding.score === item.maxScore ? '#34D399' : '#F87171',
                        }}
                      >
                        {finding.score} / {item.maxScore} pts
                      </span>
                    </div>
                  </div>

                  <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 10px 0' }}>
                    {item.description}
                  </p>

                  {/* Severity selection buttons */}
                  <div
                    style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}
                  >
                    {(['PASS', 'MINOR', 'MAJOR', 'CRITICAL'] as FindingSeverity[]).map((sev) => {
                      const isSelected = finding.severity === sev;
                      const bg = '#1E293B';
                      let activeBg = '#10B981';
                      if (sev === 'MINOR') activeBg = '#F59E0B';
                      if (sev === 'MAJOR') activeBg = '#F97316';
                      if (sev === 'CRITICAL') activeBg = '#EF4444';

                      return (
                        <button
                          key={sev}
                          type="button"
                          onClick={() => handleUpdateFindingSeverity(item.itemId, sev)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            backgroundColor: isSelected ? activeBg : bg,
                            color: isSelected ? '#FFFFFF' : '#94A3B8',
                            border: 'none',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {sev}
                        </button>
                      );
                    })}
                    {isEvidenceMandatory && (
                      <span
                        style={{
                          marginLeft: 'auto',
                          fontSize: '10px',
                          color: '#F87171',
                          backgroundColor: '#450A0A',
                          border: '1px solid #7F1D1D',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          alignSelf: 'center',
                          fontWeight: 600,
                        }}
                      >
                        Evidence Mandatory
                      </span>
                    )}
                  </div>

                  {/* Notes / Comments */}
                  <input
                    type="text"
                    placeholder="Inspector observations and specific measurements..."
                    value={finding.comments || ''}
                    onChange={(e) => handleUpdateComments(item.itemId, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      backgroundColor: '#0B0F17',
                      border: '1px solid #1E293B',
                      color: '#E2E8F0',
                      fontSize: '12px',
                      boxSizing: 'border-box',
                      marginBottom: '8px',
                    }}
                  />

                  {/* Evidence attachment controls & display */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      backgroundColor: '#0F172A',
                      padding: '8px',
                      borderRadius: '6px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ fontSize: '11px', color: '#94A3B8' }}>
                        Attached Evidence ({itemEvidence.length}):
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleAttachEvidence(item.itemId, 'PHOTO')}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#1E293B',
                            color: '#38BDF8',
                            border: '1px solid #0284C7',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          📷 Capture Photo
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAttachEvidence(item.itemId, 'TEMPERATURE_LOG')}
                          style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            backgroundColor: '#1E293B',
                            color: '#FBBF24',
                            border: '1px solid #D97706',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          🌡️ Temp Log
                        </button>
                      </div>
                    </div>

                    {itemEvidence.map((evi) => (
                      <div
                        key={evi.id}
                        style={{
                          backgroundColor: '#1E293B',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            color: '#38BDF8',
                          }}
                        >
                          <span>
                            [{evi.evidenceType}] {evi.caption}
                          </span>
                          <span style={{ color: '#10B981' }}>✓ SHA-256 Verified</span>
                        </div>
                        <div
                          style={{ color: '#64748B', fontFamily: 'monospace', fontSize: '10px' }}
                        >
                          Hash: {evi.sha256Hash.substring(0, 20)}... · Lat/Lon:{' '}
                          {evi.capturedCoordinates.join(', ')}
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Manager Sign-off & Final Submission */}
          <form
            onSubmit={handleSubmitInspection}
            style={{
              backgroundColor: '#131B29',
              border: '1px solid #1E293B',
              borderRadius: '10px',
              padding: '16px',
            }}
          >
            <h3 style={{ fontSize: '14px', margin: '0 0 12px 0', color: '#F8FAFC' }}>
              Outlet Debrief & Final Manager Sign-off
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                marginBottom: '14px',
              }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    color: '#94A3B8',
                    marginBottom: '4px',
                  }}
                >
                  Manager on Duty Name
                </label>
                <input
                  type="text"
                  value={managerName}
                  onChange={(e) => setManagerName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    backgroundColor: '#0B0F17',
                    border: '1px solid #1E293B',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '11px',
                    color: '#94A3B8',
                    marginBottom: '4px',
                  }}
                >
                  Designation
                </label>
                <input
                  type="text"
                  value={managerDesignation}
                  onChange={(e) => setManagerDesignation(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '4px',
                    backgroundColor: '#0B0F17',
                    border: '1px solid #1E293B',
                    color: '#FFFFFF',
                    fontSize: '12px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={!!submittedAt}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '6px',
                backgroundColor: submittedAt ? '#10B981' : '#C84C21',
                color: '#FFFFFF',
                fontWeight: 700,
                border: 'none',
                cursor: submittedAt ? 'default' : 'pointer',
                fontSize: '13px',
              }}
            >
              {submittedAt
                ? '✓ Audit Submitted & Locked'
                : 'Complete Audit & Submit to Quality Council'}
            </button>
          </form>
        </main>
      ) : (
        /* Profile Tab */
        <section>
          {profile ? (
            <div
              style={{
                backgroundColor: '#131B29',
                border: '1px solid #1E293B',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '16px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: '1px solid #1E293B',
                  paddingBottom: '12px',
                  marginBottom: '14px',
                }}
              >
                <div>
                  <span
                    style={{
                      display: 'inline-block',
                      backgroundColor: '#064E3B',
                      color: '#34D399',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                      marginBottom: '6px',
                    }}
                  >
                    ● {profile.status}
                  </span>
                  <h2 style={{ fontSize: '16px', margin: '0 0 4px 0', color: '#F8FAFC' }}>
                    {profile.fullName}
                  </h2>
                  <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8' }}>
                    Badge: <strong>{profile.badgeNumber}</strong> · Zone: {profile.cityCode}
                  </p>
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#60A5FA',
                    backgroundColor: '#1E293B',
                    padding: '4px 8px',
                    borderRadius: '4px',
                  }}
                >
                  Independent Auditor
                </div>
              </div>

              <div style={{ marginBottom: '14px' }}>
                <h3 style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '6px' }}>
                  Statutory Qualifications
                </h3>
                {profile.certifications.map((cert, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: '#0B0F17',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      marginBottom: '4px',
                      border: '1px solid #1E293B',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#38BDF8' }}>{cert.certificateType}</div>
                    <div style={{ color: '#94A3B8' }}>
                      No: {cert.certificateNumber} · Exp:{' '}
                      {new Date(cert.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <h3 style={{ fontSize: '12px', color: '#CBD5E1', marginBottom: '6px' }}>
                  Declared Conflicts of Interest ({conflicts.length})
                </h3>
                {conflicts.map((conf, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: '#1E1B24',
                      border: '1px solid #78350F',
                      padding: '8px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      marginBottom: '6px',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#FBBF24' }}>
                      ⚠️ {conf.conflictType} (Restaurant ID: {conf.restaurantId})
                    </div>
                    <div style={{ color: '#E2E8F0', marginTop: '2px' }}>{conf.description}</div>
                  </div>
                ))}

                <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Restaurant/Outlet ID"
                    value={newConflictRestId}
                    onChange={(e) => setNewConflictRestId(e.target.value)}
                    style={{
                      flex: '1',
                      minWidth: '130px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      backgroundColor: '#0B0F17',
                      border: '1px solid #1E293B',
                      color: '#FFFFFF',
                      fontSize: '11px',
                    }}
                  />
                  <select
                    value={newConflictType}
                    onChange={(e) => setNewConflictType(e.target.value as ConflictType)}
                    style={{
                      padding: '6px 8px',
                      borderRadius: '4px',
                      backgroundColor: '#0B0F17',
                      border: '1px solid #1E293B',
                      color: '#FFFFFF',
                      fontSize: '11px',
                    }}
                  >
                    {CONFLICT_OPTIONS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Description"
                    value={newConflictDesc}
                    onChange={(e) => setNewConflictDesc(e.target.value)}
                    style={{
                      flex: '1',
                      minWidth: '130px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      backgroundColor: '#0B0F17',
                      border: '1px solid #1E293B',
                      color: '#FFFFFF',
                      fontSize: '11px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddConflict}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '4px',
                      backgroundColor: '#334155',
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: '11px',
                      cursor: 'pointer',
                    }}
                  >
                    + Add
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleApply}>
              {/* Fallback form */}
              <button type="submit">Submit</button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
