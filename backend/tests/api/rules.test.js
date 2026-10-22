import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { Rule } from '../../src/models/Rule.js';
import { adminHeaders, connectTestDatabase, disconnectTestDatabase, resetTestData } from '../helpers.js';

const app = createApp();

beforeAll(connectTestDatabase);
afterAll(disconnectTestDatabase);
beforeEach(resetTestData);

describe('GET /api/rules', () => {
  it('lists every rule with description, thresholds and editable fields', async () => {
    const res = await request(app).get('/api/rules').expect(200);
    const ids = res.body.data.map((rule) => rule.id);
    expect(ids).toEqual(['request-rate', 'failed-login', 'suspicious-path', 'malformed-request', 'not-found-repeat', 'traffic-anomaly']);
    for (const rule of res.body.data) {
      expect(rule).toHaveProperty('description');
      expect(rule).toHaveProperty('paramFields');
      expect(rule.enabled).toBe(true);
    }
  });
});

describe('PATCH /api/rules/:id', () => {
  it('requires admin authorization', async () => {
    await request(app).patch('/api/rules/request-rate').send({ enabled: false }).expect(401);
  });

  it('updates thresholds and persists them', async () => {
    const res = await request(app)
      .patch('/api/rules/request-rate')
      .set(adminHeaders)
      .send({ params: { threshold: 50 }, severity: 'high' })
      .expect(200);
    expect(res.body.data).toMatchObject({ severity: 'high', params: { threshold: 50, windowSeconds: 60 } });
    const stored = await Rule.findOne({ ruleId: 'request-rate' }).lean();
    expect(stored.params.threshold).toBe(50);
  });

  it.each([
    ['threshold below minimum', { params: { threshold: 1 } }],
    ['threshold above maximum', { params: { threshold: 100000 } }],
    ['unknown param', { params: { evalCode: 'x' } }],
    ['unknown field', { description: 'hacked' }],
    ['invalid severity', { severity: 'apocalyptic' }],
    ['empty patch', {}],
  ])('rejects %s', async (_label, body) => {
    await request(app).patch('/api/rules/request-rate').set(adminHeaders).send(body).expect(400);
  });

  it('validates string-list params', async () => {
    await request(app)
      .patch('/api/rules/suspicious-path')
      .set(adminHeaders)
      .send({ params: { patterns: ['/ok', 'has space'] } })
      .expect(400);
  });

  it('returns 404 for unknown rules', async () => {
    await request(app).patch('/api/rules/does-not-exist').set(adminHeaders).send({ enabled: false }).expect(404);
  });
});

describe('GET /api/detection/stats', () => {
  it('returns per-rule counts and a zero-filled action timeline', async () => {
    const res = await request(app).get('/api/detection/stats?range=15m').expect(200);
    expect(res.body.data.rules).toHaveLength(6);
    expect(res.body.data.actionTimeline.length).toBeGreaterThanOrEqual(15);
    expect(res.body.data.activeEnforcements).toEqual([]);
  });
});

describe('settings', () => {
  it('never exposes secrets', async () => {
    const res = await request(app).get('/api/settings').expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(process.env.ADMIN_TOKEN);
    expect(body).not.toContain(process.env.DEVICE_API_KEY);
    expect(body).not.toContain('mongodb://');
    expect(res.body.data.environment).toMatchObject({ adminTokenConfigured: true, deviceApiKeyConfigured: true });
  });

  it('validates settings patches', async () => {
    await request(app).patch('/api/settings').set(adminHeaders).send({ retentionDays: -1 }).expect(400);
    await request(app).patch('/api/settings').set(adminHeaders).send({ testLoginPaths: ['login'] }).expect(400);
    await request(app)
      .patch('/api/settings')
      .set(adminHeaders)
      .send({ heartbeatTimeoutSeconds: 20, recommendedHeartbeatIntervalSeconds: 30 })
      .expect(400);
    const ok = await request(app).patch('/api/settings').set(adminHeaders).send({ retentionDays: 7 }).expect(200);
    expect(ok.body.data.runtime.retentionDays).toBe(7);
  });

  it('verifies admin tokens', async () => {
    await request(app).get('/api/auth/verify').set(adminHeaders).expect(200);
    await request(app).get('/api/auth/verify').expect(401);
  });
});
