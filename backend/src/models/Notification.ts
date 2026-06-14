import mongoose, { Document, Schema } from 'mongoose';

export enum NotificationType {
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
  PENDING_PAYMENT = 'pending_payment',
  PENDING_ORDER = 'pending_order',
  PURCHASE_REMINDER = 'purchase_reminder',
  EXPIRY = 'expiry',
  SYSTEM = 'system',
}

export interface INotification extends Document {
  type: NotificationType;
  title: string;
  message: string;
  user?: mongoose.Types.ObjectId;
  reference?: string;
  referenceId?: mongoose.Types.ObjectId;
  isRead: boolean;
  priority: 'low' | 'medium' | 'high';
}

const notificationSchema = new Schema<INotification>(
  {
    type: { type: String, enum: Object.values(NotificationType), required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    reference: { type: String },
    referenceId: { type: Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);
