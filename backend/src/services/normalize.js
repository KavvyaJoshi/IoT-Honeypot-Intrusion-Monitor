import { redactHeaders, redactQuery, sanitizeText } from '../utils/redact.js';

const MAX_STORED_PATH = 512;

function safeDecode(value) {
  try {
    return { decoded: decodeURIComponent(value), error: false };
  } catch {
    return { decoded: null, error: true };
  }
}

/**
 * Converts a validated report into the canonical event shape.
 *
 * Returns:
 * - event:    fields that will be persisted (redacted, length-limited, control chars escaped)
 * - analysis: raw path/query values used by detection rules only; never persisted directly
 *
 * The server receive time is the authoritative timestamp; a device-reported observedAt is
 * kept in metadata because ESP8266 clocks are only correct if the firmware syncs NTP.
 */
export function normalizeEvent(input, { sourceType, simulated, now = new Date(), scenario }) {
  let rawPath = input.path;
  let rawQuery = input.query ?? null;
  const queryIndex = rawPath.indexOf('?');
  if (queryIndex !== -1) {
    rawQuery = rawQuery ?? rawPath.slice(queryIndex + 1);
    rawPath = rawPath.slice(0, queryIndex);
  }
  if (rawPath.length === 0) rawPath = '/';

  const { decoded, error } = safeDecode(rawPath);
  const sourceIdentifier = input.clientIp ?? input.sourceIdentifier ?? 'unknown';

  const metadata = {
    headers: redactHeaders(input.headers),
    pathLength: rawPath.length,
  };
  if (input.bodyBytes !== undefined) metadata.bodyBytes = input.bodyBytes;
  if (input.uptimeMs !== undefined) metadata.deviceUptimeMs = input.uptimeMs;
  if (input.observedAt) metadata.deviceObservedAt = input.observedAt;
  if (scenario) metadata.scenario = scenario;

  const event = {
    timestamp: now,
    sourceType,
    simulated: Boolean(simulated),
    deviceId: input.deviceId ?? null,
    sourceIdentifier: sanitizeText(sourceIdentifier, 128),
    clientIp: input.clientIp ?? null,
    method: input.method,
    path: sanitizeText(rawPath, MAX_STORED_PATH),
    query: redactQuery(rawQuery),
    responseStatus: input.responseStatus ?? null,
    userAgent: sanitizeText(input.userAgent, 256),
    loginResult: input.loginResult ?? null,
    metadata,
  };
  if (input.correlationId) event.correlationId = input.correlationId;

  return {
    event,
    analysis: { rawPath, rawQuery, decodedPath: decoded, decodeError: error },
  };
}
