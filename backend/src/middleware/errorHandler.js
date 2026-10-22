import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `No API route for ${req.method} ${req.path}`));
}

/** Converts errors into { error: { code, message, details? } } without leaking internals. */
// eslint-disable-next-line no-unused-vars
export function errorHandler(error, req, res, _next) {
  if (error instanceof AppError) {
    const body = { error: { code: error.code, message: error.message } };
    if (error.details) body.error.details = error.details;
    return res.status(error.status).json(body);
  }

  // body-parser errors
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds the 8 KB limit' } });
  }
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'MALFORMED_JSON', message: 'Request body is not valid JSON' } });
  }
  if (error?.type === 'encoding.unsupported' || error?.type === 'charset.unsupported') {
    return res.status(415).json({ error: { code: 'UNSUPPORTED_ENCODING', message: 'Unsupported request encoding' } });
  }

  // Mongo/Mongoose connectivity failures that slipped past requireDatabase.
  if (['MongoNotConnectedError', 'MongoServerSelectionError', 'MongooseServerSelectionError'].includes(error?.name)) {
    return res.status(503).json({ error: { code: 'DATABASE_UNAVAILABLE', message: 'MongoDB is not reachable' } });
  }
  if (error?.name === 'ValidationError') {
    return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Data failed schema validation' } });
  }

  logger.error(`Unhandled error on ${req.method} ${req.path}: ${error?.stack ?? error}`);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } });
}
