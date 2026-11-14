import { createHmac, timingSafeEqual } from 'crypto';

export interface WebhookLogEntry {
  eventId: string;
  provider: string;
  eventType: string;
  signatureValid: boolean;
  receivedAt: string;
  processedAt: string;
  status: 'PROCESSED' | 'REPLAY_IGNORED' | 'SIGNATURE_INVALID' | 'FAILED';
  durationMs: number;
}

export class WebhookObservabilityService {
  private seenEvents: Map<string, WebhookLogEntry> = new Map();
  private logs: WebhookLogEntry[] = [];

  public verifyHmacSignature(rawBody: string, signature: string, secret: string): boolean {
    if (!signature || !secret) {
      return false;
    }
    try {
      const expectedHmac = createHmac('sha256', secret).update(rawBody).digest('hex');
      const sigBuf = Buffer.from(signature.trim());
      const expBuf = Buffer.from(expectedHmac);

      if (sigBuf.length !== expBuf.length) {
        return false;
      }
      return timingSafeEqual(sigBuf, expBuf);
    } catch {
      return false;
    }
  }

  public processWebhookEvent(
    eventId: string,
    provider: string,
    eventType: string,
    signatureValid: boolean,
  ): { isDuplicate: boolean; status: WebhookLogEntry['status'] } {
    const startTime = Date.now();
    const existing = this.seenEvents.get(eventId);

    if (!signatureValid) {
      const entry: WebhookLogEntry = {
        eventId,
        provider,
        eventType,
        signatureValid: false,
        receivedAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
        status: 'SIGNATURE_INVALID',
        durationMs: Date.now() - startTime,
      };
      this.logs.push(entry);
      return { isDuplicate: false, status: 'SIGNATURE_INVALID' };
    }

    if (existing) {
      const replayEntry: WebhookLogEntry = {
        eventId,
        provider,
        eventType,
        signatureValid: true,
        receivedAt: new Date().toISOString(),
        processedAt: new Date().toISOString(),
        status: 'REPLAY_IGNORED',
        durationMs: Date.now() - startTime,
      };
      this.logs.push(replayEntry);
      return { isDuplicate: true, status: 'REPLAY_IGNORED' };
    }

    const newEntry: WebhookLogEntry = {
      eventId,
      provider,
      eventType,
      signatureValid: true,
      receivedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
      status: 'PROCESSED',
      durationMs: Date.now() - startTime,
    };
    this.seenEvents.set(eventId, newEntry);
    this.logs.push(newEntry);
    return { isDuplicate: false, status: 'PROCESSED' };
  }

  public getLogs(limit = 50): WebhookLogEntry[] {
    return this.logs.slice(-limit).reverse();
  }

  public getEvent(eventId: string): WebhookLogEntry | null {
    return this.seenEvents.get(eventId) ?? null;
  }
}
