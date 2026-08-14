import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { SAMPLE_TYPES, type SampleType } from './LabTest.js';

export const SAMPLE_STATUSES = ['pending', 'collected', 'rejected'] as const;
export type SampleStatus = (typeof SAMPLE_STATUSES)[number];

/**
 * One sample per distinct sample type of an order, created automatically
 * when the order is placed. A rejected sample must carry a reason and
 * permanently blocks result entry for its tests.
 */
export interface ILabSample {
  sampleId: string;
  orderId: Types.ObjectId;
  patientId: Types.ObjectId;
  sampleType: SampleType;
  status: SampleStatus;
  collectedBy?: Types.ObjectId;
  collectedAt?: Date;
  rejectionReason?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type LabSampleDocument = HydratedDocument<ILabSample>;

const labSampleSchema = new Schema<ILabSample>(
  {
    sampleId: { type: String, required: true, unique: true, immutable: true },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'LabOrder',
      required: true,
      immutable: true,
      index: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      immutable: true,
    },
    sampleType: {
      type: String,
      required: true,
      immutable: true,
      enum: {
        values: SAMPLE_TYPES as unknown as string[],
        message: `Sample type must be one of: ${SAMPLE_TYPES.join(', ')}`,
      },
    },
    status: {
      type: String,
      default: 'pending',
      enum: {
        values: SAMPLE_STATUSES as unknown as string[],
        message: `Status must be one of: ${SAMPLE_STATUSES.join(', ')}`,
      },
      index: true,
    },
    collectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    collectedAt: { type: Date },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: [500, 'Rejection reason cannot exceed 500 characters'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, 'Notes cannot exceed 500 characters'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

const LabSample: Model<ILabSample> = mongoose.model<ILabSample>('LabSample', labSampleSchema);

export default LabSample;
