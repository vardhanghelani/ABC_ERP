import mongoose, { Document, Schema } from 'mongoose';

export enum CustomerType {
  RETAIL = 'retail',
  WHOLESALE = 'wholesale',
  DISTRIBUTOR = 'distributor',
}

/** Short Term = invoice credit with due date. Long Term (ACC) = running account, bill always goes on credit. */
export enum CreditTermType {
  SHORT_TERM = 'short_term',
  LONG_TERM = 'long_term',
}

export enum RiskCategory {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  VERY_HIGH = 'very_high',
}

export enum BadDebtStatus {
  NONE = 'none',
  BAD_DEBT = 'bad_debt',
  WRITTEN_OFF = 'written_off',
  RECOVERED = 'recovered',
}

export interface ICustomerNote {
  text: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
}

export interface ICustomer extends Document {
  name: string;
  code?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  customerType: CustomerType;
  creditTermType: CreditTermType;
  creditLimit: number;
  creditDays: number;
  outstandingAmount: number;
  advanceBalance: number;
  totalPurchases: number;
  totalPayments: number;
  lastPurchaseDate?: Date;
  lastPaymentDate?: Date;
  riskCategory: RiskCategory;
  riskScore: number;
  badDebtStatus: BadDebtStatus;
  blockOnCreditLimit: boolean;
  notes: ICustomerNote[];
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
}

const customerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, unique: true, sparse: true, uppercase: true },
    gstNumber: { type: String, trim: true, uppercase: true },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    pincode: { type: String },
    phone: { type: String, required: true, trim: true },
    whatsapp: { type: String, trim: true },
    email: { type: String, lowercase: true, trim: true },
    customerType: { type: String, enum: Object.values(CustomerType), default: CustomerType.WHOLESALE },
    creditTermType: { type: String, enum: Object.values(CreditTermType), default: CreditTermType.SHORT_TERM },
    creditLimit: { type: Number, default: 0, min: 0 },
    creditDays: { type: Number, default: 30, min: 0 },
    outstandingAmount: { type: Number, default: 0 },
    advanceBalance: { type: Number, default: 0, min: 0 },
    totalPurchases: { type: Number, default: 0, min: 0 },
    totalPayments: { type: Number, default: 0, min: 0 },
    lastPurchaseDate: { type: Date },
    lastPaymentDate: { type: Date },
    riskCategory: { type: String, enum: Object.values(RiskCategory), default: RiskCategory.LOW },
    riskScore: { type: Number, default: 0, min: 0, max: 100 },
    badDebtStatus: { type: String, enum: Object.values(BadDebtStatus), default: BadDebtStatus.NONE },
    blockOnCreditLimit: { type: Boolean, default: false },
    notes: [
      {
        text: { type: String, required: true },
        createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

customerSchema.index({ name: 'text', phone: 'text', gstNumber: 'text' });
customerSchema.index({ outstandingAmount: -1 });
customerSchema.index({ riskCategory: 1 });

export const Customer = mongoose.model<ICustomer>('Customer', customerSchema);
