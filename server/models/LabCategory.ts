import mongoose, { Schema, type HydratedDocument, type Model } from 'mongoose';

export const LAB_CATEGORY_STATUSES = ['active', 'inactive'] as const;
export type LabCategoryStatus = (typeof LAB_CATEGORY_STATUSES)[number];

export interface ILabCategory {
  categoryId: string;
  name: string;
  description?: string;
  status: LabCategoryStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type LabCategoryDocument = HydratedDocument<ILabCategory>;

const labCategorySchema = new Schema<ILabCategory>(
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
        values: LAB_CATEGORY_STATUSES as unknown as string[],
        message: `Status must be one of: ${LAB_CATEGORY_STATUSES.join(', ')}`,
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

const LabCategory: Model<ILabCategory> = mongoose.model<ILabCategory>(
  'LabCategory',
  labCategorySchema
);

export default LabCategory;
