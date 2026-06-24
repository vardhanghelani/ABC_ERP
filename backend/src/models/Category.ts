import mongoose, { Document, Schema } from 'mongoose';

export interface ICategory extends Document {
  name: string;
  code: string;
  barcodePrefix: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  createdBy: mongoose.Types.ObjectId;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    barcodePrefix: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
      validate: {
        validator: (value: string) => !value || /^[A-Z]{3}$/.test(value),
        message: 'Barcode prefix must be exactly 3 uppercase letters',
      },
    },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

categorySchema.index({ name: 'text', code: 'text' });

export const Category = mongoose.model<ICategory>('Category', categorySchema);
