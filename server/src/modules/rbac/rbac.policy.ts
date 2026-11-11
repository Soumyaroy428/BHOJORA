import { AppError } from '../../middleware/error-handler';
import type { UserRole } from '../identity/identity.types';

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

export interface TenantMembershipRecord {
  membershipId: string;
  userId: string;
  restaurantId: string;
  outletId: string;
  role: TenantMembershipRole;
  status: TenantMembershipStatus;
  grantedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export function isPrivilegedMfaRole(role: UserRole): boolean {
  return (PRIVILEGED_MFA_ROLES as readonly string[]).includes(role);
}

export function getPermissionsForRole(role: UserRole): readonly Permission[] {
  return ROLE_PERMISSION_MATRIX[role];
}

export function hasPermissionForRole(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSION_MATRIX[role].includes(permission);
}

export function resolveActiveRole(
  assignedRoles: readonly UserRole[],
  requestedActiveRole?: string,
): UserRole {
  const defaultRole = assignedRoles[0] ?? 'CUSTOMER';
  if (!requestedActiveRole) {
    return defaultRole;
  }
  const normalized = requestedActiveRole.trim();
  if (!assignedRoles.includes(normalized as UserRole)) {
    throw new AppError(403, 'FORBIDDEN', 'Requested active role is not assigned to this account');
  }
  return normalized as UserRole;
}

export function assertMfaSatisfiedForRole(role: UserRole, mfaVerified: boolean): void {
  if (isPrivilegedMfaRole(role) && !mfaVerified) {
    throw new AppError(403, 'FORBIDDEN', 'Privileged role actions require verified step-up MFA', [
      {
        field: 'session.mfaVerified',
        issue: `Role ${role} requires verified step-up MFA on the active session`,
        code: 'MFA_REQUIRED',
      },
    ]);
  }
}

export function hasOutletMembership(
  memberships: readonly TenantMembershipRecord[],
  restaurantId: string,
  outletId: string,
  requiredRole?: TenantMembershipRole,
): boolean {
  return memberships.some(
    (m) =>
      m.status === 'ACTIVE' &&
      m.restaurantId === restaurantId &&
      (m.outletId === '*' || m.outletId === outletId) &&
      (requiredRole === undefined || m.role === requiredRole),
  );
}

export function canAccessOutletScope(params: {
  activeRole: UserRole;
  memberships: readonly TenantMembershipRecord[];
  restaurantId: string;
  outletId: string;
}): boolean {
  if (
    params.activeRole === 'OPS_ADMIN' ||
    params.activeRole === 'TRUST_ADMIN' ||
    params.activeRole === 'SUPER_ADMIN'
  ) {
    return true;
  }
  if ((TENANT_MEMBERSHIP_ROLES as readonly string[]).includes(params.activeRole)) {
    return hasOutletMembership(
      params.memberships,
      params.restaurantId,
      params.outletId,
      params.activeRole as TenantMembershipRole,
    );
  }
  return false;
}

export function assertCustomerSelfOrSupport(params: {
  activeRole: UserRole;
  actorUserId: string;
  targetCustomerId: string;
}): void {
  if (
    params.activeRole === 'SUPPORT_AGENT' ||
    params.activeRole === 'OPS_ADMIN' ||
    params.activeRole === 'SUPER_ADMIN'
  ) {
    return;
  }
  if (params.actorUserId !== params.targetCustomerId) {
    throw new AppError(403, 'FORBIDDEN', 'Cross-customer resource access (IDOR) is forbidden');
  }
}

export function assertDeliveryJobAccess(params: {
  activeRole: UserRole;
  actorUserId: string;
  assignedPartnerId: string;
}): void {
  if (
    params.activeRole === 'OPS_ADMIN' ||
    params.activeRole === 'SUPPORT_AGENT' ||
    params.activeRole === 'SUPER_ADMIN'
  ) {
    return;
  }
  if (params.activeRole === 'DELIVERY_PARTNER' && params.actorUserId === params.assignedPartnerId) {
    return;
  }
  throw new AppError(403, 'FORBIDDEN', 'Delivery partner may only access assigned jobs');
}

export function assertInspectionApprovalAllowed(params: {
  activeRole: UserRole;
  actorUserId: string;
  authoredByUserId: string;
}): void {
  if (params.actorUserId === params.authoredByUserId) {
    throw new AppError(
      403,
      'SELF_APPROVAL_PROHIBITED',
      'Reviewer cannot approve an inspection report they authored (AUTH.md §3)',
    );
  }
  if (params.activeRole !== 'INSPECTION_REVIEWER' && params.activeRole !== 'TRUST_ADMIN') {
    throw new AppError(403, 'FORBIDDEN', 'Only qualified reviewers or trust admins may approve');
  }
}
