import { FormEvent, useState } from 'react';
import {
  USER_ROLES,
  type ApiResponse,
  type AuthSessionResponseDto,
  type UserProfileDto,
} from '@bhojora/shared';

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
  const [statusMessage, setStatusMessage] = useState(
    'Privileged admin, reviewer, and finance sessions require verified MFA.',
  );

  const visibleItems =
    filter === 'ALL'
      ? GOVERNANCE_QUEUE
      : GOVERNANCE_QUEUE.filter((item) => item.reviewerStatus === filter);

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
      setStatusMessage(
        `Signed in as ${payload.data.user.name} (${payload.data.user.activeRole}). Step-up MFA applies to privileged routes.`,
      );
      setPassword('');
    } catch {
      setStatusMessage('Unable to reach control plane API at ' + apiBase);
    }
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
            <p className="status-note" role="status" aria-live="polite">
              {statusMessage}
            </p>
          </aside>
        </section>

        <section className="panel">
          <h2>Platform Role Matrix ({USER_ROLES.length} Shared Contract Roles)</h2>
          <div className="role-grid">
            {USER_ROLES.map((role) => (
              <span key={role} className="role-chip">
                {role}
              </span>
            ))}
          </div>
        </section>
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
