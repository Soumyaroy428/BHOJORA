import type { UserRole } from './auth';

/**
 * BHOJORA — Canonical RBAC & Tenant Isolation Contracts (CHECKPOINT_08 & AUTH.md).
 */
export const PERMISSION_CATALOG = [
  'profile:own:read',
  'profile:own:write',
  'address:own:manage',
  'order:own:read',
  'order:own:create',
  'restaurant:outlet:read',
  'restaurant:outlet:write',
  'restaurant:menu:manage',
  'restaurant:order:manage',
  'restaurant:compliance:read',
  'delivery:job:read',
  'delivery:job:update',
  'delivery:earnings:own:read',
  'inspection:create',
  'inspection:assigned:read',
  'inspection:submit',
  'inspection:review',
  'inspection:approve',
  'safety:score:publish',
  'support:ticket:read',
  'support:ticket:resolve',
  'ops:outlet:manage',
  'finance:settlement:read',
  'finance:refund:approve',
  'rbac:membership:manage',
  'rbac:role:assign',
  'audit:log:read',
  'system:admin:override',
] as const;

export type Permission = (typeof PERMISSION_CATALOG)[number];

/**
 * Privileged roles that MUST hold a step-up MFA verified session before performing actions (AUTH.md §2).
 */
export const PRIVILEGED_MFA_ROLES = [
  'INSPECTION_REVIEWER',
  'OPS_ADMIN',
  'TRUST_ADMIN',
  'FINANCE_ADMIN',
  'SUPER_ADMIN',
] as const satisfies readonly UserRole[];

export const TENANT_MEMBERSHIP_ROLES = [
  'RESTAURANT_OWNER',
  'RESTAURANT_MANAGER',
  'KITCHEN_STAFF',
] as const satisfies readonly UserRole[];

export type TenantMembershipRole = (typeof TENANT_MEMBERSHIP_ROLES)[number];

export const TENANT_MEMBERSHIP_STATUSES = ['ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
export type TenantMembershipStatus = (typeof TENANT_MEMBERSHIP_STATUSES)[number];

export const ROLE_PERMISSION_MATRIX: Readonly<Record<UserRole, readonly Permission[]>> = {
  CUSTOMER: [
    'profile:own:read',
    'profile:own:write',
    'address:own:manage',
    'order:own:read',
    'order:own:create',
  ],
  RESTAURANT_OWNER: [
    'profile:own:read',
    'profile:own:write',
    'restaurant:outlet:read',
    'restaurant:outlet:write',
    'restaurant:menu:manage',
    'restaurant:order:manage',
    'restaurant:compliance:read',
    'rbac:membership:manage',
  ],
  RESTAURANT_MANAGER: [
    'profile:own:read',
    'profile:own:write',
    'restaurant:outlet:read',
    'restaurant:outlet:write',
    'restaurant:menu:manage',
    'restaurant:order:manage',
    'restaurant:compliance:read',
  ],
  KITCHEN_STAFF: ['profile:own:read', 'restaurant:outlet:read', 'restaurant:order:manage'],
  DELIVERY_PARTNER: [
    'profile:own:read',
    'profile:own:write',
    'delivery:job:read',
    'delivery:job:update',
    'delivery:earnings:own:read',
  ],
  INSPECTOR: [
    'profile:own:read',
    'inspection:create',
    'inspection:assigned:read',
    'inspection:submit',
  ],
  INSPECTION_REVIEWER: [
    'profile:own:read',
    'inspection:assigned:read',
    'inspection:review',
    'inspection:approve',
    'safety:score:publish',
  ],
  SUPPORT_AGENT: [
    'profile:own:read',
    'order:own:read',
    'support:ticket:read',
    'support:ticket:resolve',
  ],
  OPS_ADMIN: [
    'profile:own:read',
    'restaurant:outlet:read',
    'restaurant:outlet:write',
    'ops:outlet:manage',
    'support:ticket:read',
    'audit:log:read',
  ],
  TRUST_ADMIN: [
    'profile:own:read',
    'inspection:assigned:read',
    'inspection:review',
    'inspection:approve',
    'safety:score:publish',
    'restaurant:compliance:read',
    'audit:log:read',
  ],
  FINANCE_ADMIN: [
    'profile:own:read',
    'finance:settlement:read',
    'finance:refund:approve',
    'audit:log:read',
  ],
  SUPER_ADMIN: [
    'profile:own:read',
    'profile:own:write',
    'address:own:manage',
    'order:own:read',
    'restaurant:outlet:read',
    'restaurant:outlet:write',
    'restaurant:compliance:read',
    'ops:outlet:manage',
    'finance:settlement:read',
    'finance:refund:approve',
    'support:ticket:read',
    'support:ticket:resolve',
    'rbac:membership:manage',
    'rbac:role:assign',
    'audit:log:read',
    'system:admin:override',
  ],
};

export interface TenantMembershipDto {
  membershipId: string;
  userId: string;
  restaurantId: string;
  outletId: string;
  role: TenantMembershipRole;
  status: TenantMembershipStatus;
  createdAt: string;
}

export interface RbacContextDto {
  userId: string;
  roles: UserRole[];
  activeRole: UserRole;
  mfaVerified: boolean;
  mfaRequiredForActiveRole: boolean;
  permissions: Permission[];
  memberships: TenantMembershipDto[];
}

export interface MfaSendResponseDto {
  challengeId: string;
  channel: 'sms' | 'email';
  maskedDestination: string;
  expiresInSeconds: number;
}

export interface MfaVerifyRequest {
  challengeId: string;
  code: string;
}

export interface AssignMembershipRequest {
  userId: string;
  restaurantId: string;
  outletId: string;
  role: TenantMembershipRole;
  status?: TenantMembershipStatus;
  reason?: string;
}

export interface AssignUserRolesRequest {
  roles: UserRole[];
  reason: string;
}
