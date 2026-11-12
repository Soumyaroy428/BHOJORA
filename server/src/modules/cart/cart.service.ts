import crypto from 'node:crypto';
import type {
  CartAddonSelectionDto,
  CartDto,
  CartItemDto,
  CartVariantSelectionDto,
} from '@bhojora/shared';
import { z } from 'zod';
import type { Logger } from '../../config/logger';
import { AppError } from '../../middleware/error-handler';
import {
  ALLERGEN_LABELS,
  formatInrFromPaise,
  type CatalogStore,
  type MenuItemRecord,
} from '../catalog/catalog.types';
import { SYSTEM_CLOCK, type Clock } from '../identity/identity.types';
import type { RestaurantOutletRecord, RestaurantStore } from '../restaurant/restaurant.types';
import {
  CART_CONSTANTS,
  CLIENT_TAMPER_MONEY_KEYS,
  type CartRecord,
  type CartStore,
} from './cart.types';

const optionPickSchema = z
  .object({
    groupId: z.string().trim().min(1).max(80),
    optionId: z.string().trim().min(1).max(80),
  })
  .strict();

const addCartItemSchema = z
  .object({
    outletId: z.string().trim().min(2).max(80),
    menuItemId: z.string().trim().min(2).max(80),
    quantity: z.number().int().min(1).max(CART_CONSTANTS.maxQuantityPerLine).default(1),
    replaceOutlet: z.boolean().optional().default(false),
    selectedVariants: z.array(optionPickSchema).max(20).optional().default([]),
    selectedAddons: z.array(optionPickSchema).max(30).optional().default([]),
  })
  .strict();

const updateCartItemSchema = z
  .object({
    quantity: z.number().int().min(0).max(CART_CONSTANTS.maxQuantityPerLine),
    selectedVariants: z.array(optionPickSchema).max(20).optional(),
    selectedAddons: z.array(optionPickSchema).max(30).optional(),
  })
  .strict();

export function assertNoClientTamperFields(rawBody: unknown): void {
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    return;
  }
  const obj = rawBody as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (CLIENT_TAMPER_MONEY_KEYS.has(key)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Client-supplied field "${key}" is prohibited; prices, fees, taxes, and totals are computed authoritatively on the server`,
        [
          {
            field: key,
            code: 'CLIENT_PRICE_OVERRIDE_FORBIDDEN',
            issue: 'Server computes all paise amounts',
          },
        ],
      );
    }
  }
}

export interface ResolvedItemPricing {
  unitBasePricePaise: number;
  customizationDeltaPaise: number;
  effectiveUnitPricePaise: number;
  selectedVariants: CartVariantSelectionDto[];
  selectedAddons: CartAddonSelectionDto[];
  selectionSignature: string;
}

export function resolveAuthoritativeItemSelection(params: {
  item: MenuItemRecord;
  requestedVariants?: readonly { groupId: string; optionId: string }[];
  requestedAddons?: readonly { groupId: string; optionId: string }[];
}): ResolvedItemPricing {
  const { item } = params;
  const reqVariants = params.requestedVariants ?? [];
  const reqAddons = params.requestedAddons ?? [];

  const variantGroupMap = new Map(item.variants.map((g) => [g.groupId, g]));
  const pickedVariantsByGroup = new Map<string, Set<string>>();

  for (const pick of reqVariants) {
    const group = variantGroupMap.get(pick.groupId);
    if (!group) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Unknown variant group "${pick.groupId}" for item "${item.title}"`,
      );
    }
    const existingSet = pickedVariantsByGroup.get(group.groupId) ?? new Set<string>();
    if (existingSet.has(pick.optionId)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Duplicate variant option "${pick.optionId}"`);
    }
    existingSet.add(pick.optionId);
    pickedVariantsByGroup.set(group.groupId, existingSet);
  }

  const selectedVariants: CartVariantSelectionDto[] = [];
  let variantDeltaPaise = 0;

  for (const group of item.variants) {
    let chosenIds = pickedVariantsByGroup.get(group.groupId);
    if (!chosenIds || chosenIds.size === 0) {
      if (group.required || group.minSelections > 0) {
        const defaultOpt = group.options.find((opt) => opt.isDefault && opt.isAvailable);
        if (defaultOpt) {
          chosenIds = new Set([defaultOpt.optionId]);
        }
      }
    }

    const count = chosenIds ? chosenIds.size : 0;
    const minReq = group.required ? Math.max(1, group.minSelections) : group.minSelections;
    if (count < minReq || count > group.maxSelections) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Variant group "${group.name}" requires between ${minReq} and ${group.maxSelections} selection(s)`,
      );
    }

    if (chosenIds) {
      for (const optionId of chosenIds) {
        const opt = group.options.find((entry) => entry.optionId === optionId);
        if (!opt) {
          throw new AppError(
            400,
            'VALIDATION_ERROR',
            `Invalid variant option "${optionId}" in "${group.name}"`,
          );
        }
        if (!opt.isAvailable) {
          throw new AppError(
            409,
            'CONFLICT',
            `Selected variant option "${opt.label}" is currently sold out`,
          );
        }
        variantDeltaPaise += opt.priceDeltaPaise;
        selectedVariants.push({
          groupId: group.groupId,
          optionId: opt.optionId,
          label: opt.label,
          priceDeltaPaise: opt.priceDeltaPaise,
        });
      }
    }
  }

  const addonGroupMap = new Map(item.addonGroups.map((g) => [g.groupId, g]));
  const pickedAddonsByGroup = new Map<string, Set<string>>();

  for (const pick of reqAddons) {
    const group = addonGroupMap.get(pick.groupId);
    if (!group) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Unknown add-on group "${pick.groupId}" for item "${item.title}"`,
      );
    }
    const existingSet = pickedAddonsByGroup.get(group.groupId) ?? new Set<string>();
    if (existingSet.has(pick.optionId)) {
      throw new AppError(400, 'VALIDATION_ERROR', `Duplicate add-on option "${pick.optionId}"`);
    }
    existingSet.add(pick.optionId);
    pickedAddonsByGroup.set(group.groupId, existingSet);
  }

  const selectedAddons: CartAddonSelectionDto[] = [];
  let addonDeltaPaise = 0;

  for (const group of item.addonGroups) {
    const chosenIds = pickedAddonsByGroup.get(group.groupId);
    const count = chosenIds ? chosenIds.size : 0;
    if (count < group.minSelections || count > group.maxSelections) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Add-on group "${group.name}" requires between ${group.minSelections} and ${group.maxSelections} selection(s)`,
      );
    }
    if (chosenIds) {
      for (const optionId of chosenIds) {
        const opt = group.options.find((entry) => entry.optionId === optionId);
        if (!opt) {
          throw new AppError(
            400,
            'VALIDATION_ERROR',
            `Invalid add-on option "${optionId}" in "${group.name}"`,
          );
        }
        if (!opt.isAvailable) {
          throw new AppError(
            409,
            'CONFLICT',
            `Selected add-on "${opt.label}" is currently unavailable`,
          );
        }
        addonDeltaPaise += opt.pricePaise;
        selectedAddons.push({
          groupId: group.groupId,
          optionId: opt.optionId,
          label: opt.label,
          pricePaise: opt.pricePaise,
        });
      }
    }
  }

  const variantKey = selectedVariants
    .map((v) => `${v.groupId}:${v.optionId}`)
    .sort()
    .join(',');
  const addonKey = selectedAddons
    .map((a) => `${a.groupId}:${a.optionId}`)
    .sort()
    .join(',');

  const customizationDeltaPaise = variantDeltaPaise + addonDeltaPaise;
  const effectiveUnitPricePaise = item.pricePaise + customizationDeltaPaise;
  if (!Number.isSafeInteger(effectiveUnitPricePaise) || effectiveUnitPricePaise < 0) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Computed item unit price must be a non-negative integer',
    );
  }

  return {
    unitBasePricePaise: item.pricePaise,
    customizationDeltaPaise,
    effectiveUnitPricePaise,
    selectedVariants,
    selectedAddons,
    selectionSignature: `${item.itemId}|v=[${variantKey}]|a=[${addonKey}]`,
  };
}

export interface CartServiceOptions {
  cartStore: CartStore;
  restaurantStore: RestaurantStore;
  catalogStore: CatalogStore;
  logger: Logger;
  clock?: Clock;
}

export class CartService {
  private readonly cartStore: CartStore;
  private readonly restaurantStore: RestaurantStore;
  private readonly catalogStore: CatalogStore;
  private readonly logger: Logger;
  private readonly clock: Clock;

  constructor(options: CartServiceOptions) {
    this.cartStore = options.cartStore;
    this.restaurantStore = options.restaurantStore;
    this.catalogStore = options.catalogStore;
    this.logger = options.logger;
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  private assertOutletAcceptsCart(outlet: RestaurantOutletRecord): void {
    if (outlet.platformInspectionStatus === 'SUSPENDED') {
      throw new AppError(
        409,
        'CRITICAL_VIOLATION_SUSPENDED',
        `${outlet.brandName} (${outlet.name}) is temporarily suspended pending hygiene resolution and cannot accept orders`,
      );
    }
    if (outlet.status !== 'ACTIVE') {
      throw new AppError(
        409,
        'CONFLICT',
        `${outlet.brandName} (${outlet.name}) is temporarily closed for ordering`,
      );
    }
  }

  private async toHydratedCartDto(cart: CartRecord | null, customerId: string): Promise<CartDto> {
    if (!cart || !cart.outletId || cart.items.length === 0) {
      return {
        cartId: cart?.cartId ?? `cart_empty_${customerId}`,
        customerId,
        outletId: null,
        outletName: null,
        brandName: null,
        outletZoneId: null,
        outletSuspended: false,
        items: [],
        itemCount: 0,
        itemsSubtotalPaise: 0,
        formattedSubtotalInr: formatInrFromPaise(0),
        currency: 'INR',
        updatedAt: (cart?.updatedAt ?? this.clock.now()).toISOString(),
      };
    }

    const [outlet, outletMenuItems] = await Promise.all([
      this.restaurantStore.getOutletById(cart.outletId),
      this.catalogStore.listMenuItemsByOutlet(cart.outletId),
    ]);
    const itemMap = new Map(outletMenuItems.map((entry) => [entry.itemId, entry]));

    let itemCount = 0;
    let itemsSubtotalPaise = 0;

    const itemDtos: CartItemDto[] = cart.items.map((line) => {
      const liveItem = itemMap.get(line.menuItemId);
      let unitBasePricePaise = line.unitBasePricePaise;
      let customizationDeltaPaise = line.customizationDeltaPaise;
      let effectiveUnitPricePaise = line.effectiveUnitPricePaise;
      let selectedVariants = line.selectedVariants;
      let selectedAddons = line.selectedAddons;
      let isAvailable = false;

      if (liveItem && liveItem.isAvailable) {
        const stockOk =
          liveItem.dailyStockRemaining === null || liveItem.dailyStockRemaining >= line.quantity;
        try {
          const liveResolved = resolveAuthoritativeItemSelection({
            item: liveItem,
            requestedVariants: line.selectedVariants,
            requestedAddons: line.selectedAddons,
          });
          unitBasePricePaise = liveResolved.unitBasePricePaise;
          customizationDeltaPaise = liveResolved.customizationDeltaPaise;
          effectiveUnitPricePaise = liveResolved.effectiveUnitPricePaise;
          selectedVariants = liveResolved.selectedVariants;
          selectedAddons = liveResolved.selectedAddons;
          isAvailable = stockOk;
        } catch {
          isAvailable = false;
        }
      }

      const lineTotalPaise = effectiveUnitPricePaise * line.quantity;
      itemCount += line.quantity;
      itemsSubtotalPaise += lineTotalPaise;

      return {
        cartItemId: line.cartItemId,
        menuItemId: line.menuItemId,
        title: liveItem?.title ?? line.titleSnapshot,
        dietaryType: liveItem?.dietaryType ?? line.dietaryType,
        allergens: liveItem?.allergens ?? line.allergens,
        allergenLabels: (liveItem?.allergens ?? line.allergens).map(
          (code) => ALLERGEN_LABELS[code] ?? code,
        ),
        gstTaxSlab: liveItem?.gstTaxSlab ?? line.gstTaxSlab,
        quantity: line.quantity,
        unitBasePricePaise,
        customizationDeltaPaise,
        effectiveUnitPricePaise,
        lineTotalPaise,
        formattedLineTotalInr: formatInrFromPaise(lineTotalPaise),
        priceAtAddPaise: line.priceAtAddPaise,
        currentPriceChanged: effectiveUnitPricePaise !== line.priceAtAddPaise,
        isAvailable,
        selectedVariants,
        selectedAddons,
        updatedAt: line.updatedAt.toISOString(),
      };
    });

    return {
      cartId: cart.cartId,
      customerId,
      outletId: cart.outletId,
      outletName: outlet?.name ?? cart.outletName,
      brandName: outlet?.brandName ?? cart.brandName,
      outletZoneId: outlet?.zoneId ?? cart.outletZoneId,
      outletSuspended: outlet?.platformInspectionStatus === 'SUSPENDED',
      items: itemDtos,
      itemCount,
      itemsSubtotalPaise,
      formattedSubtotalInr: formatInrFromPaise(itemsSubtotalPaise),
      currency: 'INR',
      updatedAt: cart.updatedAt.toISOString(),
    };
  }

  async getCart(customerId: string): Promise<CartDto> {
    const existing = await this.cartStore.getCartByCustomerId(customerId);
    return this.toHydratedCartDto(existing, customerId);
  }

  async getRawCartForQuote(customerId: string): Promise<CartRecord | null> {
    return this.cartStore.getCartByCustomerId(customerId);
  }

  async syncCartPriceSnapshots(
    customerId: string,
    updatedSnapshotsByCartItemId: ReadonlyMap<
      string,
      {
        unitBasePricePaise: number;
        customizationDeltaPaise: number;
        effectiveUnitPricePaise: number;
      }
    >,
  ): Promise<void> {
    const existing = await this.cartStore.getCartByCustomerId(customerId);
    if (!existing) {
      return;
    }
    const now = this.clock.now();
    const nextItems = existing.items.map((item) => {
      const snap = updatedSnapshotsByCartItemId.get(item.cartItemId);
      if (!snap) {
        return item;
      }
      return {
        ...item,
        unitBasePricePaise: snap.unitBasePricePaise,
        customizationDeltaPaise: snap.customizationDeltaPaise,
        effectiveUnitPricePaise: snap.effectiveUnitPricePaise,
        priceAtAddPaise: snap.effectiveUnitPricePaise,
        updatedAt: now,
      };
    });
    await this.cartStore.saveCart({
      ...existing,
      items: nextItems,
      updatedAt: now,
    });
  }

  async addOrIncrementItem(customerId: string, rawBody: unknown): Promise<CartDto> {
    assertNoClientTamperFields(rawBody);
    const input = addCartItemSchema.parse(rawBody);

    const outlet = await this.restaurantStore.getOutletById(input.outletId);
    if (!outlet) {
      throw new AppError(404, 'NOT_FOUND', `Outlet "${input.outletId}" not found`);
    }
    this.assertOutletAcceptsCart(outlet);

    const menuItem = await this.catalogStore.getMenuItemById(input.menuItemId);
    if (!menuItem || menuItem.outletId !== outlet.outletId) {
      throw new AppError(
        404,
        'NOT_FOUND',
        `Menu item "${input.menuItemId}" not found at this outlet`,
      );
    }
    if (!menuItem.isAvailable) {
      throw new AppError(409, 'CONFLICT', `"${menuItem.title}" is currently sold out`);
    }

    const resolved = resolveAuthoritativeItemSelection({
      item: menuItem,
      requestedVariants: input.selectedVariants,
      requestedAddons: input.selectedAddons,
    });

    const now = this.clock.now();
    let cart = await this.cartStore.getCartByCustomerId(customerId);

    if (cart && cart.outletId && cart.items.length > 0 && cart.outletId !== outlet.outletId) {
      if (!input.replaceOutlet) {
        throw new AppError(
          409,
          'CONFLICT',
          `Your cart currently contains items from ${cart.brandName ?? cart.outletId} (${cart.outletName ?? ''}). Confirm replaceOutlet=true to replace your cart with ${outlet.brandName}.`,
          [
            {
              field: 'outletId',
              code: 'SINGLE_OUTLET_CONFLICT',
              issue: `Existing cart outlet=${cart.outletId}; requested=${outlet.outletId}`,
            },
          ],
        );
      }
      cart = {
        ...cart,
        outletId: outlet.outletId,
        outletName: outlet.name,
        brandName: outlet.brandName,
        outletZoneId: outlet.zoneId,
        items: [],
        updatedAt: now,
      };
    }

    if (!cart) {
      cart = {
        cartId: `cart_${crypto.randomUUID()}`,
        customerId,
        outletId: outlet.outletId,
        outletName: outlet.name,
        brandName: outlet.brandName,
        outletZoneId: outlet.zoneId,
        items: [],
        createdAt: now,
        updatedAt: now,
      };
    } else {
      cart = {
        ...cart,
        outletId: outlet.outletId,
        outletName: outlet.name,
        brandName: outlet.brandName,
        outletZoneId: outlet.zoneId,
      };
    }

    const existingLineIndex = cart.items.findIndex(
      (entry) => entry.selectionSignature === resolved.selectionSignature,
    );

    if (existingLineIndex >= 0) {
      const existingLine = cart.items[existingLineIndex]!;
      const nextQty = existingLine.quantity + input.quantity;
      if (nextQty > CART_CONSTANTS.maxQuantityPerLine) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Maximum ${CART_CONSTANTS.maxQuantityPerLine} units allowed per cart item`,
        );
      }
      if (menuItem.dailyStockRemaining !== null && nextQty > menuItem.dailyStockRemaining) {
        throw new AppError(
          409,
          'CONFLICT',
          `Only ${menuItem.dailyStockRemaining} unit(s) remaining for "${menuItem.title}"`,
        );
      }
      cart.items[existingLineIndex] = {
        ...existingLine,
        titleSnapshot: menuItem.title,
        dietaryType: menuItem.dietaryType,
        allergens: [...menuItem.allergens],
        gstTaxSlab: menuItem.gstTaxSlab,
        quantity: nextQty,
        unitBasePricePaise: resolved.unitBasePricePaise,
        customizationDeltaPaise: resolved.customizationDeltaPaise,
        effectiveUnitPricePaise: resolved.effectiveUnitPricePaise,
        selectedVariants: resolved.selectedVariants,
        selectedAddons: resolved.selectedAddons,
        updatedAt: now,
      };
    } else {
      if (cart.items.length >= CART_CONSTANTS.maxDistinctLines) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Cart cannot exceed ${CART_CONSTANTS.maxDistinctLines} distinct line items`,
        );
      }
      if (menuItem.dailyStockRemaining !== null && input.quantity > menuItem.dailyStockRemaining) {
        throw new AppError(
          409,
          'CONFLICT',
          `Only ${menuItem.dailyStockRemaining} unit(s) remaining for "${menuItem.title}"`,
        );
      }
      cart.items.push({
        cartItemId: `citem_${crypto.randomUUID()}`,
        menuItemId: menuItem.itemId,
        titleSnapshot: menuItem.title,
        dietaryType: menuItem.dietaryType,
        allergens: [...menuItem.allergens],
        gstTaxSlab: menuItem.gstTaxSlab,
        quantity: input.quantity,
        unitBasePricePaise: resolved.unitBasePricePaise,
        customizationDeltaPaise: resolved.customizationDeltaPaise,
        effectiveUnitPricePaise: resolved.effectiveUnitPricePaise,
        priceAtAddPaise: resolved.effectiveUnitPricePaise,
        selectedVariants: resolved.selectedVariants,
        selectedAddons: resolved.selectedAddons,
        selectionSignature: resolved.selectionSignature,
        updatedAt: now,
      });
    }

    const saved = await this.cartStore.saveCart({
      ...cart,
      updatedAt: now,
    });
    this.logger.info('cart.item.added', {
      customerId,
      outletId: outlet.outletId,
      menuItemId: menuItem.itemId,
      itemCount: saved.items.reduce((sum, i) => sum + i.quantity, 0),
    });

    return this.toHydratedCartDto(saved, customerId);
  }

  async updateCartItem(customerId: string, cartItemId: string, rawBody: unknown): Promise<CartDto> {
    assertNoClientTamperFields(rawBody);
    const input = updateCartItemSchema.parse(rawBody);

    const cart = await this.cartStore.getCartByCustomerId(customerId);
    if (!cart || cart.items.length === 0) {
      throw new AppError(404, 'NOT_FOUND', 'Active cart is empty');
    }

    const targetIndex = cart.items.findIndex((entry) => entry.cartItemId === cartItemId);
    if (targetIndex < 0) {
      throw new AppError(404, 'NOT_FOUND', 'Cart item not found');
    }

    const now = this.clock.now();
    if (input.quantity === 0) {
      const nextItems = cart.items.filter((entry) => entry.cartItemId !== cartItemId);
      const saved = await this.cartStore.saveCart({
        ...cart,
        outletId: nextItems.length === 0 ? null : cart.outletId,
        outletName: nextItems.length === 0 ? null : cart.outletName,
        brandName: nextItems.length === 0 ? null : cart.brandName,
        outletZoneId: nextItems.length === 0 ? null : cart.outletZoneId,
        items: nextItems,
        updatedAt: now,
      });
      return this.toHydratedCartDto(saved, customerId);
    }

    const target = cart.items[targetIndex]!;
    const menuItem = await this.catalogStore.getMenuItemById(target.menuItemId);
    if (!menuItem || !menuItem.isAvailable) {
      throw new AppError(409, 'CONFLICT', `"${target.titleSnapshot}" is no longer available`);
    }
    if (menuItem.dailyStockRemaining !== null && input.quantity > menuItem.dailyStockRemaining) {
      throw new AppError(
        409,
        'CONFLICT',
        `Only ${menuItem.dailyStockRemaining} unit(s) remaining for "${menuItem.title}"`,
      );
    }

    const resolved = resolveAuthoritativeItemSelection({
      item: menuItem,
      requestedVariants: input.selectedVariants ?? target.selectedVariants,
      requestedAddons: input.selectedAddons ?? target.selectedAddons,
    });

    const nextItems = [...cart.items];
    nextItems[targetIndex] = {
      ...target,
      titleSnapshot: menuItem.title,
      dietaryType: menuItem.dietaryType,
      allergens: [...menuItem.allergens],
      gstTaxSlab: menuItem.gstTaxSlab,
      quantity: input.quantity,
      unitBasePricePaise: resolved.unitBasePricePaise,
      customizationDeltaPaise: resolved.customizationDeltaPaise,
      effectiveUnitPricePaise: resolved.effectiveUnitPricePaise,
      selectedVariants: resolved.selectedVariants,
      selectedAddons: resolved.selectedAddons,
      selectionSignature: resolved.selectionSignature,
      updatedAt: now,
    };

    const saved = await this.cartStore.saveCart({
      ...cart,
      items: nextItems,
      updatedAt: now,
    });
    return this.toHydratedCartDto(saved, customerId);
  }

  async removeCartItem(customerId: string, cartItemId: string): Promise<CartDto> {
    const cart = await this.cartStore.getCartByCustomerId(customerId);
    if (!cart) {
      throw new AppError(404, 'NOT_FOUND', 'Cart not found');
    }
    if (!cart.items.some((entry) => entry.cartItemId === cartItemId)) {
      throw new AppError(404, 'NOT_FOUND', 'Cart item not found');
    }
    const nextItems = cart.items.filter((entry) => entry.cartItemId !== cartItemId);
    const now = this.clock.now();
    const saved = await this.cartStore.saveCart({
      ...cart,
      outletId: nextItems.length === 0 ? null : cart.outletId,
      outletName: nextItems.length === 0 ? null : cart.outletName,
      brandName: nextItems.length === 0 ? null : cart.brandName,
      outletZoneId: nextItems.length === 0 ? null : cart.outletZoneId,
      items: nextItems,
      updatedAt: now,
    });
    return this.toHydratedCartDto(saved, customerId);
  }

  async clearCart(customerId: string): Promise<CartDto> {
    await this.cartStore.deleteCartByCustomerId(customerId);
    return this.toHydratedCartDto(null, customerId);
  }
}
