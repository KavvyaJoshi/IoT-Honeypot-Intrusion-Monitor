import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyStats, makeEvent, renderWithProviders } from '../test/utils.jsx';

vi.mock('../api/endpoints.js', () => ({
  tzOffset: () => 0,
  api: {
    eventStats: vi.fn(),
    events: vi.fn(),
    devices: vi.fn(),
    deviceSetup: vi.fn(),
    scenarios: vi.fn(),
  },
}));

const { api } = await import('../api/endpoints.js');
const { default: DashboardPage } = await import('./DashboardPage.jsx');
const { default: EventsPage } = await import('./EventsPage.jsx');
const { default: DevicesPage } = await import('./DevicesPage.jsx');
const { default: SimulatorPage } = await import('./SimulatorPage.jsx');
const { TopBar } = await import('../components/layout/TopBar.jsx');

const networkError = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

beforeEach(() => {
  vi.resetAllMocks();
});

describe('DashboardPage', () => {
  it('shows backend metrics', async () => {
    api.eventStats.mockResolvedValue({
      ...emptyStats(),
      totals: { ...emptyStats().totals, total: 42, suspicious: 7, highSeverity: 3, critical: 1, activeEnforcements: 2 },
    });
    api.events.mockResolvedValue({ data: [makeEvent()], pagination: { page: 1, limit: 8, total: 1, totalPages: 1 } });
    api.devices.mockResolvedValue({ data: [{ deviceId: 'esp-lab-01', status: 'online', lastHeartbeatAt: new Date().toISOString() }] });

    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(api.eventStats).toHaveBeenCalledWith({ range: '1h', sourceType: undefined });
  });

  it('shows empty states when no events exist', async () => {
    api.eventStats.mockResolvedValue(emptyStats());
    api.events.mockResolvedValue({ data: [], pagination: { page: 1, limit: 8, total: 0, totalPages: 1 } });
    api.devices.mockResolvedValue({ data: [] });

    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('No requests in this range')).toBeInTheDocument();
    expect(screen.getByText('No events recorded')).toBeInTheDocument();
    expect(screen.getByText('No device registered yet')).toBeInTheDocument();
  });

  it('shows an actionable error when the API is down', async () => {
    api.eventStats.mockRejectedValue(networkError);
    api.events.mockRejectedValue(networkError);
    api.devices.mockRejectedValue(networkError);

    renderWithProviders(<DashboardPage />);
    const alerts = await screen.findAllByRole('alert');
    expect(alerts[0]).toHaveTextContent('Cannot reach the backend API');
  });
});

describe('EventsPage', () => {
  it('renders events and passes URL filters to the API', async () => {
    api.events.mockResolvedValue({
      data: [makeEvent({ id: 'x', path: '/.env', severity: 'medium', classification: 'suspicious', actionTaken: 'logged' })],
      pagination: { page: 1, limit: 25, total: 1, totalPages: 1 },
    });
    renderWithProviders(<EventsPage />, { route: '/events?severity=high,critical&sourceType=device' });
    expect(await screen.findByText('/.env')).toBeInTheDocument();
    expect(api.events).toHaveBeenCalledWith(expect.objectContaining({ severity: 'high,critical', sourceType: 'device', page: 1 }));
  });

  it('shows a filter-aware empty state', async () => {
    api.events.mockResolvedValue({ data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 1 } });
    renderWithProviders(<EventsPage />, { route: '/events?severity=critical' });
    expect(await screen.findByText('No events match these filters')).toBeInTheDocument();
  });
});

describe('DevicesPage', () => {
  it('explains how to connect a device when none is registered', async () => {
    api.devices.mockResolvedValue({ data: [] });
    api.deviceSetup.mockResolvedValue({
      baseUrls: ['http://192.168.1.20:4000'],
      interfaces: [
        { name: 'Wi-Fi', address: '192.168.1.20', cidr: '192.168.1.20/24', likelyVirtual: false, url: 'http://192.168.1.20:4000' },
        { name: 'vEthernet (WSL)', address: '172.28.0.1', cidr: '172.28.0.1/20', likelyVirtual: true, url: 'http://172.28.0.1:4000' },
      ],
      listening: { host: '0.0.0.0', port: 4000, lanAccessible: true },
      endpoints: { ingest: { method: 'POST', path: '/api/events/ingest' } },
      authHeader: 'X-Device-Key',
      deviceApiKeyConfigured: true,
      recommendedHeartbeatIntervalSeconds: 30,
      heartbeatTimeoutSeconds: 90,
      maxRequestBodyBytes: 8192,
    });
    renderWithProviders(<DevicesPage />);
    expect(await screen.findByText('No ESP8266 registered yet')).toBeInTheDocument();
    expect(await screen.findByText('http://192.168.1.20:4000')).toBeInTheDocument();
    expect(screen.getByText(/subnet 192\.168\.1\.20\/24/)).toBeInTheDocument();
    expect(screen.getByText(/likely a virtual adapter/)).toBeInTheDocument();
  });

  it('warns when the backend is in laptop-only mode', async () => {
    api.devices.mockResolvedValue({ data: [] });
    api.deviceSetup.mockResolvedValue({
      baseUrls: [],
      interfaces: [],
      listening: { host: '127.0.0.1', port: 4000, lanAccessible: false },
      endpoints: {},
      authHeader: 'X-Device-Key',
      maxRequestBodyBytes: 8192,
    });
    renderWithProviders(<DevicesPage />);
    expect(await screen.findByText(/laptop-only mode/)).toBeInTheDocument();
  });

  it('flags a device that is not on any laptop subnet', async () => {
    api.devices.mockResolvedValue({
      data: [
        {
          deviceId: 'esp-lab-01',
          status: 'offline',
          ipAddress: '10.20.5.42',
          network: { sameSubnet: false, laptopInterface: null },
          heartbeatTimeoutSeconds: 90,
          eventCount: 0,
          heartbeatCount: 1,
        },
      ],
    });
    api.deviceSetup.mockResolvedValue({ baseUrls: [], interfaces: [], listening: { lanAccessible: true }, endpoints: {}, authHeader: 'X-Device-Key', maxRequestBodyBytes: 8192 });
    renderWithProviders(<DevicesPage />);
    expect(await screen.findByText(/Not on any of the laptop's current subnets/)).toBeInTheDocument();
  });

  it('shows status, RSSI as device-reported and event counts', async () => {
    api.devices.mockResolvedValue({
      data: [
        {
          deviceId: 'esp-lab-01',
          status: 'offline',
          lastHeartbeatAt: '2026-10-22T10:00:00Z',
          lastSeenAt: '2026-10-22T10:00:00Z',
          heartbeatTimeoutSeconds: 90,
          lastRssi: -72,
          firmwareVersion: '1.0.0',
          eventCount: 12,
          heartbeatCount: 3,
          registeredAt: '2026-10-22T09:00:00Z',
          lastUptimeMs: null,
          lastFreeHeap: null,
        },
      ],
    });
    api.deviceSetup.mockResolvedValue({ baseUrls: [], endpoints: {}, authHeader: 'X-Device-Key', maxRequestBodyBytes: 8192 });
    renderWithProviders(<DevicesPage />);
    expect(await screen.findByText('esp-lab-01')).toBeInTheDocument();
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText(/-72 dBm/)).toBeInTheDocument();
    expect(screen.getByText('(reported by device)')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });
});

describe('TopBar ESP8266 indicator', () => {
  it.each([
    [[], 'None'],
    [[{ deviceId: 'a', status: 'online' }, { deviceId: 'b', status: 'offline' }], '1/2 online'],
    [[{ deviceId: 'a', status: 'offline' }], 'Offline'],
  ])('shows heartbeat-based status', async (devices, label) => {
    api.devices.mockResolvedValue({ data: devices });
    renderWithProviders(<TopBar onOpenNav={() => {}} />);
    expect(await screen.findByText(label)).toBeInTheDocument();
  });
});

describe('SimulatorPage', () => {
  it('requires the admin token before running scenarios', async () => {
    api.scenarios.mockResolvedValue([{ id: 'normal', label: 'Normal request', description: 'One request', relatedRules: [] }]);
    renderWithProviders(<SimulatorPage />);
    expect(await screen.findByText('Normal request')).toBeInTheDocument();
    expect(screen.getByText(/Admin token required to run scenarios/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /run scenario/i })).toBeDisabled());
  });

  it('shows a disabled state when the server disables the simulator', () => {
    renderWithProviders(<SimulatorPage />, { system: { simulatorEnabled: false } });
    expect(screen.getByText('Simulator disabled on this server')).toBeInTheDocument();
  });
});
