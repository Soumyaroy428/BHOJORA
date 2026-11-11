import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createApp } from './app';
import { ConfigValidationError, validateEnv } from './config/env';
import { createLogger } from './config/logger';

export const SERVER_BASELINE = {
  service: 'bhojora-api',
  checkpoint: '05',
  runtime: 'node-22-lts',
  currency: 'INR',
  currencyUnit: 'paise',
  timezone: 'Asia/Kolkata',
} as const;

export { createApp, validateEnv, ConfigValidationError, createLogger };

function loadLocalEnvIfPresent(): void {
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

function startServer(): void {
  loadLocalEnvIfPresent();

  let config;
  try {
    config = validateEnv(process.env, {
      serviceName: SERVER_BASELINE.service,
      serviceVersion: '0.1.0',
    });
  } catch (error) {
    const bootstrapLogger = createLogger({
      level: 'error',
      service: SERVER_BASELINE.service,
      environment: process.env['NODE_ENV'] ?? 'unknown',
      includeStack: false,
    });
    if (error instanceof ConfigValidationError) {
      bootstrapLogger.error('server.config.invalid', { issues: error.issues });
    } else {
      bootstrapLogger.error('server.config.unexpected_error', { error });
    }
    process.exit(1);
  }

  let shuttingDown = false;
  const logger = createLogger({
    level: config.logLevel,
    service: config.serviceName,
    environment: config.nodeEnv,
    includeStack: config.nodeEnv !== 'production',
  });

  const app = createApp({
    config,
    logger,
    getIsShuttingDown: () => shuttingDown,
  });

  const server = http.createServer(app);
  server.listen(config.port, config.host, () => {
    logger.info('server.listening', {
      host: config.host,
      port: config.port,
      timezone: config.appTimezone,
      cityCode: config.defaultCityCode,
      currency: config.defaultCurrency,
    });
  });

  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.warn('server.shutdown.initiated', { signal });

    const forceTimer = setTimeout(() => {
      logger.error('server.shutdown.forced_timeout', { timeoutMs: config.shutdownTimeoutMs });
      process.exit(1);
    }, config.shutdownTimeoutMs);
    forceTimer.unref();

    server.close((err) => {
      clearTimeout(forceTimer);
      if (err) {
        logger.error('server.shutdown.error', { error: err });
        process.exit(1);
      }
      logger.info('server.shutdown.completed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  startServer();
}
