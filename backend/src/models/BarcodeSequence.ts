import mongoose, { Document, Schema } from 'mongoose';

export interface IBarcodeSequence extends Document {
  prefix: string;
  lastValue: number;
}

const barcodeSequenceSchema = new Schema<IBarcodeSequence>(
  {
    prefix: { type: String, required: true, unique: true, uppercase: true, trim: true },
    lastValue: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true }
);

export const BarcodeSequence = mongoose.model<IBarcodeSequence>('BarcodeSequence', barcodeSequenceSchema);
