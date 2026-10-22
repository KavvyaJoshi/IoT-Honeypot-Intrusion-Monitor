import { z } from 'zod';
import { counterKey } from '../state.js';
import { thresholdSchema } from './common.js';

const ID = 'traffic-anomaly';
const WINDOW_MS = 60_000;

export default {
  id: ID,
  name: 'Abnormal request frequency vs. baseline',
  description:
    'Compares the total request rate observed by one device (all sources combined, 60s window) with ' +
    'a configured baseline. Flags when the rate exceeds baseline × multiplier. Useful for spotting ' +
    'distributed bursts that per-source rules miss. The baseline is static, not learned.',
  category: 'traffic-anomaly',
  defaultSeverity: 'low',
  defaultAction: 'log',
  defaultParams: { baselinePerMinute: 60, multiplier: 3 },
  paramFields: [
    { key: 'baselinePerMinute', label: 'Baseline (requests/min)', type: 'integer', min: 1, max: 10000 },
    { key: 'multiplier', label: 'Multiplier', type: 'integer', min: 2, max: 50 },
  ],
  paramsSchema: z.object({
    baselinePerMinute: thresholdSchema(1, 10000),
    multiplier: thresholdSchema(2, 50),
  }),

  evaluate(ctx, params) {
    const scope = `${ctx.event.sourceType}|${ctx.event.deviceId ?? '-'}`;
    const count = ctx.counters.hit(counterKey(ID, scope), WINDOW_MS, ctx.now);
    const limit = params.baselinePerMinute * params.multiplier;
    if (count <= limit) return null;
    const target = ctx.event.deviceId ? `device ${ctx.event.deviceId}` : `${ctx.event.sourceType} traffic`;
    return {
      reason:
        `Request rate for ${target} is ${count}/min, above ${params.multiplier}× the configured ` +
        `baseline of ${params.baselinePerMinute}/min (limit: ${limit}/min).`,
      evidence: { countPerMinute: count, baselinePerMinute: params.baselinePerMinute, multiplier: params.multiplier },
    };
  },
};
