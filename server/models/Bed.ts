import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const BED_STATUSES = [
  'available',
  'occupied',
  'reserved',
  'maintenance',
  'inactive',
] as const;
export type BedStatus = (typeof BED_STATUSES)[number];

export interface IBed {
  bedId: string;
  wardId: Types.ObjectId;
  bedNumber: string;
  bedType?: string;
  /**
   * Occupation is claimed with a single atomic guarded update
   * (status: available → occupied), so two concurrent assignments can
   * never both succeed.
   */
  status: BedStatus;
  currentPatientId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

export type BedDocument = HydratedDocument<IBed>;

const bedSchema = new Schema<IBed>(
  {
    bedId: { type: String, required: true, unique: true, immutable: true },
    wardId: {
      type: Schema.Types.ObjectId,
      ref: 'Ward',
      required: [true, 'Ward is required'],
      immutable: true,
    },
    bedNumber: {
      type: String,
      required: [true, 'Bed number is required'],
      trim: true,
      maxlength: [50, 'Bed number cannot exceed 50 characters'],
    },
    bedType: {
      type: String,
      trim: true,
      maxlength: [50, 'Bed type cannot exceed 50 characters'],
    },
    status: {
      type: String,
      default: 'available',
      enum: {
        values: BED_STATUSES as unknown as string[],
        message: `Status must be one of: ${BED_STATUSES.join(', ')}`,
      },
      index: true,
    },
    currentPatientId: { type: Schema.Types.ObjectId, ref: 'Patient', default: null },
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

// Bed numbers are unique inside a ward.
bedSchema.index({ wardId: 1, bedNumber: 1 }, { unique: true });

const Bed: Model<IBed> = mongoose.model<IBed>('Bed', bedSchema);

export default Bed;
