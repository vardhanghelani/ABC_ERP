import { Response } from 'express';
import { z } from 'zod';
import { InventoryTransactionType } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { updateStock, getStockHistory, getInventoryValuation } from '../services/stockService';
import { paramId } from '../utils/params';
import { logAudit } from '../middleware/auditLog';
import { AuditAction } from '../models/AuditLog';
import { InventoryTransaction } from '../models/InventoryTransaction';

/** Request body for stock-in/out/damaged/transfer — type comes from the route, not the body. */
export const stockMovementBodySchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number().min(1, 'Quantity must be at least 1'),
  notes: z.string().optional(),
  warehouse: z.string().optional(),
  toWarehouse: z.string().optional(),
  unitCost: z.coerce.number().optional(),
  reference: z.string().optional(),
});

/** Adjustment sets absolute stock level (0 allowed). */
export const stockAdjustBodySchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  quantity: z.coerce.number().min(0, 'Stock level cannot be negative'),
  notes: z.string().optional(),
  warehouse: z.string().optional(),
  reference: z.string().optional(),
});

/** @deprecated use stockMovementBodySchema — kept for any external callers sending type */
export const stockMovementSchema = stockMovementBodySchema.extend({
  type: z.nativeEnum(InventoryTransactionType),
});

export const stockIn = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await updateStock({
    ...req.body,
    type: InventoryTransactionType.STOCK_IN,
    userId: req.user!._id.toString(),
  });
  await logAudit(req, AuditAction.STOCK_CHANGE, 'Product', req.body.productId, { type: 'stock_in', quantity: req.body.quantity });
  ApiResponse.success(res, result, 'Stock added');
});

export const stockOut = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await updateStock({
    ...req.body,
    type: InventoryTransactionType.STOCK_OUT,
    userId: req.user!._id.toString(),
  });
  await logAudit(req, AuditAction.STOCK_CHANGE, 'Product', req.body.productId, { type: 'stock_out', quantity: req.body.quantity });
  ApiResponse.success(res, result, 'Stock removed');
});

export const adjustStock = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await updateStock({
    ...req.body,
    type: InventoryTransactionType.ADJUSTMENT,
    userId: req.user!._id.toString(),
  });
  await logAudit(req, AuditAction.STOCK_CHANGE, 'Product', req.body.productId, { type: 'adjustment', quantity: req.body.quantity });
  ApiResponse.success(res, result, 'Stock adjusted');
});

export const damagedStock = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await updateStock({
    ...req.body,
    type: InventoryTransactionType.DAMAGED,
    userId: req.user!._id.toString(),
  });
  ApiResponse.success(res, result, 'Damaged stock recorded');
});

export const transferStock = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result = await updateStock({
    ...req.body,
    type: InventoryTransactionType.TRANSFER,
    userId: req.user!._id.toString(),
  });
  ApiResponse.success(res, result, 'Stock transferred');
});

export const getHistory = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const result = await getStockHistory(paramId(req.params.productId), page, limit);
  ApiResponse.paginated(res, result.transactions, { page, limit, total: result.total });
});

export const getAllTransactions = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.productId) filter.product = req.query.productId;

  const [transactions, total] = await Promise.all([
    InventoryTransaction.find(filter)
      .populate('product', 'name sku')
      .populate('performedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    InventoryTransaction.countDocuments(filter),
  ]);

  ApiResponse.paginated(res, transactions, { page, limit, total });
});

export const getValuation = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const valuation = await getInventoryValuation();
  ApiResponse.success(res, valuation);
});

export const inventoryAudit = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { items } = req.body as { items: { productId: string; actualStock: number }[] };
  if (!items?.length) throw new ApiError(400, 'No audit items provided');

  const results = [];

  for (const item of items) {
    const result = await updateStock({
      productId: item.productId,
      type: InventoryTransactionType.AUDIT,
      quantity: item.actualStock,
      userId: req.user!._id.toString(),
      notes: 'Inventory audit',
      reference: 'AUDIT',
      referenceModel: 'InventoryAudit',
    });
    results.push(result);
  }

  await logAudit(req, AuditAction.STOCK_CHANGE, 'InventoryAudit', 'batch', { count: items.length });
  ApiResponse.success(res, results, 'Audit completed');
});
