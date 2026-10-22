export const SOURCE_TYPES = ['device', 'simulator', 'backend'];

export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
export const SEVERITY_RANK = Object.freeze({ info: 0, low: 1, medium: 2, high: 3, critical: 4 });

export const CLASSIFICATIONS = ['normal', 'suspicious', 'high-risk'];

/**
 * actionTaken describes the application-layer decision recorded for an event:
 * - allowed:      no rule matched; the request is considered normal.
 * - logged:       one or more rules matched; the event is recorded and surfaced as an alert.
 * - rate-limited: the source has an active rate-limit decision; the device is told to throttle it.
 * - blocked:      the source has an active block decision; the device is told to refuse it.
 * The backend cannot drop packets on the network. Enforcement happens only where a client
 * (e.g. the ESP8266 firmware) honours the recommendedAction returned by the ingest API.
 */
export const ACTIONS = ['allowed', 'logged', 'rate-limited', 'blocked'];

/** Rule-level actions, ordered from weakest to strongest. */
export const RULE_ACTIONS = ['log', 'rate-limit', 'block'];
export const RULE_ACTION_RANK = Object.freeze({ log: 0, 'rate-limit': 1, block: 2 });

export const CATEGORIES = [
  'normal',
  'excessive-requests',
  'repeated-failed-login',
  'suspicious-path',
  'malformed-request',
  'route-enumeration',
  'traffic-anomaly',
  'active-enforcement',
  'api-rate-limit',
];

export function classificationForSeverity(severity) {
  const rank = SEVERITY_RANK[severity] ?? 0;
  if (rank === 0) return 'normal';
  if (rank <= SEVERITY_RANK.medium) return 'suspicious';
  return 'high-risk';
}

export function maxSeverity(severities) {
  return severities.reduce(
    (max, severity) => (SEVERITY_RANK[severity] > SEVERITY_RANK[max] ? severity : max),
    'info',
  );
}

export function escalateSeverity(severity) {
  const index = Math.min(SEVERITIES.indexOf(severity) + 1, SEVERITIES.length - 1);
  return SEVERITIES[index];
}
