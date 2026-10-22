import { BookOpen, Check, Copy, Cpu, ListFilter, Plug, Signal, SignalHigh, SignalLow, SignalMedium, SignalZero } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/endpoints.js';
import { SOCKET_EVENTS } from '../api/socket.js';
import { StatusIndicator } from '../components/ui/Badge.jsx';
import { Card, CardBody, CardHeader, KeyValueList, PageHeader } from '../components/ui/Card.jsx';
import { AsyncContent, EmptyState } from '../components/ui/States.jsx';
import { useApi } from '../hooks/useApi.js';
import { useNow, useThrottledSocketRefresh } from '../hooks/useSocket.js';
import { formatBytes, formatDateTime, formatDuration, formatNumber, formatRelative } from '../lib/format.js';

function rssiQuality(rssi) {
  if (rssi === null || rssi === undefined) return { label: 'Not reported', icon: SignalZero, tone: 'text-ink-3' };
  if (rssi >= -60) return { label: 'Strong', icon: SignalHigh, tone: 'text-emerald-300' };
  if (rssi >= -70) return { label: 'Good', icon: SignalMedium, tone: 'text-sky-300' };
  if (rssi >= -80) return { label: 'Fair', icon: SignalLow, tone: 'text-amber-300' };
  return { label: 'Weak', icon: Signal, tone: 'text-red-300' };
}

function CopyValue({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <code className="break-all rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink">{value}</code>
      <button
        type="button"
        className="shrink-0 rounded p-1 text-ink-3 hover:text-ink"
        aria-label={`Copy ${value}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      </button>
    </span>
  );
}

/** Whether the device's last reported IP is on one of the laptop's subnets. */
function SubnetNote({ network }) {
  if (!network || network.sameSubnet === null) return null;
  if (network.sameSubnet) {
    return (
      <span className="text-xs text-ink-2">
        Same subnet as the laptop's <span className="text-ink">{network.laptopInterface.name}</span> (
        <span className="font-mono">{network.laptopInterface.cidr}</span>)
      </span>
    );
  }
  return (
    <span className="text-xs text-amber-200">
      Not on any of the laptop's current subnets. The laptop may have switched networks or IP. Check the backend URL on the
      device (serial command <code>status</code>).
    </span>
  );
}

function DeviceCard({ device, now }) {
  const signal = rssiQuality(device.lastRssi);
  const SignalIcon = signal.icon;
  return (
    <Card as="article">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-mono text-sm font-semibold text-ink">
            <Cpu className="size-4 text-cyan-300" aria-hidden="true" />
            {device.deviceId}
          </h3>
          <p className="mt-0.5 text-xs text-ink-3">
            {device.name ?? 'Unnamed device'} · {device.hardware ?? 'ESP8266'}
          </p>
        </div>
        <StatusIndicator status={device.status} />
      </div>
      <CardBody>
        <KeyValueList
          items={[
            {
              label: 'Last heartbeat',
              value: device.lastHeartbeatAt ? (
                <span title={formatDateTime(device.lastHeartbeatAt)}>
                  {formatRelative(device.lastHeartbeatAt, now)}{' '}
                  <span className="text-ink-3">· timeout {device.heartbeatTimeoutSeconds}s</span>
                </span>
              ) : (
                <span className="text-ink-3">Never received</span>
              ),
            },
            {
              label: 'Last seen',
              value: <span title={formatDateTime(device.lastSeenAt)}>{formatRelative(device.lastSeenAt, now)}</span>,
            },
            {
              label: 'Signal (RSSI)',
              value: (
                <span className={`inline-flex items-center gap-1.5 ${signal.tone}`}>
                  <SignalIcon className="size-4" aria-hidden="true" />
                  {device.lastRssi !== null && device.lastRssi !== undefined ? `${device.lastRssi} dBm · ${signal.label}` : signal.label}
                  {device.lastRssi !== null && device.lastRssi !== undefined && <span className="text-xs text-ink-3">(reported by device)</span>}
                </span>
              ),
            },
            { label: 'Firmware', value: device.firmwareVersion },
            { label: 'Device IP', value: device.ipAddress && <span className="font-mono text-xs">{device.ipAddress}</span> },
            { label: 'Network', value: <SubnetNote network={device.network} />, hidden: !device.ipAddress },
            { label: 'Uptime', value: device.lastUptimeMs !== null ? formatDuration(device.lastUptimeMs) : null },
            { label: 'Free heap', value: device.lastFreeHeap !== null ? formatBytes(device.lastFreeHeap) : null },
            { label: 'Heartbeats', value: formatNumber(device.heartbeatCount) },
            { label: 'Registered', value: formatDateTime(device.registeredAt) },
          ]}
        />
        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-sm">
          <span className="text-ink-2">
            <span className="font-semibold text-ink">{formatNumber(device.eventCount)}</span> reported events
          </span>
          <Link
            to={`/events?sourceType=device&deviceId=${encodeURIComponent(device.deviceId)}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-ink hover:text-accent"
          >
            <ListFilter className="size-3.5" aria-hidden="true" /> View events
          </Link>
        </div>
      </CardBody>
    </Card>
  );
}

function SetupPanel() {
  const setup = useApi(() => api.deviceSetup(), []);
  return (
    <Card>
      <CardHeader title="Connect an ESP8266" subtitle="Integration contract for the firmware" icon={Plug} />
      <AsyncContent state={setup} compact>
        {(info) => (
          <CardBody className="space-y-4 text-sm text-ink-2">
            <div>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">Backend base URL (this laptop on your Wi-Fi)</p>
              {!info.listening?.lanAccessible && (
                <p className="mb-2 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-100">
                  Backend is in laptop-only mode (HOST={info.listening?.host}). The ESP8266 cannot connect; the simulator still works.
                  Set HOST=0.0.0.0 in backend/.env for device testing.
                </p>
              )}
              {info.interfaces?.length ? (
                <ul className="space-y-1.5">
                  {info.interfaces.map((iface) => (
                    <li key={iface.address} className={iface.likelyVirtual ? 'opacity-60' : ''}>
                      <CopyValue value={iface.url} />
                      <span className="block text-[11px] text-ink-3">
                        {iface.name}
                        {iface.cidr && ` · subnet ${iface.cidr}`}
                        {iface.likelyVirtual && ' · likely a virtual adapter, not for the ESP8266'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-amber-200">No LAN IPv4 address detected. Connect the laptop to the hotspot or Wi-Fi.</p>
              )}
              <p className="mt-1.5 text-xs text-ink-3">
                Pick the address whose subnet matches the ESP8266's network. It changes when you switch between hotspot and
                college Wi-Fi; this list updates automatically. Change the device's URL with the serial command{' '}
                <code className="text-ink-2">url http://&lt;ip&gt;:4000</code>; no reflash is needed. <code>localhost</code> never works
                from the device.
              </p>
            </div>
            <ul className="space-y-1.5">
              {Object.entries(info.endpoints).map(([name, endpoint]) => (
                <li key={name} className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs capitalize text-ink-3">{name}</span>
                  <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs text-ink">
                    {endpoint.method} {endpoint.path}
                  </code>
                </li>
              ))}
            </ul>
            <KeyValueList
              items={[
                {
                  label: 'Auth header',
                  value: (
                    <span>
                      <code className="font-mono text-xs">{info.authHeader}</code>{' '}
                      {info.deviceApiKeyConfigured ? (
                        <span className="text-emerald-300">key configured on server</span>
                      ) : (
                        <span className="text-red-300">DEVICE_API_KEY not set: device endpoints disabled</span>
                      )}
                    </span>
                  ),
                },
                { label: 'Heartbeat', value: `every ${info.recommendedHeartbeatIntervalSeconds}s (offline after ${info.heartbeatTimeoutSeconds}s)` },
                { label: 'Max body', value: formatBytes(info.maxRequestBodyBytes) },
              ]}
            />
            <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-2">
              <li>Copy the DEVICE_API_KEY from backend/.env into the firmware's secrets.h (never into the dashboard).</li>
              <li>Set the base URL above as the firmware's backend URL and flash the board.</li>
              <li>On boot the firmware registers, then sends heartbeats and forwards request observations.</li>
              <li>The device turns Online here after its first heartbeat.</li>
            </ol>
            <p className="flex items-start gap-2 rounded-md border border-line bg-canvas/60 px-3 py-2 text-xs text-ink-3">
              <BookOpen className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Full guide: firmware/README.md. Cannot connect? Follow docs/NETWORKING.md (firewall, subnets, client isolation,
              changed IPs) and run <code>npm run network-check</code> in backend/. Being on the same Wi-Fi does not guarantee
              that the devices can reach each other.
            </p>
          </CardBody>
        )}
      </AsyncContent>
    </Card>
  );
}

export default function DevicesPage() {
  const now = useNow(5000);
  const devices = useApi(() => api.devices(), [], { refreshInterval: 30000 });
  useThrottledSocketRefresh([SOCKET_EVENTS.DEVICE_UPDATE, SOCKET_EVENTS.SETTINGS_UPDATED], devices.refetch, 800);

  return (
    <>
      <PageHeader
        title="Devices"
        description="Registered ESP8266 honeypot devices. A device is Online only while its heartbeats arrive within the configured timeout."
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div>
          <AsyncContent
            state={devices}
            isEmpty={(data) => data.data.length === 0}
            empty={
              <Card>
                <EmptyState
                  icon={Cpu}
                  title="No ESP8266 registered yet"
                  description="Flash the firmware with the backend URL and device key shown on the right. The device registers itself on boot. Until then you can use the Controlled testing page."
                />
              </Card>
            }
          >
            {(data) => (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {data.data.map((device) => (
                  <DeviceCard key={device.deviceId} device={device} now={now} />
                ))}
              </div>
            )}
          </AsyncContent>
        </div>
        <SetupPanel />
      </div>
    </>
  );
}
