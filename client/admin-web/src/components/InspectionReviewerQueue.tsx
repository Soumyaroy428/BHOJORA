import { useState, useEffect } from 'react';
import type { InspectionRecordDto, ReviewDecision } from '@bhojora/shared';

interface Props {
  apiBase: string;
  accessToken: string | null;
  mfaVerified: boolean;
  onStatusUpdate: (msg: string) => void;
}

export function InspectionReviewerQueue({ apiBase, accessToken, onStatusUpdate }: Props) {
  const [queue, setQueue] = useState<InspectionRecordDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState<InspectionRecordDto | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');
  const [actionInProgress, setActionInProgress] = useState(false);

  useEffect(() => {
    if (accessToken && apiBase) {
      void fetchQueue();
    }
  }, [accessToken, apiBase]);

  async function fetchQueue() {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/inspections/review-queue`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const payload = await res.json();
        setQueue(payload.data?.queue || []);
      }
    } catch {
      onStatusUpdate('Could not load inspection review queue from API');
    } finally {
      setLoading(false);
    }
  }

  async function handleReviewDecision(decision: ReviewDecision) {
    if (!selectedInspection || !decisionNotes.trim()) {
      alert('Please provide review notes before submitting decision');
      return;
    }
    setActionInProgress(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/inspections/${selectedInspection.id}/review`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          decision,
          notes: decisionNotes.trim(),
          scorePolicyVersion: 'SCORE_POLICY_V1',
        }),
      });

      const payload = await res.json();
      if (!res.ok || !payload.success) {
        onStatusUpdate(`Review failed: ${payload.error?.message || 'Error executing review'}`);
      } else {
        onStatusUpdate(`Inspection ${selectedInspection.id} decision executed: ${decision}`);
        setSelectedInspection(null);
        setDecisionNotes('');
        await fetchQueue();
      }
    } catch {
      onStatusUpdate('Network error communicating with control plane');
    } finally {
      setActionInProgress(false);
    }
  }

  return (
    <section className="panel" style={{ marginTop: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>Independent Inspection Reviewer Queue (ADR-005)</h2>
          <p className="meta" style={{ margin: 0 }}>
            Governed Food Safety Assessments · Strict Anti-Self-Review · Critical Override Gate
          </p>
        </div>
        <button
          type="button"
          className="filter-btn"
          onClick={() => void fetchQueue()}
          disabled={loading}
        >
          {loading ? 'Refreshing...' : '🔄 Refresh Queue'}
        </button>
      </div>

      <div style={{ marginTop: '1rem' }}>
        {queue.length === 0 ? (
          <div
            style={{
              padding: '1.5rem',
              backgroundColor: '#0F172A',
              borderRadius: '8px',
              border: '1px solid #1E293B',
              textAlign: 'center',
              color: '#94A3B8',
              fontSize: '13px',
            }}
          >
            No submitted inspections awaiting independent review in the Kolkata queue.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {queue.map((item) => {
              const rawTotalScore = item.findings.reduce((acc, f) => acc + f.score, 0);
              const maxScore = item.findings.reduce((acc, f) => acc + f.maxScore, 0);
              const percent = maxScore > 0 ? Math.round((rawTotalScore / maxScore) * 100) : 0;

              return (
                <div
                  key={item.id}
                  style={{
                    backgroundColor: '#0F172A',
                    border: '1px solid #1E293B',
                    borderRadius: '8px',
                    padding: '1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <div>
                      <span
                        style={{
                          backgroundColor: '#1E293B',
                          color: '#38BDF8',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 700,
                        }}
                      >
                        {item.assessmentType} AUDIT · {item.checklistVersion}
                      </span>
                      <h3 style={{ margin: '4px 0 2px 0', fontSize: '15px', color: '#F8FAFC' }}>
                        Outlet: {item.outletId} (Rest: {item.restaurantId})
                      </h3>
                      <p style={{ margin: 0, fontSize: '11px', color: '#94A3B8' }}>
                        Inspector ID: <code>{item.inspectorId}</code> · Submitted:{' '}
                        {item.submittedAt ? new Date(item.submittedAt).toLocaleString() : 'N/A'}
                      </p>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: '18px',
                          fontWeight: 800,
                          color: item.hasCriticalViolation ? '#EF4444' : '#10B981',
                        }}
                      >
                        {percent}% Raw Score
                      </div>
                      {item.hasCriticalViolation && (
                        <span
                          style={{
                            display: 'inline-block',
                            backgroundColor: '#450A0A',
                            color: '#F87171',
                            border: '1px solid #DC2626',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 700,
                            marginTop: '2px',
                          }}
                        >
                          ⚠️ CRITICAL OVERRIDE TRIGGERED
                        </span>
                      )}
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#1E293B',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '0.75rem',
                    }}
                  >
                    <span>
                      Findings: {item.findings.length} items | Evidence: {item.evidence.length}{' '}
                      verified files
                    </span>
                    <span>
                      Manager Debrief: <strong>{item.managerName || 'Signed on device'}</strong>
                    </span>
                  </div>

                  <button
                    type="button"
                    className="filter-btn"
                    onClick={() => {
                      setSelectedInspection(item);
                      setDecisionNotes('');
                    }}
                    style={{ width: '100%' }}
                  >
                    Open Audit for Independent Evaluation & Scoring
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedInspection && (
        <div
          style={{
            marginTop: '1.5rem',
            backgroundColor: '#0F172A',
            border: '2px solid #38BDF8',
            borderRadius: '8px',
            padding: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, color: '#38BDF8' }}>
              Reviewing Inspection: {selectedInspection.id}
            </h3>
            <button
              type="button"
              className="filter-btn"
              onClick={() => setSelectedInspection(null)}
            >
              ✕ Close
            </button>
          </div>

          <div
            style={{
              margin: '1rem 0',
              padding: '10px',
              backgroundColor: '#1E293B',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          >
            <strong>ADR-005 Independence Gate:</strong>
            <p style={{ margin: '4px 0 0 0', color: '#94A3B8' }}>
              Inspectors can never self-approve. The backend strictly cross-checks reviewer ID
              against inspector user identity.
            </p>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label
              style={{ display: 'block', fontSize: '12px', color: '#CBD5E1', marginBottom: '6px' }}
            >
              Independent Reviewer Findings &amp; Rationale:
            </label>
            <textarea
              rows={3}
              value={decisionNotes}
              onChange={(e) => setDecisionNotes(e.target.value)}
              placeholder="Record explicit verification rationale, evidence audit notes, or required clarifications..."
              style={{
                width: '100%',
                backgroundColor: '#0B0F17',
                border: '1px solid #334155',
                borderRadius: '6px',
                color: '#FFFFFF',
                padding: '8px',
                fontSize: '12px',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={actionInProgress}
              onClick={() => void handleReviewDecision('APPROVE')}
              style={{
                backgroundColor: '#10B981',
                color: '#FFFFFF',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✓ Approve &amp; Issue Final Grade (Policy V1)
            </button>

            <button
              type="button"
              disabled={actionInProgress}
              onClick={() => void handleReviewDecision('RETURN_FOR_CLARIFICATION')}
              style={{
                backgroundColor: '#F59E0B',
                color: '#FFFFFF',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ↩ Return for Clarification
            </button>

            <button
              type="button"
              disabled={actionInProgress}
              onClick={() => void handleReviewDecision('REJECT')}
              style={{
                backgroundColor: '#EF4444',
                color: '#FFFFFF',
                padding: '8px 16px',
                borderRadius: '6px',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ✕ Reject Assessment
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
