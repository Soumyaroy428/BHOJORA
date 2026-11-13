import crypto from 'node:crypto';
import type { ApiErrorCode } from '../../contracts/api';
import { AppError } from '../../middleware/error-handler';
import type { OrderStore } from '../orders/orders.types';
import type { RestaurantStore } from '../restaurant/restaurant.types';
import type {
  CreateFoodSafetyComplaintRequest,
  CreateOrderReviewRequest,
  FoodSafetyComplaintDto,
  OrderReviewDto,
  PublicOutletReviewsSummaryDto,
  PublicReviewDto,
  RestaurantSanitizedComplaintDto,
  SafetyComplaintSeverity,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportEscalationTier,
  SupportTicketRequesterDto,
  SupportResponseTemplateDto,
  SupportTicketDto,
  CreateSupportTicketRequest,
  AssignSupportTicketRequest,
  EscalateSupportTicketRequest,
  AddTicketMessageRequest,
  ResolveSupportTicketRequest,
  SupportTicketListFilter,
} from './support.types';
import {
  ABUSE_FLAG_KEYWORDS,
  CATEGORY_DEFAULT_SEVERITY,
  createOrderReviewSchema,
  createSafetyComplaintSchema,
  moderateReviewSchema,
  restaurantComplaintExplanationSchema,
  restaurantReviewResponseSchema,
  resolveSafetyComplaintSchema,
  SEVERITY_DEADLINE_HOURS,
  STATUTORY_ALLEGATION_DISCLAIMER,
  PRIORITY_SLA_MINUTES,
  CATEGORY_DEFAULT_PRIORITY,
  CANNED_RESPONSE_TEMPLATES,
  createSupportTicketSchema,
  assignSupportTicketSchema,
  escalateSupportTicketSchema,
  addTicketMessageSchema,
  resolveSupportTicketSchema,
} from './support.types';
import type {
  FoodSafetyComplaintRecord,
  OrderReviewRecord,
  SupportTicketRecord,
  SupportStore,
} from './support.store';

export class SupportHttpError extends AppError {
  constructor(statusCode: number, message: string, _code?: string) {
    let resolvedCode: ApiErrorCode = 'VALIDATION_ERROR';
    if (statusCode === 403) resolvedCode = 'FORBIDDEN';
    else if (statusCode === 404) resolvedCode = 'NOT_FOUND';
    else if (statusCode === 409) resolvedCode = 'CONFLICT';
    else if (statusCode >= 500) resolvedCode = 'INTERNAL_SERVER_ERROR';
    super(statusCode, resolvedCode, message);
    this.name = 'SupportHttpError';
  }
}

export interface SupportServiceOptions {
  supportStore: SupportStore;
  orderStore: OrderStore;
  restaurantStore: RestaurantStore;
  clock?: { now(): Date };
  onSafetyComplaintEscalated?: (complaint: FoodSafetyComplaintRecord) => Promise<void> | void;
}

export class SupportService {
  private readonly supportStore: SupportStore;
  private readonly orderStore: OrderStore;
  private readonly restaurantStore: RestaurantStore;
  private readonly clock: { now(): Date };
  private readonly onSafetyComplaintEscalated?: (
    complaint: FoodSafetyComplaintRecord,
  ) => Promise<void> | void;

  constructor(options: SupportServiceOptions) {
    this.supportStore = options.supportStore;
    this.orderStore = options.orderStore;
    this.restaurantStore = options.restaurantStore;
    this.clock = options.clock ?? { now: () => new Date() };
    this.onSafetyComplaintEscalated = options.onSafetyComplaintEscalated;
  }

  getClock(): { now(): Date } {
    return this.clock;
  }

  // ==========================================
  // 1. VERIFIED-ORDER REVIEWS WORKFLOW
  // ==========================================

  async submitOrderReview(
    customerId: string,
    customerDisplayName: string,
    rawInput: unknown,
  ): Promise<OrderReviewDto> {
    const input: CreateOrderReviewRequest = createOrderReviewSchema.parse(rawInput);

    // 1. Order verification
    const order = await this.orderStore.getOrderById(input.orderId);
    if (!order) {
      throw new SupportHttpError(404, `Order ${input.orderId} not found`, 'ORDER_NOT_FOUND');
    }

    if (order.customerId !== customerId) {
      throw new SupportHttpError(
        403,
        'You can only submit reviews for your own orders',
        'FORBIDDEN_ORDER_OWNER',
      );
    }

    if (order.status !== 'DELIVERED') {
      throw new SupportHttpError(
        400,
        `Only delivered orders can be reviewed (current order status: ${order.status})`,
        'ORDER_NOT_DELIVERED',
      );
    }

    // 2. Duplicate prevention (Abuse gate)
    const existingReview = await this.supportStore.getReviewByOrderId(input.orderId);
    if (existingReview) {
      throw new SupportHttpError(
        409,
        `Order ${input.orderId} has already been reviewed`,
        'REVIEW_ALREADY_EXISTS',
      );
    }

    // 3. Automated Abuse / Content Screening
    const isAbusive = this.checkContentForAbuse(input.comment);
    const initialStatus = isAbusive ? 'FLAGGED' : 'APPROVED';
    const moderationReason = isAbusive
      ? 'Automated content policy: flagged for potential spam or inappropriate keywords'
      : undefined;

    // 4. Multi-dimensional overall score computation
    const overallRating = input.deliveryRating
      ? Math.round((input.foodRating + input.restaurantRating + input.deliveryRating) / 3)
      : Math.round((input.foodRating + input.restaurantRating) / 2);

    const nowIso = this.clock.now().toISOString();
    const maskedName = this.formatMaskedName(customerDisplayName);

    const record: OrderReviewRecord = {
      reviewId: crypto.randomUUID(),
      orderId: order.orderId,
      outletId: order.outletId,
      restaurantId: order.restaurantId ?? '',
      customerId,
      customerDisplayName: maskedName,
      foodRating: input.foodRating,
      restaurantRating: input.restaurantRating,
      deliveryRating: input.deliveryRating ?? null,
      overallRating,
      comment: input.comment,
      itemReviews: input.itemReviews,
      photos: input.photos,
      status: initialStatus,
      moderationReason,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const saved = await this.supportStore.createReview(record);
    return this.toReviewDto(saved);
  }

  async respondToReview(
    restaurantUserId: string,
    reviewId: string,
    rawInput: unknown,
  ): Promise<OrderReviewDto> {
    const input = restaurantReviewResponseSchema.parse(rawInput);

    const review = await this.supportStore.getReviewById(reviewId);
    if (!review) {
      throw new SupportHttpError(404, `Review ${reviewId} not found`, 'REVIEW_NOT_FOUND');
    }

    // Ownership check: user must own the restaurant
    const isAuthorized = await this.verifyRestaurantOwnership(
      restaurantUserId,
      review.restaurantId,
    );
    if (!isAuthorized) {
      throw new SupportHttpError(
        403,
        'You are not authorized to respond on behalf of this restaurant',
        'FORBIDDEN_RESTAURANT_RESPONSE',
      );
    }

    // Must be approved to respond
    if (review.status !== 'APPROVED') {
      throw new SupportHttpError(
        400,
        `Cannot respond to review with status ${review.status}`,
        'REVIEW_NOT_APPROVED',
      );
    }

    // Single official response limit
    if (review.restaurantResponse) {
      throw new SupportHttpError(
        409,
        'This review already has an official restaurant response',
        'RESPONSE_ALREADY_EXISTS',
      );
    }

    const nowIso = this.clock.now().toISOString();
    const updated = await this.supportStore.updateReview(reviewId, {
      restaurantResponse: {
        responseText: input.responseText,
        respondedAt: nowIso,
        respondedByUserId: restaurantUserId,
      },
    });

    if (!updated) {
      throw new SupportHttpError(500, 'Failed to update review response', 'UPDATE_FAILED');
    }

    return this.toReviewDto(updated);
  }

  async moderateReview(
    adminUserId: string,
    reviewId: string,
    rawInput: unknown,
  ): Promise<OrderReviewDto> {
    const input = moderateReviewSchema.parse(rawInput);

    const review = await this.supportStore.getReviewById(reviewId);
    if (!review) {
      throw new SupportHttpError(404, `Review ${reviewId} not found`, 'REVIEW_NOT_FOUND');
    }

    const nowIso = this.clock.now().toISOString();
    const updated = await this.supportStore.updateReview(reviewId, {
      status: input.status,
      moderationReason: input.moderationReason ?? `Moderated by admin ${adminUserId}`,
      moderatedAt: nowIso,
    });

    if (!updated) {
      throw new SupportHttpError(500, 'Failed to moderate review', 'UPDATE_FAILED');
    }

    return this.toReviewDto(updated);
  }

  async getPublicOutletReviewsSummary(
    outletId: string,
    limit: number = 50,
  ): Promise<PublicOutletReviewsSummaryDto> {
    const approvedReviews = await this.supportStore.listReviewsByOutletId(outletId, {
      status: 'APPROVED',
      limit,
    });

    const totalReviews = approvedReviews.length;
    const ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    if (totalReviews === 0) {
      return {
        outletId,
        averageFoodRating: 0,
        averageRestaurantRating: 0,
        averageDeliveryRating: null,
        overallAverageRating: 0,
        totalReviews: 0,
        ratingDistribution,
        reviews: [],
      };
    }

    let sumFood = 0;
    let sumRestaurant = 0;
    let sumDelivery = 0;
    let countDelivery = 0;
    let sumOverall = 0;

    const publicReviews: PublicReviewDto[] = [];

    for (const r of approvedReviews) {
      sumFood += r.foodRating;
      sumRestaurant += r.restaurantRating;
      sumOverall += r.overallRating;

      if (r.deliveryRating !== null) {
        sumDelivery += r.deliveryRating;
        countDelivery++;
      }

      const bucket = Math.max(1, Math.min(5, Math.round(r.overallRating))) as 1 | 2 | 3 | 4 | 5;
      ratingDistribution[bucket] = (ratingDistribution[bucket] ?? 0) + 1;

      publicReviews.push({
        reviewId: r.reviewId,
        outletId: r.outletId,
        customerDisplayName: r.customerDisplayName, // strictly masked (e.g. "Soumya R.")
        foodRating: r.foodRating,
        restaurantRating: r.restaurantRating,
        deliveryRating: r.deliveryRating,
        overallRating: r.overallRating,
        comment: r.comment,
        itemReviews: r.itemReviews?.map((i) => ({
          itemTitle: i.itemTitle,
          rating: i.rating,
        })),
        photos: r.photos?.map((p) => ({
          url: p.url,
          caption: p.caption,
        })),
        restaurantResponse: r.restaurantResponse
          ? {
              responseText: r.restaurantResponse.responseText,
              respondedAt: r.restaurantResponse.respondedAt,
            }
          : undefined,
        createdAt: r.createdAt,
      });
    }

    return {
      outletId,
      averageFoodRating: Number((sumFood / totalReviews).toFixed(1)),
      averageRestaurantRating: Number((sumRestaurant / totalReviews).toFixed(1)),
      averageDeliveryRating:
        countDelivery > 0 ? Number((sumDelivery / countDelivery).toFixed(1)) : null,
      overallAverageRating: Number((sumOverall / totalReviews).toFixed(1)),
      totalReviews,
      ratingDistribution,
      reviews: publicReviews,
    };
  }

  // ==========================================
  // 2. FOOD SAFETY COMPLAINT INTAKE WORKFLOW
  // ==========================================

  async submitSafetyComplaint(
    customerId: string,
    customerDisplayName: string,
    rawInput: unknown,
  ): Promise<FoodSafetyComplaintDto> {
    const input: CreateFoodSafetyComplaintRequest = createSafetyComplaintSchema.parse(rawInput);

    // 1. Order verification
    const order = await this.orderStore.getOrderById(input.orderId);
    if (!order) {
      throw new SupportHttpError(404, `Order ${input.orderId} not found`, 'ORDER_NOT_FOUND');
    }

    if (order.customerId !== customerId) {
      throw new SupportHttpError(
        403,
        'You can only submit food safety complaints for your own orders',
        'FORBIDDEN_ORDER_OWNER',
      );
    }

    if (order.status !== 'DELIVERED') {
      throw new SupportHttpError(
        400,
        `Safety complaints can only be filed for delivered orders (current status: ${order.status})`,
        'ORDER_NOT_DELIVERED',
      );
    }

    // 2. Duplicate abuse prevention (Prevent multiple allegations for same issue on same order)
    const existing = await this.supportStore.getComplaintByOrderId(input.orderId);
    if (existing && existing.category === input.category) {
      throw new SupportHttpError(
        409,
        `A safety complaint for ${input.category} has already been recorded for this order`,
        'DUPLICATE_COMPLAINT',
      );
    }

    // 3. Statutory Severity & Deadlines
    const severity: SafetyComplaintSeverity = CATEGORY_DEFAULT_SEVERITY[input.category];
    const deadlineHours = SEVERITY_DEADLINE_HOURS[severity];
    const now = this.clock.now();
    const deadlineDate = new Date(now.getTime() + deadlineHours * 60 * 60 * 1000);

    // 4. Evidence checksum normalization
    const evidencePhotos = (input.evidencePhotos ?? []).map((photo) => ({
      url: photo.url,
      sha256Checksum:
        photo.sha256Checksum ?? crypto.createHash('sha256').update(photo.url).digest('hex'),
      caption: photo.caption,
      uploadedAt: now.toISOString(),
    }));

    // 5. Build complaint record with STRICT ALLEGATION INVARIANTS:
    // - isAllegation is strictly true
    // - findingStatus is strictly UNCONFIRMED_ALLEGATION
    // - Does NOT alter the certified safety inspection score!
    const complaintId = crypto.randomUUID();
    const maskedName = this.formatMaskedName(customerDisplayName);

    const record: FoodSafetyComplaintRecord = {
      complaintId,
      orderId: order.orderId,
      outletId: order.outletId,
      customerId,
      customerDisplayName: maskedName,
      category: input.category,
      severity,
      incidentTime: input.incidentTime ?? now.toISOString(),
      description: input.description,
      symptoms: input.symptoms,
      evidencePhotos,
      medicalReportAttached: Boolean(input.medicalReportAttached),
      status: 'ALLEGATION_RECORDED',
      isAllegation: true,
      findingStatus: 'UNCONFIRMED_ALLEGATION',
      statutoryDisclaimer: STATUTORY_ALLEGATION_DISCLAIMER,
      responseDeadlineUtc: deadlineDate.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const saved = await this.supportStore.createComplaint(record);

    // 6. Escalation triggers for critical/high allegations:
    // Auto-create prioritized P1/P2 support ticket for Trust & Safety Investigation
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      try {
        await this.createSafetySupportTicket(saved);
      } catch {
        // Non-blocking fallback
      }
      if (this.onSafetyComplaintEscalated) {
        try {
          await this.onSafetyComplaintEscalated(saved);
        } catch {
          // Non-blocking for client response
        }
      }
    }

    return this.toComplaintDto(saved);
  }

  async submitRestaurantComplaintExplanation(
    restaurantUserId: string,
    complaintId: string,
    rawInput: unknown,
  ): Promise<FoodSafetyComplaintDto> {
    const input = restaurantComplaintExplanationSchema.parse(rawInput);

    const complaint = await this.supportStore.getComplaintById(complaintId);
    if (!complaint) {
      throw new SupportHttpError(
        404,
        `Safety complaint ${complaintId} not found`,
        'COMPLAINT_NOT_FOUND',
      );
    }

    // Verify restaurant ownership
    const order = await this.orderStore.getOrderById(complaint.orderId);
    const restaurantId = order?.restaurantId ?? '';
    const isAuthorized = await this.verifyRestaurantOwnership(restaurantUserId, restaurantId);
    if (!isAuthorized) {
      throw new SupportHttpError(
        403,
        'You are not authorized to respond on behalf of this restaurant',
        'FORBIDDEN_RESTAURANT_RESPONSE',
      );
    }

    const nowIso = this.clock.now().toISOString();
    const updated = await this.supportStore.updateComplaint(complaintId, {
      status: 'EXPLANATION_PROVIDED',
      restaurantExplanation: {
        explanationText: input.explanationText,
        correctiveActionTaken: input.correctiveActionTaken,
        respondedAt: nowIso,
        respondedByUserId: restaurantUserId,
      },
    });

    if (!updated) {
      throw new SupportHttpError(500, 'Failed to update complaint explanation', 'UPDATE_FAILED');
    }

    return this.toComplaintDto(updated);
  }

  async resolveComplaint(
    adminUserId: string,
    complaintId: string,
    rawInput: unknown,
  ): Promise<FoodSafetyComplaintDto> {
    const input = resolveSafetyComplaintSchema.parse(rawInput);

    const complaint = await this.supportStore.getComplaintById(complaintId);
    if (!complaint) {
      throw new SupportHttpError(
        404,
        `Safety complaint ${complaintId} not found`,
        'COMPLAINT_NOT_FOUND',
      );
    }

    const nowIso = this.clock.now().toISOString();
    const updated = await this.supportStore.updateComplaint(complaintId, {
      status: input.status,
      findingStatus: input.findingStatus,
      resolutionNotes: `${input.resolutionNotes} [Resolved by ${adminUserId}]`,
      resolvedAt: nowIso,
    });

    if (!updated) {
      throw new SupportHttpError(500, 'Failed to resolve complaint', 'UPDATE_FAILED');
    }

    return this.toComplaintDto(updated);
  }

  // ==========================================
  // 3. PRIVACY SANITIZATION AND VIEWS
  // ==========================================

  /**
   * Restaurant portal view: Customer PII (phone, email, full address, private medical records)
   * is completely redacted.
   */
  async getRestaurantComplaintsSanitized(
    restaurantUserId: string,
    outletId: string,
  ): Promise<RestaurantSanitizedComplaintDto[]> {
    const outlet = await this.restaurantStore.getOutletById(outletId);
    if (!outlet) {
      throw new SupportHttpError(404, `Outlet ${outletId} not found`, 'OUTLET_NOT_FOUND');
    }

    const isAuthorized = await this.verifyRestaurantOwnership(
      restaurantUserId,
      outlet.restaurantId,
    );
    if (!isAuthorized) {
      throw new SupportHttpError(
        403,
        'You are not authorized to view complaints for this outlet',
        'FORBIDDEN_OUTLET_VIEW',
      );
    }

    const complaints = await this.supportStore.listComplaintsByOutletId(outletId);

    return complaints.map((c) => ({
      complaintId: c.complaintId,
      orderId: c.orderId,
      outletId: c.outletId,
      maskedCustomerIdentifier: `Customer #C-${c.complaintId.slice(0, 6).toUpperCase()}`,
      category: c.category,
      severity: c.severity,
      incidentTime: c.incidentTime,
      description: c.description,
      symptoms: c.symptoms,
      evidencePhotos: c.evidencePhotos.map((p) => ({
        url: p.url,
        caption: p.caption,
      })),
      status: c.status,
      isAllegation: true,
      findingStatus: c.findingStatus,
      responseDeadlineUtc: c.responseDeadlineUtc,
      restaurantExplanation: c.restaurantExplanation
        ? {
            explanationText: c.restaurantExplanation.explanationText,
            correctiveActionTaken: c.restaurantExplanation.correctiveActionTaken,
            respondedAt: c.restaurantExplanation.respondedAt,
          }
        : undefined,
      createdAt: c.createdAt,
    }));
  }

  async getCustomerComplaints(customerId: string): Promise<FoodSafetyComplaintDto[]> {
    const list = await this.supportStore.listComplaintsByCustomerId(customerId);
    return list.map((c) => this.toComplaintDto(c));
  }

  async hasActiveSafetyInvestigation(outletId: string): Promise<boolean> {
    const active = await this.supportStore.listActiveAllegationsByOutletId(outletId);
    return active.length > 0;
  }

  async getActiveAllegationCount(outletId: string): Promise<number> {
    const active = await this.supportStore.listActiveAllegationsByOutletId(outletId);
    return active.length;
  }

  // ==========================================
  // HELPERS
  // ==========================================

  private checkContentForAbuse(text: string): boolean {
    const lower = text.toLowerCase();
    for (const keyword of ABUSE_FLAG_KEYWORDS) {
      if (lower.includes(keyword)) {
        return true;
      }
    }
    // Also flag links/URLs in review comments
    if (/(https?:\/\/|www\.)\S+/i.test(text)) {
      return true;
    }
    return false;
  }

  private formatMaskedName(name?: string): string {
    if (!name || name.trim().length === 0) {
      return 'Verified Diner';
    }
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
      const single = parts[0]!;
      if (single.includes('@')) {
        const username = single.split('@')[0]!;
        return username.slice(0, 3) + '***';
      }
      return single.slice(0, 1).toUpperCase() + single.slice(1);
    }
    const firstName = parts[0]!;
    const lastInitial = parts[parts.length - 1]!.slice(0, 1).toUpperCase();
    return `${firstName} ${lastInitial}.`;
  }

  private async verifyRestaurantOwnership(userId: string, restaurantId: string): Promise<boolean> {
    if (!restaurantId) return false;
    const application = await this.restaurantStore.getApplicationById(restaurantId);
    if (application && application.ownerUserId === userId) {
      return true;
    }
    const outlet = await this.restaurantStore.getOutletById(restaurantId);
    if (outlet && outlet.ownerUserId === userId) {
      return true;
    }
    return false;
  }

  private toReviewDto(r: OrderReviewRecord): OrderReviewDto {
    return {
      reviewId: r.reviewId,
      orderId: r.orderId,
      outletId: r.outletId,
      restaurantId: r.restaurantId,
      customerId: r.customerId,
      customerDisplayName: r.customerDisplayName,
      foodRating: r.foodRating,
      restaurantRating: r.restaurantRating,
      deliveryRating: r.deliveryRating,
      overallRating: r.overallRating,
      comment: r.comment,
      itemReviews: r.itemReviews,
      photos: r.photos,
      status: r.status,
      moderationReason: r.moderationReason,
      moderatedAt: r.moderatedAt,
      restaurantResponse: r.restaurantResponse,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  private toComplaintDto(c: FoodSafetyComplaintRecord): FoodSafetyComplaintDto {
    return {
      complaintId: c.complaintId,
      orderId: c.orderId,
      outletId: c.outletId,
      customerId: c.customerId,
      customerDisplayName: c.customerDisplayName,
      category: c.category,
      severity: c.severity,
      incidentTime: c.incidentTime,
      description: c.description,
      symptoms: c.symptoms,
      evidencePhotos: c.evidencePhotos,
      medicalReportAttached: c.medicalReportAttached,
      status: c.status,
      isAllegation: true,
      findingStatus: c.findingStatus,
      statutoryDisclaimer: c.statutoryDisclaimer,
      responseDeadlineUtc: c.responseDeadlineUtc,
      restaurantExplanation: c.restaurantExplanation,
      resolutionNotes: c.resolutionNotes,
      resolvedAt: c.resolvedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
  }

  // ==========================================
  // 3. SUPPORT OPERATIONS & ESCALATION (CP26)
  // ==========================================

  private isSupportOrAdmin(role: string): boolean {
    return (
      role === 'SUPPORT_AGENT' ||
      role === 'OPS_ADMIN' ||
      role === 'TRUST_ADMIN' ||
      role === 'SUPER_ADMIN'
    );
  }

  private isSlaBreached(targetUtc: string, status: SupportTicketStatus): boolean {
    if (status === 'RESOLVED' || status === 'CLOSED') {
      return false;
    }
    return this.clock.now() > new Date(targetUtc);
  }

  private toTicketDto(
    t: SupportTicketRecord,
    options?: { stripInternalNotes?: boolean },
  ): SupportTicketDto {
    const isBreached = this.isSlaBreached(t.slaTargetUtc, t.status);
    const messages = options?.stripInternalNotes
      ? t.messages.filter((m) => !m.isInternalNote)
      : t.messages;
    return {
      ticketId: t.ticketId,
      category: t.category,
      priority: t.priority,
      status: t.status,
      subject: t.subject,
      description: t.description,
      requester: t.requester,
      orderId: t.orderId,
      outletId: t.outletId,
      safetyComplaintId: t.safetyComplaintId,
      isSafetyPriority: t.isSafetyPriority,
      slaMinutes: t.slaMinutes,
      slaTargetUtc: t.slaTargetUtc,
      isSlaBreached: isBreached,
      assignedTo: t.assignedTo,
      escalationTier: t.escalationTier,
      messages,
      caseHistory: t.caseHistory,
      resolution: t.resolution,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  getResponseTemplates(): readonly SupportResponseTemplateDto[] {
    return CANNED_RESPONSE_TEMPLATES;
  }

  async createSafetySupportTicket(complaint: FoodSafetyComplaintRecord): Promise<SupportTicketDto> {
    const now = this.clock.now();
    const priority: SupportTicketPriority =
      complaint.severity === 'CRITICAL' ? 'P1_CRITICAL' : 'P2_HIGH';
    const slaMinutes = PRIORITY_SLA_MINUTES[priority];
    const slaTargetUtc = new Date(now.getTime() + slaMinutes * 60 * 1000).toISOString();
    const ticketId = `tkt_safety_${crypto.randomUUID().slice(0, 8)}`;

    const record: SupportTicketRecord = {
      ticketId,
      category: 'FOOD_SAFETY',
      priority,
      status: 'OPEN',
      subject: `[URGENT SAFETY AUDIT] ${complaint.category.replace('_', ' ')}: Order ${complaint.orderId}`,
      description: `Customer allegation recorded for independent trust & safety verification. Category: ${complaint.category}. Severity: ${complaint.severity}. Details: ${complaint.description}`,
      requester: {
        id: complaint.customerId,
        role: 'CUSTOMER',
        name: complaint.customerDisplayName,
      },
      orderId: complaint.orderId,
      outletId: complaint.outletId,
      safetyComplaintId: complaint.complaintId,
      isSafetyPriority: true,
      slaMinutes,
      slaTargetUtc,
      escalationTier: 'TRUST_SAFETY_ADMIN',
      messages: [
        {
          messageId: crypto.randomUUID(),
          senderId: complaint.customerId,
          senderRole: 'CUSTOMER',
          senderName: complaint.customerDisplayName,
          content: `Food safety allegation filed: ${complaint.description}`,
          isInternalNote: false,
          createdAt: now.toISOString(),
        },
        {
          messageId: crypto.randomUUID(),
          senderId: 'SYSTEM',
          senderRole: 'SYSTEM',
          senderName: 'BHOJORA Safety Engine',
          content: `Statutory Notice: ${STATUTORY_ALLEGATION_DISCLAIMER}. Escalated directly to Trust & Safety investigation tier.`,
          isInternalNote: true,
          createdAt: now.toISOString(),
        },
      ],
      caseHistory: [
        {
          eventId: crypto.randomUUID(),
          timestamp: now.toISOString(),
          actorId: 'SYSTEM',
          actorRole: 'SYSTEM',
          actorName: 'BHOJORA Safety Engine',
          action: 'CREATED',
          note: `Automated P1/P2 safety support ticket opened for complaint ${complaint.complaintId}`,
          newStatus: 'OPEN',
          newTier: 'TRUST_SAFETY_ADMIN',
        },
      ],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const saved = await this.supportStore.createTicket(record);
    return this.toTicketDto(saved);
  }

  async createTicket(
    requester: SupportTicketRequesterDto,
    rawInput: unknown,
  ): Promise<SupportTicketDto> {
    const input: CreateSupportTicketRequest = createSupportTicketSchema.parse(rawInput);
    const now = this.clock.now();
    const priority = input.priority ?? CATEGORY_DEFAULT_PRIORITY[input.category];
    const slaMinutes = PRIORITY_SLA_MINUTES[priority];
    const slaTargetUtc = new Date(now.getTime() + slaMinutes * 60 * 1000).toISOString();
    const isSafetyPriority =
      input.category === 'FOOD_SAFETY' ||
      Boolean(input.safetyComplaintId) ||
      priority === 'P1_CRITICAL';
    const escalationTier: SupportEscalationTier =
      input.category === 'FOOD_SAFETY' ? 'TRUST_SAFETY_ADMIN' : 'TIER_1_AGENT';
    const ticketId = `tkt_${crypto.randomUUID().slice(0, 8)}`;

    const record: SupportTicketRecord = {
      ticketId,
      category: input.category,
      priority,
      status: 'OPEN',
      subject: input.subject,
      description: input.description,
      requester,
      orderId: input.orderId,
      outletId: input.outletId,
      safetyComplaintId: input.safetyComplaintId,
      isSafetyPriority,
      slaMinutes,
      slaTargetUtc,
      escalationTier,
      messages: [
        {
          messageId: crypto.randomUUID(),
          senderId: requester.id,
          senderRole: requester.role,
          senderName: requester.name,
          content: input.description,
          isInternalNote: false,
          createdAt: now.toISOString(),
        },
      ],
      caseHistory: [
        {
          eventId: crypto.randomUUID(),
          timestamp: now.toISOString(),
          actorId: requester.id,
          actorRole: requester.role,
          actorName: requester.name,
          action: 'CREATED',
          note: `Support ticket opened with priority ${priority}`,
          newStatus: 'OPEN',
          newTier: escalationTier,
        },
      ],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const saved = await this.supportStore.createTicket(record);
    return this.toTicketDto(saved);
  }

  async listTickets(
    caller: { userId: string; role: string },
    filter?: SupportTicketListFilter,
  ): Promise<SupportTicketDto[]> {
    const isAgent = this.isSupportOrAdmin(caller.role);
    const queryFilter: SupportTicketListFilter = { ...filter };

    if (!isAgent) {
      queryFilter.requesterId = caller.userId;
    } else if (caller.role === 'TRUST_ADMIN' && queryFilter.category === undefined) {
      // Trust admins prioritize or view safety tickets by default if no category specified
      queryFilter.isSafetyPriority = true;
    }

    const records = await this.supportStore.listTickets(queryFilter);
    return records.map((t) => this.toTicketDto(t, { stripInternalNotes: !isAgent }));
  }

  async getTicketById(
    caller: { userId: string; role: string },
    ticketId: string,
  ): Promise<SupportTicketDto> {
    const ticket = await this.supportStore.getTicketById(ticketId);
    if (!ticket) {
      throw new SupportHttpError(404, `Ticket ${ticketId} not found`, 'TICKET_NOT_FOUND');
    }
    const isAgent = this.isSupportOrAdmin(caller.role);
    if (!isAgent && ticket.requester.id !== caller.userId) {
      throw new SupportHttpError(
        403,
        'You do not have permission to view this ticket',
        'FORBIDDEN',
      );
    }
    return this.toTicketDto(ticket, { stripInternalNotes: !isAgent });
  }

  async assignTicket(
    caller: { userId: string; role: string; name?: string },
    ticketId: string,
    rawInput: unknown,
  ): Promise<SupportTicketDto> {
    if (!this.isSupportOrAdmin(caller.role)) {
      throw new SupportHttpError(
        403,
        'Only support agents or administrators can assign tickets',
        'FORBIDDEN',
      );
    }
    const input: AssignSupportTicketRequest = assignSupportTicketSchema.parse(rawInput);
    const ticket = await this.supportStore.getTicketById(ticketId);
    if (!ticket) {
      throw new SupportHttpError(404, `Ticket ${ticketId} not found`, 'TICKET_NOT_FOUND');
    }
    const now = this.clock.now();
    const newStatus = ticket.status === 'OPEN' ? 'ASSIGNED' : ticket.status;

    const event = {
      eventId: crypto.randomUUID(),
      timestamp: now.toISOString(),
      actorId: caller.userId,
      actorRole: caller.role,
      actorName: caller.name || 'Support Operator',
      action: 'ASSIGNED' as const,
      note: `Assigned to ${input.agentName} (${input.agentId})`,
      previousStatus: ticket.status,
      newStatus,
    };

    const updated = await this.supportStore.updateTicket(ticketId, {
      assignedTo: {
        agentId: input.agentId,
        agentName: input.agentName,
        assignedAt: now.toISOString(),
      },
      status: newStatus,
      caseHistory: [...ticket.caseHistory, event],
    });

    if (!updated) {
      throw new SupportHttpError(500, 'Failed to update ticket assignment');
    }
    return this.toTicketDto(updated);
  }

  async escalateTicket(
    caller: { userId: string; role: string; name?: string },
    ticketId: string,
    rawInput: unknown,
  ): Promise<SupportTicketDto> {
    if (!this.isSupportOrAdmin(caller.role)) {
      throw new SupportHttpError(
        403,
        'Only support agents or administrators can escalate tickets',
        'FORBIDDEN',
      );
    }
    const input: EscalateSupportTicketRequest = escalateSupportTicketSchema.parse(rawInput);
    const ticket = await this.supportStore.getTicketById(ticketId);
    if (!ticket) {
      throw new SupportHttpError(404, `Ticket ${ticketId} not found`, 'TICKET_NOT_FOUND');
    }
    const now = this.clock.now();
    const prevTier = ticket.escalationTier;
    const prevStatus = ticket.status;

    const event = {
      eventId: crypto.randomUUID(),
      timestamp: now.toISOString(),
      actorId: caller.userId,
      actorRole: caller.role,
      actorName: caller.name || 'Support Operator',
      action: 'ESCALATED' as const,
      note: `Escalated from ${prevTier} to ${input.targetTier}: ${input.reason}`,
      previousStatus: prevStatus,
      newStatus: 'ESCALATED' as const,
      previousTier: prevTier,
      newTier: input.targetTier,
    };

    const updated = await this.supportStore.updateTicket(ticketId, {
      escalationTier: input.targetTier,
      status: 'ESCALATED',
      caseHistory: [...ticket.caseHistory, event],
    });

    if (!updated) {
      throw new SupportHttpError(500, 'Failed to escalate ticket');
    }
    return this.toTicketDto(updated);
  }

  async addTicketMessage(
    caller: { userId: string; role: string; name?: string },
    ticketId: string,
    rawInput: unknown,
  ): Promise<SupportTicketDto> {
    const input: AddTicketMessageRequest = addTicketMessageSchema.parse(rawInput);
    const ticket = await this.supportStore.getTicketById(ticketId);
    if (!ticket) {
      throw new SupportHttpError(404, `Ticket ${ticketId} not found`, 'TICKET_NOT_FOUND');
    }

    const isAgent = this.isSupportOrAdmin(caller.role);
    if (!isAgent && ticket.requester.id !== caller.userId) {
      throw new SupportHttpError(
        403,
        'You can only message on your own support tickets',
        'FORBIDDEN',
      );
    }

    const now = this.clock.now();
    const isInternal = isAgent && Boolean(input.isInternalNote);
    let messageContent = input.content;

    if (input.templateId) {
      const template = CANNED_RESPONSE_TEMPLATES.find((t) => t.templateId === input.templateId);
      if (template && !messageContent.includes(template.content)) {
        messageContent = `${messageContent ? `${messageContent}\n\n` : ''}${template.content}`;
      }
    }

    const newMessage = {
      messageId: crypto.randomUUID(),
      senderId: caller.userId,
      senderRole: caller.role,
      senderName: caller.name || (isAgent ? 'Support Specialist' : 'Customer'),
      content: messageContent,
      isInternalNote: isInternal,
      createdAt: now.toISOString(),
    };

    const eventAction = isInternal
      ? ('INTERNAL_NOTE_ADDED' as const)
      : input.templateId
        ? ('CANNED_RESPONSE_APPLIED' as const)
        : ('MESSAGE_SENT' as const);

    const event = {
      eventId: crypto.randomUUID(),
      timestamp: now.toISOString(),
      actorId: caller.userId,
      actorRole: caller.role,
      actorName: caller.name || (isAgent ? 'Support Specialist' : 'Customer'),
      action: eventAction,
      note: isInternal
        ? 'Internal staff note added'
        : input.templateId
          ? `Canned template applied: ${input.templateId}`
          : 'Customer-facing message added',
    };

    let newStatus = ticket.status;
    if (!isAgent && ticket.status === 'WAITING_ON_CUSTOMER') {
      newStatus = 'IN_PROGRESS';
    }

    const updated = await this.supportStore.updateTicket(ticketId, {
      status: newStatus,
      messages: [...ticket.messages, newMessage],
      caseHistory: [...ticket.caseHistory, event],
    });

    if (!updated) {
      throw new SupportHttpError(500, 'Failed to add message to ticket');
    }
    return this.toTicketDto(updated, { stripInternalNotes: !isAgent });
  }

  async resolveTicket(
    caller: { userId: string; role: string; name?: string },
    ticketId: string,
    rawInput: unknown,
  ): Promise<SupportTicketDto> {
    const ticket = await this.supportStore.getTicketById(ticketId);
    if (!ticket) {
      throw new SupportHttpError(404, `Ticket ${ticketId} not found`, 'TICKET_NOT_FOUND');
    }

    const isAgent = this.isSupportOrAdmin(caller.role);
    if (!isAgent) {
      throw new SupportHttpError(
        403,
        'Only support agents or administrators can resolve tickets',
        'FORBIDDEN',
      );
    }

    const input: ResolveSupportTicketRequest = resolveSupportTicketSchema.parse(rawInput);
    const now = this.clock.now();

    const resolution = {
      resolvedByUserId: caller.userId,
      resolvedByName: caller.name || 'Support Specialist',
      resolutionNotes: input.resolutionNotes,
      resolvedAt: now.toISOString(),
    };

    const event = {
      eventId: crypto.randomUUID(),
      timestamp: now.toISOString(),
      actorId: caller.userId,
      actorRole: caller.role,
      actorName: caller.name || 'Support Specialist',
      action: 'RESOLVED' as const,
      note: `Ticket resolved: ${input.resolutionNotes}`,
      previousStatus: ticket.status,
      newStatus: 'RESOLVED' as const,
    };

    const updated = await this.supportStore.updateTicket(ticketId, {
      status: 'RESOLVED',
      resolution,
      caseHistory: [...ticket.caseHistory, event],
    });

    if (!updated) {
      throw new SupportHttpError(500, 'Failed to resolve ticket');
    }
    return this.toTicketDto(updated);
  }
}
