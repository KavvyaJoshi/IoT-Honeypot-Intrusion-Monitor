import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { connectTestDatabase, disconnectTestDatabase } from '../helpers.js';

const app = createApp();

beforeAll(connectTestDatabase);
afterAll(disconnectTestDatabase);

describe('GET /api/health', () => {
  it('reports ok with database connected', async () => {
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.data).toMatchObject({
      status: 'ok',
      service: 'iot-honeypot-backend',
      database: { state: 'connected', connected: true },
      simulatorEnabled: true,
    });
    expect(typeof res.body.data.uptimeSeconds).toBe('number');
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('allows configured CORS origins only', async () => {
    const allowed = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    const denied = await request(app).get('/api/health').set('Origin', 'http://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('GET /api/health/database', () => {
  it('returns connection details without credentials', async () => {
    const res = await request(app).get('/api/health/database').expect(200);
    expect(res.body.data).toMatchObject({ connected: true, state: 'connected', name: 'iot_honeypot_test' });
    expect(res.body.data.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(res.body)).not.toContain('mongodb://');
  });
});

describe('unknown routes', () => {
  it('returns a JSON 404', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
