/**
 * Error type for expected, client-safe failures. Anything that is not an AppError is
 * treated as an internal error and its message is hidden from API responses.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details);
export const notFound = (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message);
export const serviceUnavailable = (code, message) => new AppError(503, code, message);
