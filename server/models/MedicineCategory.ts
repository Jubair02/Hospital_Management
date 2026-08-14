import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export const CATEGORY_STATUSES = ['active', 'inactive'] as const;
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];

export interface IMedicineCategory {
  categoryId: string;
  name: string;
  description?: string;
  status: CategoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type MedicineCategoryDocument = HydratedDocument<IMedicineCategory>;

const categorySchema = new Schema<IMedicineCategory>(
  {
    categoryId: { type: String, required: true, unique: true, immutable: true },
    name: {
      type: String,
      required: [true, 'Category name is required'],
      unique: true,
      trim: true,
      maxlength: [100, 'Category name cannot exceed 100 characters'],
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
        values: CATEGORY_STATUSES as unknown as string[],
        message: `Status must be one of: ${CATEGORY_STATUSES.join(', ')}`,
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

const MedicineCategory: Model<IMedicineCategory> = mongoose.model<IMedicineCategory>(
  'MedicineCategory',
  categorySchema
);

export default MedicineCategory;
