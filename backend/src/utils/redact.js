export const REDACTED = '[REDACTED]';

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-device-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'x-xsrf-token',
]);

// Matches names of fields/params/headers that commonly carry credentials or session data.
const SENSITIVE_NAME = /pass(word|wd)?|pwd|secret|token|api[-_]?key|auth|session|cookie|credential|signature|private[-_]?key|otp|pin$/i;

const MAX_HEADERS = 20;
const MAX_HEADER_VALUE = 256;
const MAX_QUERY_LENGTH = 512;

export function isSensitiveName(name) {
  const lower = String(name).toLowerCase();
  return SENSITIVE_HEADERS.has(lower) || SENSITIVE_NAME.test(lower);
}

/**
 * Makes untrusted text safe to store and display: control characters become visible \xNN
 * escapes (so null bytes or terminal escape sequences cannot hide in logs) and the value is
 * truncated with an explicit marker.
 */
export function sanitizeText(value, maxLength) {
  if (value === undefined || value === null) return null;
  // eslint-disable-next-line no-control-regex
  const escaped = String(value).replace(/[\u0000-\u001f\u007f]/g, (char) =>
    `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`,
  );
  if (escaped.length <= maxLength) return escaped;
  const marker = '…[truncated]';
  return escaped.slice(0, maxLength - marker.length) + marker;
}

/**
 * Keeps at most MAX_HEADERS headers, lower-cases names, truncates values and replaces the
 * value of any credential-bearing header with [REDACTED] so its presence is still visible.
 */
export function redactHeaders(headers) {
  if (!headers || typeof headers !== 'object') return {};
  const result = {};
  for (const [rawName, rawValue] of Object.entries(headers).slice(0, MAX_HEADERS)) {
    const name = sanitizeText(rawName.toLowerCase(), 64);
    result[name] = isSensitiveName(name) ? REDACTED : sanitizeText(rawValue, MAX_HEADER_VALUE);
  }
  return result;
}

/** Redacts the values of sensitive query parameters, e.g. "user=a&password=x" -> "user=a&password=[REDACTED]". */
export function redactQuery(query) {
  if (!query) return null;
  const trimmed = String(query).replace(/^\?/, '');
  if (!trimmed) return null;
  const parts = trimmed.split('&').map((pair) => {
    const separator = pair.indexOf('=');
    const rawKey = separator === -1 ? pair : pair.slice(0, separator);
    let decodedKey = rawKey;
    try {
      decodedKey = decodeURIComponent(rawKey.replace(/\+/g, ' '));
    } catch {
      // Keep the raw key; malformed encoding is reported by the malformed-request rule.
    }
    if (separator !== -1 && isSensitiveName(decodedKey)) return `${rawKey}=${REDACTED}`;
    return pair;
  });
  return sanitizeText(parts.join('&'), MAX_QUERY_LENGTH);
}
