import mongoose, { Document, Schema } from 'mongoose';

export enum OrderStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

export interface IOrderItem {
  product: mongoose.Types.ObjectId;
  productName: string;
  sku: string;
  quantity: number;
  deliveredQuantity: number;
  unitPrice: number;
  total: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  customer: mongoose.Types.ObjectId;
  items: IOrderItem[];
  status: OrderStatus;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  deliveryDate?: Date;
  notes?: string;
  sale?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
}

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: { type: String, required: true, unique: true, uppercase: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
        productName: { type: String, required: true },
        sku: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        deliveredQuantity: { type: Number, default: 0, min: 0 },
        unitPrice: { type: Number, required: true, min: 0 },
        total: { type: Number, required: true },
      },
    ],
    status: { type: String, enum: Object.values(OrderStatus), default: OrderStatus.PENDING },
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    deliveryDate: { type: Date },
    notes: { type: String },
    sale: { type: Schema.Types.ObjectId, ref: 'Sale' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export const Order = mongoose.model<IOrder>('Order', orderSchema);
