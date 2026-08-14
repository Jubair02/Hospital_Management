import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const FULFILLMENT_STATUSES = ['partial', 'dispensed'] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

/**
 * Pharmacy-owned tracking of one prescription LINE (a consultation's
 * prescriptions[index]). The clinical prescription itself is never
 * modified — this record lives beside it.
 *
 * prescribedQuantity is the total units the pharmacist determined from
 * the doctor's dosage/frequency/duration, fixed at first dispensing.
 * `remaining` is decremented with guarded atomic updates, which is what
 * makes over-dispensing impossible under concurrency.
 */
export interface IPrescriptionFulfillment {
  consultationId: Types.ObjectId;
  prescriptionIndex: number;
  patientId: Types.ObjectId;
  medicineId: Types.ObjectId;
  /** Snapshot of the doctor's free-text medicine name. */
  medicineName: string;
  prescribedQuantity: number;
  dispensedQuantity: number;
  remaining: number;
  status: FulfillmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type PrescriptionFulfillmentDocument = HydratedDocument<IPrescriptionFulfillment>;

const fulfillmentSchema = new Schema<IPrescriptionFulfillment>(
  {
    consultationId: {
      type: Schema.Types.ObjectId,
      ref: 'Consultation',
      required: true,
      immutable: true,
    },
    prescriptionIndex: {
      type: Number,
      required: true,
      min: 0,
      immutable: true,
    },
    patientId: { type: Schema.Types.ObjectId, ref: 'Patient', required: true, immutable: true },
    medicineId: { type: Schema.Types.ObjectId, ref: 'Medicine', required: true },
    medicineName: { type: String, required: true, trim: true, maxlength: 200 },
    prescribedQuantity: {
      type: Number,
      required: true,
      min: [1, 'Prescribed quantity must be at least 1'],
      immutable: true,
    },
    dispensedQuantity: { type: Number, required: true, default: 0, min: 0 },
    remaining: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      default: 'partial',
      enum: {
        values: FULFILLMENT_STATUSES as unknown as string[],
        message: `Status must be one of: ${FULFILLMENT_STATUSES.join(', ')}`,
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

// One fulfillment record per prescription line — enforced by the DB so
// concurrent first-dispenses cannot create duplicates.
fulfillmentSchema.index({ consultationId: 1, prescriptionIndex: 1 }, { unique: true });

const PrescriptionFulfillment: Model<IPrescriptionFulfillment> =
  mongoose.model<IPrescriptionFulfillment>('PrescriptionFulfillment', fulfillmentSchema);

export default PrescriptionFulfillment;
