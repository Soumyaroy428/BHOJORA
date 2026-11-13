import React, { useState } from 'react';
import type {
  CertificateType,
  ConflictType,
  InspectorConflictDeclaration,
  InspectorProfile,
} from '@bhojora/shared';

const CERT_OPTIONS: { value: CertificateType; label: string }[] = [
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

export default function App(): React.JSX.Element {
  const [profile, setProfile] = useState<InspectorProfile | null>(null);
  const [fullName, setFullName] = useState('Dr. Anirban Mukherjee');
  const [phone, setPhone] = useState('+919830123456');
  const [certType, setCertType] = useState<CertificateType>('FSSAI_FOSTAC');
  const [certNumber, setCertNumber] = useState('FSSAI-WB-2024-9842');
  const [authority, setAuthority] = useState('Food Safety and Standards Authority of India');
  const [expiryDate, setExpiryDate] = useState('2028-12-31');

  // Conflict declaration
  const [conflicts, setConflicts] = useState<InspectorConflictDeclaration[]>([
    {
      restaurantId: 'rest_mocambo_park_st',
      outletId: 'out_mocambo_main',
      conflictType: 'PREVIOUS_EMPLOYMENT',
      description: 'Consulted as external hygiene adviser in 2023',
      declaredAt: new Date().toISOString(),
    },
  ]);
  const [newConflictRestId, setNewConflictRestId] = useState('');
  const [newConflictType, setNewConflictType] = useState<ConflictType>('PREVIOUS_EMPLOYMENT');
  const [newConflictDesc, setNewConflictDesc] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    // Simulated local registration for UI testing
    setTimeout(() => {
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
      setLoading(false);
      setMessage('Inspector application submitted & verified for Kolkata jurisdiction.');
    }, 400);
  };

  const handleAddConflict = () => {
    if (!newConflictRestId.trim() || !newConflictDesc.trim()) return;
    const newEntry: InspectorConflictDeclaration = {
      restaurantId: newConflictRestId.trim(),
      conflictType: newConflictType,
      description: newConflictDesc.trim(),
      declaredAt: new Date().toISOString(),
    };
    setConflicts([...conflicts, newEntry]);
    setNewConflictRestId('');
    setNewConflictDesc('');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0F141C',
        color: '#E8ECF2',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '20px 16px',
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid #243042',
          paddingBottom: '16px',
          marginBottom: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              backgroundColor: '#C84C21',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '20px',
              color: '#FFFFFF',
            }}
          >
            ভ
          </div>
          <div>
            <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Bhojora Inspect
            </h1>
            <p style={{ margin: 0, fontSize: '12px', color: '#8E9EAF' }}>
              Independent Food Safety & Hygiene Audits · Kolkata
            </p>
          </div>
        </div>
        <span
          style={{
            fontSize: '11px',
            backgroundColor: '#1E293B',
            color: '#34D399',
            padding: '4px 8px',
            borderRadius: '999px',
            fontWeight: 600,
            border: '1px solid #10B981',
          }}
        >
          ADR-005 Certified
        </span>
      </header>

      {message && (
        <div
          style={{
            backgroundColor: '#064E3B',
            color: '#A7F3D0',
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            border: '1px solid #059669',
          }}
        >
          ✓ {message}
        </div>
      )}

      {profile ? (
        <section
          style={{
            backgroundColor: '#161F2E',
            border: '1px solid #2B3A4F',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '1px solid #243042',
              paddingBottom: '14px',
              marginBottom: '16px',
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
              <h2 style={{ fontSize: '18px', margin: '0 0 4px 0', color: '#F8FAFC' }}>
                {profile.fullName}
              </h2>
              <p style={{ margin: 0, fontSize: '12px', color: '#94A3B8' }}>
                Badge: <strong>{profile.badgeNumber}</strong> · Zone: {profile.cityCode}
              </p>
            </div>
            <div
              style={{
                textAlign: 'right',
                fontSize: '12px',
                color: '#60A5FA',
                backgroundColor: '#1E293B',
                padding: '6px 10px',
                borderRadius: '6px',
              }}
            >
              Independent Auditor
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ fontSize: '13px', color: '#CBD5E1', marginBottom: '8px' }}>
              Qualifications & Statutory Certifications
            </h3>
            {profile.certifications.map((cert, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: '#0F172A',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  marginBottom: '6px',
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
            <h3 style={{ fontSize: '13px', color: '#CBD5E1', marginBottom: '8px' }}>
              Declared Conflicts of Interest ({profile.conflicts.length})
            </h3>
            {profile.conflicts.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#64748B' }}>
                No commercial or personal conflicts declared.
              </p>
            ) : (
              profile.conflicts.map((conf, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: '#1E1B24',
                    border: '1px solid #78350F',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    marginBottom: '6px',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#FBBF24' }}>
                    ⚠️ {conf.conflictType} (Restaurant ID: {conf.restaurantId})
                  </div>
                  <div style={{ color: '#E2E8F0', marginTop: '2px' }}>{conf.description}</div>
                </div>
              ))
            )}
          </div>

          <div
            style={{
              marginTop: '18px',
              padding: '12px',
              backgroundColor: '#1C1917',
              border: '1px dashed #D97706',
              borderRadius: '8px',
              fontSize: '11px',
              color: '#FDE68A',
              lineHeight: 1.5,
            }}
          >
            <strong>Independence & Separation of Duties (ADR-005):</strong>
            <br />
            Auditors can never self-approve reports. All submitted assessments undergo review by the
            Bhojora Control panel. Audits matching declared conflicts are permanently disqualified
            from assignment.
          </div>
        </section>
      ) : (
        <form
          onSubmit={handleApply}
          style={{
            backgroundColor: '#161F2E',
            border: '1px solid #2B3A4F',
            borderRadius: '12px',
            padding: '20px',
            marginBottom: '24px',
          }}
        >
          <h2 style={{ fontSize: '16px', margin: '0 0 16px 0', color: '#F8FAFC' }}>
            Inspector Onboarding & Qualification Declaration
          </h2>

          <div style={{ marginBottom: '14px' }}>
            <label
              style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}
            >
              Full Name (as per statutory credentials)
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                color: '#FFFFFF',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label
              style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}
            >
              Mobile Phone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                color: '#FFFFFF',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label
              style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}
            >
              Primary Food Safety Qualification
            </label>
            <select
              value={certType}
              onChange={(e) => setCertType(e.target.value as CertificateType)}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                color: '#FFFFFF',
                boxSizing: 'border-box',
              }}
            >
              {CERT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '14px',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: '#94A3B8',
                  marginBottom: '4px',
                }}
              >
                Certificate Number
              </label>
              <input
                type="text"
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#0F172A',
                  border: '1px solid #334155',
                  color: '#FFFFFF',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  color: '#94A3B8',
                  marginBottom: '4px',
                }}
              >
                Expiry Date
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                required
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#0F172A',
                  border: '1px solid #334155',
                  color: '#FFFFFF',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label
              style={{ display: 'block', fontSize: '12px', color: '#94A3B8', marginBottom: '4px' }}
            >
              Issuing Organization / Authority
            </label>
            <input
              type="text"
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '6px',
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                color: '#FFFFFF',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Conflict of interest section */}
          <div
            style={{
              borderTop: '1px solid #243042',
              paddingTop: '14px',
              marginBottom: '16px',
            }}
          >
            <h3 style={{ fontSize: '13px', color: '#FBBF24', margin: '0 0 8px 0' }}>
              Conflict of Interest Declaration
            </h3>
            <p style={{ fontSize: '12px', color: '#94A3B8', margin: '0 0 10px 0' }}>
              Declare any restaurant affiliations, past employment, or personal ties to prevent
              disqualification.
            </p>

            {conflicts.map((c, i) => (
              <div
                key={i}
                style={{
                  backgroundColor: '#0F172A',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  fontSize: '11px',
                  marginBottom: '6px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span>
                  <strong>{c.conflictType}</strong>: {c.restaurantId} ({c.description})
                </span>
                <button
                  type="button"
                  onClick={() => setConflicts(conflicts.filter((_, idx) => idx !== i))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#EF4444',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  ✕
                </button>
              </div>
            ))}

            <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Restaurant/Outlet ID (e.g. rest_aroma)"
                value={newConflictRestId}
                onChange={(e) => setNewConflictRestId(e.target.value)}
                style={{
                  flex: '1',
                  minWidth: '140px',
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: '#0F172A',
                  border: '1px solid #334155',
                  color: '#FFFFFF',
                  fontSize: '12px',
                }}
              />
              <select
                value={newConflictType}
                onChange={(e) => setNewConflictType(e.target.value as ConflictType)}
                style={{
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: '#0F172A',
                  border: '1px solid #334155',
                  color: '#FFFFFF',
                  fontSize: '12px',
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
                placeholder="Description of relationship"
                value={newConflictDesc}
                onChange={(e) => setNewConflictDesc(e.target.value)}
                style={{
                  flex: '1',
                  minWidth: '140px',
                  padding: '8px',
                  borderRadius: '6px',
                  backgroundColor: '#0F172A',
                  border: '1px solid #334155',
                  color: '#FFFFFF',
                  fontSize: '12px',
                }}
              />
              <button
                type="button"
                onClick={handleAddConflict}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  backgroundColor: '#334155',
                  color: '#FFFFFF',
                  border: 'none',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                + Add Conflict
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '8px',
              backgroundColor: '#C84C21',
              color: '#FFFFFF',
              fontWeight: 700,
              border: 'none',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Submitting Application...' : 'Submit Inspector Application'}
          </button>
        </form>
      )}
    </div>
  );
}
