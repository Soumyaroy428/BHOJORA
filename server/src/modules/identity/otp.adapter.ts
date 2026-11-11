import type { Logger } from '../../config/logger';
import type { OtpDeliveryMessage, OtpPurpose, OtpSenderAdapter } from './identity.types';

/**
 * Formats an origin-bound SMS verification message compliant with WebOTP API
 * and iOS Safari autofill (`@<host> #<code_or_token>` on the final line).
 */
export function formatOriginBoundOtpSms(params: {
  code: string;
  originHost: string;
  purpose: OtpPurpose;
  ttlSeconds: number;
}): string {
  const minutes = Math.max(1, Math.round(params.ttlSeconds / 60));
  const actionLabel = params.purpose === 'recovery' ? 'account recovery code' : 'verification code';
  return `Your BHOJORA ${actionLabel} is ${params.code}. Valid for ${minutes} minutes. Never share this code.\n\n@${params.originHost} #${params.code}`;
}

/**
 * Default non-production OTP adapter that logs sanitized dispatch metadata
 * without ever writing plaintext OTPs or full Tier 3 phone/email destinations (AUTH.md & ADR-007).
 */
export class SafeLogOtpSenderAdapter implements OtpSenderAdapter {
  constructor(private readonly logger: Logger) {}

  async sendOtp(message: OtpDeliveryMessage): Promise<void> {
    this.logger.info('identity.otp.dispatched', {
      challengeId: message.challengeId,
      purpose: message.purpose,
      channel: message.channel,
      maskedDestination: message.maskedDestination,
      expiresAt: message.expiresAt.toISOString(),
    });
  }
}

/**
 * Deterministic in-memory OTP adapter for automated verification suites.
 */
export class InMemoryTestOtpAdapter implements OtpSenderAdapter {
  private readonly delivered: OtpDeliveryMessage[] = [];

  async sendOtp(message: OtpDeliveryMessage): Promise<void> {
    this.delivered.push(message);
  }

  getLatestMessage(destination?: string): OtpDeliveryMessage | undefined {
    if (!destination) {
      return this.delivered[this.delivered.length - 1];
    }
    for (let i = this.delivered.length - 1; i >= 0; i -= 1) {
      const candidate = this.delivered[i];
      if (candidate && candidate.destination === destination) {
        return candidate;
      }
    }
    return undefined;
  }

  getAllMessages(): readonly OtpDeliveryMessage[] {
    return this.delivered;
  }

  clear(): void {
    this.delivered.length = 0;
  }
}
