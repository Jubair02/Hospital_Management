import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';

export const DOCTOR_STATUSES = ['active', 'inactive'] as const;
export type DoctorStatus = (typeof DOCTOR_STATUSES)[number];

export const DAYS_OF_WEEK = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

/** HH:MM, 24-hour, zero-padded — lexicographic order equals time order. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface IAvailabilitySlot {
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
}

export interface IDoctor {
  userId: Types.ObjectId;
  doctorId: string;
  /**
   * Name/phone are denormalized from the linked User for fast search and
   * listing; doctorService keeps both in sync on updates.
   */
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialization: string;
  departmentId: Types.ObjectId;
  qualification?: string;
  licenseNumber?: string;
  experienceYears?: number;
  consultationFee?: number;
  profileImage?: string;
  bio?: string;
  availability: IAvailabilitySlot[];
  status: DoctorStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDoctorVirtuals {
  fullName: string;
}

// The empty slots must be {} (not Record<string, never>) — intersecting
// Record<string, never> with the virtuals type would collapse fullName
// to `never` and break assignability of hydrated documents.
// eslint-disable-next-line @typescript-eslint/ban-types
type EmptyOverrides = {};

export type DoctorDocument = HydratedDocument<IDoctor, IDoctorVirtuals>;

type DoctorModel = Model<IDoctor, EmptyOverrides, EmptyOverrides, IDoctorVirtuals>;

const availabilitySchema = new Schema<IAvailabilitySlot>(
  {
    dayOfWeek: {
      type: String,
      required: true,
      enum: {
        values: DAYS_OF_WEEK as unknown as string[],
        message: `Day must be one of: ${DAYS_OF_WEEK.join(', ')}`,
      },
    },
    startTime: {
      type: String,
      required: true,
      match: [TIME_RE, 'Start time must be HH:MM (24-hour)'],
    },
    endTime: {
      type: String,
      required: true,
      match: [TIME_RE, 'End time must be HH:MM (24-hour)'],
    },
    isAvailable: { type: Boolean, default: true },
  },
  { _id: false }
);

const doctorSchema = new Schema<
  IDoctor,
  DoctorModel,
  EmptyOverrides,
  EmptyOverrides,
  IDoctorVirtuals
>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'A doctor profile must reference a user account'],
      unique: true,
    },
    doctorId: {
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
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
      default: '',
      maxlength: [20, 'Phone cannot exceed 20 characters'],
    },
    specialization: {
      type: String,
      required: [true, 'Specialization is required'],
      trim: true,
      maxlength: [100, 'Specialization cannot exceed 100 characters'],
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
      index: true,
    },
    qualification: {
      type: String,
      trim: true,
      maxlength: [200, 'Qualification cannot exceed 200 characters'],
    },
    licenseNumber: {
      type: String,
      trim: true,
      maxlength: [50, 'License number cannot exceed 50 characters'],
      // Unique only when present.
      index: { unique: true, sparse: true },
    },
    experienceYears: {
      type: Number,
      min: [0, 'Experience cannot be negative'],
      max: [80, 'Experience cannot exceed 80 years'],
    },
    consultationFee: {
      type: Number,
      min: [0, 'Consultation fee cannot be negative'],
    },
    profileImage: {
      type: String,
      trim: true,
      maxlength: [500, 'Profile image URL cannot exceed 500 characters'],
    },
    bio: {
      type: String,
      trim: true,
      maxlength: [1000, 'Bio cannot exceed 1000 characters'],
    },
    availability: {
      type: [availabilitySchema],
      default: [],
    },
    status: {
      type: String,
      default: 'active',
      enum: {
        values: DOCTOR_STATUSES as unknown as string[],
        message: `Status must be one of: ${DOCTOR_STATUSES.join(', ')}`,
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

doctorSchema.virtual('fullName').get(function (this: DoctorDocument) {
  return `${this.firstName} ${this.lastName}`;
});

const Doctor = mongoose.model<IDoctor, DoctorModel>('Doctor', doctorSchema);

export default Doctor;
