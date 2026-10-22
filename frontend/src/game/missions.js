import { Bug, Cpu, Eye, FileWarning, Gauge, KeyRound, Radar, Search, Shield, SlidersHorizontal } from 'lucide-react';

/**
 * Learning missions. Each one completes from real backend data (stored events, detection
 * matches, rule edits, device heartbeats) or from something you did in this browser.
 * Missions completed with the simulator count as practice; only "Go live with hardware"
 * needs a real ESP8266 heartbeat.
 */
export const MISSIONS = [
  {
    id: 'first-signal',
    title: 'First signal',
    goal: 'Record your first event.',
    how: 'Launch "Normal request" in the Practice lab, or open a page on your ESP8266.',
    xp: 50,
    icon: Radar,
    check: (f) => f.totalEvents > 0,
  },
  {
    id: 'scanner',
    title: 'Spot the scanner',
    goal: 'Catch a request for a sensitive-looking page like /.env.',
    how: 'Launch "Suspicious-looking path".',
    xp: 75,
    icon: Search,
    check: (f) => f.ruleMatches('suspicious-path') > 0,
  },
  {
    id: 'password-guesser',
    title: 'Stop a password guesser',
    goal: 'Detect repeated failed logins and block the source.',
    how: 'Launch "Simulated failed test-login attempts".',
    xp: 100,
    icon: KeyRound,
    check: (f) => f.ruleMatches('failed-login') > 0,
  },
  {
    id: 'traffic-cop',
    title: 'Traffic cop',
    goal: 'Rate-limit a source that sends too many requests.',
    how: 'Launch "Rate-limit threshold demonstration".',
    xp: 100,
    icon: Gauge,
    check: (f) => f.ruleMatches('request-rate') > 0,
  },
  {
    id: 'broken-request',
    title: 'Broken request detective',
    goal: 'Flag a malformed request (path traversal, odd method, oversized path).',
    how: 'Launch "Malformed test request".',
    xp: 75,
    icon: Bug,
    check: (f) => f.ruleMatches('malformed-request') > 0,
  },
  {
    id: 'page-guesser',
    title: 'Catch a page guesser',
    goal: 'Detect someone guessing many pages that do not exist.',
    how: 'Launch "Repeated requests".',
    xp: 75,
    icon: FileWarning,
    check: (f) => f.ruleMatches('not-found-repeat') > 0,
  },
  {
    id: 'api-shield',
    title: 'Shield the API',
    goal: 'Trigger the backend API rate limiter (HTTP 429).',
    how: 'Admin panel → Lab tools → "Send 10 rapid requests".',
    xp: 75,
    icon: Shield,
    check: (f) => f.hasCategory('api-rate-limit'),
  },
  {
    id: 'investigator',
    title: 'Investigate an alert',
    goal: 'Open the full details of a flagged event.',
    how: 'On Events, open any event with a warning badge.',
    xp: 50,
    icon: Eye,
    check: (f) => f.actions.has('investigate'),
  },
  {
    id: 'tuner',
    title: 'Tune a rule',
    goal: 'Change a detection rule threshold or setting.',
    how: 'Admin panel → Rules → "Tune", change a value and save.',
    xp: 75,
    icon: SlidersHorizontal,
    check: (f) => f.rulesTuned,
  },
  {
    id: 'hardware',
    title: 'Go live with hardware',
    goal: 'Receive a heartbeat from a real ESP8266.',
    how: 'Flash the firmware and connect it (see Devices). Simulated traffic does not count.',
    xp: 150,
    icon: Cpu,
    check: (f) => f.deviceHeartbeats > 0,
  },
];

export const TOTAL_XP = MISSIONS.reduce((sum, m) => sum + m.xp, 0);

export const RANKS = [
  { name: 'Rookie', min: 0 },
  { name: 'Watcher', min: 100 },
  { name: 'Analyst', min: 250 },
  { name: 'Hunter', min: 450 },
  { name: 'Guardian', min: 700 },
];

export function rankFor(xp) {
  let index = 0;
  RANKS.forEach((rank, i) => {
    if (xp >= rank.min) index = i;
  });
  const current = RANKS[index];
  const next = RANKS[index + 1] ?? null;
  const progress = next ? (xp - current.min) / (next.min - current.min) : 1;
  return { ...current, level: index + 1, next, progress: Math.max(0, Math.min(1, progress)) };
}

/** Facts derived from API responses; missions only read these. */
export function buildFacts({ detection, overview, devices, rules }, actions) {
  const matches = new Map((detection?.rules ?? []).map((r) => [r.ruleId, r.matches]));
  const categories = new Set((overview?.byCategory ?? []).map((c) => c.category));
  return {
    totalEvents: overview?.totals?.total ?? 0,
    ruleMatches: (id) => matches.get(id) ?? 0,
    hasCategory: (category) => categories.has(category),
    rulesTuned: (rules ?? []).some((r) => r.updatedAt),
    deviceHeartbeats: (devices ?? []).reduce((sum, d) => sum + (d.heartbeatCount ?? 0), 0),
    actions,
  };
}
