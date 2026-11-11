import express, { type Express } from 'express';
import type { AppConfig } from './config/env-types';
import { createLogger, type Logger } from './config/logger';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler';
import { createRequestContextMiddleware } from './middleware/request-context';
import { createCorsMiddleware, createSecurityHeadersMiddleware } from './middleware/security';
import { createHealthRouter } from './modules/health/health.routes';
import { createHealthService, type ReadinessProbe } from './modules/health/health.service';

export interface CreateAppOptions {
  config: AppConfig;
  logger?: Logger;
  readinessProbes?: readonly ReadinessProbe[];
  getIsShuttingDown?: () => boolean;
}

export function createApp(options: CreateAppOptions): Express {
  const { config } = options;
  const logger =
    options.logger ??
    createLogger({
      level: config.logLevel,
      service: config.serviceName,
      environment: config.nodeEnv,
      includeStack: config.nodeEnv !== 'production',
    });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(createRequestContextMiddleware(logger));
  app.use(createSecurityHeadersMiddleware(config.nodeEnv === 'production'));
  app.use(createCorsMiddleware(config.corsAllowedOrigins));
  app.use(express.json({ limit: '100kb' }));

  const healthService = createHealthService({
    config,
    getIsShuttingDown: options.getIsShuttingDown,
    probes: options.readinessProbes,
  });
  const healthRouter = createHealthRouter(healthService);

  app.use('/api/v1', healthRouter);
  app.use(healthRouter);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
