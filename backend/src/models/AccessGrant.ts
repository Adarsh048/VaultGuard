import mongoose, { Document, Schema, Types } from 'mongoose';

export type GrantStatus = 'Active' | 'Expired' | 'Revoked';

export interface IAccessGrant extends Document {
  userId: Types.ObjectId;
  accountId: Types.ObjectId;
  requestId: Types.ObjectId;
  approvedBy: Types.ObjectId;
  expiresAt: Date;
  revokedAt: Date | null;
  status: GrantStatus;
  createdAt: Date;
  updatedAt: Date;
}

const AccessGrantSchema = new Schema<IAccessGrant>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PrivilegedAccount',
      required: true,
      index: true,
    },
    requestId: {
      type: Schema.Types.ObjectId,
      ref: 'AccessRequest',
      required: true,
      unique: true,
      index: true,
    },
    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ['Active', 'Expired', 'Revoked'],
      default: 'Active',
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to quickly find active grants for a user and account
AccessGrantSchema.index({ userId: 1, accountId: 1, status: 1 });

export const AccessGrant = mongoose.model<IAccessGrant>(
  'AccessGrant',
  AccessGrantSchema
);

