import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const ADMISSION_TYPES = ['emergency', 'scheduled', 'transfer'] as const;
export type AdmissionType = (typeof ADMISSION_TYPES)[number];

export const ADMISSION_STATUSES = ['admitted', 'transferred', 'discharged', 'cancelled'] as const;
export type AdmissionStatus = (typeof ADMISSION_STATUSES)[number];

/** Statuses that mean the patient is currently in a bed. */
export const ACTIVE_ADMISSION_STATUSES: AdmissionStatus[] = ['admitted', 'transferred'];

export interface IAdmission {
  admissionId: string;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  wardId: Types.ObjectId;
  bedId: Types.ObjectId;
  appointmentId?: Types.ObjectId;
  reason: string;
  admissionType: AdmissionType;
  admissionDate: Date;
  expectedDischargeDate?: Date;
  dischargeDate?: Date;
  status: AdmissionStatus;
  /**
   * Mirror of "status is active" maintained by the service — backed by a
   * partial unique index on patientId so one patient can never hold two
   * active admissions, even under concurrent requests.
   */
  isActive: boolean;
  notes?: string;
  admittedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AdmissionDocument = HydratedDocument<IAdmission>;

const admissionSchema = new Schema<IAdmission>(
  {
    admissionId: { type: String, required: true, unique: true, immutable: true },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: true,
      immutable: true,
      // Indexed below: a history index and the one-active-admission
      // partial unique index (a field-level index here would conflict).
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Doctor is required'],
      index: true,
    },
    wardId: { type: Schema.Types.ObjectId, ref: 'Ward', required: true, index: true },
    bedId: { type: Schema.Types.ObjectId, ref: 'Bed', required: true },
    appointmentId: { type: Schema.Types.ObjectId, ref: 'Appointment' },
    reason: {
      type: String,
      required: [true, 'Admission reason is required'],
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    admissionType: {
      type: String,
      required: true,
      enum: {
        values: ADMISSION_TYPES as unknown as string[],
        message: `Admission type must be one of: ${ADMISSION_TYPES.join(', ')}`,
      },
      index: true,
    },
    admissionDate: { type: Date, required: true, default: Date.now, index: true },
    expectedDischargeDate: { type: Date },
    dischargeDate: { type: Date },
    status: {
      type: String,
      default: 'admitted',
      enum: {
        values: ADMISSION_STATUSES as unknown as string[],
        message: `Status must be one of: ${ADMISSION_STATUSES.join(', ')}`,
      },
      index: true,
    },
    isActive: { type: Boolean, required: true, default: true },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    admittedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

// Admission history lookups by patient.
admissionSchema.index({ patientId: 1, admissionDate: -1 });

// One active admission per patient — enforced by the database itself.
admissionSchema.index(
  { patientId: 1 },
  {
    unique: true,
    partialFilterExpression: { isActive: true },
    name: 'one_active_admission_per_patient',
  }
);

const Admission: Model<IAdmission> = mongoose.model<IAdmission>('Admission', admissionSchema);

export default Admission;
