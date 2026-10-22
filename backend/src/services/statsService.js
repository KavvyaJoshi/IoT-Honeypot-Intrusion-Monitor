import { SEVERITIES } from '../detection/constants.js';
import { ruleDefinitions } from '../detection/rules/index.js';
import { detectionState } from '../detection/state.js';
import { Event } from '../models/Event.js';
import { bucketExpression, fillTimeline, resolveRange } from '../utils/timeRange.js';
import { getRuleConfigs } from './ruleService.js';

const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

async function buildWindow({ range, sourceType, tzOffset }, extraMatch = {}) {
  const now = Date.now();
  const baseMatch = { ...extraMatch };
  if (sourceType) baseMatch.sourceType = sourceType;

  let earliest = null;
  if (range === 'all') {
    const first = await Event.findOne(baseMatch).sort({ timestamp: 1 }).select('timestamp').lean();
    earliest = first?.timestamp ?? null;
  }
  const resolved = resolveRange(range, { now, earliest });
  const match = { ...baseMatch };
  if (resolved.from) match.timestamp = { $gte: resolved.from };

  return {
    match,
    offsetMs: tzOffset * 60_000,
    stepMs: resolved.stepMs,
    fromMs: resolved.timelineFrom.getTime(),
    toMs: now,
    meta: {
      range,
      sourceType: sourceType ?? null,
      from: resolved.from?.toISOString() ?? null,
      to: resolved.to.toISOString(),
      bucketMs: resolved.stepMs,
    },
  };
}

export function listActiveEnforcements(sourceType) {
  return detectionState.enforcement
    .list(Date.now())
    .filter((entry) => !sourceType || entry.sourceType === sourceType)
    .map((entry) => ({
      sourceIdentifier: entry.sourceIdentifier,
      sourceType: entry.sourceType,
      deviceId: entry.deviceId,
      simulated: entry.simulated,
      action: entry.action,
      ruleId: entry.ruleId,
      reason: entry.reason,
      since: new Date(entry.since).toISOString(),
      until: new Date(entry.until).toISOString(),
    }));
}

/** Dashboard overview: totals, distributions, top paths/rules and a zero-filled timeline. */
export async function getOverviewStats(query) {
  const window = await buildWindow(query);
  const [facets] = await Event.aggregate([
    { $match: window.match },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              suspicious: countIf({ $ne: ['$classification', 'normal'] }),
              highSeverity: countIf({ $gte: ['$severityRank', 3] }),
              critical: countIf({ $eq: ['$severity', 'critical'] }),
              rateLimited: countIf({ $eq: ['$actionTaken', 'rate-limited'] }),
              blocked: countIf({ $eq: ['$actionTaken', 'blocked'] }),
              simulated: countIf('$simulated'),
              device: countIf({ $eq: ['$sourceType', 'device'] }),
            },
          },
        ],
        bySeverity: [{ $group: { _id: '$severity', count: { $sum: 1 } } }],
        byCategory: [
          { $match: { category: { $ne: 'normal' } } },
          { $group: { _id: '$category', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
        ],
        byAction: [{ $group: { _id: '$actionTaken', count: { $sum: 1 } } }],
        bySourceType: [{ $group: { _id: '$sourceType', count: { $sum: 1 } } }],
        topPaths: [
          {
            $group: {
              _id: '$path',
              count: { $sum: 1 },
              suspicious: countIf({ $ne: ['$classification', 'normal'] }),
            },
          },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 10 },
        ],
        topRules: [
          { $unwind: '$detections' },
          { $match: { 'detections.ruleId': { $ne: 'active-enforcement' } } },
          {
            $group: {
              _id: '$detections.ruleId',
              ruleName: { $first: '$detections.ruleName' },
              category: { $first: '$detections.category' },
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1, _id: 1 } },
          { $limit: 10 },
        ],
        timeline: [
          {
            $group: {
              _id: bucketExpression(window.stepMs, window.offsetMs),
              total: { $sum: 1 },
              suspicious: countIf({ $ne: ['$classification', 'normal'] }),
              highSeverity: countIf({ $gte: ['$severityRank', 3] }),
            },
          },
        ],
      },
    },
  ]);

  const totals = facets.totals[0] ?? {
    total: 0,
    suspicious: 0,
    highSeverity: 0,
    critical: 0,
    rateLimited: 0,
    blocked: 0,
    simulated: 0,
    device: 0,
  };
  delete totals._id;
  const severityCounts = new Map(facets.bySeverity.map((row) => [row._id, row.count]));

  return {
    ...window.meta,
    totals: { ...totals, activeEnforcements: listActiveEnforcements(query.sourceType).length },
    bySeverity: SEVERITIES.map((severity) => ({ severity, count: severityCounts.get(severity) ?? 0 })),
    byCategory: facets.byCategory.map((row) => ({ category: row._id, count: row.count })),
    byAction: facets.byAction.map((row) => ({ action: row._id, count: row.count })),
    bySourceType: facets.bySourceType.map((row) => ({ sourceType: row._id, count: row.count })),
    topPaths: facets.topPaths.map((row) => ({ path: row._id, count: row.count, suspicious: row.suspicious })),
    topRules: facets.topRules.map((row) => ({
      ruleId: row._id,
      ruleName: row.ruleName,
      category: row.category,
      count: row.count,
    })),
    timeline: fillTimeline(facets.timeline, {
      fromMs: window.fromMs,
      toMs: window.toMs,
      stepMs: window.stepMs,
      offsetMs: window.offsetMs,
      fields: ['total', 'suspicious', 'highSeverity'],
    }),
  };
}

/** Per-rule match counts, enforcement/action activity over time and active decisions. */
export async function getDetectionStats(query) {
  const window = await buildWindow(query);
  const [facets] = await Event.aggregate([
    { $match: window.match },
    {
      $facet: {
        ruleMatches: [
          { $unwind: '$detections' },
          {
            $group: {
              _id: '$detections.ruleId',
              count: { $sum: 1 },
              lastMatchedAt: { $max: '$timestamp' },
            },
          },
        ],
        actionTimeline: [
          {
            $group: {
              _id: bucketExpression(window.stepMs, window.offsetMs),
              logged: countIf({ $eq: ['$actionTaken', 'logged'] }),
              rateLimited: countIf({
                $and: [{ $eq: ['$actionTaken', 'rate-limited'] }, { $ne: ['$category', 'api-rate-limit'] }],
              }),
              blocked: countIf({ $eq: ['$actionTaken', 'blocked'] }),
              apiRateLimited: countIf({ $eq: ['$category', 'api-rate-limit'] }),
            },
          },
        ],
      },
    },
  ]);

  const matches = new Map(facets.ruleMatches.map((row) => [row._id, row]));
  const configs = getRuleConfigs();
  return {
    ...window.meta,
    rules: ruleDefinitions.map((definition) => ({
      ruleId: definition.id,
      name: definition.name,
      category: definition.category,
      enabled: configs.get(definition.id)?.enabled ?? false,
      matches: matches.get(definition.id)?.count ?? 0,
      lastMatchedAt: matches.get(definition.id)?.lastMatchedAt ?? null,
    })),
    enforcementMatches: matches.get('active-enforcement')?.count ?? 0,
    actionTimeline: fillTimeline(facets.actionTimeline, {
      fromMs: window.fromMs,
      toMs: window.toMs,
      stepMs: window.stepMs,
      offsetMs: window.offsetMs,
      fields: ['logged', 'rateLimited', 'blocked', 'apiRateLimited'],
    }),
    activeEnforcements: listActiveEnforcements(query.sourceType),
  };
}

const MAX_ACTIVITY_SERIES = 8;

/** Events over time per reporting device, plus one aggregate series for simulator traffic. */
export async function getDeviceActivity(query) {
  const window = await buildWindow({ ...query, sourceType: undefined }, { sourceType: { $in: ['device', 'simulator'] } });
  const rows = await Event.aggregate([
    { $match: window.match },
    {
      $group: {
        _id: {
          bucket: bucketExpression(window.stepMs, window.offsetMs),
          series: { $cond: [{ $eq: ['$sourceType', 'simulator'] }, 'simulator', '$deviceId'] },
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const totalsBySeries = new Map();
  for (const row of rows) totalsBySeries.set(row._id.series, (totalsBySeries.get(row._id.series) ?? 0) + row.count);
  const seriesKeys = [...totalsBySeries.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_ACTIVITY_SERIES)
    .map(([key]) => key);

  const grouped = new Map();
  for (const row of rows) {
    if (!seriesKeys.includes(row._id.series)) continue;
    const bucket = grouped.get(row._id.bucket) ?? { _id: row._id.bucket };
    bucket[row._id.series] = row.count;
    grouped.set(row._id.bucket, bucket);
  }

  return {
    ...window.meta,
    series: seriesKeys.map((key) => ({
      key,
      label: key === 'simulator' ? 'Simulator (simulated)' : key,
      sourceType: key === 'simulator' ? 'simulator' : 'device',
      total: totalsBySeries.get(key),
    })),
    timeline: fillTimeline([...grouped.values()], {
      fromMs: window.fromMs,
      toMs: window.toMs,
      stepMs: window.stepMs,
      offsetMs: window.offsetMs,
      fields: seriesKeys,
    }),
  };
}
