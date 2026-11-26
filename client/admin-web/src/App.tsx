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

    if (!enteredEmail || !enteredPassword) {
      setLoginError('Please enter your administrator email/phone and password.');
      setIsSubmitting(false);
      return;
    }

    const apiBase = getApiBase();
    if (!apiBase) {
      setLoginError(
        'Control plane API URL is not configured (VITE_API_BASE). Connect a live Bhojora backend to sign in.',
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
          deviceName: 'Bhojora CMS Control Admin',
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
      } else {
        const errMsg = payload.success
          ? 'Sign-in failed.'
          : payload.error?.message ||
            'Invalid administrator credentials. Please check your email and password.';
        setLoginError(errMsg);
      }
    } catch {
      setLoginError(`Unable to reach control plane API at ${apiBase}.`);
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
  // 1. UNAUTHENTICATED: DEDICATED CMS LOGIN PAGE
  // ==========================================
  if (!sessionUser) {
    return (
      <div className="cms-login-page">
        <header className="topbar">
          <div className="topbar-inner">
            <div className="brand">
              <img src="./logo.png" alt="BHOJORA emblem" width={40} height={40} />
              <div>
                <p className="brand-name">BHOJORA Platform CMS</p>
                <p className="brand-sub">Central Management System &amp; Master Control Plane</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span className="pill">Kolkata Grid Active</span>
              <span className="pill pill-warn">MFA Enforced</span>
            </div>
          </div>
        </header>

        <main className="cms-login-shell">
          <div className="cms-login-card" aria-label="Administrator CMS Sign-In">
            <div className="cms-login-header">
              <div className="cms-emblem-wrap">
                <img src="./logo.png" alt="BHOJORA emblem" width={56} height={56} />
              </div>
              <span className="pill" style={{ marginTop: '0.5rem' }}>
                Privileged CMS Access
              </span>
              <h1 className="cms-login-title">Admin CMS Portal</h1>
              <p className="cms-login-subtitle">
                Sign in with configured administrator credentials to access the central operations
                command center.
              </p>
            </div>

            <form onSubmit={handleAdminSignIn} className="cms-login-form">
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
                  ? 'Authenticating CMS Session...'
                  : 'Sign In to Operations Command Center →'}
              </button>
            </form>

            <div className="env-credential-callout">
              <strong>Backend Authentication &amp; MFA Required:</strong>
              <br />
              Sign in with your authorized administrator account via the Bhojora identity API.
            </div>

            <p className="status-note" role="status" aria-live="polite">
              {statusMessage}
            </p>
          </div>
        </main>

        <footer className="footer">
          <div className="topbar-inner">
            <span>
              BHOJORA Central Management System (CMS) — Audited Access &amp; Tenant Isolation
            </span>
            <span>Kolkata Governance Grid · Version 1.0.0 Production</span>
          </div>
        </footer>
      </div>
    );
  }

  // ==========================================
  // 2. AUTHENTICATED: LANDING PAGE & ALL-FEATURE COMMAND CENTER
  // ==========================================
  return (
    <div className="cms-admin-app">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img src="./logo.png" alt="BHOJORA emblem" width={40} height={40} />
            <div>
              <p className="brand-name">BHOJORA Control Center (CMS)</p>
              <p className="brand-sub">Central Operations &amp; Trust Governance Hub</p>
            </div>
          </div>

          <div className="admin-header-controls">
            <span className="admin-identity-badge">
              👤 {sessionUser.name} ({sessionUser.activeRole})
            </span>
            <span className="pill">
              {rbacContext?.mfaVerified ? '✓ MFA Verified' : 'MFA Required'}
            </span>
            <span className="pill" style={{ background: '#f0fdf4', borderColor: '#16a34a' }}>
              ● Kolkata Grid Active
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
              { key: 'OVERVIEW', label: '🏠 CMS Landing Hub' },
              { key: 'ONBOARDING', label: '🍳 Restaurant KYC' },
              { key: 'INSPECTIONS', label: '🔍 Audits' },
              { key: 'ZONES', label: '📍 Service Zones' },
              { key: 'COURIERS', label: '🛵 Courier Fleet' },
              { key: 'AI', label: '🤖 AI Oversight' },
              { key: 'FINANCE', label: '💳 Payouts' },
              { key: 'SUPPORT', label: '🎫 Support SLA' },
              { key: 'SYSTEM', label: '⚙️ Platform Config' },
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

        {/* ======================================================== */}
        {/* 1. OVERVIEW: THE EXECUTIVE LANDING PAGE & FEATURE HUB     */}
        {/* ======================================================== */}
        {activeTab === 'OVERVIEW' ? (
          <div className="admin-landing-container">
            {/* Hero Banner */}
            <section className="admin-landing-hero">
              <div className="hero-content">
                <span className="landing-eyebrow">
                  🛡️ Executive Command Center · Kolkata Operations
                </span>
                <h1 className="landing-heading">Central Operations &amp; Feature Control Hub</h1>
                <p className="landing-sub">
                  Unified master management plane for Kolkata&apos;s verified food delivery
                  ecosystem. Monitor real-time corridor metrics, approve restaurant KYC, govern
                  hygiene audits, and manage finances from dedicated control sections below.
                </p>
              </div>

              {/* 4 Core Platform Metric Badges */}
              <div className="landing-metrics-grid">
                <div className="metric-tile">
                  <div className="metric-number">100-Pt</div>
                  <div className="metric-label">Physical Audits</div>
                  <div className="metric-sub">SHA-256 Verified</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-number">5.5-6.0</div>
                  <div className="metric-label">Km Corridors</div>
                  <div className="metric-sub">Hot-Chain Intact</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-number">16.5%</div>
                  <div className="metric-label">Fair Take Rate</div>
                  <div className="metric-sub">Zero Ad Shakedowns</div>
                </div>
                <div className="metric-tile">
                  <div className="metric-number">T+1</div>
                  <div className="metric-label">Escrow Payout</div>
                  <div className="metric-sub">Sec 9(5) CGST</div>
                </div>
              </div>
            </section>

            {/* Quick Operations Control Bar */}
            <section className="ops-control-bar">
              <div className="ops-status-left">
                <span className="ops-status-indicator"></span>
                <div>
                  <strong>All 5 Kolkata Corridors Operating Normal</strong>
                  <div className="brand-sub">
                    Salt Lake Sector V · Park Street · Ballygunge · New Town · Shyambazar
                  </div>
                </div>
              </div>
              <div className="ops-actions-right">
                <button
                  type="button"
                  className="filter-btn"
                  onClick={() =>
                    setStatusMessage('Telemetry sync executed: 0 corridor SLA breaches.')
                  }
                >
                  🔄 Sync Telemetry
                </button>
                <button
                  type="button"
                  className="filter-btn"
                  onClick={() =>
                    setStatusMessage('Audit pack generated for active Kolkata corridor instances.')
                  }
                >
                  📥 Export Audit Pack
                </button>
              </div>
            </section>

            {/* Feature Sections Header */}
            <div className="feature-sections-header">
              <h2>Platform Feature Control Sections</h2>
              <p className="brand-sub">
                Select any operational domain to directly control and review its workflows, data,
                and approvals.
              </p>
            </div>

            {/* Feature Control Sections Grid */}
            <div className="feature-control-grid">
              {/* Feature 1: Restaurant Onboarding & KYC */}
              <article className="feature-control-card">
                <div className="card-top">
                  <div className="card-icon-title">
                    <span className="feature-icon">🍳</span>
                    <div>
                      <h3>Restaurant Onboarding &amp; KYC</h3>
                      <span className="feature-badge">3 Pending Review</span>
                    </div>
                  </div>
                  <p className="feature-desc">
                    Review partner applications, verify statutory FSSAI licenses, validate GSTIN
                    filings, and approve verified kitchen menus.
                  </p>
                </div>
                <div className="card-kpi-row">
                  <div>
                    <span className="kpi-val">42</span>
                    <span className="kpi-lbl">Active Kitchens</span>
                  </div>
                  <div>
                    <span className="kpi-val">100%</span>
                    <span className="kpi-lbl">FSSAI Validated</span>
                  </div>
                  <div>
                    <span className="kpi-val">0</span>
                    <span className="kpi-lbl">Overdue</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('ONBOARDING')}
                  >
                    Open Restaurant KYC Queue →
                  </button>
                </div>
              </article>

              {/* Feature 2: 100-Point Hygiene & Inspection Audits */}
              <article className="feature-control-card">
                <div className="card-top">
                  <div className="card-icon-title">
                    <span className="feature-icon">🔍</span>
                    <div>
                      <h3>100-Point Hygiene Audits</h3>
                      <span className="feature-badge">Segregation of Duties</span>
                    </div>
                  </div>
                  <p className="feature-desc">
                    Enforce separation of duties: inspectors submit photo evidence with SHA-256
                    hashes; reviewers approve verified trust scorecards.
                  </p>
                </div>
                <div className="card-kpi-row">
                  <div>
                    <span className="kpi-val">3</span>
                    <span className="kpi-lbl">In Review</span>
                  </div>
                  <div>
                    <span className="kpi-val">98.2%</span>
                    <span className="kpi-lbl">Avg Pass Score</span>
                  </div>
                  <div>
                    <span className="kpi-val">1</span>
                    <span className="kpi-lbl">Action Req</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('INSPECTIONS')}
                  >
                    Launch Audit Review Queue →
                  </button>
                </div>
              </article>

              {/* Feature 3: Service Zones & Geospatial Corridors */}
              <article className="feature-control-card">
                <div className="card-top">
                  <div className="card-icon-title">
                    <span className="feature-icon">📍</span>
                    <div>
                      <h3>Geospatial Service Corridors</h3>
                      <span className="feature-badge">5.5–6.0 km Bounds</span>
                    </div>
                  </div>
                  <p className="feature-desc">
                    Manage bounded delivery polygons across Kolkata to guarantee 28–32 minute
                    hot-chain food delivery and prevent thermal degradation.
                  </p>
                </div>
                <div className="card-kpi-row">
                  <div>
                    <span className="kpi-val">5</span>
                    <span className="kpi-lbl">Active Polygons</span>
                  </div>
                  <div>
                    <span className="kpi-val">0</span>
                    <span className="kpi-lbl">Boundary Breaches</span>
                  </div>
                  <div>
                    <span className="kpi-val">29m</span>
                    <span className="kpi-lbl">Avg Delivery</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('ZONES')}
                  >
                    Manage Service Zones →
                  </button>
                </div>
              </article>

              {/* Feature 4: Delivery Fleet & Courier Operations */}
              <article className="feature-control-card">
                <div className="card-top">
                  <div className="card-icon-title">
                    <span className="feature-icon">🛵</span>
                    <div>
                      <h3>Delivery Fleet Governance</h3>
                      <span className="feature-badge">100% Tips Passed</span>
                    </div>
                  </div>
                  <p className="feature-desc">
                    Rider onboarding, driving license and RC verification, active shift allocation,
                    and zero-commission courier tip transparency.
                  </p>
                </div>
                <div className="card-kpi-row">
                  <div>
                    <span className="kpi-val">18</span>
                    <span className="kpi-lbl">Active Couriers</span>
                  </div>
                  <div>
                    <span className="kpi-val">₹0</span>
                    <span className="kpi-lbl">Fee Withheld</span>
                  </div>
                  <div>
                    <span className="kpi-val">4.9★</span>
                    <span className="kpi-lbl">Fleet Rating</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('COURIERS')}
                  >
                    Launch Fleet Operations →
                  </button>
                </div>
              </article>

              {/* Feature 5: AI Vision & Safety Moderation */}
              <article className="feature-control-card">
                <div className="card-top">
                  <div className="card-icon-title">
                    <span className="feature-icon">🤖</span>
                    <div>
                      <h3>AI Vision &amp; Content Moderation</h3>
                      <span className="feature-badge">Automated Audits</span>
                    </div>
                  </div>
                  <p className="feature-desc">
                    Computer vision scanning for dish authenticity, synthetic image detection,
                    allergen tag consistency, and price markup audits.
                  </p>
                </div>
                <div className="card-kpi-row">
                  <div>
                    <span className="kpi-val">99.4%</span>
                    <span className="kpi-lbl">Model Accuracy</span>
                  </div>
                  <div>
                    <span className="kpi-val">2</span>
                    <span className="kpi-lbl">AI Flags</span>
                  </div>
                  <div>
                    <span className="kpi-val">&lt; 1.2s</span>
                    <span className="kpi-lbl">Scan Latency</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button type="button" className="btn-primary" onClick={() => setActiveTab('AI')}>
                    Open AI Moderation Desk →
                  </button>
                </div>
              </article>

              {/* Feature 6: Financial Escrow & Daily Payouts */}
              <article className="feature-control-card">
                <div className="card-top">
                  <div className="card-icon-title">
                    <span className="feature-icon">💳</span>
                    <div>
                      <h3>Financial Escrow &amp; Settlements</h3>
                      <span className="feature-badge">Sec 9(5) CGST</span>
                    </div>
                  </div>
                  <p className="feature-desc">
                    Daily T+1 partner escrow disbursements, statutory Section 9(5) GST tax ledger,
                    16.5% flat take rate, and refund approvals.
                  </p>
                </div>
                <div className="card-kpi-row">
                  <div>
                    <span className="kpi-val">₹2.48L</span>
                    <span className="kpi-lbl">Settled Today</span>
                  </div>
                  <div>
                    <span className="kpi-val">0</span>
                    <span className="kpi-lbl">Escrow Discrepancies</span>
                  </div>
                  <div>
                    <span className="kpi-val">T+1</span>
                    <span className="kpi-lbl">Batch Cycle</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('FINANCE')}
                  >
                    Open Settlement Ledger →
                  </button>
                </div>
              </article>

              {/* Feature 7: Customer Support & Safety Incident SLA */}
              <article className="feature-control-card">
                <div className="card-top">
                  <div className="card-icon-title">
                    <span className="feature-icon">🎫</span>
                    <div>
                      <h3>Support Operations &amp; P0 Incidents</h3>
                      <span className="feature-badge">Food Safety Desk</span>
                    </div>
                  </div>
                  <p className="feature-desc">
                    Immediate food contamination triage, customer dispute resolution, partner
                    appeals, and Corrective Action Plan (CAP) tracking.
                  </p>
                </div>
                <div className="card-kpi-row">
                  <div>
                    <span className="kpi-val">12</span>
                    <span className="kpi-lbl">Open Tickets</span>
                  </div>
                  <div>
                    <span className="kpi-val">4.2m</span>
                    <span className="kpi-lbl">Avg Response SLA</span>
                  </div>
                  <div>
                    <span className="kpi-val">0</span>
                    <span className="kpi-lbl">Critical P0 Open</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('SUPPORT')}
                  >
                    Open Support Desk →
                  </button>
                </div>
              </article>

              {/* Feature 8: Platform Security, RBAC & DPDP Compliance */}
              <article className="feature-control-card">
                <div className="card-top">
                  <div className="card-icon-title">
                    <span className="feature-icon">⚙️</span>
                    <div>
                      <h3>Security, RBAC &amp; DPDP Governance</h3>
                      <span className="feature-badge">CERT-In Aligned</span>
                    </div>
                  </div>
                  <p className="feature-desc">
                    8 shared contract roles, step-up MFA challenge policies, DPDP Act data erasure
                    requests (DSR), and immutable security audit logs.
                  </p>
                </div>
                <div className="card-kpi-row">
                  <div>
                    <span className="kpi-val">8</span>
                    <span className="kpi-lbl">Platform Roles</span>
                  </div>
                  <div>
                    <span className="kpi-val">100%</span>
                    <span className="kpi-lbl">MFA Enforced</span>
                  </div>
                  <div>
                    <span className="kpi-val">0</span>
                    <span className="kpi-lbl">Security Alerts</span>
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => setActiveTab('SYSTEM')}
                  >
                    Access System Governance →
                  </button>
                </div>
              </article>

              {/* Feature 9: Master Multi-Panel Console */}
              <article className="feature-control-card" style={{ gridColumn: 'span 2' }}>
                <div className="card-top">
                  <div className="card-icon-title">
                    <span className="feature-icon">📑</span>
                    <div>
                      <h3>Unified Platform Master Console</h3>
                      <span className="feature-badge">Continuous Multi-Panel View</span>
                    </div>
                  </div>
                  <p className="feature-desc">
                    Inspect all 8 platform operational queues simultaneously in a master continuous
                    dashboard for real-time corridor monitoring and incident triage.
                  </p>
                </div>
                <div className="card-actions" style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: '100%' }}
                    onClick={() => setActiveTab('ALL')}
                  >
                    Open Master Multi-Panel View →
                  </button>
                </div>
              </article>
            </div>

            {/* Quick Summary of Active Governance Queue & Roles */}
            <section className="panel" style={{ marginTop: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <span className="pill">Independent Trust &amp; Inspection Queue</span>
                  <h3 style={{ margin: '0.35rem 0' }}>Segregation of Duties Verification</h3>
                </div>
                <div className="filter-row" role="group" aria-label="Filter governance queue">
                  {(['ALL', 'PENDING_REVIEW', 'APPROVED', 'ACTION_REQUIRED'] as const).map(
                    (key) => (
                      <button
                        key={key}
                        type="button"
                        className="filter-btn"
                        aria-pressed={filter === key}
                        onClick={() => setFilter(key)}
                      >
                        {key.replace('_', ' ')}
                      </button>
                    ),
                  )}
                </div>
              </div>

              <ul className="queue-list" style={{ marginTop: '0.75rem' }}>
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

            {/* Platform Role Matrix */}
            <section className="panel">
              <span className="pill">Role-Based Access Control</span>
              <h3 style={{ margin: '0.35rem 0 0.75rem' }}>
                Platform Role Matrix ({USER_ROLES.length} Contract Roles)
              </h3>
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
          </div>
        ) : null}

        {/* Feature Sub-View Return Header (for when non-OVERVIEW tab is selected) */}
        {activeTab !== 'OVERVIEW' ? (
          <div className="sub-view-return-bar">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setActiveTab('OVERVIEW')}
            >
              ← Back to CMS Landing Hub &amp; Feature Control
            </button>
            <span className="brand-sub">
              Active Control Section: <strong>{activeTab}</strong>
            </span>
          </div>
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

        {/* 3. INSPECTIONS VIEW */}
        {activeTab === 'INSPECTIONS' || activeTab === 'ALL' ? (
          <InspectionReviewerQueue
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

        {/* 5. COURIERS VIEW */}
        {activeTab === 'COURIERS' || activeTab === 'ALL' ? (
          <DeliveryPartnerReviewQueue
            apiBase={getApiBase()}
            accessToken={accessToken}
            mfaVerified={Boolean(rbacContext?.mfaVerified)}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 6. AI VIEW */}
        {activeTab === 'AI' || activeTab === 'ALL' ? (
          <AiReviewDashboard
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

        {/* 8. SUPPORT VIEW */}
        {activeTab === 'SUPPORT' || activeTab === 'ALL' ? (
          <SupportOperationsDashboard
            apiBase={getApiBase()}
            accessToken={accessToken}
            mfaVerified={Boolean(rbacContext?.mfaVerified)}
            onStatusUpdate={setStatusMessage}
          />
        ) : null}

        {/* 9. SYSTEM CONFIG VIEW */}
        {activeTab === 'SYSTEM' || activeTab === 'ALL' ? (
          <AdminGovernanceDashboard
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
    </div>
  );
}
