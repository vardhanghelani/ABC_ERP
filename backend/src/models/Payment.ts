import mongoose, { Document, Schema } from 'mongoose';
import { PaymentMethod } from './Sale';

export enum PaymentType {
  RECEIPT = 'receipt',
  PAYMENT = 'payment',
}

export enum PaymentEntity {
  CUSTOMER = 'customer',
  SUPPLIER = 'supplier',
  EXPENSE = 'expense',
  INCOME = 'income',
}

export interface IPaymentAllocation {
  sale?: mongoose.Types.ObjectId;
  purchase?: mongoose.Types.ObjectId;
  invoiceNumber: string;
  amount: number;
}

export interface IPayment extends Document {
  paymentNumber: string;
  type: PaymentType;
  entity: PaymentEntity;
  customer?: mongoose.Types.ObjectId;
  supplier?: mongoose.Types.ObjectId;
  sale?: mongoose.Types.ObjectId;
  purchase?: mongoose.Types.ObjectId;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  bankName?: string;
  chequeNumber?: string;
  upiTransactionId?: string;
  attachmentUrl?: string;
  allocations: IPaymentAllocation[];
  isAdvance: boolean;
  notes?: string;
  date: Date;
  createdBy: mongoose.Types.ObjectId;
  isVoided: boolean;
  voidReason?: string;
}

const paymentSchema = new Schema<IPayment>(
  {
    paymentNumber: { type: String, required: true, unique: true, uppercase: true },
    type: { type: String, enum: Object.values(PaymentType), required: true },
    entity: { type: String, enum: Object.values(PaymentEntity), required: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    sale: { type: Schema.Types.ObjectId, ref: 'Sale' },
    purchase: { type: Schema.Types.ObjectId, ref: 'Purchase' },
    amount: { type: Number, required: true, min: 0 },
    method: { type: String, enum: Object.values(PaymentMethod), required: true },
    reference: { type: String },
    bankName: { type: String },
    chequeNumber: { type: String },
    upiTransactionId: { type: String },
    attachmentUrl: { type: String },
    allocations: [
      {
        sale: { type: Schema.Types.ObjectId, ref: 'Sale' },
        purchase: { type: Schema.Types.ObjectId, ref: 'Purchase' },
        invoiceNumber: { type: String },
        amount: { type: Number, min: 0 },
      },
    ],
    isAdvance: { type: Boolean, default: false },
    notes: { type: String },
    date: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isVoided: { type: Boolean, default: false },
    voidReason: { type: String },
  },
  { timestamps: true }
);

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
