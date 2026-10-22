import { z } from 'zod';
import { counterKey } from '../state.js';
import { describeSource, thresholdSchema } from './common.js';

const ID = 'not-found-repeat';

export default {
  id: ID,
  name: 'Repeated requests to nonexistent routes',
  description:
    'Counts HTTP 404 responses per source. Many 404s in a short window suggest route enumeration ' +
    '(guessing URLs). Requires the reporter to include responseStatus.',
  category: 'route-enumeration',
  defaultSeverity: 'medium',
  defaultAction: 'log',
  defaultParams: { threshold: 10, windowSeconds: 120 },
  paramFields: [
    { key: 'threshold', label: '404 responses', type: 'integer', min: 2, max: 1000 },
    { key: 'windowSeconds', label: 'Window (seconds)', type: 'integer', min: 10, max: 3600 },
  ],
  paramsSchema: z.object({
    threshold: thresholdSchema(2, 1000),
    windowSeconds: thresholdSchema(10, 3600),
  }),

  evaluate(ctx, params) {
    if (ctx.event.responseStatus !== 404) return null;
    const count = ctx.counters.hit(counterKey(ID, ctx.sourceKey), params.windowSeconds * 1000, ctx.now);
    if (count < params.threshold) return null;
    return {
      reason:
        `${count} requests to nonexistent routes (HTTP 404) from ${describeSource(ctx.event)} ` +
        `within ${params.windowSeconds}s (threshold: ${params.threshold}). Possible route enumeration.`,
      evidence: { count, threshold: params.threshold, windowSeconds: params.windowSeconds },
    };
  },
};
