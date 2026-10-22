import { isDatabaseConnected } from '../config/database.js';
import { sanitizeText } from '../utils/redact.js';
import { logger } from '../utils/logger.js';
import { recordBackendEvent } from './eventService.js';

const lastRecorded = new Map();
const MAX_TRACKED = 5000;

/**
 * Persists at most one "api-rate-limit" event per limiter and client per window. Further 429s
 * in the same window are counted only by express-rate-limit. These events bypass the detection
 * engine entirely, so a flood of rejected requests cannot cause a loop of new security events.
 */
export function recordApiRateLimit(req, { limiter, limit, windowMs, simulated = false }) {
  const ip = req.ip ?? 'unknown';
  const key = `${limiter}|${ip}`;
  const now = Date.now();
  if (now - (lastRecorded.get(key) ?? 0) < windowMs) return;
  if (lastRecorded.size >= MAX_TRACKED) lastRecorded.delete(lastRecorded.keys().next().value);
  lastRecorded.set(key, now);

  if (!isDatabaseConnected()) {
    logger.warn(`API rate limit "${limiter}" exceeded by ${ip}; not persisted (database unavailable)`);
    return;
  }

  const windowSeconds = Math.round(windowMs / 1000);
  const reason =
    `HTTP API rate limit "${limiter}" exceeded (${limit} requests per ${windowSeconds}s). The client ` +
    'receives HTTP 429 until the window resets; further 429s in this window are not recorded individually.';

  recordBackendEvent({
    simulated,
    deviceId: null,
    sourceIdentifier: sanitizeText(ip, 128),
    clientIp: sanitizeText(ip, 64),
    method: req.method,
    path: sanitizeText(req.originalUrl.split('?')[0], 512),
    responseStatus: 429,
    userAgent: sanitizeText(req.get('user-agent'), 256),
    category: 'api-rate-limit',
    severity: 'low',
    severityRank: 1,
    classification: 'suspicious',
    detections: [
      {
        ruleId: 'api-rate-limiter',
        ruleName: 'HTTP API rate limiter',
        category: 'api-rate-limit',
        severity: 'low',
        reason,
        evidence: { limiter, limit, windowSeconds },
        recommendedAction: 'rate-limit',
      },
    ],
    detectionReasons: [reason],
    actionTaken: 'rate-limited',
    metadata: { limiter, note: 'API abuse protection (HTTP 429), not a detection-rule verdict.' },
  }).catch((error) => logger.warn(`Failed to record API rate-limit event: ${error.message}`));
}

export function resetApiRateLimitRecords() {
  lastRecorded.clear();
}
