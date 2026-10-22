import { z } from 'zod';

export const thresholdSchema = (min, max) => z.int().min(min).max(max);

export const stringListSchema = ({ maxItems = 50, maxLength = 64, pattern = /^[\x21-\x7e]+$/ } = {}) =>
  z
    .array(z.string().trim().min(1).max(maxLength).regex(pattern, 'contains unsupported characters'))
    .min(1)
    .max(maxItems);

/** Human-friendly label for the source of an event, used in detection reasons. */
export function describeSource(event) {
  return event.clientIp ? `client ${event.clientIp}` : `source "${event.sourceIdentifier}"`;
}

/** Lower-cases a path and strips the query string and a trailing slash for comparisons. */
export function comparablePath(path) {
  const withoutQuery = String(path).split('?')[0].toLowerCase();
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/+$/, '') : withoutQuery;
}
