import http from 'node:http';
import { createApp } from './app';
import { ConfigValidationError, loadLocalEnvIfPresent, validateEnv } from './config/env';
import { createLogger } from './config/logger';
import {
  createDatabaseManager,
  DatabaseConnectionError,
  sanitizeMongoUri,
} from './database/connection';
import { applyInitialIndexes } from './database/indexes';
import { runSeed } from './database/seed';
import { CustomerService } from './modules/customer/customer.service';
import { MongooseCustomerStore } from './modules/customer/customer.store';
import { MongooseIdentityStore } from './modules/identity/identity.models';
import { IdentityService } from './modules/identity/identity.service';
import { SafeLogOtpSenderAdapter } from './modules/identity/otp.adapter';
import { MongooseRbacStore } from './modules/rbac/rbac.store';
import { OutletService } from './modules/outlet/outlet.service';
import { InMemoryOutletStore, MongooseOutletStore } from './modules/outlet/outlet.store';
import { RestaurantService } from './modules/restaurant/restaurant.service';
import { MongooseRestaurantStore } from './modules/restaurant/restaurant.store';
import { CatalogService } from './modules/catalog/catalog.service';
import { InMemoryCatalogStore, MongooseCatalogStore } from './modules/catalog/catalog.store';
import { DiscoveryService, buildDiscoveryTrustBadge } from './modules/discovery/discovery.service';
import { CartService } from './modules/cart/cart.service';
import { InMemoryCartStore, MongooseCartStore } from './modules/cart/cart.store';
import { PricingService } from './modules/pricing/pricing.service';
import { InMemoryPricingStore, MongoosePricingStore } from './modules/pricing/pricing.store';
import {
  computeServerPricingBreakdown,
  signQuotePayload,
  verifyQuoteSignature,
} from './modules/pricing/pricing.math';
import {
  SandboxPaymentGatewayAdapter,
  buildCanonicalWebhookSignPayload,
  signSandboxWebhook,
  verifySandboxWebhookSignature,
} from './modules/payments/payments.adapter';
import { PaymentService } from './modules/payments/payments.service';
import { InMemoryPaymentStore, MongoosePaymentStore } from './modules/payments/payments.store';
import { evaluateCancellationEligibility, OrderService } from './modules/orders/orders.service';
import { InMemoryOrderStore, MongooseOrderStore } from './modules/orders/orders.store';

export const SERVER_BASELINE = {
  service: 'bhojora-api',
  checkpoint: '16',
  runtime: 'node-22-lts',
  currency: 'INR',
  currencyUnit: 'paise',
  timezone: 'Asia/Kolkata',
} as const;

export {
  createApp,
  validateEnv,
  ConfigValidationError,
  createLogger,
  createDatabaseManager,
  DatabaseConnectionError,
  sanitizeMongoUri,
  applyInitialIndexes,
  runSeed,
  IdentityService,
  MongooseIdentityStore,
  MongooseRbacStore,
  CustomerService,
  MongooseCustomerStore,
  RestaurantService,
  MongooseRestaurantStore,
  OutletService,
  MongooseOutletStore,
  InMemoryOutletStore,
  CatalogService,
  MongooseCatalogStore,
  InMemoryCatalogStore,
  DiscoveryService,
  buildDiscoveryTrustBadge,
  CartService,
  MongooseCartStore,
  InMemoryCartStore,
  PricingService,
  MongoosePricingStore,
  InMemoryPricingStore,
  computeServerPricingBreakdown,
  signQuotePayload,
  verifyQuoteSignature,
  PaymentService,
  MongoosePaymentStore,
  InMemoryPaymentStore,
  SandboxPaymentGatewayAdapter,
  buildCanonicalWebhookSignPayload,
  signSandboxWebhook,
  verifySandboxWebhookSignature,
  OrderService,
  MongooseOrderStore,
  InMemoryOrderStore,
  evaluateCancellationEligibility,
  SafeLogOtpSenderAdapter,
};

async function startServer(): Promise<void> {
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

  const dbManager = createDatabaseManager({ config, logger });
  try {
    await dbManager.connect();
  } catch (error) {
    if (error instanceof DatabaseConnectionError) {
      logger.error('server.database.startup_failed', { uri: error.sanitizedUri });
    } else {
      logger.error('server.database.unexpected_error', { error });
    }
    process.exit(1);
  }

  const mongoConnection = dbManager.getConnection();
  const identityStore = new MongooseIdentityStore(mongoConnection);
  const rbacStore = new MongooseRbacStore(mongoConnection);
  const customerStore = new MongooseCustomerStore(mongoConnection);
  const restaurantStore = new MongooseRestaurantStore(mongoConnection);
  const outletStore = new MongooseOutletStore(mongoConnection);
  const catalogStore = new MongooseCatalogStore(mongoConnection);
  const cartStore = new MongooseCartStore(mongoConnection);
  const pricingStore = new MongoosePricingStore(mongoConnection);
  const paymentStore = new MongoosePaymentStore(mongoConnection);
  const orderStore = new MongooseOrderStore(mongoConnection);

  const identityService = new IdentityService({
    config,
    store: identityStore,
    otpAdapter: new SafeLogOtpSenderAdapter(logger),
    logger,
  });

  const customerService = new CustomerService({
    identityStore,
    customerStore,
    rbacStore,
    logger,
  });

  const restaurantService = new RestaurantService({
    restaurantStore,
    identityStore,
    rbacStore,
    signingSecret: config.jwtAccessSecret,
    logger,
  });

  const outletService = new OutletService({
    restaurantStore,
    outletStore,
    rbacStore,
    logger,
  });

  const catalogService = new CatalogService({
    catalogStore,
    restaurantStore,
    rbacStore,
    logger,
  });

  const cartService = new CartService({
    cartStore,
    restaurantStore,
    catalogStore,
    logger,
  });

  const pricingService = new PricingService({
    pricingStore,
    cartService,
    customerService,
    restaurantStore,
    outletService,
    catalogStore,
    signingSecret: config.jwtAccessSecret,
    logger,
  });

  const paymentGatewayAdapter = new SandboxPaymentGatewayAdapter();
  const paymentService = new PaymentService({
    paymentStore,
    pricingService,
    gatewayAdapter: paymentGatewayAdapter,
    rbacStore,
    webhookSecret: config.paymentWebhookSecret,
    webhookReplayWindowSeconds: config.webhookReplayWindowSeconds,
    logger,
  });

  const orderService = new OrderService({
    orderStore,
    pricingService,
    cartService,
    restaurantStore,
    paymentStore,
    rbacStore,
    logger,
  });

  paymentService.setOnPaymentCapturedListener(async (payment) => {
    await orderService.confirmOrderFromPayment(payment);
  });
  paymentService.setCanPayConsumedQuote(async (customerId, quoteId) => {
    const existingOrder = await orderStore.getOrderByQuoteId(quoteId);
    return (
      existingOrder !== null &&
      existingOrder.customerId === customerId &&
      existingOrder.status === 'AWAITING_PAYMENT'
    );
  });

  const app = createApp({
    config,
    logger,
    readinessProbes: [dbManager.getReadinessProbe()],
    getIsShuttingDown: () => shuttingDown,
    identityService,
    identityStore,
    rbacStore,
    customerStore,
    customerService,
    restaurantStore,
    restaurantService,
    outletStore,
    outletService,
    catalogStore,
    catalogService,
    cartStore,
    cartService,
    pricingStore,
    pricingService,
    paymentStore,
    paymentService,
    paymentGatewayAdapter,
    orderStore,
    orderService,
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
      void (async () => {
        await dbManager.disconnect();
        clearTimeout(forceTimer);
        if (err) {
          logger.error('server.shutdown.error', { error: err });
          process.exit(1);
        }
        logger.info('server.shutdown.completed');
        process.exit(0);
      })();
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  void startServer();
}
