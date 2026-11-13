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
