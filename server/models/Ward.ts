import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const WARD_TYPES = [
  'general',
  'icu',
  'emergency',
  'pediatric',
  'maternity',
  'surgical',
  'private',
] as const;
export type WardType = (typeof WARD_TYPES)[number];

export const WARD_STATUSES = ['active', 'inactive'] as const;
export type WardStatus = (typeof WARD_STATUSES)[number];

export interface IWard {
  wardId: string;
  name: string;
  type: WardType;
  department?: Types.ObjectId;
  floor?: string;
  description?: string;
  status: WardStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type WardDocument = HydratedDocument<IWard>;

const wardSchema = new Schema<IWard>(
  {
    wardId: { type: String, required: true, unique: true, immutable: true },
    name: {
      type: String,
      required: [true, 'Ward name is required'],
      unique: true,
      trim: true,
      maxlength: [100, 'Ward name cannot exceed 100 characters'],
    },
    type: {
      type: String,
      required: [true, 'Ward type is required'],
      enum: {
        values: WARD_TYPES as unknown as string[],
        message: `Ward type must be one of: ${WARD_TYPES.join(', ')}`,
      },
      index: true,
    },
    department: { type: Schema.Types.ObjectId, ref: 'Department' },
    floor: {
      type: String,
      trim: true,
      maxlength: [50, 'Floor cannot exceed 50 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    status: {
      type: String,
      default: 'active',
      enum: {
        values: WARD_STATUSES as unknown as string[],
        message: `Status must be one of: ${WARD_STATUSES.join(', ')}`,
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

const Ward: Model<IWard> = mongoose.model<IWard>('Ward', wardSchema);

export default Ward;
