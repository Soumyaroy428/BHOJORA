import type { AllergenCode, DietaryType, GstTaxSlab } from '@bhojora/shared';
import type { Connection, Model } from 'mongoose';
import { Schema } from 'mongoose';
import {
  applyBaseSchemaConventions,
  COLLECTION_NAMES,
  paiseField,
} from '../../database/conventions';
import { ALLERGEN_CODES, DIETARY_TYPES, GST_TAX_SLABS } from '../catalog/catalog.types';
import { KOLKATA_ZONE_IDS, type KolkataZoneId } from '../customer/customer.types';
import type { CartItemRecord, CartRecord, CartStore } from './cart.types';

const variantSelectionSchema = new Schema(
  {
    groupId: { type: String, required: true, trim: true, maxlength: 80 },
    optionId: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    priceDeltaPaise: paiseField(),
  },
  { _id: false },
);

const addonSelectionSchema = new Schema(
  {
    groupId: { type: String, required: true, trim: true, maxlength: 80 },
    optionId: { type: String, required: true, trim: true, maxlength: 80 },
    label: { type: String, required: true, trim: true, maxlength: 120 },
    pricePaise: paiseField(),
  },
  { _id: false },
);

const cartItemSchema = new Schema(
  {
    cartItemId: { type: String, required: true, trim: true, maxlength: 80 },
    menuItemId: { type: String, required: true, trim: true, maxlength: 80 },
    titleSnapshot: { type: String, required: true, trim: true, maxlength: 160 },
    dietaryType: { type: String, enum: DIETARY_TYPES, required: true },
    allergens: { type: [{ type: String, enum: ALLERGEN_CODES }], required: true, default: [] },
    gstTaxSlab: { type: String, enum: GST_TAX_SLABS, required: true },
    quantity: { type: Number, required: true, min: 1, max: 20 },
    unitBasePricePaise: paiseField(),
    customizationDeltaPaise: paiseField(),
    effectiveUnitPricePaise: paiseField(),
    priceAtAddPaise: paiseField(),
    selectedVariants: { type: [variantSelectionSchema], required: true, default: [] },
    selectedAddons: { type: [addonSelectionSchema], required: true, default: [] },
    selectionSignature: { type: String, required: true, trim: true, maxlength: 400 },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const cartSchema = applyBaseSchemaConventions(
  new Schema({
    cartId: { type: String, required: true, trim: true, maxlength: 80 },
    customerId: { type: String, required: true, trim: true, maxlength: 80 },
    outletId: { type: String, required: false, default: null, maxlength: 80 },
    outletName: { type: String, required: false, default: null, maxlength: 160 },
    brandName: { type: String, required: false, default: null, maxlength: 160 },
    outletZoneId: { type: String, enum: KOLKATA_ZONE_IDS, required: false, default: null },
    items: { type: [cartItemSchema], required: true, default: [] },
  }),
);

function mapPlainCart(doc: Record<string, unknown>): CartRecord {
  const rawItems = Array.isArray(doc['items']) ? doc['items'] : [];
  const items: CartItemRecord[] = rawItems.map((entry) => {
    const item = entry as Record<string, unknown>;
    return {
      cartItemId: String(item['cartItemId'] ?? ''),
      menuItemId: String(item['menuItemId'] ?? ''),
      titleSnapshot: String(item['titleSnapshot'] ?? ''),
      dietaryType: item['dietaryType'] as DietaryType,
      allergens: Array.isArray(item['allergens'])
        ? (item['allergens'].map(String) as AllergenCode[])
        : [],
      gstTaxSlab: (item['gstTaxSlab'] as GstTaxSlab) ?? 'RESTAURANT_5_PCT',
      quantity: Number(item['quantity'] ?? 1),
      unitBasePricePaise: Number(item['unitBasePricePaise'] ?? 0),
      customizationDeltaPaise: Number(item['customizationDeltaPaise'] ?? 0),
      effectiveUnitPricePaise: Number(item['effectiveUnitPricePaise'] ?? 0),
      priceAtAddPaise: Number(item['priceAtAddPaise'] ?? 0),
      selectedVariants: Array.isArray(item['selectedVariants'])
        ? item['selectedVariants'].map((v) => {
            const rec = v as Record<string, unknown>;
            return {
              groupId: String(rec['groupId'] ?? ''),
              optionId: String(rec['optionId'] ?? ''),
              label: String(rec['label'] ?? ''),
              priceDeltaPaise: Number(rec['priceDeltaPaise'] ?? 0),
            };
          })
        : [],
      selectedAddons: Array.isArray(item['selectedAddons'])
        ? item['selectedAddons'].map((a) => {
            const rec = a as Record<string, unknown>;
            return {
              groupId: String(rec['groupId'] ?? ''),
              optionId: String(rec['optionId'] ?? ''),
              label: String(rec['label'] ?? ''),
              pricePaise: Number(rec['pricePaise'] ?? 0),
            };
          })
        : [],
      selectionSignature: String(item['selectionSignature'] ?? ''),
      updatedAt: item['updatedAt'] instanceof Date ? item['updatedAt'] : new Date(),
    };
  });

  return {
    cartId: String(doc['cartId'] ?? ''),
    customerId: String(doc['customerId'] ?? ''),
    outletId: typeof doc['outletId'] === 'string' ? doc['outletId'] : null,
    outletName: typeof doc['outletName'] === 'string' ? doc['outletName'] : null,
    brandName: typeof doc['brandName'] === 'string' ? doc['brandName'] : null,
    outletZoneId:
      typeof doc['outletZoneId'] === 'string' ? (doc['outletZoneId'] as KolkataZoneId) : null,
    items,
    createdAt: doc['createdAt'] instanceof Date ? doc['createdAt'] : new Date(),
    updatedAt: doc['updatedAt'] instanceof Date ? doc['updatedAt'] : new Date(),
  };
}

function cloneCartRecord(record: CartRecord): CartRecord {
  return {
    ...record,
    items: record.items.map((item) => ({
      ...item,
      allergens: [...item.allergens],
      selectedVariants: item.selectedVariants.map((v) => ({ ...v })),
      selectedAddons: item.selectedAddons.map((a) => ({ ...a })),
      updatedAt: new Date(item.updatedAt.getTime()),
    })),
    createdAt: new Date(record.createdAt.getTime()),
    updatedAt: new Date(record.updatedAt.getTime()),
  };
}

export class MongooseCartStore implements CartStore {
  private readonly model: Model<Record<string, unknown>>;

  constructor(connection: Connection) {
    this.model =
      (connection.models['BhojoraCart'] as Model<Record<string, unknown>> | undefined) ??
      connection.model<Record<string, unknown>>('BhojoraCart', cartSchema, COLLECTION_NAMES.carts);
  }

  async getCartByCustomerId(customerId: string): Promise<CartRecord | null> {
    const doc = await this.model.findOne({ customerId }).lean<Record<string, unknown>>().exec();
    return doc ? mapPlainCart(doc) : null;
  }

  async saveCart(cart: CartRecord): Promise<CartRecord> {
    const doc = await this.model
      .findOneAndUpdate(
        { customerId: cart.customerId },
        {
          $set: {
            cartId: cart.cartId,
            customerId: cart.customerId,
            outletId: cart.outletId,
            outletName: cart.outletName,
            brandName: cart.brandName,
            outletZoneId: cart.outletZoneId,
            items: cart.items,
            updatedAt: cart.updatedAt,
          },
          $setOnInsert: {
            createdAt: cart.createdAt,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .lean<Record<string, unknown>>()
      .exec();
    return doc ? mapPlainCart(doc) : cloneCartRecord(cart);
  }

  async deleteCartByCustomerId(customerId: string): Promise<void> {
    await this.model.deleteOne({ customerId }).exec();
  }
}

export class InMemoryCartStore implements CartStore {
  private readonly cartsByCustomer = new Map<string, CartRecord>();

  async getCartByCustomerId(customerId: string): Promise<CartRecord | null> {
    const found = this.cartsByCustomer.get(customerId);
    return found ? cloneCartRecord(found) : null;
  }

  async saveCart(cart: CartRecord): Promise<CartRecord> {
    const copy = cloneCartRecord(cart);
    this.cartsByCustomer.set(copy.customerId, copy);
    return cloneCartRecord(copy);
  }

  async deleteCartByCustomerId(customerId: string): Promise<void> {
    this.cartsByCustomer.delete(customerId);
  }
}
