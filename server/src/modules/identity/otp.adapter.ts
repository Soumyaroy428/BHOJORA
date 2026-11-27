import net from 'node:net';
import tls from 'node:tls';
import type { AppConfig } from '../../config/env-types';
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
  const actionLabel =
    params.purpose === 'recovery'
      ? 'account recovery code'
      : params.purpose === 'mfa'
        ? 'step-up MFA code'
        : 'verification code';
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

function stripCrlf(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function extractEnvelopeAddress(raw: string): string {
  const cleaned = stripCrlf(raw);
  const angleMatch = /<([^<>]+)>/.exec(cleaned);
  return (angleMatch?.[1] ?? cleaned).replace(/[<>]/g, '').trim();
}

function dotStuffBody(text: string): string {
  const normalized = text.replace(/\r?\n/g, '\r\n');
  return normalized
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n');
}

function readSmtpResponse(
  getSocket: () => net.Socket | tls.TLSSocket,
): Promise<{ code: number; lines: string }> {
  return new Promise((resolve, reject) => {
    const socket = getSocket();
    let buffer = '';

    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onTimeout = () => {
      cleanup();
      reject(new Error('SMTP server response timeout'));
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      // Check the last non-empty line for SMTP continuation vs final reply ("XYZ ")
      for (let i = lines.length - 1; i >= 0; i -= 1) {
        const line = lines[i];
        if (!line) {
          continue;
        }
        const match = /^(\d{3})([ -])(.*)$/.exec(line);
        if (match && match[2] === ' ' && buffer.endsWith('\n')) {
          cleanup();
          resolve({ code: Number(match[1]), lines: buffer });
        }
        break;
      }
    };
    const cleanup = () => {
      socket.off('data', onData);
      socket.off('error', onError);
      socket.off('timeout', onTimeout);
    };

    socket.on('data', onData);
    socket.once('error', onError);
    socket.once('timeout', onTimeout);
  });
}

async function sendSmtpCommand(
  getSocket: () => net.Socket | tls.TLSSocket,
  command: string,
  expectedCodes: readonly number[],
): Promise<{ code: number; lines: string }> {
  const waitReply = readSmtpResponse(getSocket);
  getSocket().write(`${command}\r\n`, 'utf8');
  const reply = await waitReply;
  if (!expectedCodes.includes(reply.code)) {
    throw new Error(`SMTP error (${reply.code}): ${stripCrlf(reply.lines)}`);
  }
  return reply;
}

export interface SmtpOtpOptions {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  ehloHost: string;
  rejectUnauthorized?: boolean;
}

/**
 * Zero-dependency SMTP adapter for email OTP and password-recovery delivery.
 * Falls back to SafeLogOtpSenderAdapter for SMS messages.
 */
export class SmtpEmailOtpSenderAdapter implements OtpSenderAdapter {
  private readonly fallback: SafeLogOtpSenderAdapter;

  constructor(
    private readonly smtp: SmtpOtpOptions,
    private readonly logger: Logger,
  ) {
    this.fallback = new SafeLogOtpSenderAdapter(logger);
  }

  async sendOtp(message: OtpDeliveryMessage): Promise<void> {
    if (message.channel !== 'email') {
      await this.fallback.sendOtp(message);
      return;
    }

    const fromHeader = stripCrlf(this.smtp.from);
    const fromEnvelope = extractEnvelopeAddress(fromHeader);
    const toEnvelope = extractEnvelopeAddress(message.destination);
    const subject =
      message.purpose === 'recovery'
        ? 'BHOJORA Account Recovery Code'
        : message.purpose === 'mfa'
          ? 'BHOJORA Security Verification Code'
          : 'BHOJORA Verification Code';

    let socket: net.Socket | tls.TLSSocket = this.smtp.secure
      ? tls.connect({
          host: this.smtp.host,
          port: this.smtp.port,
          servername: this.smtp.host,
          rejectUnauthorized: this.smtp.rejectUnauthorized ?? true,
        })
      : net.connect({ host: this.smtp.host, port: this.smtp.port });

    socket.setTimeout(10_000);
    const getSocket = () => socket;

    try {
      const greeting = await readSmtpResponse(getSocket);
      if (greeting.code !== 220) {
        throw new Error(`Unexpected SMTP greeting (${greeting.code})`);
      }

      let ehlo = await sendSmtpCommand(getSocket, `EHLO ${stripCrlf(this.smtp.ehloHost)}`, [250]);
      if (!this.smtp.secure && /\bSTARTTLS\b/i.test(ehlo.lines)) {
        await sendSmtpCommand(getSocket, 'STARTTLS', [220]);
        socket = await new Promise<tls.TLSSocket>((resolve, reject) => {
          const upgraded = tls.connect(
            {
              socket,
              servername: this.smtp.host,
              rejectUnauthorized: this.smtp.rejectUnauthorized ?? true,
            },
            () => resolve(upgraded),
          );
          upgraded.once('error', reject);
        });
        socket.setTimeout(10_000);
        ehlo = await sendSmtpCommand(getSocket, `EHLO ${stripCrlf(this.smtp.ehloHost)}`, [250]);
      }

      if (this.smtp.user && this.smtp.pass) {
        const authToken = Buffer.from(`\0${this.smtp.user}\0${this.smtp.pass}`, 'utf8').toString(
          'base64',
        );
        await sendSmtpCommand(getSocket, `AUTH PLAIN ${authToken}`, [235]);
      }

      await sendSmtpCommand(getSocket, `MAIL FROM:<${fromEnvelope}>`, [250]);
      await sendSmtpCommand(getSocket, `RCPT TO:<${toEnvelope}>`, [250, 251]);
      await sendSmtpCommand(getSocket, 'DATA', [354]);

      const mimePayload = [
        `From: ${fromHeader}`,
        `To: <${toEnvelope}>`,
        `Subject: ${stripCrlf(subject)}`,
        `Date: ${new Date().toUTCString()}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        '',
        dotStuffBody(message.bodyText),
        '.',
      ].join('\r\n');

      await sendSmtpCommand(getSocket, mimePayload, [250]);
      await sendSmtpCommand(getSocket, 'QUIT', [221, 250]).catch(() => undefined);

      await this.fallback.sendOtp(message);
    } finally {
      socket.destroy();
    }
  }
}

export function createDefaultOtpSenderAdapter(
  config: Pick<
    AppConfig,
    'smtpHost' | 'smtpPort' | 'smtpSecure' | 'smtpUser' | 'smtpPass' | 'smtpFrom' | 'appOriginHost'
  >,
  logger: Logger,
): OtpSenderAdapter {
  if (!config.smtpHost) {
    return new SafeLogOtpSenderAdapter(logger);
  }
  const port = config.smtpPort ?? 587;
  return new SmtpEmailOtpSenderAdapter(
    {
      host: config.smtpHost,
      port,
      secure: config.smtpSecure ?? port === 465,
      ...(config.smtpUser ? { user: config.smtpUser } : {}),
      ...(config.smtpPass ? { pass: config.smtpPass } : {}),
      from: config.smtpFrom ?? 'no-reply@bhojora.in',
      ehloHost: config.appOriginHost,
    },
    logger,
  );
}
