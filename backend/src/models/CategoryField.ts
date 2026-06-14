import mongoose, { Document, Schema } from 'mongoose';

export enum FieldType {
  TEXT = 'text',
  /** Whole numbers only (e.g. naka count, pieces) */
  INTEGER = 'integer',
  /** Decimal numbers (e.g. weight, length in mm) */
  DECIMAL = 'decimal',
  /** @deprecated use INTEGER or DECIMAL */
  NUMBER = 'number',
  DROPDOWN = 'dropdown',
  MULTI_SELECT = 'multiselect',
  COLOR = 'color',
  DATE = 'date',
  BOOLEAN = 'boolean',
}

export interface ICategoryField extends Document {
  category: mongoose.Types.ObjectId;
  name: string;
  key: string;
  fieldType: FieldType;
  options: string[];
  required: boolean;
  sortOrder: number;
  placeholder?: string;
  defaultValue?: unknown;
  isActive: boolean;
}

const categoryFieldSchema = new Schema<ICategoryField>(
  {
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true, trim: true },
    fieldType: {
      type: String,
      enum: Object.values(FieldType),
      required: true,
    },
    options: [{ type: String }],
    required: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    placeholder: { type: String },
    defaultValue: { type: Schema.Types.Mixed },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

categoryFieldSchema.index({ category: 1, key: 1 }, { unique: true });

export const CategoryField = mongoose.model<ICategoryField>('CategoryField', categoryFieldSchema);
