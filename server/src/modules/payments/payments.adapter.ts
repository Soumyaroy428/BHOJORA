import crypto from 'node:crypto';
import type { PaymentProvider, PaymentStatus, SandboxScenario } from '@bhojora/shared';
import { AppError } from '../../middleware/error-handler';

export interface GatewaySessionCreateInput {
  paymentId: string;
  provider: PaymentProvider;
  amountPaise: number;
  currency: 'INR';
  quoteId: string;
  customerId: string;
  sandboxScenario: SandboxScenario;
}

export interface GatewaySessionCreateOutput {
  provider: PaymentProvider;
  providerOrderId: string;
  providerPaymentId: string;
  sandboxCheckoutSessionId: string;
  initialStatus: PaymentStatus;
  reconciliationRequired: boolean;
  failureReason: string | null;
}

export interface GatewayStatusPollResult {
  provider: PaymentProvider;
  providerPaymentId: string;
  gatewayStatus: 'CAPTURED' | 'FAILED' | 'PENDING' | 'UNKNOWN';
  failureReason: string | null;
}

export interface PaymentGatewayAdapter {
  createSession(input: GatewaySessionCreateInput): Promise<GatewaySessionCreateOutput>;
  fetchPaymentStatus(
    provider: PaymentProvider,
    providerPaymentId: string,
    hintScenario?: SandboxScenario,
  ): Promise<GatewayStatusPollResult>;
}

/**
 * Deterministic sandbox gateway adapter mimicking Razorpay/Cashfree session creation,
 * HMAC-SHA256 webhook signatures, and status polling for stuck/unknown payments.
 */
export class SandboxPaymentGatewayAdapter implements PaymentGatewayAdapter {
  private readonly polledOutcomes = new Map<string, GatewayStatusPollResult>();

  normalizeProviderParam(raw: string): PaymentProvider {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'razorpay' || normalized === 'sandbox_razorpay') {
      return 'SANDBOX_RAZORPAY';
    }
    if (normalized === 'cashfree' || normalized === 'sandbox_cashfree') {
      return 'SANDBOX_CASHFREE';
    }
    throw new AppError(400, 'VALIDATION_ERROR', `Unsupported payment provider "${raw}"`);
  }

  async createSession(input: GatewaySessionCreateInput): Promise<GatewaySessionCreateOutput> {
    const prefix = input.provider === 'SANDBOX_CASHFREE' ? 'cf_sbx' : 'rzp_sbx';
    const token = crypto.randomBytes(6).toString('hex');
    const providerOrderId = `${prefix}_ord_${token}`;
    const providerPaymentId = `${prefix}_pay_${token}`;
    const sandboxCheckoutSessionId = `sbx_sess_${crypto.randomBytes(8).toString('hex')}`;

    let initialStatus: PaymentStatus = 'PENDING';
    let reconciliationRequired = false;
    let failureReason: string | null = null;
    let pollTarget: GatewayStatusPollResult = {
      provider: input.provider,
      providerPaymentId,
      gatewayStatus: 'CAPTURED',
      failureReason: null,
    };

    switch (input.sandboxScenario) {
      case 'AUTO_CAPTURE':
        initialStatus = 'PENDING';
        break;
      case 'PENDING_WEBHOOK':
        initialStatus = 'PENDING';
        pollTarget = {
          provider: input.provider,
          providerPaymentId,
          gatewayStatus: 'PENDING',
          failureReason: null,
        };
        break;
      case 'UNKNOWN_RECOVER_CAPTURE':
        initialStatus = 'UNKNOWN';
        reconciliationRequired = true;
        pollTarget = {
          provider: input.provider,
          providerPaymentId,
          gatewayStatus: 'CAPTURED',
          failureReason: null,
        };
        break;
      case 'UNKNOWN_RECOVER_FAIL':
        initialStatus = 'UNKNOWN';
        reconciliationRequired = true;
        failureReason = 'Gateway confirmation timed out; awaiting reconciliation';
        pollTarget = {
          provider: input.provider,
          providerPaymentId,
          gatewayStatus: 'FAILED',
          failureReason: 'Issuer declined after gateway timeout',
        };
        break;
      case 'DECLINED':
        initialStatus = 'FAILED';
        failureReason = 'Sandbox bank authorization declined';
        pollTarget = {
          provider: input.provider,
          providerPaymentId,
          gatewayStatus: 'FAILED',
          failureReason,
        };
        break;
    }

    this.polledOutcomes.set(`${input.provider}:${providerPaymentId}`, pollTarget);

    return {
      provider: input.provider,
      providerOrderId,
      providerPaymentId,
      sandboxCheckoutSessionId,
      initialStatus,
      reconciliationRequired,
      failureReason,
    };
  }

  async fetchPaymentStatus(
    provider: PaymentProvider,
    providerPaymentId: string,
    hintScenario?: SandboxScenario,
  ): Promise<GatewayStatusPollResult> {
    const cached = this.polledOutcomes.get(`${provider}:${providerPaymentId}`);
    if (cached) {
      return cached;
    }
    if (hintScenario === 'UNKNOWN_RECOVER_FAIL' || hintScenario === 'DECLINED') {
      return {
        provider,
        providerPaymentId,
        gatewayStatus: 'FAILED',
        failureReason: 'Sandbox reconciled failure after timeout',
      };
    }
    if (hintScenario === 'PENDING_WEBHOOK') {
      return {
        provider,
        providerPaymentId,
        gatewayStatus: 'PENDING',
        failureReason: null,
      };
    }
    return {
      provider,
      providerPaymentId,
      gatewayStatus: 'CAPTURED',
      failureReason: null,
    };
  }
}

export function buildCanonicalWebhookSignPayload(
  timestampSeconds: number,
  body: {
    eventId: string;
    eventType: string;
    providerPaymentId: string;
    amountPaise: number;
  },
): string {
  return [
    String(timestampSeconds),
    body.eventId,
    body.eventType,
    body.providerPaymentId,
    String(body.amountPaise),
  ].join('.');
}

export function signSandboxWebhook(
  timestampSeconds: number,
  body: {
    eventId: string;
    eventType: string;
    providerPaymentId: string;
    amountPaise: number;
  },
  secret: string,
): string {
  const canonical = buildCanonicalWebhookSignPayload(timestampSeconds, body);
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

export function verifySandboxWebhookSignature(
  timestampSeconds: number,
  body: {
    eventId: string;
    eventType: string;
    providerPaymentId: string;
    amountPaise: number;
  },
  providedSignature: string,
  secret: string,
): boolean {
  const normalized = providedSignature.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    return false;
  }
  const expected = signSandboxWebhook(timestampSeconds, body, secret);
  const expectedBuf = Buffer.from(expected, 'hex');
  const providedBuf = Buffer.from(normalized, 'hex');
  if (expectedBuf.length !== providedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
