import { Response } from 'express';
import { z } from 'zod';
import { Supplier } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { logAudit } from '../middleware/auditLog';
import { AuditAction } from '../models/AuditLog';
import { paramId } from '../utils/params';
import { getLedger } from '../services/reportService';

export const supplierSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  gstNumber: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  phone: z.string().min(10),
  email: z.string().email().optional().or(z.literal('')),
  contactPerson: z.string().optional(),
});

export const getSuppliers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = { isActive: true };
  if (req.query.search) filter.$text = { $search: req.query.search as string };

  const [suppliers, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Supplier.countDocuments(filter),
  ]);

  ApiResponse.paginated(res, suppliers, { page, limit, total });
});

export const getSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  ApiResponse.success(res, supplier);
});

export const createSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await Supplier.create({ ...req.body, createdBy: req.user!._id });
  await logAudit(req, AuditAction.CREATE, 'Supplier', supplier._id.toString());
  ApiResponse.success(res, supplier, 'Supplier created', 201);
});

export const updateSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!supplier) throw new ApiError(404, 'Supplier not found');
  ApiResponse.success(res, supplier, 'Supplier updated');
});

export const deleteSupplier = asyncHandler(async (req: AuthRequest, res: Response) => {
  await Supplier.findByIdAndUpdate(req.params.id, { isActive: false });
  ApiResponse.success(res, null, 'Supplier deactivated');
});

export const getSupplierLedger = asyncHandler(async (req: AuthRequest, res: Response) => {
  const ledger = await getLedger('supplier', paramId(req.params.id));
  ApiResponse.success(res, ledger);
});
