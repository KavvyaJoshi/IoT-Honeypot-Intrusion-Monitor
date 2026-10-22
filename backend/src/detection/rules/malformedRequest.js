import { z } from 'zod';
import { stringListSchema, thresholdSchema } from './common.js';

const STANDARD_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const ENCODED_NULL = /%00/i;
const ENCODED_TRAVERSAL = /%2e%2e|\.%2e|%2e\.|%2f\.\.|\.\.%2f|\.\.%5c/i;
const LITERAL_TRAVERSAL = /(^|[/\\])\.\.([/\\]|$)/;
const DOUBLE_ENCODED = /%25[0-9a-f]{2}/i;

export default {
  id: 'malformed-request',
  name: 'Malformed or unexpected request',
  description:
    'Flags requests with structural anomalies: non-standard HTTP methods, paths not starting with "/", ' +
    'oversized paths or query strings, control characters or null bytes, directory-traversal ' +
    'sequences, invalid or double percent-encoding.',
  category: 'malformed-request',
  defaultSeverity: 'medium',
  defaultAction: 'log',
  defaultParams: { maxPathLength: 256, maxQueryLength: 512, allowedMethods: STANDARD_METHODS },
  paramFields: [
    { key: 'maxPathLength', label: 'Max path length', type: 'integer', min: 32, max: 2048 },
    { key: 'maxQueryLength', label: 'Max query length', type: 'integer', min: 32, max: 2048 },
    { key: 'allowedMethods', label: 'Allowed HTTP methods', type: 'stringList', maxItems: 16, maxLength: 16 },
  ],
  paramsSchema: z.object({
    maxPathLength: thresholdSchema(32, 2048),
    maxQueryLength: thresholdSchema(32, 2048),
    allowedMethods: stringListSchema({ maxItems: 16, maxLength: 16, pattern: /^[A-Za-z]+$/ }).transform((list) =>
      list.map((method) => method.toUpperCase()),
    ),
  }),

  evaluate(ctx, params) {
    const { rawPath, rawQuery, decodedPath, decodeError } = ctx.analysis;
    const issues = [];

    if (!params.allowedMethods.includes(ctx.event.method)) issues.push(`non-standard HTTP method "${ctx.event.method}"`);
    if (!rawPath.startsWith('/')) issues.push('path does not start with "/"');
    if (rawPath.length > params.maxPathLength) {
      issues.push(`path length ${rawPath.length} exceeds ${params.maxPathLength}`);
    }
    if (rawQuery && rawQuery.length > params.maxQueryLength) {
      issues.push(`query length ${rawQuery.length} exceeds ${params.maxQueryLength}`);
    }
    if (rawPath.includes('\u0000') || ENCODED_NULL.test(rawPath)) issues.push('null byte in path');
    else if (CONTROL_CHARS.test(rawPath) || (decodedPath && CONTROL_CHARS.test(decodedPath))) {
      issues.push('control characters in path');
    }
    if (
      LITERAL_TRAVERSAL.test(rawPath) ||
      ENCODED_TRAVERSAL.test(rawPath) ||
      (decodedPath && LITERAL_TRAVERSAL.test(decodedPath))
    ) {
      issues.push('directory-traversal sequence');
    }
    if (decodeError) issues.push('invalid percent-encoding');
    if (DOUBLE_ENCODED.test(rawPath)) issues.push('double percent-encoding');

    if (issues.length === 0) return null;
    return {
      reason: `Malformed or unexpected request: ${issues.join('; ')}.`,
      evidence: { issues, method: ctx.event.method, pathLength: rawPath.length },
    };
  },
};
