import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { createRateLimiter } from '../../src/middleware/rateLimiters.js';
import { Event } from '../../src/models/Event.js';
import { adminHeaders, connectTestDatabase, disconnectTestDatabase, resetTestData } from '../helpers.js';

beforeAll(connectTestDatabase);
afterAll(disconnectTestDatabase);
beforeEach(resetTestData);

async function waitFor(check, timeoutMs = 2000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

describe('API rate limiting', () => {
  it('returns 429 with a JSON error after the limit', async () => {
    const mini = express();
    mini.use(createRateLimiter({ name: 'unit', windowMs: 60_000, limit: 3 }));
    mini.get('/', (_req, res) => res.json({ ok: true }));

    for (let i = 0; i < 3; i += 1) await request(mini).get('/').expect(200);
    const limited = await request(mini).get('/').expect(429);
    expect(limited.body.error).toMatchObject({ code: 'RATE_LIMITED' });
    expect(limited.body.error.retryAfterSeconds).toBeGreaterThan(0);
    expect(limited.headers.ratelimit).toBeDefined();
  });

  it('probe endpoint demonstrates 429s and records exactly one backend event per window', async () => {
    const app = createApp();
    const statuses = [];
    for (let i = 0; i < 9; i += 1) {
      const res = await request(app).post('/api/simulator/rate-limit-probe').set(adminHeaders);
      statuses.push(res.status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429, 429, 429, 429]);

    expect(await waitFor(async () => (await Event.countDocuments({ category: 'api-rate-limit' })) === 1)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const events = await Event.find({ category: 'api-rate-limit' }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sourceType: 'backend',
      simulated: true,
      actionTaken: 'rate-limited',
      responseStatus: 429,
      path: '/api/simulator/rate-limit-probe',
    });
    expect(events[0].detectionReasons[0]).toContain('not recorded individually');
  });

  it('device ingestion has its own limiter', async () => {
    const app = createApp({
      rateLimits: { windowMs: 60_000, publicMax: 1000, deviceMax: 2, simulatorMax: 1000, probeWindowMs: 10_000, probeMax: 5 },
    });
    await request(app).post('/api/events/ingest').send({}).expect(401);
    await request(app).post('/api/events/ingest').send({}).expect(401);
    await request(app).post('/api/events/ingest').send({}).expect(429);
    // Public read endpoints are unaffected.
    await request(app).get('/api/health').expect(200);
  });
});
