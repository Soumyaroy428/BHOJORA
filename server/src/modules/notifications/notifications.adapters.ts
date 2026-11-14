import { randomUUID } from 'node:crypto';

export interface NotificationAdapterResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface SmsAdapter {
  sendSms(recipientPhone: string, message: string): Promise<NotificationAdapterResult>;
}

export interface EmailAdapter {
  sendEmail(
    recipientEmail: string,
    subject: string,
    body: string,
  ): Promise<NotificationAdapterResult>;
}

export interface PushAdapter {
  sendPush(
    devicePushToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<NotificationAdapterResult>;
}

/**
 * In-Memory SMS Adapter (Test / Sandbox / Dev)
 * Supports simulated failure injection for idempotent retry verification.
 */
export class InMemorySmsAdapter implements SmsAdapter {
  public sentMessages: Array<{
    recipient: string;
    message: string;
    sentAt: Date;
    providerMessageId: string;
  }> = [];

  private failNextAttemptsCount = 0;

  public setFailNextAttempts(count: number): void {
    this.failNextAttemptsCount = count;
  }

  async sendSms(recipientPhone: string, message: string): Promise<NotificationAdapterResult> {
    if (this.failNextAttemptsCount > 0) {
      this.failNextAttemptsCount--;
      return {
        success: false,
        error: 'Simulated telecom SMS gateway temporary timeout (HTTP 504)',
      };
    }

    const providerMessageId = `sms_${randomUUID()}`;
    this.sentMessages.push({
      recipient: recipientPhone,
      message,
      sentAt: new Date(),
      providerMessageId,
    });

    return {
      success: true,
      providerMessageId,
    };
  }
}

/**
 * In-Memory Email Adapter (Test / Sandbox / Dev)
 */
export class InMemoryEmailAdapter implements EmailAdapter {
  public sentEmails: Array<{
    recipient: string;
    subject: string;
    body: string;
    sentAt: Date;
    providerMessageId: string;
  }> = [];

  private failNextAttemptsCount = 0;

  public setFailNextAttempts(count: number): void {
    this.failNextAttemptsCount = count;
  }

  async sendEmail(
    recipientEmail: string,
    subject: string,
    body: string,
  ): Promise<NotificationAdapterResult> {
    if (this.failNextAttemptsCount > 0) {
      this.failNextAttemptsCount--;
      return {
        success: false,
        error: 'Simulated SMTP provider connection dropped (ECONNRESET)',
      };
    }

    const providerMessageId = `email_${randomUUID()}`;
    this.sentEmails.push({
      recipient: recipientEmail,
      subject,
      body,
      sentAt: new Date(),
      providerMessageId,
    });

    return {
      success: true,
      providerMessageId,
    };
  }
}

/**
 * In-Memory Push Adapter (Test / Sandbox / Dev)
 */
export class InMemoryPushAdapter implements PushAdapter {
  public sentPushes: Array<{
    deviceToken: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    sentAt: Date;
    providerMessageId: string;
  }> = [];

  private failNextAttemptsCount = 0;

  public setFailNextAttempts(count: number): void {
    this.failNextAttemptsCount = count;
  }

  async sendPush(
    devicePushToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
  ): Promise<NotificationAdapterResult> {
    if (this.failNextAttemptsCount > 0) {
      this.failNextAttemptsCount--;
      return {
        success: false,
        error: 'Simulated FCM service unavailable (HTTP 503)',
      };
    }

    const providerMessageId = `fcm_${randomUUID()}`;
    this.sentPushes.push({
      deviceToken: devicePushToken,
      title,
      body,
      data,
      sentAt: new Date(),
      providerMessageId,
    });

    return {
      success: true,
      providerMessageId,
    };
  }
}
