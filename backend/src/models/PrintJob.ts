import mongoose, { Document, Schema } from 'mongoose';

export enum PrintJobStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum PrintJobSource {
  SINGLE = 'single',
  BATCH = 'batch',
  CATEGORY = 'category',
  INVENTORY = 'inventory',
  REPRINT = 'reprint',
  CALIBRATION = 'calibration',
}

export type LabelTemplateId = '25x15' | '40x20' | '50x25' | '75x50';
export type LabelOutputFormat = 'pdf' | 'png' | 'zpl' | 'tspl';
export type PrinterProfileId = 'zebra' | 'tsc' | 'tvs' | 'generic';

export interface IPrintJob extends Document {
  jobNumber: string;
  status: PrintJobStatus;
  source: PrintJobSource;
  productIds: mongoose.Types.ObjectId[];
  categoryId?: mongoose.Types.ObjectId;
  template: LabelTemplateId;
  format: LabelOutputFormat;
  printerProfile: PrinterProfileId;
  copiesPerLabel: number;
  totalLabels: number;
  processedLabels: number;
  user: mongoose.Types.ObjectId;
  userName: string;
  errorMessage?: string;
  /** Base64 output for PDF/ZPL/TSPL batch or JSON string for PNG array */
  outputPayload?: string;
  outputMimeType?: string;
  reprintOfJobId?: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
}

const printJobSchema = new Schema<IPrintJob>(
  {
    jobNumber: { type: String, required: true, unique: true, uppercase: true, trim: true },
    status: {
      type: String,
      enum: Object.values(PrintJobStatus),
      default: PrintJobStatus.QUEUED,
    },
    source: { type: String, enum: Object.values(PrintJobSource), required: true },
    productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
    categoryId: { type: Schema.Types.ObjectId, ref: 'Category' },
    template: {
      type: String,
      enum: ['25x15', '40x20', '50x25', '75x50'],
      required: true,
    },
    format: { type: String, enum: ['pdf', 'png', 'zpl', 'tspl'], required: true },
    printerProfile: { type: String, enum: ['zebra', 'tsc', 'tvs', 'generic'], required: true },
    copiesPerLabel: { type: Number, required: true, min: 1, max: 99, default: 1 },
    totalLabels: { type: Number, required: true, min: 0, default: 0 },
    processedLabels: { type: Number, default: 0, min: 0 },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    errorMessage: { type: String },
    outputPayload: { type: String },
    outputMimeType: { type: String },
    reprintOfJobId: { type: Schema.Types.ObjectId, ref: 'PrintJob' },
    metadata: { type: Schema.Types.Mixed },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

printJobSchema.index({ status: 1, createdAt: -1 });
printJobSchema.index({ user: 1, createdAt: -1 });

export const PrintJob = mongoose.model<IPrintJob>('PrintJob', printJobSchema);
