import { randomUUID } from 'node:crypto';
import type {
  NotificationChannel,
  NotificationCategory,
  NotificationStatus,
  DispatchNotificationRequest,
  DispatchNotificationResult,
  NotificationRecordDto,
  UserNotificationPreferencesDto,
  UpdateUserNotificationPreferencesDto,
} from '@bhojora/shared';
import type {
  SmsAdapter,
  EmailAdapter,
  PushAdapter,
  NotificationAdapterResult,
} from './notifications.adapters';
import type { NotificationStore } from './notifications.store';
import {
  type NotificationRecord,
  renderTemplate,
  sanitizeNotificationContent,
  toNotificationRecordDto,
  toUserNotificationPreferencesDto,
} from './notifications.types';

export interface NotificationServiceOptions {
  notificationStore: NotificationStore;
  smsAdapter: SmsAdapter;
  emailAdapter: EmailAdapter;
  pushAdapter: PushAdapter;
  clock?: { now(): Date };
}

export class NotificationService {
  private readonly store: NotificationStore;
  private readonly smsAdapter: SmsAdapter;
  private readonly emailAdapter: EmailAdapter;
  private readonly pushAdapter: PushAdapter;
  private readonly clock: { now(): Date };

  constructor(options: NotificationServiceOptions) {
    this.store = options.notificationStore;
    this.smsAdapter = options.smsAdapter;
    this.emailAdapter = options.emailAdapter;
    this.pushAdapter = options.pushAdapter;
    this.clock = options.clock ?? { now: () => new Date() };
  }

  async dispatch(request: DispatchNotificationRequest): Promise<DispatchNotificationResult> {
    const dispatchId = `disp_${randomUUID()}`;
    const userPrefs = await this.store.getPreferences(request.userId);
    const notifications: NotificationRecordDto[] = [];
    let suppressedCount = 0;
    let deliveredCount = 0;
    let failedCount = 0;

    const rendered = renderTemplate(
      request.templateKey,
      userPrefs.language,
      request.templateVariables,
    );

    for (const channel of request.channels) {
      const channelIdempotencyKey = request.idempotencyKey
        ? `${request.idempotencyKey}:${channel}`
        : null;

      // 1. Idempotency Check
      if (channelIdempotencyKey) {
        const existing = await this.store.getNotificationByIdempotencyKey(channelIdempotencyKey);
        if (existing) {
          notifications.push(toNotificationRecordDto(existing));
          if (existing.status === 'DELIVERED') deliveredCount++;
          else if (existing.status === 'SUPPRESSED_OPT_OUT') suppressedCount++;
          else failedCount++;
          continue;
        }
      }

      // 2. Consent & Opt-Out Policy Enforcement
      const isMarketing = request.category === 'MARKETING';
      let isOptedOut = false;

      if (isMarketing && userPrefs.promotionalOptOut) {
        isOptedOut = true;
      } else if (channel === 'SMS' && !userPrefs.smsEnabled && isMarketing) {
        isOptedOut = true;
      } else if (channel === 'EMAIL' && !userPrefs.emailEnabled && isMarketing) {
        isOptedOut = true;
      } else if (channel === 'PUSH' && !userPrefs.pushEnabled && isMarketing) {
        isOptedOut = true;
      } else if (channel === 'IN_APP' && !userPrefs.inAppEnabled && isMarketing) {
        isOptedOut = true;
      }

      const recipient = this.resolveRecipient(channel, request);
      const notificationId = `notif_${randomUUID()}`;
      const now = this.clock.now();

      if (isOptedOut) {
        const suppressedRecord: NotificationRecord = {
          notificationId,
          userId: request.userId,
          channel,
          category: request.category,
          templateKey: request.templateKey,
          recipient: this.maskRecipient(recipient),
          title: rendered.title,
          body: rendered.body,
          status: 'SUPPRESSED_OPT_OUT',
          attemptCount: 0,
          maxAttempts: 3,
          isRead: false,
          failureReason: 'User opted out of marketing/promotional communications',
          providerMessageId: null,
          idempotencyKey: channelIdempotencyKey,
          metadata: request.metadata ?? {},
          createdAt: now,
          deliveredAt: null,
          lastAttemptAt: now,
        };

        const saved = await this.store.saveNotification(suppressedRecord);
        notifications.push(toNotificationRecordDto(saved));
        suppressedCount++;
        continue;
      }

      // 3. Dispatch via Channel Adapter
      const initialRecord: NotificationRecord = {
        notificationId,
        userId: request.userId,
        channel,
        category: request.category,
        templateKey: request.templateKey,
        recipient: this.maskRecipient(recipient),
        title: rendered.title,
        body: rendered.body,
        status: 'DISPATCHING',
        attemptCount: 1,
        maxAttempts: 3,
        isRead: false,
        failureReason: null,
        providerMessageId: null,
        idempotencyKey: channelIdempotencyKey,
        metadata: request.metadata ?? {},
        createdAt: now,
        deliveredAt: null,
        lastAttemptAt: now,
      };

      const adapterResult = await this.executeAdapter(
        channel,
        recipient,
        rendered.title,
        rendered.body,
        request.metadata,
      );

      if (adapterResult.success) {
        initialRecord.status = 'DELIVERED';
        initialRecord.deliveredAt = this.clock.now();
        initialRecord.providerMessageId = adapterResult.providerMessageId ?? null;
        deliveredCount++;
      } else {
        initialRecord.status = 'FAILED';
        initialRecord.failureReason = adapterResult.error ?? 'Unknown dispatch error';
        failedCount++;
      }

      const saved = await this.store.saveNotification(initialRecord);
      notifications.push(toNotificationRecordDto(saved));
    }

    return {
      dispatchId,
      idempotencyKey: request.idempotencyKey,
      notifications,
      suppressedCount,
      deliveredCount,
      failedCount,
    };
  }

  async retry(notificationId: string): Promise<NotificationRecordDto> {
    const record = await this.store.getNotificationById(notificationId);
    if (!record) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    // Idempotent retry: if already delivered, do not re-dispatch
    if (record.status === 'DELIVERED') {
      return toNotificationRecordDto(record);
    }

    // If opted out or already at dead letter, prevent duplicate retry
    if (record.status === 'SUPPRESSED_OPT_OUT') {
      return toNotificationRecordDto(record);
    }

    const nextAttempt = record.attemptCount + 1;
    const now = this.clock.now();

    const adapterResult = await this.executeAdapter(
      record.channel,
      record.recipient,
      record.title,
      record.body,
      record.metadata,
    );

    let nextStatus: NotificationStatus;
    let deliveredAt: Date | undefined;
    let failureReason: string | undefined;

    if (adapterResult.success) {
      nextStatus = 'DELIVERED';
      deliveredAt = now;
    } else {
      failureReason = adapterResult.error ?? 'Retry attempt failed';
      nextStatus = nextAttempt >= record.maxAttempts ? 'DEAD_LETTER' : 'RETRYING';
    }

    const updated = await this.store.updateNotificationStatus(notificationId, nextStatus, {
      providerMessageId: adapterResult.providerMessageId,
      failureReason,
      deliveredAt,
      attemptCount: nextAttempt,
      lastAttemptAt: now,
    });

    return toNotificationRecordDto(updated ?? record);
  }

  async getPreferences(userId: string): Promise<UserNotificationPreferencesDto> {
    const prefs = await this.store.getPreferences(userId);
    return toUserNotificationPreferencesDto(prefs);
  }

  async updatePreferences(
    userId: string,
    updates: UpdateUserNotificationPreferencesDto,
  ): Promise<UserNotificationPreferencesDto> {
    const updated = await this.store.updatePreferences(userId, updates);
    return toUserNotificationPreferencesDto(updated);
  }

  async optOut(userId: string, _reason?: string): Promise<{ success: boolean; optedOut: boolean }> {
    await this.store.updatePreferences(userId, { promotionalOptOut: true });
    return { success: true, optedOut: true };
  }

  async getUserNotifications(
    userId: string,
    options?: { limit?: number; unreadOnly?: boolean },
  ): Promise<NotificationRecordDto[]> {
    const list = await this.store.getUserNotifications(userId, options);
    return list.map(toNotificationRecordDto);
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    return this.store.markAsRead(notificationId, userId);
  }

  async getDeliveryLogs(filter?: {
    status?: NotificationStatus;
    channel?: NotificationChannel;
    category?: NotificationCategory;
    limit?: number;
  }): Promise<NotificationRecordDto[]> {
    const list = await this.store.listDeliveryLogs(filter);
    return list.map(toNotificationRecordDto);
  }

  private resolveRecipient(
    channel: NotificationChannel,
    request: DispatchNotificationRequest,
  ): string {
    switch (channel) {
      case 'SMS':
        return request.recipientPhone || `+9198300${request.userId.slice(0, 5)}`;
      case 'EMAIL':
        return request.recipientEmail || `${request.userId}@bhojora.in`;
      case 'PUSH':
        return request.devicePushToken || `fcm_token_${request.userId}`;
      case 'IN_APP':
        return `in_app_${request.userId}`;
    }
  }

  private maskRecipient(recipient: string): string {
    if (recipient.includes('@')) {
      const parts = recipient.split('@');
      const name = parts[0] ?? '';
      const domain = parts[1] ?? '';
      const maskedName = name.length > 2 ? `${name.slice(0, 2)}***` : `${name}***`;
      return `${maskedName}@${domain}`;
    }
    if (recipient.startsWith('+91') && recipient.length >= 13) {
      return `${recipient.slice(0, 6)}****${recipient.slice(-2)}`;
    }
    return recipient;
  }

  private async executeAdapter(
    channel: NotificationChannel,
    recipient: string,
    title: string,
    body: string,
    metadata?: Record<string, unknown>,
  ): Promise<NotificationAdapterResult> {
    const sanitizedBody = sanitizeNotificationContent(body);

    switch (channel) {
      case 'SMS':
        return this.smsAdapter.sendSms(recipient, sanitizedBody);
      case 'EMAIL':
        return this.emailAdapter.sendEmail(recipient, title, sanitizedBody);
      case 'PUSH':
        return this.pushAdapter.sendPush(recipient, title, sanitizedBody, metadata);
      case 'IN_APP':
        // In-app notifications are stored in the database
        return {
          success: true,
          providerMessageId: `inapp_${randomUUID()}`,
        };
    }
  }
}
