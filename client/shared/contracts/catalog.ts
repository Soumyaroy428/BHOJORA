export const DIETARY_TYPES = ['PURE_VEG', 'NON_VEG', 'EGG'] as const;
export type DietaryType = (typeof DIETARY_TYPES)[number];

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
] as const;
export type AllergenCode = (typeof ALLERGEN_CODES)[number];

export const GST_TAX_SLABS = ['RESTAURANT_5_PCT', 'BAKERY_18_PCT', 'EXEMPT_0_PCT'] as const;
export type GstTaxSlab = (typeof GST_TAX_SLABS)[number];

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

export interface MenuVariantOptionDto {
  optionId: string;
  label: string;
  priceDeltaPaise: number;
  isDefault: boolean;
  isAvailable: boolean;
  dietaryType?: DietaryType;
}

export interface MenuVariantGroupDto {
  groupId: string;
  name: string;
  required: boolean;
  minSelections: number;
  maxSelections: number;
  options: MenuVariantOptionDto[];
}

export interface MenuAddonOptionDto {
  optionId: string;
  label: string;
  pricePaise: number;
  dietaryType: DietaryType;
  allergens: AllergenCode[];
  isAvailable: boolean;
}

export interface MenuAddonGroupDto {
  groupId: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  options: MenuAddonOptionDto[];
}

export interface MenuCategoryDto {
  categoryId: string;
  outletId: string;
  restaurantId: string;
  name: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MenuItemDto {
  itemId: string;
  outletId: string;
  restaurantId: string;
  categoryId: string;
  title: string;
  description: string;
  pricePaise: number;
  formattedPriceInr: string;
  gstTaxSlab: GstTaxSlab;
  dietaryType: DietaryType;
  dietaryBadgeLabel: string;
  allergens: AllergenCode[];
  allergenLabels: string[];
  allergenDisclosureConfirmed: boolean;
  imageUrl: string | null;
  isAvailable: boolean;
  dailyStockRemaining: number | null;
  prepTimeMinutes: number | null;
  variants: MenuVariantGroupDto[];
  addonGroups: MenuAddonGroupDto[];
  createdAt: string;
  updatedAt: string;
}

export interface OutletCatalogDto {
  outletId: string;
  restaurantId: string;
  outletName: string;
  brandName: string;
  currency: 'INR';
  priceUnit: 'paise';
  categories: MenuCategoryDto[];
  items: MenuItemDto[];
  totalItems: number;
  availableItems: number;
  updatedAt: string;
}

export interface CatalogAuditEntryDto {
  auditId: string;
  actorId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: 'ALLOWED' | 'DENIED';
  reason: string | null;
  createdAt: string;
}
