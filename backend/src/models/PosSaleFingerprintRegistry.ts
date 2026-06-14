import mongoose, { Document, Schema } from 'mongoose';

export interface IPosSaleFingerprintRegistry extends Document {
  userId: mongoose.Types.ObjectId;
  fingerprint: string;
  saleId: mongoose.Types.ObjectId;
  expiresAt: Date;
}

const posSaleFingerprintRegistrySchema = new Schema<IPosSaleFingerprintRegistry>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fingerprint: { type: String, required: true },
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

posSaleFingerprintRegistrySchema.index({ userId: 1, fingerprint: 1 }, { unique: true });
posSaleFingerprintRegistrySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PosSaleFingerprintRegistry = mongoose.model<IPosSaleFingerprintRegistry>(
  'PosSaleFingerprintRegistry',
  posSaleFingerprintRegistrySchema
);
