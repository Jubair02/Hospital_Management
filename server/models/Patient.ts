import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const GENDERS = ['male', 'female', 'other'] as const;
export type Gender = (typeof GENDERS)[number];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const PATIENT_STATUSES = ['active', 'inactive'] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export interface IPatient {
  patientId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: Gender;
  bloodGroup: BloodGroup;
  phone: string;
  email?: string;
  address?: string;
  emergencyContact?: string;
  emergencyContactName?: string;
  emergencyContactRelation?: string;
  nationalId?: string;
  maritalStatus?: string;
  occupation?: string;
  profileImage?: string;
  medicalHistory: string[];
  allergies: string[];
  status: PatientStatus;
  /** Portal login account (role `patient`). Unset until an account is issued. */
  userId?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPatientVirtuals {
  fullName: string;
  age: number;
}

// Must be {} (not Record<string, never>) — intersecting Record<string,
// never> with the virtuals type collapses them to `never` and breaks
// hydrated-document assignability.
// eslint-disable-next-line @typescript-eslint/ban-types
type EmptyOverrides = {};

export type PatientDocument = HydratedDocument<IPatient, IPatientVirtuals>;

type PatientModel = Model<IPatient, EmptyOverrides, EmptyOverrides, IPatientVirtuals>;

const trimmedString = (maxlength: number, message: string) => ({
  type: String,
  trim: true,
  maxlength: [maxlength, message] as [number, string],
});

const patientSchema = new Schema<
  IPatient,
  PatientModel,
  EmptyOverrides,
  EmptyOverrides,
  IPatientVirtuals
>(
  {
    patientId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    dateOfBirth: {
      type: Date,
      required: [true, 'Date of birth is required'],
      validate: {
        validator: (value: Date) => value.getTime() <= Date.now(),
        message: 'Date of birth cannot be in the future',
      },
    },
    gender: {
      type: String,
      required: [true, 'Gender is required'],
      enum: {
        values: GENDERS as unknown as string[],
        message: `Gender must be one of: ${GENDERS.join(', ')}`,
      },
    },
    bloodGroup: {
      type: String,
      default: 'unknown',
      enum: {
        values: BLOOD_GROUPS as unknown as string[],
        message: `Blood group must be one of: ${BLOOD_GROUPS.join(', ')}`,
      },
    },
    phone: {
      type: String,
      required: [true, 'Phone is required'],
      trim: true,
      maxlength: [20, 'Phone cannot exceed 20 characters'],
      index: true,
    },
    email: {
      ...trimmedString(100, 'Email cannot exceed 100 characters'),
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
      index: true,
    },
    address: trimmedString(300, 'Address cannot exceed 300 characters'),
    emergencyContact: trimmedString(20, 'Emergency contact phone cannot exceed 20 characters'),
    emergencyContactName: trimmedString(100, 'Emergency contact name cannot exceed 100 characters'),
    emergencyContactRelation: trimmedString(50, 'Relationship cannot exceed 50 characters'),
    nationalId: {
      ...trimmedString(50, 'National ID cannot exceed 50 characters'),
      index: true,
    },
    maritalStatus: trimmedString(30, 'Marital status cannot exceed 30 characters'),
    occupation: trimmedString(100, 'Occupation cannot exceed 100 characters'),
    profileImage: trimmedString(500, 'Profile image URL cannot exceed 500 characters'),
    medicalHistory: {
      type: [{ type: String, trim: true, maxlength: 300 }],
      default: [],
    },
    allergies: {
      type: [{ type: String, trim: true, maxlength: 300 }],
      default: [],
    },
    status: {
      type: String,
      default: 'active',
      enum: {
        values: PATIENT_STATUSES as unknown as string[],
        message: `Status must be one of: ${PATIENT_STATUSES.join(', ')}`,
      },
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
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

// Registration reports and time series read patients by creation date.
patientSchema.index({ createdAt: -1 });

// One portal account maps to exactly one patient. Partial (not sparse) so
// only documents that actually carry a userId participate in uniqueness.
patientSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } }, name: 'one_patient_per_portal_account' }
);

patientSchema.virtual('fullName').get(function (this: PatientDocument) {
  return `${this.firstName} ${this.lastName}`;
});

patientSchema.virtual('age').get(function (this: PatientDocument) {
  const dob = this.dateOfBirth;
  // Populated projections may omit dateOfBirth — never crash serialization.
  if (!dob) return 0;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return Math.max(age, 0);
});

const Patient = mongoose.model<IPatient, PatientModel>('Patient', patientSchema);

export default Patient;
