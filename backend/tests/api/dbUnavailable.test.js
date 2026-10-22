import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { deviceHeaders, report } from '../helpers.js';

// No database connection is opened in this file.
const app = createApp();

describe('when MongoDB is unavailable', () => {
  it('health reports degraded instead of failing', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.data.status).toBe('degraded');
    expect(res.body.data.database.connected).toBe(false);
  });

  it('database health returns 503', async () => {
    const res = await request(app).get('/api/health/database').expect(503);
    expect(res.body.data.connected).toBe(false);
  });

  it('ingestion returns an actionable 503 and does not pretend to persist', async () => {
    const res = await request(app).post('/api/events/ingest').set(deviceHeaders).send(report()).expect(503);
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(res.body.error.message).toContain('MongoDB');
  });

  it('read APIs return 503', async () => {
    await request(app).get('/api/events').expect(503);
    await request(app).get('/api/events/stats').expect(503);
  });

  it('rules and settings remain readable from in-memory defaults', async () => {
    const rules = await request(app).get('/api/rules').expect(200);
    expect(rules.body.data.length).toBeGreaterThanOrEqual(5);
    const settings = await request(app).get('/api/settings').expect(200);
    expect(settings.body.data.environment.databaseConnected).toBe(false);
  });
});
