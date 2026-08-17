import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { vitalSignsSchema, type IVitalSigns } from './vitalSigns.js';

/**
 * A set of bedside measurements, recorded by whoever took them.
 *
 * Vitals existed only inside a consultation, which is a doctor's document that
 * only its own doctor may write. That left the people who actually take
 * observations — nurses, hourly, on a ward — with nowhere to put them. An
 * observation stands alone: it belongs to a patient, optionally to the
 * admission they are lying in, and to the moment it was taken.
 *
 * Records are append-only by design. A correction is a new reading, not an
 * edit of an old one, because the sequence is the clinical value: three
 * temperatures over six hours mean something a single latest figure does not.
 */
export interface IObservation {
  observationId: string;
  patientId: Types.ObjectId;
  /** Set when the patient is an inpatient; absent for a clinic reading. */
  admissionId?: Types.ObjectId;
  recordedBy: Types.ObjectId;
  recordedAt: Date;
  vitalSigns: IVitalSigns;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ObservationDocument = HydratedDocument<IObservation>;

const observationSchema = new Schema<IObservation>(
  {
    observationId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
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
    recordedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    recordedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    vitalSigns: {
      type: vitalSignsSchema,
      required: true,
      default: {},
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
  },
  {
    timestamps: true,
    // The measurements are the whole document; minimizing an empty set away
    // would make `vitalSigns.temperature` throw on the client, exactly as it
    // did for consultations.
    minimize: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

/** The ward round view: one patient, newest reading first. */
observationSchema.index({ patientId: 1, recordedAt: -1 });

const Observation: Model<IObservation> = mongoose.model<IObservation>(
  'Observation',
  observationSchema
);

export default Observation;
