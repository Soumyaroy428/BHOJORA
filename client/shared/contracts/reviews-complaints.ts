export type ReviewStatus = 'PENDING_MODERATION' | 'APPROVED' | 'FLAGGED' | 'REJECTED';

export interface OrderItemReviewDto {
  menuItemId: string;
  itemTitle: string;
  rating: number; // 1-5
  comment?: string;
}

export interface ReviewEvidencePhotoDto {
  url: string;
  caption?: string;
  hashSha256?: string;
}

export interface RestaurantReviewResponseDto {
  responseText: string;
  respondedAt: string;
  respondedByUserId: string;
}

export interface OrderReviewDto {
  reviewId: string;
  orderId: string;
  outletId: string;
  restaurantId: string;
  customerId: string;
  customerDisplayName: string;
  foodRating: number; // 1-5
  restaurantRating: number; // 1-5
  deliveryRating: number | null; // 1-5 or null
  overallRating: number; // 1-5
  comment: string;
  itemReviews?: OrderItemReviewDto[];
  photos?: ReviewEvidencePhotoDto[];
  status: ReviewStatus;
  moderationReason?: string;
  moderatedAt?: string;
  restaurantResponse?: RestaurantReviewResponseDto;
  createdAt: string;
  updatedAt: string;
}

export interface PublicReviewDto {
  reviewId: string;
  outletId: string;
  customerDisplayName: string; // Strictly masked, e.g. "Soumya R."
  foodRating: number;
  restaurantRating: number;
  deliveryRating: number | null;
  overallRating: number;
  comment: string;
  itemReviews?: { itemTitle: string; rating: number }[];
  photos?: { url: string; caption?: string }[];
  restaurantResponse?: {
    responseText: string;
    respondedAt: string;
  };
  createdAt: string;
}

export interface PublicOutletReviewsSummaryDto {
  outletId: string;
  averageFoodRating: number;
  averageRestaurantRating: number;
  averageDeliveryRating: number | null;
  overallAverageRating: number;
  totalReviews: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  reviews: PublicReviewDto[];
}

export interface CreateOrderReviewRequest {
  orderId: string;
  foodRating: number; // 1 to 5
  restaurantRating: number; // 1 to 5
  deliveryRating?: number; // 1 to 5
  comment: string;
  itemReviews?: {
    menuItemId: string;
    itemTitle: string;
    rating: number;
    comment?: string;
  }[];
  photos?: {
    url: string;
    caption?: string;
    hashSha256?: string;
  }[];
}

export interface RestaurantReviewResponseRequest {
  responseText: string; // 1-1000 characters
}

export interface ModerateReviewRequest {
  status: 'APPROVED' | 'FLAGGED' | 'REJECTED';
  moderationReason?: string;
}

export type SafetyComplaintCategory =
  | 'FOREIGN_OBJECT'
  | 'UNDERCOOKED_FOOD'
  | 'SPOILED_CONTAMINATED'
  | 'FOOD_POISONING'
  | 'ALLERGEN_MISLABELING'
  | 'HYGIENE_PACKAGING'
  | 'OTHER';

export type SafetyComplaintSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type SafetyComplaintStatus =
  | 'ALLEGATION_RECORDED'
  | 'UNDER_INVESTIGATION'
  | 'EXPLANATION_REQUESTED'
  | 'EXPLANATION_PROVIDED'
  | 'RESOLVED'
  | 'DISMISSED';

export type FindingStatus =
  'UNCONFIRMED_ALLEGATION' | 'REJECTED_ALLEGATION' | 'SUBSTANTIATED_FINDING';

export interface SafetyComplaintEvidenceDto {
  url: string;
  sha256Checksum: string;
  caption?: string;
  uploadedAt: string;
}

export interface RestaurantComplaintExplanationDto {
  explanationText: string;
  correctiveActionTaken?: string;
  respondedAt: string;
  respondedByUserId: string;
}

export interface FoodSafetyComplaintDto {
  complaintId: string;
  orderId: string;
  outletId: string;
  customerId: string;
  customerDisplayName: string;
  category: SafetyComplaintCategory;
  severity: SafetyComplaintSeverity;
  incidentTime: string;
  description: string;
  symptoms?: string[];
  evidencePhotos: SafetyComplaintEvidenceDto[];
  medicalReportAttached: boolean;
  status: SafetyComplaintStatus;
  isAllegation: true; // Invariant: complaints are allegations, distinct from confirmed inspection scores
  findingStatus: FindingStatus;
  statutoryDisclaimer: string;
  responseDeadlineUtc?: string;
  restaurantExplanation?: RestaurantComplaintExplanationDto;
  resolutionNotes?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Privacy-sanitized complaint view for restaurant portal (customer PII redacted) */
export interface RestaurantSanitizedComplaintDto {
  complaintId: string;
  orderId: string;
  outletId: string;
  maskedCustomerIdentifier: string; // e.g. "Customer #C-4821", no phone, no email, no address
  category: SafetyComplaintCategory;
  severity: SafetyComplaintSeverity;
  incidentTime: string;
  description: string;
  symptoms?: string[];
  evidencePhotos: { url: string; caption?: string }[]; // Food photos only
  status: SafetyComplaintStatus;
  isAllegation: true;
  findingStatus: FindingStatus;
  responseDeadlineUtc?: string;
  restaurantExplanation?: {
    explanationText: string;
    correctiveActionTaken?: string;
    respondedAt: string;
  };
  createdAt: string;
}

export interface CreateFoodSafetyComplaintRequest {
  orderId: string;
  category: SafetyComplaintCategory;
  description: string;
  incidentTime?: string;
  symptoms?: string[];
  evidencePhotos?: {
    url: string;
    sha256Checksum?: string;
    caption?: string;
  }[];
  medicalReportAttached?: boolean;
}

export interface RestaurantComplaintExplanationRequest {
  explanationText: string;
  correctiveActionTaken?: string;
}

export interface ResolveSafetyComplaintRequest {
  status: 'RESOLVED' | 'DISMISSED';
  findingStatus: 'REJECTED_ALLEGATION' | 'SUBSTANTIATED_FINDING';
  resolutionNotes: string;
}
