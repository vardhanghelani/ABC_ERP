import mongoose from 'mongoose';
import { Product } from '../models/Product';
import { InventoryTransaction, InventoryTransactionType } from '../models/InventoryTransaction';
import { Notification, NotificationType } from '../models/Notification';
import { ApiError } from '../utils/ApiError';

interface StockMovementParams {
  productId: string;
  type: InventoryTransactionType;
  quantity: number;
  userId: string;
  reference?: string;
  referenceId?: string;
  referenceModel?: string;
  notes?: string;
  warehouse?: string;
  toWarehouse?: string;
  unitCost?: number;
  session?: mongoose.ClientSession;
  /** Skip low-stock notifications (faster POS checkout) */
  skipNotifications?: boolean;
}

export const updateStock = async (params: StockMovementParams) => {
  const ownsSession = !params.session;
  const session = params.session ?? (await mongoose.startSession());
  if (ownsSession) session.startTransaction();

  try {
    const product = await Product.findById(params.productId).session(session);
    if (!product) throw new ApiError(404, 'Product not found');
    if (product.status === 'inactive') {
      throw new ApiError(
        400,
        `"${product.name}" is inactive. Reactivate it from Inactive Products before recording stock movements.`
      );
    }

    const previousStock = product.currentStock;
    let newStock = previousStock;
    let qty = Math.abs(params.quantity);

    switch (params.type) {
      case InventoryTransactionType.STOCK_IN:
      case InventoryTransactionType.PURCHASE:
      case InventoryTransactionType.RETURN:
        newStock = previousStock + qty;
        break;
      case InventoryTransactionType.STOCK_OUT:
      case InventoryTransactionType.SALE:
      case InventoryTransactionType.DAMAGED:
        if (previousStock < qty) throw new ApiError(400, `Insufficient stock for ${product.name}`);
        newStock = previousStock - qty;
        break;
      case InventoryTransactionType.ADJUSTMENT:
      case InventoryTransactionType.AUDIT:
        newStock = params.quantity;
        qty = Math.abs(newStock - previousStock);
        break;
      case InventoryTransactionType.TRANSFER:
        if (previousStock < qty) throw new ApiError(400, 'Insufficient stock for transfer');
        newStock = previousStock - qty;
        break;
      default:
        throw new ApiError(400, 'Invalid transaction type');
    }

    product.currentStock = newStock;
    await product.save({ session });

    const transaction = await InventoryTransaction.create(
      [
        {
          type: params.type,
          product: product._id,
          quantity: qty,
          previousStock,
          newStock,
          unitCost: params.unitCost,
          totalCost: params.unitCost ? params.unitCost * qty : undefined,
          reference: params.reference,
          referenceId: params.referenceId,
          referenceModel: params.referenceModel,
          notes: params.notes,
          warehouse: params.warehouse || 'main',
          toWarehouse: params.toWarehouse,
          performedBy: params.userId,
        },
      ],
      { session }
    );

    // Low stock notification (deferred on POS for speed)
    if (!params.skipNotifications && newStock <= product.reorderLevel && newStock > 0) {
      await Notification.create(
        [
          {
            type: NotificationType.LOW_STOCK,
            title: 'Low Stock Alert',
            message: `${product.name} (${product.sku}) is running low. Current: ${newStock}`,
            reference: 'Product',
            referenceId: product._id,
            priority: 'medium',
          },
        ],
        { session }
      );
    } else if (!params.skipNotifications && newStock === 0) {
      await Notification.create(
        [
          {
            type: NotificationType.OUT_OF_STOCK,
            title: 'Out of Stock',
            message: `${product.name} (${product.sku}) is out of stock`,
            reference: 'Product',
            referenceId: product._id,
            priority: 'high',
          },
        ],
        { session }
      );
    }

    if (ownsSession) await session.commitTransaction();
    return { product, transaction: transaction[0] };
  } catch (error) {
    if (ownsSession) await session.abortTransaction();
    throw error;
  } finally {
    if (ownsSession) session.endSession();
  }
};

interface BatchStockItem {
  productId: string;
  quantity: number;
}

/** Batch sale stock deduction — one read, atomic bulkWrite, single insertMany. */
export const deductStockBatch = async (
  items: BatchStockItem[],
  params: {
    userId: string;
    reference?: string;
    referenceId?: string;
    referenceModel?: string;
    session?: mongoose.ClientSession;
  }
) => {
  if (items.length === 0) return;

  const qtyByProduct = new Map<string, number>();
  for (const item of items) {
    qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity);
  }

  const productIds = [...qtyByProduct.keys()];
  const products = await Product.find({ _id: { $in: productIds } }).session(params.session || null);
  const productMap = new Map(products.map((p) => [p._id.toString(), p]));

  const bulkOps: mongoose.mongo.AnyBulkWriteOperation[] = [];
  const inventoryDocs: Record<string, unknown>[] = [];

  for (const [productId, qty] of qtyByProduct) {
    const product = productMap.get(productId);
    if (!product) throw new ApiError(404, 'Product not found');
    if (product.currentStock < qty) {
      throw new ApiError(400, `Insufficient stock for ${product.name}`);
    }

    const previousStock = product.currentStock;
    const newStock = previousStock - qty;

    bulkOps.push({
      updateOne: {
        filter: { _id: product._id, currentStock: { $gte: qty } },
        update: { $inc: { currentStock: -qty } },
      },
    });

    inventoryDocs.push({
      type: InventoryTransactionType.SALE,
      product: product._id,
      quantity: qty,
      previousStock,
      newStock,
      reference: params.reference,
      referenceId: params.referenceId,
      referenceModel: params.referenceModel,
      warehouse: 'main',
      performedBy: params.userId,
    });
  }

  const bulkResult = await Product.bulkWrite(bulkOps, { session: params.session });
  if (bulkResult.modifiedCount !== bulkOps.length) {
    throw new ApiError(400, 'Insufficient stock — please retry');
  }

  await InventoryTransaction.insertMany(inventoryDocs, { session: params.session });
};

export const getStockHistory = async (productId: string, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const [transactions, total] = await Promise.all([
    InventoryTransaction.find({ product: productId })
      .populate('performedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    InventoryTransaction.countDocuments({ product: productId }),
  ]);
  return { transactions, total, page, limit };
};

export const getInventoryValuation = async () => {
  const products = await Product.find({ status: 'active' });
  const valuation = products.reduce(
    (acc, p) => ({
      totalUnits: acc.totalUnits + p.currentStock,
      purchaseValue: acc.purchaseValue + p.currentStock * p.purchasePrice,
      wholesaleValue: acc.wholesaleValue + p.currentStock * p.wholesalePrice,
      retailValue: acc.retailValue + p.currentStock * p.retailPrice,
    }),
    { totalUnits: 0, purchaseValue: 0, wholesaleValue: 0, retailValue: 0 }
  );
  return valuation;
};
