import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import {
  applyBaseSchemaConventions,
  COLLECTION_NAMES,
  createGeoPointSubSchema,
} from '../../database/conventions';
import { AppError } from '../../middleware/error-handler';
import { KOLKATA_ZONE_IDS, type KolkataZoneId } from '../customer/customer.types';
import { USER_ROLES, type UserRole } from '../identity/identity.types';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_ACCESS_CLASSIFICATIONS,
  DOCUMENT_VERIFICATION_STATUSES,
  FSSAI_VERIFICATION_STATUSES,
  MAX_DOCUMENT_SIZE_BYTES,
  ONBOARDING_APPLICATION_STATUSES,
  ONBOARDING_REVIEW_DECISIONS,
  OPERATING_DAY_CODES,
  OUTLET_OPERATIONAL_STATUSES,
  PLATFORM_INSPECTION_STATUSES,
  RESTAURANT_DOCUMENT_TYPES,
  type AllowedDocumentMimeType,
  type DocumentVerificationStatus,
  type FssaiVerificationStatus,
  type OnboardingApplicationStatus,
  type OnboardingReviewDecision,
  type OnboardingReviewEntryRecord,
  type OperatingDayCode,
  type OperatingSlotRecord,
  type OutletOperationalStatus,
  type PlatformInspectionStatus,
  type RestaurantApplicationRecord,
  type RestaurantDocumentRecord,
  type RestaurantDocumentType,
  type RestaurantOutletRecord,
  type RestaurantStore,
} from './restaurant.types';

const operatingSlotSubSchema = new Schema(
  {
    dayOfWeek: { type: String, enum: OPERATING_DAY_CODES, required: true },
    openTime: { type: String, required: true, maxlength: 5 },
    closeTime: { type: String, required: true, maxlength: 5 },
    isClosed: { type: Boolean, required: true, default: false },
  },
  { _id: false },
);

const legalEntitySubSchema = new Schema(
  {
    legalBusinessName: { type: String, required: true, trim: true, maxlength: 140 },
    ownerFullName: { type: String, required: true, trim: true, maxlength: 120 },
    ownerPhoneMasked: { type: String, required: true, trim: true, maxlength: 30 },
    ownerBusinessEmail: { type: String, required: true, trim: true, maxlength: 140 },
    panMasked: { type: String, required: true, trim: true, maxlength: 16 },
    panHash: { type: String, required: true, trim: true, maxlength: 64 },
    gstin: { type: String, required: false, default: null, maxlength: 15 },
    fssaiLicenseNumber: { type: String, required: true, trim: true, maxlength: 14 },
    fssaiExpiresOn: { type: String, required: true, trim: true, maxlength: 10 },
    fssaiVerificationStatus: {
      type: String,
      enum: FSSAI_VERIFICATION_STATUSES,
      required: true,
      default: 'NOT_SUBMITTED',
    },
    fssaiVerifiedNote: { type: String, required: false, default: null, maxlength: 240 },
    fssaiVerifiedAt: { type: Date, required: false, default: null },
  },
  { _id: false },
);

const outletSetupSubSchema = new Schema(
  {
    brandName: { type: String, required: true, trim: true, maxlength: 120 },
    outletName: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, maxlength: 140 },
    streetAddress: { type: String, required: true, trim: true, maxlength: 240 },
    landmark: { type: String, required: true, trim: true, maxlength: 140 },
    locality: { type: String, required: true, trim: true, maxlength: 80 },
    wardOrBorough: { type: String, required: true, trim: true, maxlength: 80 },
    city: { type: String, required: true, trim: true, default: 'Kolkata', maxlength: 60 },
    postalCode: { type: String, required: true, trim: true, maxlength: 10 },
    zoneId: { type: String, enum: KOLKATA_ZONE_IDS, required: true },
    location: { type: createGeoPointSubSchema(), required: true },
    cuisines: { type: [String], required: true },
    prepTimeMinutes: { type: Number, required: true, min: 10, max: 90 },
    deliveryRadiusMeters: { type: Number, required: true, min: 500, max: 15000, default: 5000 },
    operatingSlots: { type: [operatingSlotSubSchema], required: true },
  },
  { _id: false },
);

const bankPayoutSubSchema = new Schema(
  {
    accountHolderName: { type: String, required: true, trim: true, maxlength: 120 },
    bankAccountMasked: { type: String, required: true, trim: true, maxlength: 24 },
    bankAccountHash: { type: String, required: true, trim: true, maxlength: 64 },
    ifscCode: { type: String, required: true, trim: true, maxlength: 11 },
    payoutMode: { type: String, enum: ['NEFT_IMPS'], required: true, default: 'NEFT_IMPS' },
  },
  { _id: false },
);

const reviewHistorySubSchema = new Schema(
  {
    reviewId: { type: String, required: true },
    reviewerUserId: { type: String, required: true },
    reviewerRole: { type: String, enum: USER_ROLES, required: true },
    decision: { type: String, enum: ONBOARDING_REVIEW_DECISIONS, required: true },
    fssaiDecision: { type: String, enum: FSSAI_VERIFICATION_STATUSES, required: true },
    reason: { type: String, required: true, maxlength: 240 },
    reviewedAt: { type: Date, required: true },
  },
  { _id: false },
);

const restaurantSchema = applyBaseSchemaConventions(
  new Schema({
    applicationId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    outletId: { type: String, required: true },
    ownerUserId: { type: String, required: true },
    onboardingStatus: {
      type: String,
      enum: ONBOARDING_APPLICATION_STATUSES,
      required: true,
      default: 'DRAFT',
    },
    fssaiVerificationStatus: {
      type: String,
      enum: FSSAI_VERIFICATION_STATUSES,
      required: true,
      default: 'NOT_SUBMITTED',
    },
    platformInspectionStatus: {
      type: String,
      enum: PLATFORM_INSPECTION_STATUSES,
      required: true,
      default: 'NOT_INSPECTED',
    },
    publishedSafetyScore: { type: Number, required: false, default: null },
    legalEntity: { type: legalEntitySubSchema, required: true },
    outletSetup: { type: outletSetupSubSchema, required: true },
    bankPayout: { type: bankPayoutSubSchema, required: true },
    reviewHistory: { type: [reviewHistorySubSchema], required: true, default: [] },
    submittedAt: { type: Date, required: false, default: null },
    decidedAt: { type: Date, required: false, default: null },
  }),
);

const restaurantOutletSchema = applyBaseSchemaConventions(
  new Schema({
    outletId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    ownerUserId: { type: String, required: true },
    brandName: { type: String, required: true, trim: true, maxlength: 120 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, trim: true, maxlength: 140 },
    zoneId: { type: String, enum: KOLKATA_ZONE_IDS, required: true },
    wardOrBorough: { type: String, required: true, trim: true, maxlength: 80 },
    streetAddress: { type: String, required: true, trim: true, maxlength: 240 },
    landmark: { type: String, required: true, trim: true, maxlength: 140 },
    locality: { type: String, required: true, trim: true, maxlength: 80 },
    city: { type: String, required: true, trim: true, default: 'Kolkata', maxlength: 60 },
    postalCode: { type: String, required: true, trim: true, maxlength: 10 },
    location: { type: createGeoPointSubSchema(), required: true },
    cuisines: { type: [String], required: true },
    prepTimeMinutes: { type: Number, required: true, min: 10, max: 90 },
    deliveryRadiusMeters: { type: Number, required: true, min: 500, max: 15000, default: 5000 },
    operatingSlots: { type: [operatingSlotSubSchema], required: true },
    status: {
      type: String,
      enum: OUTLET_OPERATIONAL_STATUSES,
      required: true,
      default: 'ACTIVE',
    },
    fssaiLicenseNumber: { type: String, required: true, maxlength: 14 },
    fssaiExpiresOn: { type: String, required: true, maxlength: 10 },
    fssaiVerificationStatus: {
      type: String,
      enum: FSSAI_VERIFICATION_STATUSES,
      required: true,
    },
    platformInspectionStatus: {
      type: String,
      enum: PLATFORM_INSPECTION_STATUSES,
      required: true,
      default: 'NOT_INSPECTED',
    },
    publishedSafetyScore: { type: Number, required: false, default: null },
  }),
);

const restaurantDocumentSchema = applyBaseSchemaConventions(
  new Schema({
    documentId: { type: String, required: true },
    applicationId: { type: String, required: true },
    restaurantId: { type: String, required: true },
    ownerUserId: { type: String, required: true },
    documentType: { type: String, enum: RESTAURANT_DOCUMENT_TYPES, required: true },
    fileName: { type: String, required: true, trim: true, maxlength: 180 },
    mimeType: { type: String, enum: ALLOWED_DOCUMENT_MIME_TYPES, required: true },
    sizeBytes: { type: Number, required: true, min: 1, max: MAX_DOCUMENT_SIZE_BYTES },
    sha256Checksum: { type: String, required: true, minlength: 64, maxlength: 64 },
    storageKey: { type: String, required: true, trim: true, maxlength: 320 },
    accessClassification: {
      type: String,
      enum: DOCUMENT_ACCESS_CLASSIFICATIONS,
      required: true,
      default: 'PRIVATE_COMPLIANCE',
    },
    isPublic: {
      type: Boolean,
      required: true,
      default: false,
      validate: {
        validator: (value: unknown) => value === false,
        message: 'Restaurant compliance documents must remain private (isPublic: false)',
      },
    },
    verificationStatus: {
      type: String,
      enum: DOCUMENT_VERIFICATION_STATUSES,
      required: true,
      default: 'PENDING_REVIEW',
    },
    reviewNote: { type: String, required: false, default: null, maxlength: 240 },
    uploadedAt: { type: Date, required: true },
    reviewedAt: { type: Date, required: false, default: null },
  }),
);

export interface MongooseRestaurantModels {
  Restaurant: Model<Record<string, unknown>>;
  RestaurantOutlet: Model<Record<string, unknown>>;
  RestaurantDocument: Model<Record<string, unknown>>;
}

export function createMongooseRestaurantModels(connection: Connection): MongooseRestaurantModels {
  const resolveModel = (
    name: string,
    schema: Schema<Record<string, unknown>>,
    collectionName: string,
  ): Model<Record<string, unknown>> => {
    const existing = connection.models[name] as Model<Record<string, unknown>> | undefined;
    return existing ?? connection.model<Record<string, unknown>>(name, schema, collectionName);
  };

  return {
    Restaurant: resolveModel('BhojoraRestaurant', restaurantSchema, COLLECTION_NAMES.restaurants),
    RestaurantOutlet: resolveModel(
      'BhojoraRestaurantOutlet',
      restaurantOutletSchema,
      COLLECTION_NAMES.restaurantOutlets,
    ),
    RestaurantDocument: resolveModel(
      'BhojoraRestaurantDocument',
      restaurantDocumentSchema,
      COLLECTION_NAMES.restaurantDocuments,
    ),
  };
}

function toDate(value: unknown, fallback: Date): Date {
  return value instanceof Date ? value : fallback;
}

function toNullableDate(value: unknown): Date | null {
  return value instanceof Date ? value : null;
}

function toSlots(raw: unknown): OperatingSlotRecord[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((slot) => {
    const item = slot as Record<string, unknown>;
    return {
      dayOfWeek: item['dayOfWeek'] as OperatingDayCode,
      openTime: String(item['openTime'] ?? '11:00'),
      closeTime: String(item['closeTime'] ?? '23:00'),
      isClosed: Boolean(item['isClosed']),
    };
  });
}

function toPoint(raw: unknown): { type: 'Point'; coordinates: [number, number] } {
  const point = (raw ?? {}) as { coordinates?: unknown[] };
  const coords = Array.isArray(point.coordinates) ? point.coordinates : [88.4317, 22.5806];
  return {
    type: 'Point',
    coordinates: [Number(coords[0] ?? 88.4317), Number(coords[1] ?? 22.5806)],
  };
}

function toApplicationRecord(doc: Record<string, unknown>): RestaurantApplicationRecord {
  const now = new Date();
  const legal = (doc['legalEntity'] ?? {}) as Record<string, unknown>;
  const outlet = (doc['outletSetup'] ?? {}) as Record<string, unknown>;
  const bank = (doc['bankPayout'] ?? {}) as Record<string, unknown>;
  const historyRaw = Array.isArray(doc['reviewHistory']) ? doc['reviewHistory'] : [];

  return {
    applicationId: String(doc['applicationId']),
    restaurantId: String(doc['restaurantId']),
    outletId: String(doc['outletId']),
    ownerUserId: String(doc['ownerUserId']),
    onboardingStatus: doc['onboardingStatus'] as OnboardingApplicationStatus,
    fssaiVerificationStatus: doc['fssaiVerificationStatus'] as FssaiVerificationStatus,
    platformInspectionStatus: doc['platformInspectionStatus'] as PlatformInspectionStatus,
    publishedSafetyScore:
      typeof doc['publishedSafetyScore'] === 'number' ? doc['publishedSafetyScore'] : null,
    legalEntity: {
      legalBusinessName: String(legal['legalBusinessName'] ?? ''),
      ownerFullName: String(legal['ownerFullName'] ?? ''),
      ownerPhoneMasked: String(legal['ownerPhoneMasked'] ?? ''),
      ownerBusinessEmail: String(legal['ownerBusinessEmail'] ?? ''),
      panMasked: String(legal['panMasked'] ?? ''),
      panHash: String(legal['panHash'] ?? ''),
      gstin: typeof legal['gstin'] === 'string' ? legal['gstin'] : null,
      fssaiLicenseNumber: String(legal['fssaiLicenseNumber'] ?? ''),
      fssaiExpiresOn: String(legal['fssaiExpiresOn'] ?? ''),
      fssaiVerificationStatus: legal['fssaiVerificationStatus'] as FssaiVerificationStatus,
      fssaiVerifiedNote:
        typeof legal['fssaiVerifiedNote'] === 'string' ? legal['fssaiVerifiedNote'] : null,
      fssaiVerifiedAt: toNullableDate(legal['fssaiVerifiedAt']),
    },
    outletSetup: {
      brandName: String(outlet['brandName'] ?? ''),
      outletName: String(outlet['outletName'] ?? ''),
      slug: String(outlet['slug'] ?? ''),
      streetAddress: String(outlet['streetAddress'] ?? ''),
      landmark: String(outlet['landmark'] ?? ''),
      locality: String(outlet['locality'] ?? ''),
      wardOrBorough: String(outlet['wardOrBorough'] ?? ''),
      city: String(outlet['city'] ?? 'Kolkata'),
      postalCode: String(outlet['postalCode'] ?? ''),
      zoneId: outlet['zoneId'] as KolkataZoneId,
      location: toPoint(outlet['location']),
      cuisines: Array.isArray(outlet['cuisines']) ? outlet['cuisines'].map(String) : [],
      prepTimeMinutes: Number(outlet['prepTimeMinutes'] ?? 30),
      operatingSlots: toSlots(outlet['operatingSlots']),
    },
    bankPayout: {
      accountHolderName: String(bank['accountHolderName'] ?? ''),
      bankAccountMasked: String(bank['bankAccountMasked'] ?? ''),
      bankAccountHash: String(bank['bankAccountHash'] ?? ''),
      ifscCode: String(bank['ifscCode'] ?? ''),
      payoutMode: 'NEFT_IMPS',
    },
    reviewHistory: historyRaw.map((entry): OnboardingReviewEntryRecord => {
      const item = entry as Record<string, unknown>;
      return {
        reviewId: String(item['reviewId']),
        reviewerUserId: String(item['reviewerUserId']),
        reviewerRole: item['reviewerRole'] as UserRole,
        decision: item['decision'] as OnboardingReviewDecision,
        fssaiDecision: item['fssaiDecision'] as FssaiVerificationStatus,
        reason: String(item['reason']),
        reviewedAt: toDate(item['reviewedAt'], now),
      };
    }),
    submittedAt: toNullableDate(doc['submittedAt']),
    decidedAt: toNullableDate(doc['decidedAt']),
    createdAt: toDate(doc['createdAt'], now),
    updatedAt: toDate(doc['updatedAt'], now),
  };
}

function toOutletRecord(doc: Record<string, unknown>): RestaurantOutletRecord {
  const now = new Date();
  return {
    outletId: String(doc['outletId']),
    restaurantId: String(doc['restaurantId']),
    ownerUserId: String(doc['ownerUserId']),
    brandName: String(doc['brandName']),
    name: String(doc['name']),
    slug: String(doc['slug']),
    zoneId: doc['zoneId'] as KolkataZoneId,
    wardOrBorough: String(doc['wardOrBorough']),
    streetAddress: String(doc['streetAddress']),
    landmark: String(doc['landmark']),
    locality: String(doc['locality']),
    city: String(doc['city']),
    postalCode: String(doc['postalCode']),
    location: toPoint(doc['location']),
    cuisines: Array.isArray(doc['cuisines']) ? doc['cuisines'].map(String) : [],
    prepTimeMinutes: Number(doc['prepTimeMinutes'] ?? 30),
    deliveryRadiusMeters: Number(doc['deliveryRadiusMeters'] ?? 5000),
    operatingSlots: toSlots(doc['operatingSlots']),
    status: doc['status'] as OutletOperationalStatus,
    fssaiLicenseNumber: String(doc['fssaiLicenseNumber']),
    fssaiExpiresOn: String(doc['fssaiExpiresOn']),
    fssaiVerificationStatus: doc['fssaiVerificationStatus'] as FssaiVerificationStatus,
    platformInspectionStatus: doc['platformInspectionStatus'] as PlatformInspectionStatus,
    publishedSafetyScore:
      typeof doc['publishedSafetyScore'] === 'number' ? doc['publishedSafetyScore'] : null,
    createdAt: toDate(doc['createdAt'], now),
    updatedAt: toDate(doc['updatedAt'], now),
  };
}

function toDocumentRecord(doc: Record<string, unknown>): RestaurantDocumentRecord {
  const now = new Date();
  return {
    documentId: String(doc['documentId']),
    applicationId: String(doc['applicationId']),
    restaurantId: String(doc['restaurantId']),
    ownerUserId: String(doc['ownerUserId']),
    documentType: doc['documentType'] as RestaurantDocumentType,
    fileName: String(doc['fileName']),
    mimeType: doc['mimeType'] as AllowedDocumentMimeType,
    sizeBytes: Number(doc['sizeBytes']),
    sha256Checksum: String(doc['sha256Checksum']),
    storageKey: String(doc['storageKey']),
    accessClassification: 'PRIVATE_COMPLIANCE',
    isPublic: false,
    verificationStatus: doc['verificationStatus'] as DocumentVerificationStatus,
    reviewNote: typeof doc['reviewNote'] === 'string' ? doc['reviewNote'] : null,
    uploadedAt: toDate(doc['uploadedAt'], now),
    reviewedAt: toNullableDate(doc['reviewedAt']),
  };
}

export class MongooseRestaurantStore implements RestaurantStore {
  private readonly models: MongooseRestaurantModels;

  constructor(connection: Connection) {
    this.models = createMongooseRestaurantModels(connection);
  }

  getModels(): MongooseRestaurantModels {
    return this.models;
  }

  async createApplication(
    record: RestaurantApplicationRecord,
  ): Promise<RestaurantApplicationRecord> {
    const created = await this.models.Restaurant.create(
      record as unknown as Record<string, unknown>,
    );
    return toApplicationRecord(created.toObject() as Record<string, unknown>);
  }

  async getApplicationById(idOrApplicationId: string): Promise<RestaurantApplicationRecord | null> {
    const doc = await this.models.Restaurant.findOne({
      $or: [{ applicationId: idOrApplicationId }, { restaurantId: idOrApplicationId }],
    });
    return doc ? toApplicationRecord(doc.toObject() as Record<string, unknown>) : null;
  }

  async updateApplication(
    restaurantId: string,
    record: RestaurantApplicationRecord,
  ): Promise<RestaurantApplicationRecord | null> {
    const updated = await this.models.Restaurant.findOneAndUpdate(
      { restaurantId },
      { $set: record },
      { new: true, runValidators: true },
    );
    return updated ? toApplicationRecord(updated.toObject() as Record<string, unknown>) : null;
  }

  async listApplicationsByOwner(ownerUserId: string): Promise<RestaurantApplicationRecord[]> {
    const docs = await this.models.Restaurant.find({ ownerUserId }).sort({ updatedAt: -1 });
    return docs.map((doc) => toApplicationRecord(doc.toObject() as Record<string, unknown>));
  }

  async listReviewQueue(
    status?: OnboardingApplicationStatus,
  ): Promise<RestaurantApplicationRecord[]> {
    const filter = status ? { onboardingStatus: status } : { onboardingStatus: { $ne: 'DRAFT' } };
    const docs = await this.models.Restaurant.find(filter).sort({ submittedAt: 1, updatedAt: -1 });
    return docs.map((doc) => toApplicationRecord(doc.toObject() as Record<string, unknown>));
  }

  async upsertOutlet(outlet: RestaurantOutletRecord): Promise<RestaurantOutletRecord> {
    const doc = await this.models.RestaurantOutlet.findOneAndUpdate(
      { outletId: outlet.outletId },
      { $set: outlet },
      { upsert: true, new: true, runValidators: true },
    );
    if (!doc) {
      throw new Error('Failed to upsert restaurant outlet');
    }
    return toOutletRecord(doc.toObject() as Record<string, unknown>);
  }

  async getOutletById(outletId: string): Promise<RestaurantOutletRecord | null> {
    const doc = await this.models.RestaurantOutlet.findOne({ outletId });
    return doc ? toOutletRecord(doc.toObject() as Record<string, unknown>) : null;
  }

  async listPublicOutlets(zoneId?: KolkataZoneId): Promise<RestaurantOutletRecord[]> {
    const filter: Record<string, unknown> = { status: 'ACTIVE' };
    if (zoneId) {
      filter['zoneId'] = zoneId;
    }
    const docs = await this.models.RestaurantOutlet.find(filter).sort({ createdAt: -1 });
    return docs.map((doc) => toOutletRecord(doc.toObject() as Record<string, unknown>));
  }

  async createDocument(doc: RestaurantDocumentRecord): Promise<RestaurantDocumentRecord> {
    const created = await this.models.RestaurantDocument.create(
      doc as unknown as Record<string, unknown>,
    );
    return toDocumentRecord(created.toObject() as Record<string, unknown>);
  }

  async getDocumentById(documentId: string): Promise<RestaurantDocumentRecord | null> {
    const doc = await this.models.RestaurantDocument.findOne({ documentId });
    return doc ? toDocumentRecord(doc.toObject() as Record<string, unknown>) : null;
  }

  async listDocumentsByRestaurant(restaurantId: string): Promise<RestaurantDocumentRecord[]> {
    const docs = await this.models.RestaurantDocument.find({ restaurantId }).sort({
      uploadedAt: -1,
    });
    return docs.map((doc) => toDocumentRecord(doc.toObject() as Record<string, unknown>));
  }

  async updateDocumentReview(
    documentId: string,
    verificationStatus: DocumentVerificationStatus,
    reviewNote: string | null,
    reviewedAt: Date,
  ): Promise<RestaurantDocumentRecord | null> {
    const updated = await this.models.RestaurantDocument.findOneAndUpdate(
      { documentId },
      { $set: { verificationStatus, reviewNote, reviewedAt } },
      { new: true, runValidators: true },
    );
    return updated ? toDocumentRecord(updated.toObject() as Record<string, unknown>) : null;
  }
}

export class InMemoryRestaurantStore implements RestaurantStore {
  private readonly applications = new Map<string, RestaurantApplicationRecord>();
  private readonly outlets = new Map<string, RestaurantOutletRecord>();
  private readonly documents = new Map<string, RestaurantDocumentRecord>();

  async createApplication(
    record: RestaurantApplicationRecord,
  ): Promise<RestaurantApplicationRecord> {
    if (this.applications.has(record.restaurantId)) {
      throw new AppError(409, 'CONFLICT', `Duplicate restaurantId: ${record.restaurantId}`);
    }
    const copy = structuredClone(record);
    this.applications.set(copy.restaurantId, copy);
    return structuredClone(copy);
  }

  async getApplicationById(idOrApplicationId: string): Promise<RestaurantApplicationRecord | null> {
    const direct = this.applications.get(idOrApplicationId);
    if (direct) {
      return structuredClone(direct);
    }
    for (const item of this.applications.values()) {
      if (item.applicationId === idOrApplicationId) {
        return structuredClone(item);
      }
    }
    return null;
  }

  async updateApplication(
    restaurantId: string,
    record: RestaurantApplicationRecord,
  ): Promise<RestaurantApplicationRecord | null> {
    if (!this.applications.has(restaurantId)) {
      return null;
    }
    const copy = structuredClone(record);
    this.applications.set(restaurantId, copy);
    return structuredClone(copy);
  }

  async listApplicationsByOwner(ownerUserId: string): Promise<RestaurantApplicationRecord[]> {
    return Array.from(this.applications.values())
      .filter((item) => item.ownerUserId === ownerUserId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      .map((item) => structuredClone(item));
  }

  async listReviewQueue(
    status?: OnboardingApplicationStatus,
  ): Promise<RestaurantApplicationRecord[]> {
    return Array.from(this.applications.values())
      .filter((item) =>
        status ? item.onboardingStatus === status : item.onboardingStatus !== 'DRAFT',
      )
      .sort((a, b) => {
        const aTime = a.submittedAt?.getTime() ?? a.updatedAt.getTime();
        const bTime = b.submittedAt?.getTime() ?? b.updatedAt.getTime();
        return aTime - bTime;
      })
      .map((item) => structuredClone(item));
  }

  async upsertOutlet(outlet: RestaurantOutletRecord): Promise<RestaurantOutletRecord> {
    const copy = structuredClone(outlet);
    this.outlets.set(copy.outletId, copy);
    return structuredClone(copy);
  }

  async getOutletById(outletId: string): Promise<RestaurantOutletRecord | null> {
    const existing = this.outlets.get(outletId);
    return existing ? structuredClone(existing) : null;
  }

  async listPublicOutlets(zoneId?: KolkataZoneId): Promise<RestaurantOutletRecord[]> {
    return Array.from(this.outlets.values())
      .filter(
        (item) => item.status === 'ACTIVE' && (zoneId === undefined || item.zoneId === zoneId),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((item) => structuredClone(item));
  }

  async createDocument(doc: RestaurantDocumentRecord): Promise<RestaurantDocumentRecord> {
    if (this.documents.has(doc.documentId)) {
      throw new AppError(409, 'CONFLICT', `Duplicate compliance documentId: ${doc.documentId}`);
    }
    const copy = structuredClone(doc);
    this.documents.set(copy.documentId, copy);
    return structuredClone(copy);
  }

  async getDocumentById(documentId: string): Promise<RestaurantDocumentRecord | null> {
    const existing = this.documents.get(documentId);
    return existing ? structuredClone(existing) : null;
  }

  async listDocumentsByRestaurant(restaurantId: string): Promise<RestaurantDocumentRecord[]> {
    return Array.from(this.documents.values())
      .filter((doc) => doc.restaurantId === restaurantId)
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      .map((doc) => structuredClone(doc));
  }

  async updateDocumentReview(
    documentId: string,
    verificationStatus: DocumentVerificationStatus,
    reviewNote: string | null,
    reviewedAt: Date,
  ): Promise<RestaurantDocumentRecord | null> {
    const existing = this.documents.get(documentId);
    if (!existing) {
      return null;
    }
    const updated: RestaurantDocumentRecord = {
      ...existing,
      verificationStatus,
      reviewNote,
      reviewedAt,
    };
    this.documents.set(documentId, updated);
    return structuredClone(updated);
  }
}
