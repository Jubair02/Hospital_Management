import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { MEDICINE_STATUSES } from '../models/Medicine.js';
import { CATEGORY_STATUSES } from '../models/MedicineCategory.js';
import { ADJUSTMENT_TYPES } from '../services/pharmacyService.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (errors: string[]): ApiError => new ApiError(400, errors.join(' '));

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isBounded = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max;

const isPositiveInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0;

const isMoney = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0;

const isCalendarDate = (v: unknown): v is string =>
  typeof v === 'string' && DATE_RE.test(v) && !Number.isNaN(new Date(`${v}T00:00:00.000Z`).getTime());

// --- Categories -------------------------------------------------------------

export const validateCategory = (partial: boolean): RequestHandler => (req, _res, next) => {
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

export const validateCategoryStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof status !== 'string' || !(CATEGORY_STATUSES as readonly string[]).includes(status)) {
    return next(fail([`Status must be one of: ${CATEGORY_STATUSES.join(', ')}.`]));
  }
  next();
};

// --- Medicines ---------------------------------------------------------------

export const validateMedicine = (partial: boolean): RequestHandler => (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (body.name === undefined) {
    if (!partial) errors.push('Medicine name is required.');
  } else if (!isNonEmptyString(body.name) || body.name.trim().length > 200) {
    errors.push('Medicine name must be 1–200 characters.');
  }

  if (body.category === undefined) {
    if (!partial) errors.push('Category is required.');
  } else if (!isValidObjectId(body.category)) {
    errors.push('Category must be a valid id.');
  }

  if (body.dosageForm === undefined) {
    if (!partial) errors.push('Dosage form is required.');
  } else if (!isNonEmptyString(body.dosageForm) || body.dosageForm.trim().length > 50) {
    errors.push('Dosage form must be 1–50 characters.');
  }

  for (const [field, max] of [
    ['genericName', 200],
    ['brandName', 200],
    ['strength', 100],
    ['manufacturer', 200],
  ] as const) {
    if (body[field] !== undefined && !isBounded(body[field], max)) {
      errors.push(`${field} must be at most ${max} characters.`);
    }
  }

  if (body.prescriptionRequired !== undefined && typeof body.prescriptionRequired !== 'boolean') {
    errors.push('prescriptionRequired must be true or false.');
  }
  if (
    body.reorderLevel !== undefined &&
    !(typeof body.reorderLevel === 'number' && Number.isInteger(body.reorderLevel) && body.reorderLevel >= 0)
  ) {
    errors.push('Reorder level must be a non-negative integer.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateMedicineStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof status !== 'string' || !(MEDICINE_STATUSES as readonly string[]).includes(status)) {
    return next(fail([`Status must be one of: ${MEDICINE_STATUSES.join(', ')}.`]));
  }
  next();
};

// --- Inventory ----------------------------------------------------------------

export const validateStockIn: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.medicineId)) errors.push('A valid medicine is required.');
  if (!isNonEmptyString(body.batchNumber) || (body.batchNumber as string).length > 100) {
    errors.push('Batch number is required (max 100 characters).');
  }
  if (!isPositiveInt(body.quantity)) errors.push('Quantity must be a positive whole number.');
  if (!isMoney(body.unitCost)) errors.push('Unit cost must be a non-negative number.');
  if (!isMoney(body.sellingPrice)) errors.push('Selling price must be a non-negative number.');
  if (!isCalendarDate(body.expiryDate)) errors.push('Expiry date must be a valid date (YYYY-MM-DD).');
  if (body.manufactureDate !== undefined && body.manufactureDate !== '' && !isCalendarDate(body.manufactureDate)) {
    errors.push('Manufacture date must be a valid date (YYYY-MM-DD).');
  }
  if (body.notes !== undefined && !isBounded(body.notes, 500)) {
    errors.push('Notes must be at most 500 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

export const validateAdjustment: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (
    typeof body.quantityChange !== 'number' ||
    !Number.isInteger(body.quantityChange) ||
    body.quantityChange === 0
  ) {
    errors.push('Quantity change must be a non-zero integer.');
  }
  if (
    body.type !== undefined &&
    (typeof body.type !== 'string' || !(ADJUSTMENT_TYPES as string[]).includes(body.type))
  ) {
    errors.push(`Type must be one of: ${ADJUSTMENT_TYPES.join(', ')}.`);
  }
  if (body.notes !== undefined && !isBounded(body.notes, 500)) {
    errors.push('Notes must be at most 500 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

// --- Dispensing -----------------------------------------------------------------

export const validateDispense: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.consultationId)) errors.push('A valid consultation is required.');

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 30) {
    errors.push('items must be a non-empty list of up to 30 prescription lines.');
  } else {
    body.items.forEach((entry, index) => {
      if (typeof entry !== 'object' || entry === null) {
        errors.push(`Item ${index + 1} is invalid.`);
        return;
      }
      const item = entry as Record<string, unknown>;
      if (
        typeof item.prescriptionIndex !== 'number' ||
        !Number.isInteger(item.prescriptionIndex) ||
        item.prescriptionIndex < 0
      ) {
        errors.push(`Item ${index + 1}: prescriptionIndex must be a non-negative integer.`);
      }
      if (!isValidObjectId(item.medicineId)) {
        errors.push(`Item ${index + 1}: a valid medicine is required.`);
      }
      if (!isPositiveInt(item.quantity)) {
        errors.push(`Item ${index + 1}: quantity must be a positive whole number.`);
      }
      if (item.prescribedQuantity !== undefined && !isPositiveInt(item.prescribedQuantity)) {
        errors.push(`Item ${index + 1}: prescribed quantity must be a positive whole number.`);
      }
    });
  }

  if (errors.length) return next(fail(errors));
  next();
};
