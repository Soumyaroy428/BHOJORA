/**
 * BHOJORA — Checkpoint 28: Admin Governance, Account Management, Configuration Approvals & Audit Search
 */

export interface PlatformConfigDto {
  configId: string;
  maintenanceMode: boolean;
  emergencySurgeLock: boolean;
  monsoonWaterloggingMode: boolean;
  maxUnassignedOrderAgeMinutes: number;
  instantRefundCapPaise: number;
  platformFeePaise: number;
  activeZones: string[];
  updatedByUserId: string;
  updatedAt: string;
  version: number;
}

export type ProposalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ConfigChangeProposalDto {
  proposalId: string;
  proposerUserId: string;
  proposerRole: string;
  proposedChanges: Partial<
    Omit<PlatformConfigDto, 'configId' | 'updatedByUserId' | 'updatedAt' | 'version'>
  >;
  reason: string;
  status: ProposalStatus;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  createdAt: string;
}

export interface AdminOverviewDto {
  usersTotal: number;
  usersSuspended: number;
  restaurantsTotal: number;
  outletsActive: number;
  outletsSuspended: number;
  deliveryPartnersTotal: number;
  deliveryPartnersActive: number;
  deliveryPartnersSuspended: number;
  pendingInspections: number;
  openTickets: number;
  recentAuditCount: number;
  platformConfigVersion: number;
  monsoonModeActive: boolean;
}

export interface AdminUserSummaryDto {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  roles: string[];
  status: string;
  phoneVerified: boolean;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminOutletSummaryDto {
  outletId: string;
  restaurantId: string;
  brandName: string;
  name: string;
  zoneId: string;
  status: string;
  publishedSafetyScore: number | null;
  cuisines: string[];
  createdAt: string;
}

export interface AdminPartnerSummaryDto {
  partnerId: string;
  userId: string;
  fullName: string;
  phone: string;
  status: string;
  shiftStatus: string;
  vehicleType: string;
  rating: number;
  totalDeliveries: number;
  createdAt: string;
}

export interface AuditLogQueryDto {
  actorId?: string;
  actorRole?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: 'ALLOWED' | 'DENIED';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AuditLogEntryDto {
  auditId: string;
  actorId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: 'ALLOWED' | 'DENIED';
  reason: string | null;
  requestId: string | null;
  createdAt: string;
}

export interface AuditLogPageDto {
  logs: AuditLogEntryDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface UpdateEntityStatusRequest {
  status: 'ACTIVE' | 'SUSPENDED';
  reason: string;
}

export interface ProposeConfigChangeRequest {
  proposedChanges: Partial<
    Omit<PlatformConfigDto, 'configId' | 'updatedByUserId' | 'updatedAt' | 'version'>
  >;
  reason: string;
}

export interface ReviewConfigProposalRequest {
  decision: 'APPROVE' | 'REJECT';
  reason: string;
}
