/**
 * BHOJORA Support Operations & Escalation Contracts (CHECKPOINT_26)
 *
 * Defines canonical data contracts for support ticketing, SLA monitoring,
 * assignment, tiered escalation, canned response templates, and immutable case history.
 */

export type SupportTicketPriority = 'P1_CRITICAL' | 'P2_HIGH' | 'P3_MEDIUM' | 'P4_LOW';

export type SupportTicketStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING_ON_CUSTOMER'
  | 'WAITING_ON_RESTAURANT'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED';

export type SupportTicketCategory =
  | 'FOOD_SAFETY'
  | 'MISSING_ITEMS'
  | 'DELIVERY_DELAY'
  | 'WRONG_ORDER'
  | 'PAYMENT_ISSUE'
  | 'GENERAL_QUERY'
  | 'PARTNER_DISPUTE';

export type SupportEscalationTier =
  | 'TIER_1_AGENT'
  | 'TIER_2_SENIOR'
  | 'TIER_3_ESCALATIONS_LEAD'
  | 'TRUST_SAFETY_ADMIN'
  | 'OPS_DIRECTOR';

export type SupportAuditEventAction =
  | 'CREATED'
  | 'ASSIGNED'
  | 'STATUS_CHANGED'
  | 'ESCALATED'
  | 'MESSAGE_SENT'
  | 'INTERNAL_NOTE_ADDED'
  | 'CANNED_RESPONSE_APPLIED'
  | 'RESOLVED'
  | 'CLOSED';

export const PRIORITY_SLA_MINUTES: Readonly<Record<SupportTicketPriority, number>> = {
  P1_CRITICAL: 15,
  P2_HIGH: 60,
  P3_MEDIUM: 240,
  P4_LOW: 1440,
};

export const CATEGORY_DEFAULT_PRIORITY: Readonly<Record<SupportTicketCategory, SupportTicketPriority>> = {
  FOOD_SAFETY: 'P1_CRITICAL',
  MISSING_ITEMS: 'P2_HIGH',
  WRONG_ORDER: 'P2_HIGH',
  DELIVERY_DELAY: 'P3_MEDIUM',
  PAYMENT_ISSUE: 'P3_MEDIUM',
  PARTNER_DISPUTE: 'P3_MEDIUM',
  GENERAL_QUERY: 'P4_LOW',
};

export interface SupportTicketRequesterDto {
  id: string;
  role: string;
  name: string;
  phoneMasked?: string;
  emailMasked?: string;
}

export interface SupportTicketMessageDto {
  messageId: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  content: string;
  isInternalNote: boolean;
  createdAt: string;
}

export interface SupportTicketCaseHistoryEventDto {
  eventId: string;
  timestamp: string;
  actorId: string;
  actorRole: string;
  actorName: string;
  action: SupportAuditEventAction;
  note?: string;
  previousStatus?: SupportTicketStatus;
  newStatus?: SupportTicketStatus;
  previousTier?: SupportEscalationTier;
  newTier?: SupportEscalationTier;
}

export interface SupportTicketResolutionDto {
  resolvedByUserId: string;
  resolvedByName: string;
  resolutionNotes: string;
  resolvedAt: string;
}

export interface SupportResponseTemplateDto {
  templateId: string;
  title: string;
  category: SupportTicketCategory;
  content: string;
}

export interface SupportTicketDto {
  ticketId: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  subject: string;
  description: string;
  requester: SupportTicketRequesterDto;
  orderId?: string;
  outletId?: string;
  safetyComplaintId?: string;
  isSafetyPriority: boolean;
  slaMinutes: number;
  slaTargetUtc: string;
  isSlaBreached: boolean;
  assignedTo?: {
    agentId: string;
    agentName: string;
    assignedAt: string;
  } | null;
  escalationTier: SupportEscalationTier;
  messages: SupportTicketMessageDto[];
  caseHistory: SupportTicketCaseHistoryEventDto[];
  resolution?: SupportTicketResolutionDto;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSupportTicketRequest {
  category: SupportTicketCategory;
  subject: string;
  description: string;
  priority?: SupportTicketPriority;
  orderId?: string;
  outletId?: string;
  safetyComplaintId?: string;
}

export interface AssignSupportTicketRequest {
  agentId: string;
  agentName: string;
}

export interface EscalateSupportTicketRequest {
  targetTier: SupportEscalationTier;
  reason: string;
}

export interface AddTicketMessageRequest {
  content: string;
  isInternalNote?: boolean;
  templateId?: string;
}

export interface ResolveSupportTicketRequest {
  resolutionNotes: string;
}

export interface SupportTicketListFilter {
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
  isSafetyPriority?: boolean;
  isSlaBreached?: boolean;
  assignedToAgentId?: string;
  requesterId?: string;
  outletId?: string;
}
