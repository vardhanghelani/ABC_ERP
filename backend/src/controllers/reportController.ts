import { Response } from 'express';
import mongoose from 'mongoose';
import { Notification } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../utils/permissions';
import { paramId } from '../utils/params';
import {
  getDashboardStats,
  getSalesReport,
  getStockReport,
  getProfitReport,
  getCustomerReport,
  getSalesGraph,
} from '../services/reportService';
import { Settings } from '../models/Settings';
import { generateCreditReportPDF } from '../services/pdf/creditReportPdfService';
import { sendPdfResponse } from '../services/pdf/pdfLayout';

function notificationAccessFilter(userId: mongoose.Types.ObjectId, permissions: string[]) {
  const canSeeGlobal =
    permissions.includes(PERMISSIONS.INVENTORY_VIEW) ||
    permissions.includes(PERMISSIONS.PRODUCTS_VIEW) ||
    permissions.includes(PERMISSIONS.USERS_VIEW);

  if (canSeeGlobal) {
    return {
      $or: [{ user: userId }, { user: null }, { user: { $exists: false } }],
    };
  }
  return { user: userId };
}

async function assertNotificationAccess(
  notificationId: string,
  userId: mongoose.Types.ObjectId,
  permissions: string[]
) {
  const notification = await Notification.findById(notificationId);
  if (!notification) throw new ApiError(404, 'Notification not found');

  const isOwner = notification.user?.toString() === userId.toString();
  const isGlobal = !notification.user;
  const canSeeGlobal =
    permissions.includes(PERMISSIONS.INVENTORY_VIEW) ||
    permissions.includes(PERMISSIONS.PRODUCTS_VIEW) ||
    permissions.includes(PERMISSIONS.USERS_VIEW);

  if (!isOwner && !(isGlobal && canSeeGlobal)) {
    throw new ApiError(403, 'Not allowed to access this notification');
  }
  return notification;
}

export const getDashboard = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const [stats, salesGraph] = await Promise.all([getDashboardStats(), getSalesGraph(30)]);
  ApiResponse.success(res, { ...stats, salesGraph });
});

export const salesReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await getSalesReport((req.query.period as string) || 'month');
  ApiResponse.success(res, report);
});

export const stockReport = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const report = await getStockReport();
  ApiResponse.success(res, report);
});

export const profitReport = asyncHandler(async (req: AuthRequest, res: Response) => {
  const report = await getProfitReport((req.query.period as string) || 'month');
  ApiResponse.success(res, report);
});

export const customerReport = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const report = await getCustomerReport();
  ApiResponse.success(res, report);
});

export const downloadOutstandingReportPDF = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const settings = await Settings.find();
  const companyInfo: Record<string, string> = {};
  settings.forEach((setting) => {
    companyInfo[setting.key] = String(setting.value ?? '');
  });
  const pdf = await generateCreditReportPDF(companyInfo);
  const dateStamp = new Date().toISOString().slice(0, 10);
  sendPdfResponse(res, pdf, `credit-receivables-report-${dateStamp}.pdf`);
});

export const getNotifications = asyncHandler(async (req: AuthRequest, res: Response) => {
  const permissions = ROLE_PERMISSIONS[req.user!.role];
  const filter: Record<string, unknown> = notificationAccessFilter(req.user!._id, permissions);
  if (req.query.unread === 'true') filter.isRead = false;

  const notifications = await Notification.find(filter).sort({ createdAt: -1 }).limit(50);
  ApiResponse.success(res, notifications);
});

export const markNotificationRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const permissions = ROLE_PERMISSIONS[req.user!.role];
  await assertNotificationAccess(paramId(req.params.id), req.user!._id, permissions);
  await Notification.findByIdAndUpdate(paramId(req.params.id), { isRead: true });
  ApiResponse.success(res, null, 'Notification marked as read');
});

export const markAllNotificationsRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const permissions = ROLE_PERMISSIONS[req.user!.role];
  const filter = { ...notificationAccessFilter(req.user!._id, permissions), isRead: false };
  await Notification.updateMany(filter, { isRead: true });
  ApiResponse.success(res, null, 'All notifications marked as read');
});
