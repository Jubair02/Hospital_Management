import type { RequestHandler } from 'express';
import ApiError from '../utils/ApiError.js';
import { ROLES, STAFF_ROLES, USER_STATUSES } from '../models/User.js';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === 'string' && v.trim().length > 0;

// User management CREATES staff accounts only. Patient portal accounts are
// issued through the patient record so they are always linked to a Patient
// document.
const isValidStaffRole = (v: unknown): boolean =>
  typeof v === 'string' && (STAFF_ROLES as readonly string[]).includes(v);

/**
 * UPDATE accepts any real role at the shape level, because editing an
 * existing patient login legitimately echoes `role: 'patient'` back.
 * Whether a role may actually CHANGE is a policy question that needs the
 * account's current role, so it is enforced in the controller.
 */
const isValidRole = (v: unknown): boolean =>
  typeof v === 'string' && (ROLES as readonly string[]).includes(v);

/** Request-shape validation for POST /api/auth/login. */
export const validateLogin: RequestHandler = (req, _res, next) => {
  const { email, password } = (req.body ?? {}) as Record<string, unknown>;

  if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
    return next(new ApiError(400, 'Email and password are required.'));
  }

  if (!EMAIL_RE.test(email.trim())) {
    return next(new ApiError(400, 'Please provide a valid email address.'));
  }

  next();
};

/** Request-shape validation for POST /api/users. */
export const validateCreateUser: RequestHandler = (req, _res, next) => {
  const { firstName, lastName, email, password, role } = (req.body ?? {}) as Record<
    string,
    unknown
  >;
  const errors: string[] = [];

  if (!isNonEmptyString(firstName)) errors.push('First name is required.');
  if (!isNonEmptyString(lastName)) errors.push('Last name is required.');
  if (!isNonEmptyString(email) || !EMAIL_RE.test(email.trim())) {
    errors.push('A valid email is required.');
  }
  if (typeof password !== 'string' || password.length < 8) {
    errors.push('Password must be at least 8 characters.');
  }
  if (!isValidStaffRole(role)) {
    errors.push(`Role must be one of: ${STAFF_ROLES.join(', ')}.`);
  }

  if (errors.length) {
    return next(new ApiError(400, errors.join(' ')));
  }

  next();
};

/** Request-shape validation for PATCH /api/users/:id. */
export const validateUpdateUser: RequestHandler = (req, _res, next) => {
  const { firstName, lastName, email, password, role, phone, assignedWards } = (req.body ??
    {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (
    assignedWards !== undefined &&
    (!Array.isArray(assignedWards) || assignedWards.some((id) => !isNonEmptyString(id)))
  ) {
    errors.push('Assigned wards must be a list of ward ids.');
  }

  if (firstName !== undefined && !isNonEmptyString(firstName)) {
    errors.push('First name cannot be empty.');
  }
  if (lastName !== undefined && !isNonEmptyString(lastName)) {
    errors.push('Last name cannot be empty.');
  }
  if (email !== undefined && (!isNonEmptyString(email) || !EMAIL_RE.test(email.trim()))) {
    errors.push('Email must be a valid email address.');
  }
  if (password !== undefined && (typeof password !== 'string' || password.length < 8)) {
    errors.push('Password must be at least 8 characters.');
  }
  if (role !== undefined && !isValidRole(role)) {
    errors.push(`Role must be one of: ${ROLES.join(', ')}.`);
  }
  if (phone !== undefined && typeof phone !== 'string') {
    errors.push('Phone must be a string.');
  }

  if (errors.length) {
    return next(new ApiError(400, errors.join(' ')));
  }

  next();
};

/**
 * Request-shape validation for PATCH /api/users/:id/status.
 * Accepts either { isActive: boolean } (original shape) or
 * { status: 'active' | 'inactive' | 'suspended' }.
 */
export const validateStatusUpdate: RequestHandler = (req, _res, next) => {
  const { isActive, status } = (req.body ?? {}) as Record<string, unknown>;

  if (status !== undefined) {
    if (typeof status !== 'string' || !(USER_STATUSES as readonly string[]).includes(status)) {
      return next(new ApiError(400, `status must be one of: ${USER_STATUSES.join(', ')}.`));
    }
    return next();
  }

  if (typeof isActive !== 'boolean') {
    return next(
      new ApiError(400, `Provide isActive (true/false) or status (${USER_STATUSES.join(', ')}).`)
    );
  }

  next();
};

/** Request-shape validation for POST /api/auth/change-password. */
/**
 * A user editing their own staff account.
 *
 * The accepted set is deliberately three fields. `email` is the sign-in
 * credential, so letting someone change it unverified turns a borrowed
 * session into a permanent account takeover; `role` and `status` are
 * privilege, and are the self-escalation guard `updateUser` already carries.
 * Anything outside the list is rejected rather than ignored, so a client
 * sending `role` learns that it did nothing instead of assuming it worked.
 */
export const validateUpdateOwnProfile: RequestHandler = (req, _res, next) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const allowed = ['firstName', 'lastName', 'phone'];
  const errors: string[] = [];

  const rejected = Object.keys(body).filter((key) => !allowed.includes(key));
  if (rejected.length > 0) {
    errors.push(
      `${rejected.join(', ')} cannot be changed here. Ask an administrator to update your ${
        rejected.includes('email') ? 'sign-in email' : 'account'
      }.`
    );
  }

  for (const field of ['firstName', 'lastName'] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > 50) {
      errors.push(`${field === 'firstName' ? 'First' : 'Last'} name must be 1–50 characters.`);
    }
  }

  // Optional, and clearable: an empty string means "remove the number".
  if (body.phone !== undefined) {
    if (typeof body.phone !== 'string' || body.phone.trim().length > 20) {
      errors.push('Phone must be 20 characters or fewer.');
    }
  }

  if (!allowed.some((field) => body[field] !== undefined)) {
    errors.push('Nothing to update.');
  }

  if (errors.length) {
    return next(new ApiError(400, errors.join(' ')));
  }

  next();
};

export const validateChangePassword: RequestHandler = (req, _res, next) => {
  const { currentPassword, newPassword } = (req.body ?? {}) as Record<string, unknown>;
  const errors: string[] = [];

  if (typeof currentPassword !== 'string' || currentPassword.length === 0) {
    errors.push('Your current password is required.');
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    errors.push('The new password must be at least 8 characters.');
  }

  if (errors.length) {
    return next(new ApiError(400, errors.join(' ')));
  }

  next();
};
