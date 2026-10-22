import { logger } from '../utils/logger.js';

/** Access log with method, path (no query string), status and duration only. Never headers or bodies. */
export function requestLogger(req, res, next) {
  const started = performance.now();
  res.on('finish', () => {
    const duration = Math.round(performance.now() - started);
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'info' : 'debug';
    logger[level](`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
}
