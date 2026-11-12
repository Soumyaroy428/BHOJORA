import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CartAddonSelectionDto,
  CartDto,
  CartVariantSelectionDto,
  CheckoutQuoteDto,
  CreateOrderResultDto,
  CuratedDiscoveryCategoryDef,
  DiscoveryDishMatchDto,
  DiscoveryOutletResultDto,
  DiscoverySearchResponseDto,
  DiscoverySortOption,
  MenuItemDto,
  OrderCancelReason,
  OrderDto,
  OrderEventDto,
  OrderListResponseDto,
  OrderTrackingDto,
  PaginationMeta,
  PaymentAttemptDto,
  PublicCouponSummaryDto,
} from '@bhojora/shared';
import { formatInrFromPaise } from '@bhojora/shared';
import { AuthDialog } from './components/AuthDialog';
import { BengaliBanner } from './components/BengaliBanner';
import { CartCheckoutDialog } from './components/CartCheckoutDialog';
import { CustomerOrdersDialog } from './components/CustomerOrdersDialog';
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
import {
  applyPreviewCartAddition,
  buildPreviewCheckoutQuote,
  createEmptyCart,
  KOLKATA_QUOTE_LOCATIONS,
  PREVIEW_PILOT_COUPONS,
  readStoredPreviewCart,
  recalculatePreviewCartTotals,
  writeStoredPreviewCart,
} from './lib/cartHelpers';
import {
  advancePreviewOrderBundle,
  buildPreviewOrderBundle,
  buildPreviewTracking,
  cancelPreviewOrderBundle,
  createClientIdempotencyKey,
  readStoredPreviewOrders,
  writeStoredPreviewOrders,
  type PreviewOrderBundle,
} from './lib/orderHelpers';
import type {
  AuthSessionState,
  KitchenOutlet,
  KolkataZoneId,
  LocationPermissionState,
} from './types/domain';

const HAS_CONFIGURED_API =
  typeof window !== 'undefined' && typeof window.BHOJORA_API_BASE === 'string'
    ? window.BHOJORA_API_BASE.trim().length > 0
    : Boolean(import.meta.env.VITE_API_BASE?.trim());

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
  const [cartModalOpen, setCartModalOpen] = useState(false);
  const [cart, setCart] = useState<CartDto>(() => readStoredPreviewCart());
  const [quote, setQuote] = useState<CheckoutQuoteDto | null>(null);
  const [availableCoupons, setAvailableCoupons] = useState<PublicCouponSummaryDto[]>(() => [
    ...PREVIEW_PILOT_COUPONS,
  ]);
  const [selectedQuoteLocationId, setSelectedQuoteLocationId] =
    useState<Exclude<KolkataZoneId, 'all'>>('salt-lake');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [tipPaise, setTipPaise] = useState(0);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  const [previewOrderBundles, setPreviewOrderBundles] = useState<PreviewOrderBundle[]>(() =>
    readStoredPreviewOrders(),
  );
  const [liveOrders, setLiveOrders] = useState<OrderDto[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [liveTracking, setLiveTracking] = useState<OrderTrackingDto | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [cancellingOrder, setCancellingOrder] = useState(false);
  const [ordersStatusMessage, setOrdersStatusMessage] = useState<string | null>(null);
  const [ordersErrorMessage, setOrdersErrorMessage] = useState<string | null>(null);

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

  const isLiveCartMode = HAS_CONFIGURED_API && Boolean(authSession?.tokens.accessToken);

  useEffect(() => {
    if (!HAS_CONFIGURED_API) {
      return;
    }
    let cancelled = false;
    void apiRequest<{ coupons: PublicCouponSummaryDto[] }>('/coupons/available')
      .then((res) => {
        if (!cancelled && Array.isArray(res.coupons) && res.coupons.length > 0) {
          setAvailableCoupons(res.coupons);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLiveCartMode) {
      writeStoredPreviewCart(cart);
    }
  }, [cart, isLiveCartMode]);

  useEffect(() => {
    if (!isLiveCartMode) {
      writeStoredPreviewOrders(previewOrderBundles);
    }
  }, [previewOrderBundles, isLiveCartMode]);

  const loadOrderTracking = useCallback(
    async (orderId: string) => {
      if (!isLiveCartMode || !authSession?.tokens.accessToken) {
        return;
      }
      try {
        const tracking = await apiRequest<OrderTrackingDto>(
          `/orders/${encodeURIComponent(orderId)}/tracking`,
          { token: authSession.tokens.accessToken },
        );
        setLiveTracking(tracking);
        setOrdersErrorMessage(null);
      } catch (err) {
        setOrdersErrorMessage(
          err instanceof Error ? err.message : 'Unable to refresh order tracking.',
        );
      }
    },
    [isLiveCartMode, authSession?.tokens.accessToken],
  );

  const loadOrdersList = useCallback(
    async (preferredOrderId?: string) => {
      if (!isLiveCartMode || !authSession?.tokens.accessToken) {
        return;
      }
      setOrdersLoading(true);
      try {
        const res = await apiRequest<OrderListResponseDto>('/orders', {
          token: authSession.tokens.accessToken,
        });
        setLiveOrders(res.orders);
        const targetId =
          preferredOrderId ??
          (selectedOrderId && res.orders.some((o) => o.orderId === selectedOrderId)
            ? selectedOrderId
            : (res.orders[0]?.orderId ?? null));
        setSelectedOrderId(targetId);
        if (targetId) {
          await loadOrderTracking(targetId);
        } else {
          setLiveTracking(null);
        }
      } catch (err) {
        setOrdersErrorMessage(err instanceof Error ? err.message : 'Unable to load orders.');
      } finally {
        setOrdersLoading(false);
      }
    },
    [isLiveCartMode, authSession?.tokens.accessToken, selectedOrderId, loadOrderTracking],
  );

  useEffect(() => {
    const token = authSession?.tokens.accessToken;
    if (!HAS_CONFIGURED_API || !token) {
      return;
    }
    let cancelled = false;
    void apiRequest<{ cart: CartDto }>('/cart', { token })
      .then((res) => {
        if (!cancelled && res.cart) {
          setCart(res.cart);
        }
      })
      .catch(() => {});
    void apiRequest<OrderListResponseDto>('/orders', { token })
      .then((res) => {
        if (!cancelled && Array.isArray(res.orders)) {
          setLiveOrders(res.orders);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authSession?.tokens.accessToken]);

  const computeQuoteForState = useCallback(
    async (
      acceptPriceChanges = false,
      overrides?: {
        cartSnapshot?: CartDto;
        locationId?: Exclude<KolkataZoneId, 'all'>;
        couponCode?: string;
        nextTipPaise?: number;
      },
    ) => {
      const targetCart = overrides?.cartSnapshot ?? cart;
      const locId = overrides?.locationId ?? selectedQuoteLocationId;
      const code = overrides?.couponCode ?? appliedCouponCode;
      const nextTip = overrides?.nextTipPaise ?? tipPaise;

      if (!targetCart.outletId || targetCart.items.length === 0) {
        setQuote(null);
        setQuoteError(null);
        return;
      }

      if (isLiveCartMode && authSession?.tokens.accessToken) {
        const loc =
          KOLKATA_QUOTE_LOCATIONS.find((l) => l.id === locId) ?? KOLKATA_QUOTE_LOCATIONS[0]!;
        setQuoteLoading(true);
        setQuoteError(null);
        try {
          const res = await apiRequest<{ quote: CheckoutQuoteDto }>('/checkout/quote', {
            method: 'POST',
            token: authSession.tokens.accessToken,
            body: {
              coordinates: [...loc.coordinates],
              couponCode: code.trim() ? code.trim().toUpperCase() : null,
              tipPaise: nextTip,
              acceptPriceChanges,
            },
          });
          setQuote(res.quote);
          if (acceptPriceChanges) {
            const refreshedCart = await apiRequest<{ cart: CartDto }>('/cart', {
              token: authSession.tokens.accessToken,
            });
            setCart(refreshedCart.cart);
          }
        } catch (err) {
          setQuoteError(err instanceof Error ? err.message : 'Unable to generate checkout quote.');
        } finally {
          setQuoteLoading(false);
        }
        return;
      }

      const matchedKitchen =
        liveResults?.find((k) => k.key === targetCart.outletId) ??
        VERIFIED_KOLKATA_KITCHENS.find((k) => k.key === targetCart.outletId);
      const preview = buildPreviewCheckoutQuote({
        cart: targetCart,
        kitchen: matchedKitchen,
        locationId: locId,
        couponCode: code,
        tipPaise: nextTip,
      });
      setQuoteError(preview.couponError);
      setQuote(preview.quote);
    },
    [
      cart,
      selectedQuoteLocationId,
      appliedCouponCode,
      tipPaise,
      isLiveCartMode,
      authSession?.tokens.accessToken,
      liveResults,
    ],
  );

  const handleOpenCartModal = useCallback(() => {
    setCartModalOpen(true);
    if (cart.items.length > 0) {
      void computeQuoteForState(false);
    }
  }, [cart.items.length, computeQuoteForState]);

  const handleAddToCart = useCallback(
    async (params: {
      kitchen: KitchenOutlet;
      item: MenuItemDto;
      selectedVariants: CartVariantSelectionDto[];
      selectedAddons: CartAddonSelectionDto[];
      replaceOutlet: boolean;
    }): Promise<'ADDED' | 'CONFLICT'> => {
      const { kitchen, item, selectedVariants, selectedAddons, replaceOutlet } = params;

      if (isLiveCartMode && authSession?.tokens.accessToken) {
        try {
          const res = await apiRequest<{ cart: CartDto }>('/cart/items', {
            method: 'POST',
            token: authSession.tokens.accessToken,
            body: {
              outletId: kitchen.key,
              menuItemId: item.itemId,
              quantity: 1,
              replaceOutlet,
              selectedVariants: selectedVariants.map((v) => ({
                groupId: v.groupId,
                optionId: v.optionId,
              })),
              selectedAddons: selectedAddons.map((a) => ({
                groupId: a.groupId,
                optionId: a.optionId,
              })),
            },
          });
          setCart(res.cart);
          if (replaceOutlet) {
            setAppliedCouponCode('');
            setCouponInput('');
          }
          if (cartModalOpen) {
            void computeQuoteForState(false, {
              cartSnapshot: res.cart,
              couponCode: replaceOutlet ? '' : appliedCouponCode,
            });
          }
          return 'ADDED';
        } catch (err) {
          const errObj =
            typeof err === 'object' && err !== null
              ? (err as { status?: number; code?: string; message?: string })
              : null;
          if (
            errObj &&
            (errObj.status === 409 ||
              errObj.code === 'SINGLE_OUTLET_CONFLICT' ||
              errObj.code === 'CONFLICT')
          ) {
            if (
              errObj.code === 'SINGLE_OUTLET_CONFLICT' ||
              (typeof errObj.message === 'string' &&
                errObj.message.toLowerCase().includes('another outlet'))
            ) {
              return 'CONFLICT';
            }
          }
          throw err;
        }
      }

      const next = applyPreviewCartAddition({
        current: cart,
        kitchen,
        item,
        variants: selectedVariants,
        addons: selectedAddons,
        quantity: 1,
        replaceOutlet,
      });
      if (!next.ok) {
        return 'CONFLICT';
      }
      setCart(next.cart);
      if (replaceOutlet) {
        setAppliedCouponCode('');
        setCouponInput('');
      }
      if (cartModalOpen) {
        void computeQuoteForState(false, {
          cartSnapshot: next.cart,
          couponCode: replaceOutlet ? '' : appliedCouponCode,
        });
      }
      return 'ADDED';
    },
    [
      isLiveCartMode,
      authSession?.tokens.accessToken,
      cart,
      cartModalOpen,
      appliedCouponCode,
      computeQuoteForState,
    ],
  );

  const handleUpdateCartItemQty = useCallback(
    async (cartItemId: string, nextQty: number) => {
      if (isLiveCartMode && authSession?.tokens.accessToken) {
        try {
          const res =
            nextQty <= 0
              ? await apiRequest<{ cart: CartDto }>(
                  `/cart/items/${encodeURIComponent(cartItemId)}`,
                  {
                    method: 'DELETE',
                    token: authSession.tokens.accessToken,
                  },
                )
              : await apiRequest<{ cart: CartDto }>(
                  `/cart/items/${encodeURIComponent(cartItemId)}`,
                  {
                    method: 'PATCH',
                    token: authSession.tokens.accessToken,
                    body: { quantity: nextQty },
                  },
                );
          setCart(res.cart);
          void computeQuoteForState(false, { cartSnapshot: res.cart });
        } catch (err) {
          setQuoteError(err instanceof Error ? err.message : 'Unable to update cart item.');
        }
        return;
      }

      const updatedItems = cart.items
        .map((line) => {
          if (line.cartItemId !== cartItemId) {
            return line;
          }
          if (nextQty <= 0) {
            return { ...line, quantity: 0, lineTotalPaise: 0 };
          }
          const clamped = Math.min(20, nextQty);
          return {
            ...line,
            quantity: clamped,
            lineTotalPaise: line.effectiveUnitPricePaise * clamped,
            formattedLineTotalInr: formatInrFromPaise(line.effectiveUnitPricePaise * clamped),
          };
        })
        .filter((line) => line.quantity > 0);
      const next = recalculatePreviewCartTotals({ ...cart, items: updatedItems }).cart;
      setCart(next);
      void computeQuoteForState(false, { cartSnapshot: next });
    },
    [isLiveCartMode, authSession?.tokens.accessToken, cart, computeQuoteForState],
  );

  const handleClearCart = useCallback(async () => {
    if (isLiveCartMode && authSession?.tokens.accessToken) {
      try {
        const res = await apiRequest<{ cart: CartDto }>('/cart', {
          method: 'DELETE',
          token: authSession.tokens.accessToken,
        });
        setCart(res.cart);
      } catch {
        setCart(createEmptyCart());
      }
    } else {
      setCart(createEmptyCart());
    }
    setQuote(null);
    setQuoteError(null);
    setAppliedCouponCode('');
    setCouponInput('');
    setTipPaise(0);
  }, [isLiveCartMode, authSession?.tokens.accessToken]);

  const handleSelectQuoteLocation = useCallback(
    (locId: Exclude<KolkataZoneId, 'all'>) => {
      setSelectedQuoteLocationId(locId);
      void computeQuoteForState(false, { locationId: locId });
    },
    [computeQuoteForState],
  );

  const handleApplyCoupon = useCallback(
    (rawCode: string) => {
      const trimmed = rawCode.trim().toUpperCase();
      setCouponInput(trimmed);
      setAppliedCouponCode(trimmed);
      void computeQuoteForState(false, { couponCode: trimmed });
    },
    [computeQuoteForState],
  );

  const handleChangeTipPaise = useCallback(
    (nextTip: number) => {
      setTipPaise(nextTip);
      void computeQuoteForState(false, { nextTipPaise: nextTip });
    },
    [computeQuoteForState],
  );

  const displayedOrders = useMemo(
    () => (isLiveCartMode ? liveOrders : previewOrderBundles.map((b) => b.order)),
    [isLiveCartMode, liveOrders, previewOrderBundles],
  );

  const activeOrderCount = useMemo(
    () =>
      displayedOrders.filter((o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED').length,
    [displayedOrders],
  );

  const activePreviewBundle = useMemo(() => {
    if (isLiveCartMode || previewOrderBundles.length === 0) {
      return null;
    }
    return (
      previewOrderBundles.find((b) => b.order.orderId === selectedOrderId) ??
      previewOrderBundles[0]!
    );
  }, [isLiveCartMode, previewOrderBundles, selectedOrderId]);

  const activeTrackingDto: OrderTrackingDto | null = useMemo(() => {
    if (isLiveCartMode) {
      return liveTracking;
    }
    return activePreviewBundle
      ? buildPreviewTracking(activePreviewBundle.order, activePreviewBundle.events)
      : null;
  }, [isLiveCartMode, liveTracking, activePreviewBundle]);

  const activeOrderEvents: readonly OrderEventDto[] = useMemo(() => {
    if (isLiveCartMode) {
      return liveTracking?.events ?? [];
    }
    return activePreviewBundle?.events ?? [];
  }, [isLiveCartMode, liveTracking, activePreviewBundle]);

  const handleOpenOrdersModal = useCallback(() => {
    setOrdersStatusMessage(null);
    setOrdersErrorMessage(null);
    setOrdersModalOpen(true);
    if (isLiveCartMode) {
      void loadOrdersList();
    } else if (!selectedOrderId && previewOrderBundles.length > 0) {
      setSelectedOrderId(previewOrderBundles[0]!.order.orderId);
    }
  }, [isLiveCartMode, loadOrdersList, selectedOrderId, previewOrderBundles]);

  const handlePlaceOrder = useCallback(
    async (specialInstructions: string) => {
      if (!quote || cart.items.length === 0) {
        return;
      }
      setPlacingOrder(true);
      setOrderError(null);
      try {
        if (isLiveCartMode && authSession?.tokens.accessToken) {
          const paymentRes = await apiRequest<{ payment: PaymentAttemptDto }>('/payments/create', {
            method: 'POST',
            token: authSession.tokens.accessToken,
            headers: {
              'Idempotency-Key': createClientIdempotencyKey('pay'),
            },
            body: {
              quoteId: quote.quoteId,
              provider: 'SANDBOX_RAZORPAY',
              method: 'UPI',
              upiHandleHint: 'bhojora@okaxis',
              sandboxScenario: 'AUTO_CAPTURE',
            },
          });

          const verifiedRes = await apiRequest<{ payment: PaymentAttemptDto }>('/payments/verify', {
            method: 'POST',
            token: authSession.tokens.accessToken,
            body: { paymentId: paymentRes.payment.paymentId },
          });

          const orderRes = await apiRequest<CreateOrderResultDto>('/orders', {
            method: 'POST',
            token: authSession.tokens.accessToken,
            headers: {
              'Idempotency-Key': createClientIdempotencyKey('ord'),
            },
            body: {
              quoteId: quote.quoteId,
              paymentId: verifiedRes.payment.paymentId,
              ...(specialInstructions.trim()
                ? { specialInstructions: specialInstructions.trim() }
                : {}),
            },
          });

          setCart(createEmptyCart());
          setQuote(null);
          setAppliedCouponCode('');
          setCouponInput('');
          setTipPaise(0);
          setCartModalOpen(false);
          setSelectedOrderId(orderRes.order.orderId);
          setOrdersStatusMessage(
            `Order ${orderRes.order.orderNumber} placed and confirmed (${orderRes.order.formattedTotalPayableInr}).`,
          );
          setOrdersModalOpen(true);
          await loadOrdersList(orderRes.order.orderId);
          return;
        }

        const bundle = buildPreviewOrderBundle({ cart, quote, specialInstructions });
        setPreviewOrderBundles((prev) => [bundle, ...prev]);
        setCart(createEmptyCart());
        setQuote(null);
        setAppliedCouponCode('');
        setCouponInput('');
        setTipPaise(0);
        setCartModalOpen(false);
        setSelectedOrderId(bundle.order.orderId);
        setOrdersErrorMessage(null);
        setOrdersStatusMessage(
          `Order ${bundle.order.orderNumber} placed & confirmed (${bundle.order.formattedTotalPayableInr}).`,
        );
        setOrdersModalOpen(true);
      } catch (err) {
        setOrderError(err instanceof Error ? err.message : 'Unable to place order.');
      } finally {
        setPlacingOrder(false);
      }
    },
    [quote, cart, isLiveCartMode, authSession?.tokens.accessToken, loadOrdersList],
  );

  const handleSelectOrder = useCallback(
    (orderId: string) => {
      setSelectedOrderId(orderId);
      setOrdersStatusMessage(null);
      setOrdersErrorMessage(null);
      if (isLiveCartMode) {
        void loadOrderTracking(orderId);
      }
    },
    [isLiveCartMode, loadOrderTracking],
  );

  const handleCancelOrder = useCallback(
    async (orderId: string, reasonCode: OrderCancelReason, note: string) => {
      setCancellingOrder(true);
      setOrdersErrorMessage(null);
      setOrdersStatusMessage(null);
      try {
        if (isLiveCartMode && authSession?.tokens.accessToken) {
          const res = await apiRequest<{ order: OrderDto; events: OrderEventDto[] }>(
            `/orders/${encodeURIComponent(orderId)}/cancel`,
            {
              method: 'POST',
              token: authSession.tokens.accessToken,
              body: {
                reasonCode,
                ...(note.trim() ? { note: note.trim() } : {}),
              },
            },
          );
          setLiveOrders((prev) => prev.map((o) => (o.orderId === orderId ? res.order : o)));
          setOrdersStatusMessage(
            `Order ${res.order.orderNumber} cancelled (${res.order.cancellation?.refundStatus ?? 'QUEUED_FULL_REFUND'}).`,
          );
          await loadOrderTracking(orderId);
          return;
        }

        const target = previewOrderBundles.find((b) => b.order.orderId === orderId);
        if (!target) {
          return;
        }
        const outcome = cancelPreviewOrderBundle(target, reasonCode, note);
        if (!outcome.ok) {
          setOrdersErrorMessage(outcome.message);
          return;
        }
        setPreviewOrderBundles((prev) =>
          prev.map((b) => (b.order.orderId === orderId ? outcome.bundle : b)),
        );
        setOrdersStatusMessage(
          `Order ${outcome.bundle.order.orderNumber} cancelled (${outcome.bundle.order.cancellation?.refundStatus ?? 'NOT_REQUIRED'}).`,
        );
      } catch (err) {
        setOrdersErrorMessage(err instanceof Error ? err.message : 'Unable to cancel order.');
      } finally {
        setCancellingOrder(false);
      }
    },
    [isLiveCartMode, authSession?.tokens.accessToken, loadOrderTracking, previewOrderBundles],
  );

  const handleSimulatePreviewNextStep = useCallback((orderId: string) => {
    setOrdersErrorMessage(null);
    setPreviewOrderBundles((prev) =>
      prev.map((b) => (b.order.orderId === orderId ? advancePreviewOrderBundle(b) : b)),
    );
    setOrdersStatusMessage('Simulated kitchen/rider lifecycle stage update.');
  }, []);

  const handleReorderFromOrder = useCallback(
    (order: OrderDto) => {
      const matched =
        liveResults?.find((k) => k.key === order.outletId) ??
        VERIFIED_KOLKATA_KITCHENS.find((k) => k.key === order.outletId);
      setOrdersModalOpen(false);
      if (matched) {
        setSelectedMenuKitchen(matched);
      }
    },
    [liveResults],
  );

  return (
    <>
      <a href="#main-content" className="skip-link visually-hidden">
        Skip to main content
      </a>

      <Header
        headerZoneLabel={headerZoneLabel}
        signedInFirstName={signedInFirstName}
        cartItemCount={cart.itemCount}
        activeOrderCount={activeOrderCount}
        onOpenPilotInfo={() => setPilotInfoOpen(true)}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onOpenCartModal={handleOpenCartModal}
        onOpenOrdersModal={handleOpenOrdersModal}
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
        activeCartCount={cart.itemCount}
        activeCartOutletName={cart.brandName ?? cart.outletName}
        activeCartOutletId={cart.outletId}
        onAddToCart={handleAddToCart}
        onOpenCart={() => {
          setSelectedMenuKitchen(null);
          handleOpenCartModal();
        }}
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

      <CartCheckoutDialog
        open={cartModalOpen}
        cart={cart}
        quote={quote}
        availableCoupons={availableCoupons}
        selectedLocationId={selectedQuoteLocationId}
        couponInput={couponInput}
        tipPaise={tipPaise}
        quoteLoading={quoteLoading}
        quoteError={quoteError}
        placingOrder={placingOrder}
        orderError={orderError}
        isLiveServerMode={isLiveCartMode}
        onSelectLocation={handleSelectQuoteLocation}
        onChangeCouponInput={setCouponInput}
        onApplyCoupon={handleApplyCoupon}
        onChangeTipPaise={handleChangeTipPaise}
        onUpdateItemQty={handleUpdateCartItemQty}
        onClearCart={handleClearCart}
        onGenerateQuote={(acceptPriceChanges) =>
          void computeQuoteForState(Boolean(acceptPriceChanges))
        }
        onPlaceOrder={(notes) => void handlePlaceOrder(notes)}
        onOpenAuthModal={() => {
          setCartModalOpen(false);
          setAuthModalOpen(true);
        }}
        onClose={() => setCartModalOpen(false)}
      />

      <CustomerOrdersDialog
        open={ordersModalOpen}
        orders={displayedOrders}
        selectedOrderId={selectedOrderId}
        tracking={activeTrackingDto}
        events={activeOrderEvents}
        isLiveServerMode={isLiveCartMode}
        loadingOrders={ordersLoading}
        cancellingOrder={cancellingOrder}
        statusMessage={ordersStatusMessage}
        errorMessage={ordersErrorMessage}
        onSelectOrder={handleSelectOrder}
        onRefreshTracking={(orderId) => void loadOrderTracking(orderId)}
        onCancelOrder={(orderId, reasonCode, note) =>
          void handleCancelOrder(orderId, reasonCode, note)
        }
        onSimulatePreviewNextStep={handleSimulatePreviewNextStep}
        onReorderItems={handleReorderFromOrder}
        onOpenAuthModal={() => {
          setOrdersModalOpen(false);
          setAuthModalOpen(true);
        }}
        onClose={() => setOrdersModalOpen(false)}
      />
      <Footer />
    </>
  );
}
