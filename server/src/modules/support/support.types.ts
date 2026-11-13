import { z } from 'zod';
import type {
  CreateFoodSafetyComplaintRequest,
  CreateOrderReviewRequest,
  FindingStatus,
  FoodSafetyComplaintDto,
  ModerateReviewRequest,
  OrderItemReviewDto,
  OrderReviewDto,
  PublicOutletReviewsSummaryDto,
  PublicReviewDto,
  ResolveSafetyComplaintRequest,
  RestaurantComplaintExplanationDto,
  RestaurantComplaintExplanationRequest,
  RestaurantReviewResponseDto,
  RestaurantReviewResponseRequest,
  RestaurantSanitizedComplaintDto,
  ReviewEvidencePhotoDto,
  ReviewStatus,
  SafetyComplaintCategory,
  SafetyComplaintEvidenceDto,
  SafetyComplaintSeverity,
  SafetyComplaintStatus,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketCategory,
  SupportEscalationTier,
  SupportAuditEventAction,
  SupportTicketRequesterDto,
  SupportTicketMessageDto,
  SupportTicketCaseHistoryEventDto,
  SupportTicketResolutionDto,
  SupportResponseTemplateDto,
  SupportTicketDto,
  CreateSupportTicketRequest,
  AssignSupportTicketRequest,
  EscalateSupportTicketRequest,
  AddTicketMessageRequest,
  ResolveSupportTicketRequest,
  SupportTicketListFilter,
} from '@bhojora/shared';

export type {
  CreateFoodSafetyComplaintRequest,
  CreateOrderReviewRequest,
  FindingStatus,
  FoodSafetyComplaintDto,
  ModerateReviewRequest,
  OrderItemReviewDto,
  OrderReviewDto,
  PublicOutletReviewsSummaryDto,
  PublicReviewDto,
  ResolveSafetyComplaintRequest,
  RestaurantComplaintExplanationDto,
  RestaurantComplaintExplanationRequest,
  RestaurantReviewResponseDto,
  RestaurantReviewResponseRequest,
  RestaurantSanitizedComplaintDto,
  ReviewEvidencePhotoDto,
  ReviewStatus,
  SafetyComplaintCategory,
  SafetyComplaintEvidenceDto,
  SafetyComplaintSeverity,
  SafetyComplaintStatus,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketCategory,
  SupportEscalationTier,
  SupportAuditEventAction,
  SupportTicketRequesterDto,
  SupportTicketMessageDto,
  SupportTicketCaseHistoryEventDto,
  SupportTicketResolutionDto,
  SupportResponseTemplateDto,
  SupportTicketDto,
  CreateSupportTicketRequest,
  AssignSupportTicketRequest,
  EscalateSupportTicketRequest,
  AddTicketMessageRequest,
  ResolveSupportTicketRequest,
  SupportTicketListFilter,
};

export const REVIEW_STATUSES = ['PENDING_MODERATION', 'APPROVED', 'FLAGGED', 'REJECTED'] as const;

export const SAFETY_COMPLAINT_CATEGORIES = [
  'FOREIGN_OBJECT',
  'UNDERCOOKED_FOOD',
  'SPOILED_CONTAMINATED',
  'FOOD_POISONING',
  'ALLERGEN_MISLABELING',
  'HYGIENE_PACKAGING',
  'OTHER',
] as const;

export const SAFETY_COMPLAINT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export const SAFETY_COMPLAINT_STATUSES = [
  'ALLEGATION_RECORDED',
  'UNDER_INVESTIGATION',
  'EXPLANATION_REQUESTED',
  'EXPLANATION_PROVIDED',
  'RESOLVED',
  'DISMISSED',
] as const;

export const FINDING_STATUSES = [
  'UNCONFIRMED_ALLEGATION',
  'REJECTED_ALLEGATION',
  'SUBSTANTIATED_FINDING',
] as const;

export const STATUTORY_ALLEGATION_DISCLAIMER =
  'Allegation recorded for independent trust & safety verification. Not a confirmed regulatory or platform finding until formally investigated.' as const;

/** Category to statutory default severity mapping */
export const CATEGORY_DEFAULT_SEVERITY: Readonly<
  Record<SafetyComplaintCategory, SafetyComplaintSeverity>
> = {
  FOREIGN_OBJECT: 'CRITICAL',
  FOOD_POISONING: 'CRITICAL',
  ALLERGEN_MISLABELING: 'CRITICAL',
  UNDERCOOKED_FOOD: 'HIGH',
  SPOILED_CONTAMINATED: 'HIGH',
  HYGIENE_PACKAGING: 'MEDIUM',
  OTHER: 'LOW',
};

/** High/Critical severity requires restaurant explanation within 12 hours; Low/Medium within 24 hours */
export const SEVERITY_DEADLINE_HOURS: Readonly<Record<SafetyComplaintSeverity, number>> = {
  CRITICAL: 12,
  HIGH: 12,
  MEDIUM: 24,
  LOW: 24,
};

/** Known spam or toxic triggers for automated review abuse screening */
export const ABUSE_FLAG_KEYWORDS = [
  'scam',
  'fraud',
  'free food hack',
  'whatsapp me',
  'crypto',
  'telegram',
  'viagra',
  'casino',
  'hate',
  'curse',
] as const;

// Zod Schemas for API Input Validation

export const createOrderReviewSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  foodRating: z.number().int().min(1).max(5),
  restaurantRating: z.number().int().min(1).max(5),
  deliveryRating: z.number().int().min(1).max(5).optional(),
  comment: z
    .string()
    .trim()
    .min(1, 'Comment is required')
    .max(1000, 'Comment cannot exceed 1000 characters'),
  itemReviews: z
    .array(
      z.object({
        menuItemId: z.string().min(1),
        itemTitle: z.string().min(1),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(500).optional(),
      }),
    )
    .optional(),
  photos: z
    .array(
      z.object({
        url: z.string().url('Must be a valid URL'),
        caption: z.string().trim().max(200).optional(),
        hashSha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char hex SHA-256')
          .optional(),
      }),
    )
    .max(5)
    .optional(),
});

export const restaurantReviewResponseSchema = z.object({
  responseText: z
    .string()
    .trim()
    .min(2, 'Response must be at least 2 characters')
    .max(1000, 'Response cannot exceed 1000 characters'),
});

export const moderateReviewSchema = z.object({
  status: z.enum(['APPROVED', 'FLAGGED', 'REJECTED']),
  moderationReason: z.string().trim().max(500).optional(),
});

export const createSafetyComplaintSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  category: z.enum(SAFETY_COMPLAINT_CATEGORIES),
  description: z
    .string()
    .trim()
    .min(10, 'Complaint description must be at least 10 characters')
    .max(2000, 'Complaint description cannot exceed 2000 characters'),
  incidentTime: z.string().datetime().optional(),
  symptoms: z.array(z.string().trim().min(2).max(100)).max(10).optional(),
  evidencePhotos: z
    .array(
      z.object({
        url: z.string().url('Must be a valid URL'),
        sha256Checksum: z
          .string()
          .regex(/^[a-f0-9]{64}$/i, 'Must be valid 64-char hex SHA-256')
          .optional(),
        caption: z.string().trim().max(200).optional(),
      }),
    )
    .max(10)
    .optional(),
  medicalReportAttached: z.boolean().optional(),
});

export const restaurantComplaintExplanationSchema = z.object({
  explanationText: z
    .string()
    .trim()
    .min(10, 'Explanation must be at least 10 characters')
    .max(2000, 'Explanation cannot exceed 2000 characters'),
  correctiveActionTaken: z.string().trim().max(2000).optional(),
});

export const resolveSafetyComplaintSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  findingStatus: z.enum(['REJECTED_ALLEGATION', 'SUBSTANTIATED_FINDING']),
  resolutionNotes: z
    .string()
    .trim()
    .min(5, 'Resolution notes must be at least 5 characters')
    .max(2000),
});

// ==========================================
// SUPPORT OPERATIONS (CHECKPOINT_26)
// ==========================================

export const SUPPORT_TICKET_CATEGORIES = [
  'FOOD_SAFETY',
  'MISSING_ITEMS',
  'DELIVERY_DELAY',
  'WRONG_ORDER',
  'PAYMENT_ISSUE',
  'GENERAL_QUERY',
  'PARTNER_DISPUTE',
] as const;

export const SUPPORT_TICKET_PRIORITIES = [
  'P1_CRITICAL',
  'P2_HIGH',
  'P3_MEDIUM',
  'P4_LOW',
] as const;

export const SUPPORT_TICKET_STATUSES = [
  'OPEN',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING_ON_CUSTOMER',
  'WAITING_ON_RESTAURANT',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
] as const;

export const SUPPORT_ESCALATION_TIERS = [
  'TIER_1_AGENT',
  'TIER_2_SENIOR',
  'TIER_3_ESCALATIONS_LEAD',
  'TRUST_SAFETY_ADMIN',
  'OPS_DIRECTOR',
] as const;

export const PRIORITY_SLA_MINUTES: Readonly<Record<SupportTicketPriority, number>> = {
  P1_CRITICAL: 15,
  P2_HIGH: 60,
  P3_MEDIUM: 240,
  P4_LOW: 1440,
};

export const CATEGORY_DEFAULT_PRIORITY: Readonly<
  Record<SupportTicketCategory, SupportTicketPriority>
> = {
  FOOD_SAFETY: 'P1_CRITICAL',
  MISSING_ITEMS: 'P2_HIGH',
  WRONG_ORDER: 'P2_HIGH',
  DELIVERY_DELAY: 'P3_MEDIUM',
  PAYMENT_ISSUE: 'P3_MEDIUM',
  PARTNER_DISPUTE: 'P3_MEDIUM',
  GENERAL_QUERY: 'P4_LOW',
};

export const CANNED_RESPONSE_TEMPLATES: readonly SupportResponseTemplateDto[] = [
  {
    templateId: 'tpl_safety_audit',
    title: 'Food Safety Investigation Notice',
    category: 'FOOD_SAFETY',
    content:
      'Thank you for alerting us. Under BHOJORA Trust & Safety governance, your allegation has been assigned to our Trust & Safety Investigation team. The restaurant has been officially notified to provide verification. Our team will audit the findings within our statutory timeline.',
  },
  {
    templateId: 'tpl_missing_items',
    title: 'Missing Items Verification & Resolution',
    category: 'MISSING_ITEMS',
    content:
      'We sincerely apologize that your order was incomplete. We have recorded the missing items and initiated verification with the restaurant partner. A corrective credit or refund will be processed in accordance with BHOJORA customer satisfaction standards.',
  },
  {
    templateId: 'tpl_delivery_delay',
    title: 'Delivery Delay & Courier Status Check',
    category: 'DELIVERY_DELAY',
    content:
      'We apologize for the delivery delay. We have contacted our dispatch coordinator and the delivery partner to prioritize your handover immediately. You can track real-time location via the tracking screen.',
  },
  {
    templateId: 'tpl_wrong_order',
    title: 'Wrong Order Replacement & Refund Review',
    category: 'WRONG_ORDER',
    content:
      'We apologize for receiving an incorrect item. Our support team is verifying order details with the merchant and delivery courier to immediately authorize an exchange or full refund.',
  },
  {
    templateId: 'tpl_general_inquiry',
    title: 'General Inquiry Resolution',
    category: 'GENERAL_QUERY',
    content:
      'Thank you for reaching out to BHOJORA Customer Care. We have recorded your feedback and our team is actively addressing your request.',
  },
  {
    templateId: 'tpl_partner_kds_prep',
    title: 'Partner Kitchen Prep SLA Notice',
    category: 'PARTNER_DISPUTE',
    content:
      'This is BHOJORA Operations. Please ensure kitchen preparation buffers are accurately updated in your KDS prep board to prevent dispatch queue throttling and customer wait times.',
  },
] as const;

export const createSupportTicketSchema = z.object({
  category: z.enum(SUPPORT_TICKET_CATEGORIES),
  subject: z.string().trim().min(5, 'Subject must be at least 5 characters').max(200),
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(2000),
  priority: z.enum(SUPPORT_TICKET_PRIORITIES).optional(),
  orderId: z.string().trim().min(1).optional(),
  outletId: z.string().trim().min(1).optional(),
  safetyComplaintId: z.string().trim().min(1).optional(),
});

export const assignSupportTicketSchema = z.object({
  agentId: z.string().trim().min(1, 'Agent ID is required'),
  agentName: z.string().trim().min(1, 'Agent Name is required'),
});

export const escalateSupportTicketSchema = z.object({
  targetTier: z.enum(SUPPORT_ESCALATION_TIERS),
  reason: z.string().trim().min(5, 'Escalation reason must be at least 5 characters').max(1000),
});

export const addTicketMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message content cannot be empty').max(3000),
  isInternalNote: z.boolean().optional().default(false),
  templateId: z.string().trim().optional(),
});

export const resolveSupportTicketSchema = z.object({
  resolutionNotes: z
    .string()
    .trim()
    .min(5, 'Resolution notes must be at least 5 characters')
    .max(2000),
});

