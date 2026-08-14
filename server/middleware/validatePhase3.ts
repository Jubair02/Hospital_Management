import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { DAYS_OF_WEEK, DOCTOR_STATUSES, TIME_RE } from '../models/Doctor.js';
import { DEPARTMENT_STATUSES } from '../models/Department.js';
import { APPOINTMENT_STATUSES } from '../models/Appointment.js';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isBounded = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max;

const isOneOf = (values: readonly string[]) => (v: unknown): boolean =>
  typeof v === 'string' && values.includes(v);

const isCalendarDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  return !Number.isNaN(new Date(`${v}T00:00:00.000Z`).getTime());
};

const fail = (errors: string[]): ApiError => new ApiError(400, errors.join(' '));

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export const validateDepartment = (partial: boolean): RequestHandler => (req, _res, next) => {
  const { name, description } = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (name === undefined) {
    if (!partial) errors.push('Department name is required.');
  } else if (!isNonEmptyString(name) || name.trim().length > 100) {
    errors.push('Department name must be 1–100 characters.');
  }

  if (description !== undefined && !isBounded(description, 500)) {
    errors.push('Description must be text of at most 500 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateDepartmentStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (!isOneOf(DEPARTMENT_STATUSES)(status)) {
    return next(fail([`Status must be one of: ${DEPARTMENT_STATUSES.join(', ')}.`]));
  }
  next();
};

// ---------------------------------------------------------------------------
// Doctors
// ---------------------------------------------------------------------------

const collectProfileErrors = (body: Record<string, unknown>, partial: boolean): string[] => {
  const errors: string[] = [];

  if (body.specialization === undefined) {
    if (!partial) errors.push('Specialization is required.');
  } else if (!isNonEmptyString(body.specialization) || body.specialization.trim().length > 100) {
    errors.push('Specialization must be 1–100 characters.');
  }

  if (body.departmentId === undefined) {
    if (!partial) errors.push('Department is required.');
  } else if (!isValidObjectId(body.departmentId)) {
    errors.push('Department must be a valid id.');
  }

  if (body.qualification !== undefined && !isBounded(body.qualification, 200)) {
    errors.push('Qualification must be at most 200 characters.');
  }
  if (body.licenseNumber !== undefined && !isBounded(body.licenseNumber, 50)) {
    errors.push('License number must be at most 50 characters.');
  }
  if (
    body.experienceYears !== undefined &&
    (typeof body.experienceYears !== 'number' ||
      body.experienceYears < 0 ||
      body.experienceYears > 80)
  ) {
    errors.push('Experience must be a number between 0 and 80.');
  }
  if (
    body.consultationFee !== undefined &&
    (typeof body.consultationFee !== 'number' || body.consultationFee < 0)
  ) {
    errors.push('Consultation fee must be a non-negative number.');
  }
  if (body.bio !== undefined && !isBounded(body.bio, 1000)) {
    errors.push('Bio must be at most 1000 characters.');
  }

  return errors;
};

export const validateCreateDoctor: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors = collectProfileErrors(body, false);

  const { userId, user } = body as { userId?: unknown; user?: unknown };

  if (userId !== undefined && !isValidObjectId(userId)) {
    errors.push('userId must be a valid id.');
  }

  if (userId === undefined) {
    if (typeof user !== 'object' || user === null) {
      errors.push('Provide either userId (existing doctor user) or user (new account).');
    } else {
      const account = user as Record<string, unknown>;
      if (!isNonEmptyString(account.firstName)) errors.push('User first name is required.');
      if (!isNonEmptyString(account.lastName)) errors.push('User last name is required.');
      if (!isNonEmptyString(account.email) || !EMAIL_RE.test((account.email as string).trim())) {
        errors.push('A valid user email is required.');
      }
      if (typeof account.password !== 'string' || account.password.length < 8) {
        errors.push('User password must be at least 8 characters.');
      }
      if (
        account.phone !== undefined &&
        account.phone !== '' &&
        (typeof account.phone !== 'string' || !PHONE_RE.test(account.phone.trim()))
      ) {
        errors.push('User phone must be a valid phone number.');
      }
    }
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateUpdateDoctor: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors = collectProfileErrors(body, true);

  for (const nameField of ['firstName', 'lastName'] as const) {
    const value = body[nameField];
    if (value !== undefined && (!isNonEmptyString(value) || value.trim().length > 50)) {
      errors.push(`${nameField === 'firstName' ? 'First' : 'Last'} name must be 1–50 characters.`);
    }
  }
  if (
    body.phone !== undefined &&
    body.phone !== '' &&
    (typeof body.phone !== 'string' || !PHONE_RE.test(body.phone.trim()))
  ) {
    errors.push('Phone must be a valid phone number.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateDoctorStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (!isOneOf(DOCTOR_STATUSES)(status)) {
    return next(fail([`Status must be one of: ${DOCTOR_STATUSES.join(', ')}.`]));
  }
  next();
};

/** PUT /api/doctors/:id/availability — body: { availability: Slot[] } */
export const validateAvailability: RequestHandler = (req, _res, next) => {
  const { availability } = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!Array.isArray(availability) || availability.length > 50) {
    return next(fail(['availability must be a list of up to 50 slots.']));
  }

  availability.forEach((slot, index) => {
    if (typeof slot !== 'object' || slot === null) {
      errors.push(`Slot ${index + 1} is invalid.`);
      return;
    }
    const { dayOfWeek, startTime, endTime, isAvailable } = slot as Record<string, unknown>;

    if (!isOneOf(DAYS_OF_WEEK)(dayOfWeek)) {
      errors.push(`Slot ${index + 1}: day must be one of ${DAYS_OF_WEEK.join(', ')}.`);
    }
    if (typeof startTime !== 'string' || !TIME_RE.test(startTime)) {
      errors.push(`Slot ${index + 1}: start time must be HH:MM (24-hour).`);
    }
    if (typeof endTime !== 'string' || !TIME_RE.test(endTime)) {
      errors.push(`Slot ${index + 1}: end time must be HH:MM (24-hour).`);
    }
    if (
      typeof startTime === 'string' &&
      typeof endTime === 'string' &&
      TIME_RE.test(startTime) &&
      TIME_RE.test(endTime) &&
      startTime >= endTime
    ) {
      errors.push(`Slot ${index + 1}: end time must be after start time.`);
    }
    if (isAvailable !== undefined && typeof isAvailable !== 'boolean') {
      errors.push(`Slot ${index + 1}: isAvailable must be true or false.`);
    }
  });

  if (errors.length) return next(fail(errors));
  next();
};

// ---------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------

export const validateCreateAppointment: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.patientId)) errors.push('A valid patient is required.');
  if (!isValidObjectId(body.doctorId)) errors.push('A valid doctor is required.');
  if (!isCalendarDate(body.appointmentDate)) {
    errors.push('Appointment date must be a valid date (YYYY-MM-DD).');
  }
  if (typeof body.startTime !== 'string' || !TIME_RE.test(body.startTime)) {
    errors.push('Start time must be HH:MM (24-hour).');
  }
  if (typeof body.endTime !== 'string' || !TIME_RE.test(body.endTime)) {
    errors.push('End time must be HH:MM (24-hour).');
  }
  if (
    typeof body.startTime === 'string' &&
    typeof body.endTime === 'string' &&
    TIME_RE.test(body.startTime) &&
    TIME_RE.test(body.endTime) &&
    body.startTime >= body.endTime
  ) {
    errors.push('End time must be after start time.');
  }
  if (!isNonEmptyString(body.reason) || body.reason.trim().length > 500) {
    errors.push('Reason is required (at most 500 characters).');
  }
  if (body.notes !== undefined && !isBounded(body.notes, 1000)) {
    errors.push('Notes must be at most 1000 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

/** PATCH /api/appointments/:id — reschedule / edit details. */
export const validateUpdateAppointment: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (body.appointmentDate !== undefined && !isCalendarDate(body.appointmentDate)) {
    errors.push('Appointment date must be a valid date (YYYY-MM-DD).');
  }
  if (
    body.startTime !== undefined &&
    (typeof body.startTime !== 'string' || !TIME_RE.test(body.startTime))
  ) {
    errors.push('Start time must be HH:MM (24-hour).');
  }
  if (
    body.endTime !== undefined &&
    (typeof body.endTime !== 'string' || !TIME_RE.test(body.endTime))
  ) {
    errors.push('End time must be HH:MM (24-hour).');
  }
  if (body.reason !== undefined && (!isNonEmptyString(body.reason) || body.reason.trim().length > 500)) {
    errors.push('Reason cannot be empty (at most 500 characters).');
  }
  if (body.notes !== undefined && !isBounded(body.notes, 1000)) {
    errors.push('Notes must be at most 1000 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateAppointmentStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (!isOneOf(APPOINTMENT_STATUSES)(status)) {
    return next(fail([`Status must be one of: ${APPOINTMENT_STATUSES.join(', ')}.`]));
  }
  next();
};
