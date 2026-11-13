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
}

export class InMemorySupportStore implements SupportStore {
  private reviews = new Map<string, OrderReviewRecord>();
  private complaints = new Map<string, FoodSafetyComplaintRecord>();

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

export class MongooseSupportStore implements SupportStore {
  private reviewModel: Model<OrderReviewRecord>;
  private complaintModel: Model<FoodSafetyComplaintRecord>;

  constructor(connection: Connection) {
    this.reviewModel =
      (connection.models['OrderReview'] as Model<OrderReviewRecord> | undefined) ??
      connection.model<OrderReviewRecord>('OrderReview', OrderReviewSchema);
    this.complaintModel =
      (connection.models['FoodSafetyComplaint'] as Model<FoodSafetyComplaintRecord> | undefined) ??
      connection.model<FoodSafetyComplaintRecord>('FoodSafetyComplaint', FoodSafetyComplaintSchema);
  }

  async createReview(record: OrderReviewRecord): Promise<OrderReviewRecord> {
    const doc = await this.reviewModel.create(record);
    return doc.toObject<OrderReviewRecord>();
  }

  async getReviewById(reviewId: string): Promise<OrderReviewRecord | null> {
    const doc = await this.reviewModel.findOne({ reviewId }).lean<OrderReviewRecord>();
    return doc ?? null;
  }

  async getReviewByOrderId(orderId: string): Promise<OrderReviewRecord | null> {
    const doc = await this.reviewModel.findOne({ orderId }).lean<OrderReviewRecord>();
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
    const docs = await q.lean<OrderReviewRecord[]>();
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
      .lean<OrderReviewRecord>();
    return doc ?? null;
  }

  async createComplaint(record: FoodSafetyComplaintRecord): Promise<FoodSafetyComplaintRecord> {
    const doc = await this.complaintModel.create(record);
    return doc.toObject<FoodSafetyComplaintRecord>();
  }

  async getComplaintById(complaintId: string): Promise<FoodSafetyComplaintRecord | null> {
    const doc = await this.complaintModel
      .findOne({ complaintId })
      .lean<FoodSafetyComplaintRecord>();
    return doc ?? null;
  }

  async getComplaintByOrderId(orderId: string): Promise<FoodSafetyComplaintRecord | null> {
    const doc = await this.complaintModel.findOne({ orderId }).lean<FoodSafetyComplaintRecord>();
    return doc ?? null;
  }

  async listComplaintsByOutletId(outletId: string): Promise<FoodSafetyComplaintRecord[]> {
    const docs = await this.complaintModel
      .find({ outletId })
      .sort({ createdAt: -1 })
      .lean<FoodSafetyComplaintRecord[]>();
    return docs;
  }

  async listComplaintsByCustomerId(customerId: string): Promise<FoodSafetyComplaintRecord[]> {
    const docs = await this.complaintModel
      .find({ customerId })
      .sort({ createdAt: -1 })
      .lean<FoodSafetyComplaintRecord[]>();
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
      .lean<FoodSafetyComplaintRecord[]>();
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
      .lean<FoodSafetyComplaintRecord>();
    return doc ?? null;
  }
}
