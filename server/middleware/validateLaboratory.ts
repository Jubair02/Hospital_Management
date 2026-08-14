import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { LAB_TEST_STATUSES, RESULT_TYPES, SAMPLE_TYPES } from '../models/LabTest.js';
import { LAB_CATEGORY_STATUSES } from '../models/LabCategory.js';
import { LAB_PRIORITIES } from '../models/LabOrder.js';

const fail = (errors: string[]): ApiError => new ApiError(400, errors.join(' '));

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isBounded = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max;

const oneOf = (values: readonly string[]) => (v: unknown): boolean =>
  typeof v === 'string' && values.includes(v);

// --- Categories ---

export const validateLabCategory = (partial: boolean): RequestHandler => (req, _res, next) => {
  const { name, description } = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (name === undefined) {
    if (!partial) errors.push('Category name is required.');
  } else if (!isNonEmptyString(name) || name.trim().length > 100) {
    errors.push('Category name must be 1–100 characters.');
  }
  if (description !== undefined && !isBounded(description, 500)) {
    errors.push('Description must be at most 500 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateLabCategoryStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (!oneOf(LAB_CATEGORY_STATUSES)(status)) {
    return next(fail([`Status must be one of: ${LAB_CATEGORY_STATUSES.join(', ')}.`]));
  }
  next();
};

// --- Tests ---

export const validateLabTest = (partial: boolean): RequestHandler => (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (body.name === undefined) {
    if (!partial) errors.push('Test name is required.');
  } else if (!isNonEmptyString(body.name) || body.name.trim().length > 200) {
    errors.push('Test name must be 1–200 characters.');
  }

  if (body.category === undefined) {
    if (!partial) errors.push('Category is required.');
  } else if (!isValidObjectId(body.category)) {
    errors.push('Category must be a valid id.');
  }

  if (body.sampleType === undefined) {
    if (!partial) errors.push('Sample type is required.');
  } else if (!oneOf(SAMPLE_TYPES)(body.sampleType)) {
    errors.push(`Sample type must be one of: ${SAMPLE_TYPES.join(', ')}.`);
  }

  if (body.price === undefined) {
    if (!partial) errors.push('Price is required.');
  } else if (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0) {
    errors.push('Price must be a non-negative number.');
  }

  if (body.resultType !== undefined && !oneOf(RESULT_TYPES)(body.resultType)) {
    errors.push(`Result type must be one of: ${RESULT_TYPES.join(', ')}.`);
  }

  for (const [field, max] of [
    ['description', 1000],
    ['preparationInstructions', 1000],
    ['turnaroundTime', 100],
    ['unit', 50],
    ['referenceRange', 200],
  ] as const) {
    if (body[field] !== undefined && !isBounded(body[field], max)) {
      errors.push(`${field} must be at most ${max} characters.`);
    }
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateLabTestStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (!oneOf(LAB_TEST_STATUSES)(status)) {
    return next(fail([`Status must be one of: ${LAB_TEST_STATUSES.join(', ')}.`]));
  }
  next();
};

// --- Orders ---

export const validateCreateLabOrder: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.consultationId)) {
    errors.push('A valid consultation is required.');
  }
  if (
    !Array.isArray(body.tests) ||
    body.tests.length === 0 ||
    body.tests.length > 20 ||
    !body.tests.every((t) => isValidObjectId(t))
  ) {
    errors.push('tests must be a list of 1–20 valid test ids.');
  }
  if (body.clinicalNotes !== undefined && !isBounded(body.clinicalNotes, 1000)) {
    errors.push('Clinical notes must be at most 1000 characters.');
  }
  if (body.priority !== undefined && !oneOf(LAB_PRIORITIES)(body.priority)) {
    errors.push(`Priority must be one of: ${LAB_PRIORITIES.join(', ')}.`);
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateCancelOrder: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  // Cancellation is the ONLY direct status change; everything else moves
  // through the sample/result workflow.
  if (status !== 'cancelled') {
    return next(
      fail(['Only cancellation is allowed here — other statuses advance through the lab workflow.'])
    );
  }
  next();
};

// --- Samples ---

export const validateCollectSample: RequestHandler = (req, _res, next) => {
  const { notes } = (req.body ?? {}) as Record<string, unknown>;
  if (notes !== undefined && !isBounded(notes, 500)) {
    return next(fail(['Notes must be at most 500 characters.']));
  }
  next();
};

export const validateRejectSample: RequestHandler = (req, _res, next) => {
  const { reason } = (req.body ?? {}) as Record<string, unknown>;
  if (!isNonEmptyString(reason) || reason.trim().length > 500) {
    return next(fail(['A rejection reason is required (max 500 characters).']));
  }
  next();
};

// --- Results ---

export const validateEnterResult: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isNonEmptyString(body.value) || (body.value as string).length > 500) {
    errors.push('A result value is required (max 500 characters).');
  }
  for (const [field, max] of [
    ['unit', 50],
    ['referenceRange', 200],
    ['interpretation', 1000],
    ['notes', 1000],
  ] as const) {
    if (body[field] !== undefined && !isBounded(body[field], max)) {
      errors.push(`${field} must be at most ${max} characters.`);
    }
  }

  if (errors.length) return next(fail(errors));
  next();
};
