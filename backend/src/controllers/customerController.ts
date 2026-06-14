import { Response } from 'express';
import { z } from 'zod';
import { Customer, CustomerType, CreditTermType } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { logAudit } from '../middleware/auditLog';
import { AuditAction } from '../models/AuditLog';
import { paramId } from '../utils/params';
import { getLedgerView } from '../services/ledgerService';
import { LedgerEntityType } from '../models/LedgerEntry';

export const customerSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  gstNumber: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  phone: z.string().min(10),
  whatsapp: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  customerType: z.nativeEnum(CustomerType).optional(),
  creditTermType: z.nativeEnum(CreditTermType).optional(),
  creditLimit: z.number().min(0).optional(),
  creditDays: z.number().min(0).optional(),
  blockOnCreditLimit: z.boolean().optional(),
});

export const updateCustomerSchema = customerSchema.partial();

export const getCustomersPicker = asyncHandler(async (req: AuthRequest, res: Response) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);
  const search = (req.query.search as string)?.trim();
  const filter: Record<string, unknown> = { isActive: true };

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { phone: { $regex: escaped, $options: 'i' } },
    ];
  }

  const customers = await Customer.find(filter)
    .select('name phone outstandingAmount creditTermType creditLimit advanceBalance isActive customerType')
    .sort({ name: 1 })
    .limit(limit)
    .lean();

  ApiResponse.success(res, customers);
});

export const getCustomers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = {};
  if (req.query.search) filter.$text = { $search: req.query.search as string };
  if (req.query.active !== 'false') filter.isActive = true;
  if (req.query.overdue === 'true') filter.outstandingAmount = { $gt: 0 };

  const [customers, total] = await Promise.all([
    Customer.find(filter).sort({ name: 1 }).skip(skip).limit(limit),
    Customer.countDocuments(filter),
  ]);

  ApiResponse.paginated(res, customers, { page, limit, total });
});

export const getCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new ApiError(404, 'Customer not found');
  ApiResponse.success(res, customer);
});

export const createCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const customer = await Customer.create({ ...req.body, createdBy: req.user!._id });
  await logAudit(req, AuditAction.CREATE, 'Customer', customer._id.toString());
  ApiResponse.success(res, customer, 'Customer created', 201);
});

export const updateCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { outstandingAmount, totalPurchases, totalPayments, advanceBalance, riskScore, riskCategory, isActive, ...safeData } = req.body;
  const customer = await Customer.findByIdAndUpdate(req.params.id, safeData, { new: true, runValidators: true });
  if (!customer) throw new ApiError(404, 'Customer not found');
  await logAudit(req, AuditAction.UPDATE, 'Customer', customer._id.toString(), safeData);
  ApiResponse.success(res, customer, 'Customer updated');
});

export const deleteCustomer = asyncHandler(async (req: AuthRequest, res: Response) => {
  const customer = await Customer.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
  if (!customer) throw new ApiError(404, 'Customer not found');
  await logAudit(req, AuditAction.DELETE, 'Customer', paramId(req.params.id));
  ApiResponse.success(res, null, 'Customer deactivated');
});

export const addCustomerNote = asyncHandler(async (req: AuthRequest, res: Response) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new ApiError(404, 'Customer not found');

  customer.notes.push({ text: req.body.text, createdBy: req.user!._id, createdAt: new Date() });
  await customer.save();
  ApiResponse.success(res, customer, 'Note added');
});

export const getCustomerLedger = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 50;
  const result = await getLedgerView(LedgerEntityType.CUSTOMER, paramId(req.params.id), page, limit);
  ApiResponse.paginated(res, result.entries, { page, limit, total: result.total });
});
