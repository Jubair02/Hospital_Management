import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * `held` is a clinical decision — the dose was due and deliberately not given
 * (a low blood pressure before an antihypertensive, a patient nil by mouth).
 * `refused` is the patient's decision. They are recorded apart because they
 * mean different things to whoever reviews the chart.
 */
export const ADMINISTRATION_STATUSES = ['given', 'refused', 'held'] as const;
export type AdministrationStatus = (typeof ADMINISTRATION_STATUSES)[number];

/**
 * A dose given to a patient, by whom, and when.
 *
 * The gap this closes: prescriptions live on a consultation and dispensing
 * records say stock left the pharmacy, but nothing said the medicine reached
 * the patient. That last step is the nurse's, and it is the legally
 * significant one — "dispensed to the ward" is not "administered".
 *
 * Deliberately not linked to a specific prescription line. Prescriptions are
 * embedded in consultations with no stable id of their own, and a nurse also
 * gives things never prescribed in a consultation at all. The medicine, dose,
 * and route are therefore copied onto the record, which is also what makes it
 * a faithful account of what was actually given rather than what was ordered.
 */
export interface IMedicationAdministration {
  administrationId: string;
  patientId: Types.ObjectId;
  admissionId?: Types.ObjectId;
  /** The consultation whose prescription this dose came from, when known. */
  consultationId?: Types.ObjectId;
  medicineName: string;
  dosage: string;
  route?: string;
  status: AdministrationStatus;
  administeredBy: Types.ObjectId;
  administeredAt: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MedicationAdministrationDocument = HydratedDocument<IMedicationAdministration>;

const administrationSchema = new Schema<IMedicationAdministration>(
  {
    administrationId: { type: String, required: true, unique: true, immutable: true },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Patient is required'],
      immutable: true,
      index: true,
    },
    admissionId: {
      type: Schema.Types.ObjectId,
      ref: 'Admission',
      immutable: true,
      index: true,
    },
    consultationId: { type: Schema.Types.ObjectId, ref: 'Consultation', immutable: true },
    medicineName: {
      type: String,
      required: [true, 'Medicine name is required'],
      trim: true,
      maxlength: [200, 'Medicine name cannot exceed 200 characters'],
    },
    dosage: {
      type: String,
      required: [true, 'Dosage is required'],
      trim: true,
      maxlength: [200, 'Dosage cannot exceed 200 characters'],
    },
    route: { type: String, trim: true, maxlength: [200, 'Route cannot exceed 200 characters'] },
    status: {
      type: String,
      required: true,
      default: 'given',
      enum: {
        values: ADMINISTRATION_STATUSES as unknown as string[],
        message: `Status must be one of: ${ADMINISTRATION_STATUSES.join(', ')}`,
      },
      index: true,
    },
    administeredBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    administeredAt: { type: Date, required: true, default: Date.now, index: true },
    notes: { type: String, trim: true, maxlength: [1000, 'Notes cannot exceed 1000 characters'] },
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

/** The drug chart: one patient, most recent dose first. */
administrationSchema.index({ patientId: 1, administeredAt: -1 });

const MedicationAdministration: Model<IMedicationAdministration> =
  mongoose.model<IMedicationAdministration>('MedicationAdministration', administrationSchema);

export default MedicationAdministration;
