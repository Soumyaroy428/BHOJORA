/**
 * BHOJORA Platform --- Analytics, Reporting & Dashboard Contracts
 * Checkpoint 31: Marketplace, restaurant, delivery, finance & trust KPIs,
 * with scoped access, financial reconciliation & PII-sanitized exports.
 */

export type AnalyticsTimeframe = 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM';

export interface KolkataZoneKpiBreakdown {
  zoneId: string;
  zoneName: string;
  orderCount: number;
  gmvPaise: number;
}

export interface MarketplaceKpiDto {
  timeframe: AnalyticsTimeframe;
  startDate: string;
  endDate: string;
  totalGmvPaise: number;
  itemsSubtotalPaise: number;
  deliveryFeesPaise: number;
  taxesPaise: number;
  platformFeesPaise: number;
  discountsPaise: number;
  completedOrdersCount: number;
  cancelledOrdersCount: number;
  cancellationRatePercent: number;
  averageOrderValuePaise: number;
  uniqueActiveCustomersCount: number;
  kolkataZoneBreakdown: KolkataZoneKpiBreakdown[];
}

export interface TopSellingItemDto {
  itemId: string;
  name: string;
  quantitySold: number;
  revenuePaise: number;
}

export interface RestaurantKpiDto {
  outletId: string;
  outletName: string;
  timeframe: AnalyticsTimeframe;
  orderCount: number;
  grossRevenuePaise: number;
  netPayoutPaise: number;
  commissionDeductedPaise: number;
  averagePreparationTimeMinutes: number;
  hygieneAuditScore: number | null;
  hygieneStatus: string;
  topSellingItems: TopSellingItemDto[];
}

export interface ZoneDeliveryPerformanceDto {
  zoneId: string;
  zoneName: string;
  avgMinutes: number;
  onTimePercent: number;
}

export interface DeliveryFleetKpiDto {
  timeframe: AnalyticsTimeframe;
  activeRidersCount: number;
  completedDeliveriesCount: number;
  averageDeliveryTimeMinutes: number;
  onTimeDeliveryRatePercent: number;
  totalRiderPayoutPaise: number;
  zoneDeliveryPerformance: ZoneDeliveryPerformanceDto[];
}

export interface FinanceKpiDto {
  timeframe: AnalyticsTimeframe;
  reconciledGmvPaise: number;
  gatewaySettledPaise: number;
  platformCommissionEarnedPaise: number;
  voucherSubsidyPlatformPaise: number;
  voucherSubsidyRestaurantPaise: number;
  refundsProcessedPaise: number;
  unreconciledDiscrepancyPaise: number;
  reconciliationStatus: 'BALANCED' | 'DISCREPANCY_FLAGGED';
}

export interface TrustSafetyKpiDto {
  timeframe: AnalyticsTimeframe;
  totalActiveKitchens: number;
  verifiedCleanCount: number;
  verifiedCleanPercentage: number;
  averageHygieneScore: number;
  criticalViolationsReported: number;
  criticalViolationsSuspended: number;
  hygieneComplaintsCount: number;
  averageComplaintResolutionHours: number;
}

export type ReportType = 'MARKETPLACE' | 'RESTAURANT' | 'DELIVERY' | 'FINANCE' | 'TRUST_SAFETY';

export type ReportFormat = 'CSV' | 'JSON';

export interface ExportReportRequestDto {
  reportType: ReportType;
  format: ReportFormat;
  timeframe?: AnalyticsTimeframe;
  startDate?: string;
  endDate?: string;
  outletId?: string;
}

export interface ExportReportResponseDto {
  reportId: string;
  reportType: ReportType;
  format: ReportFormat;
  generatedAt: string;
  filename: string;
  contentType: string;
  data: string;
  piiSanitized: boolean;
  rowCount: number;
}
