import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import type {
  AllergenCode,
  DietaryType,
  GstTaxSlab,
  MenuAddonGroupDto,
  MenuAddonOptionDto,
  MenuVariantGroupDto,
  MenuVariantOptionDto,
} from '@bhojora/shared';
import {
  applyBaseSchemaConventions,
  COLLECTION_NAMES,
  paiseField,
} from '../../database/conventions';
import { AppError } from '../../middleware/error-handler';
import {
  ALLERGEN_CODES,
  DIETARY_TYPES,
  GST_TAX_SLABS,
  type CatalogStore,
  type MenuCategoryRecord,
  type MenuItemRecord,
} from './catalog.types';

const variantOptionSubSchema = new Schema(
  {
    optionId: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    priceDeltaPaise: paiseField({ default: 0 }),
    isDefault: { type: Boolean, required: true, default: false },
    isAvailable: { type: Boolean, required: true, default: true },
    dietaryType: { type: String, enum: DIETARY_TYPES, required: false },
  },
  { _id: false },
);

const variantGroupSubSchema = new Schema(
  {
    groupId: { type: String, required: true, trim: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    required: { type: Boolean, required: true, default: true },
    minSelections: { type: Number, required: true, min: 0, max: 10 },
    maxSelections: { type: Number, required: true, min: 1, max: 10 },
    options: { type: [variantOptionSubSchema], required: true },
  },
  { _id: false },
);

const addonOptionSubSchema = new Schema(
  {
    optionId: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 80 },
    pricePaise: paiseField({ default: 0 }),
    dietaryType: { type: String, enum: DIETARY_TYPES, required: true, default: 'PURE_VEG' },
    allergens: { type: [{ type: String, enum: ALLERGEN_CODES }], required: true, default: [] },
    isAvailable: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

const addonGroupSubSchema = new Schema(
  {
    groupId: { type: String, required: true, trim: true, maxlength: 80 },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    minSelections: { type: Number, required: true, min: 0, max: 15 },
    maxSelections: { type: Number, required: true, min: 1, max: 15 },
    options: { type: [addonOptionSubSchema], required: true },
  },
  { _id: false },
);

const menuCategorySchema = applyBaseSchemaConventions(
  new Schema({
    categoryId: { type: String, required: true, trim: true },
    outletId: { type: String, required: true, trim: true },
    restaurantId: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    nameSlug: { type: String, required: true, trim: true, maxlength: 100 },
    description: { type: String, required: false, trim: true, default: '', maxlength: 240 },
    sortOrder: { type: Number, required: true, min: 0, max: 9999, default: 0 },
    isActive: { type: Boolean, required: true, default: true },
    createdByUserId: { type: String, required: true, trim: true },
  }),
);

const menuItemSchema = applyBaseSchemaConventions(
  new Schema({
    itemId: { type: String, required: true, trim: true },
    outletId: { type: String, required: true, trim: true },
    restaurantId: { type: String, required: true, trim: true },
    categoryId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, required: false, trim: true, default: '', maxlength: 400 },
    pricePaise: paiseField(),
    gstTaxSlab: {
      type: String,
      enum: GST_TAX_SLABS,
      required: true,
      default: 'RESTAURANT_5_PCT',
    },
    dietaryType: { type: String, enum: DIETARY_TYPES, required: true },
    allergens: { type: [{ type: String, enum: ALLERGEN_CODES }], required: true, default: [] },
    allergenDisclosureConfirmed: { type: Boolean, required: true, default: false },
    imageUrl: { type: String, required: false, default: null, maxlength: 512 },
    isAvailable: { type: Boolean, required: true, default: true },
    dailyStockRemaining: { type: Number, required: false, default: null, min: 0, max: 100000 },
    prepTimeMinutes: { type: Number, required: false, default: null, min: 5, max: 180 },
    variants: { type: [variantGroupSubSchema], required: true, default: [] },
    addonGroups: { type: [addonGroupSubSchema], required: true, default: [] },
    createdByUserId: { type: String, required: true, trim: true },
    updatedByUserId: { type: String, required: true, trim: true },
  }),
);

const itemCustomizationSchema = applyBaseSchemaConventions(
  new Schema({
    itemId: { type: String, required: true, trim: true },
    outletId: { type: String, required: true, trim: true },
    variants: { type: [variantGroupSubSchema], required: true, default: [] },
    addonGroups: { type: [addonGroupSubSchema], required: true, default: [] },
  }),
);

const inventoryRecordSchema = applyBaseSchemaConventions(
  new Schema({
    itemId: { type: String, required: true, trim: true },
    outletId: { type: String, required: true, trim: true },
    isAvailable: { type: Boolean, required: true, default: true },
    dailyStockRemaining: { type: Number, required: false, default: null, min: 0, max: 100000 },
  }),
);

function cloneVariants(variants: readonly MenuVariantGroupDto[]): MenuVariantGroupDto[] {
  return variants.map((group) => ({
    ...group,
    options: group.options.map((opt): MenuVariantOptionDto => ({ ...opt })),
  }));
}

function cloneAddonGroups(groups: readonly MenuAddonGroupDto[]): MenuAddonGroupDto[] {
  return groups.map((group) => ({
    ...group,
    options: group.options.map((opt): MenuAddonOptionDto => ({
      ...opt,
      allergens: [...opt.allergens],
    })),
  }));
}

function toDate(value: unknown, fallback: Date): Date {
  return value instanceof Date ? value : new Date(fallback.getTime());
}

function toCategoryRecord(doc: Record<string, unknown>): MenuCategoryRecord {
  const now = new Date();
  return {
    categoryId: String(doc['categoryId']),
    outletId: String(doc['outletId']),
    restaurantId: String(doc['restaurantId']),
    name: String(doc['name']),
    nameSlug: String(doc['nameSlug']),
    description: typeof doc['description'] === 'string' ? doc['description'] : '',
    sortOrder: Number(doc['sortOrder'] ?? 0),
    isActive: doc['isActive'] !== false,
    createdByUserId: String(doc['createdByUserId'] ?? ''),
    createdAt: toDate(doc['createdAt'], now),
    updatedAt: toDate(doc['updatedAt'], now),
  };
}

function toMenuItemRecord(doc: Record<string, unknown>): MenuItemRecord {
  const now = new Date();
  return {
    itemId: String(doc['itemId']),
    outletId: String(doc['outletId']),
    restaurantId: String(doc['restaurantId']),
    categoryId: String(doc['categoryId']),
    title: String(doc['title']),
    description: typeof doc['description'] === 'string' ? doc['description'] : '',
    pricePaise: Number(doc['pricePaise']),
    gstTaxSlab: (doc['gstTaxSlab'] as GstTaxSlab) ?? 'RESTAURANT_5_PCT',
    dietaryType: doc['dietaryType'] as DietaryType,
    allergens: Array.isArray(doc['allergens']) ? ([...doc['allergens']] as AllergenCode[]) : [],
    allergenDisclosureConfirmed: Boolean(doc['allergenDisclosureConfirmed']),
    imageUrl: typeof doc['imageUrl'] === 'string' ? doc['imageUrl'] : null,
    isAvailable: doc['isAvailable'] !== false,
    dailyStockRemaining:
      typeof doc['dailyStockRemaining'] === 'number' ? Number(doc['dailyStockRemaining']) : null,
    prepTimeMinutes:
      typeof doc['prepTimeMinutes'] === 'number' ? Number(doc['prepTimeMinutes']) : null,
    variants: Array.isArray(doc['variants'])
      ? cloneVariants(doc['variants'] as MenuVariantGroupDto[])
      : [],
    addonGroups: Array.isArray(doc['addonGroups'])
      ? cloneAddonGroups(doc['addonGroups'] as MenuAddonGroupDto[])
      : [],
    createdByUserId: String(doc['createdByUserId'] ?? ''),
    updatedByUserId: String(doc['updatedByUserId'] ?? ''),
    createdAt: toDate(doc['createdAt'], now),
    updatedAt: toDate(doc['updatedAt'], now),
  };
}

export function createMongooseCatalogModels(connection: Connection): {
  categoryModel: Model<Record<string, unknown>>;
  itemModel: Model<Record<string, unknown>>;
  customizationModel: Model<Record<string, unknown>>;
  inventoryModel: Model<Record<string, unknown>>;
} {
  const categoryModel =
    (connection.models['BhojoraMenuCategory'] as Model<Record<string, unknown>> | undefined) ??
    connection.model<Record<string, unknown>>(
      'BhojoraMenuCategory',
      menuCategorySchema,
      COLLECTION_NAMES.menuCategories,
    );
  const itemModel =
    (connection.models['BhojoraMenuItem'] as Model<Record<string, unknown>> | undefined) ??
    connection.model<Record<string, unknown>>(
      'BhojoraMenuItem',
      menuItemSchema,
      COLLECTION_NAMES.menuItems,
    );
  const customizationModel =
    (connection.models['BhojoraItemCustomization'] as Model<Record<string, unknown>> | undefined) ??
    connection.model<Record<string, unknown>>(
      'BhojoraItemCustomization',
      itemCustomizationSchema,
      COLLECTION_NAMES.itemCustomizations,
    );
  const inventoryModel =
    (connection.models['BhojoraInventoryRecord'] as Model<Record<string, unknown>> | undefined) ??
    connection.model<Record<string, unknown>>(
      'BhojoraInventoryRecord',
      inventoryRecordSchema,
      COLLECTION_NAMES.inventoryRecords,
    );

  return { categoryModel, itemModel, customizationModel, inventoryModel };
}

export class MongooseCatalogStore implements CatalogStore {
  private readonly categoryModel: Model<Record<string, unknown>>;
  private readonly itemModel: Model<Record<string, unknown>>;
  private readonly customizationModel: Model<Record<string, unknown>>;
  private readonly inventoryModel: Model<Record<string, unknown>>;

  constructor(connection: Connection) {
    const models = createMongooseCatalogModels(connection);
    this.categoryModel = models.categoryModel;
    this.itemModel = models.itemModel;
    this.customizationModel = models.customizationModel;
    this.inventoryModel = models.inventoryModel;
  }

  async createCategory(record: MenuCategoryRecord): Promise<MenuCategoryRecord> {
    const doc = new this.categoryModel({ ...record });
    const created = await doc.save();
    return toCategoryRecord(created.toObject() as Record<string, unknown>);
  }

  async getCategoryById(categoryId: string): Promise<MenuCategoryRecord | null> {
    const doc = await this.categoryModel.findOne({ categoryId }).lean();
    return doc ? toCategoryRecord(doc as Record<string, unknown>) : null;
  }

  async listCategoriesByOutlet(outletId: string): Promise<MenuCategoryRecord[]> {
    const docs = await this.categoryModel.find({ outletId }).sort({ sortOrder: 1, name: 1 }).lean();
    return docs.map((doc) => toCategoryRecord(doc as Record<string, unknown>));
  }

  async updateCategory(
    categoryId: string,
    patch: Partial<
      Pick<MenuCategoryRecord, 'name' | 'nameSlug' | 'description' | 'sortOrder' | 'isActive'>
    > & { updatedAt: Date },
  ): Promise<MenuCategoryRecord | null> {
    const updated = await this.categoryModel
      .findOneAndUpdate({ categoryId }, { $set: patch }, { returnDocument: 'after' })
      .lean();
    return updated ? toCategoryRecord(updated as Record<string, unknown>) : null;
  }

  async createMenuItem(record: MenuItemRecord): Promise<MenuItemRecord> {
    const doc = new this.itemModel({ ...record });
    const created = await doc.save();
    await Promise.all([
      this.customizationModel.findOneAndUpdate(
        { itemId: record.itemId },
        {
          $set: {
            itemId: record.itemId,
            outletId: record.outletId,
            variants: cloneVariants(record.variants),
            addonGroups: cloneAddonGroups(record.addonGroups),
          },
        },
        { upsert: true },
      ),
      this.inventoryModel.findOneAndUpdate(
        { itemId: record.itemId },
        {
          $set: {
            itemId: record.itemId,
            outletId: record.outletId,
            isAvailable: record.isAvailable,
            dailyStockRemaining: record.dailyStockRemaining,
          },
        },
        { upsert: true },
      ),
    ]);
    return toMenuItemRecord(created.toObject() as Record<string, unknown>);
  }

  async getMenuItemById(itemId: string): Promise<MenuItemRecord | null> {
    const doc = await this.itemModel.findOne({ itemId }).lean();
    return doc ? toMenuItemRecord(doc as Record<string, unknown>) : null;
  }

  async listMenuItemsByOutlet(
    outletId: string,
    options?: { availableOnly?: boolean },
  ): Promise<MenuItemRecord[]> {
    const filter: Record<string, unknown> = { outletId };
    if (options?.availableOnly) {
      filter['isAvailable'] = true;
    }
    const docs = await this.itemModel.find(filter).sort({ categoryId: 1, title: 1 }).lean();
    return docs.map((doc) => toMenuItemRecord(doc as Record<string, unknown>));
  }

  async updateMenuItem(
    itemId: string,
    patch: Partial<
      Pick<
        MenuItemRecord,
        | 'categoryId'
        | 'title'
        | 'description'
        | 'pricePaise'
        | 'gstTaxSlab'
        | 'dietaryType'
        | 'allergens'
        | 'allergenDisclosureConfirmed'
        | 'imageUrl'
        | 'isAvailable'
        | 'dailyStockRemaining'
        | 'prepTimeMinutes'
        | 'variants'
        | 'addonGroups'
        | 'updatedByUserId'
      >
    > & { updatedAt: Date },
  ): Promise<MenuItemRecord | null> {
    const updated = await this.itemModel
      .findOneAndUpdate({ itemId }, { $set: patch }, { returnDocument: 'after' })
      .lean();
    if (!updated) {
      return null;
    }
    const record = toMenuItemRecord(updated as Record<string, unknown>);
    if (patch.variants !== undefined || patch.addonGroups !== undefined) {
      await this.customizationModel.findOneAndUpdate(
        { itemId },
        {
          $set: {
            itemId,
            outletId: record.outletId,
            variants: cloneVariants(record.variants),
            addonGroups: cloneAddonGroups(record.addonGroups),
          },
        },
        { upsert: true },
      );
    }
    if (patch.isAvailable !== undefined || patch.dailyStockRemaining !== undefined) {
      await this.inventoryModel.findOneAndUpdate(
        { itemId },
        {
          $set: {
            itemId,
            outletId: record.outletId,
            isAvailable: record.isAvailable,
            dailyStockRemaining: record.dailyStockRemaining,
          },
        },
        { upsert: true },
      );
    }
    return record;
  }
}

export class InMemoryCatalogStore implements CatalogStore {
  private readonly categories = new Map<string, MenuCategoryRecord>();
  private readonly items = new Map<string, MenuItemRecord>();

  private cloneCategory(record: MenuCategoryRecord): MenuCategoryRecord {
    return {
      ...record,
      createdAt: new Date(record.createdAt.getTime()),
      updatedAt: new Date(record.updatedAt.getTime()),
    };
  }

  private cloneItem(record: MenuItemRecord): MenuItemRecord {
    return {
      ...record,
      allergens: [...record.allergens],
      variants: cloneVariants(record.variants),
      addonGroups: cloneAddonGroups(record.addonGroups),
      createdAt: new Date(record.createdAt.getTime()),
      updatedAt: new Date(record.updatedAt.getTime()),
    };
  }

  private assertIntegerPaise(value: number, label: string): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        `${label} must be a non-negative integer in paise.`,
      );
    }
  }

  async createCategory(record: MenuCategoryRecord): Promise<MenuCategoryRecord> {
    for (const existing of this.categories.values()) {
      if (existing.outletId === record.outletId && existing.nameSlug === record.nameSlug) {
        throw new AppError(
          409,
          'CONFLICT',
          `Menu category "${record.name}" already exists for this outlet.`,
        );
      }
    }
    const copy = this.cloneCategory(record);
    this.categories.set(copy.categoryId, copy);
    return this.cloneCategory(copy);
  }

  async getCategoryById(categoryId: string): Promise<MenuCategoryRecord | null> {
    const found = this.categories.get(categoryId);
    return found ? this.cloneCategory(found) : null;
  }

  async listCategoriesByOutlet(outletId: string): Promise<MenuCategoryRecord[]> {
    return Array.from(this.categories.values())
      .filter((item) => item.outletId === outletId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .map((item) => this.cloneCategory(item));
  }

  async updateCategory(
    categoryId: string,
    patch: Partial<
      Pick<MenuCategoryRecord, 'name' | 'nameSlug' | 'description' | 'sortOrder' | 'isActive'>
    > & { updatedAt: Date },
  ): Promise<MenuCategoryRecord | null> {
    const existing = this.categories.get(categoryId);
    if (!existing) {
      return null;
    }
    if (patch.nameSlug) {
      for (const other of this.categories.values()) {
        if (
          other.categoryId !== categoryId &&
          other.outletId === existing.outletId &&
          other.nameSlug === patch.nameSlug
        ) {
          throw new AppError(
            409,
            'CONFLICT',
            `Menu category "${patch.name ?? other.name}" already exists for this outlet.`,
          );
        }
      }
    }
    const updated: MenuCategoryRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date(patch.updatedAt.getTime()),
    };
    this.categories.set(categoryId, updated);
    return this.cloneCategory(updated);
  }

  async createMenuItem(record: MenuItemRecord): Promise<MenuItemRecord> {
    this.assertIntegerPaise(record.pricePaise, 'pricePaise');
    for (const group of record.variants) {
      for (const opt of group.options) {
        this.assertIntegerPaise(opt.priceDeltaPaise, `variant option ${opt.label}`);
      }
    }
    for (const group of record.addonGroups) {
      for (const opt of group.options) {
        this.assertIntegerPaise(opt.pricePaise, `addon option ${opt.label}`);
      }
    }
    const copy = this.cloneItem(record);
    this.items.set(copy.itemId, copy);
    return this.cloneItem(copy);
  }

  async getMenuItemById(itemId: string): Promise<MenuItemRecord | null> {
    const found = this.items.get(itemId);
    return found ? this.cloneItem(found) : null;
  }

  async listMenuItemsByOutlet(
    outletId: string,
    options?: { availableOnly?: boolean },
  ): Promise<MenuItemRecord[]> {
    return Array.from(this.items.values())
      .filter((item) => item.outletId === outletId && (!options?.availableOnly || item.isAvailable))
      .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.title.localeCompare(b.title))
      .map((item) => this.cloneItem(item));
  }

  async updateMenuItem(
    itemId: string,
    patch: Partial<
      Pick<
        MenuItemRecord,
        | 'categoryId'
        | 'title'
        | 'description'
        | 'pricePaise'
        | 'gstTaxSlab'
        | 'dietaryType'
        | 'allergens'
        | 'allergenDisclosureConfirmed'
        | 'imageUrl'
        | 'isAvailable'
        | 'dailyStockRemaining'
        | 'prepTimeMinutes'
        | 'variants'
        | 'addonGroups'
        | 'updatedByUserId'
      >
    > & { updatedAt: Date },
  ): Promise<MenuItemRecord | null> {
    const existing = this.items.get(itemId);
    if (!existing) {
      return null;
    }
    if (patch.pricePaise !== undefined) {
      this.assertIntegerPaise(patch.pricePaise, 'pricePaise');
    }
    if (patch.variants) {
      for (const group of patch.variants) {
        for (const opt of group.options) {
          this.assertIntegerPaise(opt.priceDeltaPaise, `variant option ${opt.label}`);
        }
      }
    }
    if (patch.addonGroups) {
      for (const group of patch.addonGroups) {
        for (const opt of group.options) {
          this.assertIntegerPaise(opt.pricePaise, `addon option ${opt.label}`);
        }
      }
    }
    const updated: MenuItemRecord = {
      ...existing,
      ...patch,
      allergens: patch.allergens ? [...patch.allergens] : [...existing.allergens],
      variants: patch.variants ? cloneVariants(patch.variants) : cloneVariants(existing.variants),
      addonGroups: patch.addonGroups
        ? cloneAddonGroups(patch.addonGroups)
        : cloneAddonGroups(existing.addonGroups),
      updatedAt: new Date(patch.updatedAt.getTime()),
    };
    this.items.set(itemId, updated);
    return this.cloneItem(updated);
  }
}
