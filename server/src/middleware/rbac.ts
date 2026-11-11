import type { NextFunction, Request, Response } from 'express';
import { getRequestIdFromResponse } from '../contracts/api';
import { getAuthContext } from './auth';
import { AppError } from './error-handler';
import type { UserRole } from '../modules/identity/identity.types';
import {
  assertMfaSatisfiedForRole,
  hasPermissionForRole,
  isPrivilegedMfaRole,
  resolveActiveRole,
  type Permission,
} from '../modules/rbac/rbac.policy';
import type { RbacStore } from '../modules/rbac/rbac.store';

export interface AuthorizedContext {
  userId: string;
  sessionId: string;
  roles: UserRole[];
  activeRole: UserRole;
  mfaVerified: boolean;
  mfaRequiredForActiveRole: boolean;
}

export function resolveRbacRequestContext(req: Request, res: Response): AuthorizedContext {
  const cached = res.locals['rbac'] as AuthorizedContext | undefined;
  if (cached) {
    return cached;
  }

  const auth = getAuthContext(res);
  const headerRole = req.headers['x-bhojora-active-role'];
  const requestedRole = Array.isArray(headerRole) ? headerRole[0] : headerRole;
  const activeRole = resolveActiveRole(auth.roles, requestedRole);

  const context: AuthorizedContext = {
    userId: auth.userId,
    sessionId: auth.sessionId,
    roles: [...auth.roles],
    activeRole,
    mfaVerified: auth.mfaVerified,
    mfaRequiredForActiveRole: isPrivilegedMfaRole(activeRole),
  };
  res.locals['rbac'] = context;
  return context;
}

export function getRbacContext(res: Response): AuthorizedContext {
  const context = res.locals['rbac'] as AuthorizedContext | undefined;
  if (!context) {
    throw new AppError(500, 'INTERNAL_SERVER_ERROR', 'RBAC context not resolved');
  }
  return context;
}

export function createRequirePermissionMiddleware(
  requiredPermission: Permission,
  rbacStore?: RbacStore,
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const ctx = resolveRbacRequestContext(req, res);

      if (!hasPermissionForRole(ctx.activeRole, requiredPermission)) {
        if (rbacStore) {
          await rbacStore.appendAuditLog({
            actorId: ctx.userId,
            actorRole: ctx.activeRole,
            action: `permission.check.${requiredPermission}`,
            resourceType: 'route',
            resourceId: req.originalUrl,
            outcome: 'DENIED',
            reason: `Role ${ctx.activeRole} lacks permission ${requiredPermission}`,
            requestId: getRequestIdFromResponse(res),
          });
        }
        throw new AppError(
          403,
          'FORBIDDEN',
          `Role ${ctx.activeRole} lacks permission ${requiredPermission}`,
        );
      }

      try {
        assertMfaSatisfiedForRole(ctx.activeRole, ctx.mfaVerified);
      } catch (error) {
        if (rbacStore) {
          await rbacStore.appendAuditLog({
            actorId: ctx.userId,
            actorRole: ctx.activeRole,
            action: `mfa.check.${requiredPermission}`,
            resourceType: 'session',
            resourceId: ctx.sessionId,
            outcome: 'DENIED',
            reason: 'MFA_REQUIRED',
            requestId: getRequestIdFromResponse(res),
          });
        }
        throw error;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
