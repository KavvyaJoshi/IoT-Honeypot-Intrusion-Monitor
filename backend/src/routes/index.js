import { Router } from 'express';
import { z } from 'zod';
import * as devices from '../controllers/deviceController.js';
import * as events from '../controllers/eventController.js';
import * as health from '../controllers/healthController.js';
import * as rules from '../controllers/ruleController.js';
import * as settings from '../controllers/settingsController.js';
import * as simulator from '../controllers/simulatorController.js';
import { requireAdmin, requireDeviceKey } from '../middleware/auth.js';
import { requireDatabase, requireSimulatorEnabled } from '../middleware/guards.js';
import { validate } from '../middleware/validate.js';
import { rulePatchSchema } from '../services/ruleService.js';
import { settingsPatchSchema } from '../services/settingsService.js';
import { simulatorRunSchema } from '../services/simulatorService.js';
import {
  deviceIdParamSchema,
  heartbeatSchema,
  ingestEventSchema,
  listEventsQuerySchema,
  objectIdParamSchema,
  rangeQuerySchema,
  registerDeviceSchema,
} from '../validation/schemas.js';

const ruleIdParamSchema = z.object({ id: z.string().regex(/^[a-z0-9-]{1,64}$/, 'must be a rule id') });
const resetBodySchema = z.object({
  confirm: z.literal('DELETE_SIMULATOR_DATA', { error: 'confirm must equal "DELETE_SIMULATOR_DATA"' }),
});

/**
 * Route map. Middleware order per route: rate limiter -> authentication -> DB guard -> validation -> handler.
 * Rate limiting runs first so unauthenticated floods are rejected cheaply.
 */
export function createApiRouter(limiters) {
  const router = Router();

  // Health (public)
  router.get('/health', limiters.public, health.getHealth);
  router.get('/health/database', limiters.public, health.getDatabaseHealth);

  // Admin token check used by the dashboard's unlock dialog
  router.get('/auth/verify', limiters.public, requireAdmin, settings.verifyAdmin);

  // Events
  router.post('/events/ingest', limiters.device, requireDeviceKey, requireDatabase, validate(ingestEventSchema), events.ingest);
  router.get('/events/stats', limiters.public, requireDatabase, validate(rangeQuerySchema, 'query'), events.getStats);
  router.get('/events', limiters.public, requireDatabase, validate(listEventsQuerySchema, 'query'), events.listEvents);
  router.get('/events/:id', limiters.public, requireDatabase, validate(objectIdParamSchema, 'params'), events.getEvent);

  // Devices
  router.post('/devices/register', limiters.device, requireDeviceKey, requireDatabase, validate(registerDeviceSchema), devices.register);
  router.post('/devices/heartbeat', limiters.device, requireDeviceKey, requireDatabase, validate(heartbeatSchema), devices.heartbeat);
  router.get('/devices/setup', limiters.public, devices.setup);
  router.get('/devices/activity', limiters.public, requireDatabase, validate(rangeQuerySchema, 'query'), devices.activity);
  router.get('/devices', limiters.public, requireDatabase, devices.list);
  router.get('/devices/:id', limiters.public, requireDatabase, validate(deviceIdParamSchema, 'params'), devices.getOne);

  // Detection rules
  router.get('/rules', limiters.public, rules.list);
  router.patch(
    '/rules/:id',
    limiters.public,
    requireAdmin,
    requireDatabase,
    validate(ruleIdParamSchema, 'params'),
    validate(rulePatchSchema),
    rules.update,
  );
  router.get('/detection/stats', limiters.public, requireDatabase, validate(rangeQuerySchema, 'query'), rules.detectionStats);

  // Simulator (admin only, can be disabled entirely with SIMULATOR_ENABLED=false)
  router.get('/simulator/scenarios', limiters.public, requireSimulatorEnabled, simulator.scenarios);
  router.post(
    '/simulator/events',
    limiters.simulator,
    requireSimulatorEnabled,
    requireAdmin,
    requireDatabase,
    validate(simulatorRunSchema),
    simulator.run,
  );
  router.post(
    '/simulator/reset',
    limiters.simulator,
    requireSimulatorEnabled,
    requireAdmin,
    requireDatabase,
    validate(resetBodySchema),
    simulator.reset,
  );
  router.post('/simulator/rate-limit-probe', requireSimulatorEnabled, requireAdmin, limiters.probe, simulator.probe);

  // Settings
  router.get('/settings', limiters.public, settings.get);
  router.patch('/settings', limiters.public, requireAdmin, requireDatabase, validate(settingsPatchSchema), settings.update);

  return router;
}
