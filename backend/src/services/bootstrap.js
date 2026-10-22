import { detectionState } from '../detection/state.js';
import { logger } from '../utils/logger.js';
import { applyRetention } from './retentionService.js';
import { loadRules } from './ruleService.js';
import { loadSettings } from './settingsService.js';

/** Loads persisted settings and rule configuration once MongoDB is reachable. */
export async function initializeStores() {
  await loadSettings();
  await loadRules();
  logger.info('Loaded settings and detection rules from MongoDB');
  applyRetention().catch((error) => logger.warn(`Initial retention run failed: ${error.message}`));
}

let sweeper = null;

/** Periodically drops idle in-memory detection counters to bound memory usage. */
export function startStateSweeper(intervalMs = 60_000, maxAgeMs = 24 * 60 * 60 * 1000) {
  stopStateSweeper();
  sweeper = setInterval(() => {
    const now = Date.now();
    detectionState.counters.sweep(maxAgeMs, now);
    detectionState.enforcement.list(now);
  }, intervalMs);
  sweeper.unref?.();
}

export function stopStateSweeper() {
  if (sweeper) clearInterval(sweeper);
  sweeper = null;
}
