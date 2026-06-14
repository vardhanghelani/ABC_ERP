import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { AuditLog, AuditAction } from '../models/AuditLog';

export const createAuditLog = (
  action: AuditAction,
  entity: string,
  entityId?: string,
  changes?: Record<string, unknown>,
  description?: string
) => {
  return async (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (req.user) {
      try {
        await AuditLog.create({
          action,
          entity,
          entityId,
          user: req.user._id,
          userName: req.user.name,
          changes,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          description,
        });
      } catch {
        // Non-blocking audit logging
      }
    }
    next();
  };
};

export const logAudit = async (
  req: AuthRequest,
  action: AuditAction,
  entity: string,
  entityId?: string,
  changes?: Record<string, unknown>,
  description?: string
) => {
  if (!req.user) return;
  await AuditLog.create({
    action,
    entity,
    entityId,
    user: req.user._id,
    userName: req.user.name,
    changes,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    description,
  });
};
