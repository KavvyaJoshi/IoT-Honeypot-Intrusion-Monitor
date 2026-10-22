import { config } from '../config/env.js';
import { safeCompare } from '../utils/security.js';
import { serviceUnavailable, unauthorized } from '../utils/errors.js';

/**
 * Device authentication: shared API key in the X-Device-Key header, compared in constant time.
 * The key is never logged, persisted with events (headers are redacted) or returned by the API.
 */
export function requireDeviceKey(req, _res, next) {
  if (!config.deviceApiKey) {
    return next(
      serviceUnavailable('DEVICE_AUTH_NOT_CONFIGURED', 'Device ingestion is disabled: DEVICE_API_KEY is not configured on the server.'),
    );
  }
  if (!safeCompare(req.get('x-device-key') ?? '', config.deviceApiKey)) {
    return next(unauthorized('Missing or invalid X-Device-Key header'));
  }
  return next();
}

function bearerToken(req) {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : '';
}

/** Admin authorization for state-changing dashboard actions: "Authorization: Bearer <ADMIN_TOKEN>". */
export function requireAdmin(req, _res, next) {
  if (!config.adminToken) {
    return next(
      serviceUnavailable('ADMIN_AUTH_NOT_CONFIGURED', 'Administrative actions are disabled: ADMIN_TOKEN is not configured on the server.'),
    );
  }
  if (!safeCompare(bearerToken(req), config.adminToken)) {
    return next(unauthorized('Missing or invalid admin token'));
  }
  return next();
}
