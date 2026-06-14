import { Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Purchase, PurchaseStatus, Product, Supplier, InventoryTransactionType } from '../models';
import { AuthRequest } from '../middleware/auth';
import { ApiError } from '../utils/ApiError';
import { ApiResponse } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/asyncHandler';
import { generateDocumentNumber } from '../utils/tokens';
import { updateStock } from '../services/stockService';
import { postPurchaseLedger, reversePurchaseLedger } from '../services/ledgerService';
import { logAudit } from '../middleware/auditLog';
import { AuditAction } from '../models/AuditLog';

export const purchaseSchema = z.object({
  supplier: z.string(),
  items: z.array(z.object({
    product: z.string(),
    quantity: z.number().min(1),
    unitPrice: z.number().min(0),
  })).min(1),
  tax: z.number().optional(),
  discount: z.number().optional(),
  expectedDate: z.string().optional(),
  notes: z.string().optional(),
});

export const receivePurchaseSchema = z.object({
  receivedItems: z.array(z.object({
    productId: z.string(),
    quantity: z.number().min(1),
  })).min(1),
});

export const getPurchases = asyncHandler(async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 20;
  const skip = (page - 1) * limit;
  const filter: Record<string, unknown> = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.supplier) filter.supplier = req.query.supplier;

  const [purchases, total] = await Promise.all([
    Purchase.find(filter).populate('supplier', 'name phone').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Purchase.countDocuments(filter),
  ]);

  ApiResponse.paginated(res, purchases, { page, limit, total });
});

export const getPurchase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const purchase = await Purchase.findById(req.params.id)
    .populate('supplier')
    .populate('items.product', 'name sku currentStock');
  if (!purchase) throw new ApiError(404, 'Purchase not found');
  ApiResponse.success(res, purchase);
});

export const createPurchase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  let committed = false;
  session.startTransaction();

  try {
    const supplier = await Supplier.findById(req.body.supplier).session(session);
    if (!supplier) throw new ApiError(404, 'Supplier not found');

    const items = [];
    let subtotal = 0;

    for (const item of req.body.items) {
      const product = await Product.findById(item.product).session(session);
      if (!product) throw new ApiError(404, `Product ${item.product} not found`);
      const totalPrice = item.quantity * item.unitPrice;
      subtotal += totalPrice;
      items.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        quantity: item.quantity,
        receivedQuantity: 0,
        unitPrice: item.unitPrice,
        totalPrice,
      });
    }

    const poNumber = await generateDocumentNumber('PO', Purchase, 'poNumber', session);
    const tax = req.body.tax || 0;
    const discount = req.body.discount || 0;
    const total = subtotal + tax - discount;

    const purchase = await Purchase.create(
      [{
        poNumber,
        supplier: supplier._id,
        items,
        subtotal,
        tax,
        discount,
        total,
        paidAmount: 0,
        expectedDate: req.body.expectedDate,
        notes: req.body.notes,
        status: PurchaseStatus.PENDING,
        createdBy: req.user!._id,
      }],
      { session }
    );

    await postPurchaseLedger(
      purchase[0]._id.toString(),
      req.user!._id.toString(),
      req.user!.name,
      session
    );

    await session.commitTransaction();
    committed = true;
    await logAudit(req, AuditAction.CREATE, 'Purchase', purchase[0]._id.toString(), { poNumber, total });

    ApiResponse.success(res, purchase[0], 'Purchase order created', 201);
  } catch (error) {
    if (!committed) await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const receivePurchase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  let committed = false;
  session.startTransaction();

  try {
    const purchase = await Purchase.findById(req.params.id).session(session);
    if (!purchase) throw new ApiError(404, 'Purchase not found');
    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new ApiError(400, 'Cannot receive a cancelled purchase');
    }

    const { receivedItems } = req.body as { receivedItems: { productId: string; quantity: number }[] };

    for (const received of receivedItems) {
      const item = purchase.items.find((i) => i.product.toString() === received.productId);
      if (!item) {
        throw new ApiError(400, `Product ${received.productId} is not on this purchase order`);
      }

      const remaining = item.quantity - item.receivedQuantity;
      if (received.quantity > remaining) {
        throw new ApiError(
          400,
          `Cannot receive ${received.quantity} for ${item.sku}. Only ${remaining} remaining on PO.`
        );
      }

      item.receivedQuantity += received.quantity;

      await updateStock({
        productId: received.productId,
        type: InventoryTransactionType.PURCHASE,
        quantity: received.quantity,
        userId: req.user!._id.toString(),
        reference: purchase.poNumber,
        referenceId: purchase._id.toString(),
        referenceModel: 'Purchase',
        unitCost: item.unitPrice,
        notes: `PO receive — ${purchase.poNumber}`,
        session,
      });

      await Product.findByIdAndUpdate(
        received.productId,
        { purchasePrice: item.unitPrice },
        { session }
      );
    }

    const allReceived = purchase.items.every((i) => i.receivedQuantity >= i.quantity);
    const anyReceived = purchase.items.some((i) => i.receivedQuantity > 0);
    purchase.status = allReceived
      ? PurchaseStatus.RECEIVED
      : anyReceived
        ? PurchaseStatus.PARTIAL
        : purchase.status;

    await purchase.save({ session });

    await session.commitTransaction();
    committed = true;
    await logAudit(req, AuditAction.UPDATE, 'Purchase', purchase._id.toString(), { action: 'receive' });

    ApiResponse.success(res, purchase, 'Purchase received');
  } catch (error) {
    if (!committed) await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

export const cancelPurchase = asyncHandler(async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  let committed = false;
  session.startTransaction();

  try {
    const purchase = await Purchase.findById(req.params.id).session(session);
    if (!purchase) throw new ApiError(404, 'Purchase not found');
    if (purchase.status === PurchaseStatus.CANCELLED) {
      throw new ApiError(400, 'Purchase already cancelled');
    }

    const anyReceived = purchase.items.some((i) => i.receivedQuantity > 0);
    if (anyReceived) {
      throw new ApiError(
        400,
        'Cannot cancel a partially or fully received PO. Reverse stock via inventory adjustment first.'
      );
    }

    await reversePurchaseLedger(
      purchase._id.toString(),
      req.user!._id.toString(),
      req.user!.name,
      session
    );

    purchase.status = PurchaseStatus.CANCELLED;
    await purchase.save({ session });

    await session.commitTransaction();
    committed = true;
    await logAudit(req, AuditAction.UPDATE, 'Purchase', purchase._id.toString(), { action: 'cancel' });

    ApiResponse.success(res, purchase, 'Purchase cancelled');
  } catch (error) {
    if (!committed) await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});
