import type { Connection, Model } from 'mongoose';
import { Schema, model, models } from 'mongoose';
import type {
  NotificationChannel,
  NotificationCategory,
  NotificationStatus,
} from '@bhojora/shared';
import type { NotificationRecord, NotificationPreferencesRecord } from './notifications.types';

export interface NotificationStore {
  saveNotification(record: NotificationRecord): Promise<NotificationRecord>;
  getNotificationById(notificationId: string): Promise<NotificationRecord | null>;
  getNotificationByIdempotencyKey(key: string): Promise<NotificationRecord | null>;
  getUserNotifications(
    userId: string,
    options?: { limit?: number; unreadOnly?: boolean },
  ): Promise<NotificationRecord[]>;
  markAsRead(notificationId: string, userId: string): Promise<boolean>;
  getPreferences(userId: string): Promise<NotificationPreferencesRecord>;
  updatePreferences(
    userId: string,
    updates: Partial<Omit<NotificationPreferencesRecord, 'userId' | 'updatedAt'>>,
  ): Promise<NotificationPreferencesRecord>;
  listDeliveryLogs(filter?: {
    status?: NotificationStatus;
    channel?: NotificationChannel;
    category?: NotificationCategory;
    limit?: number;
  }): Promise<NotificationRecord[]>;
  updateNotificationStatus(
    notificationId: string,
    status: NotificationStatus,
    details?: {
      providerMessageId?: string;
      failureReason?: string;
      deliveredAt?: Date;
      attemptCount?: number;
      lastAttemptAt?: Date;
    },
  ): Promise<NotificationRecord | null>;
}

export const DEFAULT_NOTIFICATION_PREFERENCES = (
  userId: string,
): NotificationPreferencesRecord => ({
  userId,
  smsEnabled: true,
  emailEnabled: true,
  pushEnabled: true,
  inAppEnabled: true,
  promotionalOptOut: false,
  language: 'en-IN',
  updatedAt: new Date(),
});

export class InMemoryNotificationStore implements NotificationStore {
  private readonly notifications = new Map<string, NotificationRecord>();
  private readonly idempotencyIndex = new Map<string, string>(); // idempotencyKey -> notificationId
  private readonly preferences = new Map<string, NotificationPreferencesRecord>();

  async saveNotification(record: NotificationRecord): Promise<NotificationRecord> {
    const cloned = structuredClone(record);
    this.notifications.set(record.notificationId, cloned);
    if (record.idempotencyKey) {
      this.idempotencyIndex.set(record.idempotencyKey, record.notificationId);
    }
    return structuredClone(cloned);
  }

  async getNotificationById(notificationId: string): Promise<NotificationRecord | null> {
    const found = this.notifications.get(notificationId);
    return found ? structuredClone(found) : null;
  }

  async getNotificationByIdempotencyKey(key: string): Promise<NotificationRecord | null> {
    const notificationId = this.idempotencyIndex.get(key);
    if (!notificationId) return null;
    return this.getNotificationById(notificationId);
  }

  async getUserNotifications(
    userId: string,
    options?: { limit?: number; unreadOnly?: boolean },
  ): Promise<NotificationRecord[]> {
    const limit = options?.limit ?? 50;
    const unreadOnly = options?.unreadOnly ?? false;

    const list = Array.from(this.notifications.values())
      .filter((n) => n.userId === userId && n.channel === 'IN_APP')
      .filter((n) => (!unreadOnly ? true : !n.isRead))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);

    return structuredClone(list);
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const found = this.notifications.get(notificationId);
    if (!found || found.userId !== userId) return false;
    found.isRead = true;
    return true;
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesRecord> {
    const existing = this.preferences.get(userId);
    if (existing) return structuredClone(existing);

    const initial = DEFAULT_NOTIFICATION_PREFERENCES(userId);
    this.preferences.set(userId, initial);
    return structuredClone(initial);
  }

  async updatePreferences(
    userId: string,
    updates: Partial<Omit<NotificationPreferencesRecord, 'userId' | 'updatedAt'>>,
  ): Promise<NotificationPreferencesRecord> {
    const current = await this.getPreferences(userId);
    const updated: NotificationPreferencesRecord = {
      ...current,
      ...updates,
      userId,
      updatedAt: new Date(),
    };
    this.preferences.set(userId, updated);
    return structuredClone(updated);
  }

  async listDeliveryLogs(filter?: {
    status?: NotificationStatus;
    channel?: NotificationChannel;
    category?: NotificationCategory;
    limit?: number;
  }): Promise<NotificationRecord[]> {
    const limit = filter?.limit ?? 50;
    let list = Array.from(this.notifications.values());

    if (filter?.status) {
      list = list.filter((n) => n.status === filter.status);
    }
    if (filter?.channel) {
      list = list.filter((n) => n.channel === filter.channel);
    }
    if (filter?.category) {
      list = list.filter((n) => n.category === filter.category);
    }

    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return structuredClone(list.slice(0, limit));
  }

  async updateNotificationStatus(
    notificationId: string,
    status: NotificationStatus,
    details?: {
      providerMessageId?: string;
      failureReason?: string;
      deliveredAt?: Date;
      attemptCount?: number;
      lastAttemptAt?: Date;
    },
  ): Promise<NotificationRecord | null> {
    const found = this.notifications.get(notificationId);
    if (!found) return null;

    found.status = status;
    if (details?.providerMessageId !== undefined) {
      found.providerMessageId = details.providerMessageId;
    }
    if (details?.failureReason !== undefined) {
      found.failureReason = details.failureReason;
    }
    if (details?.deliveredAt !== undefined) {
      found.deliveredAt = details.deliveredAt;
    }
    if (details?.attemptCount !== undefined) {
      found.attemptCount = details.attemptCount;
    }
    if (details?.lastAttemptAt !== undefined) {
      found.lastAttemptAt = details.lastAttemptAt;
    }

    return structuredClone(found);
  }
}

// Mongoose Schemas & Store
const notificationSchema = new Schema(
  {
    notificationId: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    channel: {
      type: String,
      enum: ['SMS', 'EMAIL', 'PUSH', 'IN_APP'],
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ['TRANSACTIONAL', 'MARKETING', 'OPERATIONAL', 'SAFETY'],
      required: true,
    },
    templateKey: { type: String, required: true },
    recipient: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    status: {
      type: String,
      enum: [
        'PENDING',
        'DISPATCHING',
        'DELIVERED',
        'FAILED',
        'RETRYING',
        'SUPPRESSED_OPT_OUT',
        'DEAD_LETTER',
      ],
      required: true,
      index: true,
    },
    attemptCount: { type: Number, required: true, default: 0 },
    maxAttempts: { type: Number, required: true, default: 3 },
    isRead: { type: Boolean, required: true, default: false },
    failureReason: { type: String, default: null },
    providerMessageId: { type: String, default: null },
    idempotencyKey: { type: String, default: null, sparse: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, required: true, default: Date.now, index: true },
    deliveredAt: { type: Date, default: null },
    lastAttemptAt: { type: Date, default: null },
  },
  { collection: 'notifications' },
);

const notificationPreferencesSchema = new Schema(
  {
    userId: { type: String, required: true, unique: true, index: true },
    smsEnabled: { type: Boolean, required: true, default: true },
    emailEnabled: { type: Boolean, required: true, default: true },
    pushEnabled: { type: Boolean, required: true, default: true },
    inAppEnabled: { type: Boolean, required: true, default: true },
    promotionalOptOut: { type: Boolean, required: true, default: false },
    language: { type: String, enum: ['en-IN', 'bn-IN'], required: true, default: 'en-IN' },
    updatedAt: { type: Date, required: true, default: Date.now },
  },
  { collection: 'notification_preferences' },
);

type NotificationDocument = NotificationRecord & { _id?: unknown };
type NotificationPreferencesDocument = NotificationPreferencesRecord & { _id?: unknown };

export class MongooseNotificationStore implements NotificationStore {
  private readonly notificationModel: Model<NotificationDocument>;
  private readonly preferencesModel: Model<NotificationPreferencesDocument>;

  constructor(_connection: Connection) {
    this.notificationModel =
      (models.NotificationRecord as Model<NotificationDocument> | undefined) ??
      model<NotificationDocument>('NotificationRecord', notificationSchema);
    this.preferencesModel =
      (models.NotificationPreferences as Model<NotificationPreferencesDocument> | undefined) ??
      model<NotificationPreferencesDocument>(
        'NotificationPreferences',
        notificationPreferencesSchema,
      );
  }

  async saveNotification(record: NotificationRecord): Promise<NotificationRecord> {
    const created = await this.notificationModel.create(record);
    return created.toObject() as NotificationRecord;
  }

  async getNotificationById(notificationId: string): Promise<NotificationRecord | null> {
    const found = await this.notificationModel.findOne({ notificationId }).lean();
    return found ? (found as NotificationRecord) : null;
  }

  async getNotificationByIdempotencyKey(key: string): Promise<NotificationRecord | null> {
    const found = await this.notificationModel.findOne({ idempotencyKey: key }).lean();
    return found ? (found as NotificationRecord) : null;
  }

  async getUserNotifications(
    userId: string,
    options?: { limit?: number; unreadOnly?: boolean },
  ): Promise<NotificationRecord[]> {
    const limit = options?.limit ?? 50;
    const query: Record<string, unknown> = { userId, channel: 'IN_APP' };
    if (options?.unreadOnly) {
      query.isRead = false;
    }
    const docs = await this.notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs as NotificationRecord[];
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const res = await this.notificationModel.updateOne(
      { notificationId, userId },
      { $set: { isRead: true } },
    );
    return res.modifiedCount > 0;
  }

  async getPreferences(userId: string): Promise<NotificationPreferencesRecord> {
    const found = await this.preferencesModel.findOne({ userId }).lean();
    if (found) return found as NotificationPreferencesRecord;

    const initial = DEFAULT_NOTIFICATION_PREFERENCES(userId);
    const created = await this.preferencesModel.create(initial);
    return created.toObject() as NotificationPreferencesRecord;
  }

  async updatePreferences(
    userId: string,
    updates: Partial<Omit<NotificationPreferencesRecord, 'userId' | 'updatedAt'>>,
  ): Promise<NotificationPreferencesRecord> {
    const updated = await this.preferencesModel
      .findOneAndUpdate(
        { userId },
        { $set: { ...updates, updatedAt: new Date() } },
        { new: true, upsert: true },
      )
      .lean();
    return updated as NotificationPreferencesRecord;
  }

  async listDeliveryLogs(filter?: {
    status?: NotificationStatus;
    channel?: NotificationChannel;
    category?: NotificationCategory;
    limit?: number;
  }): Promise<NotificationRecord[]> {
    const limit = filter?.limit ?? 50;
    const query: Record<string, unknown> = {};
    if (filter?.status) query.status = filter.status;
    if (filter?.channel) query.channel = filter.channel;
    if (filter?.category) query.category = filter.category;

    const docs = await this.notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs as NotificationRecord[];
  }

  async updateNotificationStatus(
    notificationId: string,
    status: NotificationStatus,
    details?: {
      providerMessageId?: string;
      failureReason?: string;
      deliveredAt?: Date;
      attemptCount?: number;
      lastAttemptAt?: Date;
    },
  ): Promise<NotificationRecord | null> {
    const patch: Record<string, unknown> = { status };
    if (details?.providerMessageId !== undefined) {
      patch.providerMessageId = details.providerMessageId;
    }
    if (details?.failureReason !== undefined) {
      patch.failureReason = details.failureReason;
    }
    if (details?.deliveredAt !== undefined) {
      patch.deliveredAt = details.deliveredAt;
    }
    if (details?.attemptCount !== undefined) {
      patch.attemptCount = details.attemptCount;
    }
    if (details?.lastAttemptAt !== undefined) {
      patch.lastAttemptAt = details.lastAttemptAt;
    }

    const updated = await this.notificationModel
      .findOneAndUpdate({ notificationId }, { $set: patch }, { new: true })
      .lean();
    return updated ? (updated as NotificationRecord) : null;
  }
}
