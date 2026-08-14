import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const RESULT_STATUSES = ['pending', 'processing', 'completed', 'verified'] as const;
export type LabResultStatus = (typeof RESULT_STATUSES)[number];

/**
 * One result per ordered test, created with the order. Lifecycle:
 * pending → processing (sample collected) → completed (value entered by
 * staff) → verified (locked). Verified results are immutable.
 */
export interface ILabResult {
  resultId: string;
  orderId: Types.ObjectId;
  testId: Types.ObjectId;
  patientId: Types.ObjectId;
  /** Snapshot of the test name at order time. */
  testName: string;
  value?: string;
  unit?: string;
  referenceRange?: string;
  interpretation?: string;
  notes?: string;
  performedBy?: Types.ObjectId;
  verifiedBy?: Types.ObjectId;
  performedAt?: Date;
  verifiedAt?: Date;
  status: LabResultStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type LabResultDocument = HydratedDocument<ILabResult>;

const bounded = (max: number) => ({
  type: String,
  trim: true,
  maxlength: [max, `Value cannot exceed ${max} characters`] as [number, string],
});

const labResultSchema = new Schema<ILabResult>(
  {
    resultId: { type: String, required: true, unique: true, immutable: true },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'LabOrder',
      required: true,
      immutable: true,
      index: true,
    },
    testId: {
      type: Schema.Types.ObjectId,
      ref: 'LabTest',
      required: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      immutable: true,
      index: true,
    },
    testName: { type: String, required: true, trim: true, maxlength: 200 },
    value: bounded(500),
    unit: bounded(50),
    referenceRange: bounded(200),
    interpretation: bounded(1000),
    notes: bounded(1000),
    performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    performedAt: { type: Date },
    verifiedAt: { type: Date },
    status: {
      type: String,
      default: 'pending',
      enum: {
        values: RESULT_STATUSES as unknown as string[],
        message: `Status must be one of: ${RESULT_STATUSES.join(', ')}`,
      },
      index: true,
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

const LabResult: Model<ILabResult> = mongoose.model<ILabResult>('LabResult', labResultSchema);

export default LabResult;
