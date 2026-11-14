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
import type { Clock, IdentityStore } from './modules/identity/identity.types';
import { SafeLogOtpSenderAdapter } from './modules/identity/otp.adapter';
import { createCustomerRouter } from './modules/customer/customer.routes';
import { CustomerService } from './modules/customer/customer.service';
import { MongooseCustomerStore } from './modules/customer/customer.store';
import type { CustomerStore } from './modules/customer/customer.types';
import { createRbacRouter } from './modules/rbac/rbac.routes';
import { MongooseRbacStore, type RbacStore } from './modules/rbac/rbac.store';
import { createOutletRouter } from './modules/outlet/outlet.routes';
import { OutletService } from './modules/outlet/outlet.service';
import { InMemoryOutletStore, MongooseOutletStore } from './modules/outlet/outlet.store';
import type { OutletStore } from './modules/outlet/outlet.types';
import { createRestaurantRouter } from './modules/restaurant/restaurant.routes';
import { RestaurantService } from './modules/restaurant/restaurant.service';
import {
  InMemoryRestaurantStore,
  MongooseRestaurantStore,
} from './modules/restaurant/restaurant.store';
import type { RestaurantStore } from './modules/restaurant/restaurant.types';
import { createCatalogRouter } from './modules/catalog/catalog.routes';
import { CatalogService } from './modules/catalog/catalog.service';
import { InMemoryCatalogStore, MongooseCatalogStore } from './modules/catalog/catalog.store';
import type { CatalogStore } from './modules/catalog/catalog.types';
import { createDiscoveryRouter } from './modules/discovery/discovery.routes';
import { DiscoveryService } from './modules/discovery/discovery.service';
import type { DiscoveryRateLimitOptions } from './modules/discovery/discovery.types';
import { createCartRouter } from './modules/cart/cart.routes';
import { CartService } from './modules/cart/cart.service';
import { InMemoryCartStore, MongooseCartStore } from './modules/cart/cart.store';
import type { CartStore } from './modules/cart/cart.types';
import { createPricingRouter } from './modules/pricing/pricing.routes';
import { PricingService } from './modules/pricing/pricing.service';
import { InMemoryPricingStore, MongoosePricingStore } from './modules/pricing/pricing.store';
import type { PricingStore } from './modules/pricing/pricing.types';
import { SandboxPaymentGatewayAdapter } from './modules/payments/payments.adapter';
import { createPaymentsRouter } from './modules/payments/payments.routes';
import { PaymentService } from './modules/payments/payments.service';
import { InMemoryPaymentStore, MongoosePaymentStore } from './modules/payments/payments.store';
import type { PaymentStore } from './modules/payments/payments.types';
import { createOrdersRouter } from './modules/orders/orders.routes';
import { OrderService } from './modules/orders/orders.service';
import { InMemoryOrderStore, MongooseOrderStore } from './modules/orders/orders.store';
import type { OrderStore } from './modules/orders/orders.types';
import { createDeliveryRouter } from './modules/delivery/delivery.routes';
import { DeliveryService } from './modules/delivery/delivery.service';
import { InMemoryDeliveryStore, MongooseDeliveryStore } from './modules/delivery/delivery.store';
import type { DeliveryStore } from './modules/delivery/delivery.store';
import { createInspectorRouter } from './modules/inspector/inspector.routes';
import { InspectorService } from './modules/inspector/inspector.service';
import {
  InMemoryInspectorStore,
  MongooseInspectorStore,
} from './modules/inspector/inspector.store';
import type { InspectorStore } from './modules/inspector/inspector.store';
import { createInspectionRouter } from './modules/inspection/inspection.routes';
import { InspectionService } from './modules/inspection/inspection.service';
import {
  InMemoryInspectionStore,
  MongooseInspectionStore,
} from './modules/inspection/inspection.store';
import type { InspectionStore } from './modules/inspection/inspection.store';
import { createSafetyRouter } from './modules/safety/safety.routes';
import { SafetyService } from './modules/safety/safety.service';
import { createSupportRouter } from './modules/support/support.routes';
import { SupportService } from './modules/support/support.service';
import { InMemorySupportStore, MongooseSupportStore } from './modules/support/support.store';
import type { SupportStore } from './modules/support/support.store';
import { createFinanceRouter } from './modules/finance/finance.routes';
import { FinanceService } from './modules/finance/finance.service';
import { InMemoryFinanceStore, MongooseFinanceStore } from './modules/finance/finance.store';
import type { FinanceStore } from './modules/finance/finance.store';
import { createGovernanceRouter } from './modules/governance/governance.routes';
import { GovernanceService } from './modules/governance/governance.service';
import {
  InMemoryGovernanceStore,
  MongooseGovernanceStore,
} from './modules/governance/governance.store';
import type { GovernanceStore } from './modules/governance/governance.store';
import {
  InMemorySmsAdapter,
  InMemoryEmailAdapter,
  InMemoryPushAdapter,
  type SmsAdapter,
  type EmailAdapter,
  type PushAdapter,
} from './modules/notifications/notifications.adapters';
import { createNotificationRouter } from './modules/notifications/notifications.routes';
import { NotificationService } from './modules/notifications/notifications.service';
import {
  InMemoryNotificationStore,
  MongooseNotificationStore,
  type NotificationStore,
} from './modules/notifications/notifications.store';
import { createPromotionsRouter } from './modules/promotions/promotions.routes';
import { PromotionsService } from './modules/promotions/promotions.service';
import {
  InMemoryPromotionsStore,
  MongoosePromotionsStore,
  type PromotionsStore,
} from './modules/promotions/promotions.store';
import { createAnalyticsRouter } from './modules/analytics/analytics.routes';
import { AnalyticsService } from './modules/analytics/analytics.service';
import {
  InMemoryAnalyticsStore,
  MongooseAnalyticsStore,
  type AnalyticsStore,
} from './modules/analytics/analytics.store';
import { createAiRouter } from './modules/ai/ai.routes';
import { AiService } from './modules/ai/ai.service';
import { DeterministicAiAdapter, type AiProviderAdapter } from './modules/ai/ai.adapter';
import { InMemoryAiStore, MongooseAiStore, type AiStore } from './modules/ai/ai.store';
import { createIntegrationsRouter } from './modules/integrations/integrations.routes';
import { IntegrationsService } from './modules/integrations/integrations.service';

export interface CreateAppOptions {
  config: AppConfig;
  logger?: Logger;
  clock?: Clock;
  readinessProbes?: readonly ReadinessProbe[];
  getIsShuttingDown?: () => boolean;
  identityService?: IdentityService;
  identityStore?: IdentityStore;
  rbacStore?: RbacStore;
  customerStore?: CustomerStore;
  customerService?: CustomerService;
  restaurantStore?: RestaurantStore;
  restaurantService?: RestaurantService;
  outletStore?: OutletStore;
  outletService?: OutletService;
  catalogStore?: CatalogStore;
  catalogService?: CatalogService;
  discoveryService?: DiscoveryService;
  discoveryRateLimit?: DiscoveryRateLimitOptions;
  cartStore?: CartStore;
  cartService?: CartService;
  pricingStore?: PricingStore;
  pricingService?: PricingService;
  paymentStore?: PaymentStore;
  paymentService?: PaymentService;
  paymentGatewayAdapter?: SandboxPaymentGatewayAdapter;
  orderStore?: OrderStore;
  orderService?: OrderService;
  deliveryStore?: DeliveryStore;
  deliveryService?: DeliveryService;
  inspectorStore?: InspectorStore;
  inspectorService?: InspectorService;
  inspectionStore?: InspectionStore;
  inspectionService?: InspectionService;
  safetyService?: SafetyService;
  supportStore?: SupportStore;
  supportService?: SupportService;
  financeStore?: FinanceStore;
  financeService?: FinanceService;
  governanceStore?: GovernanceStore;
  governanceService?: GovernanceService;
  notificationStore?: NotificationStore;
  notificationService?: NotificationService;
  smsAdapter?: SmsAdapter;
  emailAdapter?: EmailAdapter;
  pushAdapter?: PushAdapter;
  promotionsStore?: PromotionsStore;
  promotionsService?: PromotionsService;
  analyticsStore?: AnalyticsStore;
  analyticsService?: AnalyticsService;
  aiStore?: AiStore;
  aiAdapter?: AiProviderAdapter;
  aiService?: AiService;
  integrationsService?: IntegrationsService;
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
  const isInMemoryMode = restaurantStore instanceof InMemoryRestaurantStore;
  const outletStore =
    options.outletStore ??
    (isInMemoryMode ? new InMemoryOutletStore() : new MongooseOutletStore(mongoose.connection));
  const outletService =
    options.outletService ??
    new OutletService({
      restaurantStore,
      outletStore,
      rbacStore,
      logger,
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const catalogStore =
    options.catalogStore ??
    (isInMemoryMode ? new InMemoryCatalogStore() : new MongooseCatalogStore(mongoose.connection));
  const catalogService =
    options.catalogService ??
    new CatalogService({
      catalogStore,
      restaurantStore,
      rbacStore,
      logger,
    });
  const discoveryService =
    options.discoveryService ??
    new DiscoveryService({
      restaurantStore,
      outletStore,
      outletService,
      catalogStore,
      logger,
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const cartStore =
    options.cartStore ??
    (isInMemoryMode ? new InMemoryCartStore() : new MongooseCartStore(mongoose.connection));
  const cartService =
    options.cartService ??
    new CartService({
      cartStore,
      restaurantStore,
      catalogStore,
      logger,
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const pricingStore =
    options.pricingStore ??
    (isInMemoryMode ? new InMemoryPricingStore() : new MongoosePricingStore(mongoose.connection));
  const pricingService =
    options.pricingService ??
    new PricingService({
      pricingStore,
      cartService,
      customerService,
      restaurantStore,
      outletService,
      catalogStore,
      signingSecret: config.jwtAccessSecret,
      logger,
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const paymentStore =
    options.paymentStore ??
    (isInMemoryMode ? new InMemoryPaymentStore() : new MongoosePaymentStore(mongoose.connection));
  const paymentService =
    options.paymentService ??
    new PaymentService({
      paymentStore,
      pricingService,
      gatewayAdapter: options.paymentGatewayAdapter ?? new SandboxPaymentGatewayAdapter(),
      rbacStore,
      webhookSecret: config.paymentWebhookSecret,
      webhookReplayWindowSeconds: config.webhookReplayWindowSeconds,
      logger,
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const orderStore =
    options.orderStore ??
    (isInMemoryMode ? new InMemoryOrderStore() : new MongooseOrderStore(mongoose.connection));
  const orderService =
    options.orderService ??
    new OrderService({
      orderStore,
      pricingService,
      cartService,
      restaurantStore,
      paymentStore,
      rbacStore,
      logger,
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const deliveryStore =
    options.deliveryStore ??
    (isInMemoryMode ? new InMemoryDeliveryStore() : new MongooseDeliveryStore(mongoose.connection));
  const deliveryService =
    options.deliveryService ??
    new DeliveryService({
      deliveryStore,
      identityStore,
      rbacStore,
      orderStore,
      signingSecret: config.jwtAccessSecret,
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const inspectorStore =
    options.inspectorStore ??
    (isInMemoryMode
      ? new InMemoryInspectorStore()
      : new MongooseInspectorStore(mongoose.connection));
  const inspectorService =
    options.inspectorService ??
    new InspectorService({
      inspectorStore,
      identityStore,
      rbacStore,
    });
  const inspectionStore =
    options.inspectionStore ??
    (isInMemoryMode
      ? new InMemoryInspectionStore()
      : new MongooseInspectionStore(mongoose.connection));
  const inspectionService =
    options.inspectionService ??
    new InspectionService({
      inspectionStore,
      inspectorService,
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
  const discoveryRouter = createDiscoveryRouter({
    discoveryService,
    rateLimit: options.discoveryRateLimit,
    clock: options.clock ?? outletService.getClock(),
  });
  const outletRouter = createOutletRouter({
    identityService,
    outletService,
    rbacStore,
    config,
  });
  const catalogRouter = createCatalogRouter({
    identityService,
    catalogService,
    rbacStore,
    config,
  });
  const cartRouter = createCartRouter({
    identityService,
    cartService,
    rbacStore,
    config,
  });
  const pricingRouter = createPricingRouter({
    identityService,
    pricingService,
    rbacStore,
    config,
  });
  const paymentsRouter = createPaymentsRouter({
    identityService,
    paymentService,
    rbacStore,
    config,
  });
  const ordersRouter = createOrdersRouter({
    identityService,
    orderService,
    rbacStore,
    config,
  });
  const deliveryRouter = createDeliveryRouter({
    identityService,
    identityStore,
    deliveryService,
    config,
  });
  const inspectorRouter = createInspectorRouter({
    identityService,
    inspectorService,
    config,
  });
  const inspectionRouter = createInspectionRouter({
    identityService,
    inspectorService,
    inspectionService,
    config,
  });
  const supportStore =
    options.supportStore ??
    (isInMemoryMode ? new InMemorySupportStore() : new MongooseSupportStore(mongoose.connection));
  const supportService =
    options.supportService ??
    new SupportService({
      supportStore,
      orderStore,
      restaurantStore,
      clock: options.clock ?? outletService.getClock(),
    });
  const supportRouter = createSupportRouter({
    identityService,
    supportService,
    config,
  });
  const safetyService =
    options.safetyService ??
    new SafetyService({
      restaurantStore,
      inspectionStore,
      signingSecret: config.jwtAccessSecret,
      hasActiveSafetyInvestigationFn: (outletId: string) =>
        supportService.hasActiveSafetyInvestigation(outletId),
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const safetyRouter = createSafetyRouter({ safetyService });
  const financeStore =
    options.financeStore ??
    (isInMemoryMode ? new InMemoryFinanceStore() : new MongooseFinanceStore(mongoose.connection));
  const financeService =
    options.financeService ??
    new FinanceService({
      financeStore,
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const financeRouter = createFinanceRouter({ identityService, financeService, config });
  const governanceStore =
    options.governanceStore ??
    (isInMemoryMode
      ? new InMemoryGovernanceStore()
      : new MongooseGovernanceStore(mongoose.connection));
  const governanceService =
    options.governanceService ??
    new GovernanceService({
      governanceStore,
      identityStore: fallbackIdentityStore,
      restaurantStore,
      deliveryStore,
      rbacStore,
      supportStore,
      inspectionStore,
      ...(options.clock ? { clock: options.clock } : {}),
    });
  const governanceRouter = createGovernanceRouter({
    identityService,
    governanceService,
    rbacStore,
    config,
  });

  const notificationStore =
    options.notificationStore ??
    (isInMemoryMode
      ? new InMemoryNotificationStore()
      : new MongooseNotificationStore(mongoose.connection));
  const smsAdapter = options.smsAdapter ?? new InMemorySmsAdapter();
  const emailAdapter = options.emailAdapter ?? new InMemoryEmailAdapter();
  const pushAdapter = options.pushAdapter ?? new InMemoryPushAdapter();
  const notificationService =
    options.notificationService ??
    new NotificationService({
      notificationStore,
      smsAdapter,
      emailAdapter,
      pushAdapter,
      ...(options.clock ? { clock: { now: () => options.clock!.now() } } : {}),
    });
  const notificationRouter = createNotificationRouter({
    identityService,
    notificationService,
    rbacStore,
    config,
  });

  const promotionsStore =
    options.promotionsStore ??
    (isInMemoryMode
      ? new InMemoryPromotionsStore()
      : new MongoosePromotionsStore(mongoose.connection));
  const promotionsService =
    options.promotionsService ??
    new PromotionsService({
      promotionsStore,
      ...(options.clock ? { clock: { now: () => options.clock!.now() } } : {}),
    });
  const promotionsRouter = createPromotionsRouter({
    identityService,
    promotionsService,
    rbacStore,
    config,
  });

  const analyticsStore =
    options.analyticsStore ??
    (isInMemoryMode
      ? new InMemoryAnalyticsStore()
      : new MongooseAnalyticsStore(mongoose.connection));
  const analyticsService =
    options.analyticsService ??
    new AnalyticsService({
      analyticsStore,
      ...(options.clock ? { clock: { now: () => options.clock!.now() } } : {}),
    });
  const analyticsRouter = createAnalyticsRouter({
    identityService,
    analyticsService,
    rbacStore,
    config,
  });

  const aiStore =
    options.aiStore ??
    (isInMemoryMode ? new InMemoryAiStore() : new MongooseAiStore(mongoose.connection));
  const aiAdapter = options.aiAdapter ?? new DeterministicAiAdapter();
  const aiService = options.aiService ?? new AiService(aiStore, aiAdapter);
  const aiRouter = createAiRouter({
    identityService,
    aiService,
    rbacStore,
    config,
  });

  const integrationsService = options.integrationsService ?? new IntegrationsService();
  const integrationsRouter = createIntegrationsRouter({
    identityService,
    integrationsService,
    config,
  });

  app.use('/api/v1', healthRouter);
  app.use('/api/v1', identityRouter);
  app.use('/api/v1', rbacRouter);
  app.use('/api/v1', customerRouter);
  app.use('/api/v1', discoveryRouter);
  app.use('/api/v1', restaurantRouter);
  app.use('/api/v1', outletRouter);
  app.use('/api/v1', catalogRouter);
  app.use('/api/v1', cartRouter);
  app.use('/api/v1', pricingRouter);
  app.use('/api/v1', paymentsRouter);
  app.use('/api/v1', ordersRouter);
  app.use('/api/v1', deliveryRouter);
  app.use('/api/v1', inspectorRouter);
  app.use('/api/v1', inspectionRouter);
  app.use('/api/v1', safetyRouter);
  app.use('/api/v1', supportRouter);
  app.use('/api/v1', financeRouter);
  app.use('/api/v1', governanceRouter);
  app.use('/api/v1', notificationRouter);
  app.use('/api/v1', promotionsRouter);
  app.use('/api/v1', analyticsRouter);
  app.use('/api/v1', aiRouter);
  app.use('/api/v1', integrationsRouter);
  app.use(healthRouter);

  app.use(notFoundHandler);
  app.use(createErrorHandler(logger));

  return app;
}
