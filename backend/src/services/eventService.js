import { evaluateEvent } from '../detection/engine.js';
import { Device } from '../models/Device.js';
import { Event } from '../models/Event.js';
import { broadcast, SOCKET_EVENTS } from '../sockets/realtime.js';
import { AppError } from '../utils/errors.js';
import { normalizeEvent } from './normalize.js';
import { getRuleConfigs } from './ruleService.js';
import { getSettings } from './settingsService.js';

const RECOMMENDED_ACTION = { allowed: 'allow', logged: 'log', 'rate-limited': 'rate-limit', blocked: 'block' };

function isDuplicateKeyError(error) {
  return error?.code === 11000;
}

/**
 * Event processing pipeline shared by device reports and the simulator.
 * Validation (zod) and source authentication happen in middleware before this is called.
 *
 *   normalize + redact -> detect & classify -> enforcement decision -> persist -> broadcast
 *
 * The broadcast only happens after MongoDB acknowledged the insert, so dashboards never show
 * an event that was not stored.
 *
 * @param {object} input  validated ingestEventSchema payload
 * @param {{sourceType: 'device'|'simulator', simulated?: boolean, scenario?: string}} source
 * @returns {Promise<{event: object, duplicate: boolean}>}
 */
export async function ingestEvent(input, { sourceType, simulated = false, scenario } = {}) {
  if (sourceType === 'device') {
    const registered = await Device.exists({ deviceId: input.deviceId });
    if (!registered) {
      throw new AppError(
        404,
        'DEVICE_NOT_REGISTERED',
        `Device "${input.deviceId}" is not registered. Call POST /api/devices/register first.`,
      );
    }
  }

  // Retries from a device that lost the HTTP response reuse the same correlationId.
  if (input.correlationId) {
    const existing = await Event.findOne({ correlationId: input.correlationId });
    if (existing) return { event: existing.toJSON(), duplicate: true };
  }

  const now = new Date();
  const normalized = normalizeEvent(input, { sourceType, simulated, now, scenario });
  const verdict = evaluateEvent(normalized, {
    ruleConfigs: getRuleConfigs(),
    settings: getSettings(),
    now: now.getTime(),
  });
  const { enforcement, ...classification } = verdict;

  let saved;
  try {
    saved = await Event.create({ ...normalized.event, ...classification });
  } catch (error) {
    if (isDuplicateKeyError(error) && input.correlationId) {
      const existing = await Event.findOne({ correlationId: input.correlationId });
      if (existing) return { event: existing.toJSON(), duplicate: true };
    }
    throw error;
  }

  if (sourceType === 'device') {
    await Device.updateOne({ deviceId: input.deviceId }, { $set: { lastSeenAt: now } });
  }

  const event = saved.toJSON();
  broadcast(SOCKET_EVENTS.EVENT_NEW, event);
  return { event, duplicate: false, enforcement };
}

/** Compact verdict for constrained clients such as the ESP8266 (keeps the response small). */
export function toDeviceVerdict(event, enforcement) {
  const verdict = {
    eventId: event.id,
    severity: event.severity,
    classification: event.classification,
    category: event.category,
    actionTaken: event.actionTaken,
    recommendedAction: RECOMMENDED_ACTION[event.actionTaken],
  };
  if (enforcement) {
    verdict.retryAfterSeconds = Math.max(1, Math.ceil((enforcement.until.getTime() - Date.now()) / 1000));
  }
  return verdict;
}

/** Records a backend-originated event (e.g. HTTP API rate limiting) without running detection rules. */
export async function recordBackendEvent(fields) {
  const saved = await Event.create({ sourceType: 'backend', ...fields });
  const event = saved.toJSON();
  broadcast(SOCKET_EVENTS.EVENT_NEW, event);
  return event;
}
