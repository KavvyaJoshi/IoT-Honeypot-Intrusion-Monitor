#!/usr/bin/env node
/**
 * End-to-end smoke test against a RUNNING backend (npm run dev). Uses only the simulator, so
 * every event it creates is marked simulated; it never registers devices.
 *
 *   npm run smoke                      # uses http://localhost:4000 and ADMIN_TOKEN from backend/.env
 *   API_URL=http://127.0.0.1:4000 npm run smoke
 */
import 'dotenv/config';

const API = (process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`).replace(/\/$/, '') + '/api';
const TOKEN = process.env.ADMIN_TOKEN;

let failures = 0;
function check(label, condition, detail = '') {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!condition) failures += 1;
}

async function call(method, path, body, { admin = false } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(admin ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

async function main() {
  console.log(`Smoke test against ${API}\n`);
  if (!TOKEN) {
    console.error('ADMIN_TOKEN is not set (backend/.env). Aborting.');
    process.exit(2);
  }

  const health = await call('GET', '/health').catch((error) => ({ status: 0, error }));
  check('API reachable', health.status === 200, health.error?.message);
  if (health.status !== 200) process.exit(1);
  check('MongoDB connected', health.json.data.database.connected === true, health.json.data.database.state);
  check('Simulator enabled', health.json.data.simulatorEnabled === true);

  check('Admin endpoints reject missing token', (await call('POST', '/simulator/events', { scenario: 'normal' })).status === 401);
  check('Device endpoints reject missing key', (await call('POST', '/events/ingest', {})).status === 401);

  const expectations = [
    ['normal', (d) => d.flagged === 0, 'no detections'],
    ['suspicious-path', (d) => d.events[0].category === 'suspicious-path' && d.events[0].actionTaken === 'logged', 'suspicious-path, logged'],
    ['malformed', (d) => d.events[0].category === 'malformed-request', 'malformed-request'],
    ['repeated-requests', (d) => d.events.at(-1).category === 'route-enumeration', 'route-enumeration on last'],
    ['failed-login', (d) => d.byAction.blocked >= 1 && d.events.at(-1).severity === 'high', 'blocked, high'],
    ['rate-limit-threshold', (d) => d.byAction['rate-limited'] >= 1, 'rate-limited after threshold'],
  ];
  for (const [scenario, ok, description] of expectations) {
    const { status, json } = await call('POST', '/simulator/events', { scenario }, { admin: true });
    const data = json?.data;
    check(`Scenario ${scenario}: ${description}`, status === 201 && data && ok(data), data ? `generated ${data.generated}, flagged ${data.flagged}` : `HTTP ${status}`);
  }

  const failed = await call('GET', '/events?category=repeated-failed-login&limit=1');
  const stored = failed.json?.data?.[0];
  check('Stored event is marked simulated', stored?.simulated === true && stored?.sourceType === 'simulator');
  check('Detection reason recorded', Boolean(stored?.detectionReasons?.[0]?.includes('failed login attempts')));
  const serialized = JSON.stringify(stored ?? {});
  check('Password and authorization header redacted', !serialized.includes('simulated-not-a-real-password') && serialized.includes('[REDACTED]'));

  const statuses = [];
  for (let i = 0; i < 8; i += 1) statuses.push((await call('POST', '/simulator/rate-limit-probe', null, { admin: true })).status);
  check('API rate limiter returns 429 after the limit', statuses.includes(429), statuses.join(','));

  const stats = await call('GET', '/events/stats?range=15m');
  check('Stats reflect stored events', stats.json?.data?.totals?.total > 0, `total ${stats.json?.data?.totals?.total}`);

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`);
  console.log('Simulated data can be removed from the dashboard (Controlled testing → Reset demo data).');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
