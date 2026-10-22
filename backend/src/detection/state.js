import { RULE_ACTION_RANK } from './constants.js';

const MAX_KEYS = 20000;
const MAX_HITS_PER_KEY = 2000;

/**
 * Short-term, in-process detection state.
 *
 * LIMITATIONS (by design for a single-node student prototype):
 * - State lives in this Node.js process only. It is lost on restart, so counters start
 *   from zero after a reboot (persisted events are unaffected).
 * - Running several backend instances would give each its own counters, letting a source
 *   spread requests across instances to stay under thresholds. A distributed deployment
 *   needs shared state, e.g. Redis sorted sets (ZADD/ZREMRANGEBYSCORE/ZCARD) per key with
 *   TTLs, or a stream processor.
 * - Memory is bounded: at most MAX_KEYS keys and MAX_HITS_PER_KEY timestamps per key.
 */
export class SlidingWindowCounter {
  constructor() {
    this.hits = new Map();
  }

  /** Records a hit at `now` and returns the number of hits within the last windowMs. */
  hit(key, windowMs, now) {
    let timestamps = this.hits.get(key);
    if (!timestamps) {
      if (this.hits.size >= MAX_KEYS) this.evictOldest();
      timestamps = [];
      this.hits.set(key, timestamps);
    }
    timestamps.push(now);
    if (timestamps.length > MAX_HITS_PER_KEY) timestamps.splice(0, timestamps.length - MAX_HITS_PER_KEY);
    return this.count(key, windowMs, now);
  }

  count(key, windowMs, now) {
    const timestamps = this.hits.get(key);
    if (!timestamps) return 0;
    const cutoff = now - windowMs;
    let firstInside = 0;
    while (firstInside < timestamps.length && timestamps[firstInside] <= cutoff) firstInside += 1;
    if (firstInside > 0) timestamps.splice(0, firstInside);
    if (timestamps.length === 0) this.hits.delete(key);
    return timestamps.length;
  }

  /** Drops keys whose newest hit is older than maxAgeMs. */
  sweep(maxAgeMs, now) {
    for (const [key, timestamps] of this.hits) {
      if (timestamps.length === 0 || timestamps[timestamps.length - 1] <= now - maxAgeMs) this.hits.delete(key);
    }
  }

  evictOldest() {
    const oldestKey = this.hits.keys().next().value;
    if (oldestKey !== undefined) this.hits.delete(oldestKey);
  }

  clear(predicate = () => true) {
    for (const key of this.hits.keys()) if (predicate(key)) this.hits.delete(key);
  }

  get size() {
    return this.hits.size;
  }
}

/**
 * Tracks active rate-limit/block decisions per source. A decision expires after its
 * duration; a stronger action replaces a weaker one and repeated matches extend expiry.
 */
export class EnforcementStore {
  constructor() {
    this.entries = new Map();
  }

  get(sourceKey, now) {
    const entry = this.entries.get(sourceKey);
    if (!entry) return null;
    if (entry.until <= now) {
      this.entries.delete(sourceKey);
      return null;
    }
    return entry;
  }

  apply(sourceKey, decision, now) {
    const current = this.get(sourceKey, now);
    if (current && RULE_ACTION_RANK[current.action] > RULE_ACTION_RANK[decision.action]) {
      current.until = Math.max(current.until, decision.until);
      return current;
    }
    const entry = { ...decision, since: current?.since ?? now };
    if (this.entries.size >= MAX_KEYS && !this.entries.has(sourceKey)) {
      this.entries.delete(this.entries.keys().next().value);
    }
    this.entries.set(sourceKey, entry);
    return entry;
  }

  list(now) {
    const active = [];
    for (const [sourceKey, entry] of this.entries) {
      if (entry.until <= now) this.entries.delete(sourceKey);
      else active.push({ sourceKey, ...entry });
    }
    return active;
  }

  clear(predicate = () => true) {
    for (const [key, entry] of this.entries) if (predicate(key, entry)) this.entries.delete(key);
  }
}

export const detectionState = {
  counters: new SlidingWindowCounter(),
  enforcement: new EnforcementStore(),
};

/** Unique key for a traffic source. Simulator, device and backend sources never share state. */
export function sourceKeyFor({ sourceType, deviceId, sourceIdentifier }) {
  return `${sourceType}|${deviceId ?? '-'}|${sourceIdentifier}`;
}

/** Counter keys are "<ruleId>#<scope key>", where the scope key starts with the source type. */
export function counterKey(ruleId, scopeKey) {
  return `${ruleId}#${scopeKey}`;
}

/** Clears counters and enforcement for one source type, or everything when omitted. */
export function resetDetectionState(sourceType) {
  if (!sourceType) {
    detectionState.counters.clear();
    detectionState.enforcement.clear();
    return;
  }
  const prefix = `${sourceType}|`;
  detectionState.counters.clear((key) => key.slice(key.indexOf('#') + 1).startsWith(prefix));
  detectionState.enforcement.clear((key) => key.startsWith(prefix));
}
