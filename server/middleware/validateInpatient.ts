import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { WARD_STATUSES, WARD_TYPES } from '../models/Ward.js';
import { BED_STATUSES } from '../models/Bed.js';
import { ADMISSION_TYPES } from '../models/Admission.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (errors: string[]): ApiError => new ApiError(400, errors.join(' '));

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isBounded = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max;

const oneOf = (values: readonly string[]) => (v: unknown): boolean =>
  typeof v === 'string' && values.includes(v);

// --- Wards ---

export const validateWard = (partial: boolean): RequestHandler => (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (body.name === undefined) {
    if (!partial) errors.push('Ward name is required.');
  } else if (!isNonEmptyString(body.name) || body.name.trim().length > 100) {
    errors.push('Ward name must be 1–100 characters.');
  }

  if (body.type === undefined) {
    if (!partial) errors.push('Ward type is required.');
  } else if (!oneOf(WARD_TYPES)(body.type)) {
    errors.push(`Ward type must be one of: ${WARD_TYPES.join(', ')}.`);
  }

  if (body.department !== undefined && body.department !== '' && !isValidObjectId(body.department)) {
    errors.push('Department must be a valid id.');
  }
  if (body.floor !== undefined && !isBounded(body.floor, 50)) {
    errors.push('Floor must be at most 50 characters.');
  }
  if (body.description !== undefined && !isBounded(body.description, 500)) {
    errors.push('Description must be at most 500 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateWardStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (!oneOf(WARD_STATUSES)(status)) {
    return next(fail([`Status must be one of: ${WARD_STATUSES.join(', ')}.`]));
  }
  next();
};

// --- Beds ---

export const validateBed = (partial: boolean): RequestHandler => (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (body.wardId === undefined) {
    if (!partial) errors.push('Ward is required.');
  } else if (!isValidObjectId(body.wardId)) {
    errors.push('Ward must be a valid id.');
  }

  if (body.bedNumber === undefined) {
    if (!partial) errors.push('Bed number is required.');
  } else if (!isNonEmptyString(body.bedNumber) || body.bedNumber.trim().length > 50) {
    errors.push('Bed number must be 1–50 characters.');
  }

  if (body.bedType !== undefined && !isBounded(body.bedType, 50)) {
    errors.push('Bed type must be at most 50 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

/** Manual bed status changes cover everything EXCEPT occupation. */
export const validateBedStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (!oneOf(BED_STATUSES)(status)) {
    return next(fail([`Status must be one of: ${BED_STATUSES.join(', ')}.`]));
  }
  if (status === 'occupied') {
    return next(fail(['Beds become occupied only through admission or transfer.']));
  }
  next();
};

// --- Admissions ---

export const validateAdmission: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  for (const field of ['patientId', 'doctorId', 'wardId', 'bedId'] as const) {
    if (!isValidObjectId(body[field])) errors.push(`A valid ${field.replace('Id', '')} is required.`);
  }
  if (body.appointmentId !== undefined && !isValidObjectId(body.appointmentId)) {
    errors.push('appointmentId must be a valid id.');
  }
  if (!isNonEmptyString(body.reason) || (body.reason as string).length > 500) {
    errors.push('Admission reason is required (max 500 characters).');
  }
  if (!oneOf(ADMISSION_TYPES)(body.admissionType)) {
    errors.push(`Admission type must be one of: ${ADMISSION_TYPES.join(', ')}.`);
  }
  if (
    body.expectedDischargeDate !== undefined &&
    body.expectedDischargeDate !== '' &&
    (typeof body.expectedDischargeDate !== 'string' || !DATE_RE.test(body.expectedDischargeDate))
  ) {
    errors.push('Expected discharge date must be a valid date (YYYY-MM-DD).');
  }
  if (body.notes !== undefined && !isBounded(body.notes, 1000)) {
    errors.push('Notes must be at most 1000 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateTransfer: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.admissionId)) errors.push('A valid admission is required.');
  if (!isValidObjectId(body.toWardId)) errors.push('A valid target ward is required.');
  if (!isValidObjectId(body.toBedId)) errors.push('A valid target bed is required.');
  if (body.reason !== undefined && !isBounded(body.reason, 500)) {
    errors.push('Reason must be at most 500 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateDischarge: RequestHandler = (req, _res, next) => {
  const { notes } = (req.body ?? {}) as Record<string, unknown>;
  if (notes !== undefined && !isBounded(notes, 1000)) {
    return next(fail(['Notes must be at most 1000 characters.']));
  }
  next();
};
