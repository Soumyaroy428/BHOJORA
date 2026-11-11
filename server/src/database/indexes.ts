import type { Logger } from '../config/logger';
import { COLLECTION_NAMES } from './conventions';

export type IndexKeyDirection = 1 | -1 | '2dsphere' | 'text';

export interface DatabaseIndexSpec {
  collection: string;
  key: Record<string, IndexKeyDirection>;
  options: {
    name: string;
    unique?: boolean;
    partialFilterExpression?: Record<string, unknown>;
    expireAfterSeconds?: number;
  };
}

/**
 * Repeatable initial index specifications required by DATABASE.md Section 4.
 * Applied idempotently via createIndexes across environments with autoIndex disabled in prod.
 */
export const INITIAL_DATABASE_INDEXES: readonly DatabaseIndexSpec[] = [
  {
    collection: COLLECTION_NAMES.cities,
    key: { cityCode: 1 },
    options: { name: 'idx_cities_city_code_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.deliveryZones,
    key: { cityCode: 1, zoneCode: 1 },
    options: { name: 'idx_delivery_zones_city_zone_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.deliveryZones,
    key: { boundary: '2dsphere' },
    options: { name: 'idx_delivery_zones_boundary_2dsphere' },
  },
  {
    collection: COLLECTION_NAMES.users,
    key: { emailNormalized: 1 },
    options: {
      name: 'idx_users_email_unique_partial',
      unique: true,
      partialFilterExpression: { emailNormalized: { $type: 'string' } },
    },
  },
  {
    collection: COLLECTION_NAMES.users,
    key: { phoneNormalized: 1 },
    options: {
      name: 'idx_users_phone_unique_partial',
      unique: true,
      partialFilterExpression: { phoneNormalized: { $type: 'string' } },
    },
  },
  {
    collection: COLLECTION_NAMES.userSessions,
    key: { sessionId: 1 },
    options: { name: 'idx_user_sessions_session_id_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.userSessions,
    key: { userId: 1, revokedAt: 1, expiresAt: -1 },
    options: { name: 'idx_user_sessions_user_active' },
  },
  {
    collection: COLLECTION_NAMES.userSessions,
    key: { expiresAt: 1 },
    options: { name: 'idx_user_sessions_expires_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: COLLECTION_NAMES.authChallenges,
    key: { challengeId: 1 },
    options: { name: 'idx_auth_challenges_id_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.authChallenges,
    key: { identifierNormalized: 1, purpose: 1, createdAt: -1 },
    options: { name: 'idx_auth_challenges_identifier_purpose' },
  },
  {
    collection: COLLECTION_NAMES.authChallenges,
    key: { expiresAt: 1 },
    options: { name: 'idx_auth_challenges_expires_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: COLLECTION_NAMES.consentRecords,
    key: { userId: 1, consentType: 1, acceptedAt: -1 },
    options: { name: 'idx_consent_records_user_type_accepted' },
  },
  {
    collection: COLLECTION_NAMES.customerProfiles,
    key: { userId: 1 },
    options: { name: 'idx_customer_profiles_user_id_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.customerProfiles,
    key: { 'deletionRequest.status': 1, 'deletionRequest.scheduledPurgeAt': 1 },
    options: { name: 'idx_customer_profiles_deletion_schedule' },
  },
  {
    collection: COLLECTION_NAMES.addresses,
    key: { addressId: 1 },
    options: { name: 'idx_addresses_id_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.addresses,
    key: { userId: 1, isDefault: -1, createdAt: -1 },
    options: { name: 'idx_addresses_user_default_created' },
  },
  {
    collection: COLLECTION_NAMES.addresses,
    key: { location: '2dsphere' },
    options: { name: 'idx_addresses_location_2dsphere' },
  },
  {
    collection: COLLECTION_NAMES.authRateLimits,
    key: { scope: 1, subjectKey: 1 },
    options: { name: 'idx_auth_rate_limits_scope_subject_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.authRateLimits,
    key: { expiresAt: 1 },
    options: { name: 'idx_auth_rate_limits_expires_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: COLLECTION_NAMES.restaurants,
    key: { applicationId: 1 },
    options: { name: 'idx_restaurants_application_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.restaurants,
    key: { restaurantId: 1 },
    options: { name: 'idx_restaurants_restaurant_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.restaurants,
    key: { ownerUserId: 1, updatedAt: -1 },
    options: { name: 'idx_restaurants_owner_updated' },
  },
  {
    collection: COLLECTION_NAMES.restaurants,
    key: { onboardingStatus: 1, submittedAt: 1 },
    options: { name: 'idx_restaurants_onboarding_submitted' },
  },
  {
    collection: COLLECTION_NAMES.restaurantOutlets,
    key: { outletId: 1 },
    options: { name: 'idx_outlets_outlet_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.restaurantOutlets,
    key: { location: '2dsphere' },
    options: { name: 'idx_outlets_location_2dsphere' },
  },
  {
    collection: COLLECTION_NAMES.restaurantOutlets,
    key: { restaurantId: 1, status: 1 },
    options: { name: 'idx_outlets_restaurant_status' },
  },
  {
    collection: COLLECTION_NAMES.restaurantDocuments,
    key: { documentId: 1 },
    options: { name: 'idx_restaurant_docs_doc_id_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.restaurantDocuments,
    key: { restaurantId: 1, documentType: 1, uploadedAt: -1 },
    options: { name: 'idx_restaurant_docs_restaurant_type_uploaded' },
  },
  {
    collection: COLLECTION_NAMES.restaurantStaff,
    key: { userId: 1, restaurantId: 1, outletId: 1 },
    options: { name: 'idx_restaurant_staff_user_restaurant_outlet_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.restaurantStaff,
    key: { outletId: 1, status: 1 },
    options: { name: 'idx_restaurant_staff_outlet_status' },
  },
  {
    collection: COLLECTION_NAMES.menuItems,
    key: { outletId: 1, isAvailable: 1, categoryId: 1 },
    options: { name: 'idx_menu_items_outlet_avail_category' },
  },
  {
    collection: COLLECTION_NAMES.orders,
    key: { customerId: 1, createdAt: -1 },
    options: { name: 'idx_orders_customer_created_desc' },
  },
  {
    collection: COLLECTION_NAMES.orders,
    key: { outletId: 1, status: 1, createdAt: -1 },
    options: { name: 'idx_orders_outlet_status_created_desc' },
  },
  {
    collection: COLLECTION_NAMES.payments,
    key: { provider: 1, providerPaymentId: 1 },
    options: { name: 'idx_payments_provider_payment_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.paymentEvents,
    key: { providerEventId: 1 },
    options: { name: 'idx_payment_events_provider_event_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.deliveryAssignments,
    key: { partnerId: 1, status: 1 },
    options: { name: 'idx_delivery_assignments_partner_status' },
  },
  {
    collection: COLLECTION_NAMES.inspections,
    key: { outletId: 1, inspectionDate: -1 },
    options: { name: 'idx_inspections_outlet_date_desc' },
  },
  {
    collection: COLLECTION_NAMES.inspections,
    key: { inspectorId: 1, status: 1 },
    options: { name: 'idx_inspections_inspector_status' },
  },
  {
    collection: COLLECTION_NAMES.safetyScores,
    key: { outletId: 1, publishedAt: -1 },
    options: { name: 'idx_safety_scores_outlet_published_desc' },
  },
  {
    collection: COLLECTION_NAMES.auditLogs,
    key: { actorId: 1, createdAt: -1 },
    options: { name: 'idx_audit_logs_actor_created_desc' },
  },
  {
    collection: COLLECTION_NAMES.auditLogs,
    key: { resourceType: 1, resourceId: 1, createdAt: -1 },
    options: { name: 'idx_audit_logs_resource_created_desc' },
  },
  {
    collection: COLLECTION_NAMES.idempotencyKeys,
    key: { operation: 1, key: 1 },
    options: { name: 'idx_idempotency_operation_key_unique', unique: true },
  },
  {
    collection: COLLECTION_NAMES.idempotencyKeys,
    key: { expiresAt: 1 },
    options: { name: 'idx_idempotency_expires_ttl', expireAfterSeconds: 0 },
  },
  {
    collection: COLLECTION_NAMES.checklistTemplates,
    key: { policyVersion: 1 },
    options: { name: 'idx_checklist_templates_version_unique', unique: true },
  },
];

export interface IndexCollectionHandle {
  createIndexes(
    specs: Array<{
      key: Record<string, IndexKeyDirection>;
      name: string;
      unique?: boolean;
      partialFilterExpression?: Record<string, unknown>;
      expireAfterSeconds?: number;
    }>,
  ): Promise<string[]>;
}

export interface IndexDatabaseHandle {
  collection(name: string): IndexCollectionHandle;
}

export interface ApplyIndexesResult {
  collectionsProcessed: number;
  indexesEnsured: number;
  indexNames: string[];
}

export async function applyInitialIndexes(
  db: IndexDatabaseHandle,
  logger: Logger,
  specs: readonly DatabaseIndexSpec[] = INITIAL_DATABASE_INDEXES,
): Promise<ApplyIndexesResult> {
  const byCollection = new Map<string, DatabaseIndexSpec[]>();

  for (const spec of specs) {
    const existing = byCollection.get(spec.collection);
    if (existing) {
      existing.push(spec);
    } else {
      byCollection.set(spec.collection, [spec]);
    }
  }

  const indexNames: string[] = [];

  for (const [collectionName, collectionSpecs] of byCollection.entries()) {
    const driverSpecs = collectionSpecs.map((item) => ({
      key: item.key,
      name: item.options.name,
      ...(item.options.unique !== undefined ? { unique: item.options.unique } : {}),
      ...(item.options.partialFilterExpression !== undefined
        ? { partialFilterExpression: item.options.partialFilterExpression }
        : {}),
      ...(item.options.expireAfterSeconds !== undefined
        ? { expireAfterSeconds: item.options.expireAfterSeconds }
        : {}),
    }));

    const createdNames = await db.collection(collectionName).createIndexes(driverSpecs);
    for (const name of createdNames) {
      indexNames.push(name);
    }
  }

  logger.info('database.indexes.ensured', {
    collectionsProcessed: byCollection.size,
    indexesEnsured: specs.length,
  });

  return {
    collectionsProcessed: byCollection.size,
    indexesEnsured: specs.length,
    indexNames,
  };
}
