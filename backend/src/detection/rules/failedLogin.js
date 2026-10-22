import { z } from 'zod';
import { counterKey } from '../state.js';
import { comparablePath, describeSource, thresholdSchema } from './common.js';

const ID = 'failed-login';

function isFailedAttempt(event) {
  if (event.loginResult) return event.loginResult === 'failed';
  return event.responseStatus === 401 || event.responseStatus === 403;
}

export default {
  id: ID,
  name: 'Repeated failed test-login attempts',
  description:
    'Counts failed attempts against the designated test login endpoint(s) configured in Settings ' +
    '(default /login). A failure is loginResult="failed", or HTTP 401/403 when loginResult is absent. ' +
    'Repeated failures are consistent with password guessing; credentials themselves are never stored.',
  category: 'repeated-failed-login',
  defaultSeverity: 'high',
  defaultAction: 'block',
  defaultParams: { threshold: 5, windowSeconds: 300 },
  paramFields: [
    { key: 'threshold', label: 'Failed attempts', type: 'integer', min: 2, max: 100 },
    { key: 'windowSeconds', label: 'Window (seconds)', type: 'integer', min: 10, max: 86400 },
  ],
  paramsSchema: z.object({
    threshold: thresholdSchema(2, 100),
    windowSeconds: thresholdSchema(10, 86400),
  }),

  evaluate(ctx, params) {
    const loginPaths = ctx.settings.testLoginPaths.map(comparablePath);
    const path = comparablePath(ctx.analysis.decodedPath ?? ctx.analysis.rawPath);
    if (!loginPaths.includes(path) || !isFailedAttempt(ctx.event)) return null;

    const count = ctx.counters.hit(counterKey(ID, ctx.sourceKey), params.windowSeconds * 1000, ctx.now);
    if (count < params.threshold) return null;
    return {
      reason:
        `${count} failed login attempts against test endpoint ${path} from ${describeSource(ctx.event)} ` +
        `within ${params.windowSeconds}s (threshold: ${params.threshold}). Consistent with password ` +
        'guessing; this does not identify who controls the source.',
      evidence: { count, threshold: params.threshold, windowSeconds: params.windowSeconds, endpoint: path },
    };
  },
};
