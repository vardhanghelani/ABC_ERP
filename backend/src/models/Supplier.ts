import mongoose, { Document, Schema } from 'mongoose';
import { RiskCategory } from './Customer';

export interface ISupplier extends Document {
  name: string;
  code?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone: string;
  email?: string;
  whatsapp?: string;
  contactPerson?: string;
  creditLimit: number;
  creditDays: number;
  outstandingAmount: number;
  advanceBalance: number;
  totalPurchases: number;
  totalPayments: number;
  lastPurchaseDate?: Date;
  lastPaymentDate?: Date;
  riskCategory: RiskCategory;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const supplierSchema = new Schema<ISupplier>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, unique: true, sparse: true, uppercase: true },
    gstNumber: { type: String, trim: true, uppercase: true },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    phone: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    whatsapp: { type: String, trim: true },
    contactPerson: { type: String },
    creditLimit: { type: Number, default: 0, min: 0 },
    creditDays: { type: Number, default: 30, min: 0 },
    outstandingAmount: { type: Number, default: 0 },
    advanceBalance: { type: Number, default: 0, min: 0 },
    totalPurchases: { type: Number, default: 0, min: 0 },
    totalPayments: { type: Number, default: 0, min: 0 },
    lastPurchaseDate: { type: Date },
    lastPaymentDate: { type: Date },
    riskCategory: { type: String, enum: Object.values(RiskCategory), default: RiskCategory.LOW },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

supplierSchema.index({ name: 'text', phone: 'text' });

export const Supplier = mongoose.model<ISupplier>('Supplier', supplierSchema);
