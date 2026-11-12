import type {
  AllergenCode,
  DietaryType,
  GstTaxSlab,
  MenuAddonGroupDto,
  MenuCategoryDto,
  MenuItemDto,
  MenuVariantGroupDto,
} from '@bhojora/shared';

export const DIETARY_TYPES = [
  'PURE_VEG',
  'NON_VEG',
  'EGG',
] as const satisfies readonly DietaryType[];

export const ALLERGEN_CODES = [
  'DAIRY',
  'EGG',
  'PEANUTS',
  'TREE_NUTS',
  'GLUTEN',
  'SOY',
  'FISH',
  'SHELLFISH',
  'SESAME',
  'MUSTARD',
  'SULPHITES',
] as const satisfies readonly AllergenCode[];

export const GST_TAX_SLABS = [
  'RESTAURANT_5_PCT',
  'BAKERY_18_PCT',
  'EXEMPT_0_PCT',
] as const satisfies readonly GstTaxSlab[];

export const DIETARY_LABELS: Readonly<Record<DietaryType, string>> = {
  PURE_VEG: 'Pure Veg',
  NON_VEG: 'Non-Veg',
  EGG: 'Contains Egg',
};

export const ALLERGEN_LABELS: Readonly<Record<AllergenCode, string>> = {
  DAIRY: 'Contains Dairy',
  EGG: 'Contains Egg',
  PEANUTS: 'Contains Peanuts',
  TREE_NUTS: 'Contains Tree Nuts',
  GLUTEN: 'Contains Gluten',
  SOY: 'Contains Soy',
  FISH: 'Contains Fish',
  SHELLFISH: 'Contains Shellfish',
  SESAME: 'Contains Sesame',
  MUSTARD: 'Contains Mustard',
  SULPHITES: 'Contains Sulphites',
};

export function formatInrFromPaise(amountPaise: number): string {
  const safePaise = Number.isInteger(amountPaise) ? amountPaise : Math.trunc(amountPaise);
  const sign = safePaise < 0 ? '-' : '';
  const absPaise = Math.abs(safePaise);
  const rupees = Math.trunc(absPaise / 100);
  const remPaise = absPaise % 100;
  if (remPaise === 0) {
    return `${sign}₹${rupees.toLocaleString('en-IN')}`;
  }
  return `${sign}₹${rupees.toLocaleString('en-IN')}.${String(remPaise).padStart(2, '0')}`;
}

export interface MenuCategoryRecord {
  categoryId: string;
  outletId: string;
  restaurantId: string;
  name: string;
  nameSlug: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MenuItemRecord {
  itemId: string;
  outletId: string;
  restaurantId: string;
  categoryId: string;
  title: string;
  description: string;
  pricePaise: number;
  gstTaxSlab: GstTaxSlab;
  dietaryType: DietaryType;
  allergens: AllergenCode[];
  allergenDisclosureConfirmed: boolean;
  imageUrl: string | null;
  isAvailable: boolean;
  dailyStockRemaining: number | null;
  prepTimeMinutes: number | null;
  variants: MenuVariantGroupDto[];
  addonGroups: MenuAddonGroupDto[];
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CatalogStore {
  createCategory(record: MenuCategoryRecord): Promise<MenuCategoryRecord>;
  getCategoryById(categoryId: string): Promise<MenuCategoryRecord | null>;
  listCategoriesByOutlet(outletId: string): Promise<MenuCategoryRecord[]>;
  updateCategory(
    categoryId: string,
    patch: Partial<
      Pick<MenuCategoryRecord, 'name' | 'nameSlug' | 'description' | 'sortOrder' | 'isActive'>
    > & { updatedAt: Date },
  ): Promise<MenuCategoryRecord | null>;

  createMenuItem(record: MenuItemRecord): Promise<MenuItemRecord>;
  getMenuItemById(itemId: string): Promise<MenuItemRecord | null>;
  listMenuItemsByOutlet(
    outletId: string,
    options?: { availableOnly?: boolean },
  ): Promise<MenuItemRecord[]>;
  updateMenuItem(
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
  ): Promise<MenuItemRecord | null>;
}

export type {
  AllergenCode,
  DietaryType,
  GstTaxSlab,
  MenuAddonGroupDto,
  MenuCategoryDto,
  MenuItemDto,
  MenuVariantGroupDto,
};
