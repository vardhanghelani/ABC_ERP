import mongoose, { Document, Schema } from 'mongoose';

export interface IProduct extends Document {
  sku: string;
  name: string;
  category: mongoose.Types.ObjectId;
  brand?: string;
  images: { url: string; publicId: string; isPrimary: boolean }[];
  description?: string;
  attributes: Map<string, unknown>;
  currentStock: number;
  minStock: number;
  reorderLevel: number;
  purchasePrice: number;
  wholesalePrice: number;
  retailPrice: number;
  /** Minimum sale quantity step in pieces (e.g. 1000 for 1K packet). */
  minimumBunch: number;
  /** Counter selling price per piece (used in POS). */
  sellingPrice: number;
  barcode: string;
  qrCode?: string;
  status: 'active' | 'inactive';
  supplier?: mongoose.Types.ObjectId;
  warehouse?: string;
  unitType?: string;
  createdBy: mongoose.Types.ObjectId;
}

const productSchema = new Schema<IProduct>(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    brand: { type: String, trim: true },
    images: [
      {
        url: { type: String, required: true },
        publicId: { type: String, required: true },
        isPrimary: { type: Boolean, default: false },
      },
    ],
    description: { type: String },
    attributes: { type: Map, of: Schema.Types.Mixed, default: {} },
    currentStock: { type: Number, default: 0, min: 0 },
    minStock: { type: Number, default: 0, min: 0 },
    reorderLevel: { type: Number, default: 0, min: 0 },
    purchasePrice: { type: Number, default: 0, min: 0 },
    wholesalePrice: { type: Number, default: 0, min: 0 },
    retailPrice: { type: Number, default: 0, min: 0 },
    minimumBunch: { type: Number, default: 1, min: 1 },
    sellingPrice: { type: Number, default: 0, min: 0 },
    barcode: { type: String, unique: true, sparse: true },
    qrCode: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier' },
    warehouse: { type: String, default: 'main' },
    unitType: { type: String, default: 'piece' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

productSchema.index({ name: 'text', sku: 'text', barcode: 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ currentStock: 1 });

export const Product = mongoose.model<IProduct>('Product', productSchema);
