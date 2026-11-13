import { useState, useEffect } from 'react';
import type {
  SupportTicketDto,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportEscalationTier,
  SupportResponseTemplateDto,
} from '@bhojora/shared';

interface Props {
  apiBase: string;
  accessToken: string | null;
  mfaVerified: boolean;
  onStatusUpdate: (msg: string) => void;
}

export function SupportOperationsDashboard({ apiBase, accessToken, onStatusUpdate }: Props) {
  const [tickets, setTickets] = useState<SupportTicketDto[]>([]);
  const [templates, setTemplates] = useState<SupportResponseTemplateDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicketDto | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | SupportTicketStatus>('ALL');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | SupportTicketPriority>('ALL');
  const [safetyOnly, setSafetyOnly] = useState(false);

  // Form states for selected ticket actions
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [assignAgentName, setAssignAgentName] = useState('');
  const [assignAgentId, setAssignAgentId] = useState('');
  const [escalateTier, setEscalateTier] = useState<SupportEscalationTier>('TIER_2_SENIOR');
  const [escalateReason, setEscalateReason] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (accessToken && apiBase) {
      void fetchTickets();
      void fetchTemplates();
    }
  }, [accessToken, apiBase]);

  async function fetchTickets() {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/support/tickets`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const payload = await res.json();
        const list: SupportTicketDto[] = payload.data?.tickets || [];
        setTickets(list);
        if (selectedTicket) {
          const updated = list.find((t) => t.ticketId === selectedTicket.ticketId);
          if (updated) setSelectedTicket(updated);
        }
      }
    } catch {
      onStatusUpdate('Could not load support tickets from API');
    } finally {
      setLoading(false);
    }
  }

  async function fetchTemplates() {
    try {
      const res = await fetch(`${apiBase}/api/v1/support/tickets/templates`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const payload = await res.json();
        setTemplates(payload.data?.templates || []);
      }
    } catch {
      // Non-blocking
    }
  }

  // Action handlers
  async function handleAssign() {
    if (!selectedTicket || !assignAgentId.trim() || !assignAgentName.trim()) {
      alert('Please provide Agent ID and Agent Name');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/support/tickets/${selectedTicket.ticketId}/assign`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            agentId: assignAgentId.trim(),
            agentName: assignAgentName.trim(),
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        onStatusUpdate(`Assignment failed: ${payload.error?.message || 'Unknown error'}`);
      } else {
        onStatusUpdate(`Ticket assigned to ${assignAgentName}`);
        setSelectedTicket(payload.data.ticket);
        await fetchTickets();
      }
    } catch {
      onStatusUpdate('Network error executing assignment');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEscalate() {
    if (!selectedTicket || !escalateReason.trim()) {
      alert('Please specify an escalation reason');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/support/tickets/${selectedTicket.ticketId}/escalate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            targetTier: escalateTier,
            reason: escalateReason.trim(),
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        onStatusUpdate(`Escalation failed: ${payload.error?.message || 'Unknown error'}`);
      } else {
        onStatusUpdate(`Ticket escalated to ${escalateTier}`);
        setSelectedTicket(payload.data.ticket);
        setEscalateReason('');
        await fetchTickets();
      }
    } catch {
      onStatusUpdate('Network error executing escalation');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSendMessage(templateId?: string) {
    if (!selectedTicket || !replyText.trim()) {
      alert('Please type a message before sending');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/support/tickets/${selectedTicket.ticketId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: replyText.trim(),
            isInternalNote,
            templateId,
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        onStatusUpdate(`Failed to post message: ${payload.error?.message || 'Unknown error'}`);
      } else {
        onStatusUpdate(isInternalNote ? 'Internal note added' : 'Message dispatched to ticket');
        setSelectedTicket(payload.data.ticket);
        setReplyText('');
        setIsInternalNote(false);
        await fetchTickets();
      }
    } catch {
      onStatusUpdate('Network error sending message');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResolve() {
    if (!selectedTicket || !resolutionNotes.trim()) {
      alert('Please provide resolution notes');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/support/tickets/${selectedTicket.ticketId}/resolve`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            resolutionNotes: resolutionNotes.trim(),
          }),
        },
      );
      const payload = await res.json();
      if (!res.ok || !payload.success) {
        onStatusUpdate(`Resolution failed: ${payload.error?.message || 'Unknown error'}`);
      } else {
        onStatusUpdate(`Ticket ${selectedTicket.ticketId} marked as RESOLVED`);
        setSelectedTicket(payload.data.ticket);
        setResolutionNotes('');
        await fetchTickets();
      }
    } catch {
      onStatusUpdate('Network error resolving ticket');
    } finally {
      setActionLoading(false);
    }
  }

  function applyCannedTemplate(tpl: SupportResponseTemplateDto) {
    setReplyText((prev) => (prev ? `${prev}\n\n${tpl.content}` : tpl.content));
    onStatusUpdate(`Applied template: ${tpl.title}`);
  }

  // Filter list
  const filteredTickets = tickets.filter((t) => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
    if (safetyOnly && !t.isSafetyPriority) return false;
    return true;
  });

  const totalOpen = tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;
  const safetyCount = tickets.filter((t) => t.isSafetyPriority).length;
  const breachedCount = tickets.filter((t) => t.isSlaBreached).length;

  return (
    <section className="panel" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Support Operations &amp; Escalation (Checkpoint 26)</h2>
          <p className="meta" style={{ margin: 0 }}>
            Ticket queues · SLA breach monitoring · Multi-tier escalation · Canned responses · Immutable case history
          </p>
        </div>
        <button
          type="button"
          className="filter-btn"
          onClick={() => void fetchTickets()}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : '🔄 Refresh Tickets'}
        </button>
      </div>

      {/* Metrics Row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '1rem',
          marginTop: '1.25rem',
        }}
      >
        <div style={{ background: 'var(--bg-canvas)', padding: '0.85rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--ink-600)' }}>Total In Queue</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{tickets.length}</div>
        </div>
        <div style={{ background: 'var(--bg-canvas)', padding: '0.85rem', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--ink-600)' }}>Active / Open</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--terracotta)' }}>
            {totalOpen}
          </div>
        </div>
        <div style={{ background: '#fef3e2', padding: '0.85rem', borderRadius: '8px', border: '1px solid #f9d8a6' }}>
          <div style={{ fontSize: '0.8rem', color: '#8a4b08' }}>Priority Safety Allegations</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#c05621' }}>
            {safetyCount}
          </div>
        </div>
        <div
          style={{
            background: breachedCount > 0 ? '#fee2e2' : 'var(--bg-canvas)',
            padding: '0.85rem',
            borderRadius: '8px',
            border: breachedCount > 0 ? '1px solid #fca5a5' : 'none',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: breachedCount > 0 ? '#991b1b' : 'var(--ink-600)' }}>
            SLA Breached
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: breachedCount > 0 ? '#b91c1c' : 'var(--ink-950)' }}>
            {breachedCount}
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div
        className="filter-row"
        style={{ marginTop: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}
      >
        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Status:</span>
        {(['ALL', 'OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className="filter-btn"
            aria-pressed={statusFilter === s}
            onClick={() => setStatusFilter(s)}
          >
            {s}
          </button>
        ))}

        <span style={{ fontSize: '0.85rem', fontWeight: 600, marginLeft: '0.5rem' }}>Priority:</span>
        {(['ALL', 'P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW'] as const).map((p) => (
          <button
            key={p}
            type="button"
            className="filter-btn"
            aria-pressed={priorityFilter === p}
            onClick={() => setPriorityFilter(p)}
          >
            {p.replace('_', ' ')}
          </button>
        ))}

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', marginLeft: 'auto', fontSize: '0.85rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={safetyOnly}
            onChange={(e) => setSafetyOnly(e.target.checked)}
          />
          <strong>🚨 Priority Safety Cases Only</strong>
        </label>
      </div>

      {/* Ticket List and Detail Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: selectedTicket ? '1fr 1.25fr' : '1fr',
          gap: '1.5rem',
          marginTop: '1.25rem',
        }}
      >
        {/* Ticket List */}
        <div>
          {filteredTickets.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-600)', background: 'var(--bg-canvas)', borderRadius: '8px' }}>
              No support tickets found matching active criteria.
            </div>
          ) : (
            <ul className="queue-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {filteredTickets.map((t) => {
                const isSelected = selectedTicket?.ticketId === t.ticketId;
                const isP1 = t.priority === 'P1_CRITICAL';
                const isP2 = t.priority === 'P2_HIGH';
                return (
                  <li
                    key={t.ticketId}
                    className="queue-item"
                    style={{
                      cursor: 'pointer',
                      borderLeft: t.isSafetyPriority
                        ? '4px solid #c05621'
                        : isP1
                          ? '4px solid #dc2626'
                          : isP2
                            ? '4px solid #d97706'
                            : '4px solid var(--border)',
                      background: isSelected ? 'var(--bg-alt)' : undefined,
                    }}
                    onClick={() => setSelectedTicket(t)}
                  >
                    <div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                        {t.isSafetyPriority && (
                          <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', background: '#fef3e2', color: '#c05621', borderRadius: '4px', fontWeight: 700 }}>
                            SAFETY ALLEGATION
                          </span>
                        )}
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            fontWeight: 700,
                            background: isP1 ? '#fee2e2' : isP2 ? '#fef3c7' : '#e0f2fe',
                            color: isP1 ? '#991b1b' : isP2 ? '#92400e' : '#0369a1',
                          }}
                        >
                          {t.priority}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--ink-600)' }}>
                          SLA: {t.slaMinutes}m
                        </span>
                        {t.isSlaBreached && (
                          <span style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '4px', fontWeight: 800 }}>
                            SLA BREACHED
                          </span>
                        )}
                      </div>
                      <strong>{t.subject}</strong>
                      <div className="brand-sub" style={{ marginTop: '0.2rem' }}>
                        ID: {t.ticketId} · Requester: {t.requester.name} ({t.requester.role})
                      </div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--ink-600)', marginTop: '0.2rem' }}>
                        Assigned: {t.assignedTo ? t.assignedTo.agentName : 'Unassigned'} · Tier: {t.escalationTier}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span className={`pill ${t.status === 'RESOLVED' ? '' : t.status === 'ESCALATED' ? 'pill-warn' : ''}`}>
                        {t.status}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Ticket Detail Drawer */}
        {selectedTicket && (
          <div
            style={{
              background: 'var(--bg-canvas)',
              borderRadius: '8px',
              padding: '1.25rem',
              border: '1px solid var(--border)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>{selectedTicket.subject}</h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--ink-600)', marginTop: '0.25rem' }}>
                  Ticket: <code>{selectedTicket.ticketId}</code> · Created: {new Date(selectedTicket.createdAt).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                className="filter-btn"
                onClick={() => setSelectedTicket(null)}
                style={{ fontSize: '0.8rem' }}
              >
                ✕ Close
              </button>
            </div>

            {/* Statutory Safety Alert Banner */}
            {selectedTicket.isSafetyPriority && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  background: '#fef3e2',
                  border: '1px solid #f9d8a6',
                  color: '#92400e',
                  fontSize: '0.85rem',
                }}
              >
                <strong>🚨 STATUTORY FOOD SAFETY ALLEGATION INVESTIGATION:</strong>
                <div>
                  Customer allegation recorded for independent trust &amp; safety verification. Invariant: Allegations do not alter certified inspection scores until formally adjudicated.
                </div>
              </div>
            )}

            {/* Metadata Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
              <span className="role-chip">Category: {selectedTicket.category}</span>
              <span className="role-chip">Tier: {selectedTicket.escalationTier}</span>
              <span className="role-chip">SLA: {selectedTicket.slaMinutes} mins</span>
              {selectedTicket.orderId && <span className="role-chip">Order: {selectedTicket.orderId}</span>}
              {selectedTicket.outletId && <span className="role-chip">Outlet: {selectedTicket.outletId}</span>}
            </div>

            {/* Resolution View if already resolved */}
            {selectedTicket.resolution && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.85rem',
                  borderRadius: '6px',
                  background: 'var(--trust-green-light)',
                  border: '1px solid var(--trust-green)',
                }}
              >
                <strong style={{ color: 'var(--trust-green-ink)' }}>✓ Ticket Resolved</strong>
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem' }}>
                  {selectedTicket.resolution.resolutionNotes}
                </p>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-600)', marginTop: '0.25rem' }}>
                  Resolved by {selectedTicket.resolution.resolvedByName} on{' '}
                  {new Date(selectedTicket.resolution.resolvedAt).toLocaleString()}
                </div>
              </div>
            )}

            {/* Operations Actions Accordion / Panels */}
            {selectedTicket.status !== 'RESOLVED' && (
              <div style={{ marginTop: '1.25rem', display: 'grid', gap: '1rem' }}>
                {/* 1. Assignment */}
                <div style={{ background: 'var(--bg-card)', padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    👤 Agent Assignment
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Agent ID (e.g. agt_kol_04)"
                      value={assignAgentId}
                      onChange={(e) => setAssignAgentId(e.target.value)}
                      style={{ flex: 1, padding: '0.4rem', fontSize: '0.85rem' }}
                    />
                    <input
                      type="text"
                      placeholder="Agent Name"
                      value={assignAgentName}
                      onChange={(e) => setAssignAgentName(e.target.value)}
                      style={{ flex: 1, padding: '0.4rem', fontSize: '0.85rem' }}
                    />
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void handleAssign()}
                      disabled={actionLoading}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                    >
                      Assign
                    </button>
                  </div>
                </div>

                {/* 2. Escalation */}
                <div style={{ background: 'var(--bg-card)', padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    ⚡ Escalate Ticket
                  </div>
                  <div style={{ display: 'grid', gap: '0.5rem' }}>
                    <select
                      value={escalateTier}
                      onChange={(e) => setEscalateTier(e.target.value as SupportEscalationTier)}
                      style={{ padding: '0.4rem', fontSize: '0.85rem' }}
                    >
                      <option value="TIER_2_SENIOR">Tier 2: Senior Support Specialist</option>
                      <option value="TIER_3_ESCALATIONS_LEAD">Tier 3: Escalations Team Lead</option>
                      <option value="TRUST_SAFETY_ADMIN">Trust &amp; Safety Adjudicator</option>
                      <option value="OPS_DIRECTOR">Operations Director</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Reason for escalation (required)"
                      value={escalateReason}
                      onChange={(e) => setEscalateReason(e.target.value)}
                      style={{ padding: '0.4rem', fontSize: '0.85rem' }}
                    />
                    <button
                      type="button"
                      className="filter-btn"
                      onClick={() => void handleEscalate()}
                      disabled={actionLoading}
                      style={{ alignSelf: 'start', fontSize: '0.85rem' }}
                    >
                      Submit Escalation
                    </button>
                  </div>
                </div>

                {/* 3. Resolution */}
                <div style={{ background: 'var(--bg-card)', padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    ✅ Final Resolution
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Document resolution findings and customer corrective action..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => void handleResolve()}
                    disabled={actionLoading}
                    style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}
                  >
                    Mark Ticket Resolved
                  </button>
                </div>
              </div>
            )}

            {/* Canned Responses */}
            {templates.length > 0 && selectedTicket.status !== 'RESOLVED' && (
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                  📑 Canned Response Templates
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {templates.map((tpl) => (
                    <button
                      key={tpl.templateId}
                      type="button"
                      className="filter-btn"
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                      onClick={() => applyCannedTemplate(tpl)}
                    >
                      + {tpl.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Conversation Thread */}
            <div style={{ marginTop: '1.25rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                💬 Conversation &amp; Internal Notes
              </div>
              <div style={{ display: 'grid', gap: '0.6rem', maxHeight: '240px', overflowY: 'auto' }}>
                {selectedTicket.messages.map((m) => (
                  <div
                    key={m.messageId}
                    style={{
                      background: m.isInternalNote ? '#fdf4ff' : 'var(--bg-card)',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      border: m.isInternalNote ? '1px solid #e879f9' : '1px solid var(--border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--ink-600)' }}>
                      <span>
                        <strong>{m.senderName}</strong> ({m.senderRole})
                        {m.isInternalNote && (
                          <span style={{ marginLeft: '0.5rem', color: '#a21caf', fontWeight: 700 }}>
                            🔒 INTERNAL STAFF NOTE
                          </span>
                        )}
                      </span>
                      <span>{new Date(m.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
                      {m.content}
                    </p>
                  </div>
                ))}
              </div>

              {/* Reply Form */}
              {selectedTicket.status !== 'RESOLVED' && (
                <div style={{ marginTop: '0.75rem' }}>
                  <textarea
                    rows={3}
                    placeholder="Type your response or internal note..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem', boxSizing: 'border-box' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                    <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isInternalNote}
                        onChange={(e) => setIsInternalNote(e.target.checked)}
                      />
                      <span>Post as Internal Staff Note (hidden from requester)</span>
                    </label>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => void handleSendMessage()}
                      disabled={actionLoading}
                      style={{ fontSize: '0.85rem', padding: '0.4rem 0.8rem' }}
                    >
                      Post Message
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Immutable Case History Audit Trail */}
            <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                📜 Immutable Case History (Audit Trail)
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.4rem', fontSize: '0.78rem' }}>
                {selectedTicket.caseHistory.map((h) => (
                  <li
                    key={h.eventId}
                    style={{
                      background: 'var(--bg-card)',
                      padding: '0.45rem 0.6rem',
                      borderRadius: '4px',
                      borderLeft: '3px solid var(--trust-green)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink-600)' }}>
                      <strong>{h.action}</strong>
                      <span>{new Date(h.timestamp).toLocaleString()}</span>
                    </div>
                    <div style={{ marginTop: '0.15rem' }}>
                      By {h.actorName} ({h.actorRole})
                      {h.note && ` — ${h.note}`}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
