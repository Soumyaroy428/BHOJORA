import type { AllergenCode, DietaryType } from './catalog';
import type { KolkataZoneId } from './customer';
import type { OutletLiveStatusReason } from './outlet';
import type { PlatformInspectionStatus, PublicRestaurantSummaryDto } from './restaurant';

export const DISCOVERY_SORT_OPTIONS = [
  'relevance',
  'distance',
  'eta',
  'price_asc',
  'price_desc',
  'safety_score',
] as const;

export type DiscoverySortOption = (typeof DISCOVERY_SORT_OPTIONS)[number];

export const DISCOVERY_SORT_LABELS: Readonly<Record<DiscoverySortOption, string>> = {
  relevance: 'Relevance',
  distance: 'Nearest First',
  eta: 'Fastest Delivery ETA',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  safety_score: 'Highest Verified Score',
};

export const DISCOVERY_RANKING_DISCLOSURE =
  'Search ranking uses keyword match, serviceability, delivery ETA, and menu price only. Bhojora never sells higher discovery placement or safety badges.' as const;

export interface TrustBadgeMeta {
  readonly label: string;
  readonly shortCode: string;
  readonly isVerified: boolean;
  readonly explanation: string;
}

export const PLATFORM_SAFETY_BADGE_META: Readonly<
  Record<PlatformInspectionStatus, TrustBadgeMeta>
> = {
  VERIFIED_CLEAN: {
    label: 'Verified Clean',
    shortCode: 'VERIFIED',
    isVerified: true,
    explanation:
      'Passed independent Bhojora on-site hygiene verification against standardized sanitation and food-handling checks.',
  },
  NOT_INSPECTED: {
    label: 'Not Yet Inspected',
    shortCode: 'UNINSPECTED',
    isVerified: false,
    explanation:
      'Statutory onboarding is complete, but an independent Bhojora physical kitchen hygiene audit has not yet been performed.',
  },
  SCHEDULED: {
    label: 'Inspection Scheduled',
    shortCode: 'SCHEDULED',
    isVerified: false,
    explanation:
      'An independent physical kitchen inspection is scheduled. Verified Clean status cannot be claimed until audit approval.',
  },
  ACTION_REQUIRED: {
    label: 'Action Required (CAP)',
    shortCode: 'CAP_PENDING',
    isVerified: false,
    explanation:
      'Corrective Action Plan (CAP) observations are open; re-verification is required before Verified Clean status applies.',
  },
  EXPIRED: {
    label: 'Inspection Expired',
    shortCode: 'EXPIRED',
    isVerified: false,
    explanation:
      'Previous independent inspection validity has expired; a new physical hygiene audit is required.',
  },
  SUSPENDED: {
    label: 'Safety Hold — Suspended',
    shortCode: 'SUSPENDED',
    isVerified: false,
    explanation: 'Kitchen discovery is paused pending resolution of critical food-safety findings.',
  },
};

export const MAX_DISCOVERY_QUERY_LENGTH = 80;
export const MAX_DISCOVERY_PAGE_LIMIT = 25;
export const DEFAULT_DISCOVERY_PAGE_LIMIT = 12;

export interface CuratedDiscoveryCategoryDef {
  slug: string;
  label: string;
  query?: string;
  dietary?: DietaryType;
  verifiedOnly?: boolean;
  minSafetyScore?: number;
  maxEtaMinutes?: number;
}

export const CURATED_DISCOVERY_CATEGORIES: readonly CuratedDiscoveryCategoryDef[] = [
  {
    slug: 'biryani-mughlai',
    label: 'Biryani & Mughlai',
    query: 'biryani',
  },
  {
    slug: 'heritage-continental',
    label: 'Heritage Continental',
    query: 'continental',
  },
  {
    slug: 'bengali-classics',
    label: 'Bengali Classics & Mishti',
    query: 'bengali',
  },
  {
    slug: 'pure-veg',
    label: 'Pure Veg Kitchens',
    dietary: 'PURE_VEG',
  },
  {
    slug: 'verified-90-plus',
    label: 'Verified Clean 90+',
    verifiedOnly: true,
    minSafetyScore: 90,
  },
  {
    slug: 'under-30-mins',
    label: 'Fast Under 30 mins',
    maxEtaMinutes: 30,
  },
];

export interface DiscoveryTrustBadgeDto {
  status: PlatformInspectionStatus;
  isVerified: boolean;
  label: string;
  shortCode: string;
  score: number | null;
  auditDate: string | null;
  validUntil: string | null;
  explanation: string;
  fssaiNotice: string;
}

export interface DiscoveryDishMatchDto {
  itemId: string;
  outletId: string;
  restaurantId: string;
  brandName: string;
  outletName: string;
  categoryId: string;
  title: string;
  description: string;
  pricePaise: number;
  formattedPriceInr: string;
  dietaryType: DietaryType;
  dietaryBadgeLabel: string;
  allergens: AllergenCode[];
  allergenLabels: string[];
  isAvailable: boolean;
  outletVerifiedClean: boolean;
  outletSafetyScore: number | null;
}

export interface DiscoveryOutletResultDto extends PublicRestaurantSummaryDto {
  locality: string;
  landmark: string;
  coordinates: [number, number];
  estimatedDeliveryMinutes: number;
  deliveryFeePaise: number;
  minPricePaise: number | null;
  formattedMinPriceInr: string | null;
  matchesPureVeg: boolean;
  availableDishCount: number;
  matchedDishes: DiscoveryDishMatchDto[];
  liveStatusReason: OutletLiveStatusReason;
  trustBadge: DiscoveryTrustBadgeDto;
  relevanceScore: number;
}

export interface DiscoveryAppliedFiltersDto {
  q: string | null;
  zoneId: KolkataZoneId | null;
  dietary: DietaryType | null;
  excludeAllergens: AllergenCode[];
  openNow: boolean;
  verifiedOnly: boolean;
  safetyStatus: PlatformInspectionStatus | null;
  minSafetyScore: number | null;
  maxPricePaise: number | null;
  maxEtaMinutes: number | null;
  maxDistanceMeters: number | null;
  sort: DiscoverySortOption;
}

export interface DiscoverySearchResponseDto {
  query: string | null;
  sort: DiscoverySortOption;
  rankingDisclosure: string;
  outlets: DiscoveryOutletResultDto[];
  dishes: DiscoveryDishMatchDto[];
  appliedFilters: DiscoveryAppliedFiltersDto;
}

export interface DiscoveryCategoryDto extends CuratedDiscoveryCategoryDef {
  matchingOutletCount: number;
}
