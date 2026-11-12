import crypto from 'node:crypto';
import type {
  CheckoutQuoteDto,
  PriceDriftWarningDto,
  PublicCouponSummaryDto,
  QuoteAddressSnapshotDto,
  QuoteLineItemDto,
} from '@bhojora/shared';
import { z } from 'zod';
import type { Logger } from '../../config/logger';
import { AppError } from '../../middleware/error-handler';
import {
  assertNoClientTamperFields,
  CartService,
  resolveAuthoritativeItemSelection,
} from '../cart/cart.service';
import { formatInrFromPaise, type CatalogStore } from '../catalog/catalog.types';
import type { CustomerService } from '../customer/customer.service';
import { SYSTEM_CLOCK, type Clock, type UserRole } from '../identity/identity.types';
import { assertValidGeoJsonPoint } from '../outlet/outlet.geo';
import type { OutletService } from '../outlet/outlet.service';
import type { RestaurantStore } from '../restaurant/restaurant.types';
import {
  computeServerPricingBreakdown,
  signQuotePayload,
  verifyQuoteSignature,
} from './pricing.math';
import { getDefaultPilotCouponsSeed } from './pricing.store';
import {
  MAX_TIP_PAISE,
  QUOTE_TTL_SECONDS,
  TAMPER_PROTECTION_NOTICE,
  type CouponRecord,
  type PricingQuoteRecord,
  type PricingStore,
} from './pricing.types';

const checkoutQuoteRequestSchema = z
  .object({
    addressId: z.string().trim().min(3).max(80).optional(),
    coordinates: z.tuple([z.number(), z.number()]).optional(),
    couponCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,32}$/, 'Invalid coupon code format')
      .optional()
      .nullable(),
    tipPaise: z.number().int().min(0).max(MAX_TIP_PAISE).optional().default(0),
    acceptPriceChanges: z.boolean().optional().default(false),
  })
  .strict()
  .refine((data) => Boolean(data.addressId || data.coordinates), {
    message: 'Provide a saved addressId or Kolkata delivery coordinates [longitude, latitude]',
  });

const verifyQuoteSchema = z
  .object({
    expectedTotalPayablePaise: z.number().int().min(0).optional(),
  })
  .strict()
  .optional();

export interface PricingServiceOptions {
  pricingStore: PricingStore;
  cartService: CartService;
  customerService: CustomerService;
  restaurantStore: RestaurantStore;
  outletService: OutletService;
  catalogStore: CatalogStore;
  signingSecret: string;
  logger: Logger;
  clock?: Clock;
}

export class PricingService {
  private readonly pricingStore: PricingStore;
  private readonly cartService: CartService;
  private readonly customerService: CustomerService;
  private readonly restaurantStore: RestaurantStore;
  private readonly outletService: OutletService;
  private readonly catalogStore: CatalogStore;
  private readonly signingSecret: string;
  private readonly logger: Logger;
  private readonly clock: Clock;

  constructor(options: PricingServiceOptions) {
    this.pricingStore = options.pricingStore;
    this.cartService = options.cartService;
    this.customerService = options.customerService;
    this.restaurantStore = options.restaurantStore;
    this.outletService = options.outletService;
    this.catalogStore = options.catalogStore;
    this.signingSecret = options.signingSecret;
    this.logger = options.logger;
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  private async getResolvedCoupons(now: Date): Promise<CouponRecord[]> {
    const active = await this.pricingStore.listActiveCoupons(now);
    if (active.length > 0) {
      return active;
    }
    const defaults = getDefaultPilotCouponsSeed(now);
    const saved: CouponRecord[] = [];
    for (const coupon of defaults) {
      saved.push(await this.pricingStore.upsertCoupon(coupon));
    }
    return saved;
  }

  private async resolveCouponByCode(code: string, now: Date): Promise<CouponRecord | null> {
    const normalized = code.trim().toUpperCase();
    const existing = await this.pricingStore.getCouponByCode(normalized);
    if (existing) {
      return existing;
    }
    await this.getResolvedCoupons(now);
    return this.pricingStore.getCouponByCode(normalized);
  }

  private toQuoteDto(record: PricingQuoteRecord, now: Date): CheckoutQuoteDto {
    const msLeft = record.expiresAt.getTime() - now.getTime();
    const expiredByClock = msLeft <= 0 || record.status === 'EXPIRED';
    const remainingSeconds = expiredByClock ? 0 : Math.ceil(msLeft / 1000);
    return {
      quoteId: record.quoteId,
      customerId: record.customerId,
      outletId: record.outletId,
      outletName: record.outletName,
      brandName: record.brandName,
      outletInspectionStatus: record.outletInspectionStatus,
      outletSafetyScore: record.outletSafetyScore,
      status: expiredByClock && record.status === 'ACTIVE' ? 'EXPIRED' : record.status,
      isExpired: expiredByClock,
      remainingSeconds,
      ttlSeconds: record.ttlSeconds,
      issuedAt: record.issuedAt.toISOString(),
      expiresAt: record.expiresAt.toISOString(),
      signatureAlgorithm: 'HMAC-SHA256',
      signature: record.signature,
      currency: 'INR',
      distanceMeters: record.distanceMeters,
      estimatedDeliveryMinutes: record.estimatedDeliveryMinutes,
      addressSnapshot: record.addressSnapshot,
      lineItems: record.lineItems,
      priceDriftDetected: record.priceDriftDetected,
      priceDriftWarnings: record.priceDriftWarnings,
      pricingBreakdown: record.pricingBreakdown,
      couponAllocation: record.couponAllocation,
      tamperProtectionNotice: TAMPER_PROTECTION_NOTICE,
    };
  }

  async listPublicAvailableCoupons(): Promise<PublicCouponSummaryDto[]> {
    const now = this.clock.now();
    const active = await this.getResolvedCoupons(now);
    return active
      .filter((c) => c.totalRedemptions < c.maxGlobalRedemptions)
      .map((c) => ({
        code: c.code,
        title: c.title,
        description: c.description,
        discountType: c.discountType,
        discountValue: c.discountValue,
        maxDiscountPaise: c.maxDiscountPaise,
        minOrderSubtotalPaise: c.minOrderSubtotalPaise,
        platformShareBps: c.platformShareBps,
        restaurantShareBps: c.restaurantShareBps,
        maxRedemptionsPerUser: c.maxRedemptionsPerUser,
        validUntil: c.validUntil.toISOString(),
        fundingSummaryLabel: `${Math.round(c.platformShareBps / 100)}% Platform / ${Math.round(c.restaurantShareBps / 100)}% Restaurant funded`,
      }));
  }

  async generateCheckoutQuote(
    customerId: string,
    rawBody: unknown,
    actorRole: UserRole = 'CUSTOMER',
  ): Promise<CheckoutQuoteDto> {
    assertNoClientTamperFields(rawBody);
    const input = checkoutQuoteRequestSchema.parse(rawBody);
    const now = this.clock.now();

    const cart = await this.cartService.getRawCartForQuote(customerId);
    if (!cart || !cart.outletId || cart.items.length === 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Your cart is empty; add items before generating a quote',
      );
    }

    const outlet = await this.restaurantStore.getOutletById(cart.outletId);
    if (!outlet) {
      throw new AppError(404, 'NOT_FOUND', `Outlet "${cart.outletId}" not found`);
    }
    if (outlet.platformInspectionStatus === 'SUSPENDED') {
      throw new AppError(
        409,
        'CRITICAL_VIOLATION_SUSPENDED',
        `${outlet.brandName} (${outlet.name}) is temporarily suspended pending hygiene resolution and cannot fulfill orders`,
      );
    }
    if (outlet.status !== 'ACTIVE') {
      throw new AppError(
        409,
        'CONFLICT',
        `${outlet.brandName} (${outlet.name}) is temporarily closed`,
      );
    }

    let addressSnapshot: QuoteAddressSnapshotDto;
    if (input.addressId) {
      const owned = await this.customerService.getAddressById(
        input.addressId,
        customerId,
        actorRole,
      );
      addressSnapshot = {
        addressId: owned.addressId,
        label: owned.customLabel || owned.label,
        streetAddress: owned.streetAddress,
        locality: owned.locality,
        city: owned.city,
        zoneId: owned.zoneId ?? null,
        coordinates: [owned.location.coordinates[0], owned.location.coordinates[1]],
      };
    } else {
      const coords = assertValidGeoJsonPoint(input.coordinates, {
        requireKolkataBounds: true,
        label: 'Delivery address coordinates',
      });
      addressSnapshot = {
        addressId: null,
        label: 'Selected Kolkata Pin',
        streetAddress: 'Pin location',
        locality: 'Kolkata',
        city: 'Kolkata',
        zoneId: null,
        coordinates: coords,
      };
    }

    const serviceability = await this.outletService.checkServiceability({
      coordinates: addressSnapshot.coordinates,
      outletId: outlet.outletId,
    });
    const match = serviceability.outlets[0];
    if (!serviceability.matchedZone || !match || !match.serviceable) {
      throw new AppError(
        409,
        'OUTLET_OUT_OF_ZONE',
        `${outlet.brandName} (${outlet.name}) does not deliver to the selected location (${serviceability.reason})`,
      );
    }
    if (!match.isOpenNow) {
      throw new AppError(
        409,
        'CONFLICT',
        `${outlet.brandName} (${outlet.name}) is currently closed (${match.liveStatusReason})`,
      );
    }

    if (!addressSnapshot.zoneId) {
      addressSnapshot.zoneId = serviceability.matchedZone.zoneId;
      addressSnapshot.locality =
        addressSnapshot.locality === 'Kolkata'
          ? serviceability.matchedZone.name
          : addressSnapshot.locality;
    }

    const liveItemsMap = new Map(
      (await this.catalogStore.listMenuItemsByOutlet(outlet.outletId)).map((i) => [i.itemId, i]),
    );

    const priceDriftWarnings: PriceDriftWarningDto[] = [];
    const updatedCartSnapshots = new Map<
      string,
      {
        unitBasePricePaise: number;
        customizationDeltaPaise: number;
        effectiveUnitPricePaise: number;
      }
    >();
    const authoritativeLineMeta: Array<{
      cartItemId: string;
      menuItemId: string;
      title: string;
      quantity: number;
      unitPricePaise: number;
      gstTaxSlab: (typeof cart.items)[number]['gstTaxSlab'];
    }> = [];

    for (const line of cart.items) {
      const liveItem = liveItemsMap.get(line.menuItemId);
      if (!liveItem || !liveItem.isAvailable) {
        throw new AppError(
          409,
          'CONFLICT',
          `"${line.titleSnapshot}" is currently unavailable; remove it from your cart before checkout`,
        );
      }
      if (liveItem.dailyStockRemaining !== null && liveItem.dailyStockRemaining < line.quantity) {
        throw new AppError(
          409,
          'CONFLICT',
          `Only ${liveItem.dailyStockRemaining} unit(s) available for "${liveItem.title}"`,
        );
      }

      const resolved = resolveAuthoritativeItemSelection({
        item: liveItem,
        requestedVariants: line.selectedVariants,
        requestedAddons: line.selectedAddons,
      });

      if (resolved.effectiveUnitPricePaise !== line.priceAtAddPaise) {
        const formattedPrev = formatInrFromPaise(line.priceAtAddPaise);
        const formattedCurr = formatInrFromPaise(resolved.effectiveUnitPricePaise);
        priceDriftWarnings.push({
          menuItemId: liveItem.itemId,
          title: liveItem.title,
          previousUnitPricePaise: line.priceAtAddPaise,
          currentUnitPricePaise: resolved.effectiveUnitPricePaise,
          formattedPreviousInr: formattedPrev,
          formattedCurrentInr: formattedCurr,
          message: `Item '${liveItem.title}' price changed from ${formattedPrev} to ${formattedCurr}. Do you accept the updated total?`,
        });
      }

      updatedCartSnapshots.set(line.cartItemId, {
        unitBasePricePaise: resolved.unitBasePricePaise,
        customizationDeltaPaise: resolved.customizationDeltaPaise,
        effectiveUnitPricePaise: resolved.effectiveUnitPricePaise,
      });

      authoritativeLineMeta.push({
        cartItemId: line.cartItemId,
        menuItemId: liveItem.itemId,
        title: liveItem.title,
        quantity: line.quantity,
        unitPricePaise: resolved.effectiveUnitPricePaise,
        gstTaxSlab: liveItem.gstTaxSlab,
      });
    }

    const preliminarySubtotal = authoritativeLineMeta.reduce(
      (sum, entry) => sum + entry.unitPricePaise * entry.quantity,
      0,
    );
    const zoneMinOrderPaise = serviceability.matchedZone.minOrderPaise;
    if (preliminarySubtotal < zoneMinOrderPaise) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Minimum order subtotal for ${serviceability.matchedZone.name} is ${formatInrFromPaise(zoneMinOrderPaise)}`,
      );
    }

    let couponRecord: CouponRecord | null = null;
    if (input.couponCode) {
      couponRecord = await this.resolveCouponByCode(input.couponCode, now);
      if (!couponRecord || !couponRecord.isActive) {
        throw new AppError(
          404,
          'NOT_FOUND',
          `Coupon "${input.couponCode}" is not valid or inactive`,
        );
      }
      if (now < couponRecord.validFrom || now > couponRecord.validUntil) {
        throw new AppError(409, 'CONFLICT', `Coupon "${couponRecord.code}" has expired`);
      }
      if (couponRecord.totalRedemptions >= couponRecord.maxGlobalRedemptions) {
        throw new AppError(
          409,
          'CONFLICT',
          `Coupon "${couponRecord.code}" has reached its redemption cap`,
        );
      }
      const userRedemption = couponRecord.userRedemptions.find((u) => u.userId === customerId);
      if (userRedemption && userRedemption.count >= couponRecord.maxRedemptionsPerUser) {
        throw new AppError(
          409,
          'CONFLICT',
          `Coupon "${couponRecord.code}" allows at most ${couponRecord.maxRedemptionsPerUser} redemption(s) per customer`,
        );
      }
      if (preliminarySubtotal < couponRecord.minOrderSubtotalPaise) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Coupon "${couponRecord.code}" requires a minimum order subtotal of ${formatInrFromPaise(couponRecord.minOrderSubtotalPaise)}`,
        );
      }
    }

    if (priceDriftWarnings.length > 0 && input.acceptPriceChanges) {
      await this.cartService.syncCartPriceSnapshots(customerId, updatedCartSnapshots);
    }
    const priceDriftDetected = priceDriftWarnings.length > 0 && !input.acceptPriceChanges;

    const computed = computeServerPricingBreakdown({
      items: authoritativeLineMeta.map((line) => ({
        unitPricePaise: line.unitPricePaise,
        quantity: line.quantity,
        gstTaxSlab: line.gstTaxSlab,
      })),
      deliveryBaseFeePaise: match.deliveryFeePaise,
      distanceMeters: match.distanceMeters,
      tipPaise: input.tipPaise,
      coupon: couponRecord
        ? {
            code: couponRecord.code,
            title: couponRecord.title,
            discountType: couponRecord.discountType,
            discountValue: couponRecord.discountValue,
            maxDiscountPaise: couponRecord.maxDiscountPaise,
            minOrderSubtotalPaise: couponRecord.minOrderSubtotalPaise,
            platformShareBps: couponRecord.platformShareBps,
            restaurantShareBps: couponRecord.restaurantShareBps,
          }
        : null,
    });

    const lineItems: QuoteLineItemDto[] = authoritativeLineMeta.map((line, idx) => ({
      cartItemId: line.cartItemId,
      menuItemId: line.menuItemId,
      title: line.title,
      quantity: line.quantity,
      gstTaxSlab: line.gstTaxSlab,
      unitPricePaise: line.unitPricePaise,
      lineSubtotalPaise: line.unitPricePaise * line.quantity,
      gstTaxPaise: computed.lineTaxPaise[idx] ?? 0,
    }));

    const issuedAt = now;
    const expiresAt = new Date(issuedAt.getTime() + QUOTE_TTL_SECONDS * 1000);
    const quoteId = `quote_${crypto.randomUUID()}`;
    const signature = signQuotePayload(
      {
        quoteId,
        customerId,
        outletId: outlet.outletId,
        issuedAtIso: issuedAt.toISOString(),
        expiresAtIso: expiresAt.toISOString(),
        breakdown: computed.breakdown,
      },
      this.signingSecret,
    );

    const saved = await this.pricingStore.saveQuote({
      quoteId,
      customerId,
      outletId: outlet.outletId,
      outletName: outlet.name,
      brandName: outlet.brandName,
      outletInspectionStatus: outlet.platformInspectionStatus,
      outletSafetyScore: outlet.publishedSafetyScore,
      status: 'ACTIVE',
      ttlSeconds: QUOTE_TTL_SECONDS,
      issuedAt,
      expiresAt,
      signatureAlgorithm: 'HMAC-SHA256',
      signature,
      distanceMeters: match.distanceMeters,
      estimatedDeliveryMinutes: match.estimatedDeliveryMinutes,
      addressSnapshot,
      lineItems,
      priceDriftDetected,
      priceDriftWarnings: priceDriftDetected ? priceDriftWarnings : [],
      pricingBreakdown: computed.breakdown,
      couponAllocation: computed.couponAllocation,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    });

    this.logger.info('pricing.quote.generated', {
      quoteId: saved.quoteId,
      customerId,
      outletId: saved.outletId,
      totalPayablePaise: saved.pricingBreakdown.totalPayablePaise,
      discountPaise: saved.pricingBreakdown.discountPaise,
      priceDriftDetected: saved.priceDriftDetected,
    });

    return this.toQuoteDto(saved, now);
  }

  async getCheckoutQuote(customerId: string, quoteId: string): Promise<CheckoutQuoteDto> {
    const now = this.clock.now();
    const record = await this.pricingStore.getQuoteById(quoteId);
    if (!record) {
      throw new AppError(404, 'NOT_FOUND', `Quote "${quoteId}" not found`);
    }
    if (record.customerId !== customerId) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this checkout quote');
    }

    const signatureValid = verifyQuoteSignature(
      {
        quoteId: record.quoteId,
        customerId: record.customerId,
        outletId: record.outletId,
        issuedAtIso: record.issuedAt.toISOString(),
        expiresAtIso: record.expiresAt.toISOString(),
        breakdown: record.pricingBreakdown,
      },
      record.signature,
      this.signingSecret,
    );
    if (!signatureValid) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Quote cryptographic signature verification failed; total may have been tampered',
      );
    }

    if (record.status === 'ACTIVE' && now.getTime() > record.expiresAt.getTime()) {
      const updated = await this.pricingStore.updateQuoteStatus(record.quoteId, 'EXPIRED', now);
      return this.toQuoteDto(updated ?? record, now);
    }

    return this.toQuoteDto(record, now);
  }

  async verifyQuoteForCheckout(
    customerId: string,
    quoteId: string,
    rawBody?: unknown,
  ): Promise<{ valid: true; quote: CheckoutQuoteDto }> {
    const parsed = verifyQuoteSchema.parse(rawBody);
    const quote = await this.getCheckoutQuote(customerId, quoteId);

    if (quote.status === 'CONSUMED') {
      throw new AppError(409, 'CONFLICT', 'Checkout quote has already been consumed by an order');
    }
    if (quote.isExpired || quote.status === 'EXPIRED') {
      throw new AppError(
        409,
        'CONFLICT',
        `Checkout quote "${quote.quoteId}" expired after ${QUOTE_TTL_SECONDS} seconds; regenerate quote to continue`,
      );
    }
    if (quote.priceDriftDetected) {
      throw new AppError(
        409,
        'ITEM_PRICE_CHANGED',
        'Item prices changed while building cart; confirm updated total (acceptPriceChanges=true) before placing order',
      );
    }
    if (
      parsed?.expectedTotalPayablePaise !== undefined &&
      parsed.expectedTotalPayablePaise !== quote.pricingBreakdown.totalPayablePaise
    ) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Quote total mismatch: expected ${quote.pricingBreakdown.totalPayablePaise} paise`,
      );
    }

    return { valid: true, quote };
  }

  async recordCouponRedemption(couponCode: string, customerId: string): Promise<void> {
    const now = this.clock.now();
    const coupon = await this.resolveCouponByCode(couponCode, now);
    if (!coupon) {
      return;
    }
    const nextUsers = [...coupon.userRedemptions];
    const existingIdx = nextUsers.findIndex((u) => u.userId === customerId);
    if (existingIdx >= 0) {
      nextUsers[existingIdx] = {
        userId: customerId,
        count: nextUsers[existingIdx]!.count + 1,
        lastRedeemedAt: now,
      };
    } else {
      nextUsers.push({ userId: customerId, count: 1, lastRedeemedAt: now });
    }
    await this.pricingStore.upsertCoupon({
      ...coupon,
      totalRedemptions: coupon.totalRedemptions + 1,
      userRedemptions: nextUsers,
      updatedAt: now,
    });
  }
}
