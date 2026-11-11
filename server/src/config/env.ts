import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { AppConfig, LogLevel, NodeEnvironment } from './env-types';

export function loadLocalEnvIfPresent(): void {
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
  ];
  const loadEnvFile = (process as unknown as { loadEnvFile?: (filePath: string) => void })
    .loadEnvFile;
  if (typeof loadEnvFile !== 'function') {
    return;
  }
  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      loadEnvFile(envPath);
      return;
    }
  }
}

export interface ConfigIssue {
  field: string;
  issue: string;
}

/**
 * Typed startup failure thrown when environment variables fail schema or security validation.
 * Never embeds raw environment values or secrets inside error properties.
 */
export class ConfigValidationError extends Error {
  public readonly issues: readonly ConfigIssue[];

  constructor(issues: readonly ConfigIssue[]) {
    const summary = issues.map((item) => `${item.field}: ${item.issue}`).join('; ');
    super(`Invalid BHOJORA server configuration (${summary})`);
    this.name = 'ConfigValidationError';
    this.issues = issues;
  }
}

const KNOWN_PLACEHOLDER_PREFIXES = ['replace-with-', 'changeme', 'example-', 'dev-only-'];

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone });
    return true;
  } catch {
    return false;
  }
}

function parseCorsOrigins(raw: string | undefined, nodeEnv: NodeEnvironment): string[] | null {
  if (raw === undefined || raw.trim() === '') {
    return nodeEnv === 'production' ? null : ['http://localhost:3000'];
  }

  const parsed: string[] = [];
  for (const entry of raw.split(',')) {
    const candidate = entry.trim();
    if (candidate === '' || candidate === '*') {
      return null;
    }
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
      }
      parsed.push(url.origin);
    } catch {
      return null;
    }
  }

  return parsed.length > 0 ? parsed : null;
}

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().trim().min(1).default('0.0.0.0'),
  APP_TIMEZONE: z
    .string()
    .trim()
    .min(1)
    .default('Asia/Kolkata')
    .refine(isValidTimeZone, { message: 'Must be a valid IANA timezone identifier' }),
  DEFAULT_CITY_CODE: z
    .string()
    .trim()
    .min(2)
    .max(32)
    .regex(/^[A-Z0-9_-]+$/, 'Must be uppercase alphanumeric code')
    .default('KOLKATA'),
  DEFAULT_CURRENCY: z.literal('INR').default('INR'),
  MONGODB_URI: z
    .string()
    .trim()
    .min(1, 'MONGODB_URI is required')
    .refine((uri) => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'), {
      message: 'Must start with mongodb:// or mongodb+srv://',
    }),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().min(1).max(100).default(10),
  MONGODB_AUTO_INDEX: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  REDIS_URL: z
    .string()
    .trim()
    .min(1, 'REDIS_URL is required')
    .refine((uri) => uri.startsWith('redis://') || uri.startsWith('rediss://'), {
      message: 'Must start with redis:// or rediss://',
    }),
  JWT_ACCESS_SECRET: z.string().min(32, 'Must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'Must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().min(300).max(31536000).default(2592000),
  OTP_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(300),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(10).max(600).default(60),
  OTP_MAX_SEND_PER_WINDOW: z.coerce.number().int().min(1).max(20).default(3),
  OTP_WINDOW_SECONDS: z.coerce.number().int().min(60).max(86400).default(600),
  OTP_BLOCK_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  OTP_MAX_VERIFY_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  LOGIN_MAX_FAILURES: z.coerce.number().int().min(1).max(20).default(5),
  LOGIN_LOCKOUT_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  RECOVERY_TTL_SECONDS: z.coerce.number().int().min(60).max(7200).default(900),
  AUTH_COOKIE_SECURE: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === 'true')),
  APP_ORIGIN_HOST: z
    .string()
    .trim()
    .min(3)
    .max(253)
    .regex(/^[a-zA-Z0-9.-]+$/, 'Must be a bare hostname without protocol, port, or path')
    .default('bhojora.vercel.app'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(10000),
});

export interface ParseConfigMeta {
  serviceName?: string;
  serviceVersion?: string;
}

export function validateEnv(
  rawEnv: Record<string, string | undefined> = process.env,
  meta: ParseConfigMeta = {},
): AppConfig {
  const result = rawEnvSchema.safeParse(rawEnv);
  const issues: ConfigIssue[] = [];

  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path.length > 0 ? issue.path.join('.') : 'env';
      issues.push({ field, issue: issue.message });
    }
    throw new ConfigValidationError(issues);
  }

  const data = result.data;

  if (data.JWT_ACCESS_SECRET === data.JWT_REFRESH_SECRET) {
    issues.push({
      field: 'JWT_REFRESH_SECRET',
      issue: 'JWT_REFRESH_SECRET must be distinct from JWT_ACCESS_SECRET',
    });
  }

  if (data.NODE_ENV === 'production') {
    for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      const secretLower = data[key].toLowerCase();
      if (KNOWN_PLACEHOLDER_PREFIXES.some((prefix) => secretLower.startsWith(prefix))) {
        issues.push({
          field: key,
          issue: 'Placeholder secret values are forbidden in production',
        });
      } else if (new Set(data[key]).size < 8) {
        issues.push({
          field: key,
          issue: 'Production secrets must contain at least 8 distinct characters',
        });
      }
    }
  }

  const corsAllowedOrigins = parseCorsOrigins(data.CORS_ALLOWED_ORIGINS, data.NODE_ENV);
  if (corsAllowedOrigins === null) {
    issues.push({
      field: 'CORS_ALLOWED_ORIGINS',
      issue:
        data.NODE_ENV === 'production'
          ? 'Must contain one or more explicit http/https origins in production (wildcards forbidden)'
          : 'Entries must be explicit comma-separated http/https URLs without wildcards',
    });
  }

  if (issues.length > 0 || corsAllowedOrigins === null) {
    throw new ConfigValidationError(issues);
  }

  return Object.freeze({
    nodeEnv: data.NODE_ENV as NodeEnvironment,
    port: data.PORT,
    host: data.HOST,
    serviceName: meta.serviceName ?? 'bhojora-api',
    serviceVersion: meta.serviceVersion ?? '0.1.0',
    appTimezone: data.APP_TIMEZONE,
    defaultCityCode: data.DEFAULT_CITY_CODE,
    defaultCurrency: data.DEFAULT_CURRENCY,
    mongodbUri: data.MONGODB_URI,
    mongodbServerSelectionTimeoutMs: data.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    mongodbConnectTimeoutMs: data.MONGODB_CONNECT_TIMEOUT_MS,
    mongodbMaxPoolSize: data.MONGODB_MAX_POOL_SIZE,
    mongodbAutoIndex: data.MONGODB_AUTO_INDEX ?? data.NODE_ENV !== 'production',
    redisUrl: data.REDIS_URL,
    jwtAccessSecret: data.JWT_ACCESS_SECRET,
    jwtRefreshSecret: data.JWT_REFRESH_SECRET,
    jwtAccessTtlSeconds: data.JWT_ACCESS_TTL_SECONDS,
    jwtRefreshTtlSeconds: data.JWT_REFRESH_TTL_SECONDS,
    otpTtlSeconds: data.OTP_TTL_SECONDS,
    otpResendCooldownSeconds: data.OTP_RESEND_COOLDOWN_SECONDS,
    otpMaxSendPerWindow: data.OTP_MAX_SEND_PER_WINDOW,
    otpWindowSeconds: data.OTP_WINDOW_SECONDS,
    otpBlockSeconds: data.OTP_BLOCK_SECONDS,
    otpMaxVerifyAttempts: data.OTP_MAX_VERIFY_ATTEMPTS,
    loginMaxFailures: data.LOGIN_MAX_FAILURES,
    loginLockoutSeconds: data.LOGIN_LOCKOUT_SECONDS,
    recoveryTtlSeconds: data.RECOVERY_TTL_SECONDS,
    authCookieSecure: data.AUTH_COOKIE_SECURE ?? data.NODE_ENV === 'production',
    appOriginHost: data.APP_ORIGIN_HOST,
    corsAllowedOrigins: Object.freeze(corsAllowedOrigins),
    logLevel: data.LOG_LEVEL as LogLevel,
    shutdownTimeoutMs: data.SHUTDOWN_TIMEOUT_MS,
  });
}
