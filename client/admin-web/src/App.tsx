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
  const [sessionUser, setSessionUser] = useState<UserProfileDto | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [rbacContext, setRbacContext] = useState<RbacContextDto | null>(null);
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    'Privileged admin, reviewer, and finance sessions require verified MFA.',
  );

  const visibleItems =
    filter === 'ALL'
      ? GOVERNANCE_QUEUE
      : GOVERNANCE_QUEUE.filter((item) => item.reviewerStatus === filter);

  async function refreshRbacContext(token: string) {
    const apiBase = getApiBase();
    if (!apiBase) {
      return;
    }
    const res = await fetch(`${apiBase}/api/v1/rbac/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = (await res.json()) as ApiResponse<RbacContextDto>;
    if (res.ok && payload.success) {
      setRbacContext(payload.data);
    }
  }

  async function handleAdminSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const apiBase = getApiBase();
    if (!apiBase) {
      setStatusMessage(
        'Static preview active: connect BHOJORA_API_BASE for live RBAC + MFA enforcement checks.',
      );
      return;
    }

    setStatusMessage('Verifying privileged credentials...');
    try {
      const response = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, deviceName: 'Bhojora Control Admin' }),
      });
      const payload = (await response.json()) as ApiResponse<AuthSessionResponseDto>;
      if (!response.ok || !payload.success) {
        setStatusMessage(
          payload.success ? 'Sign-in failed.' : payload.error.message || 'Sign-in failed.',
        );
        return;
      }
      setSessionUser(payload.data.user);
      setAccessToken(payload.data.tokens.accessToken);
      setPassword('');
      await refreshRbacContext(payload.data.tokens.accessToken);
      setStatusMessage(
        `Signed in as ${payload.data.user.name} (${payload.data.user.activeRole}). Complete step-up MFA to unlock privileged actions.`,
      );
    } catch {
      setStatusMessage('Unable to reach control plane API at ' + apiBase);
    }
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
          <span className="pill">
            {sessionUser ? `${sessionUser.activeRole} Active` : 'MFA Policy Enforced'}
          </span>
        </div>
      </header>

      <main className="shell">
        <section className="grid-split">
          <div className="panel">
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
                  <span className={`pill ${item.reviewerStatus === 'APPROVED' ? '' : 'pill-warn'}`}>
                    {item.reviewerStatus}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <aside className="panel panel-alt" aria-label="Operator authentication">
            <h2>Operator Sign In</h2>
            <form onSubmit={handleAdminSignIn}>
              <div className="field">
                <label htmlFor="adminIdentifier">Operator Email or ID</label>
                <input
                  id="adminIdentifier"
                  name="identifier"
                  type="text"
                  required
                  autoComplete="username"
                  value={identifier}
                  onChange={(event) => setIdentifier(event.target.value)}
                  placeholder="reviewer@bhojora.in"
                />
              </div>
              <div className="field">
                <label htmlFor="adminPassword">Password</label>
                <input
                  id="adminPassword"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary">
                Authenticate Control Session
              </button>
            </form>
            {sessionUser && !rbacContext?.mfaVerified ? (
              <div
                style={{
                  marginTop: '1rem',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--border)',
                }}
              >
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
                    <button type="submit" className="btn-primary">
                      Verify Step-Up MFA
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
            <p className="status-note" role="status" aria-live="polite">
              {statusMessage}
            </p>
          </aside>
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

        <OnboardingReviewQueue
          apiBase={getApiBase()}
          accessToken={accessToken}
          mfaVerified={Boolean(rbacContext?.mfaVerified)}
          onStatusUpdate={setStatusMessage}
        />

        <DeliveryPartnerReviewQueue
          apiBase={getApiBase()}
          accessToken={accessToken}
          mfaVerified={Boolean(rbacContext?.mfaVerified)}
          onStatusUpdate={setStatusMessage}
        />

        <ZoneGovernancePanel
          apiBase={getApiBase()}
          accessToken={accessToken}
          mfaVerified={Boolean(rbacContext?.mfaVerified)}
          onStatusUpdate={setStatusMessage}
        />

        <InspectionReviewerQueue
          apiBase={getApiBase()}
          accessToken={accessToken}
          mfaVerified={Boolean(rbacContext?.mfaVerified)}
          onStatusUpdate={setStatusMessage}
        />

        <SupportOperationsDashboard
          apiBase={getApiBase()}
          accessToken={accessToken}
          mfaVerified={Boolean(rbacContext?.mfaVerified)}
          onStatusUpdate={setStatusMessage}
        />

        <FinanceSettlementPanel
          apiBase={getApiBase()}
          accessToken={accessToken}
          mfaVerified={Boolean(rbacContext?.mfaVerified)}
          onStatusUpdate={setStatusMessage}
        />
      </main>

      <footer className="footer">
        <div className="topbar-inner">
          <span>BHOJORA Control Plane — Audited Access &amp; Tenant Isolation</span>
          <span>Kolkata Governance Grid</span>
        </div>
      </footer>
    </>
  );
}
