import mongoose, { Document, Schema } from 'mongoose';

export enum IdempotencyStatus {
  PROCESSING = 'processing',
  COMPLETED = 'completed',
}

export interface IIdempotencyRecord extends Document {
  key: string;
  userId: mongoose.Types.ObjectId;
  scope: string;
  status: IdempotencyStatus;
  saleId?: mongoose.Types.ObjectId;
  createdAt: Date;
  expiresAt: Date;
}

const idempotencyRecordSchema = new Schema<IIdempotencyRecord>(
  {
    key: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    scope: { type: String, required: true, default: 'sale' },
    status: { type: String, enum: Object.values(IdempotencyStatus), required: true },
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

idempotencyRecordSchema.index({ key: 1, userId: 1, scope: 1 }, { unique: true });
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyRecord = mongoose.model<IIdempotencyRecord>(
  'IdempotencyRecord',
  idempotencyRecordSchema
);
