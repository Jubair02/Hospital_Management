import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export const DEPARTMENT_STATUSES = ['active', 'inactive'] as const;
export type DepartmentStatus = (typeof DEPARTMENT_STATUSES)[number];

export interface IDepartment {
  departmentId: string;
  name: string;
  description?: string;
  status: DepartmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type DepartmentDocument = HydratedDocument<IDepartment>;

const departmentSchema = new Schema<IDepartment>(
  {
    departmentId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    name: {
      type: String,
      required: [true, 'Department name is required'],
      unique: true,
      trim: true,
      maxlength: [100, 'Department name cannot exceed 100 characters'],
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
        values: DEPARTMENT_STATUSES as unknown as string[],
        message: `Status must be one of: ${DEPARTMENT_STATUSES.join(', ')}`,
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

const Department: Model<IDepartment> = mongoose.model<IDepartment>(
  'Department',
  departmentSchema
);

export default Department;
