import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { Device } from '../../src/models/Device.js';
import {
  adminHeaders,
  connectTestDatabase,
  deviceHeaders,
  disconnectTestDatabase,
  DEVICE_KEY,
  resetTestData,
} from '../helpers.js';

const app = createApp();

beforeAll(connectTestDatabase);
afterAll(disconnectTestDatabase);
beforeEach(resetTestData);

describe('POST /api/devices/register', () => {
  it('requires the device key', async () => {
    await request(app).post('/api/devices/register').send({ deviceId: 'esp-lab-01' }).expect(401);
  });

  it('creates then updates a device idempotently', async () => {
    const created = await request(app)
      .post('/api/devices/register')
      .set(deviceHeaders)
      .send({ deviceId: 'esp-lab-01', name: 'Lab honeypot', firmwareVersion: '1.0.0', ipAddress: '192.168.1.40' })
      .expect(201);
    expect(created.body.data).toMatchObject({ deviceId: 'esp-lab-01', created: true, status: 'never-connected' });

    const again = await request(app)
      .post('/api/devices/register')
      .set(deviceHeaders)
      .send({ deviceId: 'esp-lab-01', firmwareVersion: '1.0.1' })
      .expect(200);
    expect(again.body.data.created).toBe(false);
    const stored = await Device.findOne({ deviceId: 'esp-lab-01' }).lean();
    expect(stored).toMatchObject({ name: 'Lab honeypot', firmwareVersion: '1.0.1' });
  });

  it('validates the device id', async () => {
    await request(app).post('/api/devices/register').set(deviceHeaders).send({ deviceId: 'a b' }).expect(400);
  });
});

describe('heartbeat and connectivity status', () => {
  beforeEach(async () => {
    await request(app).post('/api/devices/register').set(deviceHeaders).send({ deviceId: 'esp-lab-01' }).expect(201);
  });

  it('a registered device without heartbeat is not online', async () => {
    const res = await request(app).get('/api/devices').expect(200);
    expect(res.body.data[0]).toMatchObject({ deviceId: 'esp-lab-01', status: 'never-connected', lastHeartbeatAt: null });
  });

  it('heartbeat marks the device online and stores device-reported metrics', async () => {
    const res = await request(app)
      .post('/api/devices/heartbeat')
      .set(deviceHeaders)
      .send({ deviceId: 'esp-lab-01', rssi: -61, uptimeMs: 120000, freeHeap: 31000, firmwareVersion: '1.2.0' })
      .expect(200);
    expect(res.body.data).toMatchObject({ deviceId: 'esp-lab-01', status: 'online', nextHeartbeatSeconds: 30 });

    const device = await request(app).get('/api/devices/esp-lab-01').expect(200);
    expect(device.body.data).toMatchObject({
      status: 'online',
      lastRssi: -61,
      lastUptimeMs: 120000,
      lastFreeHeap: 31000,
      firmwareVersion: '1.2.0',
      heartbeatCount: 1,
    });
  });

  it('reports offline once the heartbeat is older than the timeout', async () => {
    await request(app).post('/api/devices/heartbeat').set(deviceHeaders).send({ deviceId: 'esp-lab-01' }).expect(200);
    await Device.updateOne({ deviceId: 'esp-lab-01' }, { lastHeartbeatAt: new Date(Date.now() - 91_000) });
    const res = await request(app).get('/api/devices').expect(200);
    expect(res.body.data[0].status).toBe('offline');
  });

  it('honours a changed heartbeat timeout setting', async () => {
    await request(app).post('/api/devices/heartbeat').set(deviceHeaders).send({ deviceId: 'esp-lab-01' }).expect(200);
    await Device.updateOne({ deviceId: 'esp-lab-01' }, { lastHeartbeatAt: new Date(Date.now() - 91_000) });
    await request(app).patch('/api/settings').set(adminHeaders).send({ heartbeatTimeoutSeconds: 300 }).expect(200);
    const res = await request(app).get('/api/devices').expect(200);
    expect(res.body.data[0].status).toBe('online');
  });

  it('rejects RSSI values a radio cannot report', async () => {
    await request(app).post('/api/devices/heartbeat').set(deviceHeaders).send({ deviceId: 'esp-lab-01', rssi: 20 }).expect(400);
  });

  it('heartbeat from an unregistered device returns 404', async () => {
    const res = await request(app).post('/api/devices/heartbeat').set(deviceHeaders).send({ deviceId: 'ghost-01' }).expect(404);
    expect(res.body.error.code).toBe('DEVICE_NOT_REGISTERED');
  });
});

describe('GET /api/devices/setup', () => {
  it('describes the integration contract without exposing the key', async () => {
    const res = await request(app).get('/api/devices/setup').expect(200);
    expect(res.body.data).toMatchObject({
      authHeader: 'X-Device-Key',
      deviceApiKeyConfigured: true,
      maxRequestBodyBytes: 8192,
      endpoints: { ingest: { method: 'POST', path: '/api/events/ingest' } },
    });
    expect(JSON.stringify(res.body)).not.toContain(DEVICE_KEY);
  });
});
