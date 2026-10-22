import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';
import { recordApiRateLimit } from '../services/apiRateLimitService.js';

/**
 * API abuse protection (HTTP 429). This is separate from the detection engine: limiters
 * protect the backend's own endpoints, while detection rules analyse traffic the honeypot
 * device observed. Counters are in-memory per process (see docs/ARCHITECTURE.md).
 */
export function createRateLimiter({ name, windowMs, limit, simulated = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler(req, res) {
      recordApiRateLimit(req, { limiter: name, limit, windowMs, simulated });
      const resetTime = req.rateLimit?.resetTime;
      const retryAfterSeconds = resetTime ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000)) : Math.ceil(windowMs / 1000);
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: `Too many requests to the ${name} API. Try again in ${retryAfterSeconds}s.`,
          retryAfterSeconds,
        },
      });
    },
  });
}

export function createRateLimiters(rateLimits = config.rateLimits) {
  return {
    public: createRateLimiter({ name: 'public', windowMs: rateLimits.windowMs, limit: rateLimits.publicMax }),
    device: createRateLimiter({ name: 'device', windowMs: rateLimits.windowMs, limit: rateLimits.deviceMax }),
    simulator: createRateLimiter({ name: 'simulator', windowMs: rateLimits.windowMs, limit: rateLimits.simulatorMax }),
    // Deliberately tiny limit used by the dashboard's "API rate limiter" demonstration.
    probe: createRateLimiter({
      name: 'rate-limit-probe',
      windowMs: rateLimits.probeWindowMs,
      limit: rateLimits.probeMax,
      simulated: true,
    }),
  };
}
