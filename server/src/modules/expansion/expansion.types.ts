import { z } from 'zod';
import type { ExpansionDecisionStatus } from '@bhojora/shared';

export const EXPANSION_DECISION_STATUSES = [
  'GO_EXPANSION',
  'NO_GO_HOLD',
  'CONDITIONAL_REVISION',
] as const satisfies readonly ExpansionDecisionStatus[];

export const founderApprovalSchema = z.object({
  founderName: z.string().trim().min(3).max(100),
  approvalDecision: z.enum(EXPANSION_DECISION_STATUSES),
  comments: z.string().trim().min(10).max(1000),
});

export type FounderApprovalInput = z.infer<typeof founderApprovalSchema>;
