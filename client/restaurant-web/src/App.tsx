import { FormEvent, useState } from 'react';
import {
  ROLE_PERMISSION_MATRIX,
  type ApiResponse,
  type AuthSessionResponseDto,
  type RbacContextDto,
  type UserProfileDto,
} from '@bhojora/shared';
import { OutletZonesPanel } from './components/OutletZonesPanel';
import { RestaurantOnboardingPanel } from './components/RestaurantOnboardingPanel';

interface PartnerOutletView {
  outletId: string;
  name: string;
  zone: string;
  trustScore: number;
  fssaiExpiresOn: string;
  inspectionCadenceDays: number;
  dailyEvidenceSubmitted: boolean;
  readinessState: 'VERIFIED_CLEAN' | 'ACTION_REQUIRED';
}

const SAMPLE_OUTLETS: PartnerOutletView[] = [
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
  const [selectedOutletId, setSelectedOutletId] = useState<string>(SAMPLE_OUTLETS[0]!.outletId);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [statusMessage, setStatusMessage] = useState(
    'Tenant-scoped partner console. Sign in to view assigned restaurant memberships.',
  );
  const [sessionUser, setSessionUser] = useState<UserProfileDto | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [rbacContext, setRbacContext] = useState<RbacContextDto | null>(null);

  const partnerActiveRole = sessionUser?.roles.includes('RESTAURANT_OWNER')
    ? 'RESTAURANT_OWNER'
    : sessionUser?.roles.includes('RESTAURANT_MANAGER')
      ? 'RESTAURANT_MANAGER'
      : sessionUser?.roles.includes('KITCHEN_STAFF')
        ? 'KITCHEN_STAFF'
        : (rbacContext?.activeRole ?? 'RESTAURANT_OWNER');

  const selectedOutlet =
    SAMPLE_OUTLETS.find((outlet) => outlet.outletId === selectedOutletId) ?? SAMPLE_OUTLETS[0]!;

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

  async function handlePartnerSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const apiBase = getApiBase();
    if (!apiBase) {
      setStatusMessage(
        'Static preview active: connect BHOJORA_API_BASE for live restaurant-scoped session checks.',
      );
      return;
    }

    setStatusMessage('Signing in partner session...');
    try {
      const response = await fetch(`${apiBase}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password, deviceName: 'Bhojora Partner Portal Web' }),
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

      const rbacRes = await fetch(`${apiBase}/api/v1/rbac/me`, {
        headers: { Authorization: `Bearer ${payload.data.tokens.accessToken}` },
      });
      const rbacPayload = (await rbacRes.json()) as ApiResponse<RbacContextDto>;
      if (rbacRes.ok && rbacPayload.success) {
        setRbacContext(rbacPayload.data);
        setStatusMessage(
          `Signed in as ${payload.data.user.name} (${rbacPayload.data.activeRole}) — ${rbacPayload.data.memberships.length} outlet membership(s) loaded.`,
        );
      } else {
        setStatusMessage(
          `Signed in as ${payload.data.user.name} (${payload.data.user.activeRole}) — tenant access scoped to assigned outlets.`,
        );
      }
    } catch {
      setStatusMessage('Unable to reach identity API at ' + apiBase);
    }
  }

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
          <div>
            {sessionUser ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setSessionUser(null);
                  setAccessToken(null);
                  setRbacContext(null);
                  setStatusMessage('Signed out of partner portal session.');
                }}
              >
                Sign Out ({rbacContext?.activeRole ?? sessionUser.activeRole})
              </button>
            ) : (
              <span className="badge">React Workspace</span>
            )}
          </div>
        </div>
      </header>

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
              {SAMPLE_OUTLETS.map((outlet) => (
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

          <aside className="panel panel-alt" aria-label="Partner authentication">
            <h2>Partner Sign In</h2>
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
                  placeholder="manager@outlet.in"
                />
              </div>
              <div className="field">
                <label htmlFor="partnerPassword">Password</label>
                <input
                  id="partnerPassword"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <button type="submit" className="btn-primary">
                Sign In to Outlet Scope
              </button>
            </form>
            <p className="status-note" role="status" aria-live="polite">
              {statusMessage}
            </p>
          </aside>
        </section>

        <section className="panel">
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
              <span>Effective permissions ({rbacContext?.activeRole ?? 'RESTAURANT_OWNER'})</span>
              <span className="badge">
                {(rbacContext?.permissions ?? ROLE_PERMISSION_MATRIX.RESTAURANT_OWNER).length}{' '}
                scoped
              </span>
            </li>
          </ul>
        </section>

        <RestaurantOnboardingPanel
          apiBase={getApiBase()}
          accessToken={accessToken}
          onStatusUpdate={setStatusMessage}
        />

        <OutletZonesPanel
          apiBase={getApiBase()}
          accessToken={accessToken}
          activeRole={partnerActiveRole}
          onStatusUpdate={setStatusMessage}
        />
      </main>

      <footer className="footer">
        <div className="topbar-inner">
          <span>BHOJORA Partner Operations — Independent Kitchen Verification Network</span>
          <span>Kolkata Launch Grid</span>
        </div>
      </footer>
    </>
  );
}
