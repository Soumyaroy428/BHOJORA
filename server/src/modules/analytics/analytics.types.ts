import { z } from 'zod';
import type { AnalyticsTimeframe, ReportFormat, ReportType } from '@bhojora/shared';

export const ANALYTICS_TIMEFRAMES = [
  'TODAY',
  'LAST_7_DAYS',
  'LAST_30_DAYS',
  'CUSTOM',
] as const satisfies readonly AnalyticsTimeframe[];

export const REPORT_TYPES = [
  'MARKETPLACE',
  'RESTAURANT',
  'DELIVERY',
  'FINANCE',
  'TRUST_SAFETY',
] as const satisfies readonly ReportType[];

export const REPORT_FORMATS = ['CSV', 'JSON'] as const satisfies readonly ReportFormat[];

export const analyticsQuerySchema = z
  .object({
    timeframe: z.enum(ANALYTICS_TIMEFRAMES).optional().default('LAST_7_DAYS'),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  })
  .refine(
    (data) => {
      if (data.timeframe === 'CUSTOM') {
        return !!data.startDate && !!data.endDate;
      }
      return true;
    },
    { message: 'startDate and endDate are required when timeframe is CUSTOM' },
  );

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

export const exportReportRequestSchema = z.object({
  reportType: z.enum(REPORT_TYPES),
  format: z.enum(REPORT_FORMATS),
  timeframe: z.enum(ANALYTICS_TIMEFRAMES).optional().default('LAST_7_DAYS'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  outletId: z.string().trim().min(1).optional(),
});

export type ExportReportRequest = z.infer<typeof exportReportRequestSchema>;

export interface OrderAnalyticsRecord {
  orderId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  outletId: string;
  outletName: string;
  zoneId: string;
  zoneName: string;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  subtotalPaise: number;
  deliveryFeePaise: number;
  taxesPaise: number;
  platformFeePaise: number;
  discountPaise: number;
  totalPaise: number;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    pricePaise: number;
  }>;
  prepDurationMinutes?: number;
  deliveryDurationMinutes?: number;
  isOnTime?: boolean;
  createdAt: Date;
}

export interface InspectionAnalyticsRecord {
  inspectionId: string;
  outletId: string;
  outletName: string;
  score: number;
  criticalViolationsCount: number;
  status: 'PASSED' | 'FAILED' | 'SUSPENDED';
  conductedAt: Date;
}

export interface ComplaintAnalyticsRecord {
  complaintId: string;
  outletId: string;
  outletName: string;
  category: 'HYGIENE' | 'FOREIGN_OBJECT' | 'TASTE' | 'PACKAGING' | 'DELIVERY';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'RESOLVED' | 'INVESTIGATING' | 'ESCALATED';
  resolutionHours: number;
  createdAt: Date;
}

export interface PiiSanitizationContext {
  maskPhone: boolean;
  maskName: boolean;
  maskAddress: boolean;
  maskId: boolean;
}

export function maskPhoneNumber(phone: string): string {
  if (!phone) return 'N/A';
  const clean = phone.replace(/\s+/g, '');
  if (clean.length < 8) return '****';
  const prefix = clean.slice(0, Math.min(8, clean.length - 4));
  const suffix = clean.slice(-2);
  return `${prefix}****${suffix}`;
}

export function maskCustomerName(name: string): string {
  if (!name) return 'Customer';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    const first = parts[0]!;
    return first.length > 2 ? `${first[0]}***` : `${first[0]}.`;
  }
  return parts.map((p) => (p.length > 0 ? `${p[0]}.` : '')).join(' ');
}

export function sanitizeDeliveryAddress(address: string): string {
  if (!address) return 'Kolkata, West Bengal';
  const parts = address.split(',').map((p) => p.trim());
  const kolkataIdx = parts.findIndex((p) => /kolkata/i.test(p));
  if (kolkataIdx > 0) {
    const locality = parts[kolkataIdx - 1]!.replace(
      /^(\d+[\w-]*|flat|block|house|plot)\s*/i,
      '',
    ).trim();
    return `${locality || parts[kolkataIdx - 1]}, ${parts[kolkataIdx]}`;
  }
  if (parts.length <= 2) {
    return parts.join(', ');
  }
  return parts.slice(-2).join(', ');
}

export function maskEntityId(id: string, prefix = 'id'): string {
  if (!id) return `${prefix}_***`;
  const suffix = id.slice(-4);
  return `${id.slice(0, 4)}****${suffix}`;
}

export function resolveTimeframeBounds(
  timeframe: AnalyticsTimeframe,
  startStr?: string,
  endStr?: string,
  referenceNow = new Date(),
): { startDate: Date; endDate: Date } {
  const endDate = new Date(referenceNow.getTime());

  if (timeframe === 'CUSTOM' && startStr && endStr) {
    return {
      startDate: new Date(startStr),
      endDate: new Date(endStr),
    };
  }

  const startDate = new Date(referenceNow.getTime());
  switch (timeframe) {
    case 'TODAY':
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'LAST_7_DAYS':
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      break;
    case 'LAST_30_DAYS':
      startDate.setDate(startDate.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      break;
    default:
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
  }

  return { startDate, endDate };
}
