import { Schema, type SchemaOptions } from 'mongoose';

/**
 * Canonical MongoDB collection names owned by modular monolith domains (DATABASE.md & ADR-001).
 */
export const COLLECTION_NAMES = {
  users: 'users',
  userSessions: 'user_sessions',
  roles: 'roles',
  permissions: 'permissions',
  consentRecords: 'consent_records',
  addresses: 'addresses',
  customerProfiles: 'customer_profiles',
  cities: 'cities',
  deliveryZones: 'delivery_zones',
  restaurants: 'restaurants',
  restaurantOutlets: 'restaurant_outlets',
  restaurantStaff: 'restaurant_staff',
  restaurantDocuments: 'restaurant_documents',
  outletHours: 'outlet_hours',
  menus: 'menus',
  menuCategories: 'menu_categories',
  menuItems: 'menu_items',
  itemCustomizations: 'item_customizations',
  inventoryRecords: 'inventory_records',
  carts: 'carts',
  orders: 'orders',
  orderItems: 'order_items',
  orderEvents: 'order_events',
  pricingQuotes: 'pricing_quotes',
  coupons: 'coupons',
  outboxEvents: 'outbox_events',
  payments: 'payments',
  paymentEvents: 'payment_events',
  refunds: 'refunds',
  settlements: 'settlements',
  reconciliationRecords: 'reconciliation_records',
  idempotencyKeys: 'idempotency_keys',
  deliveryPartners: 'delivery_partners',
  deliveryAssignments: 'delivery_assignments',
  deliveryLocationEvents: 'delivery_location_events',
  deliveryIncidents: 'delivery_incidents',
  inspectors: 'inspectors',
  inspectorAuthorizations: 'inspector_authorizations',
  inspectionAssignments: 'inspection_assignments',
  inspections: 'inspections',
  checklistTemplates: 'checklist_templates',
  checklistResults: 'checklist_results',
  inspectionEvidence: 'inspection_evidence',
  inspectionReviews: 'inspection_reviews',
  safetyScores: 'safety_scores',
  safetyEvents: 'safety_events',
  correctiveActions: 'corrective_actions',
  appeals: 'appeals',
  reviews: 'reviews',
  complaints: 'complaints',
  supportTickets: 'support_tickets',
  notifications: 'notifications',
  loyaltyLedger: 'loyalty_ledger',
  auditLogs: 'audit_logs',
  featureFlags: 'feature_flags',
  policyVersions: 'policy_versions',
  integrationWebhookEvents: 'integration_webhook_events',
} as const;

export const DEFAULT_KOLKATA_CENTER: readonly [number, number] = [88.3639, 22.5726];

export function isNonNegativeIntegerPaise(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function paiseField(options: { required?: boolean; default?: number } = {}) {
  return {
    type: Number,
    required: options.required ?? true,
    default: options.default,
    validate: {
      validator: isNonNegativeIntegerPaise,
      message: 'Monetary amount must be a non-negative integer in INR paise (ADR-003)',
    },
  };
}

export function isValidGeoJsonPointCoordinates(coords: unknown): boolean {
  if (!Array.isArray(coords) || coords.length !== 2) {
    return false;
  }
  const [lng, lat] = coords;
  return (
    typeof lng === 'number' &&
    typeof lat === 'number' &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

export function isValidGeoJsonPolygonCoordinates(rings: unknown): boolean {
  if (!Array.isArray(rings) || rings.length === 0) {
    return false;
  }
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) {
      return false;
    }
    for (const point of ring) {
      if (!isValidGeoJsonPointCoordinates(point)) {
        return false;
      }
    }
    const first = ring[0] as unknown[];
    const last = ring[ring.length - 1] as unknown[];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      return false;
    }
  }
  return true;
}

export function createGeoPointSubSchema() {
  return new Schema(
    {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
        validate: {
          validator: isValidGeoJsonPointCoordinates,
          message: 'GeoJSON Point coordinates must be finite [longitude, latitude]',
        },
      },
    },
    { _id: false },
  );
}

export function createGeoPolygonSubSchema() {
  return new Schema(
    {
      type: {
        type: String,
        enum: ['Polygon'],
        required: true,
        default: 'Polygon',
      },
      coordinates: {
        type: [[[Number]]],
        required: true,
        validate: {
          validator: isValidGeoJsonPolygonCoordinates,
          message: 'GeoJSON Polygon must contain closed valid [longitude, latitude] rings',
        },
      },
    },
    { _id: false },
  );
}

export const BASE_SCHEMA_OPTIONS: SchemaOptions = {
  timestamps: true,
  strict: true,
  versionKey: false,
};

export interface BaseSchemaConventionOptions {
  /**
   * Blocks Mongoose update and delete operations for append-only audit/ledger collections (DATABASE.md).
   */
  appendOnly?: boolean;
}

export function applyBaseSchemaConventions<TDoc>(
  schema: Schema<TDoc>,
  options: BaseSchemaConventionOptions = {},
): Schema<TDoc> {
  schema.set('timestamps', true);
  schema.set('strict', true);
  schema.set('versionKey', false);

  const transformDoc = (_doc: unknown, ret: Record<string, unknown>): void => {
    if (ret['_id'] !== undefined && ret['id'] === undefined) {
      ret['id'] = String(ret['_id']);
    }
    delete ret['__v'];
  };

  schema.set('toJSON', { virtuals: true, transform: transformDoc });
  schema.set('toObject', { virtuals: true, transform: transformDoc });

  if (options.appendOnly) {
    const blockedOps = [
      'updateOne',
      'updateMany',
      'findOneAndUpdate',
      'replaceOne',
      'deleteOne',
      'deleteMany',
      'findOneAndDelete',
    ] as const;

    for (const hookName of blockedOps) {
      schema.pre(hookName, function blockMutation() {
        throw new Error(`Append-only collection forbids ${hookName} mutations (DATABASE.md)`);
      });
    }
  }

  return schema;
}
