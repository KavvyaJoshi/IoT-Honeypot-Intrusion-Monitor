import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SystemContext } from '../context/SystemContext.jsx';

export const defaultSystem = {
  health: { status: 'ok', version: '1.0.0', environment: 'test', uptimeSeconds: 10, simulatorEnabled: true, realtime: { connectedClients: 1 } },
  apiReachable: true,
  apiLatencyMs: 5,
  database: { state: 'connected', connected: true },
  databaseConnected: true,
  socket: { connected: true, transport: 'websocket' },
  simulatorEnabled: true,
  refreshHealth: () => {},
  isAdmin: false,
  unlockAdmin: async () => {},
  lockAdmin: () => {},
};

/** Renders UI with a router and a stubbed system context (no network, no sockets). */
export function renderWithProviders(ui, { route = '/', system = {} } = {}) {
  return render(
    <SystemContext.Provider value={{ ...defaultSystem, ...system }}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </SystemContext.Provider>,
  );
}

export function makeEvent(overrides = {}) {
  return {
    id: 'e1',
    timestamp: '2026-10-22T10:00:00.000Z',
    sourceType: 'device',
    simulated: false,
    deviceId: 'esp-lab-01',
    sourceIdentifier: '192.168.1.50',
    clientIp: '192.168.1.50',
    method: 'GET',
    path: '/',
    query: null,
    responseStatus: 200,
    userAgent: 'test',
    loginResult: null,
    category: 'normal',
    severity: 'info',
    severityRank: 0,
    classification: 'normal',
    detections: [],
    detectionReasons: [],
    actionTaken: 'allowed',
    metadata: { headers: {} },
    ...overrides,
  };
}

export function emptyStats() {
  return {
    range: '1h',
    bucketMs: 120000,
    totals: { total: 0, suspicious: 0, highSeverity: 0, critical: 0, rateLimited: 0, blocked: 0, simulated: 0, device: 0, activeEnforcements: 0 },
    bySeverity: ['info', 'low', 'medium', 'high', 'critical'].map((severity) => ({ severity, count: 0 })),
    byCategory: [],
    byAction: [],
    bySourceType: [],
    topPaths: [],
    topRules: [],
    timeline: [],
  };
}
