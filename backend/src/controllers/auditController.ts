import { Response } from 'express';
import { AuditLog, AuditAction } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';

export const getAuditLogs = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = {};
  if (req.query.entity) filter.entity = req.query.entity;
  if (req.query.action) filter.action = req.query.action;
  if (req.query.userId) filter.user = req.query.userId;

  const [logs, total] = await Promise.all([
    AuditLog.find(filter).populate('user', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
    AuditLog.countDocuments(filter),
  ]);

  ApiResponse.paginated(res, logs, { page, limit, total });
});

export const getLoginHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const logs = await AuditLog.find({ action: AuditAction.LOGIN })
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(100);
  ApiResponse.success(res, logs);
});
