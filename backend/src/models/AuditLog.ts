import mongoose, { Document, Schema, Types } from 'mongoose';

export type AuditResult = 'SUCCESS' | 'FAILURE' | 'DENIED';

export interface IAuditLog extends Document {
  userId: Types.ObjectId | null;
  username: string;
  action: string;
  accountId: Types.ObjectId | null;
  result: AuditResult;
  ipAddress: string;
  metadata: Record<string, any>;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    username: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PrivilegedAccount',
      default: null,
      index: true,
    },
    result: {
      type: String,
      enum: ['SUCCESS', 'FAILURE', 'DENIED'],
      required: true,
      index: true,
    },
    ipAddress: {
      type: String,
      default: '127.0.0.1',
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Index for audit filtering and chronological sorting
AuditLogSchema.index({ timestamp: -1, action: 1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

