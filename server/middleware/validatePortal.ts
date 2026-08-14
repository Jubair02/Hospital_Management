import type { RequestHandler } from 'express';
import ApiError from '../utils/ApiError.js';
import { PORTAL_EDITABLE_FIELDS } from '../services/portalService.js';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const MAX_LENGTHS: Record<string, number> = {
  phone: 20,
  email: 100,
  address: 300,
  emergencyContact: 20,
  emergencyContactName: 100,
  emergencyContactRelation: 50,
  maritalStatus: 30,
  occupation: 100,
};

/**
 * PATCH /api/patient/profile — contact/social fields only.
 * Any key outside the editable allow-list is a 400, not a silent drop:
 * a request that tries to write medicalHistory or status should fail
 * loudly, not appear to succeed.
 */
export const validatePortalProfile: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const keys = Object.keys(body);

  if (keys.length === 0) {
    return next(new ApiError(400, 'Provide at least one field to update.'));
  }

  const editable = PORTAL_EDITABLE_FIELDS as readonly string[];
  const forbidden = keys.filter((key) => !editable.includes(key));
  if (forbidden.length > 0) {
    return next(
      new ApiError(400, `These fields cannot be changed from the portal: ${forbidden.join(', ')}.`)
    );
  }

  const errors: string[] = [];

  for (const key of keys) {
    const value = body[key];
    if (typeof value !== 'string') {
      errors.push(`${key} must be a string.`);
      continue;
    }
    const max = MAX_LENGTHS[key];
    if (max !== undefined && value.length > max) {
      errors.push(`${key} cannot exceed ${max} characters.`);
    }
  }

  if (isNonEmptyString(body.phone) && !PHONE_RE.test(body.phone.trim())) {
    errors.push('Phone must be a valid phone number.');
  }
  if (isNonEmptyString(body.email) && !EMAIL_RE.test(body.email.trim())) {
    errors.push('Email must be a valid email address.');
  }

  if (errors.length) {
    return next(new ApiError(400, errors.join(' ')));
  }

  next();
};

/** POST /api/patient/appointments — booking request shape. */
export const validatePortalBooking: RequestHandler = (req, _res, next) => {
  const { doctorId, appointmentDate, startTime, endTime, reason } = (req.body ?? {}) as Record<
    string,
    unknown
  >;
  const errors: string[] = [];

  if (!isNonEmptyString(doctorId)) errors.push('A doctor is required.');
  if (!isNonEmptyString(appointmentDate) || !DATE_RE.test(appointmentDate)) {
    errors.push('Appointment date must be in YYYY-MM-DD format.');
  }
  if (!isNonEmptyString(startTime) || !TIME_RE.test(startTime)) {
    errors.push('Start time must be in HH:MM format.');
  }
  if (!isNonEmptyString(endTime) || !TIME_RE.test(endTime)) {
    errors.push('End time must be in HH:MM format.');
  }
  if (
    isNonEmptyString(startTime) &&
    isNonEmptyString(endTime) &&
    TIME_RE.test(startTime) &&
    TIME_RE.test(endTime) &&
    startTime >= endTime
  ) {
    errors.push('End time must be after start time.');
  }
  if (!isNonEmptyString(reason)) {
    errors.push('A reason for the visit is required.');
  } else if (reason.length > 500) {
    errors.push('Reason cannot exceed 500 characters.');
  }
  if (isNonEmptyString(appointmentDate) && DATE_RE.test(appointmentDate)) {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (appointmentDate < todayStr) {
      errors.push('Appointments cannot be booked in the past.');
    }
  }

  if (errors.length) {
    return next(new ApiError(400, errors.join(' ')));
  }

  next();
};
