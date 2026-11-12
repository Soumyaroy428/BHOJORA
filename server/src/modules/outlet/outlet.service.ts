import crypto from 'node:crypto';
import type {
  DeliveryZoneDto,
  OutletDetailDto,
  OutletHoursDto,
  PublicRestaurantSummaryDto,
  ServiceabilityCheckResultDto,
  ServiceabilityOutletMatchDto,
} from '@bhojora/shared';
import { z } from 'zod';
import type { Logger } from '../../config/logger';
import { AppError } from '../../middleware/error-handler';
import { KOLKATA_ZONE_IDS, type KolkataZoneId } from '../customer/customer.types';
import { SYSTEM_CLOCK, type Clock, type UserRole } from '../identity/identity.types';
import { assertMfaSatisfiedForRole, hasOutletMembership } from '../rbac/rbac.policy';
import type { RbacStore } from '../rbac/rbac.store';
import {
  FSSAI_SEPARATION_NOTICE,
  OPERATING_DAY_CODES,
  type OperatingSlotRecord,
  type RestaurantOutletRecord,
  type RestaurantStore,
} from '../restaurant/restaurant.types';
import {
  assertValidGeoJsonPoint,
  assertValidGeoJsonPolygonForKolkata,
  calculateHaversineDistanceMeters,
  DEFAULT_OUTLET_OPERATING_SLOTS,
  evaluateOutletOpenStatus,
  getDefaultKolkataZonesSeed,
  isPointInPolygon,
  KOLKATA_TIMEZONE,
  normalizeOperatingSlots,
} from './outlet.geo';
import {
  toDeliveryZoneDto,
  toOutletHoursDto,
  type DeliveryZoneRecord,
  type OutletHoursRecord,
  type OutletStore,
} from './outlet.types';

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24h format');

const operatingSlotSchema = z
  .object({
    dayOfWeek: z.enum(OPERATING_DAY_CODES),
    openTime: timeStringSchema.default('11:00'),
    closeTime: timeStringSchema.default('23:00'),
    isClosed: z.boolean().default(false),
  })
  .strict();

const specialClosureSchema = z
  .object({
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD closure date format'),
    reason: z.string().trim().min(3).max(160),
    isClosed: z.boolean().default(true),
  })
  .strict();

const createBranchOutletSchema = z
  .object({
    restaurantId: z.string().trim().min(3).max(80),
    outletName: z.string().trim().min(2).max(120),
    streetAddress: z.string().trim().min(5).max(240),
    landmark: z.string().trim().min(2).max(140),
    locality: z.string().trim().min(2).max(80),
    wardOrBorough: z.string().trim().min(2).max(80),
    city: z.string().trim().min(2).max(60).default('Kolkata'),
    postalCode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit Indian PIN code'),
    zoneId: z.enum(KOLKATA_ZONE_IDS),
    coordinates: z.tuple([z.number(), z.number()]),
    deliveryRadiusMeters: z.number().int().min(500).max(15000).default(5000),
    cuisines: z.array(z.string().trim().min(2).max(40)).min(1).max(6),
    prepTimeMinutes: z.number().int().min(10).max(90).default(30),
    operatingSlots: z.array(operatingSlotSchema).min(1).max(7).optional(),
  })
  .strict();

const updateOutletOperationsSchema = z
  .object({
    zoneId: z.enum(KOLKATA_ZONE_IDS).optional(),
    streetAddress: z.string().trim().min(5).max(240).optional(),
    landmark: z.string().trim().min(2).max(140).optional(),
    locality: z.string().trim().min(2).max(80).optional(),
    wardOrBorough: z.string().trim().min(2).max(80).optional(),
    postalCode: z
      .string()
      .trim()
      .regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit Indian PIN code')
      .optional(),
    coordinates: z.tuple([z.number(), z.number()]).optional(),
    deliveryRadiusMeters: z.number().int().min(500).max(15000).optional(),
    prepTimeMinutes: z.number().int().min(10).max(90).optional(),
    status: z.enum(['ACTIVE', 'TEMPORARILY_CLOSED']).optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one outlet operations field must be provided',
  });

const updateOutletHoursSchema = z
  .object({
    slots: z.array(operatingSlotSchema).min(1).max(7),
    specialClosures: z.array(specialClosureSchema).max(20).optional(),
  })
  .strict();

const upsertDeliveryZoneSchema = z
  .object({
    zoneCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_]{3,40}$/, 'Use 3-40 uppercase alphanumeric or underscore characters'),
    zoneId: z.enum(KOLKATA_ZONE_IDS),
    name: z.string().trim().min(3).max(120),
    boundary: z
      .object({
        type: z.literal('Polygon'),
        coordinates: z.array(z.array(z.tuple([z.number(), z.number()]))),
      })
      .strict(),
    centerPoint: z
      .object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number(), z.number()]),
      })
      .strict(),
    deliveryFeePaise: z.number().int().min(0).max(50000),
    minOrderPaise: z.number().int().min(0).max(500000),
    estimatedMinutes: z.number().int().min(10).max(90),
    isActive: z.boolean().default(true),
  })
  .strict();

const updateDeliveryZoneSchema = z
  .object({
    zoneId: z.enum(KOLKATA_ZONE_IDS).optional(),
    name: z.string().trim().min(3).max(120).optional(),
    boundary: upsertDeliveryZoneSchema.shape.boundary.optional(),
    centerPoint: upsertDeliveryZoneSchema.shape.centerPoint.optional(),
    deliveryFeePaise: z.number().int().min(0).max(50000).optional(),
    minOrderPaise: z.number().int().min(0).max(500000).optional(),
    estimatedMinutes: z.number().int().min(10).max(90).optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((v) => v !== undefined), {
    message: 'At least one zone update field must be provided',
  });

const serviceabilityBodySchema = z
  .object({
    coordinates: z.tuple([z.number(), z.number()]).optional(),
    location: z
      .object({
        type: z.literal('Point'),
        coordinates: z.tuple([z.number(), z.number()]),
      })
      .strict()
      .optional(),
    outletId: z.string().trim().min(3).max(80).optional(),
  })
  .strict()
  .refine((data) => Boolean(data.coordinates || data.location), {
    message: 'Provide coordinates [longitude, latitude] or GeoJSON location Point',
  });

function toSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

export interface OutletServiceOptions {
  restaurantStore: RestaurantStore;
  outletStore: OutletStore;
  rbacStore: RbacStore;
  logger: Logger;
  clock?: Clock;
}

export class OutletService {
  private readonly restaurantStore: RestaurantStore;
  private readonly outletStore: OutletStore;
  private readonly rbacStore: RbacStore;
  private readonly logger: Logger;
  private readonly clock: Clock;

  constructor(options: OutletServiceOptions) {
    this.restaurantStore = options.restaurantStore;
    this.outletStore = options.outletStore;
    this.rbacStore = options.rbacStore;
    this.logger = options.logger;
    this.clock = options.clock ?? SYSTEM_CLOCK;
  }

  getClock(): Clock {
    return this.clock;
  }

  private async getResolvedZones(includeInactive = false): Promise<DeliveryZoneRecord[]> {
    const stored = await this.outletStore.listDeliveryZones({ includeInactive });
    if (stored.length > 0 || includeInactive) {
      return stored;
    }
    return getDefaultKolkataZonesSeed(this.clock.now());
  }

  private async assertTenantOutletAccess(
    outletId: string,
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
    action: string,
    requestId?: string,
  ): Promise<RestaurantOutletRecord> {
    const outlet = await this.restaurantStore.getOutletById(outletId);
    if (!outlet) {
      throw new AppError(404, 'NOT_FOUND', 'Restaurant outlet not found');
    }

    const isOpsAdmin = actorRole === 'OPS_ADMIN' || actorRole === 'SUPER_ADMIN';
    if (isOpsAdmin) {
      assertMfaSatisfiedForRole(actorRole, mfaVerified);
      return outlet;
    }

    const memberships = await this.rbacStore.listMembershipsForUser(actorUserId);
    if (!hasOutletMembership(memberships, outlet.restaurantId, outletId)) {
      await this.rbacStore.appendAuditLog({
        actorId: actorUserId,
        actorRole,
        action,
        resourceType: 'restaurant_outlet',
        resourceId: outletId,
        outcome: 'DENIED',
        reason: `Cross-tenant outlet operation denied for ${outletId}`,
        requestId: requestId ?? null,
        now: this.clock.now(),
      });
      throw new AppError(
        403,
        'FORBIDDEN',
        'Tenant isolation check: your account does not have active membership for this outlet',
      );
    }

    return outlet;
  }

  private toOutletDetailDto(
    outlet: RestaurantOutletRecord,
    hours: OutletHoursRecord | null,
    coords?: readonly [number, number],
    zones?: readonly DeliveryZoneRecord[],
  ): OutletDetailDto {
    const now = this.clock.now();
    const effectiveSlots = hours?.slots ?? normalizeOperatingSlots(outlet.operatingSlots);
    const liveStatus = evaluateOutletOpenStatus({
      status: outlet.status,
      slots: effectiveSlots,
      specialClosures: hours?.specialClosures,
      atDate: now,
    });
    const radius = outlet.deliveryRadiusMeters ?? 5000;

    let distanceMeters: number | undefined;
    let serviceable: boolean | undefined;
    if (coords) {
      distanceMeters = calculateHaversineDistanceMeters(coords, outlet.location.coordinates);
      const activeZones = zones ?? [];
      const matchedZone = activeZones.find(
        (z) => z.isActive && isPointInPolygon(coords, z.boundary.coordinates),
      );
      serviceable = Boolean(matchedZone) && outlet.status === 'ACTIVE' && distanceMeters <= radius;
    }

    return {
      outletId: outlet.outletId,
      restaurantId: outlet.restaurantId,
      brandName: outlet.brandName,
      outletName: outlet.name,
      slug: outlet.slug,
      zoneId: outlet.zoneId,
      wardOrBorough: outlet.wardOrBorough,
      streetAddress: outlet.streetAddress,
      landmark: outlet.landmark,
      locality: outlet.locality,
      city: outlet.city,
      postalCode: outlet.postalCode,
      location: {
        type: 'Point',
        coordinates: [outlet.location.coordinates[0], outlet.location.coordinates[1]],
      },
      deliveryRadiusMeters: radius,
      cuisines: [...outlet.cuisines],
      prepTimeMinutes: outlet.prepTimeMinutes,
      status: outlet.status,
      operatingSlots: effectiveSlots.map((slot) => ({ ...slot })),
      liveStatus,
      ...(distanceMeters !== undefined ? { distanceMeters } : {}),
      ...(serviceable !== undefined ? { serviceable } : {}),
      fssaiLicenseNumber: outlet.fssaiLicenseNumber,
      fssaiExpiresOn: outlet.fssaiExpiresOn,
      fssaiVerificationStatus: outlet.fssaiVerificationStatus,
      platformInspectionStatus: outlet.platformInspectionStatus,
      publishedSafetyScore: outlet.publishedSafetyScore,
      fssaiSeparationNotice: FSSAI_SEPARATION_NOTICE,
      updatedAt: outlet.updatedAt.toISOString(),
    };
  }

  async listDeliveryZones(options: { includeInactive?: boolean } = {}): Promise<DeliveryZoneDto[]> {
    const zones = await this.getResolvedZones(Boolean(options.includeInactive));
    return zones.map(toDeliveryZoneDto);
  }

  async upsertDeliveryZone(
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
    rawBody: unknown,
    requestId?: string,
  ): Promise<DeliveryZoneDto> {
    assertMfaSatisfiedForRole(actorRole, mfaVerified);
    const input = upsertDeliveryZoneSchema.parse(rawBody);
    const validatedRings = assertValidGeoJsonPolygonForKolkata(input.boundary.coordinates);
    const validatedCenter = assertValidGeoJsonPoint(input.centerPoint.coordinates, {
      requireKolkataBounds: true,
      label: 'Zone centerPoint coordinates',
    });

    if (!isPointInPolygon(validatedCenter, validatedRings)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Zone centerPoint must fall inside its own delivery boundary polygon',
      );
    }

    const now = this.clock.now();
    const existing = await this.outletStore.getDeliveryZoneByCode(input.zoneCode);
    const saved = await this.outletStore.upsertDeliveryZone({
      zoneCode: input.zoneCode,
      zoneId: input.zoneId,
      cityCode: 'KOLKATA',
      name: input.name,
      boundary: { type: 'Polygon', coordinates: validatedRings },
      centerPoint: { type: 'Point', coordinates: validatedCenter },
      deliveryFeePaise: input.deliveryFeePaise,
      minOrderPaise: input.minOrderPaise,
      estimatedMinutes: input.estimatedMinutes,
      isActive: input.isActive,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });

    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole,
      action: 'admin.delivery_zone.upserted',
      resourceType: 'delivery_zone',
      resourceId: saved.zoneCode,
      outcome: 'ALLOWED',
      reason: `Zone=${saved.zoneId}; Active=${String(saved.isActive)}; FeePaise=${saved.deliveryFeePaise}`,
      requestId: requestId ?? null,
      now,
    });

    return toDeliveryZoneDto(saved);
  }

  async updateDeliveryZone(
    zoneCode: string,
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
    rawBody: unknown,
    requestId?: string,
  ): Promise<DeliveryZoneDto> {
    assertMfaSatisfiedForRole(actorRole, mfaVerified);
    const existing = await this.outletStore.getDeliveryZoneByCode(zoneCode);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', `Delivery zone ${zoneCode.toUpperCase()} not found`);
    }

    const input = updateDeliveryZoneSchema.parse(rawBody);
    const nextBoundaryCoords = input.boundary
      ? assertValidGeoJsonPolygonForKolkata(input.boundary.coordinates)
      : existing.boundary.coordinates;
    const nextCenterCoords = input.centerPoint
      ? assertValidGeoJsonPoint(input.centerPoint.coordinates, {
          requireKolkataBounds: true,
          label: 'Zone centerPoint coordinates',
        })
      : existing.centerPoint.coordinates;

    if (!isPointInPolygon(nextCenterCoords, nextBoundaryCoords)) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Zone centerPoint must fall inside its boundary polygon',
      );
    }

    const now = this.clock.now();
    const saved = await this.outletStore.upsertDeliveryZone({
      ...existing,
      zoneId: input.zoneId ?? existing.zoneId,
      name: input.name ?? existing.name,
      boundary: { type: 'Polygon', coordinates: nextBoundaryCoords },
      centerPoint: { type: 'Point', coordinates: nextCenterCoords },
      deliveryFeePaise: input.deliveryFeePaise ?? existing.deliveryFeePaise,
      minOrderPaise: input.minOrderPaise ?? existing.minOrderPaise,
      estimatedMinutes: input.estimatedMinutes ?? existing.estimatedMinutes,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: now,
    });

    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole,
      action: 'admin.delivery_zone.updated',
      resourceType: 'delivery_zone',
      resourceId: saved.zoneCode,
      outcome: 'ALLOWED',
      reason: `Updated Kolkata zone ${saved.zoneCode} (active=${String(saved.isActive)})`,
      requestId: requestId ?? null,
      now,
    });

    return toDeliveryZoneDto(saved);
  }

  async listPartnerOutlets(
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
  ): Promise<OutletDetailDto[]> {
    const isAdmin = actorRole === 'OPS_ADMIN' || actorRole === 'SUPER_ADMIN';
    let matchedOutlets: RestaurantOutletRecord[];
    if (isAdmin) {
      assertMfaSatisfiedForRole(actorRole, mfaVerified);
      matchedOutlets = await this.restaurantStore.listPublicOutlets();
    } else {
      const memberships = await this.rbacStore.listMembershipsForUser(actorUserId);
      const outletIds = Array.from(
        new Set(memberships.filter((m) => m.status === 'ACTIVE').map((m) => m.outletId)),
      );
      const fetched = await Promise.all(
        outletIds.map((id) => this.restaurantStore.getOutletById(id)),
      );
      matchedOutlets = fetched.filter((item): item is RestaurantOutletRecord => item !== null);
    }

    const hoursList = await this.outletStore.listOutletHoursByIds(
      matchedOutlets.map((outlet) => outlet.outletId),
    );
    const hoursMap = new Map(hoursList.map((entry) => [entry.outletId, entry]));

    return matchedOutlets.map((outlet) =>
      this.toOutletDetailDto(outlet, hoursMap.get(outlet.outletId) ?? null),
    );
  }

  async createBranchOutlet(
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
    rawBody: unknown,
    requestId?: string,
  ): Promise<OutletDetailDto> {
    const isAdmin = actorRole === 'OPS_ADMIN' || actorRole === 'SUPER_ADMIN';
    if (isAdmin) {
      assertMfaSatisfiedForRole(actorRole, mfaVerified);
    }

    const input = createBranchOutletSchema.parse(rawBody);
    const validatedPin = assertValidGeoJsonPoint(input.coordinates, {
      requireKolkataBounds: true,
      label: 'Outlet map pin coordinates',
    });

    const parentApplication = await this.restaurantStore.getApplicationById(input.restaurantId);
    if (!parentApplication || parentApplication.onboardingStatus !== 'APPROVED') {
      throw new AppError(
        409,
        'CONFLICT',
        'Verified approved restaurant onboarding record required before adding branch outlets',
      );
    }

    if (!isAdmin && parentApplication.ownerUserId !== actorUserId) {
      const memberships = await this.rbacStore.listMembershipsForUser(actorUserId);
      const ownerForRestaurant = memberships.some(
        (m) =>
          m.restaurantId === parentApplication.restaurantId &&
          m.status === 'ACTIVE' &&
          m.role === 'RESTAURANT_OWNER',
      );
      if (!ownerForRestaurant) {
        await this.rbacStore.appendAuditLog({
          actorId: actorUserId,
          actorRole,
          action: 'restaurant.outlet.create',
          resourceType: 'restaurant',
          resourceId: parentApplication.restaurantId,
          outcome: 'DENIED',
          reason: 'Cross-tenant branch outlet creation rejected',
          requestId: requestId ?? null,
          now: this.clock.now(),
        });
        throw new AppError(403, 'FORBIDDEN', 'You may only create outlets for your own restaurant');
      }
    }

    const normalizedSlots = normalizeOperatingSlots(
      input.operatingSlots ?? DEFAULT_OUTLET_OPERATING_SLOTS,
    );
    const now = this.clock.now();
    const outletId = `out_${crypto.randomUUID().slice(0, 12)}`;
    const slug = `${toSlug(parentApplication.outletSetup.brandName)}-${toSlug(input.outletName)}-${outletId.slice(-4)}`;

    const outletRecord: RestaurantOutletRecord = {
      outletId,
      restaurantId: parentApplication.restaurantId,
      ownerUserId: parentApplication.ownerUserId,
      brandName: parentApplication.outletSetup.brandName,
      name: input.outletName,
      slug,
      zoneId: input.zoneId,
      wardOrBorough: input.wardOrBorough,
      streetAddress: input.streetAddress,
      landmark: input.landmark,
      locality: input.locality,
      city: input.city,
      postalCode: input.postalCode,
      location: { type: 'Point', coordinates: validatedPin },
      cuisines: input.cuisines,
      prepTimeMinutes: input.prepTimeMinutes,
      deliveryRadiusMeters: input.deliveryRadiusMeters,
      operatingSlots: normalizedSlots,
      status: 'ACTIVE',
      fssaiLicenseNumber: parentApplication.legalEntity.fssaiLicenseNumber,
      fssaiExpiresOn: parentApplication.legalEntity.fssaiExpiresOn,
      fssaiVerificationStatus: parentApplication.fssaiVerificationStatus,
      platformInspectionStatus: 'NOT_INSPECTED',
      publishedSafetyScore: null,
      createdAt: now,
      updatedAt: now,
    };

    const savedOutlet = await this.restaurantStore.upsertOutlet(outletRecord);
    const savedHours = await this.outletStore.upsertOutletHours({
      outletId: savedOutlet.outletId,
      restaurantId: savedOutlet.restaurantId,
      timezone: KOLKATA_TIMEZONE,
      slots: normalizedSlots,
      specialClosures: [],
      createdAt: now,
      updatedAt: now,
    });

    await this.rbacStore.upsertMembership({
      userId: parentApplication.ownerUserId,
      restaurantId: savedOutlet.restaurantId,
      outletId: savedOutlet.outletId,
      role: 'RESTAURANT_OWNER',
      status: 'ACTIVE',
      grantedByUserId: actorUserId,
      now,
    });

    await this.rbacStore.upsertOutlet({
      outletId: savedOutlet.outletId,
      restaurantId: savedOutlet.restaurantId,
      name: `${savedOutlet.brandName} — ${savedOutlet.name}`,
      zone: savedOutlet.wardOrBorough,
      safetyScore: 0,
    });

    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole,
      action: 'restaurant.outlet.created',
      resourceType: 'restaurant_outlet',
      resourceId: savedOutlet.outletId,
      outcome: 'ALLOWED',
      reason: `Zone=${savedOutlet.zoneId}; Radius=${savedOutlet.deliveryRadiusMeters}m; Inspection=NOT_INSPECTED`,
      requestId: requestId ?? null,
      now,
    });

    this.logger.info('outlet.branch.created', {
      outletId: savedOutlet.outletId,
      restaurantId: savedOutlet.restaurantId,
      zoneId: savedOutlet.zoneId,
    });

    return this.toOutletDetailDto(savedOutlet, savedHours);
  }

  async updateOutletOperations(
    outletId: string,
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
    rawBody: unknown,
    requestId?: string,
  ): Promise<OutletDetailDto> {
    const existing = await this.assertTenantOutletAccess(
      outletId,
      actorUserId,
      actorRole,
      mfaVerified,
      'restaurant.outlet.update',
      requestId,
    );
    const input = updateOutletOperationsSchema.parse(rawBody);
    const nextPin = input.coordinates
      ? assertValidGeoJsonPoint(input.coordinates, {
          requireKolkataBounds: true,
          label: 'Outlet map pin coordinates',
        })
      : existing.location.coordinates;

    const now = this.clock.now();
    const updated = await this.restaurantStore.upsertOutlet({
      ...existing,
      zoneId: input.zoneId ?? existing.zoneId,
      streetAddress: input.streetAddress ?? existing.streetAddress,
      landmark: input.landmark ?? existing.landmark,
      locality: input.locality ?? existing.locality,
      wardOrBorough: input.wardOrBorough ?? existing.wardOrBorough,
      postalCode: input.postalCode ?? existing.postalCode,
      location: { type: 'Point', coordinates: nextPin },
      deliveryRadiusMeters: input.deliveryRadiusMeters ?? existing.deliveryRadiusMeters ?? 5000,
      prepTimeMinutes: input.prepTimeMinutes ?? existing.prepTimeMinutes,
      status: input.status ?? existing.status,
      updatedAt: now,
    });

    const hours = await this.outletStore.getOutletHours(updated.outletId);
    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole,
      action: 'restaurant.outlet.updated',
      resourceType: 'restaurant_outlet',
      resourceId: updated.outletId,
      outcome: 'ALLOWED',
      reason: `Updated map pin / operational controls (status=${updated.status}, radius=${updated.deliveryRadiusMeters}m)`,
      requestId: requestId ?? null,
      now,
    });

    return this.toOutletDetailDto(updated, hours);
  }

  async updateOutletHours(
    outletId: string,
    actorUserId: string,
    actorRole: UserRole,
    mfaVerified: boolean,
    rawBody: unknown,
    requestId?: string,
  ): Promise<{ hours: OutletHoursDto; liveStatus: ReturnType<typeof evaluateOutletOpenStatus> }> {
    const existing = await this.assertTenantOutletAccess(
      outletId,
      actorUserId,
      actorRole,
      mfaVerified,
      'restaurant.outlet.hours.update',
      requestId,
    );
    const input = updateOutletHoursSchema.parse(rawBody);
    const normalizedSlots = normalizeOperatingSlots(input.slots as OperatingSlotRecord[]);
    const now = this.clock.now();

    const prevHours = await this.outletStore.getOutletHours(outletId);
    const savedHours = await this.outletStore.upsertOutletHours({
      outletId: existing.outletId,
      restaurantId: existing.restaurantId,
      timezone: KOLKATA_TIMEZONE,
      slots: normalizedSlots,
      specialClosures: input.specialClosures ?? prevHours?.specialClosures ?? [],
      createdAt: prevHours?.createdAt ?? now,
      updatedAt: now,
    });

    await this.restaurantStore.upsertOutlet({
      ...existing,
      operatingSlots: normalizedSlots,
      updatedAt: now,
    });

    await this.rbacStore.appendAuditLog({
      actorId: actorUserId,
      actorRole,
      action: 'restaurant.outlet.hours_updated',
      resourceType: 'outlet_hours',
      resourceId: existing.outletId,
      outcome: 'ALLOWED',
      reason: `Updated Asia/Kolkata weekly operating schedule (${savedHours.specialClosures.length} special closures)`,
      requestId: requestId ?? null,
      now,
    });

    const liveStatus = evaluateOutletOpenStatus({
      status: existing.status,
      slots: savedHours.slots,
      specialClosures: savedHours.specialClosures,
      atDate: now,
    });

    return {
      hours: toOutletHoursDto(savedHours),
      liveStatus,
    };
  }

  async getPublicOutletDetail(
    outletId: string,
    rawCoords?: [number, number],
  ): Promise<OutletDetailDto> {
    const outlet = await this.restaurantStore.getOutletById(outletId);
    if (!outlet || outlet.status === 'PENDING_APPROVAL') {
      throw new AppError(404, 'NOT_FOUND', 'Public outlet not found');
    }

    const coords = rawCoords
      ? assertValidGeoJsonPoint(rawCoords, { label: 'Customer query coordinates' })
      : undefined;
    const [hours, zones] = await Promise.all([
      this.outletStore.getOutletHours(outlet.outletId),
      coords ? this.getResolvedZones(false) : Promise.resolve([]),
    ]);

    return this.toOutletDetailDto(outlet, hours, coords, zones);
  }

  async checkServiceability(rawInput: unknown): Promise<ServiceabilityCheckResultDto> {
    const parsed = serviceabilityBodySchema.parse(rawInput);
    const rawCoords = parsed.coordinates ?? parsed.location?.coordinates;
    const coords = assertValidGeoJsonPoint(rawCoords, {
      label: 'Serviceability coordinates',
    });

    const now = this.clock.now();
    const [zones, activeOutlets] = await Promise.all([
      this.getResolvedZones(false),
      this.restaurantStore.listPublicOutlets(),
    ]);

    const matchedZone =
      zones.find((zone) => zone.isActive && isPointInPolygon(coords, zone.boundary.coordinates)) ??
      null;
    const zoneById = new Map(zones.map((z) => [z.zoneId, z]));

    const candidateOutlets = parsed.outletId
      ? activeOutlets.filter((o) => o.outletId === parsed.outletId)
      : activeOutlets;

    if (parsed.outletId && candidateOutlets.length === 0) {
      throw new AppError(404, 'NOT_FOUND', `Active outlet ${parsed.outletId} not found`);
    }

    const hoursList = await this.outletStore.listOutletHoursByIds(
      candidateOutlets.map((o) => o.outletId),
    );
    const hoursMap = new Map(hoursList.map((h) => [h.outletId, h]));

    const evaluatedAtIst = evaluateOutletOpenStatus({
      status: 'ACTIVE',
      slots: DEFAULT_OUTLET_OPERATING_SLOTS,
      atDate: now,
    }).evaluatedAtIst;

    const matches: ServiceabilityOutletMatchDto[] = candidateOutlets
      .map((outlet) => {
        const hours = hoursMap.get(outlet.outletId);
        const liveStatus = evaluateOutletOpenStatus({
          status: outlet.status,
          slots: hours?.slots ?? outlet.operatingSlots,
          specialClosures: hours?.specialClosures,
          atDate: now,
        });
        const distanceMeters = calculateHaversineDistanceMeters(
          coords,
          outlet.location.coordinates,
        );
        const deliveryRadiusMeters = outlet.deliveryRadiusMeters ?? 5000;
        const withinRadius = distanceMeters <= deliveryRadiusMeters;
        const inZoneBoundary = matchedZone !== null && outlet.zoneId === matchedZone.zoneId;
        const serviceable = matchedZone !== null && withinRadius && outlet.status === 'ACTIVE';
        const outletZonePolicy = zoneById.get(outlet.zoneId) ?? matchedZone;
        const travelMinutes = Math.max(5, Math.ceil(distanceMeters / 350));

        return {
          outletId: outlet.outletId,
          restaurantId: outlet.restaurantId,
          brandName: outlet.brandName,
          outletName: outlet.name,
          slug: outlet.slug,
          zoneId: outlet.zoneId,
          wardOrBorough: outlet.wardOrBorough,
          locality: outlet.locality,
          distanceMeters,
          deliveryRadiusMeters,
          withinRadius,
          inZoneBoundary,
          serviceable,
          isOpenNow: liveStatus.isOpenNow,
          liveStatusReason: liveStatus.reason,
          estimatedDeliveryMinutes: Math.min(90, outlet.prepTimeMinutes + travelMinutes),
          deliveryFeePaise: outletZonePolicy?.deliveryFeePaise ?? 2900,
          platformInspectionStatus: outlet.platformInspectionStatus,
          publishedSafetyScore: outlet.publishedSafetyScore,
        };
      })
      .sort((a, b) => {
        if (a.serviceable !== b.serviceable) {
          return a.serviceable ? -1 : 1;
        }
        return a.distanceMeters - b.distanceMeters;
      });

    const anyServiceable = matches.some((item) => item.serviceable);
    let reason: string;
    if (!matchedZone) {
      reason = 'Coordinates are outside active Kolkata delivery zone polygons';
    } else if (matches.length === 0) {
      reason = `Location is in ${matchedZone.name}, but no active verified outlets are listed yet`;
    } else if (!anyServiceable) {
      reason = `Location is in ${matchedZone.name}, but all outlets exceed their configured delivery radius`;
    } else {
      const openCount = matches.filter((m) => m.serviceable && m.isOpenNow).length;
      reason = `Serviceable in ${matchedZone.name}: ${openCount} open kitchen(s) right now in Asia/Kolkata`;
    }

    return {
      serviceable: anyServiceable,
      evaluatedCoordinates: coords,
      timezone: KOLKATA_TIMEZONE,
      evaluatedAtIst,
      matchedZone: matchedZone ? toDeliveryZoneDto(matchedZone) : null,
      outlets: matches,
      reason,
    };
  }

  async listPublicRestaurants(
    options: {
      zoneId?: KolkataZoneId;
      coordinates?: [number, number];
      openNow?: boolean;
    } = {},
  ): Promise<PublicRestaurantSummaryDto[]> {
    const validatedCoords = options.coordinates
      ? assertValidGeoJsonPoint(options.coordinates, { label: 'Discovery coordinates' })
      : undefined;
    const now = this.clock.now();
    const outlets = await this.restaurantStore.listPublicOutlets(options.zoneId);
    const [hoursList, zones] = await Promise.all([
      this.outletStore.listOutletHoursByIds(outlets.map((o) => o.outletId)),
      validatedCoords ? this.getResolvedZones(false) : Promise.resolve([]),
    ]);
    const hoursMap = new Map(hoursList.map((h) => [h.outletId, h]));
    const matchedZone = validatedCoords
      ? (zones.find(
          (z) => z.isActive && isPointInPolygon(validatedCoords, z.boundary.coordinates),
        ) ?? null)
      : null;

    const enriched = outlets.map((outlet) => {
      const hours = hoursMap.get(outlet.outletId);
      const liveStatus = evaluateOutletOpenStatus({
        status: outlet.status,
        slots: hours?.slots ?? outlet.operatingSlots,
        specialClosures: hours?.specialClosures,
        atDate: now,
      });
      const radius = outlet.deliveryRadiusMeters ?? 5000;
      const distanceMeters = validatedCoords
        ? calculateHaversineDistanceMeters(validatedCoords, outlet.location.coordinates)
        : undefined;
      const serviceable = validatedCoords
        ? matchedZone !== null && distanceMeters !== undefined && distanceMeters <= radius
        : undefined;

      const summary: PublicRestaurantSummaryDto = {
        restaurantId: outlet.restaurantId,
        outletId: outlet.outletId,
        brandName: outlet.brandName,
        outletName: outlet.name,
        slug: outlet.slug,
        zoneId: outlet.zoneId,
        wardOrBorough: outlet.wardOrBorough,
        cuisines: [...outlet.cuisines],
        fssaiLicenseNumber: outlet.fssaiLicenseNumber,
        fssaiExpiresOn: outlet.fssaiExpiresOn,
        fssaiVerificationStatus: outlet.fssaiVerificationStatus,
        platformInspectionStatus: outlet.platformInspectionStatus,
        publishedSafetyScore: outlet.publishedSafetyScore,
        fssaiSeparationNotice: FSSAI_SEPARATION_NOTICE,
        deliveryRadiusMeters: radius,
        isOpenNow: liveStatus.isOpenNow,
        ...(distanceMeters !== undefined ? { distanceMeters } : {}),
        ...(serviceable !== undefined ? { serviceable } : {}),
      };
      return summary;
    });

    const filtered = options.openNow ? enriched.filter((item) => item.isOpenNow) : enriched;
    if (validatedCoords) {
      filtered.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
    }
    return filtered;
  }
}
