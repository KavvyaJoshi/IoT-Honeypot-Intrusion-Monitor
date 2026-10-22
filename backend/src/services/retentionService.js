import { isDatabaseConnected } from '../config/database.js';
import { Event } from '../models/Event.js';
import { logger } from '../utils/logger.js';
import { getSettings } from './settingsService.js';

/** Deletes events older than retentionDays (0 = keep forever). */
export async function applyRetention(now = Date.now()) {
  const { retentionDays } = getSettings();
  if (!retentionDays || !isDatabaseConnected()) return 0;
  const cutoff = new Date(now - retentionDays * 24 * 60 * 60 * 1000);
  const { deletedCount } = await Event.deleteMany({ timestamp: { $lt: cutoff } });
  if (deletedCount) logger.info(`Retention: deleted ${deletedCount} events older than ${retentionDays} days`);
  return deletedCount;
}

let timer = null;

export function startRetentionJob(intervalMs = 60 * 60 * 1000) {
  stopRetentionJob();
  timer = setInterval(() => {
    applyRetention().catch((error) => logger.warn(`Retention job failed: ${error.message}`));
  }, intervalMs);
  timer.unref?.();
}

export function stopRetentionJob() {
  if (timer) clearInterval(timer);
  timer = null;
}
