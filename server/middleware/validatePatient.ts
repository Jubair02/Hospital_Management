import type { RequestHandler } from 'express';
import ApiError from '../utils/ApiError.js';
import { BLOOD_GROUPS, GENDERS, PATIENT_STATUSES } from '../models/Patient.js';

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const PHONE_RE = /^\+?[0-9\s\-()]{7,20}$/;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isOneOf = (values: readonly string[]) => (v: unknown): boolean =>
  typeof v === 'string' && values.includes(v);

const isValidGender = isOneOf(GENDERS);
const isValidBloodGroup = isOneOf(BLOOD_GROUPS);
const isValidStatus = isOneOf(PATIENT_STATUSES);

const isPastOrTodayDate = (v: unknown): boolean => {
  if (typeof v !== 'string' || v.trim() === '') return false;
  const date = new Date(v);
  return !Number.isNaN(date.getTime()) && date.getTime() <= Date.now();
};

const isStringList = (v: unknown): v is string[] =>
  Array.isArray(v) &&
  v.length <= 50 &&
  v.every((item) => typeof item === 'string' && item.trim().length > 0 && item.length <= 300);

const isBoundedString = (v: unknown, max: number): boolean =>
  typeof v === 'string' && v.length <= max;

/**
 * Shared field checks. `partial` controls whether missing required
 * fields are errors (create) or simply skipped (update).
 */
const collectPatientErrors = (body: Record<string, unknown>, partial: boolean): string[] => {
  const errors: string[] = [];

  const requireOrSkip = (value: unknown, missingMessage: string): boolean => {
    if (value === undefined) {
      if (!partial) errors.push(missingMessage);
      return false;
    }
    return true;
  };

  if (requireOrSkip(body.firstName, 'First name is required.') && !isNonEmptyString(body.firstName)) {
    errors.push('First name cannot be empty.');
  }
  if (requireOrSkip(body.lastName, 'Last name is required.') && !isNonEmptyString(body.lastName)) {
    errors.push('Last name cannot be empty.');
  }
  if (
    requireOrSkip(body.dateOfBirth, 'Date of birth is required.') &&
    !isPastOrTodayDate(body.dateOfBirth)
  ) {
    errors.push('Date of birth must be a valid date and cannot be in the future.');
  }
  if (requireOrSkip(body.gender, 'Gender is required.') && !isValidGender(body.gender)) {
    errors.push(`Gender must be one of: ${GENDERS.join(', ')}.`);
  }
  if (
    requireOrSkip(body.phone, 'Phone is required.') &&
    (!isNonEmptyString(body.phone) || !PHONE_RE.test(body.phone.trim()))
  ) {
    errors.push('Phone must be a valid phone number.');
  }

  // Optional fields — validated only when present.
  if (body.bloodGroup !== undefined && !isValidBloodGroup(body.bloodGroup)) {
    errors.push(`Blood group must be one of: ${BLOOD_GROUPS.join(', ')}.`);
  }
  if (body.email !== undefined && body.email !== '' && !(isNonEmptyString(body.email) && EMAIL_RE.test(body.email.trim()))) {
    errors.push('Email must be a valid email address.');
  }
  if (body.medicalHistory !== undefined && !isStringList(body.medicalHistory)) {
    errors.push('Medical history must be a list of short text entries.');
  }
  if (body.allergies !== undefined && !isStringList(body.allergies)) {
    errors.push('Allergies must be a list of short text entries.');
  }

  const boundedFields: Array<[string, number]> = [
    ['address', 300],
    ['emergencyContact', 20],
    ['emergencyContactName', 100],
    ['emergencyContactRelation', 50],
    ['nationalId', 50],
    ['maritalStatus', 30],
    ['occupation', 100],
    ['profileImage', 500],
  ];
  for (const [field, max] of boundedFields) {
    const value = body[field];
    if (value !== undefined && !isBoundedString(value, max)) {
      errors.push(`${field} must be text of at most ${max} characters.`);
    }
  }

  if (body.emergencyContact !== undefined && body.emergencyContact !== '') {
    if (!isNonEmptyString(body.emergencyContact) || !PHONE_RE.test(body.emergencyContact.trim())) {
      errors.push('Emergency contact must be a valid phone number.');
    }
  }

  return errors;
};

/** Request-shape validation for POST /api/patients. */
export const validateCreatePatient: RequestHandler = (req, _res, next) => {
  const errors = collectPatientErrors((req.body ?? {}) as Record<string, unknown>, false);

  if (errors.length) {
    return next(new ApiError(400, errors.join(' ')));
  }

  next();
};

/** Request-shape validation for PATCH /api/patients/:id. */
export const validateUpdatePatient: RequestHandler = (req, _res, next) => {
  const errors = collectPatientErrors((req.body ?? {}) as Record<string, unknown>, true);

  if (errors.length) {
    return next(new ApiError(400, errors.join(' ')));
  }

  next();
};

/** Request-shape validation for PATCH /api/patients/:id/status. */
export const validatePatientStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;

  if (!isValidStatus(status)) {
    return next(new ApiError(400, `Status must be one of: ${PATIENT_STATUSES.join(', ')}.`));
  }

  next();
};

/** Request-shape validation for POST /api/patients/:id/portal-account. */
export const validatePortalAccount: RequestHandler = (req, _res, next) => {
  const { email, password } = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isNonEmptyString(email) || !EMAIL_RE.test(email.trim())) {
    errors.push('A valid email is required.');
  }
  if (typeof password !== 'string' || password.length < 8) {
    errors.push('Password must be at least 8 characters.');
  }

  if (errors.length) {
    return next(new ApiError(400, errors.join(' ')));
  }

  next();
};
