import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IRotationHistory extends Document {
  accountId: Types.ObjectId;
  accountName: string;
  rotatedBy: Types.ObjectId;
  status: 'SUCCESS' | 'FAILED';
  targetAccountType: string;
  vaultSecretUpdated: boolean;
  targetPasswordChanged: boolean;
  passwordVerified: boolean;
  reconciliationNotes: string;
  failureReason: string | null;
  timestamp: Date;
}

const RotationHistorySchema = new Schema<IRotationHistory>(
  {
    accountId: {
      type: Schema.Types.ObjectId,
      ref: 'PrivilegedAccount',
      required: true,
      index: true,
    },
    accountName: {
      type: String,
      required: true,
    },
    rotatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['SUCCESS', 'FAILED'],
      required: true,
    },
    targetAccountType: {
      type: String,
      required: true,
    },
    vaultSecretUpdated: {
      type: Boolean,
      default: false,
    },
    targetPasswordChanged: {
      type: Boolean,
      default: false,
    },
    passwordVerified: {
      type: Boolean,
      default: false,
    },
    reconciliationNotes: {
      type: String,
      default: '',
    },
    failureReason: {
      type: String,
      default: null,
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

export const RotationHistory = mongoose.model<IRotationHistory>(
  'RotationHistory',
  RotationHistorySchema
);

