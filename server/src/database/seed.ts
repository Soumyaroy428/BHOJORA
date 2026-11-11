import type { Logger } from '../config/logger';
import { COLLECTION_NAMES, DEFAULT_KOLKATA_CENTER } from './conventions';

export interface SeedCollectionHandle {
  updateOne(
    filter: Record<string, unknown>,
    update: { $setOnInsert: Record<string, unknown> },
    options: { upsert: true },
  ): Promise<{ upsertedCount: number; matchedCount: number }>;
}

export interface SeedDatabaseHandle {
  collection(name: string): SeedCollectionHandle;
}

export interface RunSeedOptions {
  db: SeedDatabaseHandle;
  logger: Logger;
  nodeEnv: 'development' | 'test' | 'production';
  allowProductionBootstrap?: boolean;
}

export interface RunSeedResult {
  upsertedCount: number;
  matchedCount: number;
  collectionsSeeded: string[];
}

export interface SyntheticZoneSeed {
  cityCode: string;
  zoneCode: string;
  name: string;
  coordinates: number[][][];
}

export const INITIAL_KOLKATA_CITY_SEED = {
  cityCode: 'KOLKATA',
  name: 'Kolkata',
  state: 'West Bengal',
  countryCode: 'IN',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  isActive: true,
  isSyntheticSeed: true,
  center: {
    type: 'Point' as const,
    coordinates: [...DEFAULT_KOLKATA_CENTER],
  },
};

export const INITIAL_KOLKATA_ZONES_SEED: readonly SyntheticZoneSeed[] = [
  {
    cityCode: 'KOLKATA',
    zoneCode: 'SALT_LAKE_SEC_V',
    name: 'Salt Lake Sector V',
    coordinates: [
      [
        [88.425, 22.565],
        [88.45, 22.565],
        [88.45, 22.585],
        [88.425, 22.585],
        [88.425, 22.565],
      ],
    ],
  },
  {
    cityCode: 'KOLKATA',
    zoneCode: 'PARK_STREET',
    name: 'Park Street & Camac Street',
    coordinates: [
      [
        [88.345, 22.545],
        [88.365, 22.545],
        [88.365, 22.56],
        [88.345, 22.56],
        [88.345, 22.545],
      ],
    ],
  },
  {
    cityCode: 'KOLKATA',
    zoneCode: 'BALLYGUNGE',
    name: 'Ballygunge & Gariahat',
    coordinates: [
      [
        [88.355, 22.515],
        [88.378, 22.515],
        [88.378, 22.536],
        [88.355, 22.536],
        [88.355, 22.515],
      ],
    ],
  },
];

export const INITIAL_INSPECTION_TEMPLATE_SEED = {
  policyVersion: 'v1.0.0',
  assessmentType: 'INDEPENDENT',
  statutoryDisclaimer:
    'Independent private startup kitchen assessment; not a statutory FSSAI government inspection.',
  requiresIndependentReviewer: true,
  prohibitSelfApproval: true,
  categoryWeights: {
    cleanliness: 25,
    storage: 20,
    employeeHygiene: 20,
    pestControl: 15,
    foodHandling: 20,
  },
  isActive: true,
  isSyntheticSeed: true,
};

/**
 * Idempotent starter seed strictly limited to configurable market/policy definitions.
 * Never inserts real PII, customer accounts, or production payment records.
 */
export async function runSeed(options: RunSeedOptions): Promise<RunSeedResult> {
  if (options.nodeEnv === 'production' && !options.allowProductionBootstrap) {
    throw new Error(
      'Refusing to execute database seed in production without explicit allowProductionBootstrap flag',
    );
  }

  const now = new Date();
  let upsertedCount = 0;
  let matchedCount = 0;

  const upsertOne = async (
    collectionName: string,
    filter: Record<string, unknown>,
    doc: Record<string, unknown>,
  ): Promise<void> => {
    const res = await options.db.collection(collectionName).updateOne(
      filter,
      {
        $setOnInsert: {
          ...doc,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );
    upsertedCount += res.upsertedCount;
    matchedCount += res.matchedCount;
  };

  await upsertOne(
    COLLECTION_NAMES.cities,
    { cityCode: INITIAL_KOLKATA_CITY_SEED.cityCode },
    INITIAL_KOLKATA_CITY_SEED,
  );

  for (const zone of INITIAL_KOLKATA_ZONES_SEED) {
    await upsertOne(
      COLLECTION_NAMES.deliveryZones,
      { cityCode: zone.cityCode, zoneCode: zone.zoneCode },
      {
        cityCode: zone.cityCode,
        zoneCode: zone.zoneCode,
        name: zone.name,
        isActive: true,
        isSyntheticSeed: true,
        boundary: {
          type: 'Polygon',
          coordinates: zone.coordinates,
        },
      },
    );
  }

  await upsertOne(
    COLLECTION_NAMES.checklistTemplates,
    { policyVersion: INITIAL_INSPECTION_TEMPLATE_SEED.policyVersion },
    INITIAL_INSPECTION_TEMPLATE_SEED,
  );

  const collectionsSeeded = [
    COLLECTION_NAMES.cities,
    COLLECTION_NAMES.deliveryZones,
    COLLECTION_NAMES.checklistTemplates,
  ];

  options.logger.info('database.seed.completed', {
    upsertedCount,
    matchedCount,
    collectionsSeeded,
  });

  return {
    upsertedCount,
    matchedCount,
    collectionsSeeded,
  };
}
