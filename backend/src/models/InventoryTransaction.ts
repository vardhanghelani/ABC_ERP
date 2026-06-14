import mongoose, { Document, Schema } from 'mongoose';

export enum InventoryTransactionType {
  STOCK_IN = 'stock_in',
  STOCK_OUT = 'stock_out',
  ADJUSTMENT = 'adjustment',
  DAMAGED = 'damaged',
  RETURN = 'return',
  TRANSFER = 'transfer',
  AUDIT = 'audit',
  SALE = 'sale',
  PURCHASE = 'purchase',
}

export interface IInventoryTransaction extends Document {
  type: InventoryTransactionType;
  product: mongoose.Types.ObjectId;
  quantity: number;
  previousStock: number;
  newStock: number;
  unitCost?: number;
  totalCost?: number;
  reference?: string;
  referenceId?: mongoose.Types.ObjectId;
  referenceModel?: string;
  notes?: string;
  warehouse: string;
  toWarehouse?: string;
  performedBy: mongoose.Types.ObjectId;
}

const inventoryTransactionSchema = new Schema<IInventoryTransaction>(
  {
    type: { type: String, enum: Object.values(InventoryTransactionType), required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    previousStock: { type: Number, required: true },
    newStock: { type: Number, required: true },
    unitCost: { type: Number },
    totalCost: { type: Number },
    reference: { type: String },
    referenceId: { type: Schema.Types.ObjectId },
    referenceModel: { type: String },
    notes: { type: String },
    warehouse: { type: String, default: 'main' },
    toWarehouse: { type: String },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

inventoryTransactionSchema.index({ product: 1, createdAt: -1 });
inventoryTransactionSchema.index({ type: 1, createdAt: -1 });

export const InventoryTransaction = mongoose.model<IInventoryTransaction>(
  'InventoryTransaction',
  inventoryTransactionSchema
);
