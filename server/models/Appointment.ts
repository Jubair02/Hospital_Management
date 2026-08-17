import mongoose, { Schema, type HydratedDocument, type Model, type Types } from 'mongoose';
import { TIME_RE } from './Doctor.js';

export const APPOINTMENT_STATUSES = [
  'scheduled',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/** Statuses that occupy the doctor's time and therefore block bookings. */
export const BLOCKING_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed'];

/**
 * The transitions the API accepts — anything else is rejected.
 *
 * `scheduled → no_show` matters more than it looks. Confirmation is no longer
 * a button someone presses: an appointment becomes `confirmed` when its
 * consultation is started, and `completed` when that consultation is
 * finished. A patient who never arrives has no consultation, so their
 * appointment is still `scheduled` — which is precisely when someone needs to
 * record a no-show. Without this edge, the one status that describes "did not
 * turn up" would be reachable only for patients who did.
 */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'cancelled', 'no_show'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  completed: [],
  cancelled: [],
  no_show: [],
};

export interface IAppointment {
  appointmentId: string;
  patientId: Types.ObjectId;
  doctorId: Types.ObjectId;
  departmentId: Types.ObjectId;
  /** Calendar date stored as UTC midnight; time of day lives in start/end. */
  appointmentDate: Date;
  startTime: string;
  endTime: string;
  reason: string;
  notes?: string;
  status: AppointmentStatus;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type AppointmentDocument = HydratedDocument<IAppointment>;

const appointmentSchema = new Schema<IAppointment>(
  {
    appointmentId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    patientId: {
      type: Schema.Types.ObjectId,
      ref: 'Patient',
      required: [true, 'Patient is required'],
      index: true,
    },
    doctorId: {
      type: Schema.Types.ObjectId,
      ref: 'Doctor',
      required: [true, 'Doctor is required'],
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      required: [true, 'Department is required'],
      index: true,
    },
    appointmentDate: {
      type: Date,
      required: [true, 'Appointment date is required'],
    },
    startTime: {
      type: String,
      required: [true, 'Start time is required'],
      match: [TIME_RE, 'Start time must be HH:MM (24-hour)'],
    },
    endTime: {
      type: String,
      required: [true, 'End time is required'],
      match: [TIME_RE, 'End time must be HH:MM (24-hour)'],
    },
    reason: {
      type: String,
      required: [true, 'Reason is required'],
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters'],
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    status: {
      type: String,
      default: 'scheduled',
      enum: {
        values: APPOINTMENT_STATUSES as unknown as string[],
        message: `Status must be one of: ${APPOINTMENT_STATUSES.join(', ')}`,
      },
      index: true,
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

// Conflict lookups always scope by doctor + date — the core query of the
// double-booking check.
appointmentSchema.index({ doctorId: 1, appointmentDate: 1 });

const Appointment: Model<IAppointment> = mongoose.model<IAppointment>(
  'Appointment',
  appointmentSchema
);

export default Appointment;
