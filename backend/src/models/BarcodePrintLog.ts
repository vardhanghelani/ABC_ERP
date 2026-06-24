import mongoose, { Document, Schema } from 'mongoose';
import type { LabelOutputFormat, LabelTemplateId, PrinterProfileId } from './PrintJob';

export enum BarcodePrintAction {
  PRINT = 'print',
  REPRINT = 'reprint',
  CALIBRATION = 'calibration',
}

export interface IBarcodePrintLog extends Document {
  printJob: mongoose.Types.ObjectId;
  product?: mongoose.Types.ObjectId;
  barcode: string;
  productName: string;
  sku: string;
  copies: number;
  template: LabelTemplateId;
  format: LabelOutputFormat;
  printerProfile: PrinterProfileId;
  action: BarcodePrintAction;
  user: mongoose.Types.ObjectId;
  userName: string;
  previousLogId?: mongoose.Types.ObjectId;
}

const barcodePrintLogSchema = new Schema<IBarcodePrintLog>(
  {
    printJob: { type: Schema.Types.ObjectId, ref: 'PrintJob', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product' },
    barcode: { type: String, required: true, trim: true },
    productName: { type: String, required: true, trim: true },
    sku: { type: String, default: '', trim: true },
    copies: { type: Number, required: true, min: 1, default: 1 },
    template: {
      type: String,
      enum: ['25x15', '40x20', '50x25', '75x50'],
      required: true,
    },
    format: { type: String, enum: ['pdf', 'png', 'zpl', 'tspl'], required: true },
    printerProfile: { type: String, enum: ['zebra', 'tsc', 'tvs', 'generic'], required: true },
    action: { type: String, enum: Object.values(BarcodePrintAction), required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    previousLogId: { type: Schema.Types.ObjectId, ref: 'BarcodePrintLog' },
  },
  { timestamps: true }
);

barcodePrintLogSchema.index({ printJob: 1 });
barcodePrintLogSchema.index({ product: 1, createdAt: -1 });
barcodePrintLogSchema.index({ barcode: 1, createdAt: -1 });
barcodePrintLogSchema.index({ user: 1, createdAt: -1 });
barcodePrintLogSchema.index({ createdAt: -1 });

export const BarcodePrintLog = mongoose.model<IBarcodePrintLog>('BarcodePrintLog', barcodePrintLogSchema);
