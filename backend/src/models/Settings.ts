import mongoose, { Document, Schema } from 'mongoose';

export interface ISettings extends Document {
  key: string;
  value: unknown;
  group: string;
  description?: string;
}

const settingsSchema = new Schema<ISettings>(
  {
    key: { type: String, required: true, unique: true },
    value: { type: Schema.Types.Mixed, required: true },
    group: { type: String, default: 'general' },
    description: { type: String },
  },
  { timestamps: true }
);

export const Settings = mongoose.model<ISettings>('Settings', settingsSchema);

export const DEFAULT_SETTINGS = [
  { key: 'company_name', value: 'ABC SALES', group: 'company' },
  { key: 'company_address', value: '', group: 'company' },
  { key: 'company_phone', value: '', group: 'company' },
  { key: 'company_gst', value: '', group: 'company' },
  { key: 'tax_rate', value: 0, group: 'billing' },
  { key: 'currency', value: 'INR', group: 'billing' },
  { key: 'invoice_prefix', value: 'INV', group: 'billing' },
  { key: 'po_prefix', value: 'PO', group: 'billing' },
  { key: 'order_prefix', value: 'ORD', group: 'billing' },
  { key: 'low_stock_alert', value: true, group: 'inventory' },
  { key: 'barcode_prefix', value: '890', group: 'inventory' },
  { key: 'dark_mode', value: false, group: 'ui' },
];
