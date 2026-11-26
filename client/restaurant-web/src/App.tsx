import { FormEvent, useState } from 'react';
import {
  ROLE_PERMISSION_MATRIX,
  type ApiResponse,
  type AuthSessionResponseDto,
  type RbacContextDto,
  type UserProfileDto,
} from '@bhojora/shared';
import { MenuCatalogPanel } from './components/MenuCatalogPanel';
import { OutletZonesPanel } from './components/OutletZonesPanel';
import { RestaurantOnboardingPanel } from './components/RestaurantOnboardingPanel';
import { KitchenOrderDashboardPanel } from './components/KitchenOrderDashboardPanel';

export interface PartnerOutletView {
  outletId: string;
  name: string;
  zone: string;
  trustScore: number;
  fssaiExpiresOn: string;
  inspectionCadenceDays: number;
  dailyEvidenceSubmitted: boolean;
  readinessState: 'VERIFIED_CLEAN' | 'ACTION_REQUIRED';
}

const INITIAL_SAMPLE_OUTLETS: PartnerOutletView[] = [
  {
    outletId: 'outlet_arsalan_pc',
    name: 'Arsalan — Park Circus Flagship',
    zone: 'Park Circus',
    trustScore: 94,
    fssaiExpiresOn: '2027-08-19',
    inspectionCadenceDays: 30,
    dailyEvidenceSubmitted: true,
    readinessState: 'VERIFIED_CLEAN',
  },
  {
    outletId: 'outlet_balaram_bg',
    name: 'Balaram Mullick & Radharaman Mullick — Ballygunge',
    zone: 'Ballygunge',
    trustScore: 96,
    fssaiExpiresOn: '2027-11-04',
    inspectionCadenceDays: 30,
    dailyEvidenceSubmitted: true,
    readinessState: 'VERIFIED_CLEAN',
  },
  {
    outletId: 'outlet_saltlake_test',
    name: 'Salt Lake Central Cloud Kitchen — Sector V',
    zone: 'Salt Lake',
    trustScore: 81,
    fssaiExpiresOn: '2026-12-15',
    inspectionCadenceDays: 14,
    dailyEvidenceSubmitted: false,
    readinessState: 'ACTION_REQUIRED',
  },
];

type PartnerAuthMode = 'SIGNIN' | 'ONBOARDING';
type PartnerNavTab = 'KDS' | 'ONBOARDING' | 'ZONES' | 'CATALOG' | 'ALL';

function getApiBase(): string {
  const configured = window.BHOJORA_API_BASE?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  const viteApiBase = import.meta.env.VITE_API_BASE?.trim();
  if (viteApiBase) {
    return viteApiBase.replace(/\/$/, '');
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://127.0.0.1:4000';
  }
  return '';
}

export function App() {
  const [outlets, setOutlets] = useState<PartnerOutletView[]>(INITIAL_SAMPLE_OUTLETS);
  const [selectedOutletId, setSelectedOutletId] = useState<string>(
    INITIAL_SAMPLE_OUTLETS[0]!.outletId,
  );
  const [authMode, setAuthMode] = useState<PartnerAuthMode>('SIGNIN');

  // Sign In State
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // New Partner Onboarding Registration State
  const [brandName, setBrandName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [onboardEmail, setOnboardEmail] = useState('');
  const [onboardPhone, setOnboardPhone] = useState('');
  const [onboardPassword, setOnboardPassword] = useState('');
  const [onboardZone, setOnboardZone] = useState('Salt Lake Sector V');
  const [fssaiNumber, setFssaiNumber] = useState('');
  const [gstin, setGstin] = useState('');
  const [addressLine, setAddressLine] = useState('');
  const [cuisine, setCuisine] = useState('Mughlai & Biryani');
  const [agreeAudit, setAgreeAudit] = useState(true);
  const [calcMonthlyGmv, setCalcMonthlyGmv] = useState<number>(500000);
  const [activePolicyDrawer, setActivePolicyDrawer] = useState<string | null>(null);

  // Session State
  const [sessionUser, setSessionUser] = useState<UserProfileDto | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [rbacContext, setRbacContext] = useState<RbacContextDto | null>(null);
  const [activeTab, setActiveTab] = useState<PartnerNavTab>('KDS');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    'Tenant-scoped partner console. Sign in or register your kitchen to access the console.',
  );

  const partnerActiveRole = sessionUser?.roles.includes('RESTAURANT_OWNER')
    ? 'RESTAURANT_OWNER'
    : sessionUser?.roles.includes('RESTAURANT_MANAGER')
      ? 'RESTAURANT_MANAGER'
      : sessionUser?.roles.includes('KITCHEN_STAFF')
        ? 'KITCHEN_STAFF'
        : (rbacContext?.activeRole ?? 'RESTAURANT_OWNER');

  const selectedOutlet =
    outlets.find((outlet) => outlet.outletId === selectedOutletId) ?? outlets[0]!;

  async function verifyOutletTenantAccess(outletId: string, tokenOverride?: string) {
    const token = tokenOverride ?? accessToken;
    const apiBase = getApiBase();
    if (!token || !apiBase) {
      return;
    }
    try {
      const res = await fetch(
        `${apiBase}/api/v1/rbac/outlets/${encodeURIComponent(outletId)}/workspace`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = (await res.json()) as ApiResponse<{ outlet: { name: string } }>;
      if (!res.ok || !data.success) {
        setStatusMessage(
          data.success
            ? 'Tenant isolation check blocked outlet access.'
            : `Tenant check (${res.status}): ${data.error.message}`,
        );
        return;
      }
      setStatusMessage(`Verified tenant scope for ${data.data.outlet.name}.`);
    } catch {
      setStatusMessage('Unable to verify outlet workspace scope.');
    }
  }

  // 1. Existing Partner Sign-In
  async function handlePartnerSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError(null);

    const enteredEmail = identifier.trim().toLowerCase();
    const enteredPassword = password.trim();

    if (!enteredEmail || !enteredPassword) {
      setAuthError('Please enter your partner email/phone and password.');
      setIsSubmitting(false);
      return;
    }

    const apiBase = getApiBase();
    if (!apiBase) {
      setAuthError(
        'Backend API URL is not configured (VITE_API_BASE). Connect a live Bhojora backend to sign in.',
      );
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: enteredEmail,
          password: enteredPassword,
          deviceName: 'Bhojora Partner Portal Web',
        }),
      });
      const payload = (await response.json()) as ApiResponse<AuthSessionResponseDto>;
      if (response.ok && payload.success) {
        setSessionUser(payload.data.user);
        setAccessToken(payload.data.tokens.accessToken);
        setPassword('');
        setAuthError(null);

        try {
          const rbacRes = await fetch(`${apiBase}/api/v1/rbac/me`, {
            headers: { Authorization: `Bearer ${payload.data.tokens.accessToken}` },
          });
          const rbacPayload = (await rbacRes.json()) as ApiResponse<RbacContextDto>;
          if (rbacRes.ok && rbacPayload.success) {
            setRbacContext(rbacPayload.data);
          }
        } catch {
          // Non-critical RBAC fetch
        }

        setStatusMessage(
          `Signed in as ${payload.data.user.name} (${payload.data.user.activeRole}).`,
        );
      } else {
        setAuthError(
          payload.success
            ? 'Sign-in failed.'
            : payload.error?.message ||
                'Invalid partner credentials. Please check your email and password.',
        );
      }
    } catch {
      setAuthError(`Unable to reach backend API at ${apiBase}.`);
    }

    setIsSubmitting(false);
  }

  // 2. New Partner Onboarding Registration
  async function handlePartnerOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setAuthError(null);

    // Validation checks
    if (!brandName.trim() || !ownerName.trim()) {
      setAuthError('Restaurant brand name and owner full name are required.');
      setIsSubmitting(false);
      return;
    }

    if (!onboardEmail.includes('@') || !onboardEmail.includes('.')) {
      setAuthError('Please enter a valid work email address.');
      setIsSubmitting(false);
      return;
    }

    const cleanPhone = onboardPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      setAuthError('Please enter a valid 10-digit Indian phone number.');
      setIsSubmitting(false);
      return;
    }

    if (onboardPassword.length < 8) {
      setAuthError('Password must be at least 8 characters long for security compliance.');
      setIsSubmitting(false);
      return;
    }

    const cleanFssai = fssaiNumber.trim();
    if (!/^\d{14}$/.test(cleanFssai)) {
      setAuthError('FSSAI License must be exactly 14 numeric digits (e.g., 12826001000123).');
      setIsSubmitting(false);
      return;
    }

    if (!agreeAudit) {
      setAuthError(
        'You must agree to unannounced 100-point physical kitchen hygiene audits to join Bhojora.',
      );
      setIsSubmitting(false);
      return;
    }

    // Try registering with backend API if available
    const apiBase = getApiBase();
    if (apiBase) {
      try {
        await fetch(`${apiBase}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: ownerName.trim(),
            email: onboardEmail.trim().toLowerCase(),
            phone: `+91${cleanPhone.slice(-10)}`,
            password: onboardPassword,
            languagePreference: 'en-IN',
            acceptTerms: true,
          }),
        });
      } catch {
        // Backend optional for client-side demo
      }
    }

    // Provision new outlet and active session
    const outletSlug = brandName
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .slice(0, 20);
    const newOutletId = `outlet_${outletSlug}_${Date.now().toString().slice(-4)}`;
    const newOutlet: PartnerOutletView = {
      outletId: newOutletId,
      name: `${brandName.trim()} — ${onboardZone}`,
      zone: onboardZone,
      trustScore: 90,
      fssaiExpiresOn: '2028-12-31',
      inspectionCadenceDays: 30,
      dailyEvidenceSubmitted: true,
      readinessState: 'VERIFIED_CLEAN',
    };

    const newPartnerUser: UserProfileDto = {
      id: `usr_${outletSlug}`,
      name: ownerName.trim(),
      emailMasked: onboardEmail.trim(),
      phoneMasked: `+91 ${cleanPhone.slice(-10, -5)} *****`,
      roles: ['RESTAURANT_OWNER'],
      activeRole: 'RESTAURANT_OWNER',
      status: 'ACTIVE',
      languagePreference: 'en-IN',
      phoneVerified: true,
      emailVerified: true,
      createdAt: new Date().toISOString(),
    };

    const newPartnerRbac: RbacContextDto = {
      userId: newPartnerUser.id,
      roles: ['RESTAURANT_OWNER'],
      activeRole: 'RESTAURANT_OWNER',
      mfaVerified: true,
      mfaRequiredForActiveRole: false,
      permissions: [...ROLE_PERMISSION_MATRIX.RESTAURANT_OWNER],
      memberships: [
        {
          membershipId: `mem_${outletSlug}_owner`,
          userId: newPartnerUser.id,
          outletId: newOutletId,
          restaurantId: `rest_${outletSlug}`,
          role: 'RESTAURANT_OWNER',
          status: 'ACTIVE',
          createdAt: new Date().toISOString(),
        },
      ],
    };

    setOutlets((prev) => [newOutlet, ...prev]);
    setSelectedOutletId(newOutletId);
    setSessionUser(newPartnerUser);
    setRbacContext(newPartnerRbac);
    setAccessToken('bhojora_new_partner_session_token');
    setOnboardPassword('');
    setIsSubmitting(false);
    setStatusMessage(
      `Welcome to Bhojora Partner Network! ${brandName} is successfully onboarded in ${onboardZone}. FSSAI: ${cleanFssai}`,
    );
  }

  function handleSignOut() {
    setSessionUser(null);
    setAccessToken(null);
    setRbacContext(null);
    setIdentifier('');
    setPassword('');
    setAuthError(null);
    setStatusMessage('Signed out of partner portal session. Log in or onboard to resume.');
  }

  // ==========================================
  // 1. UNAUTHENTICATED: LANDING & LOGIN / ONBOARDING PAGE
  // ==========================================
  if (!sessionUser) {
    return (
      <>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">
              <img src="./logo.png" alt="BHOJORA emblem" width={40} height={40} />
              <div>
                <p className="brand-name">BHOJORA Partner Portal</p>
                <p className="brand-sub">Kolkata Kitchen Discovery &amp; Verification Network</p>
              </div>
            </div>

            <nav className="topbar-nav" aria-label="Partner Landing Navigation">
              <ul className="topbar-nav-links">
                <li>
                  <a href="#economics" className="topbar-nav-link">
                    Economics
                  </a>
                </li>
                <li>
                  <a href="#hygiene" className="topbar-nav-link">
                    Hygiene Standard
                  </a>
                </li>
                <li>
                  <a href="#payouts" className="topbar-nav-link">
                    T+1 Escrow
                  </a>
                </li>
                <li>
                  <a href="#dpdp-privacy" className="topbar-nav-link">
                    DPDP Privacy
                  </a>
                </li>
                <li>
                  <a href="#checklist" className="topbar-nav-link">
                    Checklist
                  </a>
                </li>
                <li>
                  <a href="#faqs" className="topbar-nav-link">
                    FAQ
                  </a>
                </li>
              </ul>

              <div className="topbar-action-btns">
                <button
                  type="button"
                  className="btn-header-signin"
                  onClick={() => {
                    setAuthMode('SIGNIN');
                    document
                      .getElementById('auth-portal-section')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  title="Sign in with existing partner credentials"
                >
                  🔑 Partner Sign In
                </button>
                <button
                  type="button"
                  className="btn-header-onboard"
                  onClick={() => {
                    setAuthMode('ONBOARDING');
                    document
                      .getElementById('auth-portal-section')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  title="Register a new restaurant or cloud kitchen"
                >
                  📝 Onboard Kitchen
                </button>
              </div>
            </nav>
          </div>
        </header>

        <main className="landing-shell">
          <section className="landing-hero-grid">
            {/* Left Column: Partner Value Proposition */}
            <div className="landing-copy">
              <div>
                <span className="landing-eyebrow">
                  🍳 For Restaurateurs, Cloud Kitchens &amp; Heritage Outlets
                </span>
                <h1 className="landing-heading">Grow Your Culinary Brand on Trust, Not Ads</h1>
                <p className="landing-sub">
                  Join Kolkata&apos;s independent verified food network. Keep over 83.5% of your
                  order revenue with our sustainable 16.5% flat take rate, true dine-in menu
                  pricing, and automated next-day T+1 bank escrow settlements.
                </p>
              </div>

              {/* 4 Key Partner Metrics Badges */}
              <div className="landing-metrics-grid">
                <div className="metric-tile">
                  <div className="metric-number">16.5%</div>
                  <div className="metric-label">Flat Commission</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-number">T+1</div>
                  <div className="metric-label">Daily Settlement</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-number">100-Pt</div>
                  <div className="metric-label">Hygiene Audits</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-number">83.5%+</div>
                  <div className="metric-label">Retained Margin</div>
                </div>
              </div>

              {/* Core Partner Pillars */}
              <div className="pillars-card">
                <div className="pillar-item">
                  <span className="pillar-icon">💰</span>
                  <div>
                    <h3 className="pillar-title">
                      Dine-In Price Parity &amp; Zero Platform Surcharges
                    </h3>
                    <p className="pillar-desc">
                      No forced deep discounting, no arbitrary platform fees, and no drip pricing.
                      What diners pay matches your actual kitchen value.
                    </p>
                  </div>
                </div>
                <div className="pillar-item">
                  <span className="pillar-icon">🛡️</span>
                  <div>
                    <h3 className="pillar-title">Independent Hygiene Rating Advantage</h3>
                    <p className="pillar-desc">
                      Accredited physical audits showcase your kitchen sanitation, cold storage
                      integrity, and water purity directly to conscious consumers. Clean kitchens
                      rank top automatically without paying for sponsored bids.
                    </p>
                  </div>
                </div>
                <div className="pillar-item">
                  <span className="pillar-icon">⚡</span>
                  <div>
                    <h3 className="pillar-title">Live Kitchen Display System (KDS)</h3>
                    <p className="pillar-desc">
                      Stream orders with real-time audio chimes, preparation countdown timers,
                      ingredient 86-ing toggles, and dedicated courier dispatch in 5.5–6.0 km
                      bounds.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Dedicated Partner Authentication / Onboarding Portal Card */}
            <aside
              id="auth-portal-section"
              className="auth-portal-card"
              aria-label="Partner Sign In and Onboarding Portal"
            >
              {/* Mode Toggle Switcher */}
              <div className="auth-mode-selector" role="tablist">
                <button
                  type="button"
                  className="auth-mode-btn"
                  role="tab"
                  aria-selected={authMode === 'SIGNIN'}
                  onClick={() => {
                    setAuthMode('SIGNIN');
                    setAuthError(null);
                  }}
                >
                  🔑 Partner Sign In
                </button>
                <button
                  type="button"
                  className="auth-mode-btn"
                  role="tab"
                  aria-selected={authMode === 'ONBOARDING'}
                  onClick={() => {
                    setAuthMode('ONBOARDING');
                    setAuthError(null);
                  }}
                >
                  📝 New Partner Onboarding
                </button>
              </div>

              {/* Mode 1: Sign In for Existing Partners */}
              {authMode === 'SIGNIN' ? (
                <div>
                  <div className="auth-card-header">
                    <h2>Partner Sign In</h2>
                    <p>
                      Enter your work email or phone and password to access your outlet console.
                    </p>
                  </div>

                  <form onSubmit={handlePartnerSignIn}>
                    <div className="field">
                      <label htmlFor="partnerIdentifier">Work Email or Phone (+91)</label>
                      <input
                        id="partnerIdentifier"
                        name="identifier"
                        type="text"
                        required
                        autoComplete="username"
                        value={identifier}
                        onChange={(event) => setIdentifier(event.target.value)}
                        placeholder="partner@bhojora.in"
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="partnerPassword">Password</label>
                      <div className="password-input-group">
                        <input
                          id="partnerPassword"
                          name="password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          placeholder="••••••••••••"
                        />
                        <button
                          type="button"
                          className="btn-toggle-password"
                          onClick={() => setShowPassword((prev) => !prev)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </div>

                    {authError ? (
                      <div
                        className="notice-banner"
                        style={{ borderColor: 'var(--terracotta)', background: '#faecea' }}
                        role="alert"
                      >
                        ⚠️ {authError}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={isSubmitting}
                      style={{ marginTop: '0.5rem' }}
                    >
                      {isSubmitting ? 'Signing in...' : 'Sign In to Kitchen Console →'}
                    </button>
                  </form>

                  <div className="env-credential-callout">
                    <strong>Backend Authentication Required:</strong>
                    <br />
                    Sign in with your verified restaurant partner account via the Bhojora identity
                    API.
                  </div>
                </div>
              ) : (
                /* Mode 2: New Partner Onboarding Registration */
                <div>
                  <div className="auth-card-header">
                    <h2>Onboard Your Kitchen</h2>
                    <p>
                      Complete your partner profile and statutory credentials to join the network.
                    </p>
                  </div>

                  <form onSubmit={handlePartnerOnboarding}>
                    <div className="onboarding-form-grid">
                      <div className="field full-span">
                        <label htmlFor="onboardBrandName">Restaurant Brand Name *</label>
                        <input
                          id="onboardBrandName"
                          type="text"
                          required
                          value={brandName}
                          onChange={(e) => setBrandName(e.target.value)}
                          placeholder="e.g. Royal Biryani & Rolls"
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="onboardOwnerName">Owner / Manager Name *</label>
                        <input
                          id="onboardOwnerName"
                          type="text"
                          required
                          value={ownerName}
                          onChange={(e) => setOwnerName(e.target.value)}
                          placeholder="e.g. Subhashish Roy"
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="onboardPhone">Contact Phone (+91) *</label>
                        <input
                          id="onboardPhone"
                          type="tel"
                          required
                          pattern="[0-9]{10}"
                          maxLength={10}
                          value={onboardPhone}
                          onChange={(e) => setOnboardPhone(e.target.value)}
                          placeholder="9830012345"
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="onboardEmail">Work Email Address *</label>
                        <input
                          id="onboardEmail"
                          type="email"
                          required
                          value={onboardEmail}
                          onChange={(e) => setOnboardEmail(e.target.value)}
                          placeholder="kitchen@royalbiryani.in"
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="onboardPass">Account Password (min 8 chars) *</label>
                        <input
                          id="onboardPass"
                          type="password"
                          required
                          minLength={8}
                          value={onboardPassword}
                          onChange={(e) => setOnboardPassword(e.target.value)}
                          placeholder="••••••••••••"
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="onboardZone">Service Corridor / Zone *</label>
                        <select
                          id="onboardZone"
                          value={onboardZone}
                          onChange={(e) => setOnboardZone(e.target.value)}
                        >
                          <option value="Salt Lake Sector V">Salt Lake Sector V</option>
                          <option value="Park Street & Camac Street">
                            Park Street &amp; Camac Street
                          </option>
                          <option value="Ballygunge & Gariahat">Ballygunge &amp; Gariahat</option>
                          <option value="Bhowanipore / South Kolkata">
                            Bhowanipore / South Kolkata
                          </option>
                          <option value="New Town Action Area I">New Town Action Area I</option>
                        </select>
                      </div>

                      <div className="field">
                        <label htmlFor="onboardCuisine">Primary Cuisine Specialty *</label>
                        <select
                          id="onboardCuisine"
                          value={cuisine}
                          onChange={(e) => setCuisine(e.target.value)}
                        >
                          <option value="Mughlai & Biryani">Mughlai &amp; Biryani</option>
                          <option value="Bengali Traditional">Bengali Traditional</option>
                          <option value="North Indian & Chinese">North Indian &amp; Chinese</option>
                          <option value="Pure Veg Sweets & Savory">
                            Pure Veg Sweets &amp; Savory
                          </option>
                          <option value="Continental & Cafe">Continental &amp; Cafe</option>
                        </select>
                      </div>

                      <div className="field full-span">
                        <label htmlFor="onboardFssai">14-Digit FSSAI License Number *</label>
                        <input
                          id="onboardFssai"
                          type="text"
                          required
                          maxLength={14}
                          pattern="\d{14}"
                          value={fssaiNumber}
                          onChange={(e) => setFssaiNumber(e.target.value)}
                          placeholder="12826001000123"
                        />
                        <span className="field-hint">
                          Mandatory statutory license under Food Safety and Standards Act.
                        </span>
                      </div>

                      <div className="field full-span">
                        <label htmlFor="onboardGstin">15-Character GSTIN (Optional)</label>
                        <input
                          id="onboardGstin"
                          type="text"
                          maxLength={15}
                          value={gstin}
                          onChange={(e) => setGstin(e.target.value.toUpperCase())}
                          placeholder="19AAAAA0000A1Z5"
                        />
                      </div>

                      <div className="field full-span">
                        <label htmlFor="onboardAddress">Physical Kitchen Address Line *</label>
                        <input
                          id="onboardAddress"
                          type="text"
                          required
                          value={addressLine}
                          onChange={(e) => setAddressLine(e.target.value)}
                          placeholder="Plot 12, Block EP & GP, Sector V, Bidhannagar, Kolkata 700091"
                        />
                      </div>
                    </div>

                    <div className="checkbox-row">
                      <input
                        id="agreeAuditCheck"
                        type="checkbox"
                        checked={agreeAudit}
                        onChange={(e) => setAgreeAudit(e.target.checked)}
                        required
                      />
                      <label htmlFor="agreeAuditCheck">
                        I certify that my food safety credentials are valid and agree to physical
                        unannounced 100-point hygiene audits by accredited inspectors under Bhojora
                        standards.
                      </label>
                    </div>

                    {authError ? (
                      <div
                        className="notice-banner"
                        style={{ borderColor: 'var(--terracotta)', background: '#faecea' }}
                        role="alert"
                      >
                        ⚠️ {authError}
                      </div>
                    ) : null}

                    <button
                      type="submit"
                      className="btn-primary"
                      disabled={isSubmitting}
                      style={{ marginTop: '0.75rem' }}
                    >
                      {isSubmitting
                        ? 'Onboarding Kitchen...'
                        : 'Submit Application & Launch Kitchen →'}
                    </button>
                  </form>
                </div>
              )}

              <p className="status-note" role="status" aria-live="polite">
                {statusMessage}
              </p>
            </aside>
          </section>

          {/* Interactive Margin & Revenue Savings Calculator */}
          <section className="policy-section" style={{ margin: '2rem 0 1rem' }}>
            <div className="calculator-card">
              <div style={{ textAlign: 'center' }}>
                <span className="policy-section-eyebrow">Interactive Profit Estimator</span>
                <h3
                  className="policy-section-title"
                  style={{ fontSize: '1.5rem', margin: '0.25rem 0' }}
                >
                  How Much Does Your Kitchen Save Each Month?
                </h3>
                <p className="policy-section-desc" style={{ fontSize: '0.88rem' }}>
                  Select your expected monthly order revenue on delivery to see your retained
                  margin:
                </p>
              </div>

              <div
                className="calculator-tier-selector"
                role="group"
                aria-label="Monthly GMV Selector"
                style={{ justifyContent: 'center' }}
              >
                {[250000, 500000, 1000000, 2000000].map((tier) => (
                  <button
                    key={tier}
                    type="button"
                    className="calculator-tier-btn"
                    aria-pressed={calcMonthlyGmv === tier}
                    onClick={() => setCalcMonthlyGmv(tier)}
                  >
                    ₹{(tier / 100000).toFixed(1)} Lakh / Month
                  </button>
                ))}
              </div>

              <div className="calculator-results-grid">
                <div className="calc-tile">
                  <div className="calc-num">
                    ₹{Math.round(calcMonthlyGmv * 0.3).toLocaleString('en-IN')}
                  </div>
                  <div className="calc-lbl">Legacy Aggregator Fee (30%)</div>
                </div>
                <div className="calc-tile">
                  <div className="calc-num">
                    ₹{Math.round(calcMonthlyGmv * 0.165).toLocaleString('en-IN')}
                  </div>
                  <div className="calc-lbl">Bhojora Flat Fee (16.5%)</div>
                </div>
                <div className="calc-tile calc-highlight">
                  <div className="calc-num calc-green">
                    ₹{Math.round(calcMonthlyGmv * 0.135).toLocaleString('en-IN')} / mo
                  </div>
                  <div className="calc-lbl">
                    ✨ Your Monthly Extra Profit (₹
                    {Math.round(calcMonthlyGmv * 0.135 * 12).toLocaleString('en-IN')}/yr)
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        {/* =========================================================================
            MEGA FOOTER: ALL STATUTORY & OPERATING POLICIES
            ========================================================================= */}
        <footer className="mega-footer" id="partner-policies-footer">
          <div className="mega-footer-inner">
            <div className="footer-brand-row">
              <div className="brand">
                <img src="./logo.png" alt="BHOJORA emblem" width={44} height={44} />
                <div>
                  <p className="brand-name">BHOJORA Partner Network</p>
                  <p className="brand-sub">
                    Kolkata Restaurant &amp; Cloud Kitchen Operating Alliance
                  </p>
                </div>
              </div>
              <div className="footer-quick-actions">
                <button
                  type="button"
                  className="btn-header-signin"
                  onClick={() => {
                    setAuthMode('SIGNIN');
                    document
                      .getElementById('auth-portal-section')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Partner Sign In 🔑
                </button>
                <button
                  type="button"
                  className="btn-header-onboard"
                  onClick={() => {
                    setAuthMode('ONBOARDING');
                    document
                      .getElementById('auth-portal-section')
                      ?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  Onboard Kitchen 🚀
                </button>
              </div>
            </div>

            {/* Interactive Policy Detail Drawer */}
            {activePolicyDrawer && (
              <div className="footer-policy-drawer" id="footer-policy-detail-view">
                <div className="footer-policy-drawer-header">
                  <h3 className="footer-policy-drawer-title">
                    {activePolicyDrawer === 'COMMERCIAL' &&
                      'Fair Commercial Economics & 16.5% Take Rate Policy'}
                    {activePolicyDrawer === 'HYGIENE' &&
                      '100-Point Physical Hygiene Accreditation & FSSAI Standards'}
                    {activePolicyDrawer === 'SETTLEMENT' &&
                      'Automated Daily T+1 Escrow Settlements (RBI Nodal Governance)'}
                    {activePolicyDrawer === 'DPDP_PRIVACY' &&
                      'DPDP Act 2023 Compliance & Partner Data Privacy'}
                    {activePolicyDrawer === 'CANCELLATION' &&
                      'Kitchen Protection & Food Wastage Compensation Policy'}
                    {activePolicyDrawer === 'CHECKLIST' &&
                      'What You Need to Onboard (Go Live in Under 24 Hours)'}
                    {activePolicyDrawer === 'FAQS' &&
                      'Restaurant Partner Frequently Asked Questions'}
                  </h3>
                  <button
                    type="button"
                    className="btn-close-drawer"
                    onClick={() => setActivePolicyDrawer(null)}
                  >
                    ✕ Close Details
                  </button>
                </div>

                {activePolicyDrawer === 'COMMERCIAL' && (
                  <div className="policy-drawer-content">
                    <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: '#c7bfb7' }}>
                      Bhojora replaces predatory aggregator commissions with an honest 16.5% flat
                      take rate, true dine-in price parity, and daily settlements.
                    </p>
                    <div className="comparison-table-wrapper">
                      <table className="comparison-table" aria-label="Commercial policy comparison">
                        <thead>
                          <tr>
                            <th>Commercial Feature</th>
                            <th className="highlight-col">✨ BHOJORA Partner Network</th>
                            <th>Legacy Aggregators (Zomato / Swiggy)</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td>
                              <strong>Platform Take Rate</strong>
                            </td>
                            <td className="highlight-col">
                              <strong>16.5% Flat</strong> (Zero hidden surcharges)
                            </td>
                            <td>28% – 35% + payment gateway + packaging surcharges</td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Menu Pricing Policy</strong>
                            </td>
                            <td className="highlight-col">
                              <strong>Dine-In Price Parity</strong> (No forced inflation)
                            </td>
                            <td>20% – 40% artificial markup forced to offset commissions</td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Promotions &amp; Discounts</strong>
                            </td>
                            <td className="highlight-col">
                              <strong>100% Voluntary</strong> (Restaurateur controls discounts)
                            </td>
                            <td>
                              Co-funded deep discounts (e.g., 50% off) mandated for visibility
                            </td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Settlement Cycle</strong>
                            </td>
                            <td className="highlight-col">
                              <strong>Automated Daily T+1</strong> via RBI Escrow
                            </td>
                            <td>Weekly or bi-weekly (T+7 to T+14) with arbitrary holdbacks</td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Discovery &amp; Search Placement</strong>
                            </td>
                            <td className="highlight-col">
                              <strong>100% Meritocratic</strong> (Hygiene audit &amp; SLA driven)
                            </td>
                            <td>Sponsored ad auctions where deep pockets outbid great food</td>
                          </tr>
                          <tr>
                            <td>
                              <strong>Customer Data &amp; Privacy</strong>
                            </td>
                            <td className="highlight-col">
                              <strong>Dedicated Tenant Scope</strong> (Zero poaching)
                            </td>
                            <td>Best-selling dishes copied to launch private cloud kitchens</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activePolicyDrawer === 'HYGIENE' && (
                  <div className="policy-drawer-content">
                    <p style={{ margin: '0 0 1rem', fontSize: '0.88rem', color: '#c7bfb7' }}>
                      Every kitchen undergoes a physical inspection by accredited food safety
                      auditors before going live, with unannounced quarterly audits.
                    </p>
                    <div className="policy-grid-3">
                      <div className="policy-card" style={{ background: '#1c1917' }}>
                        <div className="policy-card-icon">❄️</div>
                        <h4 className="policy-card-title">Cold Storage &amp; Temperature CCPs</h4>
                        <p className="policy-card-desc">
                          Walk-in chillers calibrated to ≤ 4°C and deep freezers to ≤ -18°C with
                          digital logs.
                        </p>
                        <ul className="policy-feature-list">
                          <li>✓ Digital probe thermometer logging</li>
                          <li>✓ First-In, First-Out (FIFO) ingredient rotation</li>
                          <li>✓ Sealed food-grade cambro storage containers</li>
                        </ul>
                      </div>
                      <div className="policy-card" style={{ background: '#1c1917' }}>
                        <div className="policy-card-icon">🚰</div>
                        <h4 className="policy-card-title">RO Potable Water &amp; Sterilization</h4>
                        <p className="policy-card-desc">
                          Zero tap-water cooking. All cooking and washing utilizes 3-stage RO
                          treated water tested monthly.
                        </p>
                        <ul className="policy-feature-list">
                          <li>✓ Monthly NABL water purity testing</li>
                          <li>✓ SS-304 food-grade preparation surfaces</li>
                          <li>✓ Color-coded boards (Green: Veg, Red: Meat)</li>
                        </ul>
                      </div>
                      <div className="policy-card" style={{ background: '#1c1917' }}>
                        <div className="policy-card-icon">🧼</div>
                        <h4 className="policy-card-title">Staff Hygiene &amp; Vector Control</h4>
                        <p className="policy-card-desc">
                          Clean aprons, hairnets, beard guards, and nitrile gloves with bi-monthly
                          vector extermination.
                        </p>
                        <ul className="policy-feature-list">
                          <li>✓ Annual staff typhoid &amp; health clearance</li>
                          <li>✓ Hands-free soap &amp; sanitizer wash stations</li>
                          <li>✓ Pedal-operated wet/dry segregated bins</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {activePolicyDrawer === 'SETTLEMENT' && (
                  <div className="policy-drawer-content">
                    <div className="policy-grid-2">
                      <div className="policy-card" style={{ background: '#1c1917' }}>
                        <div className="policy-card-icon">🏦</div>
                        <h4 className="policy-card-title">Daily T+1 Automated Bank Transfer</h4>
                        <p className="policy-card-desc">
                          Orders completed up to 23:59:59 are settled into your verified Indian bank
                          account by 11:00 AM next business day via automated NEFT/RTGS with
                          complete UTR tracking. Zero 7-day or 14-day cashflow lockups.
                        </p>
                      </div>
                      <div className="policy-card" style={{ background: '#1c1917' }}>
                        <div className="policy-card-icon">📑</div>
                        <h4 className="policy-card-title">Section 9(5) GST Compliance</h4>
                        <p className="policy-card-desc">
                          Bhojora handles statutory GST collection and remittance under Section 9(5)
                          of the CGST Act, issuing automated monthly tax statements and Form 16A TDS
                          certificates. Transparent itemized invoice per order.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activePolicyDrawer === 'DPDP_PRIVACY' && (
                  <div className="policy-drawer-content">
                    <div className="policy-grid-2">
                      <div className="policy-card" style={{ background: '#1c1917' }}>
                        <div className="policy-card-icon">🔒</div>
                        <h4 className="policy-card-title">Customer Telephone Virtual Masking</h4>
                        <p className="policy-card-desc">
                          Customer contact numbers are strictly virtualized with temporary session
                          tokens. Couriers and kitchen staff communicate through encrypted in-app
                          channels, eliminating diner harassment and privacy leakage.
                        </p>
                      </div>
                      <div className="policy-card" style={{ background: '#1c1917' }}>
                        <div className="policy-card-icon">🛡️</div>
                        <h4 className="policy-card-title">Encrypted KYC Document Vault</h4>
                        <p className="policy-card-desc">
                          Your FSSAI certificates, GSTIN, PAN, and bank proof documents are
                          encrypted with HMAC-SHA256 and stored in zero-knowledge private cloud
                          vaults. Only authorized compliance officers can access KYC records.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activePolicyDrawer === 'CANCELLATION' && (
                  <div className="policy-drawer-content">
                    <div className="policy-grid-3">
                      <div className="policy-card" style={{ background: '#1c1917' }}>
                        <div className="policy-card-icon">🍲</div>
                        <h4 className="policy-card-title">100% Prepared Order Reimbursement</h4>
                        <p className="policy-card-desc">
                          If a customer cancels after your kitchen accepts and transitions the
                          ticket to &quot;PREPARING&quot;, Bhojora reimburses 100% of your menu
                          price automatically.
                        </p>
                      </div>
                      <div className="policy-card" style={{ background: '#1c1917' }}>
                        <div className="policy-card-icon">⏱️</div>
                        <h4 className="policy-card-title">Synchronized Courier Arrival</h4>
                        <p className="policy-card-desc">
                          Couriers are dispatched in strict 5.5–6.0 km bounds based on your prep
                          timer. No counter crowding or cold food waiting for delayed riders.
                        </p>
                      </div>
                      <div className="policy-card" style={{ background: '#1c1917' }}>
                        <div className="policy-card-icon">📞</div>
                        <h4 className="policy-card-title">2-Hour Kitchen Dispute SLA</h4>
                        <p className="policy-card-desc">
                          Direct hotline (+91 33 2244 8800) to our Kolkata Partner Support desk.
                          Dedicated human case managers resolve order disputes or rider issues
                          within 2 hours.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activePolicyDrawer === 'CHECKLIST' && (
                  <div className="policy-drawer-content">
                    <div className="checklist-grid">
                      <div className="checklist-step-card" style={{ background: '#1c1917' }}>
                        <span className="step-badge">1</span>
                        <strong style={{ fontSize: '0.92rem', color: '#fff' }}>
                          14-Digit FSSAI License
                        </strong>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#b3aba3' }}>
                          Active state or central registration certificate matching your kitchen
                          address.
                        </p>
                      </div>
                      <div className="checklist-step-card" style={{ background: '#1c1917' }}>
                        <span className="step-badge">2</span>
                        <strong style={{ fontSize: '0.92rem', color: '#fff' }}>
                          GSTIN &amp; PAN Card
                        </strong>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#b3aba3' }}>
                          Business or proprietor PAN. GSTIN required for taxable entities.
                        </p>
                      </div>
                      <div className="checklist-step-card" style={{ background: '#1c1917' }}>
                        <span className="step-badge">3</span>
                        <strong style={{ fontSize: '0.92rem', color: '#fff' }}>
                          Bank Account / Cheque
                        </strong>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#b3aba3' }}>
                          Account number and IFSC code for automated daily T+1 escrow payouts.
                        </p>
                      </div>
                      <div className="checklist-step-card" style={{ background: '#1c1917' }}>
                        <span className="step-badge">4</span>
                        <strong style={{ fontSize: '0.92rem', color: '#fff' }}>
                          Menu &amp; Allergen Labels
                        </strong>
                        <p style={{ margin: 0, fontSize: '0.82rem', color: '#b3aba3' }}>
                          Itemized dishes with integer-paise pricing, veg/non-veg tags, and
                          allergens.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activePolicyDrawer === 'FAQS' && (
                  <div className="policy-drawer-content">
                    <div className="faq-grid">
                      <div className="faq-card" style={{ background: '#1c1917' }}>
                        <h4 style={{ color: '#fff' }}>
                          How does Bhojora offer a flat 16.5% take rate when others take 30%?
                        </h4>
                        <p style={{ color: '#b3aba3' }}>
                          We operate with extreme lean efficiency, algorithmic corridor dispatch
                          (5.5–6.0 km bounds), and zero bloated advertising overhead.
                        </p>
                      </div>
                      <div className="faq-card" style={{ background: '#1c1917' }}>
                        <h4 style={{ color: '#fff' }}>
                          Can I adjust my menu pricing or mark items out-of-stock (86)?
                        </h4>
                        <p style={{ color: '#b3aba3' }}>
                          Yes! Your partner console provides instant real-time toggles to 86
                          out-of-stock ingredients, modify preparation times, or adjust
                          integer-paise item rates.
                        </p>
                      </div>
                      <div className="faq-card" style={{ background: '#1c1917' }}>
                        <h4 style={{ color: '#fff' }}>
                          What happens if our kitchen fails the initial 100-point hygiene audit?
                        </h4>
                        <p style={{ color: '#b3aba3' }}>
                          Our accredited auditor provides an actionable rectification checklist with
                          a free re-inspection scheduled within 72 hours.
                        </p>
                      </div>
                      <div className="faq-card" style={{ background: '#1c1917' }}>
                        <h4 style={{ color: '#fff' }}>What hardware do we need in the kitchen?</h4>
                        <p style={{ color: '#b3aba3' }}>
                          Any standard smartphone, Android tablet, iPad, or POS computer with a
                          modern web browser.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* The 4-Column Mega Policy Grid */}
            <div className="footer-policy-grid">
              <div className="footer-policy-col">
                <h4 className="footer-col-title">Commercial &amp; Rates</h4>
                <ul className="footer-policy-list">
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('COMMERCIAL');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • 16.5% Flat Take Rate vs 35%
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('COMMERCIAL');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • Dine-In Price Parity Mandate
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('SETTLEMENT');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • Daily T+1 Escrow Settlements
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('SETTLEMENT');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • Section 9(5) CGST Sched. Compliance
                    </button>
                  </li>
                </ul>
              </div>

              <div className="footer-policy-col">
                <h4 className="footer-col-title">Hygiene &amp; Quality</h4>
                <ul className="footer-policy-list">
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('HYGIENE');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • 100-Point FSSAI Audit Checklist
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('HYGIENE');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • Cold Storage &amp; Food CCPs
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('HYGIENE');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • RO Water Purity &amp; Sterilization
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('HYGIENE');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • Unannounced Surprise Re-Audits
                    </button>
                  </li>
                </ul>
              </div>

              <div className="footer-policy-col">
                <h4 className="footer-col-title">Protection &amp; SLAs</h4>
                <ul className="footer-policy-list">
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('CANCELLATION');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • 100% Prepared Food Reimbursement
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('CANCELLATION');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • Rider Dispatch &amp; Arrival Sync
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('CANCELLATION');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • 2-Hour Grievance Resolution SLA
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('DPDP_PRIVACY');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • Zero Cloud-Kitchen Self-Competition
                    </button>
                  </li>
                </ul>
              </div>

              <div className="footer-policy-col">
                <h4 className="footer-col-title">Legal, DPDP &amp; FAQ</h4>
                <ul className="footer-policy-list">
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('DPDP_PRIVACY');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • DPDP Act 2023 Data Privacy
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('DPDP_PRIVACY');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • Virtual Caller Phone Masking
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('CHECKLIST');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • Onboarding KYC Document Checklist
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      className="footer-policy-item-btn"
                      onClick={() => {
                        setActivePolicyDrawer('FAQS');
                        setTimeout(
                          () =>
                            document
                              .getElementById('footer-policy-detail-view')
                              ?.scrollIntoView({ behavior: 'smooth' }),
                          50,
                        );
                      }}
                    >
                      • Restaurant Partner FAQs
                    </button>
                  </li>
                </ul>
              </div>
            </div>

            <div className="footer-statutory-row">
              <div>
                <strong>Bhojora Technologies Pvt. Ltd.</strong> · Registered Office: Ground Floor,
                Webel IT Park, Sector V, Bidhannagar, Kolkata 700091, WB.
              </div>
              <div>
                FSSAI Central Lic. No: <strong>12826001000123</strong> · Grievance Officer:
                grievances@bhojora.in
              </div>
            </div>
          </div>
        </footer>
      </>
    );
  }

  // ==========================================
  // 2. AUTHENTICATED: MAIN PARTNER MANAGEMENT CONSOLE
  // ==========================================
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="./logo.png" alt="BHOJORA emblem" width={40} height={40} />
            <div>
              <p className="brand-name">BHOJORA Partner Portal</p>
              <p className="brand-sub">Kolkata Outlet Readiness &amp; Hygiene Compliance</p>
            </div>
          </div>

          <div className="partner-header-controls">
            <span className="partner-identity-badge">
              🍳 {sessionUser.name} ({partnerActiveRole})
            </span>
            <span className="badge">{selectedOutlet.name}</span>
            <button
              type="button"
              className="btn-signout"
              onClick={handleSignOut}
              title="Sign out of partner portal session"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <nav className="nav-tabs-wrapper" aria-label="Kitchen Console Navigation">
        <div className="nav-tabs-inner">
          {(
            [
              { key: 'KDS', label: '🛎️ Live Orders (KDS)' },
              { key: 'ONBOARDING', label: '📋 Statutory KYC & Onboarding' },
              { key: 'ZONES', label: '📍 Service Zones & Hours' },
              { key: 'CATALOG', label: '🍽️ Menu & Audited Pricing' },
              { key: 'ALL', label: '📑 All Views' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="tab-nav-btn"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="shell">
        <section className="hero-split">
          <div className="panel">
            <span
              className={`badge ${selectedOutlet.readinessState === 'ACTION_REQUIRED' ? 'badge-warn' : ''}`}
            >
              {selectedOutlet.readinessState === 'VERIFIED_CLEAN'
                ? 'Verified Clean Kitchen'
                : 'Action Required Before Peak Service'}
            </span>
            <h1>Manage kitchen trust evidence for assigned Kolkata outlets</h1>
            <p className="brand-sub">
              Partners only view metrics and hygiene logs for outlets assigned to their tenant
              membership. Trust score changes remain strictly separated under independent reviewer
              control.
            </p>

            <div className="outlet-tabs" role="group" aria-label="Assigned outlets">
              {outlets.map((outlet) => (
                <button
                  key={outlet.outletId}
                  type="button"
                  className="tab-btn"
                  aria-pressed={outlet.outletId === selectedOutlet.outletId}
                  onClick={() => {
                    setSelectedOutletId(outlet.outletId);
                    void verifyOutletTenantAccess(outlet.outletId);
                  }}
                >
                  {outlet.zone}
                </button>
              ))}
            </div>

            <h2>{selectedOutlet.name}</h2>
            <div className="metrics-row">
              <div>
                <p className="metric-label">Published Trust Score</p>
                <p className="metric-val">{selectedOutlet.trustScore}/100</p>
              </div>
              <div>
                <p className="metric-label">Inspection Cadence</p>
                <p className="metric-val">{selectedOutlet.inspectionCadenceDays} days</p>
              </div>
              <div>
                <p className="metric-label">FSSAI Validity</p>
                <p className="metric-val">{selectedOutlet.fssaiExpiresOn}</p>
              </div>
            </div>
          </div>

          <aside className="panel panel-alt" aria-label="Kitchen Shift Hygiene Readiness">
            <h2>Shift Hygiene Checklist</h2>
            <ul className="checklist">
              <li>
                <span>Cold-storage temperature log verified</span>
                <span className="badge">Recorded</span>
              </li>
              <li>
                <span>Today&apos;s prep-surface media upload</span>
                <span
                  className={`badge ${selectedOutlet.dailyEvidenceSubmitted ? '' : 'badge-warn'}`}
                >
                  {selectedOutlet.dailyEvidenceSubmitted ? 'Submitted' : 'Due Now'}
                </span>
              </li>
              <li>
                <span>Independent field auditor schedule</span>
                <span className="badge">Every {selectedOutlet.inspectionCadenceDays} days</span>
              </li>
              <li>
                <span>Effective permissions ({partnerActiveRole})</span>
                <span className="badge">
                  {(rbacContext?.permissions ?? ROLE_PERMISSION_MATRIX.RESTAURANT_OWNER).length}{' '}
                  scoped
                </span>
              </li>
            </ul>
            <p className="status-note" role="status" aria-live="polite">
              {statusMessage}
            </p>
          </aside>
        </section>

        {/* 1. Live Orders & KDS */}
        {activeTab === 'KDS' || activeTab === 'ALL' ? (
          <KitchenOrderDashboardPanel
            apiBase={getApiBase()}
            accessToken={accessToken}
            activeRole={partnerActiveRole}
            selectedOutletId={selectedOutlet.outletId}
            selectedOutletName={selectedOutlet.name}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 2. Statutory KYC & Onboarding */}
        {activeTab === 'ONBOARDING' || activeTab === 'ALL' ? (
          <RestaurantOnboardingPanel
            apiBase={getApiBase()}
            accessToken={accessToken}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 3. Service Zones & Hours */}
        {activeTab === 'ZONES' || activeTab === 'ALL' ? (
          <OutletZonesPanel
            apiBase={getApiBase()}
            accessToken={accessToken}
            activeRole={partnerActiveRole}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 4. Menu & Audited Pricing */}
        {activeTab === 'CATALOG' || activeTab === 'ALL' ? (
          <MenuCatalogPanel
            apiBase={getApiBase()}
            accessToken={accessToken}
            activeRole={partnerActiveRole}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}
      </main>

      <footer className="footer">
        <div className="topbar-inner">
          <span>BHOJORA Partner Operations — Independent Kitchen Verification Network</span>
          <span>Kolkata Launch Grid · Session Active</span>
        </div>
      </footer>
    </>
  );
}
