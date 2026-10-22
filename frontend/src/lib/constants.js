import {
  Ban,
  CircleAlert,
  CircleCheck,
  Cpu,
  FileText,
  FlaskConical,
  Gauge,
  Info,
  OctagonAlert,
  Server,
  ShieldAlert,
  TriangleAlert,
} from 'lucide-react';

export const SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];

/** Severity is a status scale: every use pairs the colour with an icon and a text label. */
export const SEVERITY_META = {
  info: { label: 'Info', icon: Info, badge: 'bg-slate-500/15 text-slate-300 ring-slate-400/25', bar: '#64748b' },
  low: { label: 'Low', icon: CircleAlert, badge: 'bg-sky-500/15 text-sky-300 ring-sky-400/30', bar: '#3987e5' },
  medium: { label: 'Medium', icon: TriangleAlert, badge: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', bar: '#c98500' },
  high: { label: 'High', icon: ShieldAlert, badge: 'bg-red-500/15 text-red-300 ring-red-400/35', bar: '#e66767' },
  critical: {
    label: 'Critical',
    icon: OctagonAlert,
    badge: 'bg-rose-600/30 text-rose-100 ring-rose-400/60 font-semibold',
    bar: '#d03b3b',
  },
};

export const CLASSIFICATION_META = {
  normal: { label: 'Normal', badge: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/25', rail: 'border-l-transparent' },
  suspicious: { label: 'Suspicious', badge: 'bg-amber-500/15 text-amber-300 ring-amber-400/30', rail: 'border-l-amber-400/70' },
  'high-risk': { label: 'High risk', badge: 'bg-red-500/15 text-red-300 ring-red-400/35', rail: 'border-l-red-500' },
};

export const ACTION_META = {
  allowed: { label: 'Allowed', icon: CircleCheck, badge: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/25' },
  logged: { label: 'Logged', icon: FileText, badge: 'bg-sky-500/15 text-sky-300 ring-sky-400/30' },
  'rate-limited': { label: 'Rate-limited', icon: Gauge, badge: 'bg-orange-500/15 text-orange-300 ring-orange-400/35' },
  blocked: { label: 'Blocked', icon: Ban, badge: 'bg-red-600/25 text-red-200 ring-red-400/50 font-semibold' },
};

export const ACTION_DESCRIPTIONS = {
  allowed: 'No rule matched. The request was recorded as normal traffic.',
  logged: 'One or more rules matched. The event was recorded and raised as an alert; no throttling was requested.',
  'rate-limited':
    'The source has an active rate-limit decision. The ingest API told the reporting device to throttle this source (application layer only).',
  blocked:
    'The source has an active block decision. The ingest API told the reporting device to refuse this source (application layer only; no network firewall is involved).',
};

export const SOURCE_META = {
  device: { label: 'ESP8266', icon: Cpu, badge: 'bg-cyan-500/12 text-cyan-300 ring-cyan-400/30' },
  simulator: { label: 'Simulated', icon: FlaskConical, badge: 'bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-400/35' },
  backend: { label: 'Backend', icon: Server, badge: 'bg-slate-500/15 text-slate-300 ring-slate-400/25' },
};

export const CATEGORY_LABELS = {
  normal: 'Normal',
  'excessive-requests': 'Excessive requests',
  'repeated-failed-login': 'Repeated failed login',
  'suspicious-path': 'Suspicious path',
  'malformed-request': 'Malformed request',
  'route-enumeration': 'Route enumeration',
  'traffic-anomaly': 'Traffic anomaly',
  'active-enforcement': 'Active enforcement',
  'api-rate-limit': 'API rate limit (429)',
};

export const RANGE_OPTIONS = [
  { value: '15m', label: '15 min' },
  { value: '1h', label: '1 hour' },
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: 'all', label: 'All' },
];

export const SOURCE_FILTER_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'device', label: 'ESP8266 only' },
  { value: 'simulator', label: 'Simulator only' },
  { value: 'backend', label: 'Backend only' },
];

/**
 * Chart series colours (validated with the dataviz palette checker on #161921: lightness band,
 * chroma, colour-vision separation and >= 3:1 contrast). Amber, orange and red never appear
 * as neighbouring series because they cannot be told apart reliably.
 */
export const CHART_COLORS = {
  total: '#3987e5',
  flagged: '#c98500',
  rateLimited: '#d95926',
  logged: '#3987e5',
  blocked: '#e66767',
  apiRateLimited: '#9085e9',
  simulator: '#d55181',
  single: '#3987e5',
  grid: '#232733',
  axis: '#323847',
  tick: '#838ba0',
};

/** Fixed categorical order for device series; magenta is reserved for the simulator series. */
export const DEVICE_SERIES_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#9085e9', '#008300'];
