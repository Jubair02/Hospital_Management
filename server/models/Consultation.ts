import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const CONSULTATION_STATUSES = ['in_progress', 'completed', 'cancelled'] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

/** The transitions the API accepts — completed/cancelled are terminal. */
export const CONSULTATION_TRANSITIONS: Record<ConsultationStatus, ConsultationStatus[]> = {
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export const DIAGNOSIS_TYPES = ['primary', 'secondary'] as const;
export type DiagnosisType = (typeof DIAGNOSIS_TYPES)[number];

export interface IVitalSigns {
  temperature?: number;
  heartRate?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  respiratoryRate?: number;
  oxygenSaturation?: number;
  weight?: number;
  height?: number;
}

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

const positiveNumber = (label: string) => ({
  type: Number,
  min: [0, `${label} cannot be negative`],
});

const clinicalText = (max = 5000) => ({
  type: String,
  trim: true,
  maxlength: [max, `Text cannot exceed ${max} characters`] as [number, string],
});

const vitalSignsSchema = new Schema<IVitalSigns>(
  {
    temperature: positiveNumber('Temperature'),
    heartRate: positiveNumber('Heart rate'),
    bloodPressureSystolic: positiveNumber('Systolic blood pressure'),
    bloodPressureDiastolic: positiveNumber('Diastolic blood pressure'),
    respiratoryRate: positiveNumber('Respiratory rate'),
    oxygenSaturation: {
      type: Number,
      min: [0, 'Oxygen saturation must be between 0 and 100'],
      max: [100, 'Oxygen saturation must be between 0 and 100'],
    },
    weight: positiveNumber('Weight'),
    height: positiveNumber('Height'),
  },
  { _id: false }
);

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
      // One consultation per appointment — enforced by the database, so
      // concurrent "start consultation" requests cannot both succeed.
      unique: true,
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
    toJSON: {
      virtuals: true,
      transform(_doc, ret: Record<string, unknown>) {
        delete ret.__v;
        return ret;
      },
    },
  }
);

const Consultation: Model<IConsultation> = mongoose.model<IConsultation>(
  'Consultation',
  consultationSchema
);

export default Consultation;
