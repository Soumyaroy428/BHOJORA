import type { LogLevel } from './env-types';

export type { LogLevel };

export interface LogContext {
  requestId?: string;
  [key: string]: unknown;
}

export interface LogEntry extends LogContext {
  timestamp: string;
  level: LogLevel;
  service: string;
  environment: string;
  message: string;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}

export interface CreateLoggerOptions {
  level?: LogLevel;
  service?: string;
  environment?: string;
  includeStack?: boolean;
  writeStdout?: (line: string) => void;
  writeStderr?: (line: string) => void;
}

const LOG_LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const SENSITIVE_KEY_TOKENS = new Set([
  'password',
  'passwd',
  'pass',
  'secret',
  'token',
  'otp',
  'pin',
  'authorization',
  'cookie',
  'apikey',
  'jwt',
  'credential',
  'credentials',
  'privatekey',
  'phone',
  'mobile',
  'email',
  'address',
  'aadhar',
  'aadhaar',
  'pan',
  'bank',
  'card',
  'cvv',
  'key',
]);

const SENSITIVE_SUBSTRINGS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'api_key',
  'credential',
  'privatekey',
  'private_key',
  'aadhar',
  'aadhaar',
  'mongodburi',
  'mongodb_uri',
  'redisurl',
  'redis_url',
  'connectionstring',
];

function isSensitiveKey(key: string): boolean {
  const normalized = key.toLowerCase();
  if (SENSITIVE_SUBSTRINGS.some((fragment) => normalized.includes(fragment))) {
    return true;
  }
  const tokens = key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  return tokens.some((token) => SENSITIVE_KEY_TOKENS.has(token));
}

function scrubConnectionCredentials(value: string): string {
  return value.replace(
    /([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/gi,
    '$1[REDACTED]:[REDACTED]@',
  );
}

export function sanitizeLogValue(
  value: unknown,
  includeStack: boolean,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    return scrubConnectionCredentials(value);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'symbol' || typeof value === 'function') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    const serializedError: Record<string, unknown> = {
      name: value.name,
      message: scrubConnectionCredentials(value.message),
    };
    if (includeStack && value.stack) {
      serializedError.stack = scrubConnectionCredentials(value.stack);
    }
    return serializedError;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map((item) => sanitizeLogValue(item, includeStack, seen));
    }

    const sanitizedObject: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        sanitizedObject[key] = '[REDACTED]';
      } else {
        sanitizedObject[key] = sanitizeLogValue(entryValue, includeStack, seen);
      }
    }
    return sanitizedObject;
  }

  return String(value);
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? 'info';
  const service = options.service ?? 'bhojora-api';
  const environment = options.environment ?? 'development';
  const includeStack = options.includeStack ?? environment !== 'production';
  const writeStdout = options.writeStdout ?? ((line: string) => process.stdout.write(`${line}\n`));
  const writeStderr = options.writeStderr ?? ((line: string) => process.stderr.write(`${line}\n`));

  const buildLogger = (baseContext: LogContext): Logger => {
    const emit = (entryLevel: LogLevel, message: string, context?: LogContext): void => {
      if (LOG_LEVEL_WEIGHT[entryLevel] < LOG_LEVEL_WEIGHT[level]) {
        return;
      }

      const merged = { ...baseContext, ...context };
      const sanitizedContext = sanitizeLogValue(merged, includeStack) as Record<string, unknown>;

      const payload: LogEntry = {
        ...sanitizedContext,
        timestamp: new Date().toISOString(),
        level: entryLevel,
        service,
        environment,
        message: scrubConnectionCredentials(message),
      };

      const serialized = JSON.stringify(payload);
      if (entryLevel === 'error' || entryLevel === 'warn') {
        writeStderr(serialized);
      } else {
        writeStdout(serialized);
      }
    };

    return {
      debug: (message, context) => emit('debug', message, context),
      info: (message, context) => emit('info', message, context),
      warn: (message, context) => emit('warn', message, context),
      error: (message, context) => emit('error', message, context),
      child: (bindings) => buildLogger({ ...baseContext, ...bindings }),
    };
  };

  return buildLogger({});
}
