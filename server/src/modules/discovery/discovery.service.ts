import crypto from 'node:crypto';
import type { AllergenCode, DeliveryZoneDto, DietaryType } from '@bhojora/shared';
import { z } from 'zod';
import type { Logger } from '../../config/logger';
import type { PaginationMeta } from '../../contracts/api';
import { AppError } from '../../middleware/error-handler';
import {
  ALLERGEN_CODES,
  ALLERGEN_LABELS,
  DIETARY_LABELS,
  DIETARY_TYPES,
  formatInrFromPaise,
  type CatalogStore,
  type MenuItemRecord,
} from '../catalog/catalog.types';
import { KOLKATA_ZONE_IDS, type KolkataZoneId } from '../customer/customer.types';
import type { Clock } from '../identity/identity.types';
import {
  assertValidGeoJsonPoint,
  calculateHaversineDistanceMeters,
  evaluateOutletOpenStatus,
  isPointInPolygon,
  normalizeOperatingSlots,
} from '../outlet/outlet.geo';
import type { OutletService } from '../outlet/outlet.service';
import type { OutletHoursRecord, OutletStore } from '../outlet/outlet.types';
import {
  FSSAI_SEPARATION_NOTICE,
  PLATFORM_INSPECTION_STATUSES,
  type PlatformInspectionStatus,
  type RestaurantOutletRecord,
  type RestaurantStore,
} from '../restaurant/restaurant.types';
import {
  CURATED_DISCOVERY_CATEGORIES,
  DEFAULT_DISCOVERY_PAGE_LIMIT,
  DISCOVERY_RANKING_DISCLOSURE,
  DISCOVERY_SORT_OPTIONS,
  MAX_DISCOVERY_PAGE_LIMIT,
  MAX_DISCOVERY_QUERY_LENGTH,
  PLATFORM_SAFETY_BADGE_META,
  type DiscoveryCategoryDto,
  type DiscoveryDishMatchDto,
  type DiscoveryOutletResultDto,
  type DiscoveryRestaurantsResultWithMeta,
  type DiscoverySearchResultWithMeta,
  type DiscoverySortOption,
  type DiscoveryTrustBadgeDto,
} from './discovery.types';

interface DiscoveryCursorPayload {
  v: 1;
  qh: string;
  sort: DiscoverySortOption;
  primary: number;
  secondary: number;
  outletId: string;
}

const discoveryQuerySchema = z
  .object({
    q: z
      .string()
      .trim()
      .max(
        MAX_DISCOVERY_QUERY_LENGTH,
        `Search query must be ${MAX_DISCOVERY_QUERY_LENGTH} characters or fewer`,
      )
      .optional(),
    zoneId: z.union([z.literal('all'), z.enum(KOLKATA_ZONE_IDS)]).optional(),
    lng: z.number().finite().optional(),
    lat: z.number().finite().optional(),
    dietary: z.enum(DIETARY_TYPES).optional(),
    excludeAllergens: z.array(z.enum(ALLERGEN_CODES)).max(ALLERGEN_CODES.length).optional(),
    openNow: z.boolean().optional(),
    verifiedOnly: z.boolean().optional(),
    safetyStatus: z.enum(PLATFORM_INSPECTION_STATUSES).optional(),
    minSafetyScore: z.number().int().min(0).max(100).optional(),
    maxPricePaise: z.number().int().min(0).max(5_000_000).optional(),
    maxEtaMinutes: z.number().int().min(5).max(120).optional(),
    maxDistanceMeters: z.number().int().min(500).max(25_000).optional(),
    sort: z.enum(DISCOVERY_SORT_OPTIONS).optional(),
    cursor: z.string().trim().min(1).max(320).optional(),
    limit: z
      .number()
      .int()
      .min(1)
      .max(MAX_DISCOVERY_PAGE_LIMIT)
      .default(DEFAULT_DISCOVERY_PAGE_LIMIT),
  })
  .strict()
  .superRefine((data, ctx) => {
    if ((data.lng === undefined) !== (data.lat === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lng'],
        message: 'Both lng and lat coordinates must be provided together',
      });
    }
    if (data.q && hasControlCharacters(data.q)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['q'],
        message: 'Search query contains invalid control characters',
      });
    }
  });

function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

type ParsedDiscoveryQuery = z.infer<typeof discoveryQuerySchema>;

function normalizeSearchTokens(rawQuery: string | undefined): string[] {
  if (!rawQuery) {
    return [];
  }
  return rawQuery
    .toLowerCase()
    .split(/[^a-z0-9\u0980-\u09ff]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .slice(0, 8);
}

export function buildDiscoveryTrustBadge(outlet: RestaurantOutletRecord): DiscoveryTrustBadgeDto {
  const hasValidPublishedScore =
    outlet.status === 'ACTIVE' &&
    outlet.platformInspectionStatus === 'VERIFIED_CLEAN' &&
    typeof outlet.publishedSafetyScore === 'number' &&
    Number.isFinite(outlet.publishedSafetyScore) &&
    outlet.publishedSafetyScore > 0;

  // Never surface VERIFIED_CLEAN unless status and published numeric score are both valid.
  const effectiveStatus: PlatformInspectionStatus =
    outlet.platformInspectionStatus === 'VERIFIED_CLEAN' && !hasValidPublishedScore
      ? 'NOT_INSPECTED'
      : outlet.platformInspectionStatus;

  const meta = PLATFORM_SAFETY_BADGE_META[effectiveStatus];

  return {
    status: effectiveStatus,
    isVerified: effectiveStatus === 'VERIFIED_CLEAN' && hasValidPublishedScore,
    label: meta.label,
    shortCode: meta.shortCode,
    score: effectiveStatus === 'VERIFIED_CLEAN' ? outlet.publishedSafetyScore : null,
    auditDate: effectiveStatus === 'VERIFIED_CLEAN' ? outlet.updatedAt.toISOString() : null,
    validUntil: null,
    explanation: meta.explanation,
    fssaiNotice: FSSAI_SEPARATION_NOTICE,
  };
}

function buildQueryFilterHash(params: {
  q: string | null;
  zoneId: KolkataZoneId | null;
  lng: number | null;
  lat: number | null;
  dietary: DietaryType | null;
  excludeAllergens: readonly AllergenCode[];
  openNow: boolean;
  verifiedOnly: boolean;
  safetyStatus: PlatformInspectionStatus | null;
  minSafetyScore: number | null;
  maxPricePaise: number | null;
  maxEtaMinutes: number | null;
  maxDistanceMeters: number | null;
  sort: DiscoverySortOption;
}): string {
  return crypto.createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0, 16);
}

function computePrimarySortTuple(
  item: DiscoveryOutletResultDto,
  sort: DiscoverySortOption,
): [number, number] {
  switch (sort) {
    case 'distance':
      return [item.distanceMeters ?? Number.MAX_SAFE_INTEGER, item.estimatedDeliveryMinutes];
    case 'eta':
      return [item.estimatedDeliveryMinutes, item.distanceMeters ?? Number.MAX_SAFE_INTEGER];
    case 'price_asc':
      return [item.minPricePaise ?? Number.MAX_SAFE_INTEGER, item.estimatedDeliveryMinutes];
    case 'price_desc':
      return [
        item.minPricePaise === null ? Number.MAX_SAFE_INTEGER : -item.minPricePaise,
        item.estimatedDeliveryMinutes,
      ];
    case 'safety_score':
      return [
        item.trustBadge.isVerified && item.trustBadge.score !== null ? -item.trustBadge.score : 1,
        item.estimatedDeliveryMinutes,
      ];
    case 'relevance':
    default:
      return [-item.relevanceScore, item.distanceMeters ?? item.estimatedDeliveryMinutes];
  }
}

function compareDiscoveryOutlets(
  a: DiscoveryOutletResultDto,
  b: DiscoveryOutletResultDto,
  sort: DiscoverySortOption,
): number {
  const [aPrimary, aSecondary] = computePrimarySortTuple(a, sort);
  const [bPrimary, bSecondary] = computePrimarySortTuple(b, sort);
  if (aPrimary !== bPrimary) {
    return aPrimary - bPrimary;
  }
  if (aSecondary !== bSecondary) {
    return aSecondary - bSecondary;
  }
  return a.outletId.localeCompare(b.outletId);
}

function encodeCursor(payload: DiscoveryCursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeCursor(
  rawCursor: string,
  expectedQh: string,
  expectedSort: DiscoverySortOption,
): DiscoveryCursorPayload {
  let parsed: unknown;
  try {
    const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8');
    parsed = JSON.parse(decoded);
  } catch {
    throw new AppError(400, 'VALIDATION_ERROR', 'Invalid discovery pagination cursor');
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as DiscoveryCursorPayload).v !== 1 ||
    (parsed as DiscoveryCursorPayload).qh !== expectedQh ||
    (parsed as DiscoveryCursorPayload).sort !== expectedSort ||
    typeof (parsed as DiscoveryCursorPayload).primary !== 'number' ||
    typeof (parsed as DiscoveryCursorPayload).secondary !== 'number' ||
    typeof (parsed as DiscoveryCursorPayload).outletId !== 'string' ||
    !Number.isFinite((parsed as DiscoveryCursorPayload).primary) ||
    !Number.isFinite((parsed as DiscoveryCursorPayload).secondary)
  ) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Pagination cursor does not match active search filters or sort order',
    );
  }
  return parsed as DiscoveryCursorPayload;
}

export class DiscoveryService {
  private readonly restaurantStore: RestaurantStore;
  private readonly outletStore: OutletStore;
  private readonly outletService: Pick<OutletService, 'listDeliveryZones' | 'getClock'>;
  private readonly catalogStore: CatalogStore;
  private readonly clock: Clock;
  private readonly logger: Logger;

  constructor(params: {
    restaurantStore: RestaurantStore;
    outletStore: OutletStore;
    outletService: Pick<OutletService, 'listDeliveryZones' | 'getClock'>;
    catalogStore: CatalogStore;
    clock?: Clock;
    logger: Logger;
  }) {
    this.restaurantStore = params.restaurantStore;
    this.outletStore = params.outletStore;
    this.outletService = params.outletService;
    this.catalogStore = params.catalogStore;
    this.clock = params.clock ?? params.outletService.getClock();
    this.logger = params.logger;
  }

  private scoreTokenMatch(
    itemText: string,
    tokens: readonly string[],
  ): { matched: boolean; score: number } {
    if (tokens.length === 0) {
      return { matched: true, score: 0 };
    }
    const lower = itemText.toLowerCase();
    let totalScore = 0;
    for (const token of tokens) {
      if (!lower.includes(token)) {
        return { matched: false, score: 0 };
      }
      totalScore += lower.startsWith(token) ? 12 : 8;
    }
    return { matched: true, score: totalScore };
  }

  private toDishMatchDto(
    item: MenuItemRecord,
    outlet: RestaurantOutletRecord,
    badge: DiscoveryTrustBadgeDto,
  ): DiscoveryDishMatchDto {
    return {
      itemId: item.itemId,
      outletId: outlet.outletId,
      restaurantId: outlet.restaurantId,
      brandName: outlet.brandName,
      outletName: outlet.name,
      categoryId: item.categoryId,
      title: item.title,
      description: item.description,
      pricePaise: item.pricePaise,
      formattedPriceInr: formatInrFromPaise(item.pricePaise),
      dietaryType: item.dietaryType,
      dietaryBadgeLabel: DIETARY_LABELS[item.dietaryType],
      allergens: [...item.allergens],
      allergenLabels: item.allergens.map((code) => ALLERGEN_LABELS[code]),
      isAvailable: item.isAvailable,
      outletVerifiedClean: badge.isVerified,
      outletSafetyScore: badge.score,
    };
  }

  private async evaluateCandidates(parsed: ParsedDiscoveryQuery): Promise<{
    outlets: DiscoveryOutletResultDto[];
    dishes: DiscoveryDishMatchDto[];
    effectiveSort: DiscoverySortOption;
    validatedCoords?: [number, number];
    normalizedZoneId: KolkataZoneId | null;
    excludeAllergens: AllergenCode[];
  }> {
    const validatedCoords =
      parsed.lng !== undefined && parsed.lat !== undefined
        ? assertValidGeoJsonPoint([parsed.lng, parsed.lat], { label: 'Discovery coordinates' })
        : undefined;
    const normalizedZoneId = parsed.zoneId && parsed.zoneId !== 'all' ? parsed.zoneId : null;
    const tokens = normalizeSearchTokens(parsed.q);
    const excludeAllergens = parsed.excludeAllergens ?? [];
    const effectiveSort: DiscoverySortOption =
      parsed.sort ?? (validatedCoords && tokens.length === 0 ? 'distance' : 'relevance');

    const now = this.clock.now();
    const rawOutlets = await this.restaurantStore.listPublicOutlets(normalizedZoneId ?? undefined);
    // Suspended safety-hold outlets never appear in active discovery.
    const activeOutlets = rawOutlets.filter((o) => o.platformInspectionStatus !== 'SUSPENDED');

    if (activeOutlets.length === 0) {
      return {
        outlets: [],
        dishes: [],
        effectiveSort,
        validatedCoords,
        normalizedZoneId,
        excludeAllergens,
      };
    }

    const outletIds = activeOutlets.map((o) => o.outletId);
    const [hoursList, zones, itemsList] = await Promise.all([
      this.outletStore.listOutletHoursByIds(outletIds),
      this.outletService.listDeliveryZones({ includeInactive: false }),
      this.catalogStore.listPublicItemsForOutlets(outletIds, {
        dietary: parsed.dietary,
        excludeAllergens,
        maxPricePaise: parsed.maxPricePaise,
      }),
    ]);

    const hoursMap = new Map<string, OutletHoursRecord>(hoursList.map((h) => [h.outletId, h]));
    const zoneById = new Map(zones.map((z) => [z.zoneId, z]));
    const matchedCustomerZone = validatedCoords
      ? (zones.find(
          (z) => z.isActive && isPointInPolygon(validatedCoords, z.boundary.coordinates),
        ) ?? null)
      : null;

    const itemsByOutlet = new Map<string, MenuItemRecord[]>();
    for (const item of itemsList) {
      const bucket = itemsByOutlet.get(item.outletId);
      if (bucket) {
        bucket.push(item);
      } else {
        itemsByOutlet.set(item.outletId, [item]);
      }
    }

    const requiresDishConstraint =
      parsed.dietary !== undefined ||
      excludeAllergens.length > 0 ||
      parsed.maxPricePaise !== undefined;

    const results: DiscoveryOutletResultDto[] = [];
    const allMatchedDishes: DiscoveryDishMatchDto[] = [];

    for (const outlet of activeOutlets) {
      const trustBadge = buildDiscoveryTrustBadge(outlet);

      if (parsed.verifiedOnly && !trustBadge.isVerified) {
        continue;
      }
      if (
        parsed.minSafetyScore !== undefined &&
        (!trustBadge.isVerified ||
          trustBadge.score === null ||
          trustBadge.score < parsed.minSafetyScore)
      ) {
        continue;
      }
      if (parsed.safetyStatus && trustBadge.status !== parsed.safetyStatus) {
        continue;
      }

      const hours = hoursMap.get(outlet.outletId);
      const effectiveSlots = hours?.slots ?? normalizeOperatingSlots(outlet.operatingSlots);
      const liveStatus = evaluateOutletOpenStatus({
        status: outlet.status,
        slots: effectiveSlots,
        specialClosures: hours?.specialClosures,
        atDate: now,
      });
      if (parsed.openNow && !liveStatus.isOpenNow) {
        continue;
      }

      const radius = outlet.deliveryRadiusMeters ?? 5000;
      const distanceMeters = validatedCoords
        ? calculateHaversineDistanceMeters(validatedCoords, outlet.location.coordinates)
        : undefined;
      if (
        parsed.maxDistanceMeters !== undefined &&
        distanceMeters !== undefined &&
        distanceMeters > parsed.maxDistanceMeters
      ) {
        continue;
      }

      const serviceable = validatedCoords
        ? matchedCustomerZone !== null && distanceMeters !== undefined && distanceMeters <= radius
        : undefined;

      const travelMinutes =
        distanceMeters !== undefined ? Math.max(5, Math.ceil(distanceMeters / 350)) : 12;
      const estimatedDeliveryMinutes = Math.min(90, outlet.prepTimeMinutes + travelMinutes);
      if (parsed.maxEtaMinutes !== undefined && estimatedDeliveryMinutes > parsed.maxEtaMinutes) {
        continue;
      }

      const outletItems = itemsByOutlet.get(outlet.outletId) ?? [];
      if (requiresDishConstraint && outletItems.length === 0) {
        continue;
      }

      const outletSearchCorpus = [
        outlet.brandName,
        outlet.name,
        outlet.locality,
        outlet.landmark,
        outlet.wardOrBorough,
        ...outlet.cuisines,
      ].join(' ');
      const outletTextMatch = this.scoreTokenMatch(outletSearchCorpus, tokens);

      const matchingOutletDishes: DiscoveryDishMatchDto[] = [];
      let dishScoreBonus = 0;

      for (const item of outletItems) {
        const dishCorpus = `${item.title} ${item.description} ${DIETARY_LABELS[item.dietaryType]} ${item.allergens.join(' ')}`;
        const dishMatch = this.scoreTokenMatch(dishCorpus, tokens);
        if (tokens.length > 0 && dishMatch.matched) {
          dishScoreBonus = Math.max(dishScoreBonus, dishMatch.score + 10);
          matchingOutletDishes.push(this.toDishMatchDto(item, outlet, trustBadge));
        } else if (tokens.length === 0 && matchingOutletDishes.length < 3) {
          matchingOutletDishes.push(this.toDishMatchDto(item, outlet, trustBadge));
        }
      }

      if (tokens.length > 0 && !outletTextMatch.matched && matchingOutletDishes.length === 0) {
        continue;
      }

      let minPricePaise: number | null = null;
      for (const item of outletItems) {
        if (minPricePaise === null || item.pricePaise < minPricePaise) {
          minPricePaise = item.pricePaise;
        }
      }

      const outletZonePolicy: DeliveryZoneDto | undefined =
        zoneById.get(outlet.zoneId) ?? matchedCustomerZone ?? undefined;

      const relevanceScore =
        (outletTextMatch.matched ? outletTextMatch.score + 15 : 0) +
        dishScoreBonus +
        (liveStatus.isOpenNow ? 20 : 0) +
        (serviceable ? 15 : 0) +
        (trustBadge.isVerified ? 5 : 0);

      const outletDto: DiscoveryOutletResultDto = {
        restaurantId: outlet.restaurantId,
        outletId: outlet.outletId,
        brandName: outlet.brandName,
        outletName: outlet.name,
        slug: outlet.slug,
        zoneId: outlet.zoneId,
        wardOrBorough: outlet.wardOrBorough,
        locality: outlet.locality,
        landmark: outlet.landmark,
        coordinates: [outlet.location.coordinates[0], outlet.location.coordinates[1]],
        cuisines: [...outlet.cuisines],
        fssaiLicenseNumber: outlet.fssaiLicenseNumber,
        fssaiExpiresOn: outlet.fssaiExpiresOn,
        fssaiVerificationStatus: outlet.fssaiVerificationStatus,
        platformInspectionStatus: trustBadge.status,
        publishedSafetyScore: trustBadge.score,
        fssaiSeparationNotice: FSSAI_SEPARATION_NOTICE,
        deliveryRadiusMeters: radius,
        isOpenNow: liveStatus.isOpenNow,
        liveStatusReason: liveStatus.reason,
        estimatedDeliveryMinutes,
        deliveryFeePaise: outletZonePolicy?.deliveryFeePaise ?? 2900,
        minPricePaise,
        formattedMinPriceInr: minPricePaise !== null ? formatInrFromPaise(minPricePaise) : null,
        matchesPureVeg:
          outletItems.length > 0 && outletItems.every((item) => item.dietaryType === 'PURE_VEG'),
        availableDishCount: outletItems.length,
        matchedDishes: matchingOutletDishes.slice(0, 4),
        trustBadge,
        relevanceScore,
        ...(distanceMeters !== undefined ? { distanceMeters } : {}),
        ...(serviceable !== undefined ? { serviceable } : {}),
      };

      results.push(outletDto);
      for (const dish of matchingOutletDishes) {
        if (tokens.length > 0 || parsed.dietary || parsed.maxPricePaise !== undefined) {
          allMatchedDishes.push(dish);
        }
      }
    }

    results.sort((a, b) => compareDiscoveryOutlets(a, b, effectiveSort));

    return {
      outlets: results,
      dishes: allMatchedDishes,
      effectiveSort,
      validatedCoords,
      normalizedZoneId,
      excludeAllergens,
    };
  }

  private paginateOutlets(params: {
    sortedOutlets: DiscoveryOutletResultDto[];
    parsed: ParsedDiscoveryQuery;
    effectiveSort: DiscoverySortOption;
    validatedCoords?: [number, number];
    normalizedZoneId: KolkataZoneId | null;
    excludeAllergens: AllergenCode[];
  }): { page: DiscoveryOutletResultDto[]; meta: PaginationMeta } {
    const {
      sortedOutlets,
      parsed,
      effectiveSort,
      validatedCoords,
      normalizedZoneId,
      excludeAllergens,
    } = params;

    const qh = buildQueryFilterHash({
      q: parsed.q ?? null,
      zoneId: normalizedZoneId,
      lng: validatedCoords ? validatedCoords[0] : null,
      lat: validatedCoords ? validatedCoords[1] : null,
      dietary: parsed.dietary ?? null,
      excludeAllergens,
      openNow: Boolean(parsed.openNow),
      verifiedOnly: Boolean(parsed.verifiedOnly),
      safetyStatus: parsed.safetyStatus ?? null,
      minSafetyScore: parsed.minSafetyScore ?? null,
      maxPricePaise: parsed.maxPricePaise ?? null,
      maxEtaMinutes: parsed.maxEtaMinutes ?? null,
      maxDistanceMeters: parsed.maxDistanceMeters ?? null,
      sort: effectiveSort,
    });

    let afterCursorOutlets = sortedOutlets;
    if (parsed.cursor) {
      const anchor = decodeCursor(parsed.cursor, qh, effectiveSort);
      afterCursorOutlets = sortedOutlets.filter((item) => {
        const [itemPrimary, itemSecondary] = computePrimarySortTuple(item, effectiveSort);
        if (itemPrimary !== anchor.primary) {
          return itemPrimary > anchor.primary;
        }
        if (itemSecondary !== anchor.secondary) {
          return itemSecondary > anchor.secondary;
        }
        return item.outletId.localeCompare(anchor.outletId) > 0;
      });
    }

    const limit = parsed.limit;
    const hasMore = afterCursorOutlets.length > limit;
    const page = afterCursorOutlets.slice(0, limit);
    const lastItem = page[page.length - 1];

    const nextCursor =
      hasMore && lastItem
        ? (() => {
            const [primary, secondary] = computePrimarySortTuple(lastItem, effectiveSort);
            return encodeCursor({
              v: 1,
              qh,
              sort: effectiveSort,
              primary,
              secondary,
              outletId: lastItem.outletId,
            });
          })()
        : null;

    return {
      page,
      meta: {
        cursor: parsed.cursor ?? null,
        nextCursor,
        hasMore,
        limit,
        totalCount: sortedOutlets.length,
      },
    };
  }

  async search(rawInput: unknown): Promise<DiscoverySearchResultWithMeta> {
    const parsed = discoveryQuerySchema.parse(rawInput);
    const evaluated = await this.evaluateCandidates(parsed);
    const paginated = this.paginateOutlets({
      sortedOutlets: evaluated.outlets,
      parsed,
      effectiveSort: evaluated.effectiveSort,
      validatedCoords: evaluated.validatedCoords,
      normalizedZoneId: evaluated.normalizedZoneId,
      excludeAllergens: evaluated.excludeAllergens,
    });

    const pageOutletIds = new Set(paginated.page.map((o) => o.outletId));
    const pageDishes = evaluated.dishes
      .filter((dish) => pageOutletIds.has(dish.outletId))
      .slice(0, 24);

    this.logger.info('discovery.search.executed', {
      hasQuery: Boolean(parsed.q),
      zoneId: evaluated.normalizedZoneId,
      sort: evaluated.effectiveSort,
      totalMatches: evaluated.outlets.length,
      returnedCount: paginated.page.length,
    });

    return {
      payload: {
        query: parsed.q ?? null,
        sort: evaluated.effectiveSort,
        rankingDisclosure: DISCOVERY_RANKING_DISCLOSURE,
        outlets: paginated.page,
        dishes: pageDishes,
        appliedFilters: {
          q: parsed.q ?? null,
          zoneId: evaluated.normalizedZoneId,
          dietary: parsed.dietary ?? null,
          excludeAllergens: evaluated.excludeAllergens,
          openNow: Boolean(parsed.openNow),
          verifiedOnly: Boolean(parsed.verifiedOnly),
          safetyStatus: parsed.safetyStatus ?? null,
          minSafetyScore: parsed.minSafetyScore ?? null,
          maxPricePaise: parsed.maxPricePaise ?? null,
          maxEtaMinutes: parsed.maxEtaMinutes ?? null,
          maxDistanceMeters: parsed.maxDistanceMeters ?? null,
          sort: evaluated.effectiveSort,
        },
      },
      meta: paginated.meta,
    };
  }

  async listPublicRestaurants(rawInput: unknown): Promise<DiscoveryRestaurantsResultWithMeta> {
    const parsed = discoveryQuerySchema.parse(rawInput);
    const evaluated = await this.evaluateCandidates(parsed);
    const paginated = this.paginateOutlets({
      sortedOutlets: evaluated.outlets,
      parsed,
      effectiveSort: evaluated.effectiveSort,
      validatedCoords: evaluated.validatedCoords,
      normalizedZoneId: evaluated.normalizedZoneId,
      excludeAllergens: evaluated.excludeAllergens,
    });

    return {
      restaurants: paginated.page,
      meta: paginated.meta,
    };
  }

  async listCategories(zoneId?: KolkataZoneId): Promise<DiscoveryCategoryDto[]> {
    const evaluated = await this.evaluateCandidates({
      limit: MAX_DISCOVERY_PAGE_LIMIT,
      ...(zoneId ? { zoneId } : {}),
    });

    return CURATED_DISCOVERY_CATEGORIES.map((category) => {
      const cat = category as {
        slug: string;
        label: string;
        query?: string;
        dietary?: DietaryType;
        verifiedOnly?: boolean;
        minSafetyScore?: number;
        maxEtaMinutes?: number;
      };
      const matchingOutletCount = evaluated.outlets.filter((outlet) => {
        if (cat.verifiedOnly && !outlet.trustBadge.isVerified) {
          return false;
        }
        if (
          cat.minSafetyScore !== undefined &&
          (outlet.trustBadge.score === null || outlet.trustBadge.score < cat.minSafetyScore)
        ) {
          return false;
        }
        if (
          cat.maxEtaMinutes !== undefined &&
          outlet.estimatedDeliveryMinutes > cat.maxEtaMinutes
        ) {
          return false;
        }
        if (cat.dietary === 'PURE_VEG' && !outlet.matchesPureVeg) {
          return false;
        }
        if (cat.query) {
          const hay =
            `${outlet.brandName} ${outlet.cuisines.join(' ')} ${outlet.matchedDishes.map((d) => d.title).join(' ')}`.toLowerCase();
          return hay.includes(cat.query.toLowerCase());
        }
        return true;
      }).length;

      return {
        ...category,
        matchingOutletCount,
      };
    });
  }
}
