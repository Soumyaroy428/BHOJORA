import { useState, useEffect } from 'react';
import type {
  AiEvaluationMetricsDto,
  AiProposalDto,
  AiTaskType,
  ApiResponse,
} from '@bhojora/shared';

export interface AiReviewDashboardProps {
  apiBase: string;
  accessToken: string | null;
  mfaVerified: boolean;
  onStatusUpdate: (message: string) => void;
}

export function AiReviewDashboard({
  apiBase,
  accessToken,
  mfaVerified,
  onStatusUpdate,
}: AiReviewDashboardProps) {
  const [proposals, setProposals] = useState<AiProposalDto[]>([]);
  const [metrics, setMetrics] = useState<AiEvaluationMetricsDto | null>(null);
  const [selectedTask, setSelectedTask] = useState<string>('ALL');
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Mock initial demo items to ensure immediate visual readiness even before first fetch
  const DEMO_PROPOSALS: AiProposalDto[] = [
    {
      id: 'aip_demo_photo_01',
      taskType: 'IMAGE_RISK_FLAG',
      targetEntity: 'inspection',
      targetId: 'insp_2026_pc_01',
      modelInfo: {
        modelName: 'gemini-1.5-flash',
        modelVersion: '2024.11-bhojora',
        provider: 'google-genai',
        promptHash: '8e4d29f0a1c3b5',
        generatedAt: new Date().toISOString(),
      },
      confidenceScore: 0.82,
      status: 'PENDING_HUMAN_REVIEW',
      suggestedOutput: {
        photoId: 'photo-kitchen-prep-4',
        detectedRisks: [
          {
            riskType: 'OPEN_CONTAINER',
            advisoryNote: 'Possible unlabelled open food container detected (Confidence: 82%)',
            confidence: 0.82,
            boundingCoordinates: { x: 120, y: 85, width: 240, height: 180 },
          },
        ],
        requiresImmediateAction: true,
        humanReviewRequired: true,
      },
      explainabilityNotes: [
        'Computer vision hygiene pattern detector evaluated photo for open containers and PPE.',
        'Human reviewer must accept or dismiss; AI cannot alter official safety score directly.',
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'aip_demo_complaint_02',
      taskType: 'COMPLAINT_CLASSIFICATION',
      targetEntity: 'complaint',
      targetId: 'cmp_2026_091',
      modelInfo: {
        modelName: 'gemini-1.5-flash',
        modelVersion: '2024.11-bhojora',
        provider: 'google-genai',
        promptHash: '3f71c49b0e2a87',
        generatedAt: new Date().toISOString(),
      },
      confidenceScore: 0.95,
      status: 'PENDING_HUMAN_REVIEW',
      suggestedOutput: {
        severity: 'CRITICAL',
        category: 'FOOD_SAFETY',
        confidence: 0.95,
        isHygieneRisk: true,
        recommendedAction: 'Trigger immediate audit hold on outlet; notify Trust & Safety lead.',
        summary: 'Complaint classified as FOOD_SAFETY (CRITICAL) with HYGIENE RISK.',
      },
      explainabilityNotes: [
        'Health hazard keywords detected (gastrointestinal distress symptoms). Escalated to CRITICAL.',
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  async function loadData() {
    if (!apiBase || !accessToken) {
      if (proposals.length === 0) {
        setProposals(DEMO_PROPOSALS);
      }
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${apiBase}/api/v1/ai/proposals`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        const payload = (await res.json()) as ApiResponse<{ proposals: AiProposalDto[] }>;
        if (payload.success && payload.data.proposals.length > 0) {
          setProposals(payload.data.proposals);
        } else if (proposals.length === 0) {
          setProposals(DEMO_PROPOSALS);
        }
      }

      const metricsRes = await fetch(`${apiBase}/api/v1/ai/metrics`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (metricsRes.ok) {
        const mPayload = (await metricsRes.json()) as ApiResponse<AiEvaluationMetricsDto>;
        if (mPayload.success) {
          setMetrics(mPayload.data);
        }
      }
    } catch {
      if (proposals.length === 0) {
        setProposals(DEMO_PROPOSALS);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [apiBase, accessToken]);

  async function handleReview(proposalId: string, decision: 'APPROVED' | 'REJECTED') {
    if (!mfaVerified) {
      onStatusUpdate('Privileged human review requires verified step-up MFA.');
      return;
    }

    setActionInProgress(proposalId);
    const feedback = feedbackMap[proposalId] ?? '';

    if (apiBase && accessToken) {
      try {
        const res = await fetch(`${apiBase}/api/v1/ai/proposals/${proposalId}/review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ decision, feedback }),
        });
        const payload = (await res.json()) as ApiResponse<AiProposalDto>;
        if (res.ok && payload.success) {
          onStatusUpdate(`Proposal ${proposalId} marked as ${decision}. Audit record logged.`);
          await loadData();
          setActionInProgress(null);
          return;
        }
      } catch {
        // Fallback to local state update if offline
      }
    }

    // Local deterministic update
    setProposals((prev) =>
      prev.map((item) =>
        item.id === proposalId
          ? {
              ...item,
              status: decision,
              humanReview: {
                reviewerId: 'operator_current',
                reviewerRole: 'SUPER_ADMIN',
                decision,
                feedback,
                reviewedAt: new Date().toISOString(),
              },
            }
          : item,
      ),
    );
    onStatusUpdate(`Proposal ${proposalId} updated to ${decision} (Local Session).`);
    setActionInProgress(null);
  }

  const filteredProposals =
    selectedTask === 'ALL'
      ? proposals
      : proposals.filter((p) => p.taskType === (selectedTask as AiTaskType));

  return (
    <section className="panel" aria-label="Human-in-the-Loop AI Review Queue">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>AI Assistive Intelligence &amp; Human-in-the-Loop Review</h2>
          <p className="status-note" style={{ margin: 0 }}>
            Mandatory Human Review: AI outputs are assistive advisory signals and NEVER self-certify
            hygiene scores.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <select
            value={selectedTask}
            onChange={(e) => setSelectedTask(e.target.value)}
            className="filter-btn"
            style={{ padding: '0.35rem 0.6rem' }}
          >
            <option value="ALL">All Task Types</option>
            <option value="IMAGE_RISK_FLAG">Vision Image Flags</option>
            <option value="COMPLAINT_CLASSIFICATION">Complaint Triage</option>
            <option value="REPORT_SUMMARY">Report Summaries</option>
            <option value="DEMAND_FORECAST">Demand Forecasts</option>
            <option value="RECOMMENDATION_BASELINE">Recommendations</option>
          </select>
          <button
            type="button"
            className="filter-btn"
            onClick={() => void loadData()}
            disabled={loading}
          >
            {loading ? 'Refreshing...' : 'Refresh Queue'}
          </button>
        </div>
      </div>

      {metrics ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '0.75rem',
            margin: '1rem 0',
          }}
        >
          <div className="card">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Total Proposals</span>
            <strong style={{ fontSize: '1.25rem', display: 'block' }}>
              {metrics.totalProposals}
            </strong>
          </div>
          <div className="card">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Pending Human Review
            </span>
            <strong style={{ fontSize: '1.25rem', display: 'block', color: 'var(--brand-gold)' }}>
              {metrics.pendingReview}
            </strong>
          </div>
          <div className="card">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Human Approval Rate
            </span>
            <strong style={{ fontSize: '1.25rem', display: 'block', color: 'var(--brand-green)' }}>
              {metrics.approvalRatePercentage}%
            </strong>
          </div>
          <div className="card">
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Avg Confidence</span>
            <strong style={{ fontSize: '1.25rem', display: 'block' }}>
              {(metrics.averageConfidence * 100).toFixed(0)}%
            </strong>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredProposals.map((item) => {
          const isPending = item.status === 'PENDING_HUMAN_REVIEW';
          const isApproved = item.status === 'APPROVED';
          const isRejected = item.status === 'REJECTED';

          return (
            <div
              key={item.id}
              className="card"
              style={{
                borderLeft: `4px solid ${
                  isApproved ? 'var(--brand-green)' : isRejected ? '#d32f2f' : 'var(--brand-gold)'
                }`,
                padding: '1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '0.5rem',
                }}
              >
                <div>
                  <span
                    className="role-chip"
                    style={{
                      background: 'rgba(0,0,0,0.06)',
                      fontSize: '0.75rem',
                      marginRight: '0.5rem',
                    }}
                  >
                    {item.taskType}
                  </span>
                  <strong>Proposal ID: {item.id}</strong>
                  <span
                    style={{
                      color: 'var(--text-muted)',
                      fontSize: '0.85rem',
                      marginLeft: '0.5rem',
                    }}
                  >
                    Target: {item.targetEntity} / {item.targetId}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span
                    className="role-chip"
                    style={{
                      background:
                        item.confidenceScore >= 0.9
                          ? 'rgba(46, 125, 50, 0.15)'
                          : 'rgba(230, 81, 0, 0.15)',
                      color: item.confidenceScore >= 0.9 ? '#2e7d32' : '#e65100',
                      fontWeight: 600,
                    }}
                  >
                    Model Confidence: {(item.confidenceScore * 100).toFixed(0)}%
                  </span>
                  <span
                    className="role-chip"
                    style={{
                      background: isApproved
                        ? 'rgba(46, 125, 50, 0.2)'
                        : isRejected
                          ? 'rgba(211, 47, 47, 0.2)'
                          : 'rgba(255, 179, 0, 0.2)',
                      color: isApproved ? '#2e7d32' : isRejected ? '#d32f2f' : '#b26a00',
                      fontWeight: 700,
                    }}
                  >
                    {item.status}
                  </span>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.02)',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  marginBottom: '0.75rem',
                  border: '1px solid var(--border)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    marginBottom: '0.25rem',
                  }}
                >
                  Model Provenance: <code>{item.modelInfo.modelName}</code> (
                  {item.modelInfo.modelVersion}) · Prompt Hash:{' '}
                  <code>{item.modelInfo.promptHash}</code>
                </div>
                <div style={{ margin: '0.5rem 0' }}>
                  <strong>Advisory Finding:</strong>
                  <pre
                    style={{
                      margin: '0.25rem 0 0',
                      padding: '0.5rem',
                      background: 'rgba(0,0,0,0.04)',
                      borderRadius: '4px',
                      fontSize: '0.85rem',
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                    }}
                  >
                    {JSON.stringify(item.suggestedOutput, null, 2)}
                  </pre>
                </div>
                {item.explainabilityNotes?.length ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <em>Explainability:</em> {item.explainabilityNotes.join(' ')}
                  </div>
                ) : null}
              </div>

              {isPending ? (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    alignItems: 'center',
                    marginTop: '0.5rem',
                  }}
                >
                  <input
                    type="text"
                    placeholder="Reviewer notes or corrective justification (optional)"
                    value={feedbackMap[item.id] ?? ''}
                    onChange={(e) => setFeedbackMap({ ...feedbackMap, [item.id]: e.target.value })}
                    style={{
                      flex: '1 1 240px',
                      padding: '0.4rem 0.6rem',
                      fontSize: '0.85rem',
                      borderRadius: '4px',
                      border: '1px solid var(--border)',
                    }}
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    style={{
                      background: 'var(--brand-green)',
                      borderColor: 'var(--brand-green)',
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.85rem',
                    }}
                    onClick={() => void handleReview(item.id, 'APPROVED')}
                    disabled={actionInProgress === item.id}
                  >
                    Accept Finding
                  </button>
                  <button
                    type="button"
                    className="filter-btn"
                    style={{
                      color: '#d32f2f',
                      borderColor: '#d32f2f',
                      padding: '0.4rem 0.8rem',
                      fontSize: '0.85rem',
                    }}
                    onClick={() => void handleReview(item.id, 'REJECTED')}
                    disabled={actionInProgress === item.id}
                  >
                    Dismiss as False Positive
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    fontSize: '0.85rem',
                    color: 'var(--text-muted)',
                    borderTop: '1px solid var(--border)',
                    paddingTop: '0.5rem',
                  }}
                >
                  Reviewed by: <code>{item.humanReview?.reviewerId ?? 'Operator'}</code> (
                  {item.humanReview?.reviewerRole}) on{' '}
                  {item.humanReview?.reviewedAt
                    ? new Date(item.humanReview.reviewedAt).toLocaleString()
                    : 'N/A'}
                  {item.humanReview?.feedback ? ` — Note: "${item.humanReview.feedback}"` : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
