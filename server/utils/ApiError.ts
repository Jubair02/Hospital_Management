/**
 * Operational error with an HTTP status code. Thrown by controllers and
 * middleware, converted to a JSON response by the error handler.
 */
class ApiError extends Error {
  readonly statusCode: number;
  readonly isOperational = true;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export default ApiError;
