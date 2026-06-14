import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { ApiError } from '../utils/ApiError';
import { Permission, hasPermission } from '../utils/permissions';

export const authorize = (...permissions: Permission[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }

    const hasAccess = permissions.some((p) => hasPermission(req.user!.role, p));
    if (!hasAccess) {
      return next(new ApiError(403, 'Insufficient permissions'));
    }

    next();
  };
};

export const authorizeRoles = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new ApiError(401, 'Authentication required'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, 'Insufficient permissions'));
    }

    next();
  };
};
