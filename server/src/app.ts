import express, { type Express } from 'express';
import mongoose from 'mongoose';
import type { AppConfig } from './config/env-types';
import { createLogger, type Logger } from './config/logger';
import { createErrorHandler, notFoundHandler } from './middleware/error-handler';
import { createRequestContextMiddleware } from './middleware/request-context';
import { createCorsMiddleware, createSecurityHeadersMiddleware } from './middleware/security';
import { createHealthRouter } from './modules/health/health.routes';
import { createHealthService, type ReadinessProbe } from './modules/health/health.service';
import { MongooseIdentityStore } from './modules/identity/identity.models';
import { createIdentityRouter } from './modules/identity/identity.routes';
import { IdentityService } from './modules/identity/identity.service';
import type { IdentityStore } from './modules/identity/identity.types';
import { SafeLogOtpSenderAdapter } from './modules/identity/otp.adapter';
import { createCustomerRouter } from './modules/customer/customer.routes';
import { CustomerService } from './modules/customer/customer.service';
import { MongooseCustomerStore } from './modules/customer/customer.store';
import type { CustomerStore } from './modules/customer/customer.types';
import { createRbacRouter } from './modules/rbac/rbac.routes';
import { MongooseRbacStore, type RbacStore } from './modules/rbac/rbac.store';
import { createRestaurantRouter } from './modules/restaurant/restaurant.routes';
import { RestaurantService } from './modules/restaurant/restaurant.service';
import { MongooseRestaurantStore } from './modules/restaurant/restaurant.store';
import type { RestaurantStore } from './modules/restaurant/restaurant.types';

export interface CreateAppOptions {
  config: AppConfig;
  logger?: Logger;
  readinessProbes?: readonly ReadinessProbe[];
  getIsShuttingDown?: () => boolean;
  identityService?: IdentityService;
  identityStore?: IdentityStore;
  rbacStore?: RbacStore;
  customerStore?: CustomerStore;
  customerService?: CustomerService;
  restaurantStore?: RestaurantStore;
  restaurantService?: RestaurantService;
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

  const fallbackIdentityStore =
    options.identityStore ?? new MongooseIdentityStore(mongoose.connection);
  const identityService =
    options.identityService ??
    new IdentityService({
      config,
      store: fallbackIdentityStore,
      otpAdapter: new SafeLogOtpSenderAdapter(logger),
      logger,
    });
  const identityStore = options.identityStore ?? identityService.getStore();
  const rbacStore = options.rbacStore ?? new MongooseRbacStore(mongoose.connection);
  const customerStore = options.customerStore ?? new MongooseCustomerStore(mongoose.connection);
  const customerService =
    options.customerService ??
    new CustomerService({
      identityStore,
      customerStore,
      rbacStore,
      logger,
    });
  const restaurantStore =
    options.restaurantStore ?? new MongooseRestaurantStore(mongoose.connection);
  const restaurantService =
    options.restaurantService ??
    new RestaurantService({
      restaurantStore,
      identityStore,
      rbacStore,
      signingSecret: config.jwtAccessSecret,
      logger,
    });
  const identityRouter = createIdentityRouter(identityService, config);
  const rbacRouter = createRbacRouter({
    identityService,
    identityStore,
    rbacStore,
    config,
  });
  const customerRouter = createCustomerRouter({
    identityService,
    customerService,
    rbacStore,
    config,
  });
  const restaurantRouter = createRestaurantRouter({
    identityService,
    restaurantService,
    rbacStore,
    config,
  });

  app.use('/api/v1', healthRouter);
  app.use('/api/v1', identityRouter);
  app.use('/api/v1', rbacRouter);
  app.use('/api/v1', customerRouter);
  app.use('/api/v1', restaurantRouter);
  app.use(healthRouter);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
