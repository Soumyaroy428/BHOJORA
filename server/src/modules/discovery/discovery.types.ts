import type {
  AllergenCode,
  CuratedDiscoveryCategoryDef,
  DietaryType,
  DiscoveryCategoryDto,
  DiscoveryDishMatchDto,
  DiscoveryOutletResultDto,
  DiscoverySearchResponseDto,
  DiscoverySortOption,
  DiscoveryTrustBadgeDto,
  TrustBadgeMeta,
} from '@bhojora/shared';
import type { PaginationMeta } from '../../contracts/api';
import type { KolkataZoneId } from '../customer/customer.types';
import type { PlatformInspectionStatus } from '../restaurant/restaurant.types';

export const DISCOVERY_SORT_OPTIONS = [
  'relevance',
  'distance',
  'eta',
  'price_asc',
  'price_desc',
  'safety_score',
] as const satisfies readonly DiscoverySortOption[];

export const DISCOVERY_SORT_LABELS = {
  relevance: 'Relevance',
  distance: 'Nearest First',
  eta: 'Fastest Delivery ETA',
  price_asc: 'Price: Low to High',
  price_desc: 'Price: High to Low',
  safety_score: 'Highest Verified Score',
} as const satisfies Readonly<Record<DiscoverySortOption, string>>;

export const DISCOVERY_RANKING_DISCLOSURE =
  'Search ranking uses keyword match, serviceability, delivery ETA, and menu price only. Bhojora never sells higher discovery placement or safety badges.' as const;

export const PLATFORM_SAFETY_BADGE_META = {
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
} as const satisfies Readonly<Record<PlatformInspectionStatus, TrustBadgeMeta>>;

export const MAX_DISCOVERY_QUERY_LENGTH = 80;
export const MAX_DISCOVERY_PAGE_LIMIT = 25;
export const DEFAULT_DISCOVERY_PAGE_LIMIT = 12;

export const CURATED_DISCOVERY_CATEGORIES = [
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
] as const satisfies readonly CuratedDiscoveryCategoryDef[];

export interface DiscoverySearchResultWithMeta {
  payload: DiscoverySearchResponseDto;
  meta: PaginationMeta;
}

export interface DiscoveryRestaurantsResultWithMeta {
  restaurants: DiscoveryOutletResultDto[];
  meta: PaginationMeta;
}

export interface DiscoveryRateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

export const DEFAULT_DISCOVERY_RATE_LIMIT: DiscoveryRateLimitOptions = {
  maxRequests: 120,
  windowMs: 60_000,
};

export type {
  AllergenCode,
  CuratedDiscoveryCategoryDef,
  DietaryType,
  DiscoveryCategoryDto,
  DiscoveryDishMatchDto,
  DiscoveryOutletResultDto,
  DiscoverySearchResponseDto,
  DiscoverySortOption,
  DiscoveryTrustBadgeDto,
  KolkataZoneId,
  PaginationMeta,
};
