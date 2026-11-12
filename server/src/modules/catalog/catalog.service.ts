import crypto from 'node:crypto';
import type {
  AllergenCode,
  CatalogAuditEntryDto,
  DietaryType,
  MenuAddonGroupDto,
  MenuCategoryDto,
  MenuItemDto,
  MenuVariantGroupDto,
  OutletCatalogDto,
} from '@bhojora/shared';
import { z } from 'zod';
import type { Logger } from '../../config/logger';
import { AppError } from '../../middleware/error-handler';
import { SYSTEM_CLOCK, type Clock, type UserRole } from '../identity/identity.types';
import { assertMfaSatisfiedForRole, hasOutletMembership } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import type { RestaurantOutletRecord, RestaurantStore } from '../restaurant/restaurant.types';
import {
  ALLERGEN_CODES,
  ALLERGEN_LABELS,
  DIETARY_LABELS,
  DIETARY_TYPES,
  formatInrFromPaise,
  GST_TAX_SLABS,
  type CatalogStore,
  type MenuCategoryRecord,
  type MenuItemRecord,
} from './catalog.types';

const MAX_ITEM_PAISE = 10_000_000;

const paiseSchema = z
  .number({ message: 'Price must be an integer amount in paise' })
  .int('Price must be stored as an exact integer in paise (no floating-point decimals)')
  .min(0, 'Price in paise cannot be negative')
  .max(MAX_ITEM_PAISE, 'Price in paise exceeds maximum allowed limit');

const safeImageUrlSchema = z
  .string()
  .trim()
  .max(512)
  .nullable()
  .optional()
  .transform((val) => (val === '' || val === undefined ? null : val))
  .refine(
    (val) => {
      if (val === null) {
        return true;
      }
      if (val.includes('..') || /private\/compliance/i.test(val) || /\.pdf($|\?)/i.test(val)) {
        return false;
      }
      return /^https:\/\/[^\s<>"']+$/i.test(val) || /^(\.?\/)assets\/[a-zA-Z0-9._/-]+$/.test(val);
    },
    {
      message:
        'Image URL must be an https:// URL or public ./assets/ path and never reference private compliance storage',
    },
  );

const variantOptionSchema = z
  .object({
    optionId: z.string().trim().min(2).max(60).optional(),
    label: z.string().trim().min(1).max(80),
    priceDeltaPaise: paiseSchema.default(0),
    isDefault: z.boolean().default(false),
    isAvailable: z.boolean().default(true),
    dietaryType: z.enum(DIETARY_TYPES).optional(),
  })
  .strict();

const variantGroupSchema = z
  .object({
    groupId: z.string().trim().min(2).max(60).optional(),
    name: z.string().trim().min(1).max(80),
    required: z.boolean().default(true),
    minSelections: z.number().int().min(0).max(10).default(1),
    maxSelections: z.number().int().min(1).max(10).default(1),
    options: z.array(variantOptionSchema).min(1).max(12),
  })
  .strict()
  .superRefine((group, ctx) => {
    if (group.minSelections > group.maxSelections) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSelections'],
        message: 'minSelections cannot exceed maxSelections',
      });
    }
    if (group.required && group.minSelections < 1) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSelections'],
        message: 'Required variant group must have minSelections >= 1',
      });
    }
  });

const addonOptionSchema = z
  .object({
    optionId: z.string().trim().min(2).max(60).optional(),
    label: z.string().trim().min(1).max(80),
    pricePaise: paiseSchema,
    dietaryType: z.enum(DIETARY_TYPES).default('PURE_VEG'),
    allergens: z.array(z.enum(ALLERGEN_CODES)).max(11).default([]),
    isAvailable: z.boolean().default(true),
  })
  .strict();

const addonGroupSchema = z
  .object({
    groupId: z.string().trim().min(2).max(60).optional(),
    name: z.string().trim().min(1).max(80),
    minSelections: z.number().int().min(0).max(15).default(0),
    maxSelections: z.number().int().min(1).max(15).default(4),
    options: z.array(addonOptionSchema).min(1).max(15),
  })
  .strict()
  .superRefine((group, ctx) => {
    if (group.minSelections > group.maxSelections) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSelections'],
        message: 'minSelections cannot exceed maxSelections',
      });
    }
  });

const createCategorySchema = z
  .object({
    outletId: z.string().trim().min(3).max(80),
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(240).default(''),
    sortOrder: z.number().int().min(0).max(9999).default(0),
    isActive: z.boolean().default(true),
  })
  .strict();

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(240).optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Provide at least one category field to update',
  });

const createMenuItemSchema = z
  .object({
    outletId: z.string().trim().min(3).max(80),
    categoryId: z.string().trim().min(3).max(80),
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(400).default(''),
    pricePaise: paiseSchema,
    gstTaxSlab: z.enum(GST_TAX_SLABS).default('RESTAURANT_5_PCT'),
    dietaryType: z.enum(DIETARY_TYPES),
    allergens: z.array(z.enum(ALLERGEN_CODES)).max(11).default([]),
    allergenDisclosureConfirmed: z.literal(true, {
      message:
        'Confirm declared allergens (or explicitly confirm none apply) before creating a menu item',
    }),
    imageUrl: safeImageUrlSchema,
    isAvailable: z.boolean().default(true),
    dailyStockRemaining: z.number().int().min(0).max(100000).nullable().default(null),
    prepTimeMinutes: z.number().int().min(5).max(180).nullable().default(20),
    variants: z.array(variantGroupSchema).max(6).default([]),
    addonGroups: z.array(addonGroupSchema).max(8).default([]),
  })
  .strict();

const updateMenuItemSchema = z
  .object({
    categoryId: z.string().trim().min(3).max(80).optional(),
    title: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(400).optional(),
    pricePaise: paiseSchema.optional(),
    gstTaxSlab: z.enum(GST_TAX_SLABS).optional(),
    dietaryType: z.enum(DIETARY_TYPES).optional(),
    allergens: z.array(z.enum(ALLERGEN_CODES)).max(11).optional(),
    allergenDisclosureConfirmed: z
      .literal(true, {
        message: 'allergenDisclosureConfirmed cannot be set to false',
      })
      .optional(),
    imageUrl: safeImageUrlSchema,
    isAvailable: z.boolean().optional(),
    dailyStockRemaining: z.number().int().min(0).max(100000).nullable().optional(),
    prepTimeMinutes: z.number().int().min(5).max(180).nullable().optional(),
    variants: z.array(variantGroupSchema).max(6).optional(),
    addonGroups: z.array(addonGroupSchema).max(8).optional(),
  })
  .strict()
  .refine((val) => Object.keys(val).length > 0, {
    message: 'Provide at least one menu item field to update',
  });

const updateAvailabilitySchema = z
  .object({
    isAvailable: z.boolean(),
    dailyStockRemaining: z.number().int().min(0).max(100000).nullable().optional(),
    reason: z.string().trim().min(3).max(160).optional(),
  })
  .strict();

function toSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'category'
  );
}

function dedupeAllergens(input: readonly AllergenCode[]): AllergenCode[] {
  const seen = new Set<AllergenCode>();
  for (const code of ALLERGEN_CODES) {
    if (input.includes(code)) {
      seen.add(code);
    }
  }
  return Array.from(seen);
}

function normalizeVariantGroups(
  groups: readonly z.infer<typeof variantGroupSchema>[],
): MenuVariantGroupDto[] {
  return groups.map((group) => ({
    groupId: group.groupId ?? `vargrp_${crypto.randomUUID().slice(0, 8)}`,
    name: group.name,
    required: group.required,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    options: group.options.map((opt) => ({
      optionId: opt.optionId ?? `varopt_${crypto.randomUUID().slice(0, 8)}`,
      label: opt.label,
      priceDeltaPaise: opt.priceDeltaPaise,
      isDefault: opt.isDefault,
      isAvailable: opt.isAvailable,
      ...(opt.dietaryType !== undefined ? { dietaryType: opt.dietaryType } : {}),
    })),
  }));
}

function normalizeAddonGroups(
  groups: readonly z.infer<typeof addonGroupSchema>[],
): MenuAddonGroupDto[] {
  return groups.map((group) => ({
    groupId: group.groupId ?? `addgrp_${crypto.randomUUID().slice(0, 8)}`,
    name: group.name,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    options: group.options.map((opt) => ({
      optionId: opt.optionId ?? `addopt_${crypto.randomUUID().slice(0, 8)}`,
      label: opt.label,
      pricePaise: opt.pricePaise,
      dietaryType: opt.dietaryType,
      allergens: dedupeAllergens(opt.allergens),
      isAvailable: opt.isAvailable,
    })),
  }));
}

function toCategoryDto(record: MenuCategoryRecord): MenuCategoryDto {
  return {
    categoryId: record.categoryId,
    outletId: record.outletId,
    restaurantId: record.restaurantId,
    name: record.name,
    description: record.description,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function toMenuItemDto(record: MenuItemRecord): MenuItemDto {
  const allergens = dedupeAllergens(record.allergens);
  return {
    itemId: record.itemId,
    outletId: record.outletId,
    restaurantId: record.restaurantId,
    categoryId: record.categoryId,
    title: record.title,
    description: record.description,
    pricePaise: record.pricePaise,
    formattedPriceInr: formatInrFromPaise(record.pricePaise),
    gstTaxSlab: record.gstTaxSlab,
    dietaryType: record.dietaryType,
    dietaryBadgeLabel: DIETARY_LABELS[record.dietaryType],
    allergens,
    allergenLabels: allergens.map((code) => ALLERGEN_LABELS[code]),
    allergenDisclosureConfirmed: record.allergenDisclosureConfirmed,
    imageUrl: record.imageUrl,
    isAvailable: record.isAvailable,
    dailyStockRemaining: record.dailyStockRemaining,
    prepTimeMinutes: record.prepTimeMinutes,
    variants: record.variants,
    addonGroups: record.addonGroups,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export interface CatalogServiceOptions {
  catalogStore: CatalogStore;
  restaurantStore: RestaurantStore;
  rbacStore: RbacStore;
  logger: Logger;
  clock?: Clock;
}

export class CatalogService {
  private readonly catalogStore: CatalogStore;
  private readonly restaurantStore: RestaurantStore;
  private readonly rbacStore: RbacStore;
  private readonly logger: Logger;
  private readonly clock: Clock;

  constructor(options: CatalogServiceOptions) {
    this.catalogStore = options.catalogStore;
    this.restaurantStore = options.restaurantStore;
    this.rbacStore = options.rbacStore;
    this.logger = options.logger;
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  private async assertAuthorizedOutlet(params: {
    actorUserId: string;
    actorRole: UserRole;
    mfaVerified: boolean;
    outletId: string;
    auditAction: string;
    resourceType: 'MENU_CATEGORY' | 'MENU_ITEM';
    resourceId: string;
    requestId?: string;
  }): Promise<RestaurantOutletRecord> {
    const outlet = await this.restaurantStore.getOutletById(params.outletId);
    if (!outlet) {
      throw new AppError(404, 'NOT_FOUND', `Outlet "${params.outletId}" was not found`);
    }

    const isAdmin = params.actorRole === 'OPS_ADMIN' || params.actorRole === 'SUPER_ADMIN';
    if (isAdmin) {
      assertMfaSatisfiedForRole(params.actorRole, params.mfaVerified);
      return outlet;
    }

    const memberships = await this.rbacStore.listMembershipsForUser(params.actorUserId);
    const allowed = hasOutletMembership(memberships, outlet.restaurantId, outlet.outletId);
    if (!allowed) {
      await this.rbacStore.appendAuditLog({
        actorId: params.actorUserId,
        actorRole: params.actorRole,
        action: params.auditAction,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        outcome: 'DENIED',
        reason: `Cross-tenant catalog access denied for outlet ${outlet.outletId}`,
        requestId: params.requestId ?? null,
        now: this.clock.now(),
      });
      throw new AppError(
        403,
        'FORBIDDEN',
        'You do not have active staff membership for this restaurant outlet',
      );
    }

    return outlet;
  }

  async getPublicOutletMenu(
    outletId: string,
    filters?: {
      dietaryType?: DietaryType;
      availableOnly?: boolean;
      excludeAllergens?: AllergenCode[];
    },
  ): Promise<OutletCatalogDto> {
    const outlet = await this.restaurantStore.getOutletById(outletId);
    if (!outlet || outlet.status !== 'ACTIVE') {
      throw new AppError(
        404,
        'NOT_FOUND',
        `Active outlet "${outletId}" was not found for catalog browsing`,
      );
    }

    const [categories, items] = await Promise.all([
      this.catalogStore.listCategoriesByOutlet(outletId),
      this.catalogStore.listMenuItemsByOutlet(
        outletId,
        filters?.availableOnly ? { availableOnly: true } : undefined,
      ),
    ]);

    const activeCategories = categories.filter((c) => c.isActive);
    const activeCategoryIds = new Set(activeCategories.map((c) => c.categoryId));
    const excluded = new Set(filters?.excludeAllergens ?? []);

    const visibleItems = items.filter((item) => {
      if (!activeCategoryIds.has(item.categoryId)) {
        return false;
      }
      if (filters?.dietaryType && item.dietaryType !== filters.dietaryType) {
        return false;
      }
      if (excluded.size > 0 && item.allergens.some((code) => excluded.has(code))) {
        return false;
      }
      return true;
    });

    const latestUpdatedAt = [
      outlet.updatedAt,
      ...activeCategories.map((c) => c.updatedAt),
      ...visibleItems.map((i) => i.updatedAt),
    ].reduce((max, date) => (date.getTime() > max.getTime() ? date : max), outlet.updatedAt);

    return {
      outletId: outlet.outletId,
      restaurantId: outlet.restaurantId,
      outletName: outlet.name,
      brandName: outlet.brandName,
      currency: 'INR',
      priceUnit: 'paise',
      categories: activeCategories.map(toCategoryDto),
      items: visibleItems.map(toMenuItemDto),
      totalItems: visibleItems.length,
      availableItems: visibleItems.filter((item) => item.isAvailable).length,
      updatedAt: latestUpdatedAt.toISOString(),
    };
  }

  async listPartnerOutletCatalog(params: {
    actorUserId: string;
    actorRole: UserRole;
    mfaVerified: boolean;
    outletId: string;
    requestId?: string;
  }): Promise<{ catalog: OutletCatalogDto; audits: CatalogAuditEntryDto[] }> {
    const outlet = await this.assertAuthorizedOutlet({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      mfaVerified: params.mfaVerified,
      outletId: params.outletId,
      auditAction: 'catalog.menu.read',
      resourceType: 'MENU_ITEM',
      resourceId: params.outletId,
      ...(params.requestId ? { requestId: params.requestId } : {}),
    });

    const [categories, items, allLogs] = await Promise.all([
      this.catalogStore.listCategoriesByOutlet(outlet.outletId),
      this.catalogStore.listMenuItemsByOutlet(outlet.outletId),
      this.rbacStore.listAuditLogs(100),
    ]);

    const ownedResourceIds = new Set<string>([
      outlet.outletId,
      ...categories.map((c) => c.categoryId),
      ...items.map((i) => i.itemId),
    ]);

    const audits: CatalogAuditEntryDto[] = allLogs
      .filter(
        (entry) =>
          (entry.resourceType === 'MENU_CATEGORY' || entry.resourceType === 'MENU_ITEM') &&
          ownedResourceIds.has(entry.resourceId),
      )
      .slice(0, 25)
      .map((entry) => ({
        auditId: entry.auditId,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        outcome: entry.outcome,
        reason: entry.reason ?? null,
        createdAt: entry.createdAt.toISOString(),
      }));

    const latestUpdatedAt = [
      outlet.updatedAt,
      ...categories.map((c) => c.updatedAt),
      ...items.map((i) => i.updatedAt),
    ].reduce((max, date) => (date.getTime() > max.getTime() ? date : max), outlet.updatedAt);

    return {
      catalog: {
        outletId: outlet.outletId,
        restaurantId: outlet.restaurantId,
        outletName: outlet.name,
        brandName: outlet.brandName,
        currency: 'INR',
        priceUnit: 'paise',
        categories: categories.map(toCategoryDto),
        items: items.map(toMenuItemDto),
        totalItems: items.length,
        availableItems: items.filter((i) => i.isAvailable).length,
        updatedAt: latestUpdatedAt.toISOString(),
      },
      audits,
    };
  }

  async createCategory(params: {
    actorUserId: string;
    actorRole: UserRole;
    mfaVerified: boolean;
    rawBody: unknown;
    requestId?: string;
  }): Promise<MenuCategoryDto> {
    const input = createCategorySchema.parse(params.rawBody);
    const outlet = await this.assertAuthorizedOutlet({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      mfaVerified: params.mfaVerified,
      outletId: input.outletId,
      auditAction: 'catalog.category.create',
      resourceType: 'MENU_CATEGORY',
      resourceId: input.outletId,
      ...(params.requestId ? { requestId: params.requestId } : {}),
    });

    const now = this.clock.now();
    const categoryId = `mcat_${crypto.randomUUID().slice(0, 12)}`;
    const saved = await this.catalogStore.createCategory({
      categoryId,
      outletId: outlet.outletId,
      restaurantId: outlet.restaurantId,
      name: input.name,
      nameSlug: toSlug(input.name),
      description: input.description,
      sortOrder: input.sortOrder,
      isActive: input.isActive,
      createdByUserId: params.actorUserId,
      createdAt: now,
      updatedAt: now,
    });

    await this.rbacStore.appendAuditLog({
      actorId: params.actorUserId,
      actorRole: params.actorRole,
      action: 'catalog.category.created',
      resourceType: 'MENU_CATEGORY',
      resourceId: saved.categoryId,
      outcome: 'ALLOWED',
      reason: `Created category "${saved.name}" on outlet ${outlet.outletId}`,
      requestId: params.requestId ?? null,
      now,
    });

    this.logger.info('catalog.category.created', {
      categoryId: saved.categoryId,
      outletId: outlet.outletId,
    });

    return toCategoryDto(saved);
  }

  async updateCategory(params: {
    categoryId: string;
    actorUserId: string;
    actorRole: UserRole;
    mfaVerified: boolean;
    rawBody: unknown;
    requestId?: string;
  }): Promise<MenuCategoryDto> {
    const input = updateCategorySchema.parse(params.rawBody);
    const existing = await this.catalogStore.getCategoryById(params.categoryId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', `Menu category "${params.categoryId}" not found`);
    }

    await this.assertAuthorizedOutlet({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      mfaVerified: params.mfaVerified,
      outletId: existing.outletId,
      auditAction: 'catalog.category.update',
      resourceType: 'MENU_CATEGORY',
      resourceId: existing.categoryId,
      ...(params.requestId ? { requestId: params.requestId } : {}),
    });

    const now = this.clock.now();
    const updated = await this.catalogStore.updateCategory(existing.categoryId, {
      ...(input.name !== undefined ? { name: input.name, nameSlug: toSlug(input.name) } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      updatedAt: now,
    });
    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', `Menu category "${params.categoryId}" not found`);
    }

    await this.rbacStore.appendAuditLog({
      actorId: params.actorUserId,
      actorRole: params.actorRole,
      action: 'catalog.category.updated',
      resourceType: 'MENU_CATEGORY',
      resourceId: updated.categoryId,
      outcome: 'ALLOWED',
      reason: `Updated category "${updated.name}" (active=${String(updated.isActive)})`,
      requestId: params.requestId ?? null,
      now,
    });

    return toCategoryDto(updated);
  }

  async createMenuItem(params: {
    actorUserId: string;
    actorRole: UserRole;
    mfaVerified: boolean;
    rawBody: unknown;
    requestId?: string;
  }): Promise<MenuItemDto> {
    const input = createMenuItemSchema.parse(params.rawBody);
    const outlet = await this.assertAuthorizedOutlet({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      mfaVerified: params.mfaVerified,
      outletId: input.outletId,
      auditAction: 'catalog.item.create',
      resourceType: 'MENU_ITEM',
      resourceId: input.outletId,
      ...(params.requestId ? { requestId: params.requestId } : {}),
    });

    const category = await this.catalogStore.getCategoryById(input.categoryId);
    if (!category || category.outletId !== outlet.outletId) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `Category "${input.categoryId}" does not belong to outlet "${outlet.outletId}"`,
      );
    }

    const now = this.clock.now();
    const itemId = `mitem_${crypto.randomUUID().slice(0, 12)}`;
    const allergens = dedupeAllergens(input.allergens);
    const saved = await this.catalogStore.createMenuItem({
      itemId,
      outletId: outlet.outletId,
      restaurantId: outlet.restaurantId,
      categoryId: category.categoryId,
      title: input.title,
      description: input.description,
      pricePaise: input.pricePaise,
      gstTaxSlab: input.gstTaxSlab,
      dietaryType: input.dietaryType,
      allergens,
      allergenDisclosureConfirmed: input.allergenDisclosureConfirmed,
      imageUrl: input.imageUrl,
      isAvailable: input.isAvailable,
      dailyStockRemaining: input.dailyStockRemaining,
      prepTimeMinutes: input.prepTimeMinutes,
      variants: normalizeVariantGroups(input.variants),
      addonGroups: normalizeAddonGroups(input.addonGroups),
      createdByUserId: params.actorUserId,
      updatedByUserId: params.actorUserId,
      createdAt: now,
      updatedAt: now,
    });

    await this.rbacStore.appendAuditLog({
      actorId: params.actorUserId,
      actorRole: params.actorRole,
      action: 'catalog.item.created',
      resourceType: 'MENU_ITEM',
      resourceId: saved.itemId,
      outcome: 'ALLOWED',
      reason: `Created item "${saved.title}" at ${saved.pricePaise} paise (${saved.dietaryType}; allergens=${allergens.join(',') || 'NONE'})`,
      requestId: params.requestId ?? null,
      now,
    });

    this.logger.info('catalog.item.created', {
      itemId: saved.itemId,
      outletId: saved.outletId,
      pricePaise: saved.pricePaise,
    });

    return toMenuItemDto(saved);
  }

  async updateMenuItem(params: {
    itemId: string;
    actorUserId: string;
    actorRole: UserRole;
    mfaVerified: boolean;
    rawBody: unknown;
    requestId?: string;
  }): Promise<MenuItemDto> {
    const input = updateMenuItemSchema.parse(params.rawBody);
    const existing = await this.catalogStore.getMenuItemById(params.itemId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', `Menu item "${params.itemId}" not found`);
    }

    await this.assertAuthorizedOutlet({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      mfaVerified: params.mfaVerified,
      outletId: existing.outletId,
      auditAction: 'catalog.item.update',
      resourceType: 'MENU_ITEM',
      resourceId: existing.itemId,
      ...(params.requestId ? { requestId: params.requestId } : {}),
    });

    if (input.categoryId !== undefined) {
      const category = await this.catalogStore.getCategoryById(input.categoryId);
      if (!category || category.outletId !== existing.outletId) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Category "${input.categoryId}" does not belong to outlet "${existing.outletId}"`,
        );
      }
    }

    const now = this.clock.now();
    const nextAllergens =
      input.allergens !== undefined ? dedupeAllergens(input.allergens) : existing.allergens;
    const updated = await this.catalogStore.updateMenuItem(existing.itemId, {
      ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.pricePaise !== undefined ? { pricePaise: input.pricePaise } : {}),
      ...(input.gstTaxSlab !== undefined ? { gstTaxSlab: input.gstTaxSlab } : {}),
      ...(input.dietaryType !== undefined ? { dietaryType: input.dietaryType } : {}),
      ...(input.allergens !== undefined ? { allergens: nextAllergens } : {}),
      ...(input.allergenDisclosureConfirmed !== undefined
        ? { allergenDisclosureConfirmed: input.allergenDisclosureConfirmed }
        : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.isAvailable !== undefined ? { isAvailable: input.isAvailable } : {}),
      ...(input.dailyStockRemaining !== undefined
        ? { dailyStockRemaining: input.dailyStockRemaining }
        : {}),
      ...(input.prepTimeMinutes !== undefined ? { prepTimeMinutes: input.prepTimeMinutes } : {}),
      ...(input.variants !== undefined ? { variants: normalizeVariantGroups(input.variants) } : {}),
      ...(input.addonGroups !== undefined
        ? { addonGroups: normalizeAddonGroups(input.addonGroups) }
        : {}),
      updatedByUserId: params.actorUserId,
      updatedAt: now,
    });

    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', `Menu item "${params.itemId}" not found`);
    }

    const changeParts: string[] = [];
    if (input.pricePaise !== undefined && input.pricePaise !== existing.pricePaise) {
      changeParts.push(`price ${existing.pricePaise}->${updated.pricePaise} paise`);
    }
    if (input.allergens !== undefined) {
      changeParts.push(`allergens=${nextAllergens.join(',') || 'NONE'}`);
    }
    if (input.isAvailable !== undefined && input.isAvailable !== existing.isAvailable) {
      changeParts.push(`available=${String(updated.isAvailable)}`);
    }
    if (changeParts.length === 0) {
      changeParts.push('catalog metadata updated');
    }

    await this.rbacStore.appendAuditLog({
      actorId: params.actorUserId,
      actorRole: params.actorRole,
      action:
        input.pricePaise !== undefined && input.pricePaise !== existing.pricePaise
          ? 'catalog.item.price.updated'
          : 'catalog.item.updated',
      resourceType: 'MENU_ITEM',
      resourceId: updated.itemId,
      outcome: 'ALLOWED',
      reason: `Updated item "${updated.title}": ${changeParts.join('; ')}`,
      requestId: params.requestId ?? null,
      now,
    });

    return toMenuItemDto(updated);
  }

  async updateItemAvailability(params: {
    itemId: string;
    actorUserId: string;
    actorRole: UserRole;
    mfaVerified: boolean;
    rawBody: unknown;
    requestId?: string;
  }): Promise<MenuItemDto> {
    const input = updateAvailabilitySchema.parse(params.rawBody);
    const existing = await this.catalogStore.getMenuItemById(params.itemId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', `Menu item "${params.itemId}" not found`);
    }

    await this.assertAuthorizedOutlet({
      actorUserId: params.actorUserId,
      actorRole: params.actorRole,
      mfaVerified: params.mfaVerified,
      outletId: existing.outletId,
      auditAction: 'catalog.item.availability.update',
      resourceType: 'MENU_ITEM',
      resourceId: existing.itemId,
      ...(params.requestId ? { requestId: params.requestId } : {}),
    });

    const now = this.clock.now();
    const updated = await this.catalogStore.updateMenuItem(existing.itemId, {
      isAvailable: input.isAvailable,
      ...(input.dailyStockRemaining !== undefined
        ? { dailyStockRemaining: input.dailyStockRemaining }
        : {}),
      updatedByUserId: params.actorUserId,
      updatedAt: now,
    });

    if (!updated) {
      throw new AppError(404, 'NOT_FOUND', `Menu item "${params.itemId}" not found`);
    }

    await this.rbacStore.appendAuditLog({
      actorId: params.actorUserId,
      actorRole: params.actorRole,
      action: 'catalog.item.availability.updated',
      resourceType: 'MENU_ITEM',
      resourceId: updated.itemId,
      outcome: 'ALLOWED',
      reason: `Availability changed ${String(existing.isAvailable)}->${String(updated.isAvailable)}${input.reason ? ` (${input.reason})` : ''}`,
      requestId: params.requestId ?? null,
      now,
    });

    return toMenuItemDto(updated);
  }
}
