import crypto from 'node:crypto';
import { AppError } from '../../middleware/error-handler';
import type { Clock, IdentityStore } from '../identity/identity.types';
import type { RestaurantStore, OutletOperationalStatus } from '../restaurant/restaurant.types';
import type { KolkataZoneId } from '../customer/customer.types';
import type { DeliveryStore } from '../delivery/delivery.store';
import type { RbacStore } from '../rbac/rbac.store';
import type { SupportStore } from '../support/support.store';
import type { InspectionStore } from '../inspection/inspection.store';
import type { InspectionStatus } from '../inspection/inspection.types';
import type { GovernanceStore } from './governance.store';
import type { PlatformConfigRecord, ConfigChangeProposalRecord } from './governance.types';
import type {
  AdminOverviewDto,
  AdminUserSummaryDto,
  AdminOutletSummaryDto,
  AdminPartnerSummaryDto,
  AuditLogQueryDto,
  AuditLogPageDto,
  ProposalStatus,
  DeliveryPartnerStatus,
} from '@bhojora/shared';
import type { UserRole, AccountStatus } from '../identity/identity.types';

export interface GovernanceServiceDependencies {
  governanceStore: GovernanceStore;
  identityStore: IdentityStore;
  restaurantStore: RestaurantStore;
  deliveryStore: DeliveryStore;
  rbacStore: RbacStore;
  supportStore?: SupportStore;
  inspectionStore?: InspectionStore;
  clock?: Clock;
}

export class GovernanceService {
  private readonly governanceStore: GovernanceStore;
  private readonly identityStore: IdentityStore;
  private readonly restaurantStore: RestaurantStore;
  private readonly deliveryStore: DeliveryStore;
  private readonly rbacStore: RbacStore;
  private readonly supportStore?: SupportStore;
  private readonly inspectionStore?: InspectionStore;
  private readonly clock: Clock;

  constructor(deps: GovernanceServiceDependencies) {
    this.governanceStore = deps.governanceStore;
    this.identityStore = deps.identityStore;
    this.restaurantStore = deps.restaurantStore;
    this.deliveryStore = deps.deliveryStore;
    this.rbacStore = deps.rbacStore;
    this.supportStore = deps.supportStore;
    this.inspectionStore = deps.inspectionStore;
    this.clock = deps.clock ?? { now: () => new Date() };
  }

  async getDashboardOverview(): Promise<AdminOverviewDto> {
    const config = await this.governanceStore.getPlatformConfig();

    const [userRes, outlets, partnerRes, auditLogs] = await Promise.all([
      this.identityStore.listUsers({ limit: 100 }),
      this.restaurantStore.listAllOutlets(),
      this.deliveryStore.listApplications({ limit: 100 }),
      this.rbacStore.listAuditLogs(100),
    ]);

    const usersSuspended = userRes.users.filter((u) => u.status === 'SUSPENDED').length;
    const outletsActive = outlets.filter((o) => o.status === 'ACTIVE').length;
    const outletsSuspended = outlets.filter((o) => o.status === 'SUSPENDED').length;
    const deliveryPartnersActive = partnerRes.applications.filter(
      (p) => p.status === 'APPROVED' && p.shiftStatus !== 'OFFLINE',
    ).length;
    const deliveryPartnersSuspended = partnerRes.applications.filter(
      (p) => p.status === 'SUSPENDED',
    ).length;

    let openTickets = 0;
    if (this.supportStore) {
      const tickets = await this.supportStore.listTickets();
      openTickets = tickets.filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED').length;
    }

    let pendingInspections = 0;
    if (this.inspectionStore) {
      const inspections = await this.inspectionStore.listInspectionsByStatus(
        'SUBMITTED' as InspectionStatus,
      );
      pendingInspections = inspections.length;
    }

    const uniqueRestaurantIds = new Set(outlets.map((o) => o.restaurantId));

    return {
      usersTotal: userRes.totalCount,
      usersSuspended,
      restaurantsTotal: uniqueRestaurantIds.size,
      outletsActive,
      outletsSuspended,
      deliveryPartnersTotal: partnerRes.totalCount,
      deliveryPartnersActive,
      deliveryPartnersSuspended,
      pendingInspections,
      openTickets,
      recentAuditCount: auditLogs.length,
      platformConfigVersion: config.version,
      monsoonModeActive: config.monsoonWaterloggingMode,
    };
  }

  async listUsers(options?: {
    role?: UserRole;
    status?: AccountStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ users: AdminUserSummaryDto[]; total: number }> {
    const res = await this.identityStore.listUsers(options);
    return {
      users: res.users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.emailNormalized ?? null,
        phone: u.phoneNormalized ?? null,
        roles: u.roles,
        status: u.status,
        phoneVerified: u.phoneVerified,
        emailVerified: u.emailVerified,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      })),
      total: res.totalCount,
    };
  }

  async setUserStatus(params: {
    actorId: string;
    actorRole: UserRole;
    targetUserId: string;
    status: 'ACTIVE' | 'SUSPENDED';
    reason: string;
    requestId?: string;
  }): Promise<AdminUserSummaryDto> {
    const now = this.clock.now();
    if (params.actorId === params.targetUserId) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Self-suspension or modifying own account status is prohibited by segregation of duties',
      );
    }

    const targetUser = await this.identityStore.findUserById(params.targetUserId);
    if (!targetUser) {
      throw new AppError(404, 'NOT_FOUND', `User ${params.targetUserId} not found`);
    }

    const updated = await this.identityStore.updateUser(
      params.targetUserId,
      { status: params.status },
      now,
    );
    if (!updated) {
      throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Failed to update user status');
    }

    await this.rbacStore.appendAuditLog({
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: 'user:status:update',
      resourceType: 'USER',
      resourceId: params.targetUserId,
      outcome: 'ALLOWED',
      reason: params.reason,
      requestId: params.requestId,
      now,
    });

    return {
      id: updated.id,
      name: updated.name,
      email: updated.emailNormalized ?? null,
      phone: updated.phoneNormalized ?? null,
      roles: updated.roles,
      status: updated.status,
      phoneVerified: updated.phoneVerified,
      emailVerified: updated.emailVerified,
      createdAt: updated.createdAt.toISOString(),
      lastLoginAt: updated.lastLoginAt ? updated.lastLoginAt.toISOString() : null,
    };
  }

  async listOutlets(options?: {
    status?: string;
    zoneId?: string;
  }): Promise<{ outlets: AdminOutletSummaryDto[]; total: number }> {
    const outlets = await this.restaurantStore.listAllOutlets({
      status: options?.status as OutletOperationalStatus | undefined,
      zoneId: options?.zoneId as KolkataZoneId | undefined,
    });
    return {
      outlets: outlets.map((o) => ({
        outletId: o.outletId,
        restaurantId: o.restaurantId,
        brandName: o.brandName,
        name: o.name,
        zoneId: o.zoneId,
        status: o.status,
        publishedSafetyScore: o.publishedSafetyScore,
        cuisines: o.cuisines,
        createdAt: o.createdAt.toISOString(),
      })),
      total: outlets.length,
    };
  }

  async setOutletStatus(params: {
    actorId: string;
    actorRole: UserRole;
    outletId: string;
    status: 'ACTIVE' | 'SUSPENDED';
    reason: string;
    requestId?: string;
  }): Promise<AdminOutletSummaryDto> {
    const now = this.clock.now();
    const existing = await this.restaurantStore.getOutletById(params.outletId);
    if (!existing) {
      throw new AppError(404, 'NOT_FOUND', `Outlet ${params.outletId} not found`);
    }

    const updated = await this.restaurantStore.upsertOutlet({
      ...existing,
      status: params.status,
      updatedAt: now,
    });

    await this.rbacStore.appendAuditLog({
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: 'outlet:status:update',
      resourceType: 'OUTLET',
      resourceId: params.outletId,
      outcome: 'ALLOWED',
      reason: params.reason,
      requestId: params.requestId,
      now,
    });

    return {
      outletId: updated.outletId,
      restaurantId: updated.restaurantId,
      brandName: updated.brandName,
      name: updated.name,
      zoneId: updated.zoneId,
      status: updated.status,
      publishedSafetyScore: updated.publishedSafetyScore,
      cuisines: updated.cuisines,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async listPartners(options?: {
    status?: string;
    limit?: number;
    skip?: number;
  }): Promise<{ partners: AdminPartnerSummaryDto[]; total: number }> {
    const res = await this.deliveryStore.listApplications({
      status: options?.status as DeliveryPartnerStatus | undefined,
      limit: options?.limit,
      skip: options?.skip,
    });
    return {
      partners: res.applications.map((p) => ({
        partnerId: p.partnerId,
        userId: p.userId,
        fullName: p.fullName,
        phone: p.phoneMasked,
        status: p.status,
        shiftStatus: p.shiftStatus,
        vehicleType: p.vehicle.vehicleType,
        rating: p.rating,
        totalDeliveries: p.totalDeliveries,
        createdAt: p.createdAt.toISOString(),
      })),
      total: res.totalCount,
    };
  }

  async setPartnerStatus(params: {
    actorId: string;
    actorRole: UserRole;
    partnerId: string;
    status: 'ACTIVE' | 'SUSPENDED';
    reason: string;
    requestId?: string;
  }): Promise<AdminPartnerSummaryDto> {
    const now = this.clock.now();
    const partner = await this.deliveryStore.getPartnerById(params.partnerId);
    if (!partner) {
      throw new AppError(404, 'NOT_FOUND', `Delivery partner ${params.partnerId} not found`);
    }

    const updated = await this.deliveryStore.updatePartner(params.partnerId, {
      status: params.status === 'ACTIVE' ? 'APPROVED' : 'SUSPENDED',
      ...(params.status === 'SUSPENDED' ? { shiftStatus: 'OFFLINE' } : {}),
      updatedAt: now,
    });
    if (!updated) {
      throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Failed to update delivery partner');
    }

    await this.rbacStore.appendAuditLog({
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: 'partner:status:update',
      resourceType: 'DELIVERY_PARTNER',
      resourceId: params.partnerId,
      outcome: 'ALLOWED',
      reason: params.reason,
      requestId: params.requestId,
      now,
    });

    return {
      partnerId: updated.partnerId,
      userId: updated.userId,
      fullName: updated.fullName,
      phone: updated.phoneMasked,
      status: updated.status,
      shiftStatus: updated.shiftStatus,
      vehicleType: updated.vehicle.vehicleType,
      rating: updated.rating,
      totalDeliveries: updated.totalDeliveries,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async getPlatformConfig(): Promise<PlatformConfigRecord> {
    return this.governanceStore.getPlatformConfig();
  }

  async proposeConfigChange(params: {
    actorId: string;
    actorRole: UserRole;
    proposedChanges: Partial<
      Omit<PlatformConfigRecord, 'configId' | 'updatedByUserId' | 'updatedAt' | 'version'>
    >;
    reason: string;
    requestId?: string;
  }): Promise<ConfigChangeProposalRecord> {
    const now = this.clock.now();
    const proposal: ConfigChangeProposalRecord = {
      proposalId: `prop_${crypto.randomUUID()}`,
      proposerUserId: params.actorId,
      proposerRole: params.actorRole,
      proposedChanges: params.proposedChanges,
      reason: params.reason,
      status: 'PENDING',
      reviewedByUserId: null,
      reviewedAt: null,
      reviewReason: null,
      createdAt: now,
    };

    const created = await this.governanceStore.createProposal(proposal);

    await this.rbacStore.appendAuditLog({
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: 'config:proposal:created',
      resourceType: 'PLATFORM_CONFIG_PROPOSAL',
      resourceId: created.proposalId,
      outcome: 'ALLOWED',
      reason: params.reason,
      requestId: params.requestId,
      now,
    });

    return created;
  }

  async listConfigProposals(status?: ProposalStatus): Promise<ConfigChangeProposalRecord[]> {
    return this.governanceStore.listProposals(status);
  }

  async reviewConfigProposal(params: {
    actorId: string;
    actorRole: UserRole;
    proposalId: string;
    decision: 'APPROVE' | 'REJECT';
    reason: string;
    requestId?: string;
  }): Promise<{ proposal: ConfigChangeProposalRecord; config?: PlatformConfigRecord }> {
    const now = this.clock.now();
    const proposal = await this.governanceStore.getProposalById(params.proposalId);
    if (!proposal) {
      throw new AppError(404, 'NOT_FOUND', `Proposal ${params.proposalId} not found`);
    }

    if (proposal.status !== 'PENDING') {
      throw new AppError(
        409,
        'CONFLICT',
        `Proposal ${params.proposalId} is already decided (${proposal.status})`,
      );
    }

    // Two-person rule enforcement:
    if (proposal.proposerUserId === params.actorId) {
      await this.rbacStore.appendAuditLog({
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: 'config:proposal:review:self_prohibited',
        resourceType: 'PLATFORM_CONFIG_PROPOSAL',
        resourceId: params.proposalId,
        outcome: 'DENIED',
        reason: 'Proposers cannot approve their own configuration change (two-person rule)',
        requestId: params.requestId,
        now,
      });
      throw new AppError(
        403,
        'FORBIDDEN',
        'Proposers cannot approve their own configuration change (two-person rule enforced)',
      );
    }

    let updatedConfig: PlatformConfigRecord | undefined;

    if (params.decision === 'APPROVE') {
      updatedConfig = await this.governanceStore.updatePlatformConfig(
        proposal.proposedChanges,
        params.actorId,
        now,
      );
    }

    const updatedProposal = await this.governanceStore.updateProposal(params.proposalId, {
      status: params.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      reviewedByUserId: params.actorId,
      reviewedAt: now,
      reviewReason: params.reason,
    });

    if (!updatedProposal) {
      throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'Failed to update proposal');
    }

    await this.rbacStore.appendAuditLog({
      actorId: params.actorId,
      actorRole: params.actorRole,
      action: `config:proposal:${params.decision.toLowerCase()}`,
      resourceType: 'PLATFORM_CONFIG_PROPOSAL',
      resourceId: params.proposalId,
      outcome: 'ALLOWED',
      reason: params.reason,
      requestId: params.requestId,
      now,
    });

    return { proposal: updatedProposal, config: updatedConfig };
  }

  async searchAuditLogs(query: AuditLogQueryDto): Promise<AuditLogPageDto> {
    const res = await this.rbacStore.searchAuditLogs(query);
    return {
      logs: res.logs.map((entry) => ({
        auditId: entry.auditId,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId,
        outcome: entry.outcome,
        reason: entry.reason ?? null,
        requestId: entry.requestId ?? null,
        createdAt: entry.createdAt.toISOString(),
      })),
      total: res.total,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };
  }
}
