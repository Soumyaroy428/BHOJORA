import type {
  CartAddonSelectionDto,
  CartDto,
  CartVariantSelectionDto,
  DietaryType,
  GstTaxSlab,
  AllergenCode,
} from '@bhojora/shared';
import type { KolkataZoneId } from '../customer/customer.types';

export const CART_CONSTANTS = {
  maxQuantityPerLine: 20,
  maxDistinctLines: 25,
} as const;

export const CLIENT_TAMPER_MONEY_KEYS = new Set<string>([
  'price',
  'pricePaise',
  'unitPrice',
  'unitPricePaise',
  'unitBasePricePaise',
  'customizationDeltaPaise',
  'effectiveUnitPricePaise',
  'lineTotalPaise',
  'priceAtAddPaise',
  'itemsSubtotalPaise',
  'subtotalPaise',
  'discountPaise',
  'packagingChargePaise',
  'deliveryFeePaise',
  'deliveryBaseFeePaise',
  'deliveryDistanceFeePaise',
  'platformFeePaise',
  'gstTaxPaise',
  'taxPaise',
  'cgstPaise',
  'sgstPaise',
  'totalPayablePaise',
  'totalPaise',
  'signature',
  'quoteId',
]);

export interface CartItemRecord {
  cartItemId: string;
  menuItemId: string;
  titleSnapshot: string;
  dietaryType: DietaryType;
  allergens: AllergenCode[];
  gstTaxSlab: GstTaxSlab;
  quantity: number;
  unitBasePricePaise: number;
  customizationDeltaPaise: number;
  effectiveUnitPricePaise: number;
  priceAtAddPaise: number;
  selectedVariants: CartVariantSelectionDto[];
  selectedAddons: CartAddonSelectionDto[];
  selectionSignature: string;
  updatedAt: Date;
}

export interface CartRecord {
  cartId: string;
  customerId: string;
  outletId: string | null;
  outletName: string | null;
  brandName: string | null;
  outletZoneId: KolkataZoneId | null;
  items: CartItemRecord[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CartStore {
  getCartByCustomerId(customerId: string): Promise<CartRecord | null>;
  saveCart(cart: CartRecord): Promise<CartRecord>;
  deleteCartByCustomerId(customerId: string): Promise<void>;
}

export type { CartDto };
