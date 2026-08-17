import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { vitalSignsSchema, type IVitalSigns } from './vitalSigns.js';

export type { IVitalSigns };

export const CONSULTATION_STATUSES = ['in_progress', 'completed', 'cancelled'] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

/**
 * The statuses that still hold a claim on their appointment. Shared by the
 * uniqueness index and the queries that read it, so the two cannot drift:
 * whatever counts as live for one has to count as live for the other.
 */
export const LIVE_CONSULTATION_STATUSES: ConsultationStatus[] = ['in_progress', 'completed'];

/** The transitions the API accepts — completed/cancelled are terminal. */
export const CONSULTATION_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const DIAGNOSIS_TYPES = ['primary', 'secondary'] as const;
export type DiagnosisType = (typeof DIAGNOSIS_TYPES)[number];

export interface IDiagnosis {
  diagnosis: string;
  type: DiagnosisType;
  notes?: string;
}

export interface IPrescriptionMedicine {
  medicineName: string;
  dosage: string;
  frequency: string;
  duration: string;
  route?: string;
  instructions?: string;
}

export interface IConsultation {
  consultationId: string;
  appointmentId: Types.ObjectId;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  departmentId: Types.ObjectId;
  consultationDate: Date;
  chiefComplaint?: string;
  historyOfPresentIllness?: string;
  clinicalNotes?: string;
  physicalExamination?: string;
  assessment?: string;
  vitalSigns: IVitalSigns;
  diagnoses: IDiagnosis[];
  treatmentPlan?: string;
  prescriptions: IPrescriptionMedicine[];
  followUpDate?: Date;
  status: ConsultationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type ConsultationDocument = HydratedDocument<IConsultation>;

const clinicalText = (max = 5000) => ({
  type: String,
  trim: true,
  maxlength: [max, `Text cannot exceed ${max} characters`] as [number, string],
});

const diagnosisSchema = new Schema<IDiagnosis>(
  {
    diagnosis: {
      type: String,
      required: [true, 'Diagnosis text is required'],
      trim: true,
      maxlength: [300, 'Diagnosis cannot exceed 300 characters'],
    },
    type: {
      type: String,
      required: true,
      enum: {
        values: DIAGNOSIS_TYPES as unknown as string[],
        message: `Diagnosis type must be one of: ${DIAGNOSIS_TYPES.join(', ')}`,
      },
    },
    notes: clinicalText(500),
  },
  { _id: false }
);

const prescriptionSchema = new Schema<IPrescriptionMedicine>(
  {
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
    frequency: {
      type: String,
      required: [true, 'Frequency is required'],
      trim: true,
      maxlength: [200, 'Frequency cannot exceed 200 characters'],
    },
    duration: {
      type: String,
      required: [true, 'Duration is required'],
      trim: true,
      maxlength: [200, 'Duration cannot exceed 200 characters'],
    },
    route: clinicalText(100),
    instructions: clinicalText(300),
  },
  { _id: false }
);

const consultationSchema = new Schema<IConsultation>(
  {
    consultationId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    appointmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Appointment',
      required: [true, 'Appointment is required'],
      // Uniqueness is a partial index declared below, not a plain one: a
      // cancelled consultation must release its appointment.
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      immutable: true,
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: true,
      immutable: true,
      index: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
      immutable: true,
    },
    consultationDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    chiefComplaint: clinicalText(),
    historyOfPresentIllness: clinicalText(),
    clinicalNotes: clinicalText(),
    physicalExamination: clinicalText(),
    assessment: clinicalText(),
    vitalSigns: {
      type: vitalSignsSchema,
      default: {},
    },
    diagnoses: {
      type: [diagnosisSchema],
      default: [],
    },
    treatmentPlan: clinicalText(),
    prescriptions: {
      type: [prescriptionSchema],
      default: [],
    },
    followUpDate: { type: Date },
    status: {
      type: String,
      default: 'in_progress',
      enum: {
        values: CONSULTATION_STATUSES as unknown as string[],
        message: `Status must be one of: ${CONSULTATION_STATUSES.join(', ')}`,
      },
      index: true,
    },
  },
  {
    timestamps: true,
    /**
     * A consultation opens with nothing measured yet, so `vitalSigns` starts as
     * its default empty object. Mongoose minimizes empty objects out of the
     * document, which dropped the field from the API response entirely and made
     * every client read of `vitalSigns.temperature` throw on a fresh record.
     * The group is optional; its container is not.
     */
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

/**
 * At most one *live* consultation per appointment.
 *
 * A plain unique index made cancellation permanent: the cancelled record kept
 * its claim on the appointment, so starting again returned 409 forever and the
 * appointment could never be consulted or closed. Excluding cancelled records
 * lets a mistaken cancellation be redone, while still serialising concurrent
 * starts at the database — the guarantee the index was there for.
 */
consultationSchema.index(
  { appointmentId: 1 },
  { unique: true, partialFilterExpression: { status: { $in: LIVE_CONSULTATION_STATUSES } } }
);

const Consultation: Model<IConsultation> = mongoose.model<IConsultation>(
  'Consultation',
  consultationSchema
);

export default Consultation;
