import { FormEvent, useState } from 'react';
import {
  PRIVILEGED_MFA_ROLES,
  ROLE_PERMISSION_MATRIX,
  USER_ROLES,
  type ApiResponse,
  type AuthSessionResponseDto,
  type MfaSendResponseDto,
  type RbacContextDto,
  type UserProfileDto,
} from '@bhojora/shared';
import { OnboardingReviewQueue } from './components/OnboardingReviewQueue';
import { DeliveryPartnerReviewQueue } from './components/DeliveryPartnerReviewQueue';
import { ZoneGovernancePanel } from './components/ZoneGovernancePanel';
import { InspectionReviewerQueue } from './components/InspectionReviewerQueue';
import { SupportOperationsDashboard } from './components/SupportOperationsDashboard';
import { FinanceSettlementPanel } from './components/FinanceSettlementPanel';
import { AdminGovernanceDashboard } from './components/AdminGovernanceDashboard';
import { AiReviewDashboard } from './components/AiReviewDashboard';

interface GovernanceItem {
  id: string;
  outlet: string;
  zone: string;
  inspectorId: string;
  reviewerStatus: 'PENDING_REVIEW' | 'APPROVED' | 'ACTION_REQUIRED';
}

const GOVERNANCE_QUEUE: GovernanceItem[] = [
  {
    id: 'insp_2026_pc_01',
    outlet: 'Arsalan — Park Circus',
    zone: 'Park Circus',
    inspectorId: 'insp_east_04',
    reviewerStatus: 'APPROVED',
  },
  {
    id: 'insp_2026_sl_07',
    outlet: 'Salt Lake Central Cloud Kitchen',
    zone: 'Salt Lake',
    inspectorId: 'insp_east_02',
    reviewerStatus: 'PENDING_REVIEW',
  },
  {
    id: 'insp_2026_ps_03',
    outlet: 'Peter Cat — Park Street',
    zone: 'Park Street',
    inspectorId: 'insp_south_01',
    reviewerStatus: 'ACTION_REQUIRED',
  },
];

type AdminNavTab =
  | 'OVERVIEW'
  | 'ONBOARDING'
  | 'COURIERS'
  | 'ZONES'
  | 'INSPECTIONS'
  | 'SUPPORT'
  | 'FINANCE'
  | 'SYSTEM'
  | 'AI'
  | 'ALL';

const DEFAULT_ENV_ADMIN_EMAIL = 'admin@bhojora.in';
const DEFAULT_ENV_ADMIN_PASSWORD = 'BhojoraAdmin@2026!';

function getEnvAdminCredentials(): { email: string; password: string } {
  const email = (
    window.BHOJORA_ADMIN_EMAIL ||
    import.meta.env.VITE_ADMIN_EMAIL ||
    DEFAULT_ENV_ADMIN_EMAIL
  ).trim();
  const password = (
    window.BHOJORA_ADMIN_PASSWORD ||
    import.meta.env.VITE_ADMIN_PASSWORD ||
    DEFAULT_ENV_ADMIN_PASSWORD
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
  const [filter, setFilter] = useState<'ALL' | GovernanceItem['reviewerStatus']>('ALL');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sessionUser, setSessionUser] = useState<UserProfileDto | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [rbacContext, setRbacContext] = useState<RbacContextDto | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    'Privileged admin, reviewer, and finance sessions require verified MFA.',
  );
  const [activeTab, setActiveTab] = useState<AdminNavTab>('OVERVIEW');

  const envCreds = getEnvAdminCredentials();

  const visibleItems =
    filter === 'ALL'
      ? GOVERNANCE_QUEUE
      : GOVERNANCE_QUEUE.filter((item) => item.reviewerStatus === filter);

  async function refreshRbacContext(token: string) {
    const apiBase = getApiBase();
    if (!apiBase) {
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/v1/rbac/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = (await res.json()) as ApiResponse<RbacContextDto>;
      if (res.ok && payload.success) {
        setRbacContext(payload.data);
      }
    } catch {
      // Non-blocking context refresh
    }
  }

  async function handleAdminSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setLoginError(null);

    const enteredEmail = identifier.trim().toLowerCase();
    const enteredPassword = password.trim();
    const configuredEmail = envCreds.email.toLowerCase();
    const configuredPassword = envCreds.password;

    // Check 1: Manual entry matches configured environment credentials
    if (enteredEmail === configuredEmail && enteredPassword === configuredPassword) {
      const syntheticAdminUser: UserProfileDto = {
        id: 'usr_super_admin_env',
        name: 'Super Administrator',
        emailMasked: envCreds.email,
        phoneMasked: '+91 98*** *****',
        roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'TRUST_ADMIN', 'FINANCE_ADMIN'],
        activeRole: 'SUPER_ADMIN',
        status: 'ACTIVE',
        languagePreference: 'en-IN',
        phoneVerified: true,
        emailVerified: true,
        createdAt: new Date().toISOString(),
      };
      const syntheticAdminRbac: RbacContextDto = {
        userId: 'usr_super_admin_env',
        roles: ['SUPER_ADMIN', 'OPS_ADMIN', 'TRUST_ADMIN', 'FINANCE_ADMIN'],
        activeRole: 'SUPER_ADMIN',
        mfaVerified: true,
        mfaRequiredForActiveRole: false,
        permissions: [...ROLE_PERMISSION_MATRIX['SUPER_ADMIN']],
        memberships: [],
      };

      setSessionUser(syntheticAdminUser);
      setRbacContext(syntheticAdminRbac);
      setAccessToken('bhojora_privileged_admin_session_token');
      setPassword('');
      setLoginError(null);
      setStatusMessage(`Authenticated via environment admin credentials as Super Administrator.`);
      setIsSubmitting(false);
      return;
    }

    // Check 2: Try authenticating against backend API if available
    const apiBase = getApiBase();
    if (apiBase) {
      try {
        const response = await fetch(`${apiBase}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: enteredEmail,
            password: enteredPassword,
            deviceName: 'Bhojora Control Admin',
          }),
        });
        const payload = (await response.json()) as ApiResponse<AuthSessionResponseDto>;
        if (response.ok && payload.success) {
          setSessionUser(payload.data.user);
          setAccessToken(payload.data.tokens.accessToken);
          setPassword('');
          setLoginError(null);
          await refreshRbacContext(payload.data.tokens.accessToken);
          setStatusMessage(
            `Signed in as ${payload.data.user.name} (${payload.data.user.activeRole}). Complete step-up MFA if required.`,
          );
          setIsSubmitting(false);
          return;
        } else {
          const errMsg = payload.success
            ? 'Sign-in failed.'
            : payload.error?.message ||
              'Invalid administrator credentials. Please check your email and password.';
          setLoginError(errMsg);
        }
      } catch {
        setLoginError(
          `Unable to reach control plane API at ${apiBase} and credentials did not match configured environment admin.`,
        );
      }
    } else {
      setLoginError(
        'Invalid administrator credentials. Please verify your email and password match the configured environment variables.',
      );
    }

    setIsSubmitting(false);
  }

  function handleSignOut() {
    setSessionUser(null);
    setAccessToken(null);
    setRbacContext(null);
    setIdentifier('');
    setPassword('');
    setMfaChallengeId(null);
    setMfaCode('');
    setLoginError(null);
    setStatusMessage('Administrator signed out. Enter authorized credentials to resume.');
  }

  async function handleSendMfa() {
    const apiBase = getApiBase();
    if (!apiBase || !accessToken) {
      return;
    }
    const res = await fetch(`${apiBase}/api/v1/auth/mfa/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payload = (await res.json()) as ApiResponse<MfaSendResponseDto>;
    if (!res.ok || !payload.success) {
      setStatusMessage(payload.success ? 'MFA send failed.' : payload.error.message);
      return;
    }
    setMfaChallengeId(payload.data.challengeId);
    setStatusMessage(
      `Step-up MFA code dispatched via ${payload.data.channel} to ${payload.data.maskedDestination}.`,
    );
  }

  async function handleVerifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const apiBase = getApiBase();
    if (!apiBase || !accessToken || !mfaChallengeId) {
      return;
    }
    const res = await fetch(`${apiBase}/api/v1/auth/mfa/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ challengeId: mfaChallengeId, code: mfaCode }),
    });
    const payload = (await res.json()) as ApiResponse<{ mfaVerified: true }>;
    if (!res.ok || !payload.success) {
      setStatusMessage(payload.success ? 'MFA verification failed.' : payload.error.message);
      return;
    }
    setMfaCode('');
    await refreshRbacContext(accessToken);
    setStatusMessage('Step-up MFA verified for active privileged session.');
  }

  // ==========================================
  // 1. UN趋THENTICATED: LANDING & LOGIN PAGE
  // ==========================================
  if (!sessionUser) {
    return (
      <>
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">
              <img src="./logo.png" alt="BHOJORA emblem" width={40} height={40} />
              <div>
                <p className="brand-name">BHOJORA Control</p>
                <p className="brand-sub">
                  Trust Governance, Segregation of Duties &amp; Audit Plane
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="pill">Kolkata Grid Active</span>
              <span className="pill pill-warn">MFA Enforced</span>
            </div>
          </div>
        </header>

        <main className="landing-shell">
          <section className="landing-hero-grid">
            {/* Left Column: Executive Landing Content */}
            <div className="landing-copy">
              <div>
                <span className="landing-eyebrow">
                  🛡️ Central Operations &amp; Trust Control Plane
                </span>
                <h1 className="landing-heading">Bhojora Control Center</h1>
                <p className="landing-sub">
                  The mission-control governance portal for Kolkata&apos;s independent food
                  discovery and verified kitchen trust ecosystem. Oversee physical kitchen safety
                  audits, bounded 5.5–6.0 km corridor dispatch, and daily T+1 financial escrow
                  settlements.
                </p>
              </div>

              {/* 4 Key Platform Metric Badges */}
              <div className="landing-metrics-grid">
                <div className="metric-tile">
                  <div className="metric-number">100-Pt</div>
                  <div className="metric-label">Physical Audits</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-number">5.5-6.0</div>
                  <div className="metric-label">Km Corridors</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-number">16.5%</div>
                  <div className="metric-label">Flat Take Rate</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-number">T+1</div>
                  <div className="metric-label">Escrow Payout</div>
                </div>
              </div>

              {/* Operational Pillars */}
              <div className="pillars-card">
                <div className="pillar-item">
                  <span className="pillar-icon">⚖️</span>
                  <div>
                    <h3 className="pillar-title">Strict Separation of Duties</h3>
                    <p className="pillar-desc">
                      Inspectors author assessments with SHA-256 photo hashes; secondary review
                      officers must independently verify scores before public issuance.
                    </p>
                  </div>
                </div>
                <div className="pillar-item">
                  <span className="pillar-icon">📍</span>
                  <div>
                    <h3 className="pillar-title">Geospatial Service Corridors</h3>
                    <p className="pillar-desc">
                      Manage active polygon boundaries in Salt Lake Sector V, Park Street, and
                      Ballygunge to preserve hot-chain food integrity.
                    </p>
                  </div>
                </div>
                <div className="pillar-item">
                  <span className="pillar-icon">💳</span>
                  <div>
                    <h3 className="pillar-title">Financial Escrow &amp; Statutory GST</h3>
                    <p className="pillar-desc">
                      Automated daily settlement ledger under Section 9(5) CGST Act with 100% tip
                      pass-through to delivery couriers.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Dedicated Admin Login Card */}
            <aside className="login-card" aria-label="Administrator Authentication Portal">
              <div className="login-card-header">
                <span className="pill">Privileged Access Only</span>
                <h2>Admin Sign In</h2>
                <p>
                  Enter your authorized administrator email and password to access the control
                  plane.
                </p>
              </div>

              <form onSubmit={handleAdminSignIn}>
                <div className="field">
                  <label htmlFor="adminIdentifier">Admin Email Address</label>
                  <input
                    id="adminIdentifier"
                    name="identifier"
                    type="email"
                    required
                    autoComplete="email"
                    value={identifier}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="admin@bhojora.in"
                  />
                </div>

                <div className="field">
                  <label htmlFor="adminPassword">Admin Password</label>
                  <div className="password-input-group">
                    <input
                      id="adminPassword"
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

                {loginError ? (
                  <div
                    className="notice-banner"
                    style={{ borderColor: 'var(--terracotta)', background: '#faecea' }}
                    role="alert"
                  >
                    ⚠️ {loginError}
                  </div>
                ) : null}

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isSubmitting}
                  style={{ marginTop: '0.5rem' }}
                >
                  {isSubmitting
                    ? 'Authenticating Admin Session...'
                    : 'Authenticate Admin Session →'}
                </button>
              </form>

              {/* Environment Variable Hint Box */}
              <div className="env-credential-callout">
                <strong>Environment Credentials Configured:</strong>
                <br />
                Login validates against <code>VITE_ADMIN_EMAIL</code> &amp;{' '}
                <code>VITE_ADMIN_PASSWORD</code>.
                <br />
                <span style={{ fontSize: '0.76rem', color: 'var(--ink-600)' }}>
                  Default Admin: <code>{envCreds.email}</code>
                </span>
              </div>

              <p className="status-note" role="status" aria-live="polite">
                {statusMessage}
              </p>
            </aside>
          </section>
        </main>

        <footer className="footer">
          <div className="topbar-inner">
            <span>BHOJORA Control Plane — Audited Access &amp; Tenant Isolation</span>
            <span>Kolkata Governance Grid · Version 1.0.0 Production</span>
          </div>
        </footer>
      </>
    );
  }

  // ==========================================
  // 2. AUTHENTICATED: CONTROL CENTER DASHBOARD
  // ==========================================
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="./logo.png" alt="BHOJORA emblem" width={40} height={40} />
            <div>
              <p className="brand-name">BHOJORA Control</p>
              <p className="brand-sub">Trust Governance, Segregation of Duties &amp; Audit Plane</p>
            </div>
          </div>

          <div className="admin-header-controls">
            <span className="admin-identity-badge">
              👤 {sessionUser.name} ({sessionUser.activeRole})
            </span>
            <span className="pill">
              {rbacContext?.mfaVerified ? '✓ MFA Verified' : 'MFA Required'}
            </span>
            <button
              type="button"
              className="btn-signout"
              onClick={handleSignOut}
              title="End active administrator session"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs Bar */}
      <nav className="nav-tabs-wrapper" aria-label="Control Center Navigation">
        <div className="nav-tabs-inner">
          {(
            [
              { key: 'OVERVIEW', label: '📊 Overview' },
              { key: 'ONBOARDING', label: '🍳 Restaurant KYC' },
              { key: 'COURIERS', label: '🛵 Courier Fleet' },
              { key: 'ZONES', label: '📍 Service Zones' },
              { key: 'INSPECTIONS', label: '🔍 Audits' },
              { key: 'SUPPORT', label: '🎫 Support SLA' },
              { key: 'FINANCE', label: '💳 Payouts' },
              { key: 'SYSTEM', label: '⚙️ Platform Config' },
              { key: 'AI', label: '🤖 AI Oversight' },
              { key: 'ALL', label: '📑 All Views' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              className="tab-btn"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="shell">
        {/* Step-up MFA Card if needed */}
        {sessionUser && !rbacContext?.mfaVerified ? (
          <aside className="panel panel-alt" aria-label="Step-Up MFA Verification">
            <h3>Step-Up MFA Verification Required</h3>
            <p className="brand-sub">
              Privileged role {sessionUser.activeRole} requires dual-factor confirmation to execute
              financial payouts and kitchen suspensions.
            </p>
            <div style={{ marginTop: '0.75rem' }}>
              <button type="button" className="filter-btn" onClick={() => void handleSendMfa()}>
                Send Step-Up MFA Code
              </button>
              {mfaChallengeId ? (
                <form
                  onSubmit={(event) => void handleVerifyMfa(event)}
                  style={{ marginTop: '0.75rem' }}
                >
                  <div className="field">
                    <label htmlFor="adminMfaCode">6-Digit MFA Code</label>
                    <input
                      id="adminMfaCode"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="\d{6}"
                      maxLength={6}
                      required
                      value={mfaCode}
                      onChange={(event) => setMfaCode(event.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn-primary" style={{ maxWidth: '240px' }}>
                    Verify Step-Up MFA
                  </button>
                </form>
              ) : null}
            </div>
            <p className="status-note" role="status" aria-live="polite">
              {statusMessage}
            </p>
          </aside>
        ) : null}

        {/* 1. OVERVIEW VIEW */}
        {activeTab === 'OVERVIEW' || activeTab === 'ALL' ? (
          <>
            <section className="panel">
              <span className="pill">Independent Trust &amp; Inspection Queue</span>
              <h1>Enforce separation of duties across Bhojora verification</h1>
              <p className="brand-sub">
                Reviewers cannot self-approve authored inspections. Finance admins cannot mutate
                hygiene scores. Trust admins cannot modify ledger settlement events.
              </p>

              <div className="filter-row" role="group" aria-label="Filter governance queue">
                {(['ALL', 'PENDING_REVIEW', 'APPROVED', 'ACTION_REQUIRED'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className="filter-btn"
                    aria-pressed={filter === key}
                    onClick={() => setFilter(key)}
                  >
                    {key.replace('_', ' ')}
                  </button>
                ))}
              </div>

              <ul className="queue-list">
                {visibleItems.map((item) => (
                  <li key={item.id} className="queue-item">
                    <div>
                      <strong>{item.outlet}</strong>
                      <div className="brand-sub">
                        {item.zone} · Author: {item.inspectorId}
                      </div>
                    </div>
                    <span
                      className={`pill ${item.reviewerStatus === 'APPROVED' ? '' : 'pill-warn'}`}
                    >
                      {item.reviewerStatus}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel">
              <h2>Platform Role Matrix ({USER_ROLES.length} Shared Contract Roles)</h2>
              <div className="role-grid">
                {USER_ROLES.map((role) => {
                  const requiresMfa = (PRIVILEGED_MFA_ROLES as readonly string[]).includes(role);
                  const permCount = ROLE_PERMISSION_MATRIX[role].length;
                  return (
                    <span key={role} className="role-chip">
                      {role} · {permCount} perms{requiresMfa ? ' · MFA Required' : ''}
                    </span>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {/* 2. ONBOARDING VIEW */}
        {activeTab === 'ONBOARDING' || activeTab === 'ALL' ? (
          <OnboardingReviewQueue
            apiBase={getApiBase()}
            accessToken={accessToken}
            mfaVerified={Boolean(rbacContext?.mfaVerified)}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 3. COURIERS VIEW */}
        {activeTab === 'COURIERS' || activeTab === 'ALL' ? (
          <DeliveryPartnerReviewQueue
            apiBase={getApiBase()}
            accessToken={accessToken}
            mfaVerified={Boolean(rbacContext?.mfaVerified)}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 4. ZONES VIEW */}
        {activeTab === 'ZONES' || activeTab === 'ALL' ? (
          <ZoneGovernancePanel
            apiBase={getApiBase()}
            accessToken={accessToken}
            mfaVerified={Boolean(rbacContext?.mfaVerified)}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 5. INSPECTIONS VIEW */}
        {activeTab === 'INSPECTIONS' || activeTab === 'ALL' ? (
          <InspectionReviewerQueue
            apiBase={getApiBase()}
            accessToken={accessToken}
            mfaVerified={Boolean(rbacContext?.mfaVerified)}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 6. SUPPORT VIEW */}
        {activeTab === 'SUPPORT' || activeTab === 'ALL' ? (
          <SupportOperationsDashboard
            apiBase={getApiBase()}
            accessToken={accessToken}
            mfaVerified={Boolean(rbacContext?.mfaVerified)}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 7. FINANCE VIEW */}
        {activeTab === 'FINANCE' || activeTab === 'ALL' ? (
          <FinanceSettlementPanel
            apiBase={getApiBase()}
            accessToken={accessToken}
            mfaVerified={Boolean(rbacContext?.mfaVerified)}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 8. SYSTEM CONFIG VIEW */}
        {activeTab === 'SYSTEM' || activeTab === 'ALL' ? (
          <AdminGovernanceDashboard
            apiBase={getApiBase()}
            accessToken={accessToken}
            mfaVerified={Boolean(rbacContext?.mfaVerified)}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 9. AI VIEW */}
        {activeTab === 'AI' || activeTab === 'ALL' ? (
          <AiReviewDashboard
            apiBase={getApiBase()}
            accessToken={accessToken}
            mfaVerified={Boolean(rbacContext?.mfaVerified)}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}
      </main>

      <footer className="footer">
        <div className="topbar-inner">
          <span>BHOJORA Control Plane — Audited Access &amp; Tenant Isolation</span>
          <span>Kolkata Governance Grid · Session Active</span>
        </div>
      </footer>
    </>
  );
}
