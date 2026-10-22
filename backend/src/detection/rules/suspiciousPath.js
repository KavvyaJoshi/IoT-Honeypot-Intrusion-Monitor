import { z } from 'zod';
import { stringListSchema } from './common.js';

export const DEFAULT_SUSPICIOUS_PATTERNS = [
  '/admin',
  '/wp-admin',
  '/wp-login.php',
  '/xmlrpc.php',
  '/.env',
  '/.git',
  '/.aws',
  '/phpmyadmin',
  '/cgi-bin',
  '/shell',
  '/boaform',
  '/hnap1',
  '/setup.cgi',
  '/goform',
  '/config.php',
  '/server-status',
  '/actuator',
  '/manager/html',
  '/backup',
  '/console',
];

export default {
  id: 'suspicious-path',
  name: 'Sensitive-looking path requested',
  description:
    'Flags requests whose path contains a configured pattern (case-insensitive substring match, ' +
    'no regular expressions). Such paths are commonly probed by automated scanners. A single match ' +
    'is a reconnaissance signal, not a confirmed attack.',
  category: 'suspicious-path',
  defaultSeverity: 'medium',
  defaultAction: 'log',
  defaultParams: { patterns: DEFAULT_SUSPICIOUS_PATTERNS },
  paramFields: [
    { key: 'patterns', label: 'Path patterns', type: 'stringList', maxItems: 50, maxLength: 64 },
  ],
  paramsSchema: z.object({ patterns: stringListSchema({ maxItems: 50, maxLength: 64 }) }),

  evaluate(ctx, params) {
    const candidate = String(ctx.analysis.decodedPath ?? ctx.analysis.rawPath).toLowerCase();
    const pattern = params.patterns.find((p) => candidate.includes(p.toLowerCase()));
    if (!pattern) return null;
    return {
      reason:
        `Requested path "${ctx.event.path}" matches the sensitive-looking pattern "${pattern}". ` +
        'Treated as a reconnaissance signal, not a confirmed attack.',
      evidence: { pattern, path: ctx.event.path },
    };
  },
};
