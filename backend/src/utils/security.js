import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string comparison. Both values are hashed first so that inputs of different
 * lengths can be compared without leaking the expected length through timing.
 */
export function safeCompare(provided, expected) {
  if (typeof provided !== 'string' || typeof expected !== 'string' || expected.length === 0) {
    return false;
  }
  const a = createHash('sha256').update(provided, 'utf8').digest();
  const b = createHash('sha256').update(expected, 'utf8').digest();
  return timingSafeEqual(a, b);
}

/** Escapes user input for safe use inside a RegExp (prevents regex injection / ReDoS). */
export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
