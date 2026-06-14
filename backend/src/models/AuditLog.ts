import mongoose, { Document, Schema } from 'mongoose';

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  STOCK_CHANGE = 'stock_change',
  INVOICE = 'invoice',
}

export interface IAuditLog extends Document {
  action: AuditAction;
  entity: string;
  entityId?: mongoose.Types.ObjectId;
  user: mongoose.Types.ObjectId;
  userName: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  description?: string;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    action: { type: String, enum: Object.values(AuditAction), required: true },
    entity: { type: String, required: true },
    entityId: { type: Schema.Types.ObjectId },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    changes: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
    description: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ entity: 1, createdAt: -1 });
auditLogSchema.index({ user: 1, createdAt: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
