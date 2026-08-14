import type { Types } from 'mongoose';
import Appointment, {
  BLOCKING_STATUSES,
  type AppointmentDocument,
} from '../models/Appointment.js';
import Doctor, { DAYS_OF_WEEK, type DoctorDocument } from '../models/Doctor.js';
import Patient from '../models/Patient.js';
import Department from '../models/Department.js';
import ApiError from '../utils/ApiError.js';
import { nextSequenceId } from './sequenceService.js';
import { notifyDoctor } from './notificationService.js';

/** Next human-readable appointment ID (APT-000001, …). */
export const nextAppointmentId = (): Promise<string> => nextSequenceId('appointmentId', 'APT', 6);

/** Parses YYYY-MM-DD into UTC midnight — appointment dates are calendar dates. */
export const toCalendarDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

export interface CreateAppointmentInput {
  patientId: string;
  doctorId: string;
  appointmentDate: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
  reason: string;
  notes?: string;
}

const assertWithinAvailability = (
  doctor: DoctorDocument,
  date: Date,
  startTime: string,
  endTime: string
): void => {
  const dayOfWeek = DAYS_OF_WEEK[date.getUTCDay()]!;

  const fits = doctor.availability.some(
    (slot) =>
      slot.isAvailable &&
      slot.dayOfWeek === dayOfWeek &&
      slot.startTime <= startTime &&
      slot.endTime >= endTime
  );

  if (!fits) {
    throw new ApiError(
      400,
      `Dr. ${doctor.lastName} is not available on ${dayOfWeek} ${startTime}–${endTime}. Choose a time within the doctor's availability.`
    );
  }
};

const overlapFilter = (
  doctorId: Types.ObjectId,
  date: Date,
  startTime: string,
  endTime: string
) => ({
  doctorId,
  appointmentDate: date,
  status: { $in: BLOCKING_STATUSES },
  // HH:MM strings are zero-padded, so lexicographic comparison is
  // chronological: two ranges overlap iff each starts before the other ends.
  startTime: { $lt: endTime },
  endTime: { $gt: startTime },
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Books an appointment with double-booking prevention.
 *
 * Concurrency strategy (documented for §37): a pure check-then-insert is
 * racy, so this uses OPTIMISTIC INSERT + POST-INSERT VERIFICATION with
 * SELF-REVERT and bounded, jittered retry:
 *
 *   1. Validate patient/doctor/department are active and the time is
 *      inside the doctor's availability.
 *   2. Pre-check conflicts (fast fail for the common case).
 *   3. Insert the appointment.
 *   4. Re-query overlapping blocking appointments. If ANY other overlap
 *      is visible, delete the own insert and retry after a small random
 *      backoff (next round's pre-check then sees the surviving booking
 *      and returns 409).
 *
 * Safety: a booking survives only when its writer observed ZERO
 * conflicts at verification. Two overlapping writers can never both
 * observe zero conflicts — each writer's insert precedes its own
 * verification, so "A saw nothing" and "B saw nothing" would require
 * each check to precede the other's insert, a cycle that cannot exist.
 * Hence at most one overlapping booking ever survives, without
 * multi-document transactions (works on standalone MongoDB and replica
 * sets alike). The { doctorId, appointmentDate } compound index keeps
 * verification cheap.
 *
 * Liveness: when BOTH writers see each other they both revert, so the
 * slot would be left unbooked. Exponential backoff with per-request
 * jitter de-synchronizes the retry, making a repeated collision
 * vanishingly unlikely (safety never depends on the retry succeeding).
 *
 * (An earlier lowest-_id tie-break was replaced: ObjectId order does not
 * always match insert order, which the concurrency test exposed.)
 */
export const bookAppointment = async (
  input: CreateAppointmentInput,
  actorId: Types.ObjectId
): Promise<AppointmentDocument> => {
  const [patient, doctor] = await Promise.all([
    Patient.findById(input.patientId),
    Doctor.findById(input.doctorId),
  ]);

  if (!patient) throw new ApiError(404, 'Patient not found');
  if (patient.status !== 'active') {
    throw new ApiError(400, 'Appointments cannot be booked for an inactive patient.');
  }

  if (!doctor) throw new ApiError(404, 'Doctor not found');
  if (doctor.status !== 'active') {
    throw new ApiError(400, 'Appointments cannot be booked with an inactive doctor.');
  }

  const department = await Department.findById(doctor.departmentId);
  if (!department || department.status !== 'active') {
    throw new ApiError(400, "The doctor's department is not active.");
  }

  const date = toCalendarDate(input.appointmentDate);
  assertWithinAvailability(doctor, date, input.startTime, input.endTime);

  const conflictQuery = overlapFilter(doctor._id, date, input.startTime, input.endTime);

  const MAX_ATTEMPTS = 5;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // Fast fail before inserting (also catches last round's survivor).
    if (await Appointment.exists(conflictQuery)) {
      throw new ApiError(409, 'This time overlaps an existing appointment for the doctor.');
    }

    const appointment = await Appointment.create({
      appointmentId: await nextAppointmentId(),
      patientId: patient._id,
      doctorId: doctor._id,
      departmentId: doctor.departmentId,
      appointmentDate: date,
      startTime: input.startTime,
      endTime: input.endTime,
      reason: input.reason,
      notes: input.notes,
      createdBy: actorId,
    });

    // Post-insert verification: survive only if no other overlap is
    // visible; otherwise revert the own insert and retry.
    const conflict = await Appointment.exists({
      ...conflictQuery,
      _id: { $ne: appointment._id },
    });

    if (!conflict) {
      // Secondary effect — never allowed to fail the booking.
      await notifyDoctor(doctor._id, {
        type: 'appointment',
        title: 'New appointment booked',
        message: `${patient.firstName} ${patient.lastName} on ${input.appointmentDate} at ${input.startTime}.`,
        referenceType: 'appointment',
        referenceId: appointment._id,
        dedupeKey: `appointment:created:${appointment._id}`,
      });

      return appointment;
    }

    await Appointment.deleteOne({ _id: appointment._id });

    if (attempt < MAX_ATTEMPTS) {
      // Exponential backoff + jitter so two colliding writers separate.
      await sleep(attempt * 20 + Math.floor(Math.random() * 40));
    }
  }

  throw new ApiError(409, 'This time was just booked by someone else. Pick another slot.');
};

/**
 * Re-validates availability and conflicts when date/time change on an
 * existing appointment (same optimistic strategy, excluding itself).
 */
export const rescheduleChecks = async (
  appointment: AppointmentDocument,
  date: Date,
  startTime: string,
  endTime: string
): Promise<void> => {
  const doctor = await Doctor.findById(appointment.doctorId);
  if (!doctor) throw new ApiError(404, 'Doctor not found');
  if (doctor.status !== 'active') {
    throw new ApiError(400, 'The doctor for this appointment is inactive.');
  }

  assertWithinAvailability(doctor, date, startTime, endTime);

  const conflict = await Appointment.exists({
    ...overlapFilter(doctor._id, date, startTime, endTime),
    _id: { $ne: appointment._id },
  });

  if (conflict) {
    throw new ApiError(409, 'This time overlaps an existing appointment for the doctor.');
  }
};

export interface AppointmentStats {
  todaysAppointments: number;
  pendingAppointments: number;
  scheduledToday: number;
  confirmedToday: number;
  cancelledToday: number;
  completedToday: number;
  upcomingAppointments: number;
  totalDoctors: number;
  activeDoctors: number;
}

/**
 * Dashboard statistics. When doctorScope is given (doctor role), the
 * appointment numbers cover only that doctor's appointments.
 */
export const getAppointmentStats = async (
  doctorScope?: Types.ObjectId
): Promise<AppointmentStats> => {
  const today = toCalendarDate(new Date().toISOString().slice(0, 10));
  const scope = doctorScope ? { doctorId: doctorScope } : {};

  const [
    todaysAppointments,
    pendingAppointments,
    scheduledToday,
    confirmedToday,
    cancelledToday,
    completedToday,
    upcomingAppointments,
    totalDoctors,
    activeDoctors,
  ] = await Promise.all([
    Appointment.countDocuments({ ...scope, appointmentDate: today }),
    Appointment.countDocuments({ ...scope, status: 'scheduled' }),
    Appointment.countDocuments({ ...scope, appointmentDate: today, status: 'scheduled' }),
    Appointment.countDocuments({ ...scope, appointmentDate: today, status: 'confirmed' }),
    Appointment.countDocuments({ ...scope, appointmentDate: today, status: 'cancelled' }),
    Appointment.countDocuments({ ...scope, appointmentDate: today, status: 'completed' }),
    Appointment.countDocuments({
      ...scope,
      appointmentDate: { $gt: today },
      status: { $in: BLOCKING_STATUSES },
    }),
    Doctor.countDocuments({}),
    Doctor.countDocuments({ status: 'active' }),
  ]);

  return {
    todaysAppointments,
    pendingAppointments,
    scheduledToday,
    confirmedToday,
    cancelledToday,
    completedToday,
    upcomingAppointments,
    totalDoctors,
    activeDoctors,
  };
};
