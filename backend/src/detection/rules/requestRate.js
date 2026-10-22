import { z } from 'zod';
import { counterKey } from '../state.js';
import { describeSource, thresholdSchema } from './common.js';

const ID = 'request-rate';

export default {
  id: ID,
  name: 'Excessive request rate',
  description:
    'Flags a single source that sends at least `threshold` requests within a sliding time window. ' +
    'Sustained high request rates can indicate automated scanning or flooding of the test device.',
  category: 'excessive-requests',
  defaultSeverity: 'medium',
  defaultAction: 'rate-limit',
  defaultParams: { threshold: 20, windowSeconds: 60 },
  paramFields: [
    { key: 'threshold', label: 'Requests per source', type: 'integer', min: 3, max: 1000 },
    { key: 'windowSeconds', label: 'Window (seconds)', type: 'integer', min: 5, max: 3600 },
  ],
  paramsSchema: z.object({
    threshold: thresholdSchema(3, 1000),
    windowSeconds: thresholdSchema(5, 3600),
  }),

  evaluate(ctx, params) {
    const count = ctx.counters.hit(counterKey(ID, ctx.sourceKey), params.windowSeconds * 1000, ctx.now);
    if (count < params.threshold) return null;
    return {
      reason:
        `${count} requests from ${describeSource(ctx.event)} within ${params.windowSeconds}s ` +
        `(threshold: ${params.threshold}).`,
      evidence: { count, threshold: params.threshold, windowSeconds: params.windowSeconds },
    };
  },
};
