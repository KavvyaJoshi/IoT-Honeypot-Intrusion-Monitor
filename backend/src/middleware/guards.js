import { config } from '../config/env.js';
import { isDatabaseConnected } from '../config/database.js';
import { forbidden, serviceUnavailable } from '../utils/errors.js';

/** Rejects requests that need MongoDB while it is down, instead of pretending data was stored. */
export function requireDatabase(_req, _res, next) {
  if (isDatabaseConnected()) return next();
  return next(
    serviceUnavailable(
      'DATABASE_UNAVAILABLE',
      'MongoDB is not connected, so this request cannot be processed or persisted. Start MongoDB and check MONGODB_URI; the server reconnects automatically.',
    ),
  );
}

export function requireSimulatorEnabled(_req, _res, next) {
  if (config.simulatorEnabled) return next();
  return next(forbidden('The simulator is disabled on this server (SIMULATOR_ENABLED=false).'));
}
