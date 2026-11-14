import { useEffect, useState, FormEvent } from 'react';
import type {
  AdminOverviewDto,
  AdminUserSummaryDto,
  AdminOutletSummaryDto,
  AdminPartnerSummaryDto,
  AuditLogEntryDto,
  PlatformConfigDto,
  ConfigChangeProposalDto,
} from '@bhojora/shared';

interface Props {
  apiBase: string;
  accessToken: string | null;
  mfaVerified: boolean;
  onStatusUpdate: (message: string) => void;
}

type TabType = 'OVERVIEW' | 'ACCOUNTS' | 'CONFIG' | 'AUDIT';

export function AdminGovernanceDashboard({
  apiBase,
  accessToken,
  mfaVerified,
  onStatusUpdate,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('OVERVIEW');
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null);
  const [users, setUsers] = useState<AdminUserSummaryDto[]>([]);
  const [outlets, setOutlets] = useState<AdminOutletSummaryDto[]>([]);
  const [partners, setPartners] = useState<AdminPartnerSummaryDto[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntryDto[]>([]);
  const [config, setConfig] = useState<PlatformConfigDto | null>(null);
  const [proposals, setProposals] = useState<ConfigChangeProposalDto[]>([]);
  const [loading, setLoading] = useState(false);

  // Action state
  const [actionReason, setActionReason] = useState('');
  const [selectedEntity, setSelectedEntity] = useState<{
    type: 'USER' | 'OUTLET' | 'PARTNER';
    id: string;
    name: string;
    targetStatus: 'ACTIVE' | 'SUSPENDED';
  } | null>(null);

  // Config proposal form state
  const [monsoonToggle, setMonsoonToggle] = useState(false);
  const [maintenanceToggle, setMaintenanceToggle] = useState(false);
  const [surgeToggle, setSurgeToggle] = useState(false);
  const [proposalReason, setProposalReason] = useState('');

  // Audit filter state
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');

  useEffect(() => {
    if (!apiBase || !accessToken) {
      return;
    }
    void loadOverview();
  }, [apiBase, accessToken]);

  async function loadOverview() {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [ovRes, cfgRes, propRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/admin/overview`, { headers }),
        fetch(`${apiBase}/api/v1/admin/config`, { headers }),
        fetch(`${apiBase}/api/v1/admin/config/proposals`, { headers }),
      ]);

      if (ovRes.ok) {
        const payload = await ovRes.json();
        setOverview(payload.data as AdminOverviewDto);
      }
      if (cfgRes.ok) {
        const payload = await cfgRes.json();
        const cfgData = payload.data?.config as PlatformConfigDto;
        setConfig(cfgData);
        setMonsoonToggle(cfgData.monsoonWaterloggingMode);
        setMaintenanceToggle(cfgData.maintenanceMode);
        setSurgeToggle(cfgData.emergencySurgeLock);
      }
      if (propRes.ok) {
        const payload = await propRes.json();
        setProposals(payload.data?.proposals ?? []);
      }
    } catch {
      onStatusUpdate('Failed to fetch governance overview.');
    } finally {
      setLoading(false);
    }
  }

  async function loadAccounts() {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const [uRes, oRes, pRes] = await Promise.all([
        fetch(`${apiBase}/api/v1/admin/users?limit=50`, { headers }),
        fetch(`${apiBase}/api/v1/admin/outlets`, { headers }),
        fetch(`${apiBase}/api/v1/admin/partners?limit=50`, { headers }),
      ]);
      if (uRes.ok) {
        const payload = await uRes.json();
        setUsers(payload.data?.users ?? []);
      }
      if (oRes.ok) {
        const payload = await oRes.json();
        setOutlets(payload.data?.outlets ?? []);
      }
      if (pRes.ok) {
        const payload = await pRes.json();
        setPartners(payload.data?.partners ?? []);
      }
    } catch {
      onStatusUpdate('Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }

  async function loadAuditLogs() {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };
      const queryParams = new URLSearchParams();
      if (auditSearch.trim()) {
        queryParams.set('search', auditSearch.trim());
      }
      if (auditActionFilter.trim()) {
        queryParams.set('action', auditActionFilter.trim());
      }
      const res = await fetch(`${apiBase}/api/v1/admin/audit-logs?${queryParams.toString()}`, {
        headers,
      });
      if (res.ok) {
        const payload = await res.json();
        setAuditLogs(payload.data?.logs ?? []);
      }
    } catch {
      onStatusUpdate('Failed to query audit logs.');
    } finally {
      setLoading(false);
    }
  }

  function handleTabChange(tab: TabType) {
    setActiveTab(tab);
    if (tab === 'OVERVIEW') {
      void loadOverview();
    } else if (tab === 'ACCOUNTS') {
      void loadAccounts();
    } else if (tab === 'CONFIG') {
      void loadOverview();
    } else if (tab === 'AUDIT') {
      void loadAuditLogs();
    }
  }

  async function handleEntityStatusUpdate(event: FormEvent) {
    event.preventDefault();
    if (!selectedEntity || !apiBase || !accessToken) {
      return;
    }
    if (actionReason.trim().length < 8) {
      onStatusUpdate('Error: Administrative actions require an explicit reason (>= 8 characters).');
      return;
    }
    if (!mfaVerified) {
      onStatusUpdate(
        'Error: Step-up MFA verification is required before executing sensitive actions.',
      );
      return;
    }

    setLoading(true);
    try {
      let endpoint = '';
      if (selectedEntity.type === 'USER') {
        endpoint = `${apiBase}/api/v1/admin/users/${selectedEntity.id}/status`;
      } else if (selectedEntity.type === 'OUTLET') {
        endpoint = `${apiBase}/api/v1/admin/outlets/${selectedEntity.id}/status`;
      } else {
        endpoint = `${apiBase}/api/v1/admin/partners/${selectedEntity.id}/status`;
      }

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          status: selectedEntity.targetStatus,
          reason: actionReason.trim(),
        }),
      });

      const payload = await res.json();
      if (res.ok && payload.success) {
        onStatusUpdate(
          `Success: ${selectedEntity.type} ${selectedEntity.name} transitioned to ${selectedEntity.targetStatus}.`,
        );
        setSelectedEntity(null);
        setActionReason('');
        await loadAccounts();
      } else {
        onStatusUpdate(`Failed: ${payload.error?.message || 'Action rejected'}`);
      }
    } catch {
      onStatusUpdate('Network error updating entity status.');
    } finally {
      setLoading(false);
    }
  }

  async function handleProposeConfig(event: FormEvent) {
    event.preventDefault();
    if (!apiBase || !accessToken) {
      return;
    }
    if (proposalReason.trim().length < 8) {
      onStatusUpdate(
        'Error: Configuration proposal requires a detailed justification (>= 8 chars).',
      );
      return;
    }
    if (!mfaVerified) {
      onStatusUpdate('Error: Privileged configuration proposals require step-up MFA.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/config/proposals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          proposedChanges: {
            monsoonWaterloggingMode: monsoonToggle,
            maintenanceMode: maintenanceToggle,
            emergencySurgeLock: surgeToggle,
          },
          reason: proposalReason.trim(),
        }),
      });
      const payload = await res.json();
      if (res.ok && payload.success) {
        onStatusUpdate('Configuration proposal submitted for two-person review.');
        setProposalReason('');
        await loadOverview();
      } else {
        onStatusUpdate(`Proposal error: ${payload.error?.message || 'Rejected'}`);
      }
    } catch {
      onStatusUpdate('Network error submitting config proposal.');
    } finally {
      setLoading(false);
    }
  }

  async function handleReviewProposal(proposalId: string, decision: 'APPROVE' | 'REJECT') {
    if (!apiBase || !accessToken) {
      return;
    }
    const reviewReason = window.prompt(
      `Enter reason for ${decision} (minimum 8 characters, two-person rule strictly enforced):`,
    );
    if (!reviewReason || reviewReason.trim().length < 8) {
      onStatusUpdate('Review cancelled: Reason must be at least 8 characters.');
      return;
    }
    if (!mfaVerified) {
      onStatusUpdate('Step-up MFA required before approving configuration changes.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/config/proposals/${proposalId}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          decision,
          reason: reviewReason.trim(),
        }),
      });
      const payload = await res.json();
      if (res.ok && payload.success) {
        onStatusUpdate(`Proposal ${proposalId} decided as ${decision}. Platform config updated.`);
        await loadOverview();
      } else {
        onStatusUpdate(`Review rejected: ${payload.error?.message || 'Action failed'}`);
      }
    } catch {
      onStatusUpdate('Network error reviewing configuration proposal.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel" aria-label="Admin Governance and Oversight Control Plane">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="pill">Checkpoint 28 — Platform Governance</span>
          <h2 style={{ margin: '0.25rem 0' }}>Bhojora Control &amp; System Governance</h2>
        </div>
        <div className="filter-row" role="group" aria-label="Governance section selector">
          {(['OVERVIEW', 'ACCOUNTS', 'CONFIG', 'AUDIT'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              className="filter-btn"
              aria-pressed={activeTab === tab}
              onClick={() => handleTabChange(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="status-note">Refreshing governance plane...</p> : null}

      {/* TAB 1: OVERVIEW METRICS */}
      {activeTab === 'OVERVIEW' && (
        <div style={{ marginTop: '1rem' }}>
          {overview ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1rem',
              }}
            >
              <div className="panel panel-alt">
                <strong>Users Governance</strong>
                <p style={{ fontSize: '1.4rem', margin: '0.25rem 0' }}>{overview.usersTotal}</p>
                <span className="brand-sub">{overview.usersSuspended} suspended</span>
              </div>
              <div className="panel panel-alt">
                <strong>Restaurant Outlets</strong>
                <p style={{ fontSize: '1.4rem', margin: '0.25rem 0' }}>{overview.outletsActive}</p>
                <span className="brand-sub">
                  {overview.outletsSuspended} suspended / {overview.restaurantsTotal} brands
                </span>
              </div>
              <div className="panel panel-alt">
                <strong>Delivery Partners</strong>
                <p style={{ fontSize: '1.4rem', margin: '0.25rem 0' }}>
                  {overview.deliveryPartnersActive}
                </p>
                <span className="brand-sub">
                  {overview.deliveryPartnersSuspended} suspended / {overview.deliveryPartnersTotal}{' '}
                  total
                </span>
              </div>
              <div className="panel panel-alt">
                <strong>Safety &amp; Audits</strong>
                <p style={{ fontSize: '1.4rem', margin: '0.25rem 0' }}>
                  {overview.recentAuditCount}
                </p>
                <span className="brand-sub">
                  {overview.pendingInspections} pending inspections / {overview.openTickets} open
                  tickets
                </span>
              </div>
            </div>
          ) : (
            <p className="brand-sub">Sign in with an administrative token to view live KPIs.</p>
          )}

          {config && (
            <div className="panel" style={{ marginTop: '1rem' }}>
              <strong>Kolkata Operating Parameters (Config v{config.version})</strong>
              <div
                style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}
              >
                <span className={`pill ${config.monsoonWaterloggingMode ? 'pill-warn' : ''}`}>
                  Monsoon Waterlogging: {config.monsoonWaterloggingMode ? 'ACTIVE' : 'NORMAL'}
                </span>
                <span className={`pill ${config.emergencySurgeLock ? 'pill-warn' : ''}`}>
                  Surge Lock: {config.emergencySurgeLock ? 'LOCKED' : 'DYNAMIC'}
                </span>
                <span className={`pill ${config.maintenanceMode ? 'pill-warn' : ''}`}>
                  Maintenance Mode: {config.maintenanceMode ? 'ENABLED' : 'DISABLED'}
                </span>
                <span className="pill">
                  Instant Refund Cap: ₹{(config.instantRefundCapPaise / 100).toFixed(2)}
                </span>
                <span className="pill">
                  Platform Fee: ₹{(config.platformFeePaise / 100).toFixed(2)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACCOUNTS (USERS, OUTLETS, RIDERS) */}
      {activeTab === 'ACCOUNTS' && (
        <div style={{ marginTop: '1rem' }}>
          <h3>User Accounts &amp; Entity State Governance</h3>
          <p className="brand-sub">
            Sensitive account suspensions strictly capture audit justifications and enforce
            self-suspension prohibitions.
          </p>

          <div style={{ marginTop: '1rem' }}>
            <strong>Registered Users ({users.length})</strong>
            <ul
              className="queue-list"
              style={{ marginTop: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}
            >
              {users.map((u) => (
                <li key={u.id} className="queue-item">
                  <div>
                    <strong>{u.name}</strong>
                    <div className="brand-sub">
                      {u.email || u.phone} · Roles: {u.roles.join(', ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className={`pill ${u.status === 'ACTIVE' ? '' : 'pill-warn'}`}>
                      {u.status}
                    </span>
                    <button
                      type="button"
                      className="filter-btn"
                      onClick={() =>
                        setSelectedEntity({
                          type: 'USER',
                          id: u.id,
                          name: u.name,
                          targetStatus: u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                        })
                      }
                    >
                      {u.status === 'ACTIVE' ? 'Suspend User' : 'Reinstate User'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <strong>Restaurant Outlets ({outlets.length})</strong>
            <ul
              className="queue-list"
              style={{ marginTop: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}
            >
              {outlets.map((o) => (
                <li key={o.outletId} className="queue-item">
                  <div>
                    <strong>
                      {o.brandName} — {o.name}
                    </strong>
                    <div className="brand-sub">
                      Zone: {o.zoneId} · Score:{' '}
                      {o.publishedSafetyScore ? `${o.publishedSafetyScore}/100` : 'Unrated'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className={`pill ${o.status === 'ACTIVE' ? '' : 'pill-warn'}`}>
                      {o.status}
                    </span>
                    <button
                      type="button"
                      className="filter-btn"
                      onClick={() =>
                        setSelectedEntity({
                          type: 'OUTLET',
                          id: o.outletId,
                          name: `${o.brandName} (${o.name})`,
                          targetStatus: o.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                        })
                      }
                    >
                      {o.status === 'ACTIVE' ? 'Suspend Outlet' : 'Reinstate Outlet'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: '1.5rem' }}>
            <strong>Delivery Partners ({partners.length})</strong>
            <ul
              className="queue-list"
              style={{ marginTop: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}
            >
              {partners.map((p) => (
                <li key={p.partnerId} className="queue-item">
                  <div>
                    <strong>{p.fullName}</strong>
                    <div className="brand-sub">
                      {p.vehicleType} · Rating: {p.rating.toFixed(1)} ★ · Shift: {p.shiftStatus}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className={`pill ${p.status === 'APPROVED' ? '' : 'pill-warn'}`}>
                      {p.status}
                    </span>
                    <button
                      type="button"
                      className="filter-btn"
                      onClick={() =>
                        setSelectedEntity({
                          type: 'PARTNER',
                          id: p.partnerId,
                          name: p.fullName,
                          targetStatus: p.status === 'APPROVED' ? 'SUSPENDED' : 'ACTIVE',
                        })
                      }
                    >
                      {p.status === 'APPROVED' ? 'Suspend Rider' : 'Reinstate Rider'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {selectedEntity && (
            <div
              className="panel panel-alt"
              style={{
                marginTop: '1.5rem',
                border: '2px solid var(--terracotta)',
              }}
            >
              <h3>
                Confirm {selectedEntity.targetStatus} Action for {selectedEntity.name}
              </h3>
              <form onSubmit={(e) => void handleEntityStatusUpdate(e)}>
                <div className="field">
                  <label htmlFor="actionReason">
                    Administrative Justification Reason (minimum 8 characters required):
                  </label>
                  <input
                    id="actionReason"
                    type="text"
                    required
                    minLength={8}
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="e.g. Audit investigation report #402, repeat food safety violation"
                  />
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem' }}>
                  <button type="submit" className="btn-primary">
                    Commit {selectedEntity.targetStatus} Status
                  </button>
                  <button
                    type="button"
                    className="filter-btn"
                    onClick={() => {
                      setSelectedEntity(null);
                      setActionReason('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: CONFIG & TWO-PERSON APPROVALS */}
      {activeTab === 'CONFIG' && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Kolkata Operational Configuration &amp; Feature Flags</h3>
          <p className="brand-sub">
            Configuration modifications require proposing a change with reason capture, followed by
            two-person review (proposers cannot approve their own changes).
          </p>

          <form
            onSubmit={(e) => void handleProposeConfig(e)}
            className="panel panel-alt"
            style={{ marginTop: '1rem' }}
          >
            <h4>Propose Configuration Adjustment</h4>
            <div style={{ display: 'flex', gap: '1.5rem', margin: '0.75rem 0', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={monsoonToggle}
                  onChange={(e) => setMonsoonToggle(e.target.checked)}
                />
                Monsoon Waterlogging Mode (Kolkata weather protocol)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={maintenanceToggle}
                  onChange={(e) => setMaintenanceToggle(e.target.checked)}
                />
                Platform Maintenance Mode
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={surgeToggle}
                  onChange={(e) => setSurgeToggle(e.target.checked)}
                />
                Emergency Surge Pricing Lock
              </label>
            </div>

            <div className="field">
              <label htmlFor="proposalReason">Justification Reason (&gt;= 8 chars):</label>
              <input
                id="proposalReason"
                type="text"
                required
                minLength={8}
                value={proposalReason}
                onChange={(e) => setProposalReason(e.target.value)}
                placeholder="e.g. Heavy downpour across EM Bypass and Park Circus causing waterlogging"
              />
            </div>
            <button type="submit" className="btn-primary" style={{ marginTop: '0.75rem' }}>
              Submit Configuration Proposal
            </button>
          </form>

          <div style={{ marginTop: '1.5rem' }}>
            <h4>Pending &amp; Historical Configuration Proposals ({proposals.length})</h4>
            <ul className="queue-list" style={{ marginTop: '0.5rem' }}>
              {proposals.map((prop) => (
                <li key={prop.proposalId} className="queue-item">
                  <div>
                    <strong>Proposal {prop.proposalId}</strong>
                    <div className="brand-sub">
                      Proposer: {prop.proposerUserId} ({prop.proposerRole}) · Reason: &quot;
                      {prop.reason}&quot;
                    </div>
                    <pre
                      style={{
                        margin: '0.25rem 0',
                        fontSize: '0.8rem',
                        background: 'var(--bg-card)',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                      }}
                    >
                      {JSON.stringify(prop.proposedChanges)}
                    </pre>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span
                      className={`pill ${
                        prop.status === 'APPROVED'
                          ? ''
                          : prop.status === 'REJECTED'
                            ? 'pill-warn'
                            : ''
                      }`}
                    >
                      {prop.status}
                    </span>
                    {prop.status === 'PENDING' && (
                      <>
                        <button
                          type="button"
                          className="filter-btn"
                          onClick={() => void handleReviewProposal(prop.proposalId, 'APPROVE')}
                        >
                          Approve (2-Person)
                        </button>
                        <button
                          type="button"
                          className="filter-btn"
                          onClick={() => void handleReviewProposal(prop.proposalId, 'REJECT')}
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* TAB 4: IMMUTABLE AUDIT EXPLORER */}
      {activeTab === 'AUDIT' && (
        <div style={{ marginTop: '1rem' }}>
          <h3>Immutable Audit Trail Explorer</h3>
          <p className="brand-sub">
            Query cryptographic and timestamped system action logs across all administrative and
            governance vectors.
          </p>

          <div
            style={{
              display: 'flex',
              gap: '0.75rem',
              margin: '1rem 0',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <div className="field" style={{ flex: 1, minWidth: '200px' }}>
              <input
                type="text"
                placeholder="Search reason, actor, or resource ID..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
              />
            </div>
            <div className="field" style={{ width: '200px' }}>
              <input
                type="text"
                placeholder="Filter action (e.g. user:status)"
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => void loadAuditLogs()}
              style={{ height: '42px', marginTop: 'auto' }}
            >
              Search Logs
            </button>
          </div>

          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
              marginTop: '0.5rem',
            }}
          >
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Timestamp</th>
                <th style={{ padding: '0.5rem' }}>Actor</th>
                <th style={{ padding: '0.5rem' }}>Action</th>
                <th style={{ padding: '0.5rem' }}>Resource</th>
                <th style={{ padding: '0.5rem' }}>Outcome</th>
                <th style={{ padding: '0.5rem' }}>Audit Reason</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.auditId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>
                    {new Date(log.createdAt).toLocaleTimeString('en-IN', {
                      timeZone: 'Asia/Kolkata',
                    })}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <strong>{log.actorRole}</strong>
                    <div className="brand-sub">{log.actorId.slice(0, 8)}...</div>
                  </td>
                  <td style={{ padding: '0.5rem' }}>{log.action}</td>
                  <td style={{ padding: '0.5rem' }}>
                    {log.resourceType}: {log.resourceId.slice(0, 10)}
                  </td>
                  <td style={{ padding: '0.5rem' }}>
                    <span className={`pill ${log.outcome === 'ALLOWED' ? '' : 'pill-warn'}`}>
                      {log.outcome}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem' }}>{log.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {auditLogs.length === 0 && (
            <p className="brand-sub" style={{ textAlign: 'center', marginTop: '1rem' }}>
              No audit logs matched query criteria.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
