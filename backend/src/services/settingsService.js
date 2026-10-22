import { z } from 'zod';
import { config } from '../config/env.js';
import { isDatabaseConnected } from '../config/database.js';
import { Setting } from '../models/Setting.js';
import { stringListSchema } from '../detection/rules/common.js';
import { broadcast, SOCKET_EVENTS } from '../sockets/realtime.js';
import { badRequest } from '../utils/errors.js';

export const DEFAULT_SETTINGS = Object.freeze({
  heartbeatTimeoutSeconds: 90,
  recommendedHeartbeatIntervalSeconds: 30,
  retentionDays: 30,
  enforcementDurationSeconds: 300,
  testLoginPaths: ['/login'],
});

export const settingsSchema = z.object({
  heartbeatTimeoutSeconds: z.int().min(15).max(3600),
  recommendedHeartbeatIntervalSeconds: z.int().min(5).max(1800),
  retentionDays: z.int().min(0).max(365),
  enforcementDurationSeconds: z.int().min(10).max(86400),
  testLoginPaths: stringListSchema({ maxItems: 10, maxLength: 64, pattern: /^\/[\x21-\x7e]*$/ }),
});

export const settingsPatchSchema = settingsSchema
  .partial()
  .strict()
  .refine((patch) => Object.keys(patch).length > 0, 'provide at least one setting');

let current = { ...DEFAULT_SETTINGS };

export function getSettings() {
  return current;
}

/** Loads persisted settings (seeding defaults on first run). Invalid stored values fall back to defaults. */
export async function loadSettings() {
  const doc = await Setting.findOneAndUpdate(
    { key: 'global' },
    { $setOnInsert: { key: 'global', values: DEFAULT_SETTINGS } },
    { upsert: true, new: true },
  ).lean();
  const parsed = settingsSchema.safeParse({ ...DEFAULT_SETTINGS, ...(doc?.values ?? {}) });
  current = parsed.success ? parsed.data : { ...DEFAULT_SETTINGS };
  return current;
}

export async function updateSettings(patch) {
  const merged = { ...current, ...patch };
  const parsed = settingsSchema.safeParse(merged);
  if (!parsed.success) throw badRequest('Invalid settings', parsed.error.issues);
  if (parsed.data.recommendedHeartbeatIntervalSeconds >= parsed.data.heartbeatTimeoutSeconds) {
    throw badRequest('recommendedHeartbeatIntervalSeconds must be lower than heartbeatTimeoutSeconds');
  }
  await Setting.updateOne({ key: 'global' }, { $set: { values: parsed.data } }, { upsert: true });
  current = parsed.data;
  broadcast(SOCKET_EVENTS.SETTINGS_UPDATED, current);
  return current;
}

export function resetSettingsCache() {
  current = { ...DEFAULT_SETTINGS };
}

/**
 * Environment-derived configuration that is safe to show in the dashboard. Secrets are
 * reported only as configured/not configured; the MongoDB URI is never included.
 */
export function publicEnvironment() {
  return {
    nodeEnv: config.nodeEnv,
    port: config.port,
    simulatorEnabled: config.simulatorEnabled,
    host: config.host,
    corsOrigins: config.corsOrigins,
    corsAllowLanOrigins: config.corsAllowLanOrigins,
    lanFrontendPorts: config.lanFrontendPorts,
    trustProxy: config.trustProxy,
    adminTokenConfigured: Boolean(config.adminToken),
    deviceApiKeyConfigured: Boolean(config.deviceApiKey),
    databaseConnected: isDatabaseConnected(),
    maxRequestBodyBytes: 8192,
    rateLimits: { ...config.rateLimits },
  };
}
