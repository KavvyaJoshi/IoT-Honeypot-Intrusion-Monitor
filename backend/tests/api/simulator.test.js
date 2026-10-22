import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { Event } from '../../src/models/Event.js';
import {
  adminHeaders,
  connectTestDatabase,
  deviceHeaders,
  disconnectTestDatabase,
  report,
  resetTestData,
} from '../helpers.js';

const app = createApp();

function run(scenario, extra = {}) {
  return request(app).post('/api/simulator/events').set(adminHeaders).send({ scenario, ...extra });
}

beforeAll(connectTestDatabase);
afterAll(disconnectTestDatabase);
beforeEach(resetTestData);

describe('simulator access control', () => {
  it('requires the admin token', async () => {
    await request(app).post('/api/simulator/events').send({ scenario: 'normal' }).expect(401);
    await request(app)
      .post('/api/simulator/events')
      .set('Authorization', 'Bearer wrong-token-wrong-token')
      .send({ scenario: 'normal' })
      .expect(401);
  });

  it('does not accept the device key as admin credentials', async () => {
    await request(app).post('/api/simulator/events').set(deviceHeaders).send({ scenario: 'normal' }).expect(401);
  });

  it('rejects unknown scenarios and non-TEST-NET source IPs', async () => {
    await run('port-scan').expect(400);
    await run('normal', { sourceIp: '8.8.8.8' }).expect(400);
  });

  it('lists scenarios', async () => {
    const res = await request(app).get('/api/simulator/scenarios').expect(200);
    expect(res.body.data.map((s) => s.id)).toEqual([
      'normal',
      'repeated-requests',
      'failed-login',
      'suspicious-path',
      'malformed',
      'rate-limit-threshold',
    ]);
  });
});

describe('simulator scenarios', () => {
  it('normal request is persisted, marked simulated and not flagged', async () => {
    const res = await run('normal').expect(201);
    expect(res.body.data).toMatchObject({ generated: 1, flagged: 0, byAction: { allowed: 1 } });
    expect(res.body.data.sourceIp).toMatch(/^(192\.0\.2|198\.51\.100|203\.0\.113)\./);
    const stored = await Event.findById(res.body.data.events[0].id).lean();
    expect(stored).toMatchObject({ sourceType: 'simulator', simulated: true, deviceId: 'simulated-esp8266', classification: 'normal' });
    expect(stored.metadata.scenario).toBe('normal');
  });

  it('repeated requests trigger repeated-404 detection', async () => {
    const res = await run('repeated-requests').expect(201);
    expect(res.body.data.generated).toBe(12);
    expect(res.body.data.flagged).toBe(3);
    expect(res.body.data.events.at(-1).category).toBe('route-enumeration');
  });

  it('failed logins end in a block decision and secrets are redacted', async () => {
    const res = await run('failed-login').expect(201);
    expect(res.body.data.generated).toBe(6);
    expect(res.body.data.byAction).toEqual({ allowed: 4, blocked: 2 });
    const stored = await Event.find({ simulated: true }).lean();
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain('simulated-not-a-real-password');
    expect(serialized).not.toContain('c2ltdWxhdGVkOnNpbXVsYXRlZA==');
    expect(serialized).not.toContain('simulated-session-id');
  });

  it('suspicious-path and malformed scenarios are flagged', async () => {
    const suspicious = await run('suspicious-path').expect(201);
    expect(suspicious.body.data.events[0].category).toBe('suspicious-path');
    const malformed = await run('malformed').expect(201);
    expect(malformed.body.data.flagged).toBe(1);
  });

  it('rate-limit threshold scenario rate-limits past the threshold', async () => {
    const res = await run('rate-limit-threshold').expect(201);
    expect(res.body.data.generated).toBe(25);
    expect(res.body.data.byAction).toEqual({ allowed: 19, 'rate-limited': 6 });
  });

  it('reports disabled rules so the operator knows why nothing was flagged', async () => {
    await request(app).patch('/api/rules/suspicious-path').set(adminHeaders).send({ enabled: false }).expect(200);
    const res = await run('suspicious-path').expect(201);
    expect(res.body.data.flagged).toBe(0);
    expect(res.body.data.disabledRules).toEqual(['suspicious-path']);
  });
});

describe('POST /api/simulator/reset', () => {
  it('requires explicit confirmation', async () => {
    await request(app).post('/api/simulator/reset').set(adminHeaders).send({}).expect(400);
    await request(app).post('/api/simulator/reset').send({ confirm: 'DELETE_SIMULATOR_DATA' }).expect(401);
  });

  it('deletes only simulated events', async () => {
    await request(app).post('/api/devices/register').set(deviceHeaders).send({ deviceId: 'esp-test-01' }).expect(201);
    await request(app).post('/api/events/ingest').set(deviceHeaders).send(report()).expect(201);
    await run('normal').expect(201);
    await run('suspicious-path').expect(201);

    const res = await request(app)
      .post('/api/simulator/reset')
      .set(adminHeaders)
      .send({ confirm: 'DELETE_SIMULATOR_DATA' })
      .expect(200);
    expect(res.body.data.deletedCount).toBe(2);
    expect(await Event.countDocuments({ simulated: true })).toBe(0);
    expect(await Event.countDocuments({ sourceType: 'device' })).toBe(1);
  });
});
