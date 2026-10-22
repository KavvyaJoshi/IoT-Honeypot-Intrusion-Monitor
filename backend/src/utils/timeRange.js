const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const FIXED_RANGES = {
  '15m': { spanMs: 15 * MINUTE, stepMs: MINUTE },
  '1h': { spanMs: HOUR, stepMs: 2 * MINUTE },
  '24h': { spanMs: DAY, stepMs: HOUR },
  '7d': { spanMs: 7 * DAY, stepMs: 6 * HOUR },
};

const ADAPTIVE_STEPS = [MINUTE, 5 * MINUTE, 15 * MINUTE, HOUR, 6 * HOUR, DAY, 7 * DAY, 30 * DAY];
const MAX_BUCKETS = 60;

/**
 * Resolves a named range into a query lower bound and a chart bucket size.
 * For "all", `earliest` (oldest matching event) determines the timeline start and step.
 */
export function resolveRange(range, { now = Date.now(), earliest = null } = {}) {
  if (range in FIXED_RANGES) {
    const { spanMs, stepMs } = FIXED_RANGES[range];
    const from = new Date(now - spanMs);
    return { from, to: new Date(now), stepMs, timelineFrom: from };
  }
  const timelineFrom = earliest ? new Date(earliest) : new Date(now - HOUR);
  const span = Math.max(now - timelineFrom.getTime(), MINUTE);
  const stepMs = ADAPTIVE_STEPS.find((step) => span / step <= MAX_BUCKETS) ?? ADAPTIVE_STEPS.at(-1);
  return { from: null, to: new Date(now), stepMs, timelineFrom };
}

/** Start of the bucket containing `ms`, aligned to local time via offsetMs (minutes east of UTC × 60000). */
export function bucketStart(ms, stepMs, offsetMs = 0) {
  return ms - (((ms + offsetMs) % stepMs) + stepMs) % stepMs;
}

/** MongoDB expression computing the same bucket start (epoch ms) as bucketStart(). */
export function bucketExpression(stepMs, offsetMs = 0, field = '$timestamp') {
  const epochMs = { $toLong: field };
  return { $subtract: [epochMs, { $mod: [{ $add: [epochMs, offsetMs] }, stepMs] }] };
}

/** Builds a zero-filled timeline from grouped rows of shape { _id: bucketMs, ...counts }. */
export function fillTimeline(rows, { fromMs, toMs, stepMs, offsetMs = 0, fields }) {
  const byBucket = new Map(rows.map((row) => [Number(row._id), row]));
  const timeline = [];
  for (let t = bucketStart(fromMs, stepMs, offsetMs); t <= toMs; t += stepMs) {
    const row = byBucket.get(t);
    const point = { t: new Date(t).toISOString() };
    // Object.hasOwn: series keys can be device ids, which must not resolve to prototype members.
    for (const field of fields) point[field] = row && Object.hasOwn(row, field) ? row[field] : 0;
    timeline.push(point);
  }
  return timeline;
}
