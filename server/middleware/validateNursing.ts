import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { vitalsErrors } from './vitalsRules.js';
import { ADMINISTRATION_STATUSES } from '../models/MedicationAdministration.js';
import { NOTE_CATEGORIES, NURSING_SHIFTS } from '../models/NursingNote.js';

const fail = (errors: string[]): ApiError => new ApiError(400, errors.join(' '));

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isBounded = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max;

/** A timestamp the caller supplied, which must be real and must not be ahead of now. */
const timestampErrors = (value: unknown, label: string): string[] => {
  if (value === undefined) return [];
  if (typeof value !== 'string') return [`${label} must be a date.`];

  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return [`${label} must be a valid date.`];
  // A minute of slack absorbs clock skew between a ward tablet and the server.
  if (when.getTime() > Date.now() + 60_000) return [`${label} cannot be in the future.`];
  return [];
};

/** POST /api/observations */
export const validateObservation: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.patientId)) errors.push('A valid patient is required.');
  errors.push(...vitalsErrors(body.vitalSigns));
  errors.push(...timestampErrors(body.recordedAt, 'recordedAt'));

  if (body.notes !== undefined && !isBounded(body.notes, 1000)) {
    errors.push('Notes must be text of at most 1000 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

/** POST /api/medication-administrations */
export const validateMedicationAdministration: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.patientId)) errors.push('A valid patient is required.');
  if (!isNonEmptyString(body.medicineName) || !isBounded(body.medicineName, 200)) {
    errors.push('Medicine name is required.');
  }
  if (!isNonEmptyString(body.dosage) || !isBounded(body.dosage, 200)) {
    errors.push('Dosage is required.');
  }

  if (
    body.status !== undefined &&
    !ADMINISTRATION_STATUSES.includes(body.status as (typeof ADMINISTRATION_STATUSES)[number])
  ) {
    errors.push(`Status must be one of: ${ADMINISTRATION_STATUSES.join(', ')}.`);
  }

  /**
   * A dose not given is only half a record. "Refused" and "held" are the
   * clinically important entries on a chart — the reason is what the next
   * person on shift needs, so it is required rather than optional.
   */
  if (body.status === 'refused' || body.status === 'held') {
    if (!isNonEmptyString(body.notes)) {
      errors.push(`Say why the dose was ${String(body.status)}.`);
    }
  }

  for (const field of ['route', 'consultationId'] as const) {
    if (body[field] !== undefined && !isBounded(body[field], 200)) {
      errors.push(`${field} must be text of at most 200 characters.`);
    }
  }
  if (body.consultationId !== undefined && !isValidObjectId(body.consultationId)) {
    errors.push('consultationId must be a valid id.');
  }
  if (body.notes !== undefined && !isBounded(body.notes, 1000)) {
    errors.push('Notes must be text of at most 1000 characters.');
  }
  errors.push(...timestampErrors(body.administeredAt, 'administeredAt'));

  if (errors.length) return next(fail(errors));
  next();
};

/** POST /api/nursing-notes */
export const validateNursingNote: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.patientId)) errors.push('A valid patient is required.');
  if (!isNonEmptyString(body.body) || !isBounded(body.body, 5000)) {
    errors.push('The note cannot be empty, and must be at most 5000 characters.');
  }
  if (
    body.category !== undefined &&
    !NOTE_CATEGORIES.includes(body.category as (typeof NOTE_CATEGORIES)[number])
  ) {
    errors.push(`Category must be one of: ${NOTE_CATEGORIES.join(', ')}.`);
  }
  if (
    body.shift !== undefined &&
    !NURSING_SHIFTS.includes(body.shift as (typeof NURSING_SHIFTS)[number])
  ) {
    errors.push(`Shift must be one of: ${NURSING_SHIFTS.join(', ')}.`);
  }

  if (errors.length) return next(fail(errors));
  next();
};
