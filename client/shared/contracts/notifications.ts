/**
 * BHOJORA — Notifications Domain Contracts (Checkpoint 29)
 * Multi-channel messaging: SMS, Email, Push, In-App.
 * Enforces strict PII sanitization, consent opt-outs, and idempotent retries.
 */

export type NotificationChannel = 'SMS' | 'EMAIL' | 'PUSH' | 'IN_APP';

export type NotificationCategory = 'TRANSACTIONAL' | 'MARKETING' | 'OPERATIONAL' | 'SAFETY';

export type NotificationStatus =
  | 'PENDING'
  | 'DISPATCHING'
  | 'DELIVERED'
  | 'FAILED'
  | 'RETRYING'
  | 'SUPPRESSED_OPT_OUT'
  | 'DEAD_LETTER';

export type NotificationTemplateKey =
  | 'ORDER_CONFIRMED'
  | 'ORDER_DISPATCHED'
  | 'DELIVERY_OTP'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'REFUND_CREDITED'
  | 'INSPECTION_COMPLETED'
  | 'OUTLET_SUSPENDED'
  | 'DELIVERY_JOB_OFFER'
  | 'PROMOTIONAL_OFFER';

export interface UserNotificationPreferencesDto {
  userId: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  pushEnabled: boolean;
  inAppEnabled: boolean;
  promotionalOptOut: boolean;
  language: 'en-IN' | 'bn-IN';
  updatedAt: string;
}

export interface UpdateUserNotificationPreferencesDto {
  smsEnabled?: boolean;
  emailEnabled?: boolean;
  pushEnabled?: boolean;
  inAppEnabled?: boolean;
  promotionalOptOut?: boolean;
  language?: 'en-IN' | 'bn-IN';
}

export interface NotificationRecordDto {
  notificationId: string;
  userId: string;
  channel: NotificationChannel;
  category: NotificationCategory;
  templateKey: NotificationTemplateKey;
  recipient: string;
  title: string;
  body: string;
  status: NotificationStatus;
  attemptCount: number;
  maxAttempts: number;
  isRead: boolean;
  failureReason?: string | null;
  providerMessageId?: string | null;
  idempotencyKey?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  deliveredAt?: string | null;
}

export interface DispatchNotificationRequest {
  userId: string;
  channels: NotificationChannel[];
  category: NotificationCategory;
  templateKey: NotificationTemplateKey;
  templateVariables: Record<string, string | number>;
  recipientEmail?: string;
  recipientPhone?: string;
  devicePushToken?: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

export interface DispatchNotificationResult {
  dispatchId: string;
  idempotencyKey?: string;
  notifications: NotificationRecordDto[];
  suppressedCount: number;
  deliveredCount: number;
  failedCount: number;
}
