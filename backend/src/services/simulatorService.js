import { randomInt } from 'node:crypto';
import { z } from 'zod';
import { DEFAULT_SUSPICIOUS_PATTERNS } from '../detection/rules/suspiciousPath.js';
import { resetDetectionState } from '../detection/state.js';
import { Event } from '../models/Event.js';
import { broadcast, SOCKET_EVENTS } from '../sockets/realtime.js';
import { ingestEventSchema } from '../validation/schemas.js';
import { ingestEvent } from './eventService.js';
import { getRuleConfigs } from './ruleService.js';
import { getSettings } from './settingsService.js';

export const SIMULATED_DEVICE_ID = 'simulated-esp8266';
const MAX_EVENTS_PER_RUN = 200;

// RFC 5737 documentation ranges: never routable, so simulated sources can't be mistaken for real hosts.
const TEST_NET_PREFIXES = ['192.0.2', '198.51.100', '203.0.113'];
const TEST_NET_IP = /^(192\.0\.2|198\.51\.100|203\.0\.113)\.(25[0-4]|2[0-4]\d|1\d\d|[1-9]\d?)$/;

const USER_AGENTS = {
  browser: 'Mozilla/5.0 (Simulated Browser; IoT Honeypot Lab)',
  script: 'python-requests/2.32 (simulated)',
  scanner: 'SimulatedScanner/1.0 (lab test traffic)',
};

function randomTestNetIp() {
  return `${TEST_NET_PREFIXES[randomInt(TEST_NET_PREFIXES.length)]}.${randomInt(1, 255)}`;
}

function pick(list) {
  return list[randomInt(list.length)];
}

function ruleParam(ruleId, key, fallback) {
  return getRuleConfigs().get(ruleId)?.params?.[key] ?? fallback;
}

/**
 * Each scenario builds raw reports exactly like an ESP8266 would send them. They are then
 * validated with the same schema and processed by the same pipeline as real device reports.
 */
export const SCENARIOS = {
  normal: {
    label: 'Normal request',
    description: 'One ordinary page or sensor request that should not trigger any rule.',
    relatedRules: [],
    build: () => [
      {
        method: 'GET',
        path: pick(['/', '/status', '/api/sensor', '/index.html']),
        responseStatus: 200,
        userAgent: USER_AGENTS.browser,
        headers: { accept: 'text/html', 'user-agent': USER_AGENTS.browser },
      },
    ],
  },
  'repeated-requests': {
    label: 'Repeated requests',
    description: 'A burst of requests to nonexistent routes (HTTP 404), exceeding the repeated-404 threshold.',
    relatedRules: ['not-found-repeat'],
    build: () =>
      Array.from({ length: ruleParam('not-found-repeat', 'threshold', 10) + 2 }, (_, i) => ({
        method: 'GET',
        path: `/${pick(['page', 'old', 'test', 'files', 'docs'])}-${i + 1}.html`,
        responseStatus: 404,
        userAgent: USER_AGENTS.script,
      })),
  },
  'failed-login': {
    label: 'Simulated failed test-login attempts',
    description:
      'Repeated failed POSTs to the designated test login endpoint. Includes a fake Authorization header ' +
      'and password query parameter so you can verify that they are redacted before storage.',
    relatedRules: ['failed-login'],
    build: () => {
      const loginPath = getSettings().testLoginPaths[0] ?? '/login';
      return Array.from({ length: ruleParam('failed-login', 'threshold', 5) + 1 }, () => ({
        method: 'POST',
        path: loginPath,
        query: 'user=admin&password=simulated-not-a-real-password',
        responseStatus: 401,
        loginResult: 'failed',
        userAgent: USER_AGENTS.script,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: 'Basic c2ltdWxhdGVkOnNpbXVsYXRlZA==',
          cookie: 'session=simulated-session-id',
        },
        bodyBytes: 48,
      }));
    },
  },
  'suspicious-path': {
    label: 'Suspicious-looking path',
    description: 'A single request for a path commonly probed by scanners (for example /.env or /wp-login.php).',
    relatedRules: ['suspicious-path'],
    build: () => [
      {
        method: 'GET',
        path: pick(DEFAULT_SUSPICIOUS_PATTERNS.filter((p) => !['/console', '/backup', '/shell'].includes(p))),
        responseStatus: 404,
        userAgent: USER_AGENTS.scanner,
      },
    ],
  },
  malformed: {
    label: 'Malformed test request',
    description: 'A structurally unusual request: traversal sequence, null byte, odd method or oversized path.',
    relatedRules: ['malformed-request'],
    build: () => [
      {
        ...pick([
          { method: 'GET', path: '/static/..%2f..%2fetc%2fconfig' },
          { method: 'GET', path: '/index.html%00.jpg' },
          { method: 'PROPFIND', path: '/' },
          { method: 'GET', path: `/${'A'.repeat(300)}` },
          { method: 'GET', path: '/files/%E0%A4%A' },
        ]),
        responseStatus: 400,
        userAgent: USER_AGENTS.scanner,
      },
    ],
  },
  'rate-limit-threshold': {
    label: 'Rate-limit threshold demonstration',
    description:
      'Sends more requests from one source than the request-rate rule allows. Requests past the ' +
      'threshold are recorded as rate-limited and the source gets a temporary rate-limit decision.',
    relatedRules: ['request-rate'],
    build: () =>
      Array.from({ length: ruleParam('request-rate', 'threshold', 20) + 5 }, () => ({
        method: 'GET',
        path: '/api/sensor',
        responseStatus: 200,
        userAgent: USER_AGENTS.script,
      })),
  },
};

export const simulatorRunSchema = z.object({
  scenario: z.enum(Object.keys(SCENARIOS)),
  sourceIp: z.string().regex(TEST_NET_IP, 'must be an RFC 5737 TEST-NET address').optional(),
});

export function listScenarios() {
  const configs = getRuleConfigs();
  return Object.entries(SCENARIOS).map(([id, scenario]) => ({
    id,
    label: scenario.label,
    description: scenario.description,
    relatedRules: scenario.relatedRules.map((ruleId) => ({ ruleId, enabled: configs.get(ruleId)?.enabled ?? false })),
  }));
}

export async function runScenario({ scenario: scenarioId, sourceIp }) {
  const scenario = SCENARIOS[scenarioId];
  const clientIp = sourceIp ?? randomTestNetIp();
  const reports = scenario.build().slice(0, MAX_EVENTS_PER_RUN);

  const events = [];
  for (const report of reports) {
    const input = ingestEventSchema.parse({ deviceId: SIMULATED_DEVICE_ID, clientIp, ...report });
    const { event } = await ingestEvent(input, { sourceType: 'simulator', simulated: true, scenario: scenarioId });
    events.push(event);
  }

  const tally = (field) =>
    events.reduce((acc, event) => ({ ...acc, [event[field]]: (acc[event[field]] ?? 0) + 1 }), {});
  const configs = getRuleConfigs();
  const disabledRules = scenario.relatedRules.filter((ruleId) => !configs.get(ruleId)?.enabled);

  return {
    scenario: scenarioId,
    label: scenario.label,
    sourceIp: clientIp,
    generated: events.length,
    bySeverity: tally('severity'),
    byAction: tally('actionTaken'),
    flagged: events.filter((event) => event.classification !== 'normal').length,
    disabledRules,
    events: events.map((event) => ({
      id: event.id,
      method: event.method,
      path: event.path,
      severity: event.severity,
      category: event.category,
      actionTaken: event.actionTaken,
    })),
  };
}

/** Deletes only events explicitly marked simulated and clears simulator detection state. */
export async function resetSimulatorData() {
  const { deletedCount } = await Event.deleteMany({ simulated: true });
  resetDetectionState('simulator');
  broadcast(SOCKET_EVENTS.SIMULATOR_RESET, { deletedCount });
  return { deletedCount };
}
