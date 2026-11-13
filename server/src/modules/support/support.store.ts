import { Schema, type Connection, type Model } from 'mongoose';
import type {
  FindingStatus,
  OrderItemReviewDto,
  RestaurantComplaintExplanationDto,
  RestaurantReviewResponseDto,
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
  SupportTicketRequesterDto,
  SupportTicketMessageDto,
  SupportTicketCaseHistoryEventDto,
  SupportTicketResolutionDto,
  SupportTicketListFilter,
} from './support.types';

export interface OrderReviewRecord {
  reviewId: string;
  orderId: string;
  outletId: string;
  restaurantId: string;
  customerId: string;
  customerDisplayName: string;
  foodRating: number;
  restaurantRating: number;
  deliveryRating: number | null;
  overallRating: number;
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

export interface FoodSafetyComplaintRecord {
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
  isAllegation: true;
  findingStatus: FindingStatus;
  statutoryDisclaimer: string;
  responseDeadlineUtc?: string;
  restaurantExplanation?: RestaurantComplaintExplanationDto;
  resolutionNotes?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportTicketRecord {
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

export interface SupportStore {
  createReview(record: OrderReviewRecord): Promise<OrderReviewRecord>;
  getReviewById(reviewId: string): Promise<OrderReviewRecord | null>;
  getReviewByOrderId(orderId: string): Promise<OrderReviewRecord | null>;
  listReviewsByOutletId(
    outletId: string,
    options?: { status?: ReviewStatus; limit?: number },
  ): Promise<OrderReviewRecord[]>;
  updateReview(
    reviewId: string,
    updates: Partial<OrderReviewRecord>,
  ): Promise<OrderReviewRecord | null>;

  createComplaint(record: FoodSafetyComplaintRecord): Promise<FoodSafetyComplaintRecord>;
  getComplaintById(complaintId: string): Promise<FoodSafetyComplaintRecord | null>;
  getComplaintByOrderId(orderId: string): Promise<FoodSafetyComplaintRecord | null>;
  listComplaintsByOutletId(outletId: string): Promise<FoodSafetyComplaintRecord[]>;
  listComplaintsByCustomerId(customerId: string): Promise<FoodSafetyComplaintRecord[]>;
  listActiveAllegationsByOutletId(outletId: string): Promise<FoodSafetyComplaintRecord[]>;
  updateComplaint(
    complaintId: string,
    updates: Partial<FoodSafetyComplaintRecord>,
  ): Promise<FoodSafetyComplaintRecord | null>;

  createTicket(record: SupportTicketRecord): Promise<SupportTicketRecord>;
  getTicketById(ticketId: string): Promise<SupportTicketRecord | null>;
  listTickets(filter?: SupportTicketListFilter): Promise<SupportTicketRecord[]>;
  updateTicket(
    ticketId: string,
    updates: Partial<SupportTicketRecord>,
  ): Promise<SupportTicketRecord | null>;
}

export class InMemorySupportStore implements SupportStore {
  private reviews = new Map<string, OrderReviewRecord>();
  private complaints = new Map<string, FoodSafetyComplaintRecord>();
  private tickets = new Map<string, SupportTicketRecord>();

  async createReview(record: OrderReviewRecord): Promise<OrderReviewRecord> {
    this.reviews.set(record.reviewId, { ...record });
    return { ...record };
  }

  async getReviewById(reviewId: string): Promise<OrderReviewRecord | null> {
    const found = this.reviews.get(reviewId);
    return found ? { ...found } : null;
  }

  async getReviewByOrderId(orderId: string): Promise<OrderReviewRecord | null> {
    for (const r of this.reviews.values()) {
      if (r.orderId === orderId) {
        return { ...r };
      }
    }
    return null;
  }

  async listReviewsByOutletId(
    outletId: string,
    options?: { status?: ReviewStatus; limit?: number },
  ): Promise<OrderReviewRecord[]> {
    let list = Array.from(this.reviews.values()).filter((r) => r.outletId === outletId);
    if (options?.status) {
      list = list.filter((r) => r.status === options.status);
    }
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (options?.limit && options.limit > 0) {
      list = list.slice(0, options.limit);
    }
    return list.map((r) => ({ ...r }));
  }

  async updateReview(
    reviewId: string,
    updates: Partial<OrderReviewRecord>,
  ): Promise<OrderReviewRecord | null> {
    const existing = this.reviews.get(reviewId);
    if (!existing) return null;
    const updated: OrderReviewRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.reviews.set(reviewId, updated);
    return { ...updated };
  }

  async createComplaint(record: FoodSafetyComplaintRecord): Promise<FoodSafetyComplaintRecord> {
    this.complaints.set(record.complaintId, { ...record });
    return { ...record };
  }

  async getComplaintById(complaintId: string): Promise<FoodSafetyComplaintRecord | null> {
    const found = this.complaints.get(complaintId);
    return found ? { ...found } : null;
  }

  async getComplaintByOrderId(orderId: string): Promise<FoodSafetyComplaintRecord | null> {
    for (const c of this.complaints.values()) {
      if (c.orderId === orderId) {
        return { ...c };
      }
    }
    return null;
  }

  async listComplaintsByOutletId(outletId: string): Promise<FoodSafetyComplaintRecord[]> {
    const list = Array.from(this.complaints.values())
      .filter((c) => c.outletId === outletId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list.map((c) => ({ ...c }));
  }

  async listComplaintsByCustomerId(customerId: string): Promise<FoodSafetyComplaintRecord[]> {
    const list = Array.from(this.complaints.values())
      .filter((c) => c.customerId === customerId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return list.map((c) => ({ ...c }));
  }

  async listActiveAllegationsByOutletId(outletId: string): Promise<FoodSafetyComplaintRecord[]> {
    const activeStatuses: SafetyComplaintStatus[] = [
      'ALLEGATION_RECORDED',
      'UNDER_INVESTIGATION',
      'EXPLANATION_REQUESTED',
      'EXPLANATION_PROVIDED',
    ];
    return Array.from(this.complaints.values())
      .filter((c) => c.outletId === outletId && activeStatuses.includes(c.status))
      .map((c) => ({ ...c }));
  }

  async updateComplaint(
    complaintId: string,
    updates: Partial<FoodSafetyComplaintRecord>,
  ): Promise<FoodSafetyComplaintRecord | null> {
    const existing = this.complaints.get(complaintId);
    if (!existing) return null;
    const updated: FoodSafetyComplaintRecord = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.complaints.set(complaintId, updated);
    return { ...updated };
  }

  async createTicket(record: SupportTicketRecord): Promise<SupportTicketRecord> {
    this.tickets.set(record.ticketId, {
      ...record,
      messages: [...record.messages],
      caseHistory: [...record.caseHistory],
    });
    return { ...record };
  }

  async getTicketById(ticketId: string): Promise<SupportTicketRecord | null> {
    const found = this.tickets.get(ticketId);
    if (!found) return null;
    return {
      ...found,
      messages: [...found.messages],
      caseHistory: [...found.caseHistory],
    };
  }

  async listTickets(filter?: SupportTicketListFilter): Promise<SupportTicketRecord[]> {
    let list = Array.from(this.tickets.values());
    if (filter?.status) {
      list = list.filter((t) => t.status === filter.status);
    }
    if (filter?.priority) {
      list = list.filter((t) => t.priority === filter.priority);
    }
    if (filter?.category) {
      list = list.filter((t) => t.category === filter.category);
    }
    if (filter?.isSafetyPriority !== undefined) {
      list = list.filter((t) => t.isSafetyPriority === filter.isSafetyPriority);
    }
    if (filter?.assignedToAgentId) {
      list = list.filter((t) => t.assignedTo?.agentId === filter.assignedToAgentId);
    }
    if (filter?.requesterId) {
      list = list.filter((t) => t.requester.id === filter.requesterId);
    }
    if (filter?.outletId) {
      list = list.filter((t) => t.outletId === filter.outletId);
    }

    const priorityWeight: Record<SupportTicketPriority, number> = {
      P1_CRITICAL: 4,
      P2_HIGH: 3,
      P3_MEDIUM: 2,
      P4_LOW: 1,
    };

    return list
      .sort((a, b) => {
        if (a.isSafetyPriority !== b.isSafetyPriority) {
          return a.isSafetyPriority ? -1 : 1;
        }
        const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        if (pDiff !== 0) return pDiff;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .map((t) => ({
        ...t,
        messages: [...t.messages],
        caseHistory: [...t.caseHistory],
      }));
  }

  async updateTicket(
    ticketId: string,
    updates: Partial<SupportTicketRecord>,
  ): Promise<SupportTicketRecord | null> {
    const existing = this.tickets.get(ticketId);
    if (!existing) return null;
    const updated: SupportTicketRecord = {
      ...existing,
      ...updates,
      messages: updates.messages ? [...updates.messages] : [...existing.messages],
      caseHistory: updates.caseHistory ? [...updates.caseHistory] : [...existing.caseHistory],
      updatedAt: new Date().toISOString(),
    };
    this.tickets.set(ticketId, updated);
    return {
      ...updated,
      messages: [...updated.messages],
      caseHistory: [...updated.caseHistory],
    };
  }
}

// Mongoose Schemas & Implementation

const OrderReviewSchema = new Schema<OrderReviewRecord>(
  {
    reviewId: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, required: true, unique: true, index: true },
    outletId: { type: String, required: true, index: true },
    restaurantId: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerDisplayName: { type: String, required: true },
    foodRating: { type: Number, required: true, min: 1, max: 5 },
    restaurantRating: { type: Number, required: true, min: 1, max: 5 },
    deliveryRating: { type: Number, min: 1, max: 5, default: null },
    overallRating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, maxlength: 1000 },
    itemReviews: [
      {
        menuItemId: { type: String, required: true },
        itemTitle: { type: String, required: true },
        rating: { type: Number, required: true },
        comment: { type: String },
      },
    ],
    photos: [
      {
        url: { type: String, required: true },
        caption: { type: String },
        hashSha256: { type: String },
      },
    ],
    status: {
      type: String,
      required: true,
      enum: ['PENDING_MODERATION', 'APPROVED', 'FLAGGED', 'REJECTED'],
      index: true,
    },
    moderationReason: { type: String },
    moderatedAt: { type: String },
    restaurantResponse: {
      responseText: { type: String },
      respondedAt: { type: String },
      respondedByUserId: { type: String },
    },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: 'reviews', timestamps: false },
);

OrderReviewSchema.index({ outletId: 1, status: 1, createdAt: -1 });

const FoodSafetyComplaintSchema = new Schema<FoodSafetyComplaintRecord>(
  {
    complaintId: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, required: true, index: true },
    outletId: { type: String, required: true, index: true },
    customerId: { type: String, required: true, index: true },
    customerDisplayName: { type: String, required: true },
    category: { type: String, required: true, index: true },
    severity: { type: String, required: true, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    incidentTime: { type: String, required: true },
    description: { type: String, required: true, maxlength: 2000 },
    symptoms: [{ type: String }],
    evidencePhotos: [
      {
        url: { type: String, required: true },
        sha256Checksum: { type: String, required: true },
        caption: { type: String },
        uploadedAt: { type: String, required: true },
      },
    ],
    medicalReportAttached: { type: Boolean, default: false },
    status: { type: String, required: true, index: true },
    isAllegation: { type: Boolean, required: true, default: true },
    findingStatus: { type: String, required: true, index: true },
    statutoryDisclaimer: { type: String, required: true },
    responseDeadlineUtc: { type: String },
    restaurantExplanation: {
      explanationText: { type: String },
      correctiveActionTaken: { type: String },
      respondedAt: { type: String },
      respondedByUserId: { type: String },
    },
    resolutionNotes: { type: String },
    resolvedAt: { type: String },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: 'complaints', timestamps: false },
);

FoodSafetyComplaintSchema.index({ outletId: 1, status: 1, createdAt: -1 });

const SupportTicketSchema = new Schema<SupportTicketRecord>(
  {
    ticketId: { type: String, required: true, unique: true, index: true },
    category: { type: String, required: true, index: true },
    priority: { type: String, required: true, index: true },
    status: { type: String, required: true, index: true },
    subject: { type: String, required: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 2000 },
    requester: {
      id: { type: String, required: true, index: true },
      role: { type: String, required: true },
      name: { type: String, required: true },
      phoneMasked: { type: String },
      emailMasked: { type: String },
    },
    orderId: { type: String, index: true },
    outletId: { type: String, index: true },
    safetyComplaintId: { type: String, index: true },
    isSafetyPriority: { type: Boolean, required: true, default: false, index: true },
    slaMinutes: { type: Number, required: true },
    slaTargetUtc: { type: String, required: true, index: true },
    assignedTo: {
      agentId: { type: String },
      agentName: { type: String },
      assignedAt: { type: String },
    },
    escalationTier: { type: String, required: true, index: true },
    messages: [
      {
        messageId: { type: String, required: true },
        senderId: { type: String, required: true },
        senderRole: { type: String, required: true },
        senderName: { type: String, required: true },
        content: { type: String, required: true },
        isInternalNote: { type: Boolean, default: false },
        createdAt: { type: String, required: true },
      },
    ],
    caseHistory: [
      {
        eventId: { type: String, required: true },
        timestamp: { type: String, required: true },
        actorId: { type: String, required: true },
        actorRole: { type: String, required: true },
        actorName: { type: String, required: true },
        action: { type: String, required: true },
        note: { type: String },
        previousStatus: { type: String },
        newStatus: { type: String },
        previousTier: { type: String },
        newTier: { type: String },
      },
    ],
    resolution: {
      resolvedByUserId: { type: String },
      resolvedByName: { type: String },
      resolutionNotes: { type: String },
      resolvedAt: { type: String },
    },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: 'support_tickets', timestamps: false },
);

SupportTicketSchema.index({ status: 1, priority: 1, createdAt: -1 });
SupportTicketSchema.index({ isSafetyPriority: 1, createdAt: -1 });
SupportTicketSchema.index({ 'requester.id': 1, createdAt: -1 });
SupportTicketSchema.index({ outletId: 1, createdAt: -1 });

export class MongooseSupportStore implements SupportStore {
  private reviewModel: Model<OrderReviewRecord>;
  private complaintModel: Model<FoodSafetyComplaintRecord>;
  private ticketModel: Model<SupportTicketRecord>;

  constructor(connection: Connection) {
    this.reviewModel =
      (connection.models['OrderReview'] as Model<OrderReviewRecord> | undefined) ??
      connection.model<OrderReviewRecord>('OrderReview', OrderReviewSchema);
    this.complaintModel =
      (connection.models['FoodSafetyComplaint'] as Model<FoodSafetyComplaintRecord> | undefined) ??
      connection.model<FoodSafetyComplaintRecord>('FoodSafetyComplaint', FoodSafetyComplaintSchema);
    this.ticketModel =
      (connection.models['SupportTicket'] as Model<SupportTicketRecord> | undefined) ??
      connection.model<SupportTicketRecord>('SupportTicket', SupportTicketSchema);
  }

  async createReview(record: OrderReviewRecord): Promise<OrderReviewRecord> {
    const doc = await this.reviewModel.create(record);
    return doc.toObject<OrderReviewRecord>();
  }

  async getReviewById(reviewId: string): Promise<OrderReviewRecord | null> {
    const doc = await this.reviewModel.findOne({ reviewId }).lean<OrderReviewRecord>().exec();
    return doc ?? null;
  }

  async getReviewByOrderId(orderId: string): Promise<OrderReviewRecord | null> {
    const doc = await this.reviewModel.findOne({ orderId }).lean<OrderReviewRecord>().exec();
    return doc ?? null;
  }

  async listReviewsByOutletId(
    outletId: string,
    options?: { status?: ReviewStatus; limit?: number },
  ): Promise<OrderReviewRecord[]> {
    const query: Record<string, unknown> = { outletId };
    if (options?.status) {
      query['status'] = options.status;
    }
    const q = this.reviewModel.find(query).sort({ createdAt: -1 });
    if (options?.limit && options.limit > 0) {
      q.limit(options.limit);
    }
    const docs = await q.lean<OrderReviewRecord[]>().exec();
    return docs;
  }

  async updateReview(
    reviewId: string,
    updates: Partial<OrderReviewRecord>,
  ): Promise<OrderReviewRecord | null> {
    const doc = await this.reviewModel
      .findOneAndUpdate(
        { reviewId },
        { ...updates, updatedAt: new Date().toISOString() },
        { new: true },
      )
      .lean<OrderReviewRecord>()
      .exec();
    return doc ?? null;
  }

  async createComplaint(record: FoodSafetyComplaintRecord): Promise<FoodSafetyComplaintRecord> {
    const doc = await this.complaintModel.create(record);
    return doc.toObject<FoodSafetyComplaintRecord>();
  }

  async getComplaintById(complaintId: string): Promise<FoodSafetyComplaintRecord | null> {
    const doc = await this.complaintModel
      .findOne({ complaintId })
      .lean<FoodSafetyComplaintRecord>()
      .exec();
    return doc ?? null;
  }

  async getComplaintByOrderId(orderId: string): Promise<FoodSafetyComplaintRecord | null> {
    const doc = await this.complaintModel
      .findOne({ orderId })
      .lean<FoodSafetyComplaintRecord>()
      .exec();
    return doc ?? null;
  }

  async listComplaintsByOutletId(outletId: string): Promise<FoodSafetyComplaintRecord[]> {
    const docs = await this.complaintModel
      .find({ outletId })
      .sort({ createdAt: -1 })
      .lean<FoodSafetyComplaintRecord[]>()
      .exec();
    return docs;
  }

  async listComplaintsByCustomerId(customerId: string): Promise<FoodSafetyComplaintRecord[]> {
    const docs = await this.complaintModel
      .find({ customerId })
      .sort({ createdAt: -1 })
      .lean<FoodSafetyComplaintRecord[]>()
      .exec();
    return docs;
  }

  async listActiveAllegationsByOutletId(outletId: string): Promise<FoodSafetyComplaintRecord[]> {
    const activeStatuses: SafetyComplaintStatus[] = [
      'ALLEGATION_RECORDED',
      'UNDER_INVESTIGATION',
      'EXPLANATION_REQUESTED',
      'EXPLANATION_PROVIDED',
    ];
    const docs = await this.complaintModel
      .find({ outletId, status: { $in: activeStatuses } })
      .lean<FoodSafetyComplaintRecord[]>()
      .exec();
    return docs;
  }

  async updateComplaint(
    complaintId: string,
    updates: Partial<FoodSafetyComplaintRecord>,
  ): Promise<FoodSafetyComplaintRecord | null> {
    const doc = await this.complaintModel
      .findOneAndUpdate(
        { complaintId },
        { ...updates, updatedAt: new Date().toISOString() },
        { new: true },
      )
      .lean<FoodSafetyComplaintRecord>()
      .exec();
    return doc ?? null;
  }

  async createTicket(record: SupportTicketRecord): Promise<SupportTicketRecord> {
    const doc = await this.ticketModel.create(record);
    return doc.toObject<SupportTicketRecord>();
  }

  async getTicketById(ticketId: string): Promise<SupportTicketRecord | null> {
    const doc = await this.ticketModel.findOne({ ticketId }).lean<SupportTicketRecord>().exec();
    return doc ?? null;
  }

  async listTickets(filter?: SupportTicketListFilter): Promise<SupportTicketRecord[]> {
    const query: Record<string, unknown> = {};
    if (filter?.status) query['status'] = filter.status;
    if (filter?.priority) query['priority'] = filter.priority;
    if (filter?.category) query['category'] = filter.category;
    if (filter?.isSafetyPriority !== undefined) query['isSafetyPriority'] = filter.isSafetyPriority;
    if (filter?.assignedToAgentId) query['assignedTo.agentId'] = filter.assignedToAgentId;
    if (filter?.requesterId) query['requester.id'] = filter.requesterId;
    if (filter?.outletId) query['outletId'] = filter.outletId;

    const docs = await this.ticketModel
      .find(query)
      .sort({ isSafetyPriority: -1, createdAt: -1 })
      .lean<SupportTicketRecord[]>()
      .exec();
    return docs;
  }

  async updateTicket(
    ticketId: string,
    updates: Partial<SupportTicketRecord>,
  ): Promise<SupportTicketRecord | null> {
    const doc = await this.ticketModel
      .findOneAndUpdate(
        { ticketId },
        { ...updates, updatedAt: new Date().toISOString() },
        { new: true },
      )
      .lean<SupportTicketRecord>()
      .exec();
    return doc ?? null;
  }
}
