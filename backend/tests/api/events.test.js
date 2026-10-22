import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { Event } from '../../src/models/Event.js';
import {
  connectTestDatabase,
  deviceHeaders,
  disconnectTestDatabase,
  DEVICE_KEY,
  report,
  resetTestData,
} from '../helpers.js';

const app = createApp();

async function registerDevice(deviceId = 'esp-test-01') {
  await request(app).post('/api/devices/register').set(deviceHeaders).send({ deviceId }).expect(201);
}

function ingest(body, headers = deviceHeaders) {
  return request(app).post('/api/events/ingest').set(headers).send(body);
}

beforeAll(connectTestDatabase);
afterAll(disconnectTestDatabase);
beforeEach(async () => {
  await resetTestData();
  await registerDevice();
});

describe('POST /api/events/ingest authentication', () => {
  it('rejects requests without a device key', async () => {
    const res = await ingest(report(), {}).expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a wrong device key', async () => {
    await ingest(report(), { 'X-Device-Key': `${DEVICE_KEY}x` }).expect(401);
  });

  it('rejects unregistered devices', async () => {
    const res = await ingest(report({ deviceId: 'unknown-device' })).expect(404);
    expect(res.body.error.code).toBe('DEVICE_NOT_REGISTERED');
  });
});

describe('POST /api/events/ingest validation', () => {
  it('returns 400 with field details for invalid input', async () => {
    const res = await ingest(report({ method: 'GET /etc', clientIp: 'not-an-ip' })).expect(400);
    expect(res.body.error.code).toBe('BAD_REQUEST');
    const fields = res.body.error.details.map((d) => d.path);
    expect(fields).toEqual(expect.arrayContaining(['method', 'clientIp']));
  });

  it('returns 400 for malformed JSON without crashing', async () => {
    const res = await request(app)
      .post('/api/events/ingest')
      .set(deviceHeaders)
      .set('Content-Type', 'application/json')
      .send('{"deviceId": "esp-test-01", ')
      .expect(400);
    expect(res.body.error.code).toBe('MALFORMED_JSON');
  });

  it('returns 413 for bodies over 8 KB', async () => {
    const res = await ingest({ ...report(), userAgent: 'x'.repeat(9000) }).expect(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('event persistence and classification', () => {
  it('persists a normal request with a backend-computed verdict', async () => {
    const res = await ingest(report({ severity: 'critical', actionTaken: 'blocked', simulated: true })).expect(201);
    expect(res.body.data).toMatchObject({
      severity: 'info',
      classification: 'normal',
      actionTaken: 'allowed',
      recommendedAction: 'allow',
      duplicate: false,
    });

    const stored = await Event.findById(res.body.data.eventId).lean();
    expect(stored).toMatchObject({
      sourceType: 'device',
      simulated: false,
      deviceId: 'esp-test-01',
      sourceIdentifier: '192.168.1.50',
      method: 'GET',
      path: '/',
      severity: 'info',
      actionTaken: 'allowed',
    });
  });

  it('flags a suspicious path with an explanation', async () => {
    const res = await ingest(report({ path: '/.env', responseStatus: 404 })).expect(201);
    expect(res.body.data).toMatchObject({ category: 'suspicious-path', actionTaken: 'logged', recommendedAction: 'log' });
    const stored = await Event.findById(res.body.data.eventId).lean();
    expect(stored.detections[0].ruleId).toBe('suspicious-path');
    expect(stored.detectionReasons[0]).toContain('not a confirmed attack');
  });

  it('redacts sensitive headers and query parameters and drops passwords before storage', async () => {
    const res = await ingest(
      report({
        method: 'POST',
        path: '/login?user=admin&password=hunter2',
        responseStatus: 401,
        loginResult: 'failed',
        password: 'hunter2',
        headers: { Authorization: 'Basic YWRtaW46aHVudGVyMg==', Cookie: 'sid=abc', 'Content-Type': 'text/plain' },
      }),
    ).expect(201);

    const stored = await Event.findById(res.body.data.eventId).lean();
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain('YWRtaW46aHVudGVyMg');
    expect(serialized).not.toContain('sid=abc');
    expect(stored.query).toBe('user=admin&password=[REDACTED]');
    expect(stored.metadata.headers).toEqual({
      authorization: '[REDACTED]',
      cookie: '[REDACTED]',
      'content-type': 'text/plain',
    });
  });

  it('returns rate-limit guidance once the request-rate threshold is crossed', async () => {
    let res;
    for (let i = 0; i < 20; i += 1) res = await ingest(report({ path: '/api/sensor' }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ actionTaken: 'rate-limited', recommendedAction: 'rate-limit' });
    expect(res.body.data.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('deduplicates retries with the same correlationId', async () => {
    const body = report({ correlationId: 'esp-test-01:boot7:42' });
    const first = await ingest(body).expect(201);
    const second = await ingest(body).expect(200);
    expect(second.body.data.duplicate).toBe(true);
    expect(second.body.data.eventId).toBe(first.body.data.eventId);
    expect(await Event.countDocuments({ correlationId: 'esp-test-01:boot7:42' })).toBe(1);
  });

  it('updates the device last-seen timestamp', async () => {
    await ingest(report()).expect(201);
    const res = await request(app).get('/api/devices/esp-test-01').expect(200);
    expect(res.body.data.lastSeenAt).toBeTruthy();
    expect(res.body.data.eventCount).toBe(1);
  });
});

describe('GET /api/events', () => {
  beforeEach(async () => {
    await ingest(report({ path: '/', clientIp: '192.168.1.10' }));
    await ingest(report({ path: '/status', clientIp: '192.168.1.11' }));
    await ingest(report({ path: '/.env', clientIp: '192.168.1.12', responseStatus: 404 }));
    await ingest(report({ path: '/wp-login.php', clientIp: '192.168.1.12', responseStatus: 404 }));
  });

  it('lists newest first with pagination metadata', async () => {
    const res = await request(app).get('/api/events?limit=3').expect(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.pagination).toEqual({ page: 1, limit: 3, total: 4, totalPages: 2 });
    expect(res.body.data[0].path).toBe('/wp-login.php');
    const page2 = await request(app).get('/api/events?limit=3&page=2').expect(200);
    expect(page2.body.data).toHaveLength(1);
  });

  it('filters by severity and classification', async () => {
    const res = await request(app).get('/api/events?severity=medium').expect(200);
    expect(res.body.data.map((e) => e.path).sort()).toEqual(['/.env', '/wp-login.php']);
    const normal = await request(app).get('/api/events?classification=normal').expect(200);
    expect(normal.body.pagination.total).toBe(2);
  });

  it('searches path and source with regex characters escaped', async () => {
    const res = await request(app).get('/api/events').query({ search: '.env' }).expect(200);
    expect(res.body.data.map((e) => e.path)).toEqual(['/.env']);
    const bySource = await request(app).get('/api/events').query({ search: '192.168.1.12' }).expect(200);
    expect(bySource.body.pagination.total).toBe(2);
    await request(app).get('/api/events').query({ search: '(a+)+$' }).expect(200);
  });

  it('sorts by an allow-listed field and rejects others', async () => {
    const res = await request(app).get('/api/events?sort=path&order=asc').expect(200);
    expect(res.body.data[0].path).toBe('/');
    await request(app).get('/api/events?sort=password').expect(400);
  });

  it('returns a single event by id and 404/400 for missing or invalid ids', async () => {
    const list = await request(app).get('/api/events?limit=1');
    const { id } = list.body.data[0];
    const res = await request(app).get(`/api/events/${id}`).expect(200);
    expect(res.body.data.id).toBe(id);
    await request(app).get('/api/events/0123456789abcdef01234567').expect(404);
    await request(app).get('/api/events/not-an-id').expect(400);
  });
});

describe('GET /api/events/stats', () => {
  it('computes totals and distributions from stored events', async () => {
    await ingest(report({ path: '/' }));
    await ingest(report({ path: '/.env', responseStatus: 404 }));
    const res = await request(app).get('/api/events/stats?range=1h').expect(200);
    const { data } = res.body;
    expect(data.totals).toMatchObject({ total: 2, suspicious: 1, highSeverity: 0, device: 1 + 1 });
    expect(data.bySeverity.find((s) => s.severity === 'medium').count).toBe(1);
    expect(data.byCategory).toEqual([{ category: 'suspicious-path', count: 1 }]);
    expect(data.topRules[0]).toMatchObject({ ruleId: 'suspicious-path', count: 1 });
    expect(data.timeline.length).toBeGreaterThan(20);
    expect(data.timeline.reduce((sum, point) => sum + point.total, 0)).toBe(2);
  });

  it('returns zeros, not errors, for an empty database', async () => {
    await Event.deleteMany({});
    const res = await request(app).get('/api/events/stats?range=all').expect(200);
    expect(res.body.data.totals.total).toBe(0);
    expect(res.body.data.byCategory).toEqual([]);
  });
});
