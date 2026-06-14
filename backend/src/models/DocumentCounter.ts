import mongoose, { Document, Schema } from 'mongoose';

export interface IDocumentCounter extends Document {
  key: string;
  seq: number;
}

const documentCounterSchema = new Schema<IDocumentCounter>({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
});

export const DocumentCounter = mongoose.model<IDocumentCounter>('DocumentCounter', documentCounterSchema);
