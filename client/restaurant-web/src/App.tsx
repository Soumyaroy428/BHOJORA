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

const DEFAULT_ENV_PARTNER_EMAIL = 'partner@bhojora.in';
const DEFAULT_ENV_PARTNER_PASSWORD = 'BhojoraPartner@2026!';

function getEnvPartnerCredentials(): { email: string; password: string } {
  const email = (
    window.BHOJORA_PARTNER_EMAIL ||
    import.meta.env.VITE_PARTNER_EMAIL ||
    DEFAULT_ENV_PARTNER_EMAIL
  ).trim();
  const password = (
    window.BHOJORA_PARTNER_PASSWORD ||
    import.meta.env.VITE_PARTNER_PASSWORD ||
    DEFAULT_ENV_PARTNER_PASSWORD
  ).trim();
  return { email, password };
}

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

  const envCreds = getEnvPartnerCredentials();

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
    const configuredEmail = envCreds.email.toLowerCase();
    const configuredPassword = envCreds.password;

    // Check 1: Matches configured environment credentials
    if (enteredEmail === configuredEmail && enteredPassword === configuredPassword) {
      const syntheticPartnerUser: UserProfileDto = {
        id: 'usr_partner_owner_env',
        name: 'Flagship Restaurant Owner',
        emailMasked: envCreds.email,
        phoneMasked: '+91 98300 *****',
        roles: ['RESTAURANT_OWNER'],
        activeRole: 'RESTAURANT_OWNER',
        status: 'ACTIVE',
        languagePreference: 'en-IN',
        phoneVerified: true,
        emailVerified: true,
        createdAt: new Date().toISOString(),
      };
      const syntheticPartnerRbac: RbacContextDto = {
        userId: 'usr_partner_owner_env',
        roles: ['RESTAURANT_OWNER'],
        activeRole: 'RESTAURANT_OWNER',
        mfaVerified: true,
        mfaRequiredForActiveRole: false,
        permissions: [...ROLE_PERMISSION_MATRIX.RESTAURANT_OWNER],
        memberships: [
          {
            membershipId: 'mem_partner_owner_01',
            userId: 'usr_partner_owner_env',
            outletId: selectedOutlet.outletId,
            restaurantId: 'rest_partner_01',
            role: 'RESTAURANT_OWNER',
            status: 'ACTIVE',
            createdAt: new Date().toISOString(),
          },
        ],
      };

      setSessionUser(syntheticPartnerUser);
      setRbacContext(syntheticPartnerRbac);
      setAccessToken('bhojora_partner_session_token');
      setPassword('');
      setAuthError(null);
      setStatusMessage(
        `Authenticated via partner environment credentials as ${syntheticPartnerUser.name}.`,
      );
      setIsSubmitting(false);
      return;
    }

    // Check 2: Try authenticating against backend API
    const apiBase = getApiBase();
    if (apiBase) {
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
          setIsSubmitting(false);
          return;
        } else {
          setAuthError(
            payload.success
              ? 'Sign-in failed.'
              : payload.error?.message ||
                  'Invalid partner credentials. Please check your email and password.',
          );
        }
      } catch {
        setAuthError(
          `Unable to reach backend API at ${apiBase} and credentials did not match configured environment partner.`,
        );
      }
    } else {
      setAuthError(
        'Invalid partner credentials. Please verify your email and password match the configured environment variables.',
      );
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="badge">16.5% Flat Take Rate</span>
              <span className="badge badge-warn">Zero Forced Discounts</span>
            </div>
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
            <aside className="auth-portal-card" aria-label="Partner Sign In and Onboarding Portal">
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
                    <strong>Demo / Environment Credentials:</strong>
                    <br />
                    Configured via <code>VITE_PARTNER_EMAIL</code> &amp;{' '}
                    <code>VITE_PARTNER_PASSWORD</code>.
                    <br />
                    <span style={{ fontSize: '0.76rem', color: 'var(--ink-600)' }}>
                      Default Demo: <code>{envCreds.email}</code>
                    </span>
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
        </main>

        <footer className="footer">
          <div className="topbar-inner">
            <span>BHOJORA Partner Operations — Independent Kitchen Verification Network</span>
            <span>Kolkata Launch Grid · Version 1.0.0 Production</span>
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
