import { config } from '../config/env.js';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function write(level, message, details) {
  if (LEVELS[level] < threshold) return;
  const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${message}`;
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (details === undefined) out(line);
  else out(line, details);
}

/**
 * Minimal structured logger. Callers must never pass secrets, request bodies or raw
 * headers; HTTP access logging records only method, path, status and duration.
 */
export const logger = {
  debug: (message, details) => write('debug', message, details),
  info: (message, details) => write('info', message, details),
  warn: (message, details) => write('warn', message, details),
  error: (message, details) => write('error', message, details),
};
