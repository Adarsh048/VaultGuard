import mongoose, { Document, Schema, Types } from 'mongoose';

export type IncidentSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type IncidentStatus = 'Open' | 'Investigating' | 'Resolved' | 'Closed';

export interface IInvestigationNote {
  text: string;
  author: string;
  timestamp: Date;
}

export interface IIncident extends Document {
  incidentId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  relatedUserId: Types.ObjectId | null;
  relatedAccountId: Types.ObjectId | null;
  status: IncidentStatus;
  assignedTo: Types.ObjectId | null;
  investigationNotes: IInvestigationNote[];
  resolutionDetails: string;
  createdAt: Date;
  updatedAt: Date;
}

const IncidentSchema = new Schema<IIncident>(
  {
    incidentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    severity: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
      index: true,
    },
    relatedUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    relatedAccountId: {
      type: Schema.Types.ObjectId,
      ref: 'PrivilegedAccount',
      default: null,
    },
    status: {
      type: String,
      enum: ['Open', 'Investigating', 'Resolved', 'Closed'],
      default: 'Open',
      index: true,
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    investigationNotes: [
      {
        text: { type: String, required: true },
        author: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    resolutionDetails: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

export const Incident = mongoose.model<IIncident>('Incident', IncidentSchema);

