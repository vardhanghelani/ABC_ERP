import mongoose, { Document, Schema } from 'mongoose';

export enum PaymentMethod {
  CASH = 'cash',
  UPI = 'upi',
  BANK = 'bank',
  CREDIT = 'credit',
  CARD = 'card',
  CHEQUE = 'cheque',
  CREDIT_ADJUSTMENT = 'credit_adjustment',
}

export interface ISaleItem {
  product: mongoose.Types.ObjectId;
  productName: string;
  sku: string;
  barcode?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  total: number;
  attributes?: Record<string, unknown>;
}

export interface ISalePayment {
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export enum SaleStatus {
  COMPLETED = 'completed',
  PENDING = 'pending',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

export interface ISale extends Document {
  invoiceNumber: string;
  customer?: mongoose.Types.ObjectId;
  customerName?: string;
  items: ISaleItem[];
  payments: ISalePayment[];
  subtotal: number;
  discount: number;
  discountType: 'fixed' | 'percentage';
  tax: number;
  taxRate: number;
  roundOff: number;
  total: number;
  paidAmount: number;
  changeAmount: number;
  balanceDue: number;
  dueDate?: Date;
  creditTermType?: string;
  status: SaleStatus;
  notes?: string;
  isPos: boolean;
  idempotencyKey?: string;
  posFingerprint?: string;
  createdBy: mongoose.Types.ObjectId;
}

const saleSchema = new Schema<ISale>(
  {
    invoiceNumber: { type: String, required: true, unique: true, uppercase: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String },
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        productName: { type: String, required: true },
        sku: { type: String, required: true },
        barcode: { type: String },
        quantity: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true, min: 0 },
        discount: { type: Number, default: 0 },
        tax: { type: Number, default: 0 },
        total: { type: Number, required: true },
        attributes: { type: Map, of: Schema.Types.Mixed },
      },
    ],
    payments: [
      {
        method: { type: String, enum: Object.values(PaymentMethod), required: true },
        amount: { type: Number, required: true, min: 0 },
        reference: { type: String },
      },
    ],
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountType: { type: String, enum: ['fixed', 'percentage'], default: 'fixed' },
    tax: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    changeAmount: { type: Number, default: 0 },
    balanceDue: { type: Number, default: 0, min: 0 },
    dueDate: { type: Date },
    creditTermType: { type: String, enum: ['short_term', 'long_term'] },
    status: { type: String, enum: Object.values(SaleStatus), default: SaleStatus.COMPLETED },
    notes: { type: String },
    isPos: { type: Boolean, default: true },
    idempotencyKey: { type: String },
    posFingerprint: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

saleSchema.index({ createdAt: -1 });
saleSchema.index({ customer: 1, balanceDue: 1 });
saleSchema.index({ dueDate: 1, balanceDue: 1 });
saleSchema.index({ createdBy: 1, posFingerprint: 1, createdAt: -1 });
saleSchema.index({ idempotencyKey: 1, createdBy: 1 }, { unique: true, sparse: true });

export const Sale = mongoose.model<ISale>('Sale', saleSchema);
