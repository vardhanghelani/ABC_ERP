import mongoose, { Document, Schema } from 'mongoose';

export interface IPosUserSaleLock extends Document {
  userId: mongoose.Types.ObjectId;
  idempotencyKey: string;
  lockedAt: Date;
  expiresAt: Date;
}

const posUserSaleLockSchema = new Schema<IPosUserSaleLock>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    idempotencyKey: { type: String, required: true },
    lockedAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: false }
);

posUserSaleLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PosUserSaleLock = mongoose.model<IPosUserSaleLock>('PosUserSaleLock', posUserSaleLockSchema);
