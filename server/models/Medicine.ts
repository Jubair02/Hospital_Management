import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const MEDICINE_STATUSES = ['active', 'inactive'] as const;
export type MedicineStatus = (typeof MEDICINE_STATUSES)[number];

export interface IMedicine {
  medicineId: string;
  name: string;
  genericName?: string;
  brandName?: string;
  category: Types.ObjectId;
  dosageForm: string;
  strength?: string;
  manufacturer?: string;
  prescriptionRequired: boolean;
  /** Total usable stock below this marks the medicine as low stock. */
  reorderLevel: number;
  status: MedicineStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type MedicineDocument = HydratedDocument<IMedicine>;

const bounded = (max: number) => ({
  type: String,
  trim: true,
  maxlength: [max, `Value cannot exceed ${max} characters`] as [number, string],
});

const medicineSchema = new Schema<IMedicine>(
  {
    medicineId: { type: String, required: true, unique: true, immutable: true },
    name: {
      type: String,
      required: [true, 'Medicine name is required'],
      trim: true,
      maxlength: [200, 'Medicine name cannot exceed 200 characters'],
      index: true,
    },
    genericName: bounded(200),
    brandName: bounded(200),
    category: {
      type: Schema.Types.ObjectId,
      ref: 'MedicineCategory',
      required: [true, 'Category is required'],
      index: true,
    },
    dosageForm: {
      type: String,
      required: [true, 'Dosage form is required'],
      trim: true,
      maxlength: [50, 'Dosage form cannot exceed 50 characters'],
    },
    strength: bounded(100),
    manufacturer: bounded(200),
    prescriptionRequired: { type: Boolean, default: true },
    reorderLevel: {
      type: Number,
      default: 10,
      min: [0, 'Reorder level cannot be negative'],
    },
    status: {
      type: String,
      default: 'active',
      enum: {
        values: MEDICINE_STATUSES as unknown as string[],
        message: `Status must be one of: ${MEDICINE_STATUSES.join(', ')}`,
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

const Medicine: Model<IMedicine> = mongoose.model<IMedicine>('Medicine', medicineSchema);

export default Medicine;
