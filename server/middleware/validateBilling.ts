import type { RequestHandler } from 'express';
import { isValidObjectId } from 'mongoose';
import ApiError from '../utils/ApiError.js';
import { ITEM_TYPES } from '../models/Invoice.js';
import { PAYMENT_METHODS } from '../models/Payment.js';

const fail = (errors: string[]): ApiError => new ApiError(400, errors.join(' '));

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

const isBounded = (v: unknown, max: number): boolean => typeof v === 'string' && v.length <= max;

const isMoney = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100_000_000;

const validateItems = (items: unknown, errors: string[]): void => {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    errors.push('items must be a non-empty list of up to 50 entries.');
    return;
  }
  items.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      errors.push(`Item ${index + 1} is invalid.`);
      return;
    }
    const item = entry as Record<string, unknown>;
    if (typeof item.itemType !== 'string' || !(ITEM_TYPES as readonly string[]).includes(item.itemType)) {
      errors.push(`Item ${index + 1}: type must be one of ${ITEM_TYPES.join(', ')}.`);
    }
    if (item.referenceId !== undefined && !isValidObjectId(item.referenceId)) {
      errors.push(`Item ${index + 1}: referenceId must be a valid id.`);
    }
    if (!isNonEmptyString(item.description) || (item.description as string).length > 300) {
      errors.push(`Item ${index + 1}: description is required (max 300 characters).`);
    }
    if (
      typeof item.quantity !== 'number' ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 10_000
    ) {
      errors.push(`Item ${index + 1}: quantity must be a positive whole number.`);
    }
    if (!isMoney(item.unitPrice)) {
      errors.push(`Item ${index + 1}: unit price must be a non-negative number.`);
    }
  });
};

/** POST /api/billing/invoices */
export const validateCreateInvoice: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.patientId)) errors.push('A valid patient is required.');
  if (body.appointmentId !== undefined && !isValidObjectId(body.appointmentId)) {
    errors.push('appointmentId must be a valid id.');
  }
  validateItems(body.items, errors);
  if (body.discount !== undefined && !isMoney(body.discount)) {
    errors.push('Discount must be a non-negative number.');
  }
  if (body.tax !== undefined && !isMoney(body.tax)) {
    errors.push('Tax must be a non-negative number.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

/** PATCH /api/billing/invoices/:id (draft only) */
export const validateUpdateInvoice: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  validateItems(body.items, errors);
  if (body.discount !== undefined && !isMoney(body.discount)) {
    errors.push('Discount must be a non-negative number.');
  }
  if (body.tax !== undefined && !isMoney(body.tax)) {
    errors.push('Tax must be a non-negative number.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

/** PATCH /api/billing/invoices/:id/status — issue or cancel. */
export const validateInvoiceStatus: RequestHandler = (req, _res, next) => {
  const { status } = (req.body ?? {}) as Record<string, unknown>;
  if (status !== 'issued' && status !== 'cancelled') {
    return next(fail(['Status must be "issued" or "cancelled".']));
  }
  next();
};

/** POST /api/billing/payments */
export const validateRecordPayment: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.invoiceId)) errors.push('A valid invoice is required.');
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
    errors.push('Payment amount must be a positive number.');
  }
  if (typeof body.method !== 'string' || !(PAYMENT_METHODS as readonly string[]).includes(body.method)) {
    errors.push(`Method must be one of: ${PAYMENT_METHODS.join(', ')}.`);
  }
  if (body.transactionReference !== undefined && !isBounded(body.transactionReference, 200)) {
    errors.push('Transaction reference must be at most 200 characters.');
  }
  if (body.notes !== undefined && !isBounded(body.notes, 500)) {
    errors.push('Notes must be at most 500 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};

/** POST /api/billing/refunds */
export const validateRefund: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (!isValidObjectId(body.paymentId)) errors.push('A valid payment is required.');
  if (typeof body.amount !== 'number' || !Number.isFinite(body.amount) || body.amount <= 0) {
    errors.push('Refund amount must be a positive number.');
  }
  if (body.notes !== undefined && !isBounded(body.notes, 500)) {
    errors.push('Notes must be at most 500 characters.');
  }

  if (errors.length) return next(fail(errors));
  next();
};
