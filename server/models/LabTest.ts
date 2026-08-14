import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const SAMPLE_TYPES = ['blood', 'urine', 'stool', 'saliva', 'swab', 'other'] as const;
export type SampleType = (typeof SAMPLE_TYPES)[number];

export const RESULT_TYPES = ['numeric', 'text', 'positive_negative'] as const;
export type ResultType = (typeof RESULT_TYPES)[number];

export const LAB_TEST_STATUSES = ['active', 'inactive'] as const;
export type LabTestStatus = (typeof LAB_TEST_STATUSES)[number];

export interface ILabTest {
  testId: string;
  name: string;
  category: Types.ObjectId;
  description?: string;
  sampleType: SampleType;
  preparationInstructions?: string;
  price: number;
  /** Free text like "24 hours" or "3 days". */
  turnaroundTime?: string;
  /** How results are captured and validated. */
  resultType: ResultType;
  unit?: string;
  /** Reference range belongs to the test configuration (not hard-coded). */
  referenceRange?: string;
  status: LabTestStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type LabTestDocument = HydratedDocument<ILabTest>;

const bounded = (max: number) => ({
  type: String,
  trim: true,
  maxlength: [max, `Value cannot exceed ${max} characters`] as [number, string],
});

const labTestSchema = new Schema<ILabTest>(
  {
    testId: { type: String, required: true, unique: true, immutable: true },
    name: {
      type: String,
      required: [true, 'Test name is required'],
      trim: true,
      maxlength: [200, 'Test name cannot exceed 200 characters'],
      index: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'LabCategory',
      required: [true, 'Category is required'],
      index: true,
    },
    description: bounded(1000),
    sampleType: {
      type: String,
      required: [true, 'Sample type is required'],
      enum: {
        values: SAMPLE_TYPES as unknown as string[],
        message: `Sample type must be one of: ${SAMPLE_TYPES.join(', ')}`,
      },
    },
    preparationInstructions: bounded(1000),
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    turnaroundTime: bounded(100),
    resultType: {
      type: String,
      default: 'numeric',
      enum: {
        values: RESULT_TYPES as unknown as string[],
        message: `Result type must be one of: ${RESULT_TYPES.join(', ')}`,
      },
    },
    unit: bounded(50),
    referenceRange: bounded(200),
    status: {
      type: String,
      default: 'active',
      enum: {
        values: LAB_TEST_STATUSES as unknown as string[],
        message: `Status must be one of: ${LAB_TEST_STATUSES.join(', ')}`,
      },
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

const LabTest: Model<ILabTest> = mongoose.model<ILabTest>('LabTest', labTestSchema);

export default LabTest;
