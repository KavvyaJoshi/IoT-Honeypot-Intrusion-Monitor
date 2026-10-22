import { http } from './client.js';

const data = (response) => response.data.data;

/** Minutes east of UTC, so the backend aligns hour/day chart buckets to the viewer's clock. */
export const tzOffset = () => -new Date().getTimezoneOffset();

export const api = {
  health: () => http.get('/health').then(data),
  databaseHealth: () =>
    http.get('/health/database', { validateStatus: (s) => s === 200 || s === 503 }).then(data),
  verifyAdmin: (token) => http.get('/auth/verify', { admin: true, adminToken: token }).then(data),

  events: (params) => http.get('/events', { params }).then((r) => r.data),
  event: (id) => http.get(`/events/${encodeURIComponent(id)}`).then(data),
  eventStats: (params) => http.get('/events/stats', { params: { tzOffset: tzOffset(), ...params } }).then(data),

  devices: () => http.get('/devices').then((r) => r.data),
  device: (id) => http.get(`/devices/${encodeURIComponent(id)}`).then(data),
  deviceSetup: () => http.get('/devices/setup').then(data),
  deviceActivity: (params) =>
    http.get('/devices/activity', { params: { tzOffset: tzOffset(), ...params } }).then(data),

  rules: () => http.get('/rules').then(data),
  updateRule: (id, patch) => http.patch(`/rules/${encodeURIComponent(id)}`, patch, { admin: true }).then(data),
  detectionStats: (params) =>
    http.get('/detection/stats', { params: { tzOffset: tzOffset(), ...params } }).then(data),

  scenarios: () => http.get('/simulator/scenarios').then(data),
  runScenario: (body) => http.post('/simulator/events', body, { admin: true }).then(data),
  resetSimulator: () =>
    http.post('/simulator/reset', { confirm: 'DELETE_SIMULATOR_DATA' }, { admin: true }).then(data),
  rateLimitProbe: () =>
    http.post('/simulator/rate-limit-probe', null, { admin: true, validateStatus: () => true }),

  settings: () => http.get('/settings').then(data),
  updateSettings: (patch) => http.patch('/settings', patch, { admin: true }).then(data),
};
