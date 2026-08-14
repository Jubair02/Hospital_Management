import jwt from 'jsonwebtoken';
import type { RequestHandler } from 'express';
import User, { type Role } from '../models/User.js';
import type { AppJwtPayload } from '../types/auth.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';

/**
 * Verifies the Bearer token and attaches the current user to req.user.
 * The user is re-fetched from the database so deactivated or deleted
 * accounts lose access immediately, even with a valid token.
 */
export const authenticate: RequestHandler = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization ?? '';

  if (!header.startsWith('Bearer ')) {
    throw new ApiError(401, 'Authentication required. Please log in.');
  }

  const token = header.slice(7);

  let payload: AppJwtPayload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET as string) as AppJwtPayload;
  } catch (err) {
    if (err instanceof Error && err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Session expired. Please log in again.');
    }
    throw new ApiError(401, 'Invalid authentication token.');
  }

  const user = await User.findById(payload.userId);

  if (!user) {
    throw new ApiError(401, 'The account for this token no longer exists.');
  }

  if (!user.isActive) {
    throw new ApiError(403, 'This account has been deactivated.');
  }

  req.user = user;
  next();
});

/**
 * Restricts a route to the given roles. Must run after authenticate.
 * Usage: authorize('admin'), authorize('doctor', 'nurse')
 */
export const authorize = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.user) {
    return next(new ApiError(401, 'Authentication required. Please log in.'));
  }

  if (!roles.includes(req.user.role)) {
    return next(new ApiError(403, 'You do not have permission to perform this action.'));
  }

  next();
};
