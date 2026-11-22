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

type AuthMode = 'LANDING' | 'LOGIN' | 'ONBOARD' | 'AUTHENTICATED';
type FleetTab = 'DISPATCH' | 'EARNINGS' | 'PERFORMANCE' | 'PROFILE' | 'SUPPORT';

const DEFAULT_DEMO_PARTNER: DeliveryPartnerDto = {
  partnerId: 'del_kolkata_8821',
  userId: 'usr_rider_soumyadip',
  fullName: 'Soumyadip Saha',
  phoneMasked: '+91 98300 12345',
  email: 'rider@bhojora.in',
  city: 'Kolkata',
  preferredZones: ['central', 'salt-lake', 'new-town'],
  vehicle: {
    vehicleType: 'MOTORCYCLE',
    model: 'Hero Splendor Plus',
    registrationNumberMasked: 'WBXX-XXXX-4421',
  },
  status: 'APPROVED',
  shiftStatus: 'OFFLINE',
  documents: [
    {
      documentId: 'doc_dl_001',
      type: 'DRIVING_LICENSE',
      documentNumberMasked: 'XXXXXXXXXXX2345',
      fileUrl: 'https://storage.bhojora.in/private/docs/mock_dl.pdf',
      mimeType: 'application/pdf',
      isPublic: false,
      verificationStatus: 'VERIFIED',
      rejectionReason: null,
      uploadedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      verifiedAt: new Date(Date.now() - 86400000 * 29).toISOString(),
    },
    {
      documentId: 'doc_rc_002',
      type: 'VEHICLE_RC',
      documentNumberMasked: 'WBXX-XXXX-4421',
      fileUrl: 'https://storage.bhojora.in/private/docs/mock_rc.pdf',
      mimeType: 'application/pdf',
      isPublic: false,
      verificationStatus: 'VERIFIED',
      rejectionReason: null,
      uploadedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      verifiedAt: new Date(Date.now() - 86400000 * 29).toISOString(),
    },
    {
      documentId: 'doc_pan_003',
      type: 'PAN_CARD',
      documentNumberMasked: 'XXXXX1234F',
      fileUrl: 'https://storage.bhojora.in/private/docs/mock_pan.pdf',
      mimeType: 'application/pdf',
      isPublic: false,
      verificationStatus: 'VERIFIED',
      rejectionReason: null,
      uploadedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
      verifiedAt: new Date(Date.now() - 86400000 * 29).toISOString(),
    },
  ],
  bankPayout: {
    accountHolderName: 'Soumyadip Saha',
    accountNumberMasked: 'XXXXXXXX1012',
    ifscCode: 'HDFC0000128',
    bankName: 'HDFC Bank Park Street',
  },
  emergencyContact: {
    name: 'Anirban Saha',
    phoneMasked: '+91 98300 54321',
    relationship: 'Brother',
  },
  rejectionReason: null,
  rating: 4.95,
  totalDeliveries: 248,
  submittedAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  reviewedAt: new Date(Date.now() - 86400000 * 29).toISOString(),
  approvedAt: new Date(Date.now() - 86400000 * 29).toISOString(),
  createdAt: new Date(Date.now() - 86400000 * 30).toISOString(),
  updatedAt: new Date().toISOString(),
};

export function App() {
  const [authMode, setAuthMode] = useState<AuthMode>('LANDING');
  const [profile, setProfile] = useState<DeliveryPartnerDto | null>(null);
  const [activeTab, setActiveTab] = useState<FleetTab>('DISPATCH');

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('rider@bhojora.in');
  const [loginPassword, setLoginPassword] = useState('BhojoraRider@2026!');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Onboarding wizard state
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [fullName, setFullName] = useState('Soumyadip Saha');
  const [phone, setPhone] = useState('+91 98300 12345');
  const [email, setEmail] = useState('rider@bhojora.in');
  const [selectedZones, setSelectedZones] = useState<KolkataZoneId[]>(['central', 'salt-lake']);
  const [vehicleType, setVehicleType] = useState<VehicleType>('MOTORCYCLE');
  const [vehicleModel, setVehicleModel] = useState('Hero Splendor Plus');
  const [vehicleReg, setVehicleReg] = useState('WB-02-AK-4421');
  const [hasHelmet, setHasHelmet] = useState(true);

  // Document Vault State
  const [docDlNumber, setDocDlNumber] = useState('WB-0220190012345');
  const [docRcNumber, setDocRcNumber] = useState('WB-02-AK-4421');
  const [docPanNumber, setDocPanNumber] = useState('ABCDE1234F');
  const [hasThermalBag, setHasThermalBag] = useState(true);
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
  const [emergencyPhone, setEmergencyPhone] = useState('+91 98300 54321');
  const [emergencyRel, setEmergencyRel] = useState('Brother');

  // Shift & Dispatch State
  const [shiftStatus, setShiftStatus] = useState<DeliveryShiftStatus>('OFFLINE');
  const [shiftError, setShiftError] = useState<string | null>(null);
  const [activeOffer, setActiveOffer] = useState<DeliveryJobOfferDto | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<DeliveryJobOfferDto | null>(null);
  const [offerCountdown, setOfferCountdown] = useState<number>(45);
  const [tripStep, setTripStep] = useState<DeliveryExecutionStep>('ACCEPTED');
  const [otpInput, setOtpInput] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [deliveryCompleteMessage, setDeliveryCompleteMessage] = useState<string | null>(null);

  // Incident & SOS Modal
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [selectedIncidentType, setSelectedIncidentType] =
    useState<DeliveryIncidentType>('CUSTOMER_UNREACHABLE');
  const [incidentDescription, setIncidentDescription] = useState('');
  const [incidentReported, setIncidentReported] = useState<string | null>(null);
  const [sosTriggered, setSosTriggered] = useState(false);
  const [cashoutNotice, setCashoutNotice] = useState<string | null>(null);

  // Offer Countdown Timer Effect
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

  // -------------------------------------------------------------
  // Auth Handlers
  // -------------------------------------------------------------
  const handlePartnerLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const id = loginIdentifier.trim().toLowerCase();
    const pw = loginPassword.trim();

    if (!id || !pw) {
      setLoginError('Please enter your registered phone or email and password.');
      return;
    }

    // Authenticate with demo courier or credentials
    setProfile(DEFAULT_DEMO_PARTNER);
    setShiftStatus('OFFLINE');
    setAuthMode('AUTHENTICATED');
    setActiveTab('DISPATCH');
  };

  const handleAutofillDemoCourier = () => {
    setLoginIdentifier('rider@bhojora.in');
    setLoginPassword('BhojoraRider@2026!');
    setLoginError(null);
  };

  const handleSignOut = () => {
    setProfile(null);
    setShiftStatus('OFFLINE');
    setActiveOffer(null);
    setActiveAssignment(null);
    setAuthMode('LANDING');
  };

  // -------------------------------------------------------------
  // Dispatch & Trip Handlers
  // -------------------------------------------------------------
  const handleToggleShift = () => {
    setShiftError(null);
    if (!profile || profile.status !== 'APPROVED') {
      setShiftError(
        'Cannot go online: Your partner application is not yet APPROVED by Bhojora Ops.',
      );
      return;
    }

    if (shiftStatus === 'OFFLINE') {
      setShiftStatus('ONLINE');
    } else {
      setShiftStatus('OFFLINE');
      setActiveOffer(null);
    }
  };

  const handleSimulateIncomingOffer = () => {
    if (shiftStatus !== 'ONLINE') return;
    const mockOffer: DeliveryJobOfferDto = {
      offerId: `dlo_${Date.now()}`,
      orderId: 'ord_kolkata_9842',
      outletId: 'out_600000000000000000000001',
      status: 'OFFERED',
      offeredToPartnerId: profile?.partnerId || 'del_mock_001',
      pickupLocation: {
        name: 'Arsalan Restaurant (Park Circus)',
        addressLine: '191 Park Street, 7-point crossing',
        landmark: 'Near Quest Mall',
        coordinates: [88.3639, 22.5412],
      },
      dropLocation: {
        name: 'Soumya Roy',
        addressLine: 'Flat 4B, Silver Oak, Sector V, Salt Lake',
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
    setDeliveryCompleteMessage(null);
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
    setDeliveryCompleteMessage(
      `✓ Delivery Completed! ₹${((activeAssignment?.guaranteedPayoutPaise || 9200) / 100).toFixed(2)} credited to your wallet (100% tips included).`,
    );

    setActiveAssignment(null);
    setShiftStatus('ONLINE');
    setOtpInput('');

    if (profile) {
      setProfile({
        ...profile,
        totalDeliveries: profile.totalDeliveries + 1,
      });
    }
  };

  const handleReportIncident = () => {
    if (!incidentDescription.trim()) return;
    setIncidentReported(`Incident ${selectedIncidentType} logged with 24x7 central dispatch.`);
    setShowIncidentModal(false);
    setIncidentDescription('');
  };

  const handleTriggerSos = () => {
    setSosTriggered(true);
    setShiftError(
      '🚨 EMERGENCY SOS DISPATCHED: Live GPS transmitted to Kolkata Police (112) & Bhojora Safety Desk.',
    );
  };

  const handleTriggerInstantCashout = () => {
    setCashoutNotice(
      '✓ Instant Payout Executed: ₹844.00 transferred via IMPS to HDFC Bank (A/C: XXXXXXXX1012). UTR: HDFC202611228812',
    );
    setTimeout(() => setCashoutNotice(null), 6000);
  };

  // -------------------------------------------------------------
  // Onboarding Handlers
  // -------------------------------------------------------------
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
      { type, numberMasked: masked, verified: true },
    ]);
  };

  const handleMockSubmit = () => {
    const mockPartner: DeliveryPartnerDto = {
      partnerId: `del_kolkata_${Math.floor(1000 + Math.random() * 9000)}`,
      userId: 'usr_new_rider',
      fullName,
      phoneMasked: phone,
      email,
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
        phoneMasked: emergencyPhone,
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
    const approved: DeliveryPartnerDto = {
      ...profile,
      status: 'APPROVED',
      approvedAt: new Date().toISOString(),
      reviewedAt: new Date().toISOString(),
      documents: profile.documents.map((d) => ({
        ...d,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date().toISOString(),
      })),
    };
    setProfile(approved);
    setShiftStatus('OFFLINE');
    setShiftError(null);
    setAuthMode('AUTHENTICATED');
    setActiveTab('DISPATCH');
  };

  const handleSimulateRejection = () => {
    if (!profile) return;
    setProfile({
      ...profile,
      status: 'REJECTED',
      rejectionReason: 'Driving license image is unreadable. Please update your document number.',
      reviewedAt: new Date().toISOString(),
    });
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

  // =========================================================================
  // VIEW 1: DEDICATED FLEET LANDING PAGE (UNAUTHENTICATED)
  // =========================================================================
  if (authMode === 'LANDING') {
    return (
      <div className="fleet-shell">
        <header className="mobile-header">
          <div className="brand-row">
            <img src={logoUrl} alt="Bhojora Fleet emblem" className="brand-logo-img" />
            <div>
              <div className="brand-title">BHOJORA FLEET</div>
              <div className="brand-subtitle">Kolkata Delivery Courier Portal</div>
            </div>
          </div>
          <div className="header-auth-actions">
            <button
              type="button"
              className="btn-header-signin"
              onClick={() => setAuthMode('LOGIN')}
            >
              🔑 Sign In
            </button>
            <button
              type="button"
              className="btn-header-apply"
              onClick={() => setAuthMode('ONBOARD')}
            >
              🚀 Apply
            </button>
          </div>
        </header>

        <main className="mobile-content">
          {/* Landing Hero */}
          <section className="fleet-landing-hero">
            <div className="fleet-hero-badge">🛵 Kolkata Delivery Partner Network</div>
            <h1 className="fleet-hero-heading">
              Deliver with Dignity, Fair Pay &amp; Zero Deductions
            </h1>
            <p className="fleet-hero-sub">
              Join Kolkata&apos;s independent delivery courier network. Deliver freshly prepared
              meals from verified kitchens across strict 5.5–6.0 km corridors with 100% tip
              pass-through and daily T+1 payouts.
            </p>

            <div className="fleet-hero-actions">
              <button
                type="button"
                className="btn-primary"
                style={{ flex: 1.4, padding: '14px', fontSize: '1rem' }}
                onClick={() => setAuthMode('ONBOARD')}
              >
                Apply as Delivery Partner 🚀
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1, padding: '14px', fontSize: '0.95rem' }}
                onClick={() => setAuthMode('LOGIN')}
              >
                Existing Partner Login
              </button>
            </div>
          </section>

          {/* 4 Core Value Propositions */}
          <div className="fleet-benefits-grid">
            <article className="fleet-benefit-card">
              <div className="benefit-icon">💸</div>
              <h3>100% Tip Pass-Through</h3>
              <p>
                Zero commission on courier tips. 100% of the customer gratuity is credited directly
                to your payout ledger.
              </p>
            </article>

            <article className="fleet-benefit-card">
              <div className="benefit-icon">📍</div>
              <h3>5.5–6.0 km Strict Bounds</h3>
              <p>
                No exhausting 15 km long-distance trips. Strict corridor boundaries preserve food
                heat and your vehicle fuel.
              </p>
            </article>

            <article className="fleet-benefit-card">
              <div className="benefit-icon">⚡</div>
              <h3>Transparent Payouts</h3>
              <p>
                ₹40 base fee + ₹12/km distance + ₹20 peak surge + ₹1/min wait fee. Daily T+1 bank
                transfers or instant UPI cashout.
              </p>
            </article>

            <article className="fleet-benefit-card">
              <div className="benefit-icon">🛡️</div>
              <h3>Cashless Insurance</h3>
              <p>
                Up to ₹5,00,000 cashless accident and medical coverage across Apollo, AMRI, and
                Woodlands hospitals in Kolkata.
              </p>
            </article>
          </div>

          {/* Operating Kolkata Corridors */}
          <section className="section-card">
            <div className="section-title">
              <span>Active Kolkata Corridors</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--status-online)' }}>
                ● 5 Corridors Active
              </span>
            </div>
            <div className="corridor-pills-row">
              <span className="corridor-pill">📍 Salt Lake Sector V</span>
              <span className="corridor-pill">📍 Park Street &amp; Esplanade</span>
              <span className="corridor-pill">📍 Ballygunge &amp; Jadavpur</span>
              <span className="corridor-pill">📍 New Town Action Area I-III</span>
              <span className="corridor-pill">📍 Shyambazar &amp; Dum Dum</span>
            </div>
          </section>

          {/* Policy 1: Transparent Earning Formula & 100% Tips */}
          <section className="fleet-policy-card">
            <div className="fleet-policy-header">
              <span className="fleet-policy-icon">💵</span>
              <h3 className="fleet-policy-title">
                Transparent Earning Formula &amp; 100% Direct Tips
              </h3>
            </div>
            <p className="fleet-policy-desc">
              Every single rupee you earn is calculated with complete transparency. We never take
              commissions on your tips or hide arbitrary deductions.
            </p>
            <table className="earning-formula-table" aria-label="Earning formula rate card">
              <thead>
                <tr>
                  <th>Earning Component</th>
                  <th>Kolkata Fleet Rate</th>
                  <th>Settlement Schedule</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Base Pickup &amp; Delivery</td>
                  <td className="rate-highlight">₹40.00 / trip</td>
                  <td>Covers first 2.0 km corridor</td>
                </tr>
                <tr>
                  <td>Distance Fare (Beyond 2 km)</td>
                  <td className="rate-highlight">₹12.00 / km</td>
                  <td>Strict 5.5–6.0 km bounds</td>
                </tr>
                <tr>
                  <td>Peak Hour Surge Bonus</td>
                  <td className="rate-highlight">+₹20.00 / trip</td>
                  <td>Lunch 12:30–15:00 &amp; Dinner 19:30–23:00</td>
                </tr>
                <tr>
                  <td>Kitchen Wait Time (After 10m)</td>
                  <td className="rate-highlight">₹1.00 / min</td>
                  <td>Automatic GPS geofence timer</td>
                </tr>
                <tr>
                  <td>Diner Tips Pass-Through</td>
                  <td className="rate-highlight">100% Direct</td>
                  <td>Zero platform commission cut</td>
                </tr>
                <tr>
                  <td>Payout Settlement Cycle</td>
                  <td className="rate-highlight">Daily T+1 / Instant</td>
                  <td>Midnight bank transfer or 1-tap UPI cashout</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* Policy 2: Strict Geographical Bounds Policy */}
          <section className="fleet-policy-card">
            <div className="fleet-policy-header">
              <span className="fleet-policy-icon">🧭</span>
              <h3 className="fleet-policy-title">Strict 5.5–6.0 km Corridor Policy</h3>
            </div>
            <p className="fleet-policy-desc">
              We respect your safety and vehicle fuel. You are never assigned exhausting 15–20 km
              cross-city trips. Deliveries remain strictly bounded within your selected Kolkata
              cluster to preserve food heat and reduce rider fatigue.
            </p>
            <div className="corridor-pills-row" style={{ marginTop: '8px' }}>
              <span className="corridor-pill">📍 Salt Lake (Sector I - V)</span>
              <span className="corridor-pill">📍 Park Street &amp; Esplanade</span>
              <span className="corridor-pill">📍 South Kolkata (Ballygunge / Jadavpur)</span>
              <span className="corridor-pill">📍 New Town (Action Area I - III)</span>
              <span className="corridor-pill">📍 North Kolkata (Shyambazar / Dum Dum)</span>
            </div>
          </section>

          {/* Policy 3: Cashless Health & Accidental Hospital Insurance Policy */}
          <section className="fleet-policy-card">
            <div className="fleet-policy-header">
              <span className="fleet-policy-icon">🏥</span>
              <h3 className="fleet-policy-title">
                ₹5,00,000 Cashless Hospital &amp; Accidental Insurance
              </h3>
            </div>
            <p className="fleet-policy-desc">
              From the exact moment you toggle your shift to <strong>ONLINE</strong>, you are
              covered under our comprehensive cashless accidental, hospitalization, and emergency
              medical policy with zero out-of-pocket hospital deposits.
            </p>
            <div className="hospital-pills-row">
              <span className="hospital-pill">🏥 Apollo Gleneagles (EM Bypass)</span>
              <span className="hospital-pill">🏥 AMRI Hospitals (Dhakuria &amp; Salt Lake)</span>
              <span className="hospital-pill">🏥 Woodlands Multispeciality (Alipore)</span>
              <span className="hospital-pill">🏥 Fortis Hospital (Anandapur)</span>
            </div>
          </section>

          {/* Policy 4: Weather & Fair Work Gig Protection Policy */}
          <section className="fleet-policy-card">
            <div className="fleet-policy-header">
              <span className="fleet-policy-icon">⛈️</span>
              <h3 className="fleet-policy-title">Weather Protection &amp; Fair Work Policy</h3>
            </div>
            <div className="weather-banner">
              🌧️ <strong>Monsoon &amp; Heatwave Surge:</strong> Automatic extra pay during Kolkata
              downpours and severe summer heat. You can pause shifts during extreme weather with{' '}
              <strong>zero acceptance rate penalties</strong>.
            </div>
            <p className="fleet-policy-desc" style={{ marginTop: '8px' }}>
              <strong>Zero Algorithmic De-platforming:</strong> No automated bot can suspend your
              courier account. Any customer report requires human ombudsman verification, evidence
              review, and a guaranteed 24-hour right to explain before action is taken.
            </p>
          </section>

          {/* Policy 5: Food Safety, Thermal Bag & Handover OTP Protocol */}
          <section className="fleet-policy-card">
            <div className="fleet-policy-header">
              <span className="fleet-policy-icon">🛡️</span>
              <h3 className="fleet-policy-title">
                Food Hygiene &amp; 4-Digit Handover OTP Protocol
              </h3>
            </div>
            <p className="fleet-policy-desc">
              Maintain culinary integrity: Meals are transported in sanitized thermal hot-chain bags
              with unbroken restaurant tamper-evident seals. To complete any drop-off, the customer
              provides a unique 4-digit OTP, ensuring orders are never misdelivered.
            </p>
          </section>

          {/* Policy 6: DPDP Act 2023 & Courier Data Privacy */}
          <section className="fleet-policy-card">
            <div className="fleet-policy-header">
              <span className="fleet-policy-icon">🔒</span>
              <h3 className="fleet-policy-title">DPDP Act 2023 &amp; Private Document Vault</h3>
            </div>
            <p className="fleet-policy-desc">
              Your personal data and documents are protected under India&apos;s Digital Personal
              Data Protection Act. Driving License, RC, and PAN numbers are encrypted with
              HMAC-SHA256 and masked (e.g. XXXXXXXXXXX2345). Phone calls with customers use virtual
              masking so your personal number is never revealed.
            </p>
          </section>

          {/* Policy 7: Safety SOS Protocol */}
          <section className="fleet-policy-card">
            <div className="fleet-policy-header">
              <span className="fleet-policy-icon">🚨</span>
              <h3 className="fleet-policy-title">
                Emergency SOS &amp; Kolkata Police 112 Dispatch
              </h3>
            </div>
            <p className="fleet-policy-desc">
              Your safety comes first. A 1-tap SOS trigger is embedded in your live dispatch
              console. Pressing it immediately broadcasts your live telemetry coordinates to Kolkata
              Police Control (112) and our 24x7 Bhojora Safety Desk hotline (+91 33 2244 8800).
            </p>
          </section>

          {/* Policy 8: Kolkata Fleet Hub Locations */}
          <section className="fleet-policy-card">
            <div className="fleet-policy-header">
              <span className="fleet-policy-icon">🏢</span>
              <h3 className="fleet-policy-title">Kolkata Fleet Hubs &amp; Support Centers</h3>
            </div>
            <div className="hub-list">
              <div className="hub-item">
                <strong>Salt Lake Hub:</strong> Ground Floor, Webel IT Park, Sector V, Bidhannagar
              </div>
              <div className="hub-item">
                <strong>Central Kolkata Hub:</strong> 14B Park Street (Near Mullick Bazar Crossing)
              </div>
              <div className="hub-item">
                <strong>South Kolkata Hub:</strong> 88 Prince Anwar Shah Road, Jadavpur
              </div>
            </div>
          </section>

          {/* Policy 9: Courier FAQs */}
          <section className="fleet-policy-card">
            <div className="fleet-policy-header">
              <span className="fleet-policy-icon">❓</span>
              <h3 className="fleet-policy-title">Delivery Partner Frequently Asked Questions</h3>
            </div>
            <div className="fleet-faq-list">
              <div className="fleet-faq-item">
                <div className="fleet-faq-q">How much can I realistically earn per month?</div>
                <div className="fleet-faq-a">
                  Active couriers doing 16–22 deliveries per day typically take home ₹28,000 to
                  ₹36,000 per month, plus 100% of their customer tips and peak hour surges.
                </div>
              </div>
              <div className="fleet-faq-item">
                <div className="fleet-faq-q">
                  Can I deliver on a bicycle or electric scooter (EV)?
                </div>
                <div className="fleet-faq-a">
                  Yes! We welcome petrol motorcycles, scooters, electric scooters (EVs), and
                  bicycles. Bicycle couriers receive hyper-local trips bounded under 3.5 km.
                </div>
              </div>
              <div className="fleet-faq-item">
                <div className="fleet-faq-q">How do I receive the thermal hot-chain bag?</div>
                <div className="fleet-faq-a">
                  Once your online application is verified (typically within 2 hours), visit any of
                  our 3 Kolkata fleet hubs to pick up your sanitized thermal bag and reflective
                  safety vest.
                </div>
              </div>
            </div>
          </section>

          {/* How to Join Steps */}
          <section className="section-card">
            <div className="section-title">How to Get Started</div>
            <div className="join-steps-list">
              <div className="join-step-row">
                <div className="join-step-num">1</div>
                <div>
                  <strong>Submit Online Application</strong>
                  <div className="step-desc">
                    Enter your vehicle details, driving license, and bank account.
                  </div>
                </div>
              </div>
              <div className="join-step-row">
                <div className="join-step-num">2</div>
                <div>
                  <strong>Fast Document Verification</strong>
                  <div className="step-desc">
                    Ops team reviews your Driving License &amp; Vehicle RC within 2 hours.
                  </div>
                </div>
              </div>
              <div className="join-step-row">
                <div className="join-step-num">3</div>
                <div>
                  <strong>Collect Thermal Hot-Chain Bag</strong>
                  <div className="step-desc">
                    Pick up your sanitized insulated bag at any Kolkata fleet hub.
                  </div>
                </div>
              </div>
              <div className="join-step-row">
                <div className="join-step-num">4</div>
                <div>
                  <strong>Go Online &amp; Earn</strong>
                  <div className="step-desc">
                    Start receiving dispatch offers with guaranteed pay and instant cashout.
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="btn-primary"
              style={{ width: '100%', marginTop: '8px' }}
              onClick={() => setAuthMode('ONBOARD')}
            >
              Start 4-Step Application →
            </button>
          </section>
        </main>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: DELIVERY PARTNER LOGIN VIEW
  // =========================================================================
  if (authMode === 'LOGIN') {
    return (
      <div className="fleet-shell">
        <header className="mobile-header">
          <div className="brand-row">
            <img src={logoUrl} alt="Bhojora Fleet emblem" className="brand-logo-img" />
            <div>
              <div className="brand-title">BHOJORA FLEET</div>
              <div className="brand-subtitle">Partner Sign In</div>
            </div>
          </div>
          <div className="header-auth-actions">
            <button
              type="button"
              className="btn-header-back"
              onClick={() => setAuthMode('LANDING')}
            >
              ← Home
            </button>
            <button
              type="button"
              className="btn-header-apply"
              onClick={() => setAuthMode('ONBOARD')}
            >
              📝 Apply
            </button>
          </div>
        </header>

        <main className="mobile-content">
          <div className="section-card" style={{ padding: '24px 20px' }}>
            <div style={{ textAlign: 'center', marginBottom: '16px' }}>
              <div className="login-icon-wrap">🛵</div>
              <h2 className="hero-title" style={{ marginTop: '8px' }}>
                Delivery Partner Sign In
              </h2>
              <p className="hero-desc">
                Enter your registered phone or email and password to access your dispatch console.
              </p>
            </div>

            <form onSubmit={handlePartnerLogin} style={{ display: 'grid', gap: '14px' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="loginIdentifier">
                  Registered Mobile Number or Email
                </label>
                <input
                  id="loginIdentifier"
                  type="text"
                  required
                  className="form-input"
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  placeholder="e.g. rider@bhojora.in or 9830012345"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="loginPassword">
                  Account Password / PIN
                </label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    id="loginPassword"
                    type={showLoginPassword ? 'text' : 'password'}
                    required
                    className="form-input"
                    style={{ width: '100%', paddingRight: '60px' }}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                  />
                  <button
                    type="button"
                    style={{
                      position: 'absolute',
                      right: '10px',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--brand-accent)',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                  >
                    {showLoginPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {loginError && <div className="info-alert danger">⚠️ {loginError}</div>}

              <button type="submit" className="btn-primary" style={{ marginTop: '6px' }}>
                Sign In to Dispatch Console →
              </button>

              <button
                type="button"
                className="btn-secondary"
                style={{ width: '100%', borderColor: 'var(--brand-accent)' }}
                onClick={handleAutofillDemoCourier}
              >
                ⚡ Autofill Demo Courier (Soumyadip Saha)
              </button>
            </form>

            <div
              style={{
                marginTop: '16px',
                textAlign: 'center',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '16px',
              }}
            >
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                New to Bhojora Fleet?{' '}
              </span>
              <button
                type="button"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--brand-accent)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
                onClick={() => {
                  setCurrentStep(1);
                  setAuthMode('ONBOARD');
                }}
              >
                Apply as Delivery Partner
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: ONBOARDING APPLICATION FLOW (NEW COURIER)
  // =========================================================================
  if (authMode === 'ONBOARD') {
    // If application has been submitted and is under review:
    if (profile?.status === 'UNDER_REVIEW' || profile?.status === 'SUBMITTED') {
      return (
        <div className="fleet-shell">
          <header className="mobile-header">
            <div className="brand-row">
              <img src={logoUrl} alt="Bhojora Fleet emblem" className="brand-logo-img" />
              <div>
                <div className="brand-title">BHOJORA FLEET</div>
                <div className="brand-subtitle">Application Status</div>
              </div>
            </div>
            <div className="header-auth-actions">
              <div className="status-badge badge-under_review">UNDER REVIEW</div>
              <button
                type="button"
                className="btn-header-back"
                onClick={() => setAuthMode('LANDING')}
              >
                🏠 Home
              </button>
            </div>
          </header>

          <main className="mobile-content">
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
              <h2 className="hero-title">Application Submitted!</h2>
              <p className="hero-desc">
                Welcome {profile.fullName}! Your delivery partner onboarding application and private
                KYC documents have been received and are undergoing verification by the Bhojora Ops
                team.
              </p>
              <div className="info-alert warning" style={{ textAlign: 'left', width: '100%' }}>
                <strong>Zero-Trust Document Vault:</strong> Your Driving License (
                {uploadedDocs.find((d) => d.type === 'DRIVING_LICENSE')?.numberMasked || 'N/A'}),
                Vehicle RC, and PAN have been securely hashed. Typical approval time is within 2–4
                hours.
              </div>

              {/* Simulation Sandbox Controls */}
              <div
                style={{
                  marginTop: '16px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  width: '100%',
                }}
              >
                <button
                  type="button"
                  className="btn-primary"
                  style={{ backgroundColor: 'var(--status-online)', color: '#000' }}
                  onClick={handleSimulateApproval}
                >
                  ✓ Simulate Ops Approval &amp; Open Dispatch Console
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ borderColor: 'var(--status-danger)', color: 'var(--status-danger)' }}
                  onClick={handleSimulateRejection}
                >
                  Simulate Ops Rejection
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setAuthMode('LANDING')}
                >
                  ← Return to Home
                </button>
              </div>
            </div>
          </main>
        </div>
      );
    }

    return (
      <div className="fleet-shell">
        <header className="mobile-header">
          <div className="brand-row">
            <img src={logoUrl} alt="Bhojora Fleet emblem" className="brand-logo-img" />
            <div>
              <div className="brand-title">BHOJORA FLEET</div>
              <div className="brand-subtitle">Rider Application</div>
            </div>
          </div>
          <div className="header-auth-actions">
            <button
              type="button"
              className="btn-header-back"
              onClick={() => setAuthMode('LANDING')}
            >
              ← Home
            </button>
            <button
              type="button"
              className="btn-header-signin"
              onClick={() => setAuthMode('LOGIN')}
            >
              🔑 Sign In
            </button>
          </div>
        </header>

        <main className="mobile-content">
          <div className="hero-card">
            <h2 className="hero-title">Join Bhojora Fleet (Kolkata)</h2>
            <p className="hero-desc">
              Deliver hygienic meals within bounded 5.5–6.0 km corridors with 100% tip pass-through.
            </p>

            {profile?.status === 'REJECTED' && (
              <div className="info-alert danger">
                <strong>Application Rejected:</strong> {profile.rejectionReason}
                <div style={{ marginTop: '6px', fontSize: '0.8rem' }}>
                  Please update your information or document numbers below and resubmit.
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
              <div className="section-title">Step 1: Personal &amp; Operating Zones</div>
              <div className="form-group">
                <label className="form-label">Full Legal Name (as per Govt ID)</label>
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
                <label className="form-label">Mobile Number</label>
                <input
                  type="tel"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98300 12345"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="rider@bhojora.in"
                />
              </div>

              <div className="form-group">
                <label className="form-label">City of Operations</label>
                <input type="text" className="form-input" value="Kolkata (West Bengal)" disabled />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Preferred Delivery Corridors (Select 1 or more)
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
                <label className="form-label">Vehicle Make &amp; Model</label>
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
                  <label className="form-label">Vehicle Registration Number (WB-XX-XX-XXXX)</label>
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

              <div className="form-group" style={{ marginTop: '6px' }}>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={hasHelmet}
                    onChange={(e) => setHasHelmet(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--brand-accent)' }}
                  />
                  <span style={{ fontSize: '0.85rem' }}>
                    I possess an ISI-certified safety helmet and agree to wear it on all trips.
                  </span>
                </label>
              </div>
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
                      type="button"
                      data-testid="btn-upload-doc-DRIVING_LICENSE"
                      className="btn-secondary"
                      onClick={() => handleUploadDoc('DRIVING_LICENSE', docDlNumber)}
                    >
                      ✓ Attach &amp; Hash DL Document
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
                      type="button"
                      data-testid="btn-upload-doc-VEHICLE_RC"
                      className="btn-secondary"
                      onClick={() => handleUploadDoc('VEHICLE_RC', docRcNumber)}
                    >
                      ✓ Attach &amp; Hash RC Document
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
                  type="button"
                  data-testid="btn-upload-doc-PAN_CARD"
                  className="btn-secondary"
                  onClick={() => handleUploadDoc('PAN_CARD', docPanNumber)}
                >
                  ✓ Attach &amp; Hash PAN Card
                </button>
              </div>

              <div className="form-group" style={{ marginTop: '6px' }}>
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    checked={hasThermalBag}
                    onChange={(e) => setHasThermalBag(e.target.checked)}
                    style={{ width: '18px', height: '18px', accentColor: 'var(--brand-accent)' }}
                  />
                  <span style={{ fontSize: '0.85rem' }}>
                    I agree to use an insulated thermal hot-chain bag for all food deliveries.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Step 4: Bank Payout & Emergency Contact */}
          {currentStep === 4 && (
            <div data-testid="onboarding-step-4" className="section-card">
              <div className="section-title">Step 4: Payout &amp; Emergency Contact</div>
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
                <label className="form-label">Bank Name &amp; Branch</label>
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
        </main>

        {/* Persistent Bottom Action Bar */}
        <footer className="bottom-action-bar">
          {currentStep > 1 && (
            <button
              type="button"
              className="btn-secondary"
              style={{ flex: 1 }}
              onClick={() => setCurrentStep((prev) => Math.max(1, prev - 1))}
            >
              Back
            </button>
          )}
          {currentStep < 4 ? (
            <button
              type="button"
              data-testid="btn-step-next"
              className="btn-primary"
              style={{ flex: 2 }}
              onClick={() => setCurrentStep((prev) => Math.min(4, prev + 1))}
            >
              Continue to Step {currentStep + 1} →
            </button>
          ) : (
            <button
              type="button"
              data-testid="btn-submit-application"
              className="btn-primary"
              style={{ flex: 2 }}
              onClick={handleMockSubmit}
            >
              Submit Application For Review 🚀
            </button>
          )}
        </footer>
      </div>
    );
  }

  // =========================================================================
  // VIEW 4: AUTHENTICATED DELIVERY PARTNER CONSOLE & DASHBOARD
  // =========================================================================
  const activePartner = profile || DEFAULT_DEMO_PARTNER;

  return (
    <div className="fleet-shell">
      {/* Sticky Header */}
      <header className="mobile-header">
        <div className="brand-row">
          <img src={logoUrl} alt="Bhojora Fleet emblem" className="brand-logo-img" />
          <div>
            <div className="brand-title">BHOJORA FLEET</div>
            <div className="brand-subtitle">
              {activePartner.fullName} ({activePartner.vehicle.vehicleType})
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            data-testid="header-partner-badge"
            className={`status-badge ${getStatusBadgeClass(activePartner.status)}`}
          >
            {activePartner.status}
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ padding: '4px 8px', fontSize: '0.75rem' }}
            onClick={handleSignOut}
            title="Sign out of delivery partner console"
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Navigation Sub-Tabs Bar */}
      <nav className="fleet-nav-tabs" aria-label="Courier Console Navigation">
        <button
          type="button"
          className={`fleet-tab-btn ${activeTab === 'DISPATCH' ? 'active' : ''}`}
          onClick={() => setActiveTab('DISPATCH')}
        >
          🚴 Dispatch
        </button>
        <button
          type="button"
          className={`fleet-tab-btn ${activeTab === 'EARNINGS' ? 'active' : ''}`}
          onClick={() => setActiveTab('EARNINGS')}
        >
          💰 Earnings
        </button>
        <button
          type="button"
          className={`fleet-tab-btn ${activeTab === 'PERFORMANCE' ? 'active' : ''}`}
          onClick={() => setActiveTab('PERFORMANCE')}
        >
          📊 Stats
        </button>
        <button
          type="button"
          className={`fleet-tab-btn ${activeTab === 'PROFILE' ? 'active' : ''}`}
          onClick={() => setActiveTab('PROFILE')}
        >
          📄 KYC Vault
        </button>
        <button
          type="button"
          className={`fleet-tab-btn ${activeTab === 'SUPPORT' ? 'active' : ''}`}
          onClick={() => setActiveTab('SUPPORT')}
        >
          🚨 SOS / Help
        </button>
      </nav>

      {/* Main Console Content */}
      <main className="mobile-content">
        {/* TAB 1: DISPATCH & LIVE DELIVERY */}
        {activeTab === 'DISPATCH' && (
          <>
            {/* Shift Status Switcher */}
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

              {deliveryCompleteMessage && (
                <div className="info-alert success" style={{ width: '100%' }}>
                  {deliveryCompleteMessage}
                </div>
              )}

              {shiftStatus === 'ONLINE' && (
                <div className="info-alert success" style={{ width: '100%' }}>
                  ✓ GPS Active: Central Kolkata (88.3639° E, 22.5726° N) • Battery 88% • Ready for
                  dispatches.
                </div>
              )}
            </div>

            {/* Incoming Dispatch Job Offer Card */}
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
                      Guaranteed Payout (100% Tips Passed)
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
                    Accept Job →
                  </button>
                </div>
              </div>
            )}

            {/* Active Delivery Trip Card */}
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
                      📦 Confirm Food Picked Up (Hot-Bag Check) → Out for Delivery
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
                        backgroundColor: 'var(--bg-input)',
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
                          backgroundColor: 'var(--bg-card)',
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
                        ✓ Verify OTP &amp; Complete Handover
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
                  style={{
                    fontSize: '0.85rem',
                    padding: '10px 16px',
                    borderColor: 'var(--brand-accent)',
                  }}
                  onClick={handleSimulateIncomingOffer}
                >
                  ⚡ Simulate Incoming Job Offer
                </button>
              </div>
            )}
          </>
        )}

        {/* TAB 2: EARNINGS & PAYOUTS */}
        {activeTab === 'EARNINGS' && (
          <>
            <div className="section-card">
              <div className="section-title">
                <span>Today&apos;s Earnings</span>
                <span className="payout-badge" style={{ fontSize: '1.25rem' }}>
                  ₹844.00
                </span>
              </div>
              <p className="hero-desc">
                8 deliveries completed · 5.2 hours online · 100% tip pass-through
              </p>

              {cashoutNotice && (
                <div className="info-alert success" style={{ marginTop: '8px' }}>
                  {cashoutNotice}
                </div>
              )}

              {/* Earnings Breakdown */}
              <div className="earnings-breakdown-list">
                <div className="earnings-item-row">
                  <span>Base Pickup Pay (8 × ₹40.00)</span>
                  <strong>₹320.00</strong>
                </div>
                <div className="earnings-item-row">
                  <span>Corridor Distance Pay (24.0 km @ ₹12/km)</span>
                  <strong>₹288.00</strong>
                </div>
                <div className="earnings-item-row">
                  <span>Peak Lunch/Dinner Corridor Surge</span>
                  <strong>₹96.00</strong>
                </div>
                <div className="earnings-item-row" style={{ color: 'var(--status-online)' }}>
                  <span>Customer Tips (100% Direct Pass-Through)</span>
                  <strong>+₹140.00</strong>
                </div>
              </div>

              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%', marginTop: '12px' }}
                onClick={handleTriggerInstantCashout}
              >
                Instant UPI Cashout (₹844.00) ⚡
              </button>
            </div>

            <div className="section-card">
              <div className="section-title">
                <span>Weekly Settlement Ledger</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  Nov 16 - Nov 22, 2026
                </span>
              </div>
              <div className="stats-grid">
                <div className="stat-box">
                  <span className="stat-val">₹5,420</span>
                  <span className="stat-label">Week Total</span>
                </div>
                <div className="stat-box">
                  <span className="stat-val">52</span>
                  <span className="stat-label">Trips</span>
                </div>
                <div className="stat-box">
                  <span className="stat-val">₹680</span>
                  <span className="stat-label">Total Tips</span>
                </div>
              </div>

              <div className="payout-status-box">
                <div>
                  <strong>Payout Destination:</strong>{' '}
                  {activePartner.bankPayout?.bankName || 'HDFC Bank'}
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Account: {activePartner.bankPayout?.accountNumberMasked || 'XXXXXXXX1012'} ·
                    IFSC: {activePartner.bankPayout?.ifscCode || 'HDFC0000128'}
                  </div>
                </div>
                <div className="status-badge badge-approved" style={{ marginTop: '6px' }}>
                  T+1 Daily Escrow: Active
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 3: PERFORMANCE & HYGIENE COMPLIANCE */}
        {activeTab === 'PERFORMANCE' && (
          <>
            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-val">4.95 ★</span>
                <span className="stat-label">Rating</span>
              </div>
              <div className="stat-box">
                <span className="stat-val">{activePartner.totalDeliveries}</span>
                <span className="stat-label">Deliveries</span>
              </div>
              <div className="stat-box">
                <span className="stat-val">98.4%</span>
                <span className="stat-label">On-Time SLA</span>
              </div>
            </div>

            <div className="section-card">
              <div className="section-title">Courier Reliability Metrics</div>
              <div className="earnings-breakdown-list">
                <div className="earnings-item-row">
                  <span>Order Acceptance Rate</span>
                  <strong style={{ color: 'var(--status-online)' }}>96.0% (Elite)</strong>
                </div>
                <div className="earnings-item-row">
                  <span>Average Pickup Arrival Time</span>
                  <strong>6.4 minutes</strong>
                </div>
                <div className="earnings-item-row">
                  <span>Customer Satisfaction</span>
                  <strong>99.1% Positive</strong>
                </div>
                <div className="earnings-item-row">
                  <span>Zero Spillage Record</span>
                  <strong style={{ color: 'var(--status-online)' }}>100% Intact</strong>
                </div>
              </div>
            </div>

            <div className="section-card">
              <div className="section-title">
                <span>Food Safety &amp; Hot-Bag Compliance</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--status-online)' }}>
                  ✓ Verified
                </span>
              </div>
              <div className="doc-upload-box">
                <div className="doc-name">Thermal Bag Hygiene Protocol</div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Bag inspected and sanitized at Salt Lake Sector V hub. Thermal retention verified
                  above 65°C hot-chain standards.
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Next Scheduled Hygiene Check: <strong>Nov 29, 2026</strong>
                </div>
              </div>
            </div>

            <div className="section-card">
              <div className="section-title">Earned Fleet Badges</div>
              <div className="badge-pills-wrap">
                <div className="badge-pill">🏆 Kolkata Corridor Champion</div>
                <div className="badge-pill">🛡️ Food Safety &amp; Hot-Bag Certified</div>
                <div className="badge-pill">⚡ Fast Dispatch Responder</div>
                <div className="badge-pill">🌙 Night Shift Specialist</div>
              </div>
            </div>
          </>
        )}

        {/* TAB 4: PRIVATE KYC VAULT & PROFILE */}
        {activeTab === 'PROFILE' && (
          <>
            <div className="section-card">
              <div className="section-title">
                <span>Rider Profile &amp; Vehicle</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--status-online)' }}>
                  ✓ Approved
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
                  <strong>Partner Name:</strong> {activePartner.fullName}
                </div>
                <div>
                  <strong>Phone:</strong> {activePartner.phoneMasked}
                </div>
                <div>
                  <strong>Vehicle:</strong> {activePartner.vehicle.model} (
                  {activePartner.vehicle.vehicleType})
                </div>
                <div>
                  <strong>Registration:</strong>{' '}
                  {activePartner.vehicle.registrationNumberMasked || 'N/A'}
                </div>
                <div>
                  <strong>Corridors:</strong> {activePartner.preferredZones.join(', ')}
                </div>
              </div>
            </div>

            <div className="section-card">
              <div className="section-title">
                <span>Private KYC Document Vault</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--brand-accent)' }}>
                  🔒 Private (isPublic: false)
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {activePartner.documents.map((doc) => (
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
                      Masked Digest: <strong>{doc.documentNumberMasked}</strong>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="section-card">
              <div className="section-title">Emergency Contact Information</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                <div>
                  <strong>Contact Name:</strong>{' '}
                  {activePartner.emergencyContact?.name || 'Anirban Saha'}
                </div>
                <div>
                  <strong>Relationship:</strong>{' '}
                  {activePartner.emergencyContact?.relationship || 'Brother'}
                </div>
                <div>
                  <strong>Phone:</strong>{' '}
                  {activePartner.emergencyContact?.phoneMasked || '+91 98300 *****'}
                </div>
              </div>
            </div>
          </>
        )}

        {/* TAB 5: SAFETY SOS & SUPPORT */}
        {activeTab === 'SUPPORT' && (
          <>
            <div className="sos-banner">
              <div style={{ fontSize: '1.75rem' }}>🚨</div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>
                  Emergency SOS Safety Alert
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#fed7aa' }}>
                  Tap below in case of medical emergency, accident, or threat. Live GPS coordinates
                  are instantly routed to Kolkata Police and Bhojora Safety Desk.
                </p>
              </div>
            </div>

            <button type="button" className="sos-button" onClick={handleTriggerSos}>
              {sosTriggered ? '✓ SOS SIGNAL TRANSMITTED' : '🚨 ACTIVATE EMERGENCY SOS NOW'}
            </button>

            <div className="section-card">
              <div className="section-title">24x7 Dispatch Support Desk</div>
              <div className="support-contact-list">
                <div className="support-item">
                  <span>📞 Dispatch Operations Hotline:</span>
                  <strong>+91 33 2244 8800</strong>
                </div>
                <div className="support-item">
                  <span>💬 WhatsApp Incident Desk:</span>
                  <strong>+91 98300 99888</strong>
                </div>
                <div className="support-item">
                  <span>🏥 Emergency Cashless Cover:</span>
                  <strong>Policy #BHOJ-FLEET-2026-WB-0941</strong>
                </div>
              </div>
            </div>

            <div className="section-card">
              <div className="section-title">Kolkata Physical Fleet Hubs</div>
              <div className="hub-list">
                <div className="hub-item">
                  <strong>Salt Lake Sector V Hub:</strong> Webel Bhavan Complex, Block EP&amp;GP
                </div>
                <div className="hub-item">
                  <strong>Central Kolkata Hub:</strong> 191 Park Street, 7-Point Crossing
                </div>
                <div className="hub-item">
                  <strong>New Town Hub:</strong> Action Area II, Near City Centre 2
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
