import mongoose, { Document, Schema, Types } from 'mongoose';

export type AccountType =
  | 'Windows Administrator'
  | 'Linux Root'
  | 'Service Account'
  | 'Database Administrator';

export type RotationStatus = 'synced' | 'pending' | 'failed';

export interface IPrivilegedAccount extends Document {
  accountName: string;
  username: string;
  accountType: AccountType;
  hostname: string;
  ownerId: Types.ObjectId;
  description: string;
  vaultSecretPath: string;
  rotationStatus: RotationStatus;
  lastRotationAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PrivilegedAccountSchema = new Schema<IPrivilegedAccount>(
  {
    accountName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      trim: true,
    },
    accountType: {
      type: String,
      enum: [
        'Windows Administrator',
        'Linux Root',
        'Service Account',
        'Database Administrator',
      ],
      required: true,
      index: true,
    },
    hostname: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    vaultSecretPath: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    rotationStatus: {
      type: String,
      enum: ['synced', 'pending', 'failed'],
      default: 'synced',
    },
    lastRotationAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const PrivilegedAccount = mongoose.model<IPrivilegedAccount>(
  'PrivilegedAccount',
  PrivilegedAccountSchema
);

