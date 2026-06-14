import mongoose, { Document, Schema } from 'mongoose';

export interface IExpense extends Document {
  entryNumber: string;
  reason: string;
  amount: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
  {
    entryNumber: { type: String, required: true, unique: true, uppercase: true },
    reason: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

expenseSchema.index({ createdAt: -1 });

export const Expense = mongoose.model<IExpense>('Expense', expenseSchema);
