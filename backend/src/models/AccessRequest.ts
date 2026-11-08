import mongoose, { Document, Schema, Types } from 'mongoose';

export type RequestStatus =
  | 'Pending'
  | 'Approved'
  | 'Rejected'
  | 'Expired'
  | 'Revoked';

export interface IAccessRequest extends Document {
  requesterId: Types.ObjectId;
  accountId: Types.ObjectId;
  justification: string;
  requestedDuration: number; // Duration in minutes
  status: RequestStatus;
  reviewedBy: Types.ObjectId | null;
  approvalComment: string;
  createdAt: Date;
  updatedAt: Date;
}

const AccessRequestSchema = new Schema<IAccessRequest>(
  {
    requesterId: {
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
    justification: {
      type: String,
      required: true,
      trim: true,
    },
    requestedDuration: {
      type: Number,
      required: true,
      min: 5,
      max: 1440, // Max 24 hours
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Expired', 'Revoked'],
      default: 'Pending',
      index: true,
    },
    reviewedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvalComment: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const AccessRequest = mongoose.model<IAccessRequest>(
  'AccessRequest',
  AccessRequestSchema
);

