import { SEVERITY_RANK } from '../detection/constants.js';
import { Event } from '../models/Event.js';
import { ingestEvent, toDeviceVerdict } from '../services/eventService.js';
import { getOverviewStats } from '../services/statsService.js';
import { notFound } from '../utils/errors.js';
import { escapeRegex } from '../utils/security.js';
import { resolveRange } from '../utils/timeRange.js';

const SORT_FIELD = { severity: 'severityRank' };

function buildFilter(query) {
  const filter = {};
  if (query.severity?.length) filter.severityRank = { $in: query.severity.map((s) => SEVERITY_RANK[s]) };
  if (query.category?.length) filter.category = { $in: query.category };
  if (query.classification?.length) filter.classification = { $in: query.classification };
  if (query.actionTaken?.length) filter.actionTaken = { $in: query.actionTaken };
  if (query.sourceType?.length) filter.sourceType = { $in: query.sourceType };
  if (query.deviceId) filter.deviceId = query.deviceId;
  if (query.range !== 'all') filter.timestamp = { $gte: resolveRange(query.range).from };
  if (query.search) {
    const pattern = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ path: pattern }, { sourceIdentifier: pattern }, { deviceId: pattern }];
  }
  return filter;
}

export async function listEvents(req, res) {
  const query = req.validated.query;
  const filter = buildFilter(query);
  const direction = query.order === 'asc' ? 1 : -1;
  const sortField = SORT_FIELD[query.sort] ?? query.sort;
  const sort = { [sortField]: direction };
  if (sortField !== 'timestamp') sort.timestamp = -1;
  sort._id = direction;

  const [items, total] = await Promise.all([
    Event.find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    Event.countDocuments(filter),
  ]);

  res.json({
    data: items.map((item) => item.toJSON()),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  });
}

export async function getEvent(req, res) {
  const event = await Event.findById(req.validated.params.id);
  if (!event) throw notFound('Event not found');
  res.json({ data: event.toJSON() });
}

/** ESP8266 report ingestion. Returns a compact verdict the firmware can act on. */
export async function ingest(req, res) {
  const { event, duplicate, enforcement } = await ingestEvent(req.validated.body, { sourceType: 'device' });
  res.status(duplicate ? 200 : 201).json({ data: { ...toDeviceVerdict(event, enforcement), duplicate } });
}

export async function getStats(req, res) {
  res.json({ data: await getOverviewStats(req.validated.query) });
}
