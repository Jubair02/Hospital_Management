import type { RequestHandler } from 'express';
import ApiError from '../utils/ApiError.js';
import { EDITABLE_SETTINGS } from '../services/settingsService.js';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const fail = (errors: string[]): ApiError => new ApiError(400, errors.join(' '));

const isBounded = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max;

/** PATCH /api/admin/settings */
export const validateSettings: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  const unknown = Object.keys(body).filter(
    (key) => !(EDITABLE_SETTINGS as readonly string[]).includes(key)
  );
  if (unknown.length) errors.push(`Unknown setting(s): ${unknown.join(', ')}.`);

  if (body.hospitalName !== undefined) {
    if (
      typeof body.hospitalName !== 'string' ||
      body.hospitalName.trim().length === 0 ||
      body.hospitalName.length > 150
    ) {
      errors.push('Hospital name must be 1–150 characters.');
    }
  }
  if (body.contactPhone !== undefined && !isBounded(body.contactPhone, 30)) {
    errors.push('Contact phone must be at most 30 characters.');
  }
  if (
    body.contactEmail !== undefined &&
    body.contactEmail !== '' &&
    !(typeof body.contactEmail === 'string' && EMAIL_RE.test(body.contactEmail))
  ) {
    errors.push('Contact email must be a valid email address.');
  }
  if (body.address !== undefined && !isBounded(body.address, 300)) {
    errors.push('Address must be at most 300 characters.');
  }
  if (body.timezone !== undefined && !isBounded(body.timezone, 60)) {
    errors.push('Timezone must be at most 60 characters.');
  }
  if (
    body.currency !== undefined &&
    !(typeof body.currency === 'string' && body.currency.trim().length > 0 && body.currency.length <= 8)
  ) {
    errors.push('Currency must be a short code such as USD.');
  }
  if (body.appointmentSlotMinutes !== undefined) {
    const minutes = body.appointmentSlotMinutes;
    if (
      typeof minutes !== 'number' ||
      !Number.isInteger(minutes) ||
      minutes < 5 ||
      minutes > 240
    ) {
      errors.push('Appointment slot length must be a whole number of minutes between 5 and 240.');
    }
  }
  if (body.notifyLowStock !== undefined && typeof body.notifyLowStock !== 'boolean') {
    errors.push('notifyLowStock must be true or false.');
  }

  if (errors.length) return next(fail(errors));
  next();
};
