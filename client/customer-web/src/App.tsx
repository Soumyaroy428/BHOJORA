import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CuratedDiscoveryCategoryDef,
  DiscoveryDishMatchDto,
  DiscoveryOutletResultDto,
  DiscoverySearchResponseDto,
  DiscoverySortOption,
  PaginationMeta,
} from '@bhojora/shared';
import { AuthDialog } from './components/AuthDialog';
import { BengaliBanner } from './components/BengaliBanner';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { KitchenDiscovery } from './components/KitchenDiscovery';
import { OutletMenuDialog } from './components/OutletMenuDialog';
import { PillarsSection } from './components/PillarsSection';
import { PilotInfoDialog } from './components/PilotInfoDialog';
import { TrustProfileDialog } from './components/TrustProfileDialog';
import { KOLKATA_ZONE_OPTIONS, VERIFIED_KOLKATA_KITCHENS } from './data/kitchens';
import { apiRequest } from './lib/apiClient';
import type {
  AuthSessionState,
  KitchenOutlet,
  KolkataZoneId,
  LocationPermissionState,
} from './types/domain';

const RECENT_SEARCHES_KEY = 'bhojora_recent_searches_v1';
const SAVED_KITCHENS_KEY = 'bhojora_saved_kitchens_v1';
const DEFAULT_OFFLINE_PAGE_SIZE = 4;

function readStoredStringList(storageKey: string): string[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function writeStoredStringList(storageKey: string, items: readonly string[]): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function toKitchenOutletFromApi(dto: DiscoveryOutletResultDto): KitchenOutlet {
  const isVerified = dto.trustBadge.isVerified;
  return {
    key: dto.outletId,
    outletId: dto.outletId,
    name: dto.brandName,
    fullName: `${dto.brandName} (${dto.outletName})`,
    locality: dto.locality,
    etaMinutes: `${Math.max(15, dto.estimatedDeliveryMinutes - 5)}–${dto.estimatedDeliveryMinutes + 5} mins`,
    etaMinValue: dto.estimatedDeliveryMinutes,
    cuisines: dto.cuisines.join(', '),
    rating: '4.6',
    ratingNumeric: 4.6,
    reviewCount: 'New',
    platformInspectionStatus: dto.trustBadge.status,
    isVerified,
    score: isVerified ? dto.trustBadge.score : null,
    auditedMonth:
      isVerified && dto.trustBadge.auditDate
        ? dto.trustBadge.auditDate.slice(0, 7)
        : 'Audit Pending',
    auditDate: isVerified ? dto.trustBadge.auditDate : null,
    statusExplanation: dto.trustBadge.explanation,
    fssai: dto.fssaiLicenseNumber,
    isPureVeg: dto.matchesPureVeg,
    isOpenNow: Boolean(dto.isOpenNow),
    minPricePaise: dto.minPricePaise ?? 24000,
    coordinates: dto.coordinates,
    distanceMeters: dto.distanceMeters,
    serviceable: dto.serviceable,
    zones: [dto.zoneId as Exclude<KolkataZoneId, 'all'>],
    searchText:
      `${dto.brandName} ${dto.outletName} ${dto.locality} ${dto.cuisines.join(' ')}`.toLowerCase(),
    imageUrl:
      'https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=600&q=80',
    categoryPercentages: isVerified ? [94, 91, 93, 90, 92] : null,
    matchedDishes: dto.matchedDishes,
  };
}

export function App() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedZone, setSelectedZone] = useState<KolkataZoneId>('all');
  const [locationPermissionState, setLocationPermissionState] =
    useState<LocationPermissionState>('prompt');
  const [activeCategorySlug, setActiveCategorySlug] = useState<string | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(true);
  const [vegOnly, setVegOnly] = useState(false);
  const [openNowOnly, setOpenNowOnly] = useState(false);
  const [savedOnly, setSavedOnly] = useState(false);
  const [maxEtaMinutes, setMaxEtaMinutes] = useState<number | null>(null);
  const [maxPricePaise, setMaxPricePaise] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<DiscoverySortOption>('relevance');
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [offlinePageLimit, setOfflinePageLimit] = useState(DEFAULT_OFFLINE_PAGE_SIZE);
  const [bannerInEnglish, setBannerInEnglish] = useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>(() =>
    readStoredStringList(RECENT_SEARCHES_KEY),
  );
  const [savedKitchenKeys, setSavedKitchenKeys] = useState<string[]>(() =>
    readStoredStringList(SAVED_KITCHENS_KEY),
  );

  const [liveResults, setLiveResults] = useState<KitchenOutlet[] | null>(null);
  const [liveDishes, setLiveDishes] = useState<DiscoveryDishMatchDto[] | null>(null);
  const [liveMeta, setLiveMeta] = useState<PaginationMeta | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveSourceNotice, setLiveSourceNotice] = useState<string | null>(null);

  const [selectedTrustKitchen, setSelectedTrustKitchen] = useState<KitchenOutlet | null>(null);
  const [selectedMenuKitchen, setSelectedMenuKitchen] = useState<KitchenOutlet | null>(null);
  const [pilotInfoOpen, setPilotInfoOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSessionState | null>(null);

  const configuredApiBase = useMemo(() => {
    const windowBase =
      typeof window !== 'undefined' && typeof window.BHOJORA_API_BASE === 'string'
        ? window.BHOJORA_API_BASE.trim()
        : '';
    return windowBase || (import.meta.env.VITE_API_BASE?.trim() ?? '');
  }, []);

  const buildSearchQueryParams = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams();
      if (searchQuery.trim()) {
        params.set('q', searchQuery.trim());
      }
      if (selectedZone !== 'all') {
        params.set('zoneId', selectedZone);
      }
      if (verifiedOnly) {
        params.set('verifiedOnly', 'true');
      }
      if (vegOnly) {
        params.set('dietary', 'PURE_VEG');
      }
      if (openNowOnly) {
        params.set('openNow', 'true');
      }
      if (maxEtaMinutes !== null) {
        params.set('maxEtaMinutes', String(maxEtaMinutes));
      }
      if (maxPricePaise !== null) {
        params.set('maxPricePaise', String(maxPricePaise));
      }
      params.set('sort', sortBy);
      params.set('limit', '12');
      if (cursor) {
        params.set('cursor', cursor);
      }
      return params.toString();
    },
    [
      searchQuery,
      selectedZone,
      verifiedOnly,
      vegOnly,
      openNowOnly,
      maxEtaMinutes,
      maxPricePaise,
      sortBy,
    ],
  );

  useEffect(() => {
    if (!configuredApiBase) {
      setLiveResults(null);
      setLiveDishes(null);
      setLiveMeta(null);
      setLiveSourceNotice(null);
      return;
    }

    let cancelled = false;
    setLoadingLive(true);

    void (async () => {
      try {
        const res = await fetch(
          `${configuredApiBase.replace(/\/+$/, '')}/search?${buildSearchQueryParams()}`,
          { headers: { 'X-Requested-With': 'fetch' } },
        );
        const contentType = res.headers.get('content-type') ?? '';
        if (!res.ok || !contentType.includes('application/json')) {
          throw new Error('PREVIEW_NO_API');
        }
        const json = (await res.json()) as {
          success?: boolean;
          data?: DiscoverySearchResponseDto;
          meta?: PaginationMeta;
        };
        if (!cancelled && json.success && json.data) {
          setLiveResults(json.data.outlets.map(toKitchenOutletFromApi));
          setLiveDishes(json.data.dishes);
          setLiveMeta(json.meta ?? null);
          setLiveSourceNotice('Live API discovery feed');
        }
      } catch {
        if (!cancelled) {
          setLiveResults(null);
          setLiveDishes(null);
          setLiveMeta(null);
          setLiveSourceNotice('Kolkata curated sample index');
        }
      } finally {
        if (!cancelled) {
          setLoadingLive(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [configuredApiBase, buildSearchQueryParams]);

  const handleLoadMoreLive = useCallback(async () => {
    if (!configuredApiBase || !liveMeta?.nextCursor) {
      return;
    }
    try {
      const res = await fetch(
        `${configuredApiBase.replace(/\/+$/, '')}/search?${buildSearchQueryParams(liveMeta.nextCursor)}`,
        { headers: { 'X-Requested-With': 'fetch' } },
      );
      const json = (await res.json()) as {
        success?: boolean;
        data?: DiscoverySearchResponseDto;
        meta?: PaginationMeta;
      };
      if (json.success && json.data) {
        const nextPage = json.data.outlets.map(toKitchenOutletFromApi);
        setLiveResults((prev) => [...(prev ?? []), ...nextPage]);
        setLiveMeta(json.meta ?? null);
      }
    } catch {
      // Keep current results visible cleanly on network hiccup
    }
  }, [configuredApiBase, liveMeta, buildSearchQueryParams]);

  const handleSubmitSearch = useCallback(
    (queryOverride?: string) => {
      const term = (queryOverride ?? searchQuery).trim();
      if (!term) {
        return;
      }
      setRecentSearches((prev) => {
        const next = [
          term,
          ...prev.filter((item) => item.toLowerCase() !== term.toLowerCase()),
        ].slice(0, 5);
        writeStoredStringList(RECENT_SEARCHES_KEY, next);
        return next;
      });
    },
    [searchQuery],
  );

  const handleClearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    writeStoredStringList(RECENT_SEARCHES_KEY, []);
  }, []);

  const handleToggleSaveKitchen = useCallback((kitchenKey: string) => {
    setSavedKitchenKeys((prev) => {
      const next = prev.includes(kitchenKey)
        ? prev.filter((item) => item !== kitchenKey)
        : [...prev, kitchenKey];
      writeStoredStringList(SAVED_KITCHENS_KEY, next);
      return next;
    });
  }, []);

  const handleSelectCategory = useCallback((category: CuratedDiscoveryCategoryDef | null) => {
    setOfflinePageLimit(DEFAULT_OFFLINE_PAGE_SIZE);
    if (!category) {
      setActiveCategorySlug(null);
      setSearchQuery('');
      setVegOnly(false);
      setVerifiedOnly(true);
      setMaxEtaMinutes(null);
      return;
    }
    setActiveCategorySlug(category.slug);
    setSearchQuery(category.query ?? '');
    setVegOnly(category.dietary === 'PURE_VEG');
    setVerifiedOnly(category.verifiedOnly ?? false);
    setMaxEtaMinutes(category.maxEtaMinutes ?? null);
  }, []);

  const handleDetectGpsZone = useCallback(
    (
      zone: Exclude<KolkataZoneId, 'all'>,
      nextPerm: LocationPermissionState,
      localityLabel: string,
    ) => {
      setSelectedZone(zone);
      setLocationPermissionState(nextPerm);
      if (authSession?.tokens.accessToken) {
        void apiRequest('/customer/profile', {
          method: 'PATCH',
          token: authSession.tokens.accessToken,
          body: {
            savedDeliveryZoneId: zone,
            locationPermissionState: nextPerm,
            lastKnownLocalityLabel: localityLabel,
          },
        }).catch(() => {});
      }
    },
    [authSession],
  );

  const selectedZoneLabel = useMemo(() => {
    return KOLKATA_ZONE_OPTIONS.find((item) => item.id === selectedZone)?.label ?? 'All Kolkata';
  }, [selectedZone]);

  const headerZoneLabel = selectedZone === 'all' ? 'Salt Lake, Sector V' : selectedZoneLabel;

  const { visibleKitchens, totalMatchedCount, hasMore, matchedDishes } = useMemo(() => {
    if (liveResults !== null) {
      const filteredLive = savedOnly
        ? liveResults.filter((item) => savedKitchenKeys.includes(item.key))
        : liveResults;
      return {
        visibleKitchens: filteredLive,
        totalMatchedCount: liveMeta?.totalCount ?? filteredLive.length,
        hasMore: Boolean(liveMeta?.hasMore),
        matchedDishes: liveDishes ?? [],
      };
    }

    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = VERIFIED_KOLKATA_KITCHENS.filter((kitchen) => {
      if (selectedZone !== 'all' && !kitchen.zones.includes(selectedZone)) {
        return false;
      }
      if (verifiedOnly && (!kitchen.isVerified || kitchen.score === null)) {
        return false;
      }
      if (vegOnly && !kitchen.isPureVeg) {
        return false;
      }
      if (openNowOnly && !kitchen.isOpenNow) {
        return false;
      }
      if (savedOnly && !savedKitchenKeys.includes(kitchen.key)) {
        return false;
      }
      if (maxEtaMinutes !== null && kitchen.etaMinValue > maxEtaMinutes) {
        return false;
      }
      if (maxPricePaise !== null && kitchen.minPricePaise > maxPricePaise) {
        return false;
      }
      if (normalizedQuery) {
        const dishHit = (kitchen.matchedDishes ?? []).some((d) =>
          `${d.title} ${d.description}`.toLowerCase().includes(normalizedQuery),
        );
        if (!kitchen.searchText.includes(normalizedQuery) && !dishHit) {
          return false;
        }
      }
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'eta':
          return a.etaMinValue - b.etaMinValue;
        case 'price_asc':
          return a.minPricePaise - b.minPricePaise;
        case 'price_desc':
          return b.minPricePaise - a.minPricePaise;
        case 'safety_score':
          return (b.score ?? -1) - (a.score ?? -1);
        case 'distance':
        case 'relevance':
        default:
          return Number(b.isVerified) - Number(a.isVerified) || a.etaMinValue - b.etaMinValue;
      }
    });

    const dishes: DiscoveryDishMatchDto[] = [];
    for (const kitchen of sorted) {
      for (const dish of kitchen.matchedDishes ?? []) {
        if (vegOnly && dish.dietaryType !== 'PURE_VEG') {
          continue;
        }
        if (maxPricePaise !== null && dish.pricePaise > maxPricePaise) {
          continue;
        }
        if (
          normalizedQuery &&
          !`${dish.title} ${dish.description} ${dish.brandName}`
            .toLowerCase()
            .includes(normalizedQuery)
        ) {
          continue;
        }
        if (normalizedQuery || vegOnly || maxPricePaise !== null) {
          dishes.push(dish);
        }
      }
    }

    return {
      visibleKitchens: sorted.slice(0, offlinePageLimit),
      totalMatchedCount: sorted.length,
      hasMore: sorted.length > offlinePageLimit,
      matchedDishes: dishes,
    };
  }, [
    liveResults,
    liveMeta,
    liveDishes,
    searchQuery,
    selectedZone,
    verifiedOnly,
    vegOnly,
    openNowOnly,
    savedOnly,
    savedKitchenKeys,
    maxEtaMinutes,
    maxPricePaise,
    sortBy,
    offlinePageLimit,
  ]);

  const signedInFirstName = authSession?.user.name
    ? (authSession.user.name.split(' ')[0] ?? 'Account')
    : null;

  return (
    <>
      <a href="#main-content" className="skip-link visually-hidden">
        Skip to main content
      </a>

      <Header
        headerZoneLabel={headerZoneLabel}
        signedInFirstName={signedInFirstName}
        onOpenPilotInfo={() => setPilotInfoOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
      />

      <main id="main-content" tabIndex={-1}>
        <HeroSection
          searchQuery={searchQuery}
          selectedZone={selectedZone}
          recentSearches={recentSearches}
          onSearchChange={(val) => {
            setSearchQuery(val);
            setActiveCategorySlug(null);
          }}
          onSubmitSearch={handleSubmitSearch}
          onClearRecentSearches={handleClearRecentSearches}
          onSelectZone={(zone) => {
            setSelectedZone(zone);
            setOfflinePageLimit(DEFAULT_OFFLINE_PAGE_SIZE);
          }}
        />

        <KitchenDiscovery
          kitchens={visibleKitchens}
          totalMatchedCount={totalMatchedCount}
          dishMatches={matchedDishes}
          selectedZoneLabel={selectedZoneLabel}
          activeCategorySlug={activeCategorySlug}
          verifiedOnly={verifiedOnly}
          vegOnly={vegOnly}
          openNowOnly={openNowOnly}
          savedOnly={savedOnly}
          savedKitchenKeys={savedKitchenKeys}
          maxEtaMinutes={maxEtaMinutes}
          maxPricePaise={maxPricePaise}
          sortBy={sortBy}
          viewMode={viewMode}
          hasMore={hasMore}
          loadingLive={loadingLive}
          liveSourceNotice={liveSourceNotice}
          onSelectCategory={handleSelectCategory}
          onToggleVerifiedOnly={() => setVerifiedOnly((prev) => !prev)}
          onToggleVegOnly={() => setVegOnly((prev) => !prev)}
          onToggleOpenNowOnly={() => setOpenNowOnly((prev) => !prev)}
          onToggleSavedOnly={() => setSavedOnly((prev) => !prev)}
          onToggleSaveKitchen={handleToggleSaveKitchen}
          onChangeMaxEta={setMaxEtaMinutes}
          onChangeMaxPrice={setMaxPricePaise}
          onChangeSortBy={setSortBy}
          onChangeViewMode={setViewMode}
          onLoadMore={() => {
            if (liveResults !== null) {
              void handleLoadMoreLive();
            } else {
              setOfflinePageLimit((prev) => prev + DEFAULT_OFFLINE_PAGE_SIZE);
            }
          }}
          onOpenTrustProfile={(kitchen) => setSelectedTrustKitchen(kitchen)}
          onOpenMenu={(kitchen) => setSelectedMenuKitchen(kitchen)}
        />

        <BengaliBanner
          inEnglish={bannerInEnglish}
          onToggleLanguage={() => setBannerInEnglish((prev) => !prev)}
        />

        <PillarsSection />
      </main>

      <TrustProfileDialog
        kitchen={selectedTrustKitchen}
        onClose={() => setSelectedTrustKitchen(null)}
      />

      <OutletMenuDialog
        kitchen={selectedMenuKitchen}
        onClose={() => setSelectedMenuKitchen(null)}
      />

      <PilotInfoDialog
        open={pilotInfoOpen}
        selectedZone={selectedZone}
        permissionState={locationPermissionState}
        onSelectZone={setSelectedZone}
        onDetectGpsZone={handleDetectGpsZone}
        onClose={() => setPilotInfoOpen(false)}
      />

      <AuthDialog
        open={authModalOpen}
        session={authSession}
        selectedZone={selectedZone}
        locationPermissionState={locationPermissionState}
        onSessionChange={setAuthSession}
        onSelectZone={setSelectedZone}
        onLocationPermissionChange={setLocationPermissionState}
        onClose={() => setAuthModalOpen(false)}
      />

      <Footer />
    </>
  );
}
