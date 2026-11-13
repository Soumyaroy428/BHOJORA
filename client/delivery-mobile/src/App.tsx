import React, { useEffect, useState } from 'react';
import type {
  DeliveryDocumentType,
  DeliveryExecutionStep,
  DeliveryIncidentType,
  DeliveryJobOfferDto,
  DeliveryPartnerDto,
  DeliveryShiftStatus,
  KolkataZoneId,
  VehicleType,
} from '@bhojora/shared';
import logoUrl from '../assets/logo.png';

const KOLKATA_ZONES: { id: KolkataZoneId; label: string }[] = [
  { id: 'north', label: 'North Kolkata (Shyambazar / Dum Dum)' },
  { id: 'south', label: 'South Kolkata (Ballygunge / Jadavpur)' },
  { id: 'salt-lake', label: 'Salt Lake (Sector I - V)' },
  { id: 'new-town', label: 'New Town (Action Area I - III)' },
  { id: 'central', label: 'Central Kolkata (Park St / Esplanade)' },
];

const VEHICLE_OPTIONS: { type: VehicleType; label: string }[] = [
  { type: 'MOTORCYCLE', label: 'Motorcycle / Bike (Petrol)' },
  { type: 'SCOOTER', label: 'Scooter (Petrol)' },
  { type: 'ELECTRIC_SCOOTER', label: 'Electric Scooter (EV)' },
  { type: 'BICYCLE', label: 'Bicycle / Cycle' },
];

export function App() {
  const [profile, setProfile] = useState<DeliveryPartnerDto | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [fullName, setFullName] = useState('Soumyadip Saha');
  const [selectedZones, setSelectedZones] = useState<KolkataZoneId[]>(['central', 'salt-lake']);
  const [vehicleType, setVehicleType] = useState<VehicleType>('MOTORCYCLE');
  const [vehicleModel, setVehicleModel] = useState('Hero Splendor Plus');
  const [vehicleReg, setVehicleReg] = useState('WB-02-AK-4421');

  // Document Vault State
  const [docDlNumber, setDocDlNumber] = useState('WB-0220190012345');
  const [docRcNumber, setDocRcNumber] = useState('WB-02-AK-4421');
  const [docPanNumber, setDocPanNumber] = useState('ABCDE1234F');
  const [uploadedDocs, setUploadedDocs] = useState<
    { type: DeliveryDocumentType; numberMasked: string; verified: boolean }[]
  >([
    { type: 'DRIVING_LICENSE', numberMasked: 'XXXXXXXXXXX2345', verified: false },
    { type: 'VEHICLE_RC', numberMasked: 'WBXX-XXXX-4421', verified: false },
    { type: 'PAN_CARD', numberMasked: 'XXXXX1234F', verified: false },
  ]);

  // Bank & Emergency Contact
  const [bankHolder, setBankHolder] = useState('Soumyadip Saha');
  const [bankAccount, setBankAccount] = useState('987654321012');
  const [bankIfsc, setBankIfsc] = useState('HDFC0000128');
  const [bankName, setBankName] = useState('HDFC Bank Park Street');
  const [emergencyName, setEmergencyName] = useState('Anirban Saha');
  const [emergencyPhone, setEmergencyPhone] = useState('+91 98300 12345');
  const [emergencyRel, setEmergencyRel] = useState('Brother');

  // Shift & Availability
  const [shiftStatus, setShiftStatus] = useState<DeliveryShiftStatus>('OFFLINE');
  const [shiftError, setShiftError] = useState<string | null>(null);

  // Checkpoint 19 & 20: Job Inbox, Dispatch & Trip Execution State
  const [activeOffer, setActiveOffer] = useState<DeliveryJobOfferDto | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<DeliveryJobOfferDto | null>(null);
  const [offerCountdown, setOfferCountdown] = useState<number>(45);
  const [tripStep, setTripStep] = useState<DeliveryExecutionStep>('ACCEPTED');
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [selectedIncidentType, setSelectedIncidentType] =
    useState<DeliveryIncidentType>('CUSTOMER_UNREACHABLE');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentReported, setIncidentReported] = useState<string | null>(null);

  useEffect(() => {
    if (!activeOffer) return;
    const interval = setInterval(() => {
      setOfferCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setActiveOffer(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [activeOffer]);

  const handleSimulateIncomingOffer = () => {
    if (shiftStatus !== 'ONLINE') return;
    const mockOffer: DeliveryJobOfferDto = {
      offerId: `dlo_${Date.now()}`,
      orderId: 'ord_kolkata_9842',
      outletId: 'out_600000000000000000000001',
      status: 'OFFERED',
      offeredToPartnerId: profile?.partnerId || 'del_mock_001',
      pickupLocation: {
        name: 'Arsalan Restaurant',
        addressLine: '191 Park Street, Park Circus 7-point crossing',
        landmark: 'Near Quest Mall',
        coordinates: [88.3639, 22.5412],
      },
      dropLocation: {
        name: 'Soumya Roy',
        addressLine: 'Flat 4B, Silver Oak, Salt Lake Sector V',
        landmark: 'Opposite Webel Bhavan',
        coordinates: [88.437, 22.58],
      },
      estimatedDistanceKm: 3.8,
      estimatedDurationMinutes: 24,
      guaranteedPayoutPaise: 9200, // ₹92.00
      offeredAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 45000).toISOString(),
    };
    setActiveOffer(mockOffer);
    setOfferCountdown(45);
  };

  const handleAcceptOffer = () => {
    if (!activeOffer) return;
    const accepted: DeliveryJobOfferDto = {
      ...activeOffer,
      status: 'ACCEPTED',
      acceptedAt: new Date().toISOString(),
    };
    setActiveAssignment(accepted);
    setActiveOffer(null);
    setShiftStatus('ON_DELIVERY');
    setTripStep('ACCEPTED');
    setOtpInput('');
    setOtpError(null);
    setIncidentReported(null);
  };

  const handleDeclineOffer = () => {
    setActiveOffer(null);
  };

  const handleAdvanceStep = (nextStep: DeliveryExecutionStep) => {
    setTripStep(nextStep);
  };

  const handleVerifyOtpAndComplete = () => {
    if (otpInput.trim().length !== 4) {
      setOtpError('Delivery OTP must be exactly 4 digits');
      return;
    }
    setOtpError(null);
    setTripStep('COMPLETED');
    handleCompleteActiveDelivery();
  };

  const handleReportIncident = () => {
    if (!incidentDescription.trim()) return;
    setIncidentReported(`Incident ${selectedIncidentType} logged with dispatch.`);
    setShowIncidentModal(false);
    setIncidentDescription('');
  };

  const handleCompleteActiveDelivery = () => {
    if (!activeAssignment) return;
    setActiveAssignment(null);
    setShiftStatus('ONLINE');
    setTripStep('ACCEPTED');
    setOtpInput('');
    setOtpError(null);
    if (profile) {
      setProfile({
        ...profile,
        totalDeliveries: profile.totalDeliveries + 1,
      });
    }
  };

  const toggleZone = (zoneId: KolkataZoneId) => {
    setSelectedZones((prev) =>
      prev.includes(zoneId) ? prev.filter((z) => z !== zoneId) : [...prev, zoneId],
    );
  };

  const handleUploadDoc = (type: DeliveryDocumentType, rawNum: string) => {
    if (!rawNum.trim()) return;
    const clean = rawNum.replace(/[\s-]/g, '').trim();
    const masked = clean.length > 4 ? `X`.repeat(clean.length - 4) + clean.slice(-4) : clean;
    setUploadedDocs((prev) => [
      ...prev.filter((d) => d.type !== type),
      { type, numberMasked: masked, verified: false },
    ]);
  };

  const handleMockSubmit = () => {
    const mockPartner: DeliveryPartnerDto = {
      partnerId: 'del_mock_001',
      userId: 'usr_mock_partner',
      fullName,
      phoneMasked: '+91 98300 *****',
      email: 'rider@bhojora.in',
      city: 'Kolkata',
      preferredZones: selectedZones,
      vehicle: {
        vehicleType,
        model: vehicleModel,
        registrationNumberMasked: vehicleReg ? `WBXX-XXXX-${vehicleReg.slice(-4)}` : null,
      },
      status: 'UNDER_REVIEW',
      shiftStatus: 'OFFLINE',
      documents: uploadedDocs.map((d, idx) => ({
        documentId: `doc_${idx}`,
        type: d.type,
        documentNumberMasked: d.numberMasked,
        fileUrl: `https://storage.bhojora.in/private/docs/mock_${d.type}.pdf`,
        mimeType: 'application/pdf',
        isPublic: false,
        verificationStatus: 'PENDING_REVIEW',
        rejectionReason: null,
        uploadedAt: new Date().toISOString(),
        verifiedAt: null,
      })),
      bankPayout: {
        accountHolderName: bankHolder,
        accountNumberMasked: `XXXXXXXX${bankAccount.slice(-4)}`,
        ifscCode: bankIfsc,
        bankName,
      },
      emergencyContact: {
        name: emergencyName,
        phoneMasked: '+91 98300 *****',
        relationship: emergencyRel,
      },
      rejectionReason: null,
      rating: 5.0,
      totalDeliveries: 0,
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
      approvedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setProfile(mockPartner);
  };

  const handleSimulateApproval = () => {
    if (!profile) return;
    setProfile({
      ...profile,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      documents: profile.documents.map((d) => ({
        ...d,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date().toISOString(),
      })),
    });
    setShiftStatus('OFFLINE');
    setShiftError(null);
  };

  const handleSimulateRejection = () => {
    if (!profile) return;
    setProfile({
      ...profile,
      status: 'REJECTED',
      rejectionReason: 'Vehicle RC image is unreadable. Please upload a clear photo.',
      reviewedAt: new Date().toISOString(),
    });
  };

  const handleToggleShift = () => {
    setShiftError(null);
    if (!profile || profile.status !== 'APPROVED') {
      setShiftError(
        'Cannot go online: Your partner application is not yet APPROVED by Bhojora Ops.',
      );
      return;
    }

    if (shiftStatus === 'OFFLINE') {
      // Simulate Kolkata location coordinate check [88.3639, 22.5726]
      setShiftStatus('ONLINE');
    } else {
      setShiftStatus('OFFLINE');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'APPROVED':
        return 'badge-approved';
      case 'UNDER_REVIEW':
      case 'SUBMITTED':
        return 'badge-under_review';
      case 'REJECTED':
      case 'SUSPENDED':
        return 'badge-rejected';
      default:
        return 'badge-draft';
    }
  };

  return (
    <div className="mobile-shell">
      {/* Sticky Header */}
      <header className="mobile-header">
        <div className="brand-row">
          <img src={logoUrl} alt="Bhojora Fleet" className="brand-logo-img" />
          <div>
            <div className="brand-title">BHOJORA FLEET</div>
            <div className="brand-subtitle">Delivery Partner Portal</div>
          </div>
        </div>
        <div
          data-testid="header-partner-badge"
          className={`status-badge ${getStatusBadgeClass(profile?.status || 'DRAFT')}`}
        >
          {profile?.status || 'DRAFT'}
        </div>
      </header>

      {/* Main Container */}
      <main className="mobile-content">
        {/* Approved View with Shift Switcher */}
        {profile?.status === 'APPROVED' ? (
          <>
            <div className="shift-card">
              <div
                data-testid="shift-status-toggle"
                className={`shift-toggle-circle ${shiftStatus.toLowerCase()}`}
                onClick={handleToggleShift}
              >
                <span
                  style={{
                    fontSize: '1.4rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {shiftStatus === 'ONLINE' ? 'ONLINE' : 'GO ONLINE'}
                </span>
                <span style={{ fontSize: '0.75rem', marginTop: '4px', opacity: 0.9 }}>
                  {shiftStatus === 'ONLINE' ? 'Tap to Pause' : 'Tap to Start Shift'}
                </span>
              </div>
              <div
                data-testid="shift-status-label"
                style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-secondary)' }}
              >
                Current Shift:{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{shiftStatus}</strong>
              </div>
              {shiftError && (
                <div className="info-alert danger" style={{ width: '100%' }}>
                  {shiftError}
                </div>
              )}
              {shiftStatus === 'ONLINE' && (
                <div className="info-alert success" style={{ width: '100%' }}>
                  ✓ GPS Active: Central Kolkata (88.3639° E, 22.5726° N) • Battery 88% • Ready for
                  dispatches.
                </div>
              )}
            </div>

            {/* Checkpoint 19: Incoming Dispatch Job Offer Modal / Card */}
            {activeOffer && (
              <div data-testid="incoming-job-offer-card" className="job-offer-card">
                <div className="job-header-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.2rem' }}>📦</span>
                    <strong style={{ fontSize: '1rem', color: 'var(--brand-accent)' }}>
                      NEW DELIVERY OFFER
                    </strong>
                  </div>
                  <div data-testid="offer-countdown-timer" className="countdown-timer-badge">
                    ⏱️ {offerCountdown}s
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Guaranteed Payout
                    </span>
                    <div data-testid="offer-payout-amount" className="payout-badge">
                      ₹{(activeOffer.guaranteedPayoutPaise / 100).toFixed(2)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Total Trip
                    </span>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      {activeOffer.estimatedDistanceKm} km • {activeOffer.estimatedDurationMinutes}m
                    </div>
                  </div>
                </div>

                <div className="route-steps">
                  <div className="route-step">
                    <div className="step-marker pickup">1</div>
                    <div className="step-info">
                      <span className="step-title">{activeOffer.pickupLocation.name}</span>
                      <span className="step-address">{activeOffer.pickupLocation.addressLine}</span>
                      {activeOffer.pickupLocation.landmark && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--brand-accent)' }}>
                          📍 {activeOffer.pickupLocation.landmark}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="route-step">
                    <div className="step-marker drop">2</div>
                    <div className="step-info">
                      <span className="step-title">Customer: {activeOffer.dropLocation.name}</span>
                      <span className="step-address">{activeOffer.dropLocation.addressLine}</span>
                      {activeOffer.dropLocation.landmark && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--status-online)' }}>
                          📍 {activeOffer.dropLocation.landmark}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="job-actions-row">
                  <button
                    data-testid="btn-decline-offer"
                    type="button"
                    className="btn-decline"
                    onClick={handleDeclineOffer}
                  >
                    Decline
                  </button>
                  <button
                    data-testid="btn-accept-offer"
                    type="button"
                    className="btn-accept"
                    onClick={handleAcceptOffer}
                  >
                    Accept Job
                  </button>
                </div>
              </div>
            )}

            {/* Active Delivery Trip Card (Checkpoint 20: Execution, Live GPS & Handover Proof) */}
            {activeAssignment && (
              <div
                data-testid="active-delivery-trip-card"
                className="section-card"
                style={{ border: '2px solid var(--status-online)' }}
              >
                <div className="section-title">
                  <span style={{ color: 'var(--status-online)' }}>
                    🚴 ACTIVE TRIP: {tripStep.replace(/_/g, ' ')}
                  </span>
                  <span className="payout-badge" style={{ fontSize: '0.9rem', padding: '4px 8px' }}>
                    ₹{(activeAssignment.guaranteedPayoutPaise / 100).toFixed(2)}
                  </span>
                </div>

                <div
                  style={{
                    backgroundColor: 'rgba(34, 197, 94, 0.08)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    color: 'var(--status-online)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    marginBottom: '10px',
                  }}
                >
                  <span>🛰️</span>
                  <span>
                    <strong>GPS Disclosed Active:</strong> Streaming coordinates only while on this
                    delivery.
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    fontSize: '0.88rem',
                  }}
                >
                  <div>
                    <strong>Pickup:</strong> {activeAssignment.pickupLocation.name}
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {activeAssignment.pickupLocation.addressLine}
                    </div>
                  </div>
                  <div>
                    <strong>Drop:</strong> {activeAssignment.dropLocation.name}
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                      {activeAssignment.dropLocation.addressLine}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Order ID: <code>{activeAssignment.orderId}</code>
                  </div>
                </div>

                {incidentReported && (
                  <div
                    style={{
                      margin: '10px 0',
                      padding: '8px 10px',
                      backgroundColor: 'rgba(234, 179, 8, 0.12)',
                      borderRadius: '6px',
                      fontSize: '0.82rem',
                      color: 'var(--text-primary)',
                    }}
                  >
                    ⚠️ {incidentReported}
                  </div>
                )}

                {/* Execution Step Controls */}
                <div
                  style={{
                    marginTop: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {tripStep === 'ACCEPTED' && (
                    <button
                      data-testid="btn-step-arrive-pickup"
                      type="button"
                      className="btn-primary"
                      style={{ width: '100%' }}
                      onClick={() => handleAdvanceStep('ARRIVED_AT_PICKUP')}
                    >
                      📍 Arrived at Restaurant / Pickup
                    </button>
                  )}

                  {tripStep === 'ARRIVED_AT_PICKUP' && (
                    <button
                      data-testid="btn-step-confirm-pickup"
                      type="button"
                      className="btn-primary"
                      style={{ width: '100%', backgroundColor: '#2563eb' }}
                      onClick={() => handleAdvanceStep('CONFIRMED_PICKUP')}
                    >
                      📦 Confirm Food Picked Up → Out for Delivery
                    </button>
                  )}

                  {tripStep === 'CONFIRMED_PICKUP' && (
                    <button
                      data-testid="btn-step-arrive-drop"
                      type="button"
                      className="btn-primary"
                      style={{ width: '100%', backgroundColor: '#7c3aed' }}
                      onClick={() => handleAdvanceStep('ARRIVED_AT_DROP')}
                    >
                      🏠 Arrived at Customer Location
                    </button>
                  )}

                  {tripStep === 'ARRIVED_AT_DROP' && (
                    <div
                      style={{
                        padding: '12px',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        backgroundColor: 'var(--surface-sunken)',
                      }}
                    >
                      <label
                        className="form-label"
                        style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}
                      >
                        Enter 4-Digit Handover OTP from Customer:
                      </label>
                      <input
                        data-testid="input-delivery-otp"
                        type="text"
                        maxLength={4}
                        placeholder="••••"
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                        style={{
                          width: '100%',
                          padding: '10px',
                          fontSize: '1.25rem',
                          textAlign: 'center',
                          letterSpacing: '8px',
                          borderRadius: '6px',
                          border: otpError ? '2px solid #ef4444' : '1px solid var(--border-subtle)',
                          backgroundColor: 'var(--surface-default)',
                          color: 'var(--text-primary)',
                          marginBottom: '8px',
                        }}
                      />
                      {otpError && (
                        <div style={{ color: '#ef4444', fontSize: '0.78rem', marginBottom: '8px' }}>
                          {otpError}
                        </div>
                      )}
                      <button
                        data-testid="btn-verify-otp-complete"
                        type="button"
                        className="btn-accept"
                        style={{ width: '100%' }}
                        onClick={handleVerifyOtpAndComplete}
                      >
                        ✓ Verify OTP & Complete Handover
                      </button>
                    </div>
                  )}

                  {/* Incident / Exception Trigger */}
                  {!showIncidentModal ? (
                    <button
                      data-testid="btn-trigger-incident"
                      type="button"
                      className="btn-secondary"
                      style={{
                        width: '100%',
                        fontSize: '0.8rem',
                        padding: '8px',
                        marginTop: '4px',
                      }}
                      onClick={() => setShowIncidentModal(true)}
                    >
                      ⚠️ Report Delivery Issue / Exception
                    </button>
                  ) : (
                    <div
                      style={{
                        marginTop: '8px',
                        padding: '10px',
                        borderRadius: '6px',
                        border: '1px dashed #f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.05)',
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: '6px' }}>
                        Report Incident to Dispatch:
                      </div>
                      <select
                        className="form-input"
                        value={selectedIncidentType}
                        onChange={(e) =>
                          setSelectedIncidentType(e.target.value as DeliveryIncidentType)
                        }
                        style={{ marginBottom: '6px' }}
                      >
                        <option value="CUSTOMER_UNREACHABLE">Customer Unreachable</option>
                        <option value="ADDRESS_INCORRECT">Address Incorrect / Inaccessible</option>
                        <option value="RESTAURANT_DELAY">Restaurant Order Delay</option>
                        <option value="VEHICLE_BREAKDOWN">Vehicle Breakdown</option>
                        <option value="ACCIDENT">Road Incident / Accident</option>
                        <option value="ORDER_SPILLAGE">Package Damaged / Spilled</option>
                      </select>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Brief description of the problem"
                        value={incidentDescription}
                        onChange={(e) => setIncidentDescription(e.target.value)}
                        style={{ marginBottom: '8px' }}
                      />
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ flex: 1, fontSize: '0.78rem' }}
                          onClick={() => setShowIncidentModal(false)}
                        >
                          Cancel
                        </button>
                        <button
                          data-testid="btn-submit-incident"
                          type="button"
                          className="btn-primary"
                          style={{ flex: 2, fontSize: '0.78rem', backgroundColor: '#d97706' }}
                          onClick={handleReportIncident}
                        >
                          Submit Report
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Test Simulation Button when Online & Idle */}
            {shiftStatus === 'ONLINE' && !activeOffer && !activeAssignment && (
              <div style={{ textAlign: 'center', margin: '4px 0' }}>
                <button
                  data-testid="btn-simulate-dispatch-offer"
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: '0.85rem', padding: '10px 16px' }}
                  onClick={handleSimulateIncomingOffer}
                >
                  ⚡ Simulate Incoming Job Offer
                </button>
              </div>
            )}

            {/* Rider Performance Stats */}
            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-val">5.0 ★</span>
                <span className="stat-label">Rating</span>
              </div>
              <div className="stat-box">
                <span className="stat-val">{profile.totalDeliveries}</span>
                <span className="stat-label">Deliveries</span>
              </div>
              <div className="stat-box">
                <span className="stat-val">100%</span>
                <span className="stat-label">Acceptance</span>
              </div>
            </div>

            {/* Rider Details & Private Document Vault Card */}
            <div className="section-card">
              <div className="section-title">
                <span>Rider Profile & Vehicle</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--status-online)' }}>
                  ✓ Verified
                </span>
              </div>
              <div
                style={{
                  fontSize: '0.88rem',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div>
                  <strong>Partner:</strong> {profile.fullName}
                </div>
                <div>
                  <strong>Phone:</strong> {profile.phoneMasked}
                </div>
                <div>
                  <strong>Vehicle:</strong> {profile.vehicle.model} ({profile.vehicle.vehicleType})
                </div>
                <div>
                  <strong>Plate:</strong> {profile.vehicle.registrationNumberMasked || 'N/A'}
                </div>
                <div>
                  <strong>Zones:</strong> {profile.preferredZones.join(', ')}
                </div>
              </div>
            </div>

            <div className="section-card">
              <div className="section-title">
                <span>Private KYC Vault</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--brand-accent)' }}>
                  🔒 Private Vault (isPublic: false)
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {profile.documents.map((doc) => (
                  <div
                    key={doc.documentId}
                    className="doc-upload-box"
                    style={{ padding: '10px 14px' }}
                  >
                    <div className="doc-header">
                      <span className="doc-name">{doc.type.replace(/_/g, ' ')}</span>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--status-online)',
                          fontWeight: 700,
                        }}
                      >
                        ✓ {doc.verificationStatus}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Masked Number: <strong>{doc.documentNumberMasked}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : profile?.status === 'UNDER_REVIEW' || profile?.status === 'SUBMITTED' ? (
          /* Under Review Card */
          <div className="hero-card" style={{ textAlign: 'center', alignItems: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: 'oklch(0.75 0.14 85 / 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2rem',
              }}
            >
              ⏳
            </div>
            <h2 className="hero-title">Application Under Review</h2>
            <p className="hero-desc">
              Your delivery partner application and private KYC documents have been submitted and
              are being reviewed by the Bhojora Operations Compliance team.
            </p>
            <div className="info-alert warning" style={{ textAlign: 'left', width: '100%' }}>
              <strong>Zero-Trust Document Vault:</strong> Your Driving License, Vehicle RC, and PAN
              digests are stored securely with HMAC-SHA256 privacy masks.
            </div>

            {/* Sandbox Simulation Actions */}
            <div style={{ marginTop: '16px', display: 'flex', gap: '10px', width: '100%' }}>
              <button
                className="btn-primary"
                style={{ flex: 1, backgroundColor: 'var(--status-online)', color: '#000' }}
                onClick={handleSimulateApproval}
              >
                Simulate Ops Approval
              </button>
              <button
                className="btn-secondary"
                style={{
                  flex: 1,
                  borderColor: 'var(--status-danger)',
                  color: 'var(--status-danger)',
                }}
                onClick={handleSimulateRejection}
              >
                Simulate Rejection
              </button>
            </div>
          </div>
        ) : (
          /* Onboarding Form Steps */
          <>
            <div className="hero-card">
              <h2 className="hero-title">Become a Bhojora Delivery Partner</h2>
              <p className="hero-desc">
                Deliver hygienic meals from Kolkata's audited independent kitchens. Enjoy fair
                per-kilometer earnings, instant payouts, and flexible shifts.
              </p>

              {profile?.status === 'REJECTED' && (
                <div className="info-alert danger">
                  <strong>Application Rejected:</strong> {profile.rejectionReason}
                  <div style={{ marginTop: '6px', fontSize: '0.8rem' }}>
                    Please update your information or documents below and resubmit.
                  </div>
                </div>
              )}

              {/* Progress Steps Indicator */}
              <div className="progress-tracker">
                <div
                  className={`step-item ${currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : ''}`}
                >
                  <div className="step-bubble">1</div>
                  <span className="step-label">Zones</span>
                </div>
                <div
                  className={`step-item ${currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : ''}`}
                >
                  <div className="step-bubble">2</div>
                  <span className="step-label">Vehicle</span>
                </div>
                <div
                  className={`step-item ${currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : ''}`}
                >
                  <div className="step-bubble">3</div>
                  <span className="step-label">Vault</span>
                </div>
                <div
                  className={`step-item ${currentStep === 4 ? 'active' : currentStep > 4 ? 'completed' : ''}`}
                >
                  <div className="step-bubble">4</div>
                  <span className="step-label">Payout</span>
                </div>
              </div>
            </div>

            {/* Step 1: Zones & Profile */}
            {currentStep === 1 && (
              <div data-testid="onboarding-step-1" className="section-card">
                <div className="section-title">Step 1: Partner & Operating Zones</div>
                <div className="form-group">
                  <label className="form-label">Full Legal Name</label>
                  <input
                    data-testid="input-fullname"
                    type="text"
                    className="form-input"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter full legal name"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">City of Operations</label>
                  <input
                    type="text"
                    className="form-input"
                    value="Kolkata (West Bengal)"
                    disabled
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">
                    Preferred Kolkata Delivery Zones (Select 1 or more)
                  </label>
                  <div className="chips-grid">
                    {KOLKATA_ZONES.map((zone) => {
                      const isSel = selectedZones.includes(zone.id);
                      return (
                        <div
                          key={zone.id}
                          data-testid={`zone-chip-${zone.id}`}
                          className={`zone-chip ${isSel ? 'selected' : ''}`}
                          onClick={() => toggleZone(zone.id)}
                        >
                          {isSel ? '✓ ' : '+ '}
                          {zone.label}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Vehicle Details */}
            {currentStep === 2 && (
              <div data-testid="onboarding-step-2" className="section-card">
                <div className="section-title">Step 2: Vehicle Details</div>
                <div className="form-group">
                  <label className="form-label">Vehicle Type</label>
                  <select
                    data-testid="select-vehicle-type"
                    className="form-select"
                    value={vehicleType}
                    onChange={(e) => setVehicleType(e.target.value as VehicleType)}
                  >
                    {VEHICLE_OPTIONS.map((opt) => (
                      <option key={opt.type} value={opt.type}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Vehicle Make & Model</label>
                  <input
                    data-testid="input-vehicle-model"
                    type="text"
                    className="form-input"
                    value={vehicleModel}
                    onChange={(e) => setVehicleModel(e.target.value)}
                    placeholder="e.g. Hero Splendor, Honda Activa, Ather 450X"
                  />
                </div>
                {vehicleType !== 'BICYCLE' && (
                  <div className="form-group">
                    <label className="form-label">
                      Vehicle Registration Number (WB-XX-XX-XXXX)
                    </label>
                    <input
                      data-testid="input-vehicle-reg"
                      type="text"
                      className="form-input"
                      value={vehicleReg}
                      onChange={(e) => setVehicleReg(e.target.value)}
                      placeholder="e.g. WB-02-AK-4421"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Private Document Vault */}
            {currentStep === 3 && (
              <div data-testid="onboarding-step-3" className="section-card">
                <div className="section-title">
                  <span>Step 3: Private Document Vault</span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--brand-accent)' }}>
                    🔒 100% Private (isPublic: false)
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  Documents are stored in a private KYC vault and masked with HMAC-SHA256 digests.
                  Only authorized ops reviewers can inspect them.
                </p>

                {vehicleType !== 'BICYCLE' && (
                  <>
                    <div className="doc-upload-box">
                      <div className="doc-header">
                        <span className="doc-name">1. Driving License</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--status-pending)' }}>
                          Required
                        </span>
                      </div>
                      <input
                        data-testid="input-doc-number-DRIVING_LICENSE"
                        type="text"
                        className="form-input"
                        value={docDlNumber}
                        onChange={(e) => setDocDlNumber(e.target.value)}
                        placeholder="Enter Driving License Number"
                      />
                      <button
                        data-testid="btn-upload-doc-DRIVING_LICENSE"
                        className="btn-secondary"
                        onClick={() => handleUploadDoc('DRIVING_LICENSE', docDlNumber)}
                      >
                        ✓ Attach & Hash DL Document
                      </button>
                    </div>

                    <div className="doc-upload-box">
                      <div className="doc-header">
                        <span className="doc-name">2. Vehicle RC</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--status-pending)' }}>
                          Required
                        </span>
                      </div>
                      <input
                        data-testid="input-doc-number-VEHICLE_RC"
                        type="text"
                        className="form-input"
                        value={docRcNumber}
                        onChange={(e) => setDocRcNumber(e.target.value)}
                        placeholder="Enter Vehicle RC Number"
                      />
                      <button
                        data-testid="btn-upload-doc-VEHICLE_RC"
                        className="btn-secondary"
                        onClick={() => handleUploadDoc('VEHICLE_RC', docRcNumber)}
                      >
                        ✓ Attach & Hash RC Document
                      </button>
                    </div>
                  </>
                )}

                <div className="doc-upload-box">
                  <div className="doc-header">
                    <span className="doc-name">3. PAN Card</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--status-pending)' }}>
                      Required for Payouts
                    </span>
                  </div>
                  <input
                    data-testid="input-doc-number-PAN_CARD"
                    type="text"
                    className="form-input"
                    value={docPanNumber}
                    onChange={(e) => setDocPanNumber(e.target.value)}
                    placeholder="Enter 10-digit PAN (e.g. ABCDE1234F)"
                  />
                  <button
                    data-testid="btn-upload-doc-PAN_CARD"
                    className="btn-secondary"
                    onClick={() => handleUploadDoc('PAN_CARD', docPanNumber)}
                  >
                    ✓ Attach & Hash PAN Card
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Bank Payout & Emergency Contact */}
            {currentStep === 4 && (
              <div data-testid="onboarding-step-4" className="section-card">
                <div className="section-title">Step 4: Payout & Emergency Contact</div>
                <div className="form-group">
                  <label className="form-label">Bank Account Holder Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={bankHolder}
                    onChange={(e) => setBankHolder(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Bank Account Number</label>
                  <input
                    data-testid="input-bank-acc"
                    type="text"
                    className="form-input"
                    value={bankAccount}
                    onChange={(e) => setBankAccount(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">IFSC Code (11 alphanumeric)</label>
                  <input
                    data-testid="input-bank-ifsc"
                    type="text"
                    className="form-input"
                    value={bankIfsc}
                    onChange={(e) => setBankIfsc(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Bank Name & Branch</label>
                  <input
                    type="text"
                    className="form-input"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  />
                </div>

                <hr style={{ borderColor: 'var(--border-subtle)', margin: '12px 0' }} />

                <div className="section-title" style={{ fontSize: '0.92rem' }}>
                  Emergency Contact (Safety First)
                </div>
                <div className="form-group">
                  <label className="form-label">Emergency Contact Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Emergency Contact Phone</label>
                  <input
                    type="text"
                    className="form-input"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Relationship</label>
                  <input
                    type="text"
                    className="form-input"
                    value={emergencyRel}
                    onChange={(e) => setEmergencyRel(e.target.value)}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* Persistent Bottom Action Bar */}
      {(!profile || profile.status === 'DRAFT' || profile.status === 'REJECTED') && (
        <footer className="bottom-action-bar">
          {currentStep > 1 && (
            <button
              className="btn-secondary"
              style={{ flex: 1 }}
              onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
            >
              Back
            </button>
          )}
          {currentStep < 4 ? (
            <button
              data-testid="btn-step-next"
              className="btn-primary"
              style={{ flex: 2 }}
              onClick={() => setCurrentStep((prev) => Math.min(4, prev + 1))}
            >
              Continue to Step {currentStep + 1} →
            </button>
          ) : (
            <button
              data-testid="btn-submit-application"
              className="btn-primary"
              style={{ flex: 2 }}
              onClick={handleMockSubmit}
            >
              Submit Application For Review 🚀
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

export default App;
