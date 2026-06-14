import { ApiError } from './ApiError';
import { UserRole } from './permissions';

const ROLE_RANK: Record<UserRole, number> = {
  [UserRole.SUPER_ADMIN]: 100,
  [UserRole.ADMIN]: 80,
  [UserRole.ACCOUNTANT]: 60,
  [UserRole.WAREHOUSE]: 40,
  [UserRole.SALESMAN]: 20,
};

export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return ROLE_RANK[targetRole] <= ROLE_RANK[actorRole];
}

export function assertCanAssignRole(actorRole: UserRole, targetRole: UserRole): void {
  if (!canAssignRole(actorRole, targetRole)) {
    throw new ApiError(403, 'Cannot assign a role higher than your own');
  }
}

export function resolveAssignableRole(actorRole: UserRole, requestedRole?: UserRole): UserRole {
  const target = requestedRole || UserRole.SALESMAN;
  assertCanAssignRole(actorRole, target);
  return target;
}
