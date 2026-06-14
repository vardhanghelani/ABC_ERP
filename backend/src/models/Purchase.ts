import mongoose, { Document, Schema } from 'mongoose';

export enum PurchaseStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  PARTIAL = 'partial',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

export interface IPurchaseItem {
  product: mongoose.Types.ObjectId;
  productName: string;
  sku: string;
  quantity: number;
  receivedQuantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface IPurchase extends Document {
  poNumber: string;
  supplier: mongoose.Types.ObjectId;
  items: IPurchaseItem[];
  status: PurchaseStatus;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paidAmount: number;
  billNumber?: string;
  billDate?: Date;
  expectedDate?: Date;
  notes?: string;
  createdBy: mongoose.Types.ObjectId;
}

const purchaseSchema = new Schema<IPurchase>(
  {
    poNumber: { type: String, required: true, unique: true, uppercase: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        productName: { type: String, required: true },
        sku: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        receivedQuantity: { type: Number, default: 0, min: 0 },
        unitPrice: { type: Number, required: true, min: 0 },
        totalPrice: { type: Number, required: true, min: 0 },
      },
    ],
    status: { type: String, enum: Object.values(PurchaseStatus), default: PurchaseStatus.PENDING },
    subtotal: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    billNumber: { type: String },
    billDate: { type: Date },
    expectedDate: { type: Date },
    notes: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Purchase = mongoose.model<IPurchase>('Purchase', purchaseSchema);
