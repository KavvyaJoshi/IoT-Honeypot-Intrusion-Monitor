import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateEvent } from '../../src/detection/engine.js';
import { ruleDefinitions } from '../../src/detection/rules/index.js';
import { EnforcementStore, SlidingWindowCounter } from '../../src/detection/state.js';
import { normalizeEvent } from '../../src/services/normalize.js';
import { ingestEventSchema } from '../../src/validation/schemas.js';

const settings = { enforcementDurationSeconds: 300, testLoginPaths: ['/login'] };
const T0 = Date.parse('2026-01-01T12:00:00Z');

function defaultConfigs(overrides = {}) {
  return new Map(
    ruleDefinitions.map((rule) => [
      rule.id,
      {
        enabled: true,
        severity: rule.defaultSeverity,
        action: rule.defaultAction,
        params: structuredClone(rule.defaultParams),
        ...overrides[rule.id],
      },
    ]),
  );
}

let state;
let ruleConfigs;

function evaluate(fields, { now = T0, sourceType = 'device' } = {}) {
  const input = ingestEventSchema.parse({ deviceId: 'esp-lab-01', clientIp: '192.168.1.77', method: 'GET', path: '/', ...fields });
  const normalized = normalizeEvent(input, { sourceType, simulated: sourceType === 'simulator', now: new Date(now) });
  return evaluateEvent(normalized, { ruleConfigs, settings, now, state });
}

beforeEach(() => {
  state = { counters: new SlidingWindowCounter(), enforcement: new EnforcementStore() };
  ruleConfigs = defaultConfigs();
});

describe('normal traffic', () => {
  it.each([
    ['home page', { path: '/', responseStatus: 200 }],
    ['sensor API', { path: '/api/sensor', responseStatus: 200 }],
    ['successful login', { method: 'POST', path: '/login', responseStatus: 200, loginResult: 'success' }],
    ['single failed login', { method: 'POST', path: '/login', responseStatus: 401, loginResult: 'failed' }],
    ['single 404', { path: '/missing.html', responseStatus: 404 }],
    ['query string with encoded space', { path: '/search?q=hello%20world', responseStatus: 200 }],
  ])('does not flag a %s', (_label, fields) => {
    const verdict = evaluate(fields);
    expect(verdict).toMatchObject({
      classification: 'normal',
      severity: 'info',
      actionTaken: 'allowed',
      category: 'normal',
      detections: [],
    });
  });

  it('does not flag requests below the rate threshold', () => {
    for (let i = 0; i < 19; i += 1) {
      expect(evaluate({ path: '/api/sensor' }, { now: T0 + i * 1000 }).actionTaken).toBe('allowed');
    }
  });
});

describe('request-rate rule', () => {
  it('flags the request that reaches the threshold and rate-limits the source', () => {
    let verdict;
    for (let i = 0; i < 20; i += 1) verdict = evaluate({ path: '/api/sensor' }, { now: T0 + i * 100 });
    expect(verdict.category).toBe('excessive-requests');
    expect(verdict.severity).toBe('medium');
    expect(verdict.actionTaken).toBe('rate-limited');
    expect(verdict.detections[0]).toMatchObject({
      ruleId: 'request-rate',
      recommendedAction: 'rate-limit',
      evidence: { count: 20, threshold: 20, windowSeconds: 60 },
    });
    expect(verdict.detectionReasons[0]).toContain('20 requests from client 192.168.1.77 within 60s');
  });

  it('forgets requests outside the sliding window', () => {
    for (let i = 0; i < 15; i += 1) evaluate({}, { now: T0 + i });
    const later = evaluate({}, { now: T0 + 61_000 });
    expect(later.actionTaken).toBe('allowed');
  });

  it('keeps sources independent', () => {
    for (let i = 0; i < 25; i += 1) evaluate({ clientIp: '10.0.0.1' }, { now: T0 + i });
    expect(evaluate({ clientIp: '10.0.0.2' }, { now: T0 + 30 }).actionTaken).toBe('allowed');
  });

  it('keeps simulator and device state separate for the same IP', () => {
    for (let i = 0; i < 25; i += 1) evaluate({}, { now: T0 + i, sourceType: 'simulator' });
    expect(evaluate({}, { now: T0 + 30, sourceType: 'device' }).actionTaken).toBe('allowed');
  });
});

describe('failed-login rule', () => {
  const failed = { method: 'POST', path: '/login', responseStatus: 401, loginResult: 'failed' };

  it('blocks after the configured number of failures and explains why', () => {
    const verdicts = Array.from({ length: 5 }, (_, i) => evaluate(failed, { now: T0 + i * 1000 }));
    expect(verdicts.slice(0, 4).every((v) => v.actionTaken === 'allowed')).toBe(true);
    const fifth = verdicts[4];
    expect(fifth).toMatchObject({ category: 'repeated-failed-login', severity: 'high', classification: 'high-risk', actionTaken: 'blocked' });
    expect(fifth.detectionReasons[0]).toContain('5 failed login attempts against test endpoint /login');
    expect(fifth.detectionReasons[0]).toContain('does not identify who controls the source');
  });

  it('infers failure from HTTP 401 when loginResult is absent, and ignores other paths', () => {
    for (let i = 0; i < 5; i += 1) evaluate({ method: 'POST', path: '/account', responseStatus: 401 }, { now: T0 + i });
    expect(evaluate({ method: 'POST', path: '/account', responseStatus: 401 }, { now: T0 + 10 }).actionTaken).toBe('allowed');
    let verdict;
    for (let i = 0; i < 5; i += 1) verdict = evaluate({ method: 'POST', path: '/login/', responseStatus: 401 }, { now: T0 + 20 + i });
    expect(verdict.actionTaken).toBe('blocked');
  });

  it('keeps blocking a source while the decision is active, even for normal requests', () => {
    for (let i = 0; i < 5; i += 1) evaluate(failed, { now: T0 + i });
    const next = evaluate({ path: '/' }, { now: T0 + 10_000 });
    expect(next.actionTaken).toBe('blocked');
    expect(next.category).toBe('active-enforcement');
    expect(next.detectionReasons[0]).toContain('active block decision from rule "failed-login"');

    const afterExpiry = evaluate({ path: '/' }, { now: T0 + 301_000 });
    expect(afterExpiry.actionTaken).toBe('allowed');
  });
});

describe('suspicious-path rule', () => {
  it.each(['/.env', '/wp-login.php', '/ADMIN/settings', '/cgi-bin/luci', '/%2eenv'])('flags %s as a signal, not an attack', (path) => {
    const verdict = evaluate({ path, responseStatus: 404 });
    expect(verdict.category).toBe('suspicious-path');
    expect(verdict.actionTaken).toBe('logged');
    expect(verdict.classification).toBe('suspicious');
    expect(verdict.detectionReasons[0]).toContain('not a confirmed attack');
  });

  it('respects custom patterns', () => {
    ruleConfigs = defaultConfigs({ 'suspicious-path': { params: { patterns: ['/secret-panel'] } } });
    expect(evaluate({ path: '/secret-panel' }).category).toBe('suspicious-path');
    expect(evaluate({ path: '/.env' }).category).toBe('normal');
  });
});

describe('malformed-request rule', () => {
  it.each([
    ['traversal', { path: '/static/../../etc/passwd' }, 'directory-traversal'],
    ['encoded traversal', { path: '/static/..%2f..%2fetc' }, 'directory-traversal'],
    ['encoded null byte', { path: '/index.html%00.jpg' }, 'null byte'],
    ['raw control character', { path: '/a\u0007b' }, 'control characters'],
    ['non-standard method', { method: 'PROPFIND', path: '/' }, 'non-standard HTTP method "PROPFIND"'],
    ['oversized path', { path: `/${'a'.repeat(300)}` }, 'path length 301 exceeds 256'],
    ['invalid encoding', { path: '/files/%E0%A4%A' }, 'invalid percent-encoding'],
    ['double encoding', { path: '/x%252e%252e/' }, 'double percent-encoding'],
    ['relative path', { path: 'index.html' }, 'does not start with "/"'],
  ])('flags %s', (_label, fields, expectedIssue) => {
    const verdict = evaluate(fields);
    const detection = verdict.detections.find((d) => d.ruleId === 'malformed-request');
    expect(detection).toBeDefined();
    expect(detection.reason).toContain(expectedIssue);
  });
});

describe('not-found-repeat rule', () => {
  it('flags repeated 404s from one source', () => {
    let verdict;
    for (let i = 0; i < 10; i += 1) verdict = evaluate({ path: `/page-${i}`, responseStatus: 404 }, { now: T0 + i * 1000 });
    expect(verdict.category).toBe('route-enumeration');
    expect(verdict.detections[0].evidence).toMatchObject({ count: 10, threshold: 10 });
  });
});

describe('traffic-anomaly rule', () => {
  it('flags device-wide bursts above baseline x multiplier', () => {
    ruleConfigs = defaultConfigs({
      'traffic-anomaly': { params: { baselinePerMinute: 2, multiplier: 2 } },
      'request-rate': { enabled: false },
    });
    let verdict;
    for (let i = 0; i < 5; i += 1) verdict = evaluate({ clientIp: `10.0.0.${i + 1}` }, { now: T0 + i });
    expect(verdict.category).toBe('traffic-anomaly');
    expect(verdict.detectionReasons[0]).toContain('above 2× the configured baseline of 2/min');
  });
});

describe('engine behaviour', () => {
  it('escalates severity when several rules match one request', () => {
    const verdict = evaluate({ path: '/admin/../../etc/passwd', responseStatus: 404 });
    const ruleIds = verdict.detections.map((d) => d.ruleId);
    expect(ruleIds).toEqual(expect.arrayContaining(['suspicious-path', 'malformed-request']));
    expect(verdict.severity).toBe('high');
    expect(verdict.detectionReasons.at(-1)).toContain('escalated from medium to high');
  });

  it('skips disabled rules', () => {
    ruleConfigs = defaultConfigs({ 'suspicious-path': { enabled: false } });
    expect(evaluate({ path: '/.env' }).actionTaken).toBe('allowed');
  });

  it('uses admin-configured severity and action', () => {
    ruleConfigs = defaultConfigs({ 'suspicious-path': { severity: 'critical', action: 'block' } });
    const verdict = evaluate({ path: '/.env' });
    expect(verdict).toMatchObject({ severity: 'critical', classification: 'high-risk', actionTaken: 'blocked' });
  });

  it('returns a reason for every detection', () => {
    const verdict = evaluate({ method: 'TRACE', path: '/.git/config' });
    expect(verdict.detections.length).toBeGreaterThan(0);
    for (const detection of verdict.detections) {
      expect(detection.reason.length).toBeGreaterThan(10);
      expect(detection).toHaveProperty('ruleId');
      expect(detection).toHaveProperty('recommendedAction');
    }
  });
});
