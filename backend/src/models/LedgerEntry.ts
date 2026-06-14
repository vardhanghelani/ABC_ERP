import mongoose, { Document, Schema } from 'mongoose';

export enum LedgerEntityType {
  CUSTOMER = 'customer',
  SUPPLIER = 'supplier',
}

export enum LedgerTransactionType {
  OPENING_BALANCE = 'opening_balance',
  SALES_INVOICE = 'sales_invoice',
  SALES_RETURN = 'sales_return',
  PAYMENT_RECEIVED = 'payment_received',
  PAYMENT_MADE = 'payment_made',
  DISCOUNT_GIVEN = 'discount_given',
  CREDIT_NOTE = 'credit_note',
  DEBIT_NOTE = 'debit_note',
  MANUAL_ADJUSTMENT = 'manual_adjustment',
  BAD_DEBT = 'bad_debt',
  OPENING_BALANCE_CORRECTION = 'opening_balance_correction',
  ADVANCE_PAYMENT = 'advance_payment',
  ADVANCE_ADJUSTMENT = 'advance_adjustment',
  LONG_TERM_INVOICE = 'long_term_invoice',
  PURCHASE_INVOICE = 'purchase_invoice',
  PURCHASE_RETURN = 'purchase_return',
}

export interface ILedgerEntry extends Document {
  entityType: LedgerEntityType;
  entityId: mongoose.Types.ObjectId;
  date: Date;
  referenceNumber: string;
  transactionType: LedgerTransactionType;
  debit: number;
  credit: number;
  runningBalance: number;
  remarks?: string;
  referenceId?: mongoose.Types.ObjectId;
  referenceModel?: string;
  createdBy: mongoose.Types.ObjectId;
  createdByName: string;
  isVoided: boolean;
  voidReason?: string;
  voidedBy?: mongoose.Types.ObjectId;
  voidedAt?: Date;
  editHistory: {
    editedBy: mongoose.Types.ObjectId;
    editedAt: Date;
    oldValues: Record<string, unknown>;
    reason?: string;
  }[];
}

const ledgerEntrySchema = new Schema<ILedgerEntry>(
  {
    entityType: { type: String, enum: Object.values(LedgerEntityType), required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    date: { type: Date, required: true, default: Date.now },
    referenceNumber: { type: String, required: true },
    transactionType: { type: String, enum: Object.values(LedgerTransactionType), required: true },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    runningBalance: { type: Number, required: true },
    remarks: { type: String },
    referenceId: { type: Schema.Types.ObjectId },
    referenceModel: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdByName: { type: String, required: true },
    isVoided: { type: Boolean, default: false },
    voidReason: { type: String },
    voidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    voidedAt: { type: Date },
    editHistory: [
      {
        editedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        editedAt: { type: Date },
        oldValues: { type: Schema.Types.Mixed },
        reason: { type: String },
      },
    ],
  },
  { timestamps: true }
);

ledgerEntrySchema.index({ entityType: 1, entityId: 1, date: 1, createdAt: 1 });
ledgerEntrySchema.index({ referenceNumber: 1 });
ledgerEntrySchema.index({ isVoided: 1 });

export const LedgerEntry = mongoose.model<ILedgerEntry>('LedgerEntry', ledgerEntrySchema);
