import type { ErrorRequestHandler, RequestHandler } from 'express';
import ApiError from '../utils/ApiError.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

/** The union of error shapes this API can encounter. */
interface KnownError extends Error {
  statusCode?: number;
  code?: number | string; // Mongo duplicate key
  keyValue?: Record<string, unknown>;
  errors?: Record<string, { message: string }>; // Mongoose ValidationError
  path?: string; // Mongoose CastError
  value?: unknown;
  type?: string; // body-parser errors
}

/**
 * Central error handler. Normalizes Mongoose, JWT, and unexpected errors
 * into a consistent { success, message } JSON shape.
 */
export const errorHandler: ErrorRequestHandler = (err: KnownError, req, res, _next) => {
  void _next; // signature must keep 4 args for Express to treat this as an error handler

  let statusCode = err.statusCode ?? 500;
  let message = err.message || 'Internal server error';

  // Invalid MongoDB ObjectId (e.g. GET /api/users/not-an-id)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid value for ${err.path}: ${String(err.value)}`;
  }

  // Mongoose schema validation
  if (err.name === 'ValidationError' && err.errors) {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join('. ');
  }

  // Duplicate key (unique email)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue ?? { field: '' })[0];
    message = field === 'email'
      ? 'A user with this email already exists.'
      : `Duplicate value for ${field}.`;
  }

  // JWT errors that escape the auth middleware
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Invalid or expired authentication token.';
  }

  // Malformed JSON body
  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON in request body.';
  }

  // Never leak internals for unexpected errors in production
  if (statusCode === 500) {
    // req.log is the pino child logger with this request's ID attached.
    (req.log ?? console).error(err);
    if (process.env.NODE_ENV === 'production') {
      message = 'Something went wrong. Please try again later.';
    }
  }

  res.status(statusCode).json({ success: false, message });
};
